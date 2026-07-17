import { create } from "zustand";
import { persist } from "zustand/middleware";

interface Notification {
  id: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
  read: boolean;
  timestamp: string;
}

interface UIState {
  sidebarOpen: boolean;
  mobileSidebarOpen: boolean;
  theme: "dark" | "light" | "system";
  notifications: Notification[];
  unreadCount: number;
  breadcrumbs: { label: string; href?: string }[];
  activeModal: string | null;
  searchOpen: boolean;
  commandPaletteOpen: boolean;

  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleMobileSidebar: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setTheme: (theme: "dark" | "light" | "system") => void;
  addNotification: (notification: Omit<Notification, "id" | "read" | "timestamp">) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;
  setBreadcrumbs: (breadcrumbs: { label: string; href?: string }[]) => void;
  setActiveModal: (modal: string | null) => void;
  setSearchOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
  sidebarOpen: true,
  mobileSidebarOpen: false,
  theme: "dark",
  notifications: [],
  unreadCount: 0,
  breadcrumbs: [],
  activeModal: null,
  searchOpen: false,
  commandPaletteOpen: false,

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleMobileSidebar: () =>
    set((state) => ({ mobileSidebarOpen: !state.mobileSidebarOpen })),
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
  setTheme: (theme) => set({ theme }),

  addNotification: (notification) =>
    set((state) => ({
      notifications: [
        {
          ...notification,
          id: Math.random().toString(36).substring(2, 9),
          read: false,
          timestamp: new Date().toISOString(),
        },
        ...state.notifications,
      ],
      unreadCount: state.unreadCount + 1,
    })),

  markNotificationRead: (id) =>
    set((state) => {
      const wasUnread = !state.notifications.find((n) => n.id === id)?.read;
      return {
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, read: true } : n
        ),
        unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
      };
    }),

  markAllNotificationsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),

  clearNotifications: () => set({ notifications: [], unreadCount: 0 }),

  setBreadcrumbs: (breadcrumbs) => set({ breadcrumbs }),
  setActiveModal: (modal) => set({ activeModal: modal }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
    }),
    {
      name: "yesboss-ui",
      partialize: (state) => ({ theme: state.theme }),
    }
  )
);
