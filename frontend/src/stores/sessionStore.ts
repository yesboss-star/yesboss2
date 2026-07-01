import { create } from "zustand";
import { persist } from "zustand/middleware";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const raw = localStorage.getItem("yesboss_user");
    if (raw) {
      const user = JSON.parse(raw);
      if (user.uid) headers["X-User-ID"] = user.uid;
      if (user.email) headers["X-User-Email"] = user.email;
    }
  } catch {}
  return headers;
}

export interface BookingSlot {
  start: string;
  end: string;
}

export interface BookingParams {
  attendee_emails?: string[];
  date?: string;
  duration_minutes?: number;
  title?: string;
  description?: string;
  preferred_time?: string;
  available_slots?: BookingSlot[];
  booking_result?: Record<string, any>;
}

export interface SessionMessage {
  role: "user" | "assistant";
  content: string;
  question_data?: ClarifyingQuestion | null;
  is_question?: boolean;
  is_answer?: boolean;
  is_booking?: boolean;
  booking_params?: BookingParams;
  is_loading?: boolean;
  timestamp: number;
}

export interface ClarifyingQuestion {
  id: string;
  field_id: string;
  text: string;
  options: { value: string; label: string }[];
  allow_custom: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  organization_id: string;
  messages: SessionMessage[];
  context: Record<string, string>;
  created_at: string;
  updated_at: string;
}

interface SessionState {
  sessions: ChatSession[];
  activeSessionId: string | null;
  isLoading: boolean;

  fetchSessions: (orgId: string) => Promise<void>;
  createSession: (orgId: string, title?: string) => Promise<ChatSession>;
  deleteSession: (sessionId: string) => void;
  renameSession: (sessionId: string, title: string) => void;
  setActiveSession: (sessionId: string | null) => void;
  addMessage: (sessionId: string, message: SessionMessage) => void;
  updateLastMessage: (sessionId: string, patch: Partial<SessionMessage>) => void;
  updateSessionContext: (sessionId: string, context: Record<string, string>) => void;
  getActiveSession: () => ChatSession | null;
}

const SESSIONS_KEY = "yesboss-assistant-sessions";

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      isLoading: false,

      fetchSessions: async (orgId) => {
        if (!orgId) return;
        set({ isLoading: true });
        try {
          const res = await fetch(`${API_URL}/assistant/sessions?organization_id=${orgId}`, { headers: getAuthHeaders() });
          if (res.ok) {
            const data = await res.json();
            const mapped = (data.sessions || []).map((s: any) => ({
              id: s._id || s.id,
              title: s.title || "New Chat",
              organization_id: s.organization_id || orgId,
              messages: s.messages || [],
              context: s.context || {},
              created_at: s.created_at,
              updated_at: s.updated_at,
            }));
            set({ sessions: mapped });
          }
        } catch {
          // Use local sessions as fallback
        } finally {
          set({ isLoading: false });
        }
      },

      createSession: async (orgId, title) => {
        const localId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const newSession: ChatSession = {
          id: localId,
          title: title || "New Chat",
          organization_id: orgId,
          messages: [],
          context: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        set((s) => ({
          sessions: [newSession, ...s.sessions],
          activeSessionId: newSession.id,
        }));

        try {
          const res = await fetch(`${API_URL}/assistant/sessions`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({ organization_id: orgId, title: title || "New Chat" }),
          });
          if (res.ok) {
            const serverSession = await res.json();
            const serverMapped: ChatSession = {
              id: serverSession._id || serverSession.id,
              title: serverSession.title || "New Chat",
              organization_id: orgId,
              messages: serverSession.messages || [],
              context: serverSession.context || {},
              created_at: serverSession.created_at,
              updated_at: serverSession.updated_at,
            };
            set((s) => ({
              sessions: s.sessions.map((sess) => (sess.id === localId ? serverMapped : sess)),
              activeSessionId: serverMapped.id,
            }));
            return serverMapped;
          }
        } catch {
          // Use local session
        }
        return newSession;
      },

      deleteSession: async (sessionId) => {
        set((s) => ({
          sessions: s.sessions.filter((sess) => sess.id !== sessionId),
          activeSessionId: s.activeSessionId === sessionId ? null : s.activeSessionId,
        }));
        try {
          await fetch(`${API_URL}/assistant/sessions/${sessionId}`, { method: "DELETE", headers: getAuthHeaders() });
        } catch {
          // Local delete is enough
        }
      },

      renameSession: async (sessionId, title) => {
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId ? { ...sess, title, updated_at: new Date().toISOString() } : sess
          ),
        }));
        try {
          await fetch(`${API_URL}/assistant/sessions/${sessionId}`, {
            method: "PUT",
            headers: getAuthHeaders(),
            body: JSON.stringify({ title }),
          });
        } catch {
          // Local rename is enough
        }
      },

      setActiveSession: (sessionId) => {
        set({ activeSessionId: sessionId });
      },

      addMessage: (sessionId, message) => {
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId
              ? {
                  ...sess,
                  messages: [...sess.messages, message],
                  updated_at: new Date().toISOString(),
                }
              : sess
          ),
        }));
        // Persist to backend
        if (!sessionId.startsWith("local_")) {
          fetch(`${API_URL}/assistant/sessions/${sessionId}/messages`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({ message }),
          }).catch(() => {});
        }
      },

      updateLastMessage: (sessionId, patch) => {
        set((s) => ({
          sessions: s.sessions.map((sess) => {
            if (sess.id !== sessionId) return sess;
            const msgs = [...sess.messages];
            if (msgs.length > 0) {
              msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], ...patch };
            }
            return { ...sess, messages: msgs, updated_at: new Date().toISOString() };
          }),
        }));
      },

      updateSessionContext: (sessionId, context) => {
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId
              ? { ...sess, context: { ...sess.context, ...context }, updated_at: new Date().toISOString() }
              : sess
          ),
        }));
        if (!sessionId.startsWith("local_")) {
          fetch(`${API_URL}/assistant/sessions/${sessionId}`, {
            method: "PUT",
            headers: getAuthHeaders(),
            body: JSON.stringify({ context }),
          }).catch(() => {});
        }
      },

      getActiveSession: () => {
        const { sessions, activeSessionId } = get();
        if (!activeSessionId) return null;
        return sessions.find((s) => s.id === activeSessionId) || null;
      },
    }),
    { name: SESSIONS_KEY }
  )
);
