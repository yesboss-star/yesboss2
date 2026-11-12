import { create } from "zustand";
import { getAuthHeaders } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

export type CaptureKind = "note" | "journal" | "mom" | "report" | "idea" | "question" | "other";
export type CaptureSource = "text" | "voice" | "file" | "transcript" | "email" | "cliq";
export type CaptureVisibility = "private" | "members" | "org";
export type CaptureStatus = "queued" | "processing" | "done" | "needs_review" | "failed";

export interface CapturePerson {
  email: string;
  name: string;
}

export interface CaptureEntities {
  people: string[];
  dates: string[];
  amounts: string[];
  goals: string[];
  kpis: string[];
}

export interface CaptureLink {
  type: "goal" | "task" | "capture";
  id: string;
  title: string;
  reason?: string | null;
  confidence?: number | null;
}

export interface CaptureSuggestion {
  id: string;
  title: string;
  description?: string | null;
  assignee_email?: string | null;
  due_date?: string | null;
  priority?: "low" | "medium" | "high" | null;
  goal_id?: string | null;
  reason?: string | null;
  status: "pending" | "accepting" | "accepted" | "dismissed";
  task_id?: string | null;
}

export interface Capture {
  id: string;
  organization_id: string;
  user_id: string;
  author_name?: string | null;
  source: CaptureSource;
  kind: CaptureKind;
  kind_source?: "user" | "ai" | "default" | null;
  visibility: CaptureVisibility;
  shared_with: CapturePerson[];
  title?: string | null;
  text?: string | null;
  preview?: string | null;
  raw_ref?: { type: "file" | "journal_entry" | "meeting"; id: string } | null;
  status: CaptureStatus;
  series_key?: string | null;
  analysis?: {
    kind?: CaptureKind | null;
    kind_confidence?: number | null;
    summary?: string | null;
    reason?: string | null;
    provider?: "llm" | "rules" | null;
  } | null;
  entities?: CaptureEntities | null;
  links: CaptureLink[];
  suggestions: CaptureSuggestion[];
  error?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaptureInput {
  organizationId: string;
  text?: string;
  source: CaptureSource;
  kind: CaptureKind;
  title?: string;
  visibility: CaptureVisibility;
  sharedWith: string[];
  file?: File;
}

export interface CaptureFilters {
  kind?: CaptureKind | "";
  status?: CaptureStatus | "";
  q?: string;
}

interface CaptureState {
  captures: Capture[];
  total: number;
  needsReview: number;
  loading: boolean;
  saving: boolean;
  error: string | null;
  fetchCaptures: (orgId: string, filters?: CaptureFilters, opts?: { silent?: boolean }) => Promise<void>;
  createCapture: (input: CaptureInput) => Promise<Capture>;
  updateCapture: (
    id: string,
    patch: {
      title?: string;
      kind?: CaptureKind;
      visibility?: CaptureVisibility;
      shared_with?: string[];
      confirm?: boolean;
    }
  ) => Promise<void>;
  reanalyze: (id: string) => Promise<void>;
  acceptSuggestion: (
    captureId: string,
    suggestionId: string,
    overrides?: { assignee_email?: string; due_date?: string; title?: string }
  ) => Promise<void>;
  dismissSuggestion: (captureId: string, suggestionId: string) => Promise<void>;
  deleteCapture: (id: string) => Promise<{ source_deleted: boolean; source_kept: { type: string; id: string } | null }>;
  clearError: () => void;
}

async function fail(res: Response, fallback: string): Promise<never> {
  let detail = fallback;
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") detail = body.detail;
  } catch {}
  throw new Error(detail);
}

const messageOf = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** Plain upload for a file capture: the same endpoint the Uploaded Data page uses. */
async function uploadFile(file: File, orgId: string): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("organization_id", orgId);
  const headers = getAuthHeaders();
  delete headers["Content-Type"]; // the browser sets the multipart boundary itself
  const res = await fetch(`${API_URL}/strategy-chat/upload-and-analyze`, { method: "POST", headers, body: form });
  if (!res.ok) await fail(res, "Upload failed");
  const body = await res.json();
  if (!body.file_id) throw new Error("Upload did not return a file id");
  return body.file_id as string;
}

/** A journal capture is saved through the Journal endpoint too, so the Journal page keeps working. */
async function createJournalEntry(text: string, orgId: string): Promise<string> {
  const res = await fetch(`${API_URL}/journal?organization_id=${encodeURIComponent(orgId)}`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ content: text, type: "journal" }),
  });
  if (!res.ok) await fail(res, "Could not save the journal entry");
  const body = await res.json();
  return body.entry?._id as string;
}

