"use client";

import { useState } from "react";
import Link from "next/link";
import { BookmarkPlus, Check, CheckSquare, Loader2 } from "lucide-react";
import { journalApi } from "@/lib/journalApi";
import { useAuth } from "@/contexts/AuthContext";
import { useTaskStore } from "@/stores/taskStore";

export interface BrainstormIdea {
  title: string;
  why: string;
  first_step: string;
}

type Done = "task" | "vault";

/** Five ways to start thinking about a topic. Nothing is saved until you press a button on an idea:
 *  "Add as task" puts it on your own list, "Save to Idea vault" keeps it in your private vault. */
export default function BrainstormCard({ orgId, ideas }: { orgId: string; ideas: BrainstormIdea[] }) {
  const { user } = useAuth();
  const email = (user as { email?: string } | null)?.email || "";
  const { createTask } = useTaskStore();
  const [done, setDone] = useState<Record<string, Done>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const note = (i: BrainstormIdea) => [i.why, i.first_step && `First step: ${i.first_step}`].filter(Boolean).join("\n");

  const act = async (idea: BrainstormIdea, kind: Done) => {
    const key = `${kind}:${idea.title}`;
    setBusy(key);
    setError(null);
    try {
      if (kind === "task") {
        await createTask({
          title: idea.title,
          description: note(idea),
          assignee_id: email ? [email] : undefined,
          assignee_email: email || undefined,
          organization_id: orgId,
        });
      } else {
        await journalApi("/ideas", orgId, { method: "POST", body: { title: idea.title, note: note(idea) } });
      }
      setDone((prev) => ({ ...prev, [key]: kind }));
    } catch (err) {
      setError((err as Error).message || "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const button = "inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 border-outline px-3 py-1 text-xs font-bold shadow-[2px_2px_0_var(--shadow-hard)] transition-all hover:-translate-x-px hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className="space-y-2.5">
      <ol className="space-y-2.5" aria-label="Ideas to start with">
        {ideas.map((idea, n) => {
          const taskKey = `task:${idea.title}`;
          const vaultKey = `vault:${idea.title}`;
          return (
            <li key={idea.title} className="rounded-2xl border-2 border-outline bg-surface p-3.5 shadow-[3px_3px_0_var(--shadow-hard)]">
              <p className="text-sm font-bold">
                <span className="mr-2 inline-grid h-5 w-5 place-items-center rounded-full border-2 border-outline bg-[#FF9FD2] text-[11px] text-[#111]">{n + 1}</span>
                {idea.title}
              </p>
              {idea.why && <p className="mt-1 text-xs text-text-muted">{idea.why}</p>}
              {idea.first_step && (
                <p className="mt-1 text-xs">
                  <b>First step:</b> {idea.first_step}
                </p>
              )}
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!!busy || !!done[taskKey]}
                  onClick={() => void act(idea, "task")}
                  className={`${button} ${done[taskKey] ? "bg-surface-light" : "bg-highlight text-on-highlight"}`}
                >
                  {busy === taskKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : done[taskKey] ? <Check className="h-3.5 w-3.5" /> : <CheckSquare className="h-3.5 w-3.5" />}
                  {done[taskKey] ? "Added to your tasks" : "Add as task"}
                </button>
                <button
                  type="button"
                  disabled={!!busy || !!done[vaultKey]}
                  onClick={() => void act(idea, "vault")}
                  className={`${button} bg-surface`}
                >
                  {busy === vaultKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : done[vaultKey] ? <Check className="h-3.5 w-3.5" /> : <BookmarkPlus className="h-3.5 w-3.5" />}
                  {done[vaultKey] ? "Saved to Idea vault" : "Save to Idea vault"}
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      {error && <p className="text-xs text-rose-400" role="alert">{error}</p>}
      <p className="text-xs text-text-muted">
        Nothing is saved until you press a button. Saved ideas stay private to you in your{" "}
        <Link href="/dashboard/journal?view=ideas" className="font-bold underline">Idea vault</Link>.
      </p>
    </div>
  );
}
