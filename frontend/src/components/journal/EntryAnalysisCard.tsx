"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, MessageCircleQuestion } from "lucide-react";
import { journalApi, normalizeAnalysis, type EntryKind, type EntryRow } from "@/lib/journalApi";
import { Chip, GhostButton, formatDate } from "./shared";

const KIND_LABEL: Record<EntryKind, string> = {
  idea: "Idea",
  frustration: "Frustration",
  decision: "Decision",
  concern: "Concern",
  goal: "Goal",
  opportunity: "Opportunity",
  reflection: "Reflection",
};

const KIND_TONE: Record<EntryKind, "default" | "primary" | "warn" | "good"> = {
  idea: "primary",
  frustration: "warn",
  decision: "default",
  concern: "warn",
  goal: "good",
  opportunity: "good",
  reflection: "default",
};

/** What the AI understood about one entry: kind, summary, takeaways, names, hypotheses, next questions. */
export default function EntryAnalysisCard({
  entry,
  orgId,
  onAsk,
  onOpen,
  onUpdated,
}: {
  entry: EntryRow;
  orgId: string;
  onAsk: (question: string) => void;
  onOpen: (sessionId: string) => void;
  onUpdated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [failed, setFailed] = useState(false);
  const analysis = normalizeAnalysis(entry.ai_analysis);

  const upgrade = async () => {
    setUpdating(true);
    setFailed(false);
    try {
      await journalApi(`/entries/${entry._id}/reanalyze`, orgId, { method: "POST" });
      onUpdated();
    } catch {
      setFailed(true);
    } finally {
      setUpdating(false);
    }
  };
  if (!analysis) {
    return (
      <div className="rounded-xl border border-border bg-background p-3 text-xs text-text-muted">
        {formatDate(entry.created_at)} · Still being analysed…
      </div>
    );
  }
  const { entities } = analysis;
  const entityGroups: [string, string[]][] = [
    ["People", entities.people],
    ["Projects", entities.projects],
    ["Deadlines", entities.deadlines],
    ["Problems", entities.problems],
  ];

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <button onClick={() => setOpen((value) => !value)} className="flex w-full cursor-pointer items-start justify-between gap-3 text-left">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Chip tone={KIND_TONE[analysis.kind]}>{KIND_LABEL[analysis.kind]}</Chip>
            <span className="text-[11px] text-text-muted">{formatDate(entry.created_at)}</span>
          </div>
          <p className="text-sm text-foreground">{analysis.summary || entry.content.slice(0, 120)}</p>
        </div>
        {open ? <ChevronUp className="mt-1 h-4 w-4 flex-shrink-0 text-text-muted" /> : <ChevronDown className="mt-1 h-4 w-4 flex-shrink-0 text-text-muted" />}
      </button>

      {open && (
        <div className="mt-3 space-y-3 border-t border-border pt-3 text-sm">
          {analysis.takeaways.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">Key takeaways</p>
              <ul className="list-disc space-y-0.5 pl-5 text-foreground">
                {analysis.takeaways.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {entityGroups.some(([, items]) => items.length > 0) && (
            <div className="space-y-1.5">
              {entityGroups
                .filter(([, items]) => items.length > 0)
                .map(([label, items]) => (
                  <div key={label} className="flex flex-wrap items-center gap-1.5">
                    <span className="w-16 text-[11px] text-text-muted">{label}</span>
                    {items.map((item) => (
                      <Chip key={item}>{item}</Chip>
                    ))}
                  </div>
                ))}
            </div>
          )}
          {analysis.hypotheses.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">Possible explanations (need validation)</p>
              <ul className="space-y-1">
                {analysis.hypotheses.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-foreground">
                    <Chip tone="warn">Hypothesis</Chip>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {analysis.follow_up_questions.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">Worth exploring</p>
              <div className="flex flex-col gap-1.5">
                {analysis.follow_up_questions.map((question) => (
                  <button
                    key={question}
                    onClick={() => onAsk(question)}
                    className="flex cursor-pointer items-start gap-2 rounded-lg border border-border px-3 py-2 text-left text-xs text-foreground transition-colors hover:border-primary/40"
                  >
                    <MessageCircleQuestion className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}
          {analysis.isLegacy && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-surface px-3 py-2 text-xs text-text-muted">
              This entry was analysed with an older, simpler format.
              <GhostButton onClick={() => void upgrade()} disabled={updating}>
                {updating ? "Updating…" : "Update analysis"}
              </GhostButton>
              {failed && <span className="text-rose-400">Couldn&apos;t update it. Try again.</span>}
            </div>
          )}
          {entry.session_id && (
            <button onClick={() => onOpen(entry.session_id as string)} className="cursor-pointer text-xs text-primary hover:underline">
              Open the original conversation ↗
            </button>
          )}
        </div>
      )}
    </div>
  );
}
