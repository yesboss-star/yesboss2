"use client";

import { useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { InlineConfirm } from "@/components/ui/InlineConfirm";
import { journalApi, type Idea, type IdeaStatus } from "@/lib/journalApi";
import { Chip, Empty, ErrorNote, GhostButton, Panel, PrimaryButton, SourceLinks, Spinner, formatDate, inputClass, itemCard, useLoader } from "./shared";

const STATUSES: { id: IdeaStatus; label: string }[] = [
  { id: "thought", label: "Thought" },
  { id: "exploring", label: "Exploring" },
  { id: "experiment", label: "Experiment" },
  { id: "implemented", label: "Implemented" },
  { id: "dropped", label: "Dropped" },
];

function IdeaCard({ idea, orgId, onChanged, onOpen }: { idea: Idea; orgId: string; onChanged: () => void; onOpen: (sessionId: string) => void }) {
  const [error, setError] = useState<string | null>(null);

  const update = async (body: Record<string, unknown>) => {
    setError(null);
    try {
      await journalApi(`/ideas/${idea._id}`, orgId, { method: "PUT", body });
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // choosing "Experiment" asks how many days until the review, on the page (empty means no reminder)
  const [askDays, setAskDays] = useState(false);
  const [days, setDays] = useState("30");

  const changeStatus = (status: IdeaStatus) => {
    if (status === "experiment") {
      setAskDays(true);
      return;
    }
    void update({ status });
  };

  const startExperiment = () => {
    const n = Number(days);
    const body: Record<string, unknown> = { status: "experiment" };
    if (days.trim() && Number.isFinite(n) && n > 0) body.experiment_days = Math.round(n);
    setAskDays(false);
    void update(body);
  };

  const remove = async () => {
    try {
      await journalApi(`/ideas/${idea._id}`, orgId, { method: "DELETE" });
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className={itemCard}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <Chip tone="primary">{idea.category}</Chip>
            {idea.duplicate_of && <Chip tone="warn">Possible duplicate</Chip>}
            <span className="text-[11px] text-text-muted">{formatDate(idea.created_at)}</span>
          </div>
          <p className="text-sm text-foreground">{idea.title}</p>
        </div>
        <InlineConfirm
          label="Remove?"
          onConfirm={() => void remove()}
          trigger={(arm) => (
            <button onClick={arm} aria-label="Remove idea" className="cursor-pointer text-text-muted hover:text-rose-400">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Idea stage">
        {STATUSES.map(({ id, label }) => (
          <button
            key={id}
            role="radio"
            aria-checked={idea.status === id}
            onClick={() => idea.status !== id && changeStatus(id)}
            className={`cursor-pointer rounded-full border-2 px-2.5 py-0.5 text-[11px] transition-colors ${
              idea.status === id ? "border-outline bg-highlight font-bold text-on-highlight" : "border-outline bg-surface text-foreground hover:bg-surface-light"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {askDays && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border-2 border-dashed border-outline bg-surface-light px-3 py-2 text-xs">
          <label htmlFor={`days-${idea._id}`} className="font-medium">Review this experiment after how many days? (empty for no reminder)</label>
          <input
            id={`days-${idea._id}`}
            type="number"
            min={1}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="w-20 rounded-lg border-2 border-outline bg-surface px-2 py-1"
          />
          <GhostButton onClick={startExperiment}>Start experiment</GhostButton>
          <GhostButton onClick={() => setAskDays(false)}>Cancel</GhostButton>
        </div>
      )}

      {idea.connection_note && (
        <p className="mt-2 rounded-xl border-2 border-dashed border-outline bg-surface-light px-3 py-2 text-xs text-foreground">{idea.connection_note}</p>
      )}
      {idea.connections.length > 0 && <SourceLinks sources={idea.connections} onOpen={onOpen} />}
      {(idea.links?.goal_ids?.length ?? 0) > 0 && (
        <p className="mt-2 text-[11px] text-text-muted">Looks related to {idea.links?.goal_ids?.length} of your active goals.</p>
      )}
      <ErrorNote message={error} />
    </div>
  );
}

export default function IdeasView({ orgId, onOpen }: { orgId: string; onOpen: (sessionId: string) => void }) {
  const [filter, setFilter] = useState<IdeaStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [searchKey, setSearchKey] = useState("");
  const [newIdea, setNewIdea] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useLoader<{ ideas: Idea[] }>(
    () =>
      searchKey
        ? journalApi("/ideas/search", orgId, { query: { q: searchKey } })
        : journalApi("/ideas", orgId, { query: { status: filter === "all" ? undefined : filter } }),
    `ideas-${orgId}-${filter}-${searchKey}`
  );

  const add = async () => {
    setAdding(true);
    setError(null);
    try {
      await journalApi("/ideas", orgId, { method: "POST", body: { title: newIdea } });
      setNewIdea("");
      list.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="Idea vault" hint="Ideas from your journal are saved here automatically and connected to what you wrote before.">
        <div className="flex gap-2">
          <input
            value={newIdea}
            onChange={(event) => setNewIdea(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && newIdea.trim() && !adding) void add();
            }}
            placeholder="Capture a new idea…"
            className={inputClass}
          />
          <PrimaryButton onClick={() => void add()} disabled={!newIdea.trim() || adding}>
            <Plus className="h-4 w-4" />
            Add
          </PrimaryButton>
        </div>
        <div className="mt-3 flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") setSearchKey(query.trim().length >= 2 ? query.trim() : "");
              }}
              placeholder="Search in plain language, e.g. ideas about customer retention"
              className={`${inputClass} pl-9`}
            />
          </div>
          {searchKey && (
            <GhostButton
              onClick={() => {
                setQuery("");
                setSearchKey("");
              }}
            >
              Clear
            </GhostButton>
          )}
        </div>
        {!searchKey && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[{ id: "all" as const, label: "All" }, ...STATUSES].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={`cursor-pointer rounded-full border-2 px-3 py-1 text-xs transition-colors ${
                  filter === id ? "border-outline bg-highlight font-bold text-on-highlight" : "border-outline bg-surface text-foreground hover:bg-surface-light"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </Panel>
      <ErrorNote message={error ?? list.error} />
      {list.loading ? (
        <Spinner />
      ) : (list.data?.ideas.length ?? 0) === 0 ? (
        <Empty>{searchKey ? "No matching ideas found." : "No ideas yet. Mention one in your journal, or add it above."}</Empty>
      ) : (
        <div className="space-y-2">
          {list.data?.ideas.map((idea) => (
            <IdeaCard key={idea._id} idea={idea} orgId={orgId} onChanged={list.reload} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}
