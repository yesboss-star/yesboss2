import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getAuthHeaders } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export interface JournalEntry {
  _id: string;
  user_id: string;
  org_id: string;
  content: string;
  type: "idea" | "journal" | "reflection";
  mood?: string;
  status: string;
  pipeline_status?: "backlog" | "in_review" | "approved" | "converted";
  ai_analysis: any;
  linked_goals: string[];
  linked_tasks: string[];
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

interface JournalState {
  entries: JournalEntry[];
  loading: boolean;
  error: string | null;
  fetchEntries: (orgId: string, type?: string) => Promise<void>;
  createEntry: (data: { content: string; type: string; mood?: string }, orgId: string) => Promise<JournalEntry>;
  updateEntry: (entryId: string, data: { content?: string; type?: string; mood?: string }) => Promise<void>;
  deleteEntry: (entryId: string) => Promise<void>;
}

export const useJournalStore = create<JournalState>()(
  persist(
    (set, get) => ({
      entries: [],
      loading: false,
      error: null,

      fetchEntries: async (orgId, type) => {
        set({ loading: true, error: null });
        try {
          const params = new URLSearchParams({ organization_id: orgId, limit: "200" });
          if (type) params.set("type", type);
          const res = await fetch(`${API_URL}/journal?${params}`, {
            headers: getAuthHeaders(),
          });
          if (!res.ok) throw new Error("Failed to fetch journal entries");
          const data = await res.json();
          set({ entries: data.entries || [], loading: false });
        } catch (e: any) {
          set({ error: e.message, loading: false });
        }
      },

      createEntry: async (data, orgId) => {
        set({ loading: true, error: null });
        try {
          const res = await fetch(`${API_URL}/journal?organization_id=${orgId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getAuthHeaders() },
            body: JSON.stringify(data),
          });
          if (!res.ok) throw new Error("Failed to create entry");
          const result = await res.json();
          const entry = result.entry;
          set((s) => ({ entries: [entry, ...s.entries], loading: false }));
          return entry;
        } catch (e: any) {
          set({ error: e.message, loading: false });
          throw e;
        }
      },

      updateEntry: async (entryId, data) => {
        try {
          const res = await fetch(`${API_URL}/journal/${entryId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", ...getAuthHeaders() },
            body: JSON.stringify(data),
          });
          if (!res.ok) throw new Error("Failed to update entry");
          set((s) => ({
            entries: s.entries.map((e) =>
              e._id === entryId ? { ...e, ...data, updated_at: new Date().toISOString() } as JournalEntry : e
            ),
          }));
        } catch (e: any) {
          set({ error: e.message });
        }
      },

      deleteEntry: async (entryId) => {
        try {
          const res = await fetch(`${API_URL}/journal/${entryId}`, {
            method: "DELETE",
            headers: getAuthHeaders(),
          });
          if (!res.ok) throw new Error("Failed to delete entry");
          set((s) => ({ entries: s.entries.filter((e) => e._id !== entryId) }));
        } catch (e: any) {
          set({ error: e.message });
        }
      },
    }),
    { name: "yesboss-journal" }
  )
);
