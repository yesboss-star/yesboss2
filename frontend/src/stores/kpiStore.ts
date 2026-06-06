import { create } from "zustand";
import { persist } from "zustand/middleware";

const STORAGE_KEY = "yesboss-kpi-suggestions";

export type KPISource = "ai" | "document" | "goal" | "progress";

export interface KPISuggestion {
  id: string;
  key: string;
  title: string;
  rationale: string;
  source: KPISource;
  sourceDetail?: string;
  category?: string;
  icon?: string;
  priority: "high" | "medium" | "low";
  createdAt: number;
}

export interface AcceptedKPI {
  id: string;
  key: string;
  title: string;
  category?: string;
  icon?: string;
  triggerSource?: KPISource;
  triggerDetail?: string;
  acceptedAt: number;
}

interface KPIState {
  suggestionsByOrg: Record<string, KPISuggestion[]>;
  acceptedByOrg: Record<string, AcceptedKPI[]>;
  dismissedByOrg: Record<string, string[]>;
  lastShownAt: Record<string, number>;
  addSuggestions: (orgId: string, suggestions: KPISuggestion[]) => void;
  acceptSuggestion: (orgId: string, suggestionId: string) => AcceptedKPI | null;
  dismissSuggestion: (orgId: string, suggestionId: string) => void;
  addKPI: (
    orgId: string,
    data: { title: string; key?: string; category?: string; icon?: string; source?: KPISource; sourceDetail?: string }
  ) => AcceptedKPI | null;
  removeKPI: (orgId: string, kpiId: string) => void;
  shouldSuggestNow: (orgId: string, intervalMs?: number) => boolean;
  markShown: (orgId: string) => void;
  clearForOrg: (orgId: string) => void;
}

export const useKPIStore = create<KPIState>()(
  persist(
    (set, get) => ({
      suggestionsByOrg: {},
      acceptedByOrg: {},
      dismissedByOrg: {},
      lastShownAt: {},

      addSuggestions: (orgId, suggestions) => {
        if (!orgId || suggestions.length === 0) return;
        set((state) => {
          const current = state.suggestionsByOrg[orgId] || [];
          const dismissed = new Set(state.dismissedByOrg[orgId] || []);
          const acceptedKeys = new Set(
            (state.acceptedByOrg[orgId] || []).map((k) => k.key)
          );
          const existingIds = new Set(current.map((s) => s.id));

          const fresh = suggestions.filter(
            (s) =>
              !dismissed.has(s.id) &&
              !acceptedKeys.has(s.key) &&
              !existingIds.has(s.id)
          );

          if (fresh.length === 0) return state;

          return {
            suggestionsByOrg: {
              ...state.suggestionsByOrg,
              [orgId]: [...current, ...fresh].slice(-20),
            },
            lastShownAt: {
              ...state.lastShownAt,
              [orgId]: Date.now(),
            },
          };
        });
      },

      acceptSuggestion: (orgId, suggestionId) => {
        const list = get().suggestionsByOrg[orgId] || [];
        const suggestion = list.find((s) => s.id === suggestionId);
        if (!suggestion) return null;

        const accepted: AcceptedKPI = {
          id: `kpi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          key: suggestion.key,
          title: suggestion.title,
          category: suggestion.category,
          icon: suggestion.icon,
          triggerSource: suggestion.source,
          triggerDetail: suggestion.sourceDetail,
          acceptedAt: Date.now(),
        };

        set((state) => ({
          suggestionsByOrg: {
            ...state.suggestionsByOrg,
            [orgId]: list.filter((s) => s.id !== suggestionId),
          },
          acceptedByOrg: {
            ...state.acceptedByOrg,
            [orgId]: [...(state.acceptedByOrg[orgId] || []), accepted],
          },
        }));

        return accepted;
      },

      dismissSuggestion: (orgId, suggestionId) => {
        set((state) => {
          const list = state.suggestionsByOrg[orgId] || [];
          return {
            suggestionsByOrg: {
              ...state.suggestionsByOrg,
              [orgId]: list.filter((s) => s.id !== suggestionId),
            },
            dismissedByOrg: {
              ...state.dismissedByOrg,
              [orgId]: [...(state.dismissedByOrg[orgId] || []), suggestionId],
            },
          };
        });
      },

      addKPI: (orgId, data) => {
        if (!orgId || !data?.title) return null;
        const baseTitle = String(data.title).trim().slice(0, 80);
        if (!baseTitle) return null;
        const keySource = (data.key || baseTitle)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "")
          .slice(0, 60) || `kpi_${Date.now()}`;

        let key = keySource;
        let suffix = 1;
        const existing = get().acceptedByOrg[orgId] || [];
        const used = new Set(existing.map((k) => k.key));
        while (used.has(key)) {
          suffix += 1;
          key = `${keySource}_${suffix}`;
        }

        const accepted: AcceptedKPI = {
          id: `kpi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          key,
          title: baseTitle,
          category: data.category,
          icon: data.icon,
          triggerSource: data.source || "ai",
          triggerDetail: data.sourceDetail,
          acceptedAt: Date.now(),
        };

        set((state) => ({
          acceptedByOrg: {
            ...state.acceptedByOrg,
            [orgId]: [...(state.acceptedByOrg[orgId] || []), accepted],
          },
        }));

        return accepted;
      },

      removeKPI: (orgId, kpiId) => {
        set((state) => ({
          acceptedByOrg: {
            ...state.acceptedByOrg,
            [orgId]: (state.acceptedByOrg[orgId] || []).filter(
              (k) => k.id !== kpiId
            ),
          },
        }));
      },

      shouldSuggestNow: (orgId, intervalMs = 5 * 60 * 1000) => {
        const last = get().lastShownAt[orgId];
        if (!last) return true;
        return Date.now() - last >= intervalMs;
      },

      markShown: (orgId) => {
        set((state) => ({
          lastShownAt: { ...state.lastShownAt, [orgId]: Date.now() },
        }));
      },

      clearForOrg: (orgId) => {
        set((state) => {
          const next = { ...state };
          delete next.suggestionsByOrg[orgId];
          delete next.acceptedByOrg[orgId];
          delete next.dismissedByOrg[orgId];
          delete next.lastShownAt[orgId];
          return next;
        });
      },
    }),
    { name: STORAGE_KEY }
  )
);
