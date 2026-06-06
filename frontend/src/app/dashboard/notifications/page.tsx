"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useNotificationStore, Notification } from "@/stores/notificationStore";
import { Card, CardContent, Badge, Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui";
import { Bell, CheckCheck, Trash2, Loader2, ArrowLeft, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

const typeIcons: Record<string, string> = {
  task_assigned: "📋", task_status: "🔄", task_approved: "✅",
  task_completed: "✔️", goal_assigned: "🎯", goal_status: "📊",
  goal_created: "✨", delegation: "📨", message: "💬",
  alert: "⚠️", info: "ℹ️",
};

const typeColors: Record<string, string> = {
  task_assigned: "border-l-blue-500", task_status: "border-l-yellow-500",
  task_approved: "border-l-green-500", task_completed: "border-l-emerald-500",
  goal_assigned: "border-l-purple-500", goal_status: "border-l-indigo-500",
  delegation: "border-l-orange-500", message: "border-l-cyan-500",
  alert: "border-l-red-500", info: "border-l-gray-500",
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min${mins > 1 ? "s" : ""} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function groupByDate(notifications: Notification[]): Record<string, Notification[]> {
  const groups: Record<string, Notification[]> = {};
  for (const n of notifications) {
    const date = new Date(n.created_at);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    let key: string;
    if (date.toDateString() === today.toDateString()) {
      key = "Today";
    } else if (date.toDateString() === yesterday.toDateString()) {
      key = "Yesterday";
    } else {
      key = date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    }
    if (!groups[key]) groups[key] = [];
    groups[key].push(n);
  }
  return groups;
}

export default function NotificationsPage() {
  const { notifications, unreadCount, loading, fetchNotifications, markAsRead, markAllAsRead, deleteNotification } = useNotificationStore();
  const [activeTab, setActiveTab] = useState("all");

  useEffect(() => {
    fetchNotifications({ limit: 100 });
  }, [fetchNotifications]);

  const filtered = activeTab === "unread"
    ? notifications.filter((n) => !n.read)
    : activeTab === "tasks"
    ? notifications.filter((n) => n.type.startsWith("task_"))
    : activeTab === "goals"
    ? notifications.filter((n) => n.type.startsWith("goal_"))
    : activeTab === "alerts"
    ? notifications.filter((n) => n.type === "alert")
    : activeTab !== "all"
    ? notifications.filter((n) => n.type === activeTab)
    : notifications;

  const grouped = groupByDate(filtered);

  const handleMarkRead = async (id: string) => {
    await markAsRead(id);
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead();
  };

  const handleDelete = async (id: string) => {
    await deleteNotification(id);
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Notifications</h1>
            <p className="text-sm text-text-muted mt-1">
              {unreadCount > 0
                ? `${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}`
                : "All caught up"}
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-sm font-medium cursor-pointer"
            >
              <CheckCheck className="w-4 h-4" />
              Mark all as read
            </button>
          )}
        </div>

        <Card className="border-border/50">
          <CardContent className="p-0">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="px-4 pt-4 border-b border-border">
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="unread">
                    Unread
                    {unreadCount > 0 && (
                      <Badge variant="default" className="ml-2">{unreadCount}</Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="tasks">Tasks</TabsTrigger>
                  <TabsTrigger value="goals">Goals</TabsTrigger>
                  <TabsTrigger value="alerts">Alerts</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value={activeTab} className="m-0">
                {loading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-text-muted">
                    <Bell className="w-12 h-12 mb-3 opacity-30" />
                    <p className="text-lg font-medium">No notifications</p>
                    <p className="text-sm mt-1">
                      {activeTab === "unread" ? "All caught up!" : "Nothing here yet"}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {Object.entries(grouped).map(([dateLabel, items]) => (
                      <div key={dateLabel}>
                        <div className="px-4 py-2 bg-surface/50">
                          <p className="text-xs font-medium text-text-muted uppercase tracking-wider">
                            {dateLabel}
                          </p>
                        </div>
                        {items.map((notification) => (
                          <div
                            key={notification.id}
                            className={cn(
                              "flex items-start gap-4 px-4 py-4 border-l-2 transition-colors hover:bg-surface-light group",
                              typeColors[notification.type] || "border-l-border",
                              !notification.read && "bg-primary/[0.02]"
                            )}
                          >
                            <span className="text-xl mt-0.5 flex-shrink-0">
                              {typeIcons[notification.type] || "🔔"}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className={cn("text-sm", !notification.read && "font-semibold")}>
                                    {notification.title}
                                  </p>
                                  <p className="text-sm text-text-muted mt-0.5">
                                    {notification.message}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 mt-2">
                                <span className="text-xs text-text-muted/60">
                                  {formatDate(notification.created_at)}
                                </span>
                                {notification.link && (
                                  <a
                                    href={notification.link}
                                    className="text-xs text-primary hover:underline"
                                  >
                                    View details
                                  </a>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              {!notification.read && (
                                <button
                                  onClick={() => handleMarkRead(notification.id)}
                                  className="p-2 rounded-lg hover:bg-surface-light text-text-muted hover:text-foreground transition-colors cursor-pointer"
                                  title="Mark as read"
                                >
                                  <CheckCheck className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => handleDelete(notification.id)}
                                className="p-2 rounded-lg hover:bg-surface-light text-text-muted hover:text-red-400 transition-colors cursor-pointer"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
