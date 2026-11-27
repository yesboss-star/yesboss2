"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, BarChart3, Bell, CalendarCheck, CheckCheck, CheckCircle2, ChevronRight, ClipboardList, Info, Loader2, MessageCircle, Send, Target, Trash2,
} from "lucide-react";
import { useNotificationStore, Notification } from "@/stores/notificationStore";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

/** Round icon and its colour for each kind of alert (the colours come from the chosen look). */
const KINDS: Record<string, { icon: React.ElementType; colour: string }> = {
  task_assigned: { icon: ClipboardList, colour: "var(--c-blue)" },
  task_status: { icon: ClipboardList, colour: "var(--c-blue)" },
  task_approved: { icon: CheckCircle2, colour: "var(--c-green)" },
  task_completed: { icon: CheckCircle2, colour: "var(--c-green)" },
  goal_assigned: { icon: Target, colour: "var(--c-purple)" },
  goal_status: { icon: Target, colour: "var(--c-purple)" },
  goal_created: { icon: Target, colour: "var(--c-purple)" },
  delegation: { icon: Send, colour: "var(--c-orange)" },
  message: { icon: MessageCircle, colour: "var(--c-pink)" },
  alert: { icon: AlertTriangle, colour: "var(--c-coral)" },
  info: { icon: Info, colour: "var(--c-green)" },
};
const FALLBACK = { icon: Bell, colour: "var(--c-blue)" };

/** The server sends times without a "Z" sometimes; they are always UTC. */
function toDate(value: string): Date {
  return new Date(value.endsWith("Z") || value.includes("+") ? value : value + "Z");
}

