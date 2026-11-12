"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, RefreshCw, Trash2 } from "lucide-react";
import { useOrganizationStore } from "@/stores/organizationStore";
import { journalApi, type EntryRow } from "@/lib/journalApi";
import { getAuthHeaders, cn } from "@/lib/utils";
import { RecapNudge } from "@/components/journal/ChatNudges";
import EntryAnalysisCard from "@/components/journal/EntryAnalysisCard";
import InsightsView from "@/components/journal/InsightsView";
import DecisionsView from "@/components/journal/DecisionsView";
import IdeasView from "@/components/journal/IdeasView";
import RecapsView from "@/components/journal/RecapsView";
import RemindersView from "@/components/journal/RemindersView";
import AskJournalView from "@/components/journal/AskJournalView";
import { Chip, Empty, ErrorNote, GhostButton, SectionBoundary, Spinner, useLoader } from "@/components/journal/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

export type Section = "entries" | "insights" | "decisions" | "ideas" | "recaps" | "reminders" | "ask";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "entries", label: "Entries" },
  { id: "insights", label: "Mood & patterns" },
  { id: "decisions", label: "Decisions" },
  { id: "ideas", label: "Idea vault" },
  { id: "recaps", label: "Recaps" },
  { id: "reminders", label: "Reminders" },
  { id: "ask", label: "Ask your journal" },
];

const MOODS: Record<string, { emoji: string; label: string }> = {
  great: { emoji: "😄", label: "Great" },
  good: { emoji: "🙂", label: "Good" },
  okay: { emoji: "😐", label: "Okay" },
  bad: { emoji: "😞", label: "Low" },
};

type Entry = EntryRow & { mood?: string | null };
type Turn = { role: string; content: string };
type Focus = { entryId?: string; sessionId?: string; nonce: number };

