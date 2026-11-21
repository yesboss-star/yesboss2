"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, CheckCheck, Loader2 } from "lucide-react";
import { useTaskStore, type Task } from "@/stores/taskStore";
import { useOrgChartStore } from "@/stores/orgChartStore";
import { useOrganizationStore } from "@/stores/organizationStore";
import { firstAssignee, isFinished, needsAttention } from "@/components/TaskBoardCard";
import { cn } from "@/lib/utils";

/** How many tasks each list shows. "Approve" on the group only ever acts on the ones shown, never on a hidden pile. */
const SHOWN = 5;

const sectionTitle = "flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-text-muted";
const countChip = "rounded-full border-2 border-outline bg-[#FFD93D] px-2 text-[11px] font-extrabold text-[#111]";

/** What needs the person's action, as a card in the chat: finished tasks waiting for the owner's OK, and tasks nobody owns yet.
 *  An employee sees their own late or due-today tasks instead. */
export default function NeedActionCard({ isOwner, userEmail }: { isOwner: boolean; userEmail: string }) {
  const { tasks, fetchTasks, completeTask, approveTask, updateTask } = useTaskStore();
  const { members, fetchOrgMembers } = useOrgChartStore();
  const orgId = useOrganizationStore((s) => s.organization?.id);
  const [busy, setBusy] = useState<string | null>(null); // a task id, or "all"
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    void fetchTasks(orgId);
    void fetchOrgMembers(orgId);
  }, [orgId, fetchTasks, fetchOrgMembers]);

  const me = userEmail.toLowerCase();
  // newest first, so the few shown are the ones that just came in: finished most recently, created most recently
  const newest = (field: "updated_at" | "created_at") => (a: Task, b: Task) => (Date.parse(b[field]) || 0) - (Date.parse(a[field]) || 0);
  const waiting = useMemo(() => tasks.filter((t) => t.status === "completed").sort(newest("updated_at")), [tasks]);
  const unowned = useMemo(() => tasks.filter((t) => !isFinished(t) && !firstAssignee(t)).sort(newest("created_at")), [tasks]);
  const mine = useMemo(
    () => tasks.filter((t) => needsAttention(t) && (t.assignee_id || []).some((a) => String(a).toLowerCase() === me)),
    [tasks, me]
  );

  const run = async (key: string, work: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError((err as Error).message || "Could not do that.");
    } finally {
      setBusy(null);
    }
  };

  const row = (task: Task, action: React.ReactNode) => (
    <li key={task.id} className="flex items-center gap-3 rounded-2xl border-2 border-outline bg-background px-3.5 py-2.5">
      <span className="min-w-0 flex-1 truncate text-sm font-bold">{task.title}</span>
      {action}
    </li>
  );

  const approveButton = (task: Task) => (
    <button
      type="button"
      disabled={busy !== null}
      onClick={() => void run(task.id, () => approveTask(task.id))}
      className="inline-flex flex-shrink-0 cursor-pointer items-center gap-1.5 rounded-full border-2 border-outline bg-foreground px-3.5 py-1 text-sm font-bold text-background transition-all hover:-translate-x-px hover:-translate-y-px disabled:opacity-60"
    >
      {busy === task.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Approve
    </button>
  );

  const nothing = isOwner ? waiting.length === 0 && unowned.length === 0 : mine.length === 0;

  return (
    <div className="glass w-full max-w-xl space-y-4 rounded-3xl p-4 text-foreground">
      {nothing && <p className="text-sm font-semibold">Nothing needs you right now.</p>}

      {isOwner && waiting.length > 0 && (
        <section className="space-y-2" aria-label="Waiting for your OK">
          <h3 className={sectionTitle}>
            Waiting for your OK <span className={countChip}>{waiting.length}</span>
          </h3>
          <ul className="space-y-2">{waiting.slice(0, SHOWN).map((t) => row(t, approveButton(t)))}</ul>
          <div className="flex flex-wrap items-center gap-3">
            {waiting.length > 1 && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() =>
                  void run("all", async () => {
                    for (const task of waiting.slice(0, SHOWN)) await approveTask(task.id);
                  })
                }
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 border-outline bg-highlight px-4 py-1.5 text-sm font-bold text-on-highlight shadow-[3px_3px_0_var(--shadow-hard)] transition-all hover:-translate-x-px hover:-translate-y-px disabled:opacity-60"
              >
                {busy === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
                Approve these {Math.min(SHOWN, waiting.length)}
              </button>
            )}
            {waiting.length > SHOWN && <span className="text-xs font-semibold text-text-muted">{waiting.length - SHOWN} more are on the Task page.</span>}
          </div>
        </section>
      )}

      {isOwner && unowned.length > 0 && (
        <section className="space-y-2" aria-label="Nobody owns these yet">
          <h3 className={sectionTitle}>
            Nobody owns these yet <span className={countChip}>{unowned.length}</span>
          </h3>
          <ul className="space-y-2">
            {unowned.slice(0, SHOWN).map((t) =>
              row(
                t,
                <select
                  value=""
                  disabled={busy !== null}
                  aria-label={`Assign "${t.title}"`}
                  onChange={(e) => {
                    const email = e.target.value;
                    if (email) void run(t.id, () => updateTask(t.id, { assignee_id: [email] }));
                  }}
                  className="max-w-[10rem] flex-shrink-0 cursor-pointer truncate rounded-full border-2 border-outline bg-[#FF9FD2] py-0.5 pl-2.5 pr-1 text-sm font-bold text-[#111] disabled:opacity-60 [&>option]:bg-surface [&>option]:text-foreground"
                >
                  <option value="">Assign to…</option>
                  {members.map((m) => (
                    <option key={m.email} value={m.email}>
                      {m.full_name || m.email}
                    </option>
                  ))}
                </select>
              )
            )}
          </ul>
          {unowned.length > SHOWN && <p className="text-xs font-semibold text-text-muted">{unowned.length - SHOWN} more are on the Task page.</p>}
        </section>
      )}

      {!isOwner && mine.length > 0 && (
        <section className="space-y-2" aria-label="Late or due today">
          <h3 className={sectionTitle}>
            Late or due today <span className={countChip}>{mine.length}</span>
          </h3>
          <ul className="space-y-2">
            {mine.slice(0, SHOWN).map((t) =>
              row(
                t,
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void run(t.id, () => completeTask(t.id))}
                  className="inline-flex flex-shrink-0 cursor-pointer items-center gap-1.5 rounded-full border-2 border-outline bg-surface px-3.5 py-1 text-sm font-bold transition-all hover:bg-[#B6F36B] hover:text-[#111] disabled:opacity-60"
                >
                  {busy === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Done
                </button>
              )
            )}
          </ul>
          {mine.length > SHOWN && <p className="text-xs font-semibold text-text-muted">{mine.length - SHOWN} more are on the Task page.</p>}
        </section>
      )}

      {error && (
        <p className="rounded-xl border-2 border-outline bg-[#FF9FA0] px-3 py-1.5 text-xs font-semibold text-[#111]" role="alert">
          {error}
        </p>
      )}

      <Link
        href="/dashboard/task"
        className={cn("inline-flex items-center gap-1 text-sm font-bold underline-offset-2 hover:underline")}
      >
        Open Task <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
