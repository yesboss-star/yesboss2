"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Loader2, MessageSquare, Send, Sparkles, Trash2, Users, X } from "lucide-react";
import { useTaskStore, type Task } from "@/stores/taskStore";
import type { OrgMember } from "@/stores/orgChartStore";
import FollowupThread from "@/components/FollowupThread";
import { InlineConfirm } from "@/components/ui/InlineConfirm";
import { cn, getAuthHeaders } from "@/lib/utils";
import { assigneeEmails, isSharedWith, reviewersOf } from "@/lib/taskBoard";
import { firstAssignee } from "@/components/TaskBoardCard";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

const BASE_DEPARTMENTS = ["Engineering", "Marketing", "Sales", "Operations", "Finance", "Human Resources", "Product", "Design", "Customer Support", "R&D", "Supply Chain", "Legal"];

type Status = "pending" | "in_progress" | "completed" | "approved";
const STEPS: Status[] = ["pending", "in_progress", "completed", "approved"];
const NEXT: Record<Status, { to: Status; label: string }> = {
  pending: { to: "in_progress", label: "Start" },
  in_progress: { to: "completed", label: "Mark done" },
  completed: { to: "approved", label: "Approve" },
  approved: { to: "pending", label: "Reopen" },
};
const STEP_COLOUR: Record<Status, string> = { pending: "#FFD93D", in_progress: "#7CC8FF", completed: "#C9A7FF", approved: "#B6F36B" };

const field =
  "w-full rounded-2xl border-[2.5px] border-outline bg-surface px-4 py-2.5 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-highlight disabled:cursor-not-allowed disabled:opacity-60 [&>option]:bg-surface [&>option]:text-foreground";
const label = "mb-1 block text-[11px] font-bold uppercase tracking-widest text-text-muted";

interface Props {
  taskId: string;
  onClose: () => void;
  isOwner: boolean;
  userEmail: string;
  userId: string;
  members: OrgMember[];
  goals: { id: string; title: string }[];
}

interface Turn {
  id: number;
  role: "user" | "ai";
  text: string;
}

