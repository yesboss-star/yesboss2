"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { journalApi, type EntryRow, type MoodDay, type MoodInsights, type Pattern } from "@/lib/journalApi";
import EntryAnalysisCard from "./EntryAnalysisCard";
import {
  Chip,
  Empty,
  ErrorNote,
  GhostButton,
  MOOD_FACES,
  MoodFaces,
  Panel,
  SourceLinks,
  Spinner,
  formatDate,
  moodEmoji,
  useLoader,
} from "./shared";

/** The last 7 days as a row of faces (a dot when there is nothing for that day). */
export function WeekStrip({ series }: { series: MoodDay[] }) {
  const byDate = new Map(series.map((row) => [row.date, row]));
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = date.toLocaleDateString("en-CA"); // YYYY-MM-DD in the viewer's timezone
    return { key, label: date.toLocaleDateString("en-IN", { weekday: "short" }), row: byDate.get(key) };
  });
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {days.map(({ key, label, row }) => (
        <div key={key} className="flex flex-col items-center gap-1 rounded-xl bg-background py-2" title={row?.mood ? `Mood ${row.mood} of 5` : "No mood yet"}>
          <span className="text-[10px] text-text-muted">{label}</span>
          <span className={`text-xl ${row?.mood ? "" : "text-text-muted opacity-40"}`}>{moodEmoji(row?.mood)}</span>
        </div>
      ))}
    </div>
  );
}