/** Fetches the conversation behind one entry the first time it is opened. */
function Transcript({ entryId }: { entryId: string }) {
  const { data, loading, error } = useLoader<Turn[]>(async () => {
    const res = await fetch(`${API_URL}/journal/${entryId}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error("Couldn't load the conversation.");
    const body = (await res.json()) as { entry?: { messages?: Turn[]; content?: string } };
    const turns = (body.entry?.messages ?? []).filter((m) => (m.content || "").trim());
    return turns.length ? turns : [{ role: "user", content: body.entry?.content ?? "" }];
  }, `transcript-${entryId}`);

  if (loading) return <Spinner />;
  if (error) return <ErrorNote message={error} />;
  return (
    <div className="space-y-2 rounded-xl border border-border bg-background p-3">
      {(data ?? []).map((turn, i) => (
        <div key={i} className={cn("flex", turn.role === "user" ? "justify-end" : "justify-start")}>
          <p
            className={cn(
              "max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm",
              turn.role === "user" ? "bg-primary/10 text-foreground" : "border border-border bg-surface text-foreground/90"
            )}
          >
            {turn.content}
          </p>
        </div>
      ))}
    </div>
  );
}

function EntryItem({
  entry,
  orgId,
  expanded,
  onToggle,
  onAsk,
  onOpenSession,
  onUpdated,
  onDeleted,
}: {
  entry: Entry;
  orgId: string;
  expanded: boolean;
  onToggle: () => void;
  onAsk: (question: string) => void;
  onOpenSession: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mood = entry.mood ? MOODS[entry.mood] : null;
  const ref = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (expanded) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [expanded]);

  const remove = async () => {
    if (!window.confirm("Delete this journal entry? This can't be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/journal/${entry._id}`, { method: "DELETE", headers: getAuthHeaders() });
      if (!res.ok) throw new Error();
      onDeleted();
    } catch {
      setError("Couldn't delete this entry. Try again.");
      setBusy(false);
    }
  };

  return (
    <li ref={ref} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {mood && (
          <Chip tone={entry.mood === "bad" ? "warn" : entry.mood === "okay" ? "default" : "good"}>
            {mood.emoji} {mood.label}
          </Chip>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <GhostButton onClick={onToggle} aria-expanded={expanded}>
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Conversation
          </GhostButton>
          <GhostButton onClick={() => void remove()} disabled={busy} aria-label="Delete entry">
            <Trash2 className="h-3.5 w-3.5" />
          </GhostButton>
        </div>
      </div>
      <EntryAnalysisCard entry={entry} orgId={orgId} onAsk={onAsk} onOpen={onOpenSession} onUpdated={onUpdated} />
      {expanded && <Transcript entryId={entry._id} />}
      <ErrorNote message={error} />
    </li>
  );
}

/** Every journal entry, newest first, with the mood and what the AI understood about each. */
function Entries({ orgId, focus, onAsk, onSection }: { orgId: string; focus: Focus | null; onAsk: (q: string) => void; onSection: (s: Section) => void }) {
  const entries = useLoader<{ entries: Entry[] }>(() => journalApi("/entries", orgId, { query: { limit: 50 } }), `journal-entries-${orgId}`);
  const [open, setOpen] = useState<string | null>(null);
  const handled = useRef(0);

  const list = useMemo(() => entries.data?.entries ?? [], [entries.data]);
  const pollUntil = useRef(0);
  const { reload } = entries;

  // an entry that is still being analysed fills in by itself; an old one that never will is not polled for ever
  useEffect(() => {
    if (!list.some((e) => !e.ai_analysis)) {
      pollUntil.current = 0;
      return;
    }
    if (!pollUntil.current) pollUntil.current = Date.now() + 90_000;
    const timer = setInterval(() => {
      if (Date.now() > pollUntil.current) clearInterval(timer);
      else reload();
    }, 4000);
    return () => clearInterval(timer);
  }, [list, reload]);

  // a link from elsewhere (a reminder, a pattern's source) opens its entry
  useEffect(() => {
    if (!focus || handled.current === focus.nonce || !entries.data) return;
    handled.current = focus.nonce;
    const hit = list.find((e) => e._id === focus.entryId || (focus.sessionId && e.session_id === focus.sessionId));
    setOpen(hit ? hit._id : null);
  }, [focus, entries.data, list]);

  return (
    <div className="space-y-4">
      <div>
        <RecapNudge orgId={orgId} onOpen={() => onSection("recaps")} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-text-muted">Reflections you write in the chat are saved here, privately, with a mood and a summary.</p>
        <GhostButton onClick={entries.reload}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </GhostButton>
      </div>
      <ErrorNote message={entries.error} />
      {entries.loading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <Empty>No journal entries yet. Write about your day in the chat and it will appear here.</Empty>
      ) : (
        <ul className="space-y-5">
          {list.map((entry) => (
            <EntryItem
              key={entry._id}
              entry={entry}
              orgId={orgId}
              expanded={open === entry._id}
              onToggle={() => setOpen((cur) => (cur === entry._id ? null : entry._id))}
              onAsk={onAsk}
              onOpenSession={() => setOpen(entry._id)}
              onUpdated={entries.reload}
              onDeleted={entries.reload}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** `startSection`: which section to open first, e.g. the mood trend after tapping "See your mood trend". */
export function JournalsTab({ onAsk, startSection }: { onAsk: (question: string) => void; startSection?: Section }) {
  const { organization } = useOrganizationStore();
  const [section, setSection] = useState<Section>(startSection ?? "entries");
  const [focus, setFocus] = useState<Focus | null>(null);
  const orgId = organization?.id;

  // Open the entry behind a reminder, source link or analysis: show it in Entries.
  const openEntry = (target: { entryId?: string; sessionId?: string }) => {
    setFocus({ ...target, nonce: Date.now() });
    setSection("entries");
  };

  if (!orgId) return <Spinner />;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-shrink-0 flex-wrap gap-1.5" role="tablist" aria-label="Journal sections">
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={section === item.id}
            onClick={() => setSection(item.id)}
            className={cn(
              "cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors",
              section === item.id ? "border-primary bg-primary/10 text-primary" : "border-border text-text-muted hover:border-primary/40 hover:text-foreground"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
        <SectionBoundary resetKey={section}>
          {section === "entries" && <Entries orgId={orgId} focus={focus} onAsk={onAsk} onSection={setSection} />}
          {section === "insights" && <InsightsView orgId={orgId} onAsk={onAsk} onOpen={(sessionId) => openEntry({ sessionId })} />}
          {section === "decisions" && <DecisionsView orgId={orgId} />}
          {section === "ideas" && <IdeasView orgId={orgId} onOpen={(sessionId) => openEntry({ sessionId })} />}
          {section === "recaps" && <RecapsView orgId={orgId} onOpen={(sessionId) => openEntry({ sessionId })} />}
          {section === "reminders" && <RemindersView orgId={orgId} onOpen={(entryId) => openEntry({ entryId })} />}
          {section === "ask" && <AskJournalView orgId={orgId} onOpen={(sessionId) => openEntry({ sessionId })} />}
        </SectionBoundary>
      </div>
    </div>
  );
}
