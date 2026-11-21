"use client";

import { useState } from "react";
import { ArrowRight, Check, Flag, Link2, Loader2, Users } from "lucide-react";
import { useTaskStore, Task } from "@/stores/taskStore";
import { cn } from "@/lib/utils";

const AVATAR_COLOURS = ["#FFD93D", "#B6F36B", "#7CC8FF", "#FF9FD2", "#C9A7FF", "#FFB36B"];

/** Whole days from today to the due date (negative = late). null when there is no usable date. */
export function daysUntil(due?: string): number | null {
  if (!due) return null;
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

export function isFinished(task: Task) {
  return task.status === "completed" || task.status === "approved";
}

/** Late or due today and not finished. */
export function needsAttention(task: Task) {
  const days = daysUntil(task.due_date);
  return !isFinished(task) && days !== null && days <= 0;
}

/** The email of whoever the task is assigned to first, or "" when nobody owns it yet. */
export function firstAssignee(task: Task): string {
  const raw = (Array.isArray(task.assignee_id) && task.assignee_id[0]) || task.assignee_email || "";
  return String(raw).trim();
}

function dueChip(task: Task): { label: string; tone: "late" | "today" | "plain" } | null {
  const days = daysUntil(task.due_date);
  if (days === null || isFinished(task)) return null;
  if (days < 0) return { label: days === -1 ? "1 day late" : `${-days} days late`, tone: "late" };
  if (days === 0) return { label: "Due today", tone: "today" };
  if (days === 1) return { label: "Tomorrow", tone: "plain" };
  if (days < 7) return { label: `In ${days} days`, tone: "plain" };
  return { label: new Date(task.due_date as string).toLocaleDateString(undefined, { day: "numeric", month: "short" }), tone: "plain" };
}

const STRIPE: Record<string, string> = {
  urgent: "border-l-[#FF7A6B]",
  high: "border-l-[#FF7A6B]",
  medium: "border-l-[#FFD93D]",
  low: "border-l-[#B6F36B]",
};

export interface BoardMember {
  email: string;
  full_name: string;
}

interface Props {
  task: Task;
  /** First name or email prefix of whoever the task is assigned to (shown to people who cannot reassign). */
  assignee: string;
  /** Everyone in the organisation, for the owner's assignee list. */
  members: BoardMember[];
  isOwner: boolean;
  onError: (message: string) => void;
  /** Opens the task's side panel. */
  onOpen: (taskId: string) => void;
  /** Departments to show as tags (the task's own, or its assignee's, plus those of people it is shared with). */
  departments?: string[];
  /** Title of the goal this task belongs to, when the viewer is allowed to see that goal. */
  goalTitle?: string;
  /** "Shared with Asha +1" / "You review this", or null when the task is not shared. */
  sharedLabel?: string | null;
}

export default function TaskBoardCard({ task, assignee, members, isOwner, onError, onOpen, departments = [], goalTitle, sharedLabel }: Props) {
  const { completeTask, approveTask, updateTask } = useTaskStore();
  const [busy, setBusy] = useState(false);

  const awaiting = task.status === "completed";
  const approved = task.status === "approved";
  const started = task.status === "in_progress";
  const chip = dueChip(task);
  const colour = AVATAR_COLOURS[(assignee.charCodeAt(0) || 0) % AVATAR_COLOURS.length];
  const deps = task.dependencies?.length || 0;
  const current = firstAssignee(task);

  /** Runs one change, showing the spinner and reporting a failure instead of throwing it. */
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await work();
    } catch (err) {
      onError((err as Error).message || "Could not update this task.");
    } finally {
      setBusy(false);
    }
  };

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const open = () => onOpen(task.id);

  // Finished work is approved by the owner with the button; anything else is completed with the tick.
  const showTick = !awaiting;

  const options = current && !members.some((m) => m.email.toLowerCase() === current.toLowerCase()) ? [{ email: current, full_name: current }, ...members] : members;

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`Open ${task.title}`}
      onClick={open}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          open();
        }
      }}
      className={cn(
        "relative cursor-pointer rounded-2xl border-[2.5px] border-l-[9px] border-outline bg-surface p-4",
        "shadow-[3px_3px_0_var(--shadow-hard)] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_var(--shadow-hard)]",
        STRIPE[task.priority] || "border-l-border-light"
      )}
    >
      {showTick && (
        <button
          type="button"
          onClick={(e) => {
            stop(e);
            if (!approved) void run(() => completeTask(task.id));
          }}
          disabled={busy || approved}
          aria-label={approved ? "Approved" : "Mark as done"}
          title={approved ? "Approved" : "Mark as done"}
          className={cn(
            "absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full border-[2.5px] border-outline transition-colors",
            approved ? "bg-[#B6F36B] text-[#111] cursor-default" : "cursor-pointer text-transparent hover:bg-[#B6F36B] hover:text-[#111]"
          )}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin text-foreground" /> : <Check className="h-4 w-4" />}
        </button>
      )}

      {awaiting && (
        <p className="mb-2 inline-block rounded-lg border-2 border-[#111] bg-[#FFD93D] px-2.5 py-0.5 text-xs font-extrabold text-[#111]">
          {isOwner ? "Needs your OK" : "Waiting for approval"}
        </p>
      )}

      <h3 className={cn("text-base font-bold leading-snug", showTick && "pr-10", approved && "line-through opacity-60")}>{task.title}</h3>

      {(departments.length > 0 || goalTitle || sharedLabel) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {goalTitle && (
            <span
              title={`Goal: ${goalTitle}`}
              className="inline-flex max-w-full items-center gap-1 rounded-full border-2 border-outline bg-[#FFD93D] px-2 py-0.5 text-[11px] font-bold leading-tight text-[#111]"
            >
              <Flag className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{goalTitle}</span>
            </span>
          )}
          {departments.slice(0, 2).map((d) => (
            <span key={d} className="rounded-full border-2 border-outline bg-surface-light px-2 py-0.5 text-[11px] font-bold leading-tight">
              {d}
            </span>
          ))}
          {departments.length > 2 && (
            <span title={departments.slice(2).join(", ")} className="rounded-full border-2 border-outline px-2 py-0.5 text-[11px] font-bold leading-tight text-text-muted">
              +{departments.length - 2}
            </span>
          )}
          {sharedLabel && (
            <span className="inline-flex max-w-[11rem] items-center gap-1 rounded-full border-2 border-outline bg-surface-light px-2 py-0.5 text-[11px] font-bold leading-tight">
              <Users className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{sharedLabel}</span>
            </span>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        {isOwner && !approved ? (
          // The owner can hand the task to anyone, or take it back to "Nobody yet"
          <select
            value={current}
            disabled={busy}
            aria-label={`Assign "${task.title}"`}
            onClick={stop}
            onKeyDown={stop}
            onChange={(e) => {
              const email = e.target.value;
              void run(() => updateTask(task.id, { assignee_id: email ? [email] : [] }));
            }}
            className={cn(
              "mr-auto max-w-[11rem] cursor-pointer truncate rounded-full border-2 border-outline py-0.5 pl-2.5 pr-1 text-sm font-bold disabled:opacity-60 [&>option]:bg-surface [&>option]:text-foreground",
              current ? "bg-surface text-foreground" : "bg-[#FF9FD2] text-[#111]"
            )}
          >
            <option value="">Nobody yet</option>
            {options.map((m) => (
              <option key={m.email} value={m.email}>
                {m.full_name || m.email}
              </option>
            ))}
          </select>
        ) : (
          <span className="mr-auto inline-flex items-center gap-2 text-sm font-semibold">
            <span
              className="grid h-6 w-6 place-items-center rounded-full border-2 border-outline text-[10px] font-bold text-[#111]"
              style={{ background: colour }}
              aria-hidden
            >
              {(assignee[0] || "?").toUpperCase()}
            </span>
            {assignee || "Nobody yet"}
          </span>
        )}
        {deps > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-text-muted" title="Depends on other tasks">
            <Link2 className="h-3.5 w-3.5" />
            {deps}
          </span>
        )}
        {chip && (
          <span
            className={cn(
              "rounded-full border-2 border-outline px-2.5 py-0.5 text-xs font-extrabold",
              chip.tone === "late" && "bg-[#FF7A6B] text-[#111]",
              chip.tone === "today" && "bg-[#FFD93D] text-[#111]",
              chip.tone === "plain" && "bg-surface text-foreground"
            )}
          >
            {chip.label}
          </span>
        )}
      </div>

      {!approved && !awaiting && !started && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              stop(e);
              void run(() => updateTask(task.id, { status: "in_progress" }));
            }}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 border-outline bg-surface px-3.5 py-1 text-sm font-bold text-foreground transition-all hover:-translate-x-px hover:-translate-y-px disabled:opacity-60"
          >
            Start <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {awaiting && isOwner && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              stop(e);
              void run(() => approveTask(task.id));
            }}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 border-outline bg-foreground px-3.5 py-1 text-sm font-bold text-background transition-all hover:-translate-x-px hover:-translate-y-px disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Approve <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </article>
  );
}
