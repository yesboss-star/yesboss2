"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { journalApi, type MoodInsights, type Recap } from "@/lib/journalApi";
import { useLoader } from "./shared";

const MOODS = [
  { value: 1, emoji: "😞", label: "Very low" },
  { value: 2, emoji: "🙁", label: "Low" },
  { value: 3, emoji: "😐", label: "Okay" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 5, emoji: "😄", label: "Great" },
] as const;

const todayKey = () => new Date().toDateString();

function readDismissed(key: string) {
  try {
    return localStorage.getItem(key) === todayKey();
  } catch {
    return false;
  }
}

function writeDismissed(key: string) {
  try {
    localStorage.setItem(key, todayKey());
  } catch {
    /* optional */
  }
}

/** One-tap mood check-in, shown once a day at the top of the chat. */
export function DailyCheckin({ orgId, onMore }: { orgId: string; onMore: () => void }) {
  const { data, loading } = useLoader<MoodInsights>(() => journalApi("/mood-insights", orgId, { query: { days: 7 } }), `nudge-mood-${orgId}`);
  const [dismissed, setDismissed] = useState(() => readDismissed("yesboss-journal-checkin-dismissed"));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  if (dismissed) return null;
  if (!saved && (loading || data?.today_checkin)) return null;

  const pick = async (mood: number) => {
    setError(false);
    try {
      await journalApi("/checkins", orgId, { method: "POST", body: { mood } });
      setSaved(true);
    } catch {
      setError(true);
    }
  };

  const dismiss = () => {
    writeDismissed("yesboss-journal-checkin-dismissed");
    setDismissed(true);
  };

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
      {saved ? (
        <>
          <p className="text-sm text-foreground">Noted, thank you.</p>
          <div className="flex items-center gap-3">
            <button onClick={onMore} className="cursor-pointer text-xs text-primary hover:underline">
              See your mood trend
            </button>
            <button onClick={dismiss} aria-label="Close" className="cursor-pointer text-text-muted hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-foreground">How are you feeling today?</p>
          <div className="flex items-center gap-1">
            {MOODS.map(({ value, emoji, label }) => (
              <button
                key={value}
                onClick={() => void pick(value)}
                title={label}
                aria-label={label}
                className="h-9 w-9 cursor-pointer rounded-full text-xl transition-transform hover:scale-110 hover:bg-background"
              >
                {emoji}
              </button>
            ))}
            <button onClick={dismiss} aria-label="Not now" title="Not now" className="ml-2 cursor-pointer text-text-muted hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          {error && <p className="w-full text-xs text-rose-400">Couldn&apos;t save that. Please try again.</p>}
        </>
      )}
    </div>
  );
}

/** Shows the latest daily recap (made in the evening) as a card in the chat. */
export function RecapNudge({ orgId, onOpen }: { orgId: string; onOpen: () => void }) {
  const { data } = useLoader<{ recaps: Recap[] }>(() => journalApi("/recaps", orgId, { query: { period: "daily", limit: 1 } }), `nudge-recap-${orgId}`);
  const [dismissed, setDismissed] = useState(() => readDismissed("yesboss-journal-recap-dismissed"));
  const [loadedAt] = useState(() => Date.now());
  const recap = data?.recaps[0];
  if (!recap || dismissed) return null;
  const ageHours = (loadedAt - new Date(recap.created_at).getTime()) / 3_600_000;
  if (ageHours > 20) return null;

  const preferred = ["on_your_mind", "unresolved", "tomorrow"];
  const points = preferred
    .flatMap((key) => (recap.sections[key] ?? []).slice(0, 1).map((item) => item.text))
    .slice(0, 3);
  if (points.length === 0) return null;

  return (
    <div className="mb-4 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-foreground">Your recap for today</p>
        <button
          onClick={() => {
            writeDismissed("yesboss-journal-recap-dismissed");
            setDismissed(true);
          }}
          aria-label="Dismiss recap"
          className="cursor-pointer text-text-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-foreground">
        {points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <button onClick={onOpen} className="mt-2 cursor-pointer text-xs text-primary hover:underline">
        Open the full recap
      </button>
    </div>
  );
}
