"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { useTaskStore } from "@/stores/taskStore";
import { formatDue, parseQuickTask, type QuickMember } from "@/lib/quickAdd";
import { cn } from "@/lib/utils";

interface Props {
  orgId: string;
  members: QuickMember[];
  /** The signed-in person. An employee's quick task is theirs unless they @mention someone. */
  userEmail: string;
  isOwner: boolean;
  onError: (message: string | null) => void;
}

const chip = "rounded-full border-2 border-outline px-2.5 py-0.5 text-xs font-bold";

/** One line to make a task: "Review the sprint plan Friday @Bob high". What was understood is shown before it is
 *  created, because assigning someone sends them a notification. */
export default function QuickAddTask({ orgId, members, userEmail, isOwner, onError }: Props) {
  const { createTask } = useTaskStore();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState<string | null>(null);

  const parsed = useMemo(() => parseQuickTask(text, members), [text, members]);
  const mine = !isOwner && !parsed.assignee ? userEmail : null; // an employee's task is theirs by default
  const ready = parsed.title.length > 0 && !saving;

  const submit = async () => {
    if (!ready) return;
    setSaving(true);
    onError(null);
    try {
      const email = parsed.assignee?.email || mine || undefined;
      await createTask({
        title: parsed.title,
        priority: parsed.priority ?? "medium",
        due_date: parsed.dueDate ?? undefined,
        assignee_id: email ? [email] : undefined,
        assignee_email: email,
        organization_id: orgId,
      });
      setAdded(parsed.title);
      setText("");
    } catch (err) {
      onError((err as Error).message || "Could not add that task.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="glass flex min-w-0 flex-col justify-center gap-3 rounded-3xl p-5" aria-label="Quick add a task">
      <p className="text-xs font-extrabold uppercase tracking-wider text-text-muted">Quick add</p>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setAdded(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          maxLength={200}
          placeholder="Review the sprint plan Friday @Bob high"
          aria-label="Describe the task"
          className="min-w-0 flex-1 rounded-2xl border-2 border-outline bg-surface px-4 py-2.5 text-sm text-foreground placeholder:text-text-muted focus:shadow-[3px_3px_0_var(--shadow-hard)] focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!ready}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-[2.5px] border-outline bg-highlight px-4 py-2 text-sm font-bold text-on-highlight shadow-[3px_3px_0_var(--shadow-hard)] transition-all hover:-translate-x-px hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
        </button>
      </div>

      {text.trim() && (
        <div className="flex flex-wrap items-center gap-2" aria-live="polite">
          <span className={cn(chip, "bg-surface text-foreground")}>{parsed.title || "Add a title"}</span>
          {parsed.dueDate && <span className={cn(chip, "bg-[#7CC8FF] text-[#111]")}>Due {formatDue(parsed.dueDate)}</span>}
          {parsed.priority && <span className={cn(chip, parsed.priority === "low" ? "bg-[#B6F36B] text-[#111]" : "bg-[#FF7A6B] text-[#111]")}>{parsed.priority}</span>}
          <span className={cn(chip, parsed.assignee || mine ? "bg-[#C9A7FF] text-[#111]" : "bg-[#FF9FD2] text-[#111]")}>
            {parsed.assignee ? `For ${parsed.assignee.name}` : mine ? "For you" : "Nobody yet"}
          </span>
          {parsed.note && <span className="text-xs font-semibold text-text-muted">{parsed.note}</span>}
        </div>
      )}
      {added && !text && (
        <p className="text-xs font-semibold text-text-muted" role="status">
          Added “{added}” to To do.
        </p>
      )}
    </section>
  );
}
