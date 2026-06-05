import { create } from "zustand";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export type AssistantMode = "idle" | "chat" | "action_q" | "delegate_q" | "creating" | "done";
export type Intent = "chat" | "action" | "delegate";
export type CounterFieldType = "text" | "person" | "select_dept" | "select_priority" | "done";

export interface CounterOption {
  value: string;
  label: string;
}

export interface CounterQuestion {
  question: string;
  field_id: string;
  field_type: CounterFieldType;
  options: CounterOption[] | null;
  emoji: string | null;
  progress: string | null;
}

export interface AssistantContext {
  user_email?: string;
  organization_id?: string;
  organization_name?: string;
  document_summary?: string;
  role?: string;
  analyzed_documents?: number;
  has_employees?: number;
  has_goals?: number;
  has_tasks?: number;
}

export interface Person {
  id: string;
  name: string;
  email?: string;
  role?: string;
  department?: string;
}

export interface DelegateResult {
  goal: { _id: string; title: string; [k: string]: unknown };
  task: { _id: string; title: string; [k: string]: unknown };
  sub_tasks?: Array<{ _id: string; title: string }>;
  assignee: Person;
}

export interface UploadRequest {
  document_type: string;
  why: string;
  example?: string;
}

export interface ChatResponse {
  response: string;
  status: "ok" | "needs_data" | "partial" | "error";
  data_sufficiency?: "complete" | "partial" | "missing";
  question_type?: "general" | "company";
  available_sources?: Array<{ type: string; summary: string }>;
  missing_sources?: Array<{ type: string; summary: string }>;
  upload_requests?: UploadRequest[];
}

interface AssistantState {
  mode: AssistantMode;
  intent: Intent | null;
  topic: string | null;
  gathered: Record<string, string>;
  pendingQuestion: CounterQuestion | null;
  originalMessage: string;
  isLoading: boolean;
  error: string | null;
  lastDelegate: DelegateResult | null;
  recentDelegates: DelegateResult[];

  // Pending question state — when AI asks for data
  pendingQuestionMessage: string | null;       // the user's original question waiting for data
  pendingUploadRequests: UploadRequest[] | null; // what AI wants uploaded
  pendingReasoning: string | null;              // AI's reasoning line
  isUploading: boolean;

  setOriginal: (msg: string) => void;
  reset: () => void;
  setPendingUpload: (msg: string, requests: UploadRequest[], reasoning: string) => void;
  clearPendingUpload: () => void;
  setIsUploading: (v: boolean) => void;

  analyze: (message: string, ctx: AssistantContext, history: Array<{ role: string; content: string }>) => Promise<{ intent: Intent; topic: string }>;
  askNextQuestion: (message: string, ctx: AssistantContext) => Promise<CounterQuestion | null>;
  submitGathered: () => Promise<DelegateResult>;
  sendChat: (message: string, ctx: AssistantContext, history: Array<{ role: string; content: string }>) => Promise<ChatResponse>;
  searchPeople: (query: string, orgId: string) => Promise<Person[]>;
}

const initialGathered: Record<string, string> = {};

export const useAssistantStore = create<AssistantState>((set, get) => ({
  mode: "idle",
  intent: null,
  topic: null,
  gathered: { ...initialGathered },
  pendingQuestion: null,
  originalMessage: "",
  isLoading: false,
  error: null,
  lastDelegate: null,
  recentDelegates: [],
  pendingQuestionMessage: null,
  pendingUploadRequests: null,
  pendingReasoning: null,
  isUploading: false,

  setOriginal: (msg) => set({ originalMessage: msg }),
  reset: () => set({
    mode: "idle",
    intent: null,
    topic: null,
    gathered: {},
    pendingQuestion: null,
    originalMessage: "",
    isLoading: false,
    error: null,
    pendingQuestionMessage: null,
    pendingUploadRequests: null,
    pendingReasoning: null,
    isUploading: false,
  }),
  setPendingUpload: (msg, requests, reasoning) => set({
    pendingQuestionMessage: msg,
    pendingUploadRequests: requests,
    pendingReasoning: reasoning,
  }),
  clearPendingUpload: () => set({
    pendingQuestionMessage: null,
    pendingUploadRequests: null,
    pendingReasoning: null,
  }),
  setIsUploading: (v) => set({ isUploading: v }),

  analyze: async (message, ctx, history) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${API_URL}/assistant/analyze-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, context: ctx, conversation_history: history }),
      });
      const data = await res.json();
      const intent: Intent = data.intent || "chat";
      set({
        intent,
        topic: data.topic || null,
        mode: intent === "chat" ? "chat" : intent === "delegate" ? "delegate_q" : "action_q",
        isLoading: false,
      });
      return { intent, topic: data.topic || "" };
    } catch (e) {
      set({ isLoading: false, error: "Could not analyze your message. Treating it as a chat." });
      return { intent: "chat", topic: "" };
    }
  },

  askNextQuestion: async (message, ctx) => {
    const { intent, gathered, originalMessage } = get();
    if (!intent || intent === "chat") return null;
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${API_URL}/assistant/counter-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message || originalMessage,
          intent,
          gathered,
          context: ctx,
        }),
      });
      const data = await res.json();
      set({ isLoading: false });
      if (data.field_id === "done") {
        set({ pendingQuestion: null, mode: "creating" });
        return data;
      }
      set({ pendingQuestion: data });
      return data;
    } catch (e) {
      set({ isLoading: false, error: "Could not get the next question. Try again." });
      return null;
    }
  },

  submitGathered: async () => {
    const { gathered, intent, originalMessage, mode } = get();
    set({ isLoading: true, error: null, mode: "creating" });
    try {
      const res = await fetch(`${API_URL}/assistant/delegate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: gathered.title || originalMessage || "New task",
          description: gathered.description || "",
          assignee_id: gathered.assignee_id || undefined,
          assignee_name: gathered.assignee_name || undefined,
          priority: gathered.priority || "medium",
          timeline: gathered.timeline || undefined,
          due_date: gathered.due_date || undefined,
          department: gathered.department || undefined,
          create_tasks: true,
          task_count: 3,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Could not delegate the task");
      }
      const data = (await res.json()) as DelegateResult;
      set((s) => ({
        isLoading: false,
        mode: "done",
        lastDelegate: data,
        recentDelegates: [data, ...s.recentDelegates].slice(0, 5),
      }));
      return data;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create the task";
      set({ isLoading: false, error: msg, mode: intent === "delegate" ? "delegate_q" : "action_q" });
      throw e;
    }
  },

  sendChat: async (message, ctx, history) => {
    try {
      const res = await fetch(`${API_URL}/assistant/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, context: ctx, conversation_history: history }),
      });
      const data = await res.json();
      return {
        response: data.response || "I'm here — try asking me again.",
        status: data.status || "ok",
        data_sufficiency: data.data_sufficiency,
        question_type: data.question_type,
        available_sources: data.available_sources || [],
        missing_sources: data.missing_sources || [],
        upload_requests: data.upload_requests || [],
      };
    } catch (e) {
      return {
        response: "I'm having a small hiccup. Give me a moment and try again.",
        status: "error" as const,
        available_sources: [],
        missing_sources: [],
        upload_requests: [],
      };
    }
  },

  searchPeople: async (query, orgId) => {
    try {
      const res = await fetch(`${API_URL}/assistant/people/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, organization_id: orgId }),
      });
      const data = await res.json();
      return data.people || [];
    } catch {
      return [];
    }
  },
}));
