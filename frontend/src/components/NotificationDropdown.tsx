"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Bell, CheckCheck, Trash2, X, Loader2, ExternalLink } from "lucide-react";
import { useNotificationStore, Notification } from "@/stores/notificationStore";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui";

const typeIcons: Record<string, string> = {
  task_assigned: "📋",
  task_status: "🔄",
  task_approved: "✅",
  task_completed: "✔️",
  goal_assigned: "🎯",
  goal_status: "📊",
  goal_created: "✨",
  delegation: "📨",
  message: "💬",
  alert: "⚠️",
  info: "ℹ️",
};

const typeColors: Record<string, string> = {
  task_assigned: "border-l-blue-500",
  task_status: "border-l-yellow-500",
  task_approved: "border-l-green-500",
  task_completed: "border-l-emerald-500",
  goal_assigned: "border-l-purple-500",
  goal_status: "border-l-indigo-500",
  delegation: "border-l-orange-500",
  message: "border-l-cyan-500",
  alert: "border-l-red-500",
  info: "border-l-gray-500",
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr.endsWith("Z") || dateStr.endsWith("+00:00") ? dateStr : dateStr + "Z").getTime();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const [initialFetchDone, setInitialFetchDone] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, fetchNotifications, markAsRead, markAllAsRead, loading } = useNotificationStore();

  useEffect(() => {
    if (!initialFetchDone) {
      fetchNotifications({ limit: 20 });
      setInitialFetchDone(true);
    }
  }, [fetchNotifications, initialFetchDone]);

  useEffect(() => {
    if (open) {
      fetchNotifications({ limit: 20 });
    }
  }, [open, fetchNotifications]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-surface text-text-muted hover:text-foreground transition-colors cursor-pointer"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-2xl border border-border bg-surface shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold">Notifications</h3>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  onClick={() => markAllAsRead()}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary-light transition-colors cursor-pointer"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Mark all read
                </button>
              )}
              <Link
                href="/dashboard/notifications"
                onClick={() => setOpen(false)}
                className="text-xs text-text-muted hover:text-foreground transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
              <button
                onClick={() => setOpen(false)}
                className="text-text-muted hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-text-muted">
                <Bell className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              notifications.slice(0, 10).map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkRead={markAsRead}
                  onClose={() => setOpen(false)}
                />
              ))
            )}
          </div>

          {notifications.length > 10 && (
            <Link
              href="/dashboard/notifications"
              onClick={() => setOpen(false)}
              className="block px-4 py-3 text-center text-sm text-primary hover:bg-surface-light border-t border-border transition-colors"
            >
              View all notifications
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationItem({
  notification,
  onMarkRead,
  onClose,
}: {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onClose: () => void;
}) {
  const content = (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3 border-l-2 transition-colors hover:bg-surface-light cursor-pointer",
        typeColors[notification.type] || "border-l-border",
        !notification.read && "bg-primary/5"
      )}
    >
      <span className="text-lg mt-0.5 flex-shrink-0">
        {typeIcons[notification.type] || "🔔"}
      </span>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm", !notification.read && "font-semibold")}>
          {notification.title}
        </p>
        <p className="text-xs text-text-muted mt-0.5 line-clamp-2">
          {notification.message}
        </p>
        <p className="text-[10px] text-text-muted/60 mt-1">
          {timeAgo(notification.created_at)}
        </p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {!notification.read && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMarkRead(notification.id);
            }}
            className="p-1 rounded hover:bg-surface-light text-text-muted hover:text-foreground transition-colors cursor-pointer"
            title="Mark as read"
          >
            <CheckCheck className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );

  if (notification.link) {
    return (
      <Link href={notification.link} onClick={onClose}>
        {content}
      </Link>
    );
  }

  return content;
}
