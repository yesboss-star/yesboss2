import { create } from "zustand";
import { persist } from "zustand/middleware";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "expert";
  content: string;
  timestamp: string;
  expertResponses?: ExpertResponse[];
  actionItems?: string[];
}

export interface ExpertResponse {
  expert: string;
  response: string;
  confidence: number;
  sources?: string[];
}

interface ChatState {
  messages: ChatMessage[];
  experts: { id: string; name: string; description: string; example_questions: string[] }[];
  loading: boolean;
  streaming: boolean;
  error: string | null;
  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  setLoading: (loading: boolean) => void;
  setStreaming: (streaming: boolean) => void;
  setError: (error: string | null) => void;
  fetchExperts: () => Promise<void>;
  sendMessage: (message: string, history?: ChatMessage[], organization_id?: string) => Promise<ChatMessage>;
  clearChat: () => void;
  loadHistory: () => Promise<void>;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      messages: [],
      experts: [],
      loading: false,
      streaming: false,
      error: null,

      setMessages: (messages) => set({ messages }),
      addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
      setLoading: (loading) => set({ loading }),
      setStreaming: (streaming) => set({ streaming }),
      setError: (error) => set({ error }),

      fetchExperts: async () => {
        try {
          const response = await fetch(`${API_URL}/executive-chat/experts`);
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
          const response = await fetch(`${API_URL}/executive-chat/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
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

      clearChat: () => set({ messages: [], error: null }),

      loadHistory: async () => {
        set({ loading: true });
        try {
          const response = await fetch(`${API_URL}/executive-chat/history`);
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
    }),
    {
      name: "yesboss-chat",
      partialize: (state) => ({ messages: state.messages.slice(-50) }),
    }
  )
);