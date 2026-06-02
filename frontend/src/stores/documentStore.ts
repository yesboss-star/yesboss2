import { create } from "zustand";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export interface DocumentInsight {
  file_id: string;
  filename: string;
  file_type: string;
  uploaded_at?: string;
  insights_status: "pending" | "completed" | "failed";
  summary: string;
  document_category: string;
  key_metrics: { name: string; value: string; context: string }[];
  key_entities: {
    people: string[];
    companies: string[];
    products: string[];
    amounts: string[];
  };
  decisions: string[];
  action_items: string[];
  qa_pairs: { question: string; answer: string }[];
}

export interface DocumentContext {
  documents: DocumentInsight[];
  summary: string;
  metrics: { source_file: string; name: string; value: string; context: string }[];
  category_breakdown: Record<string, number>;
  total_documents: number;
  analyzed_documents: number;
  pending_documents: number;
}

export interface DocumentSuggestion {
  title: string;
  category: string;
  why_it_helps: string;
  example_contents: string;
  priority: "high" | "medium" | "low";
}

export interface BusinessContext {
  stage: string;
  business_model: string;
  primary_growth_lever: string;
  key_risks: string[];
}

interface DocumentState {
  context: DocumentContext | null;
  suggestions: DocumentSuggestion[];
  businessContext: BusinessContext | null;
  suggestionsLoading: boolean;
  contextLoading: boolean;
  lastFetchedAt: number | null;
  fetchContext: (orgId: string) => Promise<DocumentContext | null>;
  fetchSuggestions: (params: {
    domain?: string;
    company_name?: string;
    industry?: string;
    micro_vertical?: string;
    size?: string;
    existing_documents?: { filename: string }[];
  }) => Promise<void>;
  askQuestion: (orgId: string, question: string) => Promise<{
    answer: string;
    sources: { filename: string; excerpt: string; score: number }[];
  } | null>;
  clearContext: () => void;
}

export const useDocumentStore = create<DocumentState>()((set, get) => ({
  context: null,
  suggestions: [],
  businessContext: null,
  suggestionsLoading: false,
  contextLoading: false,
  lastFetchedAt: null,

  fetchContext: async (orgId) => {
    if (!orgId) return null;
    set({ contextLoading: true });
    try {
      const res = await fetch(`${API_URL}/files/context?org_id=${encodeURIComponent(orgId)}`);
      if (!res.ok) {
        set({ contextLoading: false });
        return null;
      }
      const data: DocumentContext = await res.json();
      set({ context: data, contextLoading: false, lastFetchedAt: Date.now() });
      return data;
    } catch {
      set({ contextLoading: false });
      return null;
    }
  },

  fetchSuggestions: async (params) => {
    set({ suggestionsLoading: true });
    try {
      const res = await fetch(`${API_URL}/intelligence/document-suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: params.domain || "",
          company_name: params.company_name || "",
          industry: params.industry || "",
          micro_vertical: params.micro_vertical || "",
          size: params.size || "",
          existing_documents: params.existing_documents || [],
          count: 10,
        }),
      });
      if (!res.ok) {
        set({ suggestions: [], businessContext: null, suggestionsLoading: false });
        return;
      }
      const data = await res.json();
      set({
        suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
        businessContext: data.business_context || null,
        suggestionsLoading: false,
      });
    } catch {
      set({ suggestions: [], businessContext: null, suggestionsLoading: false });
    }
  },

  askQuestion: async (orgId, question) => {
    if (!orgId || !question.trim()) return null;
    try {
      const res = await fetch(`${API_URL}/files/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId, question, top_k: 5 }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  clearContext: () =>
    set({
      context: null,
      suggestions: [],
      businessContext: null,
      lastFetchedAt: null,
    }),
}));
