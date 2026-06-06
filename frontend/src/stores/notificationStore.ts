import { create } from "zustand";
import { getAuthHeaders } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  user_id: string;
  organization_id: string;
  link?: string;
  actor_id?: string;
  actor_name?: string;
  metadata?: Record<string, any>;
  read: boolean;
  created_at: string;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  setNotifications: (notifications: Notification[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  fetchNotifications: (params?: { read?: boolean; type?: string; limit?: number; organization_id?: string }) => Promise<void>;
  fetchUnreadCount: () => Promise<number>;
  refreshUnreadCount: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: (organization_id?: string) => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  addNotification: (notification: Notification) => void;
}

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  error: null,

  setNotifications: (notifications) => set({ notifications }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  fetchNotifications: async (params = {}) => {
    set({ loading: true, error: null });
    try {
      const queryParams = new URLSearchParams();
      if (params.read !== undefined) queryParams.append("read", String(params.read));
      if (params.type) queryParams.append("type", params.type);
      if (params.limit) queryParams.append("limit", String(params.limit));
      if (params.organization_id) queryParams.append("organization_id", params.organization_id);

      const response = await fetch(`${API_URL}/notifications?${queryParams}`, {
        headers: { ...getAuthHeaders() },
      });
      if (!response.ok) throw new Error("Failed to fetch notifications");
      const result = await response.json();
      const notifications = (result.notifications || []).map((n: any) => ({
        ...n,
        id: n._id || n.id,
      }));
      set({ notifications, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  fetchUnreadCount: async () => {
    try {
      const response = await fetch(`${API_URL}/notifications/unread-count`, {
        headers: { ...getAuthHeaders() },
      });
      if (!response.ok) return 0;
      const result = await response.json();
      return result.count || 0;
    } catch {
      return 0;
    }
  },

  refreshUnreadCount: async () => {
    try {
      const response = await fetch(`${API_URL}/notifications/unread-count`, {
        headers: { ...getAuthHeaders() },
      });
      if (!response.ok) return;
      const result = await response.json();
      set({ unreadCount: result.count || 0 });
    } catch {}
  },

  markAsRead: async (notificationId) => {
    try {
      await fetch(`${API_URL}/notifications/${notificationId}/read`, {
        method: "PATCH",
        headers: { ...getAuthHeaders() },
      });
      set((state) => {
        const wasUnread = !state.notifications.find((n) => n.id === notificationId)?.read;
        return {
          notifications: state.notifications.map((n) =>
            n.id === notificationId ? { ...n, read: true } : n
          ),
          unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
        };
      });
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  markAllAsRead: async (organization_id) => {
    try {
      const params = organization_id ? `?organization_id=${organization_id}` : "";
      await fetch(`${API_URL}/notifications/mark-all-read${params}`, {
        method: "POST",
        headers: { ...getAuthHeaders() },
      });
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
        unreadCount: 0,
      }));
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  deleteNotification: async (notificationId) => {
    try {
      await fetch(`${API_URL}/notifications/${notificationId}`, {
        method: "DELETE",
        headers: { ...getAuthHeaders() },
      });
      set((state) => {
        const wasUnread = !state.notifications.find((n) => n.id === notificationId)?.read;
        return {
          notifications: state.notifications.filter((n) => n.id !== notificationId),
          unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
        };
      });
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  addNotification: (notification) => {
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + (notification.read ? 0 : 1),
    }));
  },
}));
