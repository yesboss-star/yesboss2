import { create } from "zustand";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export interface TrendArticle {
  title: string;
  description: string;
  source: string;
  url: string;
  published_at: string;
  category: string[];
  image_url?: string;
}

interface MarketTrendsState {
  articles: TrendArticle[];
  query: string;
  loading: boolean;
  error: string | null;
  fetchTrends: (industry?: string, microVertical?: string) => Promise<void>;
}

export const useMarketTrendsStore = create<MarketTrendsState>()(
  (set) => ({
    articles: [],
    query: "",
    loading: false,
    error: null,

    fetchTrends: async (industry, microVertical) => {
      set({ loading: true, error: null });
      try {
        const params = new URLSearchParams();
        if (industry) params.append("industry", industry);
        if (microVertical) params.append("micro_vertical", microVertical);
        const response = await fetch(`${API_URL}/trends/news?${params}`);
        if (!response.ok) throw new Error("Failed to fetch trends");
        const result = await response.json();
        set({
          articles: result.articles || [],
          query: result.query || "",
          loading: false,
        });
      } catch (error: any) {
        set({ error: error.message, loading: false });
      }
    },
  })
);