export const useCaptureStore = create<CaptureState>()((set) => {
  const replace = (capture: Capture) =>
    set((s) => ({ captures: s.captures.map((c) => (c.id === capture.id ? capture : c)) }));

  const call = async (path: string, init: RequestInit, fallback: string) => {
    const res = await fetch(`${API_URL}/captures${path}`, { headers: getAuthHeaders(), ...init });
    if (!res.ok) await fail(res, fallback);
    return res.json();
  };

  return {
    captures: [],
    total: 0,
    needsReview: 0,
    loading: false,
    saving: false,
    error: null,

    clearError: () => set({ error: null }),

    fetchCaptures: async (orgId, filters = {}, opts = {}) => {
      if (!opts.silent) set({ loading: true, error: null });
      try {
        const params = new URLSearchParams({ organization_id: orgId, limit: "100" });
        if (filters.kind) params.set("kind", filters.kind);
        if (filters.status) params.set("status", filters.status);
        if (filters.q?.trim()) params.set("q", filters.q.trim());
        const data = await call(`?${params}`, {}, "Could not load your captures");
        set({ captures: data.captures || [], total: data.total ?? 0, needsReview: data.needs_review ?? 0, loading: false });
      } catch (e) {
        if (!opts.silent) set({ error: messageOf(e, "Could not load your captures"), loading: false });
      }
    },

    createCapture: async (input) => {
      set({ saving: true, error: null });
      try {
        const body: Record<string, unknown> = {
          organization_id: input.organizationId,
          source: input.source,
          kind: input.kind,
          title: input.title?.trim() || undefined,
          visibility: input.kind === "journal" ? "private" : input.visibility,
          shared_with: input.kind !== "journal" && input.visibility === "members" ? input.sharedWith : [],
        };
        const text = input.text?.trim() || "";

        if (input.file) {
          body.raw_ref = { type: "file", id: await uploadFile(input.file, input.organizationId) };
          body.title = (body.title as string | undefined) || input.file.name;
          if (text) body.text = text;
        } else if (input.kind === "journal") {
          body.raw_ref = { type: "journal_entry", id: await createJournalEntry(text, input.organizationId) };
        } else {
          body.text = text;
        }

        const { capture } = (await call("", { method: "POST", body: JSON.stringify(body) }, "Could not save the capture")) as {
          capture: Capture;
        };
        set((s) => ({ captures: [capture, ...s.captures], total: s.total + 1, saving: false }));
        return capture;
      } catch (e) {
        set({ error: messageOf(e, "Could not save the capture"), saving: false });
        throw e;
      }
    },

    updateCapture: async (id, patch) => {
      set({ error: null });
      try {
        const { capture } = await call(`/${id}`, { method: "PATCH", body: JSON.stringify(patch) }, "Could not update the capture");
        replace(capture);
        set((s) => ({ needsReview: s.captures.filter((c) => c.status === "needs_review").length }));
      } catch (e) {
        set({ error: messageOf(e, "Could not update the capture") });
        throw e;
      }
    },

    reanalyze: async (id) => {
      set({ error: null });
      try {
        const { capture } = await call(`/${id}/analyze`, { method: "POST" }, "Could not start the analysis");
        replace(capture);
      } catch (e) {
        set({ error: messageOf(e, "Could not start the analysis") });
        throw e;
      }
    },

    acceptSuggestion: async (captureId, suggestionId, overrides = {}) => {
      set({ error: null });
      try {
        const { capture } = await call(
          `/${captureId}/suggestions/${suggestionId}/accept`,
          { method: "POST", body: JSON.stringify(overrides) },
          "Could not create the task"
        );
        replace(capture);
      } catch (e) {
        set({ error: messageOf(e, "Could not create the task") });
        throw e;
      }
    },

    dismissSuggestion: async (captureId, suggestionId) => {
      set({ error: null });
      try {
        const { capture } = await call(`/${captureId}/suggestions/${suggestionId}/dismiss`, { method: "POST" }, "Could not dismiss it");
        replace(capture);
      } catch (e) {
        set({ error: messageOf(e, "Could not dismiss it") });
        throw e;
      }
    },

    deleteCapture: async (id) => {
      set({ error: null });
      try {
        const result = await call(`/${id}`, { method: "DELETE" }, "Could not delete the capture");
        set((s) => {
          const captures = s.captures.filter((c) => c.id !== id);
          return {
            captures,
            total: Math.max(0, s.total - 1),
            needsReview: captures.filter((c) => c.status === "needs_review").length,
          };
        });
        return { source_deleted: !!result.source_deleted, source_kept: result.source_kept ?? null };
      } catch (e) {
        set({ error: messageOf(e, "Could not delete the capture") });
        throw e;
      }
    },
  };
});

export const KIND_LABELS: Record<CaptureKind, string> = {
  note: "Note",
  journal: "Journal",
  mom: "Meeting notes",
  report: "Report",
  idea: "Idea",
  question: "Question",
  other: "Other",
};
