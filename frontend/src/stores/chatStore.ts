import { create } from "zustand";
import { getAuthHeaders } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "expert";
  content: string;
  timestamp: string;
  expertResponses?: ExpertResponse[];
  actionItems?: string[];
  question?: any;
  delegate?: any;
  meeting?: any;
}

export interface ExpertResponse {
  expert: string;
  response: string;
  confidence: number;
  sources?: string[];
}

export interface ChatSession {
  _id: string;
  title: string;
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
}

interface ChatState {
  messages: ChatMessage[];
  sessions: ChatSession[];
  activeSessionId: string | null;
  experts: { id: string; name: string; description: string; example_questions: string[] }[];
  loading: boolean;
  streaming: boolean;
  askLoading: boolean;
  error: string | null;
  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  setLoading: (loading: boolean) => void;
  setAskLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  fetchExperts: () => Promise<void>;
  sendMessage: (message: string, history?: ChatMessage[], organization_id?: string) => Promise<ChatMessage>;
  askMessage: (message: string, organization_id?: string) => Promise<ChatMessage>;
  clearChat: () => void;
  loadHistory: () => Promise<void>;
  fetchSessions: (orgId: string) => Promise<void>;
  createSession: (orgId: string, title?: string) => Promise<ChatSession | null>;
  deleteSession: (sessionId: string) => Promise<void>;
  setActiveSession: (sessionId: string | null) => void;
}

export const useChatStore = create<ChatState>()(
  (set, get) => ({
    messages: [],
    sessions: [],
    activeSessionId: null,
    experts: [],
    loading: false,
    streaming: false,
    askLoading: false,
    error: null,

    setMessages: (messages) => set({ messages }),
    addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
    setLoading: (loading) => set({ loading }),
    setAskLoading: (askLoading) => set({ askLoading }),
    setError: (error) => set({ error }),

    setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

    fetchExperts: async () => {
      try {
        const response = await fetch(`${API_URL}/strategy-chat/experts`, { headers: getAuthHeaders() });
        if (!response.ok) throw new Error("Failed to fetch experts");
        const result = await response.json();
        set({ experts: result.experts || [] });
      } catch (error: any) {
        set({ error: error.message });
      }
    },

    sendMessage: async (message, history, organization_id) => {
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: "user",
        content: message,
        timestamp: new Date().toISOString(),
      };
      
      set((state) => ({
        messages: [...state.messages, userMessage],
        loading: true,
        streaming: true,
        error: null,
      }));

      try {
        const response = await fetch(`${API_URL}/strategy-chat/chat`, {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            message,
            organization_id,
            history: history?.map(m => ({ role: m.role, content: m.content })),
          }),
        });

        if (!response.ok) throw new Error("Failed to get response");
        
        const result = await response.json();
        
        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: result.message,
          timestamp: result.timestamp,
          expertResponses: result.expert_responses,
          actionItems: result.action_items,
        };

        set((state) => ({
          messages: [...state.messages, assistantMessage],
          loading: false,
          streaming: false,
        }));

        return assistantMessage;
      } catch (error: any) {
        const errorMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "I apologize, but I encountered an error processing your request. Please try again.",
          timestamp: new Date().toISOString(),
        };
        
        set((state) => ({
          messages: [...state.messages, errorMessage],
          loading: false,
          streaming: false,
          error: error.message,
        }));
        
        return errorMessage;
      }
    },

    askMessage: async (message, organization_id) => {
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: "user",
        content: message,
        timestamp: new Date().toISOString(),
      };

      set((state) => ({
        messages: [...state.messages, userMessage],
        askLoading: true,
        error: null,
      }));

      try {
        const { activeSessionId, messages } = get();
        const response = await fetch(`${API_URL}/strategy-chat/ask`, {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            message,
            organization_id,
            session_id: activeSessionId,
            conversation_history: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
          }),
        });

        if (!response.ok) throw new Error("Failed to get response");

        const result = await response.json();

        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: result.response || "",
          timestamp: new Date().toISOString(),
          question: result.question,
          delegate: result.delegate,
          meeting: result.meeting,
        };

        set((state) => ({
          messages: [...state.messages, assistantMessage],
          askLoading: false,
        }));

        if (result.session_id && !get().activeSessionId) {
          set({ activeSessionId: result.session_id });
        }

        return assistantMessage;
      } catch (error: any) {
        const errorMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
          timestamp: new Date().toISOString(),
        };

        set((state) => ({
          messages: [...state.messages, errorMessage],
          askLoading: false,
          error: error.message,
        }));

        return errorMessage;
      }
    },

    clearChat: () => set({ messages: [], error: null }),

    loadHistory: async () => {
      set({ loading: true });
      try {
        const response = await fetch(`${API_URL}/strategy-chat/history`, { headers: getAuthHeaders() });
        if (!response.ok) throw new Error("Failed to load history");
        const result = await response.json();
        
        const historicalMessages: ChatMessage[] = (result.history || []).map((item: any, index: number) => ({
          id: item._id || `hist-${index}`,
          role: item.role as "user" | "assistant",
          content: item.content,
          timestamp: item.created_at,
        }));
        
        set({ messages: historicalMessages, loading: false });
      } catch (error: any) {
        set({ error: error.message, loading: false });
      }
    },

    fetchSessions: async (orgId) => {
      try {
        const res = await fetch(`${API_URL}/strategy-chat/sessions?organization_id=${orgId}`, { headers: getAuthHeaders() });
        if (res.ok) {
          const data = await res.json();
          set({ sessions: data.sessions || [] });
          const active = get().activeSessionId;
          if (active && !data.sessions.find((s: any) => s._id === active)) {
            set({ activeSessionId: null, messages: [] });
          }
        }
      } catch {}
    },

    createSession: async (orgId, title) => {
      try {
        const res = await fetch(`${API_URL}/strategy-chat/sessions`, {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ title, organization_id: orgId }),
        });
        if (res.ok) {
          const data = await res.json();
          const session = data.session;
          set((state) => ({ sessions: [session, ...state.sessions], activeSessionId: session._id, messages: [] }));
          return session;
        }
      } catch {}
      return null;
    },

    deleteSession: async (sessionId) => {
      try {
        await fetch(`${API_URL}/strategy-chat/sessions/${sessionId}`, { method: "DELETE", headers: getAuthHeaders() });
        set((state) => ({
          sessions: state.sessions.filter((s) => s._id !== sessionId),
          activeSessionId: state.activeSessionId === sessionId ? null : state.activeSessionId,
          messages: state.activeSessionId === sessionId ? [] : state.messages,
        }));
      } catch {}
    },
  })
);