/** A task's side panel: progress, who/when, sharing, notes, comments and Task AI. Replaces the old separate task page. */
export default function TaskPanel({ taskId, onClose, isOwner, userEmail, userId, members, goals }: Props) {
  const { tasks, currentTask, comments, fetchTaskWithComments, updateTask, completeTask, approveTask, deleteTask, addComment } = useTaskStore();
  const panelRef = useRef<HTMLDivElement>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const task: Task | null = tasks.find((t) => t.id === taskId) ?? (currentTask?.id === taskId ? currentTask : null);

  // Load this task's comments (and the task itself when it came from a link and is not on the board).
  useEffect(() => {
    let live = true;
    void fetchTaskWithComments(taskId).finally(() => live && setLoadedId(taskId));
    return () => {
      live = false;
    };
  }, [taskId, fetchTaskWithComments]);
  const loaded = loadedId === taskId;

  // Keyboard and focus: Esc closes, focus moves into the panel and goes back to the card when it closes.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
  }, [onClose]);

  const nameOf = useMemo(() => {
    const map = new Map(members.map((m) => [m.email.toLowerCase(), (m.full_name || "").trim()]));
    return (email: string) => map.get(email.toLowerCase()) || email.split("@")[0];
  }, [members]);
  const departmentOf = (email: string) => members.find((m) => m.email.toLowerCase() === email.toLowerCase())?.department || "";

  const departments = useMemo(() => {
    const extra = members.map((m) => m.department).filter((d): d is string => !!d && !BASE_DEPARTMENTS.includes(d));
    return [...BASE_DEPARTMENTS, ...Array.from(new Set(extra))];
  }, [members]);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError((err as Error).message || "That did not work. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} aria-hidden />
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Task details"
        className="fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-hidden border-l-[2.5px] border-outline bg-background shadow-[-6px_0_0_var(--shadow-hard)] focus:outline-none sm:w-[30rem] lg:w-[34rem]"
      >
        <div className="flex items-center justify-between border-b-[2.5px] border-outline px-5 py-3">
          <h2 className="text-lg font-bold">Task</h2>
          <button type="button" onClick={onClose} aria-label="Close task" className="grid h-9 w-9 cursor-pointer place-items-center rounded-full border-2 border-outline bg-surface hover:bg-surface-light">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </aside>
    </>
  );

  if (!task) {
    return shell(
      <div className="p-8 text-center text-sm font-semibold text-text-muted">
        {loaded ? "This task is not available. It may have been deleted, or it is not shared with you." : <Loader2 className="mx-auto h-5 w-5 animate-spin" />}
      </div>
    );
  }

  const status: Status = (STEPS as string[]).includes(task.status) ? (task.status as Status) : "pending";
  const assignees = assigneeEmails(task);
  const mine = !!userEmail && assignees.includes(userEmail.toLowerCase());
  const createdByMe = !!userId && task.created_by === userId;
  const canEdit = isOwner || mine || createdByMe; // title, department, notes, sharing, delete
  const canMove = isOwner || ((mine || createdByMe) && (status === "pending" || status === "in_progress"));
  const canApprove = isOwner || (createdByMe && !mine);
  const current = firstAssignee(task);
  const people = current && !members.some((m) => m.email.toLowerCase() === current.toLowerCase()) ? [{ email: current, full_name: current }, ...members] : members;
  const goal = goals.find((g) => g.id === task.goal_id);
  const shared = reviewersOf(task);
  const shareable = members.filter((m) => !assignees.includes(m.email.toLowerCase()) && !shared.includes(m.email.toLowerCase()));
  const sharedOnly = !canEdit && isSharedWith(task, userEmail);

  const stepEnabled = (to: Status): boolean => {
    if (to === status) return false;
    if (to === "approved") return canApprove && (isOwner || status === "completed");
    if (to === "completed") return canMove;
    return status === "approved" || status === "completed" ? isOwner : canMove;
  };

  const moveTo = (to: Status) =>
    run(async () => {
      if (to === "completed") await completeTask(task.id);
      else if (to === "approved") await approveTask(task.id);
      else await updateTask(task.id, { status: to });
    });

  const patch = (data: Partial<Task>) => run(() => updateTask(task.id, data));

  const next = NEXT[status];
  const stepLabel = (s: Status) =>
    s === "pending" ? "To do" : s === "in_progress" ? "In progress" : s === "approved" ? "Approved" : isOwner ? "Waiting for your OK" : "Waiting for the owner's OK";

  const taskComments = comments.filter((c) => c.task_id === task.id);
  const sendComment = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      await addComment(task.id, text);
      setDraft("");
    } catch (err) {
      setError((err as Error).message || "Could not add the comment.");
    } finally {
      setSending(false);
    }
  };

  return shell(
    <div className="space-y-5 p-5 pb-10">
      {error && (
        <p role="alert" className="rounded-2xl border-2 border-outline bg-rose-500/10 px-4 py-2 text-sm text-rose-400">
          {error}
        </p>
      )}

      <div>
        <label htmlFor="tp-title" className={label}>
          Task
        </label>
        <input
          key={task.id + task.title}
          id="tp-title"
          defaultValue={task.title}
          disabled={!canEdit}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== task.title) void patch({ title: v });
            else e.target.value = task.title;
          }}
          className={cn(field, "text-base font-bold")}
        />
      </div>

      <ol className="grid grid-cols-4 gap-1.5" aria-label="Progress">
        {STEPS.map((s, i) => {
          const reached = i <= STEPS.indexOf(status);
          return (
            <li key={s}>
              <button
                type="button"
                disabled={busy || !stepEnabled(s)}
                onClick={() => void moveTo(s)}
                aria-current={s === status ? "step" : undefined}
                className={cn(
                  "h-full w-full rounded-xl border-2 border-outline px-1 py-2 text-center text-[11px] font-bold leading-tight enabled:cursor-pointer disabled:cursor-default",
                  reached ? "text-[#111]" : "bg-surface text-text-muted"
                )}
                style={reached ? { background: STEP_COLOUR[s] } : undefined}
              >
                {stepLabel(s)}
              </button>
            </li>
          );
        })}
      </ol>

      {stepEnabled(next.to) ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void moveTo(next.to)}
          className={cn(
            "inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border-[2.5px] border-outline py-3 text-base font-bold shadow-[3px_3px_0_var(--shadow-hard)] transition-all hover:-translate-x-px hover:-translate-y-px disabled:opacity-60",
            status === "completed" ? "bg-primary text-on-primary" : "bg-highlight text-on-highlight"
          )}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {next.label}
          {status !== "approved" && <ArrowRight className="h-4 w-4" />}
        </button>
      ) : (
        <p className="rounded-2xl border-2 border-dashed border-outline px-4 py-3 text-center text-sm font-bold text-text-muted">
          {status === "completed"
            ? "Finished. Waiting for the owner's OK."
            : status === "approved"
              ? "Approved by the owner."
              : sharedOnly
                ? `Shared with you. ${current ? `${nameOf(current)} and the owner` : "The owner"} can move it.`
                : current
                  ? `Assigned to ${nameOf(current)}. Only they or the owner can move it.`
                  : "Nobody owns this yet."}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="tp-who" className={label}>
            Assigned to
          </label>
          <select
            id="tp-who"
            disabled={!isOwner || busy}
            value={current}
            onChange={(e) => void patch({ assignee_id: e.target.value ? [e.target.value] : [] })}
            className={cn(field, "cursor-pointer")}
          >
            <option value="">Nobody yet</option>
            {people.map((m) => (
              <option key={m.email} value={m.email}>
                {m.full_name || m.email}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="tp-due" className={label}>
            Due
          </label>
          <input
            id="tp-due"
            type="date"
            disabled={!isOwner || busy}
            value={task.due_date?.slice(0, 10) || ""}
            onChange={(e) => e.target.value && void patch({ due_date: e.target.value })}
            className={field}
          />
        </div>
        <div>
          <label htmlFor="tp-pri" className={label}>
            Priority
          </label>
          <select id="tp-pri" disabled={!isOwner || busy} value={task.priority} onChange={(e) => void patch({ priority: e.target.value })} className={cn(field, "cursor-pointer capitalize")}>
            {["low", "medium", "high", "urgent"].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="tp-goal" className={label}>
            Goal
          </label>
          <select id="tp-goal" disabled={!isOwner || busy} value={task.goal_id || ""} onChange={(e) => void patch({ goal_id: e.target.value })} className={cn(field, "cursor-pointer")}>
            <option value="">No goal</option>
            {task.goal_id && !goal && <option value={task.goal_id}>A goal you cannot see</option>}
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="tp-dept" className={label}>
            Department
          </label>
          <select id="tp-dept" disabled={!canEdit || busy} value={task.department || ""} onChange={(e) => void patch({ department: e.target.value })} className={cn(field, "cursor-pointer")}>
            <option value="">Same as the assignee ({departmentOf(current) || "none"})</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-text-muted">A shared task also carries the department of each person it is shared with.</p>
        </div>
      </div>

      <section aria-label="Shared with">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
          <Users className="h-4 w-4" /> Shared with <span className="rounded-full border-2 border-outline px-2 text-[11px]">{shared.length}</span>
        </h3>
        {shared.length === 0 ? (
          <p className="mb-2 text-xs text-text-muted">Not shared with anyone yet. A person you add here sees this task under Shared, and can read it and comment, but not change it.</p>
        ) : (
          <ul className="mb-3 flex flex-wrap gap-2">
            {shared.map((email) => (
              <li key={email} className="inline-flex items-center gap-1.5 rounded-full border-2 border-outline bg-surface py-1 pl-3 pr-2 text-xs font-bold">
                {nameOf(email)}
                {departmentOf(email) && <span className="font-medium text-text-muted">· {departmentOf(email)}</span>}
                {canEdit && (
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`Stop sharing with ${nameOf(email)}`}
                    onClick={() => void patch({ reviewers: shared.filter((e) => e !== email) })}
                    className="grid h-5 w-5 cursor-pointer place-items-center rounded-full bg-black/10"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && shareable.length > 0 && (
          <>
            <label htmlFor="tp-share" className="sr-only">
              Share with
            </label>
            <select
              id="tp-share"
              disabled={busy}
              value=""
              onChange={(e) => e.target.value && void patch({ reviewers: [...shared, e.target.value.toLowerCase()] })}
              className={cn(field, "cursor-pointer")}
            >
              <option value="">Share with…</option>
              {shareable.map((m) => (
                <option key={m.email} value={m.email}>
                  {m.full_name || m.email}
                </option>
              ))}
            </select>
          </>
        )}
      </section>

      <div>
        <label htmlFor="tp-notes" className={label}>
          Notes
        </label>
        <textarea
          key={task.id + (task.description || "")}
          id="tp-notes"
          rows={3}
          disabled={!canEdit}
          defaultValue={task.description || ""}
          placeholder={canEdit ? "Add details" : "No notes"}
          onBlur={(e) => e.target.value !== (task.description || "") && void patch({ description: e.target.value })}
          className={cn(field, "resize-none")}
        />
      </div>

      <section aria-label="Comments">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
          <MessageSquare className="h-4 w-4" /> Comments <span className="rounded-full border-2 border-outline px-2 text-[11px]">{taskComments.length}</span>
        </h3>
        <ul className="mb-3 space-y-2">
          {taskComments.map((c) => (
            <li key={c.id} className="rounded-2xl border-2 border-outline bg-surface px-3 py-2">
              <p className="text-xs font-bold">
                {c.user_email ? nameOf(c.user_email) : "Someone"} <span className="font-medium text-text-muted">· {new Date(c.created_at).toLocaleString()}</span>
              </p>
              <p className="whitespace-pre-wrap text-sm">{c.content}</p>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void sendComment();
          }}
        >
          <label htmlFor="tp-comment" className="sr-only">
            Add a comment
          </label>
          <input id="tp-comment" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a comment" className={field} />
          <button
            type="submit"
            aria-label="Send comment"
            disabled={!draft.trim() || sending}
            className="grid h-11 w-11 flex-shrink-0 cursor-pointer place-items-center rounded-full border-2 border-outline bg-primary text-on-primary disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      </section>

      <FollowupThread taskId={task.id} />

      <TaskAI key={task.id} taskId={task.id} goalTitle={goal?.title} />

      {canEdit && (
        <div className="flex justify-end border-t-2 border-outline/30 pt-4">
          <InlineConfirm
            label="Delete task"
            warning="This removes the task and its comments."
            onConfirm={() =>
              void run(async () => {
                await deleteTask(task.id);
                onClose();
              })
            }
            trigger={(arm) => (
              <button type="button" onClick={arm} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 border-outline bg-surface px-3.5 py-1.5 text-sm font-bold text-rose-400 hover:bg-rose-500/10">
                <Trash2 className="h-4 w-4" /> Delete task
              </button>
            )}
          />
        </div>
      )}
    </div>
  );
}

/** Task AI: answers questions about this one task and its goal. It cannot change anything. */
function TaskAI({ taskId, goalTitle }: { taskId: string; goalTitle?: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, thinking]);

  const ask = async (raw: string) => {
    const question = raw.trim();
    if (!question || thinking) return;
    const history = turns.map((t) => ({ role: t.role, text: t.text }));
    setInput("");
    setProblem(null);
    setTurns((cur) => [...cur, { id: ++seq.current, role: "user", text: question }]);
    setThinking(true);
    try {
      const res = await fetch(`${API_URL}/tasks/${taskId}/ask`, {
        method: "POST",
        headers: { ...getAuthHeaders() },
        body: JSON.stringify({ question, history }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Task AI could not answer. Please try again.");
      setTurns((cur) => [...cur, { id: ++seq.current, role: "ai", text: String(body.answer || "") }]);
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setThinking(false);
    }
  };

  const quick = ["What should I do next?", goalTitle ? "Why does this matter for the goal?" : "Why does this matter?", "What could block this?", "Draft a status update"];

  return (
    <section aria-label="Task AI" className="space-y-3 rounded-[22px] border-[2.5px] border-outline bg-surface-light/60 p-3.5">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full border-2 border-outline bg-highlight text-on-highlight">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold">Task AI</h3>
          <p className="truncate text-xs text-text-muted">{goalTitle ? `Knows this task and its goal, ${goalTitle}` : "Knows this task"}</p>
        </div>
      </div>

      {turns.length > 0 && (
        <div ref={listRef} className="max-h-72 space-y-3 overflow-y-auto overscroll-contain pr-1" aria-live="polite">
          {turns.map((t) =>
            t.role === "user" ? (
              <div key={t.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-[18px] rounded-br-md border-2 border-outline bg-[#FF7A6B] px-3.5 py-2 text-sm font-bold text-[#111]">{t.text}</div>
              </div>
            ) : (
              <div key={t.id} className="flex items-start gap-2">
                <span className="mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-full border-2 border-outline bg-highlight text-on-highlight">
                  <Sparkles className="h-3 w-3" />
                </span>
                <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm leading-relaxed">{t.text}</p>
              </div>
            )
          )}
          {thinking && (
            <p className="flex items-center gap-2 pl-1 text-xs text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
            </p>
          )}
        </div>
      )}

      {problem && (
        <p role="alert" className="rounded-xl border-2 border-outline bg-rose-500/10 px-3 py-2 text-xs text-rose-400">
          {problem}
        </p>
      )}

      {turns.length === 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ask Task AI">
          {quick.map((q) => (
            <button key={q} type="button" onClick={() => void ask(q)} disabled={thinking} className="cursor-pointer rounded-full border-2 border-outline bg-surface px-3 py-1.5 text-left text-xs font-bold disabled:opacity-60">
              {q}
            </button>
          ))}
        </div>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <label htmlFor="tp-ai" className="sr-only">
          Ask Task AI
        </label>
        <input id="tp-ai" value={input} maxLength={500} onChange={(e) => setInput(e.target.value)} placeholder="Ask about this task or its goal" className={field} />
        <button
          type="submit"
          aria-label="Send to Task AI"
          disabled={!input.trim() || thinking}
          className="grid h-11 w-11 flex-shrink-0 cursor-pointer place-items-center rounded-full border-2 border-outline bg-primary text-on-primary disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
      <p className="text-[11px] text-text-muted">Task AI can read this task and its goal. It cannot change anything.</p>
    </section>
  );
}
