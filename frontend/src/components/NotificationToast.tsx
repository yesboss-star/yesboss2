"use client";

import { useEffect, useState, useCallback } from "react";
import { useUIStore } from "@/stores/uiStore";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const colors = {
  success: "border-l-emerald-500 bg-emerald-500/10",
  error: "border-l-red-500 bg-red-500/10",
  warning: "border-l-amber-500 bg-amber-500/10",
  info: "border-l-blue-500 bg-blue-500/10",
};

const textColors = {
  success: "text-emerald-400",
  error: "text-red-400",
  warning: "text-amber-400",
  info: "text-blue-400",
};

interface ToastItem {
  id: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
}

export function NotificationToast() {
  const uiNotifications = useUIStore((s) => s.notifications);
  const markRead = useUIStore((s) => s.markNotificationRead);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    if (uiNotifications.length === 0) return;
    const unread = uiNotifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    const latest = unread[0];
    if (toasts.some((t) => t.id === latest.id)) return;
    const item: ToastItem = {
      id: latest.id,
      type: latest.type,
      title: latest.title,
      message: latest.message,
    };
    setToasts((prev) => [item, ...prev].slice(0, 3));
  }, [uiNotifications]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    markRead(id);
  }, [markRead]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) =>
      setTimeout(() => dismiss(t.id), 4000)
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm pointer-events-auto">
      {toasts.map((toast) => {
        const Icon = icons[toast.type];
        return (
          <div
            key={toast.id}
            className={`flex items-start gap-3 p-4 rounded-xl border border-border shadow-2xl backdrop-blur-xl pointer-events-auto ${colors[toast.type]} animate-in slide-in-from-right-2 transition-all`}
          >
            <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${textColors[toast.type]}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{toast.title}</p>
              <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{toast.message}</p>
            </div>
            <button
              onClick={() => dismiss(toast.id)}
              className="p-1 rounded-lg hover:bg-surface-light transition-colors flex-shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4 text-text-muted" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
