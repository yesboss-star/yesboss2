"use client";

import { useEffect, useState } from "react";
import { Bell, Lightbulb, Scale } from "lucide-react";
import { journalApi, type SessionSummary } from "@/lib/journalApi";
import { Chip } from "./shared";

const KIND_LABEL: Record<string, string> = {
  idea: "an idea",
  frustration: "a frustration",
  decision: "a decision",
  concern: "a concern",
  goal: "a goal",
  opportunity: "an opportunity",
  reflection: "a reflection",
};

const REMIND_CHOICES = [
  { days: 3, label: "3 days" },
  { days: 7, label: "1 week" },
  { days: 30, label: "30 days" },
] as const;

const chipButton =
  "inline-flex cursor-pointer items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] text-text-muted transition-colors hover:border-primary/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Small, quiet actions under the latest AI reply: what the journal noted
 * automatically, plus one-tap "save as idea", "log as decision" and "remind me".
 */
export default function MessageChips({
  orgId,
  sessionId,
  userText,
  onLogDecision,
}: {
  orgId: string;
  sessionId: string;
  userText: string;
  onLogDecision: (text: string) => void;
}) {
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [ideaSaved, setIdeaSaved] = useState(false);
  const [picking, setPicking] = useState(false);
  const [reminderSet, setReminderSet] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  // The analysis runs in the background; look for it a few seconds after the reply.
  useEffect(() => {
    if (sessionId.startsWith("local_")) return;
    let cancelled = false;
    const timers = [7000, 20000].map((delay) =>
      setTimeout(async () => {
        try {
          const data = await journalApi<SessionSummary>(`/sessions/${sessionId}`, orgId);
          if (!cancelled && data.ready) setSummary(data);
        } catch {
          /* the chips are optional */
        }
      }, delay)
    );
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [orgId, sessionId]);

  const saveIdea = async () => {
    setBusy(true);
    setError(false);
    try {
      await journalApi("/ideas", orgId, { method: "POST", body: { title: userText.slice(0, 200) } });
      setIdeaSaved(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const remind = async (days: number, label: string) => {
    setBusy(true);
    setError(false);
    try {
      await journalApi("/reminders", orgId, {
        method: "POST",
        body: { text: `Revisit: ${userText.slice(0, 140)}`, type: "after_days", days, session_id: sessionId },
      });
      setReminderSet(label);
      setPicking(false);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const showIdeaSaved = ideaSaved || summary?.idea_saved;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {summary?.kind && <Chip>Noted as {KIND_LABEL[summary.kind] ?? "an entry"}</Chip>}
      {summary?.mood_noted && <Chip>Mood noted</Chip>}
      {showIdeaSaved ? (
        <Chip tone="good">Saved to Ideas</Chip>
      ) : (
        <button onClick={() => void saveIdea()} disabled={busy} className={chipButton}>
          <Lightbulb className="h-3 w-3" />
          Save as idea
        </button>
      )}
      <button onClick={() => onLogDecision(userText)} className={chipButton}>
        <Scale className="h-3 w-3" />
        Log as decision
      </button>
      {reminderSet ? (
        <Chip tone="good">Reminder set for {reminderSet}</Chip>
      ) : picking ? (
        <span className="inline-flex items-center gap-1">
          <span className="text-[11px] text-text-muted">Remind me in</span>
          {REMIND_CHOICES.map(({ days, label }) => (
            <button key={days} onClick={() => void remind(days, label)} disabled={busy} className={chipButton}>
              {label}
            </button>
          ))}
        </span>
      ) : (
        <button onClick={() => setPicking(true)} className={chipButton}>
          <Bell className="h-3 w-3" />
          Remind me
        </button>
      )}
      {summary?.idea_note && <p className="w-full text-[11px] text-text-muted">{summary.idea_note}</p>}
      {error && <span className="text-[11px] text-rose-400">That didn&apos;t work. Please try again.</span>}
    </div>
  );
}
