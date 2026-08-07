import { create } from "zustand";
import { getAuthHeaders } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

const memberFetchInFlight = new Map<string, Promise<any>>();

export interface OrgMember {
  id: string;
  email: string;
  full_name: string;
  role: string;
  department: string;
  manager_email?: string;
  title?: string;
  children?: OrgMember[];
}

interface OrgChartState {
  tree: OrgMember[];
  members: OrgMember[];
  loading: boolean;
  error: string | null;
  setTree: (tree: OrgMember[]) => void;
  setMembers: (members: OrgMember[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  fetchOrgTree: (orgId?: string) => Promise<void>;
  fetchOrgMembers: (orgId?: string) => Promise<void>;
  uploadFile: (file: File, orgId?: string) => Promise<{ inserted: number; errors: string[] }>;
  addMember: (data: { email: string; full_name: string; role: string; department: string; manager_email?: string; title?: string }, orgId?: string) => Promise<void>;
  updateMember: (memberId: string, data: Partial<OrgMember>, orgId?: string) => Promise<void>;
  deleteMember: (memberId: string, orgId?: string) => Promise<void>;
}

export const useOrgChartStore = create<OrgChartState>()(
  (set, get) => ({
    tree: [],
    members: [],
    loading: false,
    error: null,

    setTree: (tree) => set({ tree }),
    setMembers: (members) => set({ members }),
    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),

    fetchOrgTree: async (orgId?: string) => {
      set({ loading: true, error: null });
      try {
        const params = orgId ? `?organization_id=${orgId}` : "";
        const response = await fetch(`${API_URL}/org-chart/tree${params}`, { headers: getAuthHeaders() });
        if (!response.ok) throw new Error("Failed to fetch org tree");
        const result = await response.json();
        set({
          tree: result.tree || [],
          members: result.members || [],
          loading: false,
        });
      } catch (error: any) {
        set({ error: error.message, loading: false });
      }
    },

    fetchOrgMembers: async (orgId?: string) => {
      const params = orgId ? `?organization_id=${orgId}` : "";
      const key = `/org-chart/members${params}`;
      const inflight = memberFetchInFlight.get(key);
      if (inflight) { try { await inflight; } catch {} return; }
      set({ loading: true, error: null });
      const p = (async () => {
        try {
          const response = await fetch(`${API_URL}/org-chart/members${params}`, { headers: getAuthHeaders() });
          if (!response.ok) throw new Error("Failed to fetch members");
          const result = await response.json();
          set({ members: result.members || [], loading: false });
        } catch (error: any) {
          set({ error: error.message, loading: false });
        }
      })();
      memberFetchInFlight.set(key, p);
      try {
        await p;
      } finally {
        memberFetchInFlight.delete(key);
      }
    },

    uploadFile: async (file, orgId?: string) => {
      set({ loading: true, error: null });
      try {
        const formData = new FormData();
        formData.append("file", file);
        if (orgId) formData.append("organization_id", orgId);
        const { "Content-Type": _ct, ...authHeaders } = getAuthHeaders();
        const response = await fetch(`${API_URL}/org-chart/upload`, {
          method: "POST",
          headers: authHeaders,
          body: formData,
        });
        if (!response.ok) throw new Error("Failed to upload file");
        const result = await response.json();
        await get().fetchOrgTree(orgId);
        set({ loading: false });
        return result;
      } catch (error: any) {
        set({ error: error.message, loading: false });
        throw error;
      }
    },

    addMember: async (data, orgId?: string) => {
      set({ loading: true, error: null });
      try {
        const response = await fetch(`${API_URL}/org-chart/members${orgId ? `?organization_id=${orgId}` : ""}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify(data),
        });
        if (!response.ok) throw new Error("Failed to add member");
        await get().fetchOrgTree(orgId);
        set({ loading: false });
      } catch (error: any) {
        set({ error: error.message, loading: false });
        throw error;
      }
    },

    updateMember: async (memberId, data, orgId?: string) => {
      set({ loading: true, error: null });
      try {
        const response = await fetch(`${API_URL}/org-chart/members/${memberId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify(data),
        });
        if (!response.ok) throw new Error("Failed to update member");
        await get().fetchOrgTree(orgId);
        set({ loading: false });
      } catch (error: any) {
        set({ error: error.message, loading: false });
        throw error;
      }
    },

    deleteMember: async (memberId, orgId?: string) => {
      set({ loading: true, error: null });
      try {
        const response = await fetch(`${API_URL}/org-chart/members/${memberId}`, {
          method: "DELETE",
          headers: getAuthHeaders(),
        });
        if (!response.ok) throw new Error("Failed to delete member");
        await get().fetchOrgTree(orgId);
        set({ loading: false });
      } catch (error: any) {
        set({ error: error.message, loading: false });
        throw error;
      }
    },
  })
);