/** Mood over time as one smooth line (faces mark the top and bottom of the scale). */
export function MoodLine({ series }: { series: MoodDay[] }) {
  const points = series.map((row, index) => ({ index, mood: row.mood })).filter((p): p is { index: number; mood: number } => p.mood !== null);
  if (points.length < 2) return <p className="py-6 text-center text-sm text-text-muted">Check in on a couple of days to see your trend.</p>;
  const width = 560;
  const height = 150;
  const left = 30;
  const x = (index: number) => left + (index * (width - left - 10)) / Math.max(1, series.length - 1);
  const y = (mood: number) => height - 14 - ((mood - 1) * (height - 28)) / 4;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.index).toFixed(1)},${y(p.mood).toFixed(1)}`).join(" ");
  const area = `${path} L${x(points[points.length - 1].index).toFixed(1)},${height - 14} L${x(points[0].index).toFixed(1)},${height - 14} Z`;
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full" role="img" aria-label="Mood over time">
        <defs>
          <linearGradient id="mood-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#9b72cb" stopOpacity="0.35" />
            <stop offset="1" stopColor="#9b72cb" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[1, 3, 5].map((level) => (
          <line key={level} x1={left} x2={width - 10} y1={y(level)} y2={y(level)} stroke="currentColor" className="text-border" strokeDasharray="3 4" />
        ))}
        <text x="2" y={y(5) + 6} fontSize="16">{MOOD_FACES[4].emoji}</text>
        <text x="2" y={y(1) + 6} fontSize="16">{MOOD_FACES[0].emoji}</text>
        <path d={area} fill="url(#mood-fill)" />
        <path d={path} fill="none" stroke="#9b72cb" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p) => (
          <circle key={p.index} cx={x(p.index)} cy={y(p.mood)} r="3.5" fill="#9b72cb" />
        ))}
      </svg>
      <p className="text-[11px] text-text-muted">
        {formatDate(series[0].date)} to {formatDate(series[series.length - 1].date)}
      </p>
    </div>
  );
}

/** Save today's mood with one tap. */
export function TodayMood({ orgId, current, onSaved }: { orgId: string; current: number | null; onSaved: () => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = picked ?? current;

  const pick = async (mood: number) => {
    setPicked(mood);
    setBusy(true);
    setError(null);
    try {
      await journalApi("/checkins", orgId, { method: "POST", body: { mood } });
      onSaved();
    } catch (err) {
      setPicked(null);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <MoodFaces value={value} onPick={(mood) => void pick(mood)} disabled={busy} />
      <p className="text-xs text-text-muted">
        {value ? `Today: ${MOOD_FACES[value - 1].label}. Tap another face to change it.` : "Tap the face that fits today."}
      </p>
      <ErrorNote message={error} />
    </div>
  );
}

export default function InsightsView({
  orgId,
  onAsk,
  onOpen,
}: {
  orgId: string;
  onAsk: (question: string) => void;
  onOpen: (sessionId: string) => void;
}) {
  const mood = useLoader<MoodInsights>(() => journalApi("/mood-insights", orgId, { query: { days: 30 } }), `mood-${orgId}`);
  const patterns = useLoader<{ patterns: Pattern[] }>(() => journalApi("/patterns", orgId), `patterns-${orgId}`);
  const entries = useLoader<{ entries: EntryRow[] }>(() => journalApi("/entries", orgId, { query: { limit: 15 } }), `entries-${orgId}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshPatterns = async () => {
    setBusy(true);
    setError(null);
    try {
      await journalApi("/patterns/refresh", orgId, { method: "POST" });
      patterns.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const feedback = async (pattern: Pattern, action: "dismiss" | "correct") => {
    const note = action === "correct" ? window.prompt("What is closer to the truth? (optional)") ?? "" : "";
    try {
      await journalApi(`/patterns/${pattern._id}/feedback`, orgId, { method: "POST", body: { action, note } });
      patterns.reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <ErrorNote message={error ?? mood.error} />

      <Panel title="How are you feeling today?">
        {mood.loading ? <Spinner /> : <TodayMood orgId={orgId} current={mood.data?.today_checkin?.mood ?? null} onSaved={mood.reload} />}
      </Panel>

      <Panel title="Your mood" hint="Days you check in count first; other days are estimated from what you write.">
        {mood.loading ? (
          <Spinner />
        ) : (
          <div className="space-y-4">
            <WeekStrip series={mood.data?.series ?? []} />
            <MoodLine series={mood.data?.series ?? []} />
            {(mood.data?.top_triggers.length ?? 0) > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-text-muted">Most mentioned:</span>
                {mood.data?.top_triggers.map((t) => (
                  <Chip key={t.trigger}>
                    {t.trigger} · {t.days}d
                  </Chip>
                ))}
              </div>
            )}
            {mood.data?.patterns.map((pattern) => (
              <div key={pattern.trigger} className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-foreground">
                <Chip tone="warn">Possible pattern</Chip>
                <p className="mt-1.5">{pattern.text}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Patterns across your journal"
        hint="Themes that keep coming back. These are possibilities, so tell me when I get one wrong."
        action={
          <GhostButton onClick={() => void refreshPatterns()} disabled={busy}>
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
            Refresh
          </GhostButton>
        }
      >
        {patterns.loading ? (
          <Spinner />
        ) : (patterns.data?.patterns.length ?? 0) === 0 ? (
          <Empty>No repeated themes yet. Keep journaling and check back.</Empty>
        ) : (
          <div className="space-y-3">
            {patterns.data?.patterns.map((pattern) => (
              <div key={pattern._id} className="rounded-xl border border-border bg-background p-3">
                <p className="text-sm text-foreground">{pattern.text}</p>
                <SourceLinks sources={pattern.sources} onOpen={onOpen} />
                <div className="mt-2 flex flex-wrap gap-2">
                  <GhostButton onClick={() => onAsk(`Let's explore this pattern: ${pattern.theme}. What might be behind it?`)}>Explore this</GhostButton>
                  <GhostButton onClick={() => void feedback(pattern, "correct")}>Not quite right</GhostButton>
                  <GhostButton onClick={() => void feedback(pattern, "dismiss")}>Not a pattern</GhostButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="What your latest entries were about" hint="Each entry is sorted and summarised automatically. Tap one to expand.">
        {entries.loading ? (
          <Spinner />
        ) : (entries.data?.entries.length ?? 0) === 0 ? (
          <Empty>Write or speak in the Journal, and your entries will be organised here.</Empty>
        ) : (
          <div className="space-y-2">
            {entries.data?.entries.map((entry) => (
              <EntryAnalysisCard key={entry._id} entry={entry} orgId={orgId} onAsk={onAsk} onOpen={onOpen} onUpdated={entries.reload} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
