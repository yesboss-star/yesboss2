"use client";

import type { ReactNode } from "react";
import { Bell, BookOpen, ChevronRight, Lightbulb, Lock, Scale, TrendingUp } from "lucide-react";
import { journalApi, type Decision, type Idea, type MoodInsights, type Reminder } from "@/lib/journalApi";
import { WeekStrip } from "./InsightsView";
import { Spinner, useLoader, type DetailTab } from "./shared";

/** Pastel tile colours keep dark text in both themes. */
const COLOURS = {
  mood: "#FFD93D",
  decisions: "#7CC8FF",
  ideas: "#FF9FD2",
  recaps: "#B6F36B",
  reminders: "#C9A7FF",
} as const;

function Tile({ icon, colour, title, subtitle, onOpen }: { icon: ReactNode; colour: string; title: string; subtitle: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ background: colour }}
      className="flex w-full cursor-pointer items-center gap-4 rounded-3xl border-[2.5px] border-outline p-5 text-left text-[#111] shadow-[4px_4px_0_var(--shadow-hard)] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_var(--shadow-hard)]"
    >
      <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full border-2 border-[#111] bg-white">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold">{title}</span>
        <span className="block truncate text-sm text-[#4B4636]">{subtitle}</span>
      </span>
      <ChevronRight className="h-5 w-5 flex-shrink-0" />
    </button>
  );
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** The journal's organised parts as five coloured tiles. Each tile opens its full section. */
export default function OverviewView({ orgId, onOpenDetail }: { orgId: string; onOpenDetail: (tab: DetailTab) => void }) {
  const mood = useLoader<MoodInsights>(() => journalApi("/mood-insights", orgId, { query: { days: 30 } }), `ov-mood-${orgId}`);
  const decisions = useLoader<{ decisions: Decision[] }>(() => journalApi("/decisions", orgId, { query: { status: "open" } }), `ov-decisions-${orgId}`);
  const ideas = useLoader<{ ideas: Idea[] }>(() => journalApi("/ideas", orgId), `ov-ideas-${orgId}`);
  const reminders = useLoader<{ reminders: Reminder[] }>(() => journalApi("/reminders", orgId, { query: { status: "active" } }), `ov-reminders-${orgId}`);

  const series = mood.data?.series ?? [];
  const daysLogged = series.filter((day) => day.mood !== null).length;

  /** What a tile says about itself while its data loads or if it could not load. */
  const say = (loader: { loading: boolean; error: string | null }, text: () => string) => (loader.loading ? "Loading…" : loader.error ? "Could not load" : text());

  return (
    <div className="space-y-5">
      <section className="glass rounded-3xl p-5">
        <h3 className="mb-3 text-sm font-bold">How this week felt</h3>
        {mood.loading ? <Spinner /> : <WeekStrip series={series} />}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Tile
          icon={<TrendingUp className="h-5 w-5" />}
          colour={COLOURS.mood}
          title="Mood and patterns"
          subtitle={say(mood, () => `${plural(daysLogged, "day")} logged in the last 30`)}
          onOpen={() => onOpenDetail("insights")}
        />
        <Tile
          icon={<Scale className="h-5 w-5" />}
          colour={COLOURS.decisions}
          title="Decisions"
          subtitle={say(decisions, () => `${decisions.data?.decisions.length ?? 0} open`)}
          onOpen={() => onOpenDetail("decisions")}
        />
        <Tile
          icon={<Lightbulb className="h-5 w-5" />}
          colour={COLOURS.ideas}
          title="Idea vault"
          subtitle={say(ideas, () => `${ideas.data?.ideas.length ?? 0} saved`)}
          onOpen={() => onOpenDetail("ideas")}
        />
        <Tile
          icon={<BookOpen className="h-5 w-5" />}
          colour={COLOURS.recaps}
          title="Recaps"
          subtitle="Your daily and weekly summaries"
          onOpen={() => onOpenDetail("recaps")}
        />
        <Tile
          icon={<Bell className="h-5 w-5" />}
          colour={COLOURS.reminders}
          title="Reminders"
          subtitle={say(reminders, () => `${reminders.data?.reminders.length ?? 0} waiting`)}
          onOpen={() => onOpenDetail("reminders")}
        />
      </div>

      <p className="flex items-center gap-2 text-sm text-text-muted">
        <Lock className="h-4 w-4 flex-shrink-0" /> Everything here comes from your own journal and is private to you.
      </p>
    </div>
  );
}
