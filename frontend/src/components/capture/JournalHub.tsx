"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Bell, Check, Plus, Trash2 } from "lucide-react";
import { journalApi, type Idea, type IdeaStatus, type Reminder } from "@/lib/journalApi";
import { Chip, Empty, ErrorNote, Spinner, formatDate, inputClass, itemCard, useLoader } from "@/components/journal/shared";
import { JournalListCard } from "@/components/capture/JournalCards";
import { cn } from "@/lib/utils";

export type HubTab = "entries" | "reminders" | "ideas";

const pill = "inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 border-outline px-3 py-1 text-xs font-bold transition-all hover:-translate-x-px hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50";

const TABS: { id: HubTab; label: string }[] = [
  { id: "entries", label: "Entries" },
  { id: "reminders", label: "Reminders" },
  { id: "ideas", label: "Ideas" },
];

/** The parts of the Journal that are not here yet open the full Journal at the right view. */
const FULL_VIEWS = [
  { view: "decisions", label: "Decisions" },
  { view: "recaps", label: "Recaps" },
  { view: "insights", label: "Insights" },
];

/** Everything about your Journal in one chat card: your entries, your reminders and your idea vault.
 *  It reads and writes the same data as the Journal page, and it only ever shows the signed-in person's own records. */
export default function JournalHub({ orgId, initialTab = "entries" }: { orgId: string; initialTab?: HubTab }) {
  const [tab, setTab] = useState<HubTab>(initialTab);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Your Journal">
        {TABS.map(({ id, label }) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn(pill, tab === id ? "bg-highlight text-on-highlight shadow-[2px_2px_0_var(--shadow-hard)]" : "bg-surface")}>
            {label}
          </button>
        ))}
        {FULL_VIEWS.map(({ view, label }) => (
          <Link key={view} href={`/dashboard/journal?view=${view}`} className={cn(pill, "bg-surface text-text-muted")}>
            {label} <ArrowUpRight className="h-3 w-3" />
          </Link>
        ))}
      </div>

      {tab === "entries" && <JournalListCard orgId={orgId} />}
      {tab === "reminders" && <RemindersTab orgId={orgId} />}
      {tab === "ideas" && <IdeasTab orgId={orgId} />}

      {/* the entries list already ends with its own "Only you can see these" line and link */}
      {tab !== "entries" && (
        <p className="text-xs text-text-muted">
          Only you can see this. <Link href="/dashboard/journal" className="font-bold underline">Open the full Journal</Link>
        </p>
      )}
    </div>
  );
}

const describe = (r: Reminder) => {
  const t = r.trigger;
  if (t.due_at) return `On ${formatDate(t.due_at)}`;
  if (t.type === "after_meeting") return `After the meeting “${t.match}”`;
  if (t.type === "project_active") return `When “${t.goal_title}” becomes active`;
  return "";
};

