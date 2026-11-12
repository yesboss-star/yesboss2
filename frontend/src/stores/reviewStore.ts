import { create } from "zustand";
import { getAuthHeaders } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

export type ReviewScope = "personal" | "company";
export type CommitmentState = "done" | "open" | "missed" | "no_evidence";

export interface ReviewEvidence {
  kind: "task_completed" | "manual" | "metric_moved";
  strength: "hard" | "soft" | "manual";
  note: string;
  at?: string | null;
  ref?: string;
}

export interface ReviewItem {
  id: string;
  text: string;
  state: CommitmentState;
  owner_email?: string | null;
  owner_name?: string | null;
  due_date?: string | null;
  decided_this_week: boolean;
  evidence: ReviewEvidence[];
  task?: { id: string; title?: string | null; status?: string | null } | null;
  capture: { id: string; title?: string | null; kind?: string | null };
  created_at?: string | null;
}

export interface ReviewReportRow {
  series?: string | null;
  metric: string;
  unit: string;
  latest: { value: number; display: string; period: string; capture: { id: string; title?: string | null } };
  previous: { value: number; display: string; period: string; capture: { id: string; title?: string | null } };
  change: number;
  change_display: string;
  change_pct: number | null;
  direction: "up" | "down" | "flat";
}

export interface ReviewTrend {
  series?: string | null;
  metric: string;
  unit: string;
  note?: string | null;
  direction: "up" | "down" | "flat";
  streak: number;
  change_pct: number | null;
  points: { period: string; value: number; display: string; capture: { id: string; title?: string | null } }[];
}

export interface Review {
  scope: ReviewScope;
  period: { start: string; end: string };
  counts: {
    decided: number;
    done: number;
    open: number;
    missed: number;
    no_evidence: number;
    report_changes: number;
    new_captures: number;
  };
  done: ReviewItem[];
  open: ReviewItem[];
  missed: ReviewItem[];
  no_evidence: ReviewItem[];
  reports: ReviewReportRow[];
  trends: ReviewTrend[];
  new_captures: Record<string, number>;
}

interface ReviewState {
  review: Review | null;
  canSeeCompany: boolean;
  emailEnabled: boolean;
  loading: boolean;
  error: string | null;
  notice: string | null;
  fetchReview: (orgId: string, scope: ReviewScope, opts?: { silent?: boolean }) => Promise<void>;
  markDone: (id: string, orgId: string, scope: ReviewScope) => Promise<void>;
  drop: (id: string, orgId: string, scope: ReviewScope) => Promise<void>;
  setEmailEnabled: (enabled: boolean) => Promise<void>;
  emailMe: (orgId: string, scope: ReviewScope) => Promise<void>;
}

async function detailOf(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") return body.detail;
  } catch {}
  return fallback;
}

const messageOf = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export const useReviewStore = create<ReviewState>()((set, get) => {
  const act = async (path: string, orgId: string, scope: ReviewScope, fallback: string) => {
    set({ error: null });
    try {
      const res = await fetch(`${API_URL}/weekly-review/commitments/${path}`, { method: "POST", headers: getAuthHeaders() });
      if (!res.ok) throw new Error(await detailOf(res, fallback));
      await get().fetchReview(orgId, scope, { silent: true });
    } catch (e) {
      set({ error: messageOf(e, fallback) });
    }
  };

  return {
    review: null,
    canSeeCompany: false,
    emailEnabled: true,
    loading: false,
    error: null,
    notice: null,

    fetchReview: async (orgId, scope, opts = {}) => {
      if (!opts.silent) set({ loading: true, error: null, notice: null });
      try {
        const params = new URLSearchParams({ organization_id: orgId, scope });
        const res = await fetch(`${API_URL}/weekly-review?${params}`, { headers: getAuthHeaders() });
        if (!res.ok) throw new Error(await detailOf(res, "Could not load the weekly review"));
        const data = await res.json();
        set({ review: data.review, canSeeCompany: !!data.can_see_company, emailEnabled: data.email_enabled !== false, loading: false });
      } catch (e) {
        set({ error: messageOf(e, "Could not load the weekly review"), loading: false });
      }
    },

    markDone: (id, orgId, scope) => act(`${id}/done`, orgId, scope, "Could not mark it done"),
    drop: (id, orgId, scope) => act(`${id}/drop`, orgId, scope, "Could not drop it"),

    setEmailEnabled: async (enabled) => {
      const before = get().emailEnabled;
      set({ emailEnabled: enabled, error: null });
      try {
        const res = await fetch(`${API_URL}/weekly-review/preferences`, {
          method: "PUT",
          headers: getAuthHeaders(),
          body: JSON.stringify({ weekly_review_email: enabled }),
        });
        if (!res.ok) throw new Error(await detailOf(res, "Could not save your choice"));
      } catch (e) {
        set({ emailEnabled: before, error: messageOf(e, "Could not save your choice") });
      }
    },

    emailMe: async (orgId, scope) => {
      set({ error: null, notice: null });
      try {
        const params = new URLSearchParams({ organization_id: orgId, scope });
        const res = await fetch(`${API_URL}/weekly-review/email-me?${params}`, { method: "POST", headers: getAuthHeaders() });
        if (!res.ok) throw new Error(await detailOf(res, "Could not send the email"));
        const data = await res.json();
        set(data.sent ? { notice: "Sent. Check your inbox." } : { error: data.reason || "The email was not sent." });
      } catch (e) {
        set({ error: messageOf(e, "Could not send the email") });
      }
    },
  };
});
