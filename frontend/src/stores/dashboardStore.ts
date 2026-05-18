import { create } from "zustand";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export interface DashboardInsight {
  id: string;
  type: string;
  title: string;
  description: string;
  priority: "success" | "warning" | "info" | "danger";
  category: string;
  action_items?: string[];
  metrics?: Record<string, any>;
  created_at: string;
}

export interface DashboardModule {
  id: string;
  title: string;
  metrics: string[];
  insights_count: number;
}

export interface ModuleMetric {
  value: number;
  change: number;
  trend: "up" | "down";
}

interface DashboardState {
  insights: DashboardInsight[];
  modules: DashboardModule[];
  currentModule: string;
  moduleMetrics: Record<string, ModuleMetric>;
  loading: boolean;
  error: string | null;
  setInsights: (insights: DashboardInsight[]) => void;
  setModules: (modules: DashboardModule[]) => void;
  setCurrentModule: (module: string) => void;
  setModuleMetrics: (metrics: Record<string, ModuleMetric>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  fetchInsights: (industry?: string, module?: string) => Promise<void>;
  fetchModules: (industry?: string) => Promise<void>;
  fetchModuleMetrics: (module: string) => Promise<void>;
}

export const useDashboardStore = create<DashboardState>()(
  (set, get) => ({
    insights: [],
    modules: [],
    currentModule: "founder",
    moduleMetrics: {},
    loading: false,
    error: null,

    setInsights: (insights) => set({ insights }),
    setModules: (modules) => set({ modules }),
    setCurrentModule: (module) => set({ currentModule: module }),
    setModuleMetrics: (metrics) => set({ moduleMetrics: metrics }),
    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),

    fetchInsights: async (industry, module) => {
      set({ loading: true, error: null });
      try {
        const params = new URLSearchParams();
        if (industry) params.append("industry", industry);
        if (module) params.append("module", module);
        
        const response = await fetch(`${API_URL}/dashboard/insights?${params}`);
        if (!response.ok) throw new Error("Failed to fetch insights");
        const result = await response.json();
        set({ insights: result.insights || [], loading: false });
      } catch (error: any) {
        set({ error: error.message, loading: false });
      }
    },

    fetchModules: async (industry) => {
      set({ loading: true, error: null });
      try {
        const params = industry ? `?industry=${industry}` : "";
        const response = await fetch(`${API_URL}/dashboard/modules${params}`);
        if (!response.ok) throw new Error("Failed to fetch modules");
        const result = await response.json();
        set({ modules: result.modules || [], loading: false });
      } catch (error: any) {
        set({ error: error.message, loading: false });
      }
    },

    fetchModuleMetrics: async (module) => {
      set({ loading: true, error: null });
      try {
        const response = await fetch(`${API_URL}/dashboard/metrics/${module}`);
        if (!response.ok) throw new Error("Failed to fetch metrics");
        const result = await response.json();
        set({ moduleMetrics: result.metrics || {}, loading: false });
      } catch (error: any) {
        set({ error: error.message, loading: false });
      }
    },
  })
);