function ago(value: string): string {
  const mins = Math.floor((Date.now() - toDate(value).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;
  return toDate(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function dayLabel(value: string): string {
  const date = toDate(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** Only addresses inside YesBoss are opened. */
function internalPath(link?: string): string | null {
  if (!link) return null;
  if (link.startsWith("/") && !link.startsWith("//")) return link;
  try {
    const url = new URL(link);
    return url.origin === window.location.origin ? url.pathname + url.search + url.hash : null;
  } catch {
    return null;
  }
}

export default function AlertsPage() {
  const router = useRouter();
  const { role } = useAuth();
  const { notifications, unreadCount, loading, fetchNotifications, markAsRead, markAllAsRead, deleteNotification } = useNotificationStore();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    void fetchNotifications({ limit: 100 });
  }, [fetchNotifications]);

  const shown = useMemo(() => (filter === "unread" ? notifications.filter((n) => !n.read) : notifications), [notifications, filter]);

  const days = useMemo(() => {
    const groups = new Map<string, Notification[]>();
    for (const n of shown) {
      const label = dayLabel(n.created_at);
      groups.set(label, [...(groups.get(label) || []), n]);
    }
    return [...groups.entries()];
  }, [shown]);

  const open = (n: Notification) => {
    if (!n.read) void markAsRead(n.id);
    const path = internalPath(n.link);
    if (path) router.push(path);
  };

  const clearAll = async () => {
    setClearing(true);
    try {
      await Promise.all(notifications.map((n) => deleteNotification(n.id)));
      await fetchNotifications({ limit: 100 }); // anything past the first 100 is still there
    } finally {
      setClearing(false);
      setConfirmClear(false);
    }
  };

  // Only the very first load shows the loading state. Background refreshes must not blank the list.
  const firstLoad = loading && notifications.length === 0;
  const isEmployee = role === "employee";

  const tiles = [
    { href: "/dashboard/reports", title: "Reports", sub: isEmployee ? "Your weekly report" : "Goals, tasks, people", colour: "var(--c-yellow)", icon: BarChart3 },
    { href: "/dashboard/review", title: "Weekly review", sub: "What got done", colour: "var(--c-purple)", icon: CalendarCheck },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <h1 className="text-2xl font-extrabold">Alerts</h1>
        <p className="mt-0.5 text-sm font-semibold text-text-muted">{unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}</p>
      </div>

      {/* the two real tools: the report maker and the weekly review */}
      <div className="mb-5 grid grid-cols-2 gap-3">
        {tiles.map(({ href, title, sub, colour, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex cursor-pointer flex-col gap-3 rounded-2xl border-2 border-outline p-3.5 text-[#14110f] shadow-[3px_3px_0_var(--shadow-hard)] transition-transform active:scale-[0.97]"
            style={{ background: colour }}
          >
            <span className="grid h-10 w-10 place-items-center rounded-full border-2 border-[#14110f] bg-white/70">
              <Icon className="h-5 w-5" />
            </span>
            <span>
              <span className="flex items-center justify-between gap-1 text-[15px] font-extrabold leading-tight">
                {title}
                <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              </span>
              <span className="mt-0.5 block text-xs font-semibold opacity-75">{sub}</span>
            </span>
          </Link>
        ))}
      </div>

      {/* All / Unread, and the two bulk actions */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border-2 border-outline bg-surface p-1" role="tablist" aria-label="Show alerts">
          {([
            ["all", "All", notifications.length],
            ["unread", "Unread", unreadCount],
          ] as const).map(([id, label, count]) => {
            const active = filter === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(id)}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1 text-sm font-bold transition-all duration-200 active:scale-95",
                  active ? "bg-highlight text-on-highlight" : "text-text-muted"
                )}
              >
                {label}
                <span className={cn("text-xs", active ? "opacity-80" : "opacity-70")}>{count > 99 ? "99+" : count}</span>
              </button>
            );
          })}
        </div>
        {notifications.length > 0 && (
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllAsRead()}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 border-outline bg-surface px-3 py-1.5 text-xs font-bold transition-transform active:scale-95"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 border-outline/40 px-3 py-1.5 text-xs font-bold text-text-muted transition-transform active:scale-95"
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear all
            </button>
          </div>
        )}
      </div>

      {confirmClear && (
        <div role="alertdialog" aria-label="Clear all alerts" className="mb-4 rounded-2xl border-2 border-rose-500/50 bg-surface p-4">
          <p className="text-sm font-extrabold">Delete all {notifications.length} alerts?</p>
          <p className="mt-0.5 text-sm font-semibold text-text-muted">This can&apos;t be undone.</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void clearAll()}
              disabled={clearing}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 border-outline bg-[var(--c-coral)] px-4 py-1.5 text-sm font-extrabold text-[#14110f] transition-transform active:scale-95 disabled:opacity-60"
            >
              {clearing && <Loader2 className="h-4 w-4 animate-spin" />} Delete all
            </button>
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              disabled={clearing}
              className="cursor-pointer rounded-full border-2 border-outline/40 px-4 py-1.5 text-sm font-bold text-text-muted transition-transform active:scale-95"
            >
              Keep them
            </button>
          </div>
        </div>
      )}

      {firstLoad ? (
        <div className="space-y-3" aria-label="Loading alerts">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl border-2 border-outline/30 bg-surface" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border-2 border-dashed border-outline/40 px-6 py-14 text-center">
          <span className="mb-3 grid h-16 w-16 place-items-center rounded-full bg-highlight/15 text-highlight">
            <Bell className="h-8 w-8" />
          </span>
          <p className="text-lg font-extrabold">{notifications.length > 0 ? "You are all caught up" : "No alerts yet"}</p>
          <p className="mt-1 text-sm font-semibold text-text-muted">New task and goal updates show up here.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {days.map(([label, items]) => (
            <section key={label}>
              <h2 className="mb-2 px-1 text-xs font-extrabold uppercase tracking-wider text-text-muted">{label}</h2>
              <ul className="divide-y-2 divide-outline/15 overflow-hidden rounded-2xl border-2 border-outline bg-surface shadow-[3px_3px_0_var(--shadow-hard)]">
                {items.map((n) => {
                  const kind = KINDS[n.type] || FALLBACK;
                  const Icon = kind.icon;
                  const goes = !!internalPath(n.link);
                  return (
                    <li key={n.id} className="flex items-start gap-1 pr-1">
                      <button
                        type="button"
                        onClick={() => open(n)}
                        className={cn("flex min-w-0 flex-1 items-start gap-3 p-3.5 text-left", goes || !n.read ? "cursor-pointer" : "cursor-default")}
                        aria-label={`${n.title}. ${n.read ? "" : "Unread. "}${goes ? "Opens the details." : ""}`}
                      >
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-outline text-[#14110f]" style={{ background: kind.colour }}>
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start gap-2">
                            <span className={cn("flex-1 text-sm leading-snug", n.read ? "font-semibold" : "font-extrabold")}>{n.title}</span>
                            {!n.read && <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />}
                          </span>
                          {n.message && <span className="mt-0.5 line-clamp-3 block text-sm text-text-muted">{n.message}</span>}
                          <span className="mt-1 block text-xs font-semibold text-text-muted/80">{ago(n.created_at)}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteNotification(n.id)}
                        className="mt-2 grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-text-muted transition-colors hover:bg-rose-500/10 hover:text-rose-400 active:scale-95"
                        aria-label="Delete alert"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
