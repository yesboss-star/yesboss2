"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { journalApi, type Recap } from "@/lib/journalApi";
import { Chip, Empty, ErrorNote, GhostButton, Panel, PrimaryButton, SourceLinks, Spinner, formatDate, useLoader } from "./shared";

interface RecapResponse {
  recaps: Recap[];
  labels: Record<string, string>;
}

function RecapCard({ recap, labels, onOpen }: { recap: Recap; labels: Record<string, string>; onOpen: (sessionId: string) => void }) {
  const sourceById = new Map(recap.sources.map((source) => [source.entry_id, source]));
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <Chip tone={recap.period === "weekly" ? "primary" : "default"}>{recap.period === "weekly" ? "Weekly recap" : "Daily recap"}</Chip>
        <span className="text-xs text-text-muted">{recap.range_key.includes("..") ? recap.range_key.replace("..", " to ") : formatDate(recap.range_key)}</span>
      </div>
      <div className="space-y-4">
        {Object.entries(recap.sections).map(([key, items]) => (
          <div key={key}>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">{labels[key] ?? key}</p>
            <ul className="space-y-1.5">
              {items.map((item) => (
                <li key={item.text} className="text-sm text-foreground">
                  {item.text}
                  <SourceLinks sources={item.entry_ids.map((id) => sourceById.get(id)).filter((s): s is NonNullable<typeof s> => !!s)} onOpen={onOpen} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[11px] text-text-muted">Based on {recap.sources.length} {recap.sources.length === 1 ? "entry" : "entries"}. Tap a date to check the original.</p>
    </div>
  );
}

export default function RecapsView({ orgId, onOpen }: { orgId: string; onOpen: (sessionId: string) => void }) {
  const list = useLoader<RecapResponse>(() => journalApi("/recaps", orgId, { query: { limit: 12 } }), `recaps-${orgId}`);
  const [busy, setBusy] = useState<"daily" | "weekly" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async (period: "daily" | "weekly") => {
    setBusy(period);
    setError(null);
    try {
      await journalApi("/recaps/generate", orgId, { method: "POST", query: { period } });
      list.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="Reflections" hint="A daily recap is made each evening and a weekly one on Sunday. You can also create one now.">
        <div className="flex flex-wrap gap-2">
          <PrimaryButton onClick={() => void generate("daily")} disabled={busy !== null}>
            <Sparkles className="h-4 w-4" />
            {busy === "daily" ? "Writing…" : "Recap today"}
          </PrimaryButton>
          <GhostButton onClick={() => void generate("weekly")} disabled={busy !== null} className="px-4 py-2 text-sm">
            {busy === "weekly" ? "Writing…" : "Recap this week"}
          </GhostButton>
        </div>
        <div className="mt-3">
          <ErrorNote message={error ?? list.error} />
        </div>
      </Panel>
      {list.loading ? (
        <Spinner />
      ) : (list.data?.recaps.length ?? 0) === 0 ? (
        <Empty>No recaps yet. Write a few journal entries, then tap “Recap today”.</Empty>
      ) : (
        <div className="space-y-3">
          {list.data?.recaps.map((recap) => (
            <RecapCard key={recap._id} recap={recap} labels={list.data?.labels ?? {}} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}
