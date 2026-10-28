import { getAuthHeaders } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

export type EntryKind = "idea" | "frustration" | "decision" | "concern" | "goal" | "opportunity" | "reflection";

export interface Signals {
  mood: number | null;
  energy: number | null;
  stress: number | null;
  confidence: number | null;
  triggers: string[];
}

export interface Analysis {
  kind: EntryKind;
  summary: string;
  takeaways: string[];
  entities: { people: string[]; projects: string[]; deadlines: string[]; problems: string[] };
  hypotheses: string[];
  follow_up_questions: string[];
  themes: string[];
  signals: Signals;
  category: string;
  actionable_items: { text: string; priority: string }[];
}

/** Entries analysed before the v2 analyzer only have some of these fields. */
export type RawAnalysis = Partial<Analysis> & { analysis_version?: number } & Record<string, unknown>;

const KINDS: EntryKind[] = ["idea", "frustration", "decision", "concern", "goal", "opportunity", "reflection"];

/** Fill in every field so the UI never crashes on older or partial analyses. */
export function normalizeAnalysis(raw: RawAnalysis | null | undefined): (Analysis & { isLegacy: boolean }) | null {
  if (!raw || typeof raw !== "object") return null;
  const list = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
  const entities = (raw.entities ?? {}) as Partial<Analysis["entities"]>;
  const signals = (raw.signals ?? {}) as Partial<Signals>;
  return {
    kind: KINDS.includes(raw.kind as EntryKind) ? (raw.kind as EntryKind) : "reflection",
    summary: typeof raw.summary === "string" ? raw.summary : "",
    takeaways: list(raw.takeaways),
    entities: {
      people: list(entities.people),
      projects: list(entities.projects),
      deadlines: list(entities.deadlines),
      problems: list(entities.problems),
    },
    hypotheses: list(raw.hypotheses),
    follow_up_questions: list(raw.follow_up_questions),
    themes: list(raw.themes),
    signals: {
      mood: signals.mood ?? null,
      energy: signals.energy ?? null,
      stress: signals.stress ?? null,
      confidence: signals.confidence ?? null,
      triggers: list(signals.triggers),
    },
    category: typeof raw.category === "string" ? raw.category : "general",
    actionable_items: Array.isArray(raw.actionable_items) ? raw.actionable_items : [],
    isLegacy: raw.analysis_version !== 2,
  };
}

export interface EntryRow {
  _id: string;
  session_id?: string | null;
  content: string;
  created_at: string;
  ai_analysis: RawAnalysis | null;
}

export interface SourceRef {
  entry_id: string;
  session_id?: string | null;
  date: string;
  snippet: string;
  kind?: string | null;
  relation?: string;
}

export interface SessionSummary {
  ready: boolean;
  kind?: EntryKind;
  mood_noted?: boolean;
  idea_saved?: boolean;
  idea_note?: string | null;
}

export interface Checkin {
  mood: number | null;
  energy: number | null;
  stress: number | null;
  confidence: number | null;
  reasons: string[];
  note?: string;
  date: string;
}

export interface MoodDay {
  date: string;
  source: "checkin" | "inferred";
  mood: number | null;
  energy: number | null;
  stress: number | null;
  confidence: number | null;
  triggers: string[];
}

export interface MoodInsights {
  series: MoodDay[];
  weekly: { week_start: string; days: number; mood: number | null; energy: number | null; stress: number | null; confidence: number | null }[];
  top_triggers: { trigger: string; days: number }[];
  patterns: { trigger: string; count: number; dates: string[]; text: string }[];
  today_checkin: Checkin | null;
}

export interface Decision {
  _id: string;
  question: string;
  options: string[];
  preferred: string;
  why: string;
  assumptions: string[];
  risks: string[];
  expected_outcome: string;
  review_on: string | null;
  status: "open" | "reviewed";
  actual_outcome: string | null;
  result: "better" | "as_expected" | "worse" | null;
  created_at: string;
}

export type IdeaStatus = "thought" | "exploring" | "experiment" | "implemented" | "dropped";

export interface Idea {
  _id: string;
  entry_id: string;
  title: string;
  summary: string;
  category: string;
  status: IdeaStatus;
  themes: string[];
  connections: SourceRef[];
  connection_note: string | null;
  duplicate_of: string | null;
  links?: { goal_ids?: string[]; task_ids?: string[]; problem?: string };
  created_at: string;
}

export interface RecapItem {
  text: string;
  entry_ids: string[];
}

export interface Recap {
  _id: string;
  period: "daily" | "weekly";
  range_key: string;
  sections: Record<string, RecapItem[]>;
  sources: SourceRef[];
  created_at: string;
}

export interface Reminder {
  _id: string;
  text: string;
  status: "active" | "fired" | "done" | "cancelled";
  trigger: { type: string; due_at?: string; match?: string; goal_title?: string };
  entry_id?: string | null;
  decision_id?: string | null;
  created_at: string;
}

export interface Pattern {
  _id: string;
  type: string;
  theme: string;
  count: number;
  text: string;
  sources: SourceRef[];
}

export interface WhatIfItem {
  text: string;
  basis: "fact" | "estimate";
}

export interface WhatIfResult {
  summary: string;
  benefits: WhatIfItem[];
  costs: WhatIfItem[];
  risks: WhatIfItem[];
  assumptions: string[];
  info_needed: string[];
  first_step: string;
}

type Query = Record<string, string | number | undefined>;

/** Typed fetch wrapper for /journal-intel (always scoped to the signed-in author + organization). */
export async function journalApi<T>(
  path: string,
  orgId: string,
  options: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown; query?: Query } = {}
): Promise<T> {
  const params = new URLSearchParams({ organization_id: orgId });
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) params.set(key, String(value));
  }
  const res = await fetch(`${API_URL}/journal-intel${path}?${params.toString()}`, {
    method: options.method ?? "GET",
    headers: getAuthHeaders(),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!res.ok) {
    let detail = "Something went wrong. Please try again.";
    try {
      const data = await res.json();
      if (typeof data?.detail === "string") detail = data.detail;
    } catch {
      /* keep the generic message */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}
