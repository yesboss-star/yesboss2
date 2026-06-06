"use client";

import { useEffect, useRef, useCallback } from "react";
import { useNotificationStore } from "@/stores/notificationStore";
import { useUIStore } from "@/stores/uiStore";
import { useTaskStore } from "@/stores/taskStore";
import { useGoalStore } from "@/stores/goalStore";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useAuth } from "@/contexts/AuthContext";

export function NotificationWatcher({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const organization = useOrganizationStore((s) => s.organization);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<any>(null);

  const addNotification = useNotificationStore((s) => s.addNotification);
  const refreshUnreadCount = useNotificationStore((s) => s.refreshUnreadCount);
  const addUiNotification = useUIStore((s) => s.addNotification);
  const fetchNotifications = useNotificationStore((s) => s.fetchNotifications);

  const updateTaskFromWs = useTaskStore((s) => s.updateTaskFromWs);
  const addTaskFromWs = useTaskStore((s) => s.addTaskFromWs);
  const updateGoalFromWs = useGoalStore((s) => s.updateGoalFromWs);
  const addGoalFromWs = useGoalStore((s) => s.addGoalFromWs);

  const connect = useCallback(() => {
    const userId = user?.uid || user?.id;
    const orgId = organization?.id;
    if (!userId || !orgId) return;

    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    const rawUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1").replace(/\/api\/v1\/?$/, "");
    const baseWsUrl = rawUrl.replace(/^http/, "ws");
    const wsUrl = `${baseWsUrl}/ws/${encodeURIComponent(orgId)}?user_id=${encodeURIComponent(userId)}`;

    try {
      const ws = new WebSocket(wsUrl);
      let closed = false;

      ws.onopen = () => {
        closed = false;
        retryRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const data = msg.data;

          switch (msg.type) {
            case "notification":
              if (data) {
                const notif = { ...data, id: data._id || data.id };
                addNotification(notif);
                addUiNotification({ type: "info", title: notif.title, message: notif.message });
              }
              break;
            case "task_created":
              if (data) addTaskFromWs(data);
              break;
            case "task_updated":
            case "task_update":
              if (data) updateTaskFromWs(data);
              break;
            case "task_assigned":
              if (data) addTaskFromWs(data);
              break;
            case "goal_created":
              if (data) addGoalFromWs(data);
              break;
            case "goal_updated":
              if (data) updateGoalFromWs(data);
              break;
          }
        } catch {}
      };

      ws.onclose = () => {
        if (closed) return;
        closed = true;
        const delay = Math.min(1000 * 2 ** retryRef.current, 15000);
        retryRef.current += 1;
        timerRef.current = setTimeout(() => connect(), delay);
      };

      ws.onerror = () => {};

      wsRef.current = ws;
    } catch {}
  }, [user, organization, addNotification, addUiNotification, addTaskFromWs, updateTaskFromWs, addGoalFromWs, updateGoalFromWs]);

  useEffect(() => {
    fetchNotifications({ limit: 50 });
    refreshUnreadCount();
    connect();

    const pollInterval = setInterval(() => {
      refreshUnreadCount();
    }, 30000);

    return () => {
      clearInterval(pollInterval);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect, fetchNotifications, refreshUnreadCount]);

  return <>{children}</>;
}
