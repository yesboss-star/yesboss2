"use client";

import { useState, type ReactNode } from "react";
import { Bell, CalendarCheck, ChevronRight, Lightbulb, Scale, Sparkles, TrendingUp, Waypoints } from "lucide-react";
import {
  journalApi,
  normalizeAnalysis,
  type Decision,
  type EntryRow,
  type Idea,
  type MoodInsights,
  type Pattern,
  type Recap,
  type Reminder,
} from "@/lib/journalApi";
import { MoodLine, TodayMood, WeekStrip } from "./InsightsView";
import { Chip, ErrorNote, Spinner, formatDate, useLoader, type DetailTab } from "./shared";

type Tone = "sky" | "violet" | "amber" | "emerald" | "rose" | "indigo";

const TONES: Record<Tone, string> = {
  sky: "bg-sky-500/15 text-sky-400",
  violet: "bg-violet-500/15 text-violet-400",
  amber: "bg-amber-500/15 text-amber-400",
  emerald: "bg-emerald-500/15 text-emerald-400",
  rose: "bg-rose-500/15 text-rose-400",
  indigo: "bg-indigo-500/15 text-indigo-400",
};

function Card({
  icon,
  tone,
  title,
  count,
  action,
  onOpen,
  className = "",
  children,
}: {
  icon: ReactNode;
  tone: Tone;
  title: string;
  count?: number;
  action?: string;
  onOpen?: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`flex flex-col rounded-3xl border border-border bg-surface/70 p-5 ${className}`}>
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className={`flex h-9 w-9 items-center justify-center rounded-2xl ${TONES[tone]}`}>{icon}</span>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {count !== undefined && count > 0 && <Chip>{count}</Chip>}
        </div>
        {onOpen && (
          <button onClick={onOpen} className="flex cursor-pointer items-center gap-0.5 text-xs text-text-muted transition-colors hover:text-primary">
            {action ?? "Open"}
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

const Soft = ({ children }: { children: ReactNode }) => <p className="py-3 text-center text-xs text-text-muted">{children}</p>;

function describeReminder(reminder: Reminder) {
  const { trigger } = reminder;
  if (trigger.type === "date" && trigger.due_at) return formatDate(trigger.due_at);
  if (trigger.type === "after_meeting") return `After “${trigger.match}”`;
  if (trigger.type === "project_active") return `When “${trigger.goal_title}” starts`;
  return "";
}

/** Everything the journal has organised, on one page. Each card opens its full section. */
export default function OverviewView({ orgId, onOpenDetail }: { orgId: string; onOpenDetail: (tab: DetailTab) => void }) {
  const mood = useLoader<MoodInsights>(() => journalApi("/mood-insights", orgId, { query: { days: 30 } }), `ov-mood-${orgId}`);
  const recaps = useLoader<{ recaps: Recap[] }>(() => journalApi("/recaps", orgId, { query: { limit: 1 } }), `ov-recap-${orgId}`);
  const patterns = useLoader<{ patterns: Pattern[] }>(() => journalApi("/patterns", orgId), `ov-patterns-${orgId}`);
  const decisions = useLoader<{ decisions: Decision[] }>(() => journalApi("/decisions", orgId, { query: { status: "open" } }), `ov-decisions-${orgId}`);
  const ideas = useLoader<{ ideas: Idea[] }>(() => journalApi("/ideas", orgId), `ov-ideas-${orgId}`);
  const reminders = useLoader<{ reminders: Reminder[] }>(() => journalApi("/reminders", orgId, { query: { status: "active" } }), `ov-reminders-${orgId}`);
  const entries = useLoader<{ entries: EntryRow[] }>(() => journalApi("/entries", orgId, { query: { limit: 4 } }), `ov-entries-${orgId}`);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recap = recaps.data?.recaps[0];
  const recapPoints = recap
    ? ["on_your_mind", "wins", "unresolved", "tomorrow", "next_week_priorities", "repeated_concerns"]
        .flatMap((key) => (recap.sections[key] ?? []).slice(0, 1).map((item) => item.text))
        .slice(0, 3)
    : [];

  const writeRecap = async () => {
    setWriting(true);
    setError(null);
    try {
      await journalApi("/recaps/generate", orgId, { method: "POST", query: { period: "daily" } });
      recaps.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWriting(false);
    }
  };

  const openDecisions = decisions.data?.decisions ?? [];
  const activeReminders = reminders.data?.reminders ?? [];
  const allIdeas = ideas.data?.ideas ?? [];

  return (
    <div className="space-y-4">
      <ErrorNote message={error} />

      <Card icon={<TrendingUp className="h-4 w-4" />} tone="violet" title="Mood" action="Details" onOpen={() => onOpenDetail("insights")}>
        {mood.loading ? (
          <Spinner />
        ) : (
          <div className="space-y-4">
            <TodayMood orgId={orgId} current={mood.data?.today_checkin?.mood ?? null} onSaved={mood.reload} />
            <WeekStrip series={mood.data?.series ?? []} />
            <MoodLine series={mood.data?.series ?? []} />
            {mood.data?.patterns[0] && (
              <p className="rounded-2xl bg-amber-500/10 px-3 py-2 text-xs text-foreground">
                <span className="font-medium text-amber-400">Possible pattern · </span>
                {mood.data.patterns[0].text}
              </p>
            )}
          </div>
        )}
      </Card>

      <Card icon={<CalendarCheck className="h-4 w-4" />} tone="sky" title="Recap" action="All recaps" onOpen={() => onOpenDetail("recaps")}>
        {recaps.loading ? (
          <Spinner />
        ) : recapPoints.length > 0 && recap ? (
          <div>
            <p className="mb-1.5 text-[11px] text-text-muted">
              {recap.period === "weekly" ? "Weekly" : "Daily"} · {recap.range_key.replace("..", " to ")}
            </p>
            <ul className="space-y-1.5 text-sm text-foreground">
              {recapPoints.map((point) => (
                <li key={point} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-sky-400" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2">
            <Soft>No recap yet. One is written each evening.</Soft>
          </div>
        )}
        <button
          onClick={() => void writeRecap()}
          disabled={writing}
          className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-text-muted transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {writing ? "Writing…" : "Write today's recap"}
        </button>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card icon={<Scale className="h-4 w-4" />} tone="amber" title="Decisions" count={openDecisions.length} action="Manage" onOpen={() => onOpenDetail("decisions")}>
          {decisions.loading ? (
            <Spinner />
          ) : openDecisions.length === 0 ? (
            <Soft>No open decisions. Log one before you commit.</Soft>
          ) : (
            <ul className="space-y-2">
              {openDecisions.slice(0, 3).map((decision) => {
                const due = decision.review_on && new Date(decision.review_on) < new Date();
                return (
                  <li key={decision._id} className="rounded-2xl bg-background px-3 py-2">
                    <p className="line-clamp-2 text-sm text-foreground">{decision.question}</p>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-text-muted">
                      <Chip tone={due ? "warn" : "default"}>{due ? "Review due" : "Open"}</Chip>
                      {decision.review_on && <span>review {formatDate(decision.review_on)}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card icon={<Lightbulb className="h-4 w-4" />} tone="emerald" title="Ideas" count={allIdeas.length} action="Vault" onOpen={() => onOpenDetail("ideas")}>
          {ideas.loading ? (
            <Spinner />
          ) : allIdeas.length === 0 ? (
            <Soft>Ideas you mention are saved here automatically.</Soft>
          ) : (
            <ul className="space-y-2">
              {allIdeas.slice(0, 4).map((idea) => (
                <li key={idea._id} className="flex items-start justify-between gap-2 rounded-2xl bg-background px-3 py-2">
                  <p className="line-clamp-2 text-sm text-foreground">{idea.title}</p>
                  <Chip tone={idea.status === "implemented" ? "good" : "default"}>{idea.status}</Chip>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card icon={<Bell className="h-4 w-4" />} tone="rose" title="Reminders" count={activeReminders.length} action="Manage" onOpen={() => onOpenDetail("reminders")}>
          {reminders.loading ? (
            <Spinner />
          ) : activeReminders.length === 0 ? (
            <Soft>Nothing waiting. Tap “Remind me” under any reply.</Soft>
          ) : (
            <ul className="space-y-2">
              {activeReminders.slice(0, 4).map((reminder) => (
                <li key={reminder._id} className="rounded-2xl bg-background px-3 py-2">
                  <p className="line-clamp-2 text-sm text-foreground">{reminder.text}</p>
                  <p className="mt-0.5 text-[11px] text-text-muted">{describeReminder(reminder)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card icon={<Waypoints className="h-4 w-4" />} tone="indigo" title="Patterns" count={patterns.data?.patterns.length} action="Review" onOpen={() => onOpenDetail("insights")}>
          {patterns.loading ? (
            <Spinner />
          ) : (patterns.data?.patterns.length ?? 0) === 0 ? (
            <Soft>No repeated themes yet. Keep journaling.</Soft>
          ) : (
            <ul className="space-y-2">
              {patterns.data?.patterns.slice(0, 3).map((pattern) => (
                <li key={pattern._id} className="rounded-2xl bg-background px-3 py-2 text-sm text-foreground">
                  <span className="line-clamp-3">{pattern.text}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card icon={<Sparkles className="h-4 w-4" />} tone="sky" title="Latest entries" action="See all" onOpen={() => onOpenDetail("insights")}>
        {entries.loading ? (
          <Spinner />
        ) : (entries.data?.entries.length ?? 0) === 0 ? (
          <Soft>Write or speak, and your entries will be organised here.</Soft>
        ) : (
          <ul className="space-y-2">
            {entries.data?.entries.map((entry) => {
              const analysis = normalizeAnalysis(entry.ai_analysis);
              return (
                <li key={entry._id} className="flex items-start gap-3 rounded-2xl bg-background px-3 py-2">
                  <Chip tone="primary">{analysis?.kind ?? "entry"}</Chip>
                  <p className="line-clamp-2 flex-1 text-sm text-foreground">{analysis?.summary || entry.content.slice(0, 120)}</p>
                  <span className="flex-shrink-0 text-[11px] text-text-muted">{formatDate(entry.created_at)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
