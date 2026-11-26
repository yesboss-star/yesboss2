"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, CalendarPlus, Check, ListChecks, Lightbulb, Loader2, Moon, Square, Sun, Volume2, X } from "lucide-react";
import { daysUntil, firstAssignee, isFinished, needsAttention } from "@/components/TaskBoardCard";
import { useJournalSpeaker } from "@/hooks/useJournalSpeaker";
import { useMyWork } from "@/hooks/useMyWork";
import { useTaskStore, type Task } from "@/stores/taskStore";
import { cn } from "@/lib/utils";

/** Where each button goes: Let's Talk opens that tool by itself (see the ?mode= link in CaptureChat). */
const TOOLS = [
  { mode: "need", label: "Need action", icon: ListChecks, colour: "#FFD93D" },
  { mode: "brainstorm", label: "Brainstorming", icon: Lightbulb, colour: "#A6E3FF" },
  { mode: "journal", label: "Journal", icon: BookOpen, colour: "#FF9FD2" },
  { mode: "book", label: "Book meeting", icon: CalendarPlus, colour: "#B8F2C8" },
] as const;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const PRIORITY = (t: Task) => ({ high: 0, medium: 1, low: 2 })[String(t.priority).toLowerCase() as "high"] ?? 1;
const byDueThenPriority = (a: Task, b: Task) => (daysUntil(a.due_date) ?? 9999) - (daysUntil(b.due_date) ?? 9999) || PRIORITY(a) - PRIORITY(b);
const sameDay = (iso: string | undefined, start: number) => (Date.parse(iso || "") || 0) >= start;
const chip = "inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border-2 border-outline font-bold shadow-[3px_3px_0_var(--shadow-hard)] transition-all hover:-translate-x-px hover:-translate-y-px active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_var(--shadow-hard)] disabled:pointer-events-none disabled:opacity-50 px-3 py-1.5 text-xs";

/** A short brief of the day (and a wrap-up in the evening), written from the person's own tasks and goals.
 *  An owner sees the whole company's tasks; anyone else sees only the tasks they are on. Every line is counted from
 *  the real tasks, so nothing is made up. "Plan tomorrow" only ever moves the person's OWN open tasks, and only when pressed. */
