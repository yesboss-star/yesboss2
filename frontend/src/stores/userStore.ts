import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UserPreferences {
  language: string;
  timezone: string;
  dateFormat: string;
  timeFormat: "12h" | "24h";
  emailNotifications: boolean;
  pushNotifications: boolean;
  weeklyDigest: boolean;
  aiAssistantEnabled: boolean;
  dashboardLayout: "grid" | "list";
  compactMode: boolean;
}

interface UserState {
  preferences: UserPreferences;
  onboardingComplete: boolean;
  lastLoginAt: string | null;
  updatePreferences: (updates: Partial<UserPreferences>) => void;
  setOnboardingComplete: (complete: boolean) => void;
  setLastLoginAt: (date: string) => void;
  resetPreferences: () => void;
}

const defaultPreferences: UserPreferences = {
  language: "en",
  timezone: "UTC",
  dateFormat: "MM/DD/YYYY",
  timeFormat: "12h",
  emailNotifications: true,
  pushNotifications: true,
  weeklyDigest: true,
  aiAssistantEnabled: true,
  dashboardLayout: "grid",
  compactMode: false,
};

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      preferences: defaultPreferences,
      onboardingComplete: false,
      lastLoginAt: null,

      updatePreferences: (updates) =>
        set((state) => ({
          preferences: { ...state.preferences, ...updates },
        })),

      setOnboardingComplete: (complete) =>
        set({ onboardingComplete: complete }),

      setLastLoginAt: (date) => set({ lastLoginAt: date }),

      resetPreferences: () =>
        set({ preferences: defaultPreferences }),
    }),
    {
      name: "yesboss-user",
    }
  )
);