function RemindersTab({ orgId }: { orgId: string }) {
  const list = useLoader<{ reminders: Reminder[] }>(() => journalApi("/reminders", orgId), `chat-reminders-${orgId}`);
  const [text, setText] = useState("");
  const [when, setWhen] = useState<1 | 3 | 7 | "date">(1);
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = when === "date" ? { text: text.trim(), type: "date", due_at: date } : { text: text.trim(), type: "after_days", days: when };
      await journalApi("/reminders", orgId, { method: "POST", body });
      setText("");
      setDate("");
      list.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const act = async (r: Reminder, action: "done" | "delete") => {
    setError(null);
    try {
      if (action === "done") await journalApi(`/reminders/${r._id}/done`, orgId, { method: "POST" });
      else await journalApi(`/reminders/${r._id}`, orgId, { method: "DELETE" });
      list.reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const active = list.data?.reminders.filter((r) => r.status === "active") ?? [];
  const earlier = list.data?.reminders.filter((r) => r.status !== "active") ?? [];

  return (
    <div className="space-y-3">
      <div className={cn(itemCard, "space-y-2")}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="What should I remind you about?" maxLength={240} className={inputClass} aria-label="Reminder text" />
        <div className="flex flex-wrap items-center gap-2">
          {([[1, "Tomorrow"], [3, "In 3 days"], [7, "In a week"], ["date", "Pick a date"]] as const).map(([v, label]) => (
            <button key={String(v)} type="button" aria-pressed={when === v} onClick={() => setWhen(v)} className={cn(pill, when === v ? "bg-highlight text-on-highlight" : "bg-surface")}>
              {label}
            </button>
          ))}
          {when === "date" && <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(inputClass, "w-auto")} aria-label="Reminder date" />}
        </div>
        <button type="button" onClick={() => void add()} disabled={saving || !text.trim() || (when === "date" && !date)} className={cn(pill, "bg-highlight text-on-highlight shadow-[2px_2px_0_var(--shadow-hard)]")}>
          <Bell className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Add reminder"}
        </button>
      </div>
      <ErrorNote message={error ?? list.error} />
      {list.loading ? (
        <Spinner />
      ) : active.length === 0 ? (
        <Empty>No active reminders.</Empty>
      ) : (
        <ul className="space-y-2" aria-label="Waiting reminders">
          {active.map((r) => (
            <li key={r._id} className={cn(itemCard, "flex items-start justify-between gap-3")}>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{r.text}</p>
                <p className="mt-0.5 text-[11px] text-text-muted">{describe(r)}</p>
              </div>
              <div className="flex flex-shrink-0 gap-2">
                <button type="button" onClick={() => void act(r, "done")} aria-label="Mark done" className="cursor-pointer text-text-muted hover:text-emerald-500">
                  <Check className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => void act(r, "delete")} aria-label="Delete reminder" className="cursor-pointer text-text-muted hover:text-rose-400">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {earlier.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted">Earlier</p>
          {earlier.slice(0, 5).map((r) => (
            <div key={r._id} className="flex items-center justify-between gap-3 text-sm text-text-muted">
              <span className="truncate">{r.text}</span>
              <Chip tone={r.status === "done" ? "good" : "default"}>{r.status}</Chip>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-text-muted">Reminders after a meeting, or when a goal becomes active, are set in the full Journal.</p>
    </div>
  );
}

const STAGES: { id: IdeaStatus; label: string }[] = [
  { id: "thought", label: "Thought" },
  { id: "exploring", label: "Exploring" },
  { id: "experiment", label: "Experiment" },
  { id: "implemented", label: "Implemented" },
  { id: "dropped", label: "Dropped" },
];

function IdeasTab({ orgId }: { orgId: string }) {
  const [filter, setFilter] = useState<IdeaStatus | "all">("all");
  const list = useLoader<{ ideas: Idea[] }>(() => journalApi("/ideas", orgId, { query: { status: filter === "all" ? undefined : filter } }), `chat-ideas-${orgId}-${filter}`);
  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      list.reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const add = async () => {
    setAdding(true);
    await run(async () => {
      await journalApi("/ideas", orgId, { method: "POST", body: { title: title.trim() } });
      setTitle("");
    });
    setAdding(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && title.trim() && !adding) void add();
          }}
          placeholder="Capture a new idea…"
          className={inputClass}
          aria-label="New idea"
        />
        <button type="button" onClick={() => void add()} disabled={!title.trim() || adding} className={cn(pill, "flex-shrink-0 bg-highlight text-on-highlight shadow-[2px_2px_0_var(--shadow-hard)]")}>
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[{ id: "all" as const, label: "All" }, ...STAGES].map(({ id, label }) => (
          <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className={cn(pill, "py-0.5", filter === id ? "bg-highlight text-on-highlight" : "bg-surface")}>
            {label}
          </button>
        ))}
      </div>
      <ErrorNote message={error ?? list.error} />
      {list.loading ? (
        <Spinner />
      ) : (list.data?.ideas.length ?? 0) === 0 ? (
        <Empty>No ideas here yet. Use Brainstorming, mention one in your Journal, or add it above.</Empty>
      ) : (
        <ul className="space-y-2" aria-label="Your ideas">
          {list.data?.ideas.map((idea) => (
            <li key={idea._id} className={itemCard}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <Chip tone="primary">{idea.category}</Chip>
                    {idea.duplicate_of && <Chip tone="warn">Possible duplicate</Chip>}
                    <span className="text-[11px] text-text-muted">{formatDate(idea.created_at)}</span>
                  </div>
                  <p className="text-sm font-semibold">{idea.title}</p>
                </div>
                {confirmId === idea._id ? (
                  <span className="flex flex-shrink-0 items-center gap-2 text-xs font-bold">
                    <button type="button" onClick={() => { setConfirmId(null); void run(() => journalApi(`/ideas/${idea._id}`, orgId, { method: "DELETE" })); }} className="cursor-pointer rounded-full border-2 border-outline bg-[#FF9FA0] px-2.5 py-0.5 text-[#111]">
                      Remove?
                    </button>
                    <button type="button" onClick={() => setConfirmId(null)} className="cursor-pointer text-text-muted">
                      Keep
                    </button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmId(idea._id)} aria-label="Remove idea" className="flex-shrink-0 cursor-pointer text-text-muted hover:text-rose-400">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Idea stage">
                {STAGES.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={idea.status === id}
                    onClick={() => idea.status !== id && void run(() => journalApi(`/ideas/${idea._id}`, orgId, { method: "PUT", body: { status: id } }))}
                    className={cn("cursor-pointer rounded-full border-2 border-outline px-2.5 py-0.5 text-[11px] transition-colors", idea.status === id ? "bg-highlight font-bold text-on-highlight" : "bg-surface hover:bg-surface-light")}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {idea.connection_note && <p className="mt-2 rounded-xl border-2 border-dashed border-outline bg-surface-light px-3 py-2 text-xs">{idea.connection_note}</p>}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-text-muted">Searching ideas and linking an experiment to a review reminder are in the full Journal.</p>
    </div>
  );
}