export default function DailyBrief({ onTool }: { onTool?: (mode: string) => void } = {}) {
  const router = useRouter();
  const { myTasks: tasks, myGoals: goals, ready, failed, retry, role, email } = useMyWork();
  const isOwner = role === "owner";
  const { updateTask } = useTaskStore();
  const speaker = useJournalSpeaker();
  const [now] = useState(() => new Date());
  const hour = now.getHours();
  const [tab, setTab] = useState<"brief" | "wrap">(hour >= 17 ? "wrap" : "brief");
  const [hidden, setHidden] = useState(false);
  const [planned, setPlanned] = useState<string[]>([]);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startOfDay = useMemo(() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [now]);

  const me = email.toLowerCase();
  const open = useMemo(() => tasks.filter((t) => !isFinished(t)).sort(byDueThenPriority), [tasks]);
  const waiting = useMemo(() => tasks.filter((t) => t.status === "completed"), [tasks]);
  const late = useMemo(() => tasks.filter(needsAttention), [tasks]);
  const unowned = useMemo(() => tasks.filter((t) => !isFinished(t) && !firstAssignee(t)), [tasks]);
  const topGoal = goals.find((g) => g.status === "active");

  const lines = (isOwner
    ? [
        waiting.length && `${plural(waiting.length, "task")} finished and waiting for your OK.`,
        late.length && `${plural(late.length, "task")} late or due today.`,
        unowned.length && `${plural(unowned.length, "open task")} with nobody on ${unowned.length === 1 ? "it" : "them"} yet.`,
        topGoal && `Your top active goal is ${topGoal.title.length > 80 ? `${topGoal.title.slice(0, 80).trimEnd()}…` : topGoal.title}.`,
      ]
    : [
        `You have ${plural(open.length, "open task")}.`,
        late.length && `${plural(late.length, "task")} late or due today.`,
        waiting.length && `${plural(waiting.length, "finished task")} waiting for your owner's OK.`,
        open[0] && `Next up: ${open[0].title}.`,
      ]
  ).filter((x): x is string => typeof x === "string" && x.length > 0);
  if (!lines.length) lines.push("Nothing needs you right now.");

  const today = (pred: (t: Task) => boolean, stamp: "updated_at" | "created_at" = "updated_at") => tasks.filter((t) => pred(t) && sameDay(t[stamp], startOfDay)).length;
  const stats: [string, number][] = [
    ...(isOwner ? [["Approved", today((t) => t.status === "approved")] as [string, number]] : []),
    ["Finished", today((t) => t.status === "completed" || (!isOwner && t.status === "approved"))],
    ["Started", today((t) => t.status === "in_progress")],
    ["Created", today(() => true, "created_at")],
  ];

  // tomorrow's top three: the person's own open tasks that are not already due tomorrow
  const mine = useMemo(() => open.filter((t) => me && firstAssignee(t).toLowerCase() === me && daysUntil(t.due_date) !== 1).slice(0, 3), [open, me]);

  const title = tab === "brief" ? (hour < 12 ? "Morning brief" : "Today's brief") : "End-of-day wrap-up";
  const speaking = speaker.activeId === "daily-brief" && speaker.status !== "idle";
  const listen = () => void speaker.toggle("daily-brief", `${title}. ${lines.join(" ")}`, "en-IN");

  const planTomorrow = async () => {
    setPlanning(true);
    setError(null);
    const tomorrow = new Date(startOfDay + 86400000);
    const due = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    try {
      for (const t of mine) await updateTask(t.id, { due_date: due });
      setPlanned(mine.map((t) => t.id));
    } catch (err) {
      setError((err as Error).message || "Could not plan tomorrow. Please try again.");
    } finally {
      setPlanning(false);
    }
  };

  // wait until the role and the first read of tasks are known, so an owner never sees the employee wording or "nothing needs you" by mistake
  if (hidden || !role) return null;
  if (!ready) {
    // still loading shows nothing; a read that kept failing says so, rather than leaving a gap nobody can explain
    return failed ? (
      <section aria-label="Today's brief" className="flex flex-wrap items-center gap-3 rounded-[24px] border-[2.5px] border-outline bg-surface p-4 shadow-[4px_4px_0_var(--shadow-hard)]">
        <p className="mr-auto text-sm font-semibold">I couldn&apos;t load your tasks just now, so there is no brief yet.</p>
        <button type="button" onClick={retry} className={cn(chip, "bg-highlight text-on-highlight")}>
          Try again
        </button>
      </section>
    ) : null;
  }

  const slipped = late.length ? `${plural(late.length, "task")} slipped: ${late.slice(0, 2).map((t) => t.title).join(", ")}${late.length > 2 ? " and more" : ""}.` : "Nothing slipped today.";

  return (
    <section aria-label={title} className="rounded-[24px] border-[2.5px] border-outline bg-surface p-4 shadow-[4px_4px_0_var(--shadow-hard)]">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border-2 border-outline bg-[#FFD93D] text-[#111]">
          {tab === "brief" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </span>
        <h2 className="mr-auto min-w-0 truncate text-base font-bold">{title}</h2>
        <div role="tablist" aria-label="Brief or wrap-up" className="flex flex-shrink-0 rounded-full border-2 border-outline p-0.5">
          {([["brief", "Brief"], ["wrap", "Wrap-up"]] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn("cursor-pointer whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold", tab === id ? "bg-highlight text-on-highlight" : "text-text-muted")}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setHidden(true)} aria-label="Hide this card" className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-text-muted hover:bg-surface-light">
          <X className="h-4 w-4" />
        </button>
      </div>

      {tab === "brief" ? (
        <>
          <ul className="space-y-1.5 text-sm font-semibold">
            {lines.map((line) => (
              <li key={line} className="flex items-start gap-2">
                <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full border border-outline bg-highlight" />
                {line}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={listen} className={cn(chip, "bg-surface")}>
              {speaker.activeId === "daily-brief" && speaker.status === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : speaking ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              {speaking ? "Stop" : "Listen"}
            </button>
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <div className={cn("grid grid-cols-2 gap-2", stats.length > 3 && "sm:grid-cols-4")}>
            {stats.map(([label, value]) => (
              <div key={label} className="rounded-2xl border-2 border-outline bg-surface-light px-3 py-2">
                <p className="text-xl font-bold leading-none">{value}</p>
                <p className="text-[11px] font-bold text-text-muted">{label} today</p>
              </div>
            ))}
          </div>
          <p className="text-sm font-semibold">
            {slipped} {waiting.length ? `${waiting.length} ${isOwner ? "still wait for your OK" : "wait for your owner's OK"}.` : ""}
          </p>
          {mine.length > 0 && planned.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-outline p-3">
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-text-muted">Tomorrow, top {mine.length} of your own tasks</p>
              <ul className="mb-2 space-y-1 text-sm font-bold">
                {mine.map((t) => (
                  <li key={t.id} className="truncate">· {t.title}</li>
                ))}
              </ul>
              <button type="button" onClick={() => void planTomorrow()} disabled={planning} className={cn(chip, "bg-highlight text-on-highlight")}>
                {planning && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Plan tomorrow
              </button>
            </div>
          )}
          {planned.length > 0 && (
            <p className="inline-flex items-center gap-1.5 rounded-full border-2 border-outline bg-[#7FE0A0] px-3 py-1 text-sm font-bold text-[#111]">
              <Check className="h-4 w-4" /> {plural(planned.length, "task")} planned for tomorrow
            </p>
          )}
          {error && <p className="text-xs text-rose-400" role="alert">{error}</p>}
        </div>
      )}
      <div role="group" aria-label="Open in Let's Talk" className="mt-4 border-t-2 border-dashed border-outline pt-3">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-muted">{onTool ? "Open a tool" : "Open in Let&apos;s Talk"}</p>
        <div className="flex flex-wrap gap-2">
          {TOOLS.map(({ mode, label, icon: Icon, colour }) => (
            <button key={mode} type="button" onClick={() => (onTool ? onTool(mode) : router.push(`/dashboard/home?mode=${mode}`))} style={{ background: colour }} className={cn(chip, "text-[#111111]")}>
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
