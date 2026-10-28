"use client";

import { useState } from "react";
import { Lightbulb, Scale, Trash2 } from "lucide-react";
import { journalApi, type Decision, type WhatIfItem, type WhatIfResult } from "@/lib/journalApi";
import { Chip, Empty, ErrorNote, GhostButton, Panel, PrimaryButton, Spinner, formatDate, inputClass, useLoader } from "./shared";

interface Draft {
  question: string;
  options: string;
  preferred: string;
  why: string;
  assumptions: string;
  risks: string;
  expected_outcome: string;
  review_on: string;
}

const EMPTY_DRAFT: Draft = { question: "", options: "", preferred: "", why: "", assumptions: "", risks: "", expected_outcome: "", review_on: "" };
const lines = (value: string) => value.split("\n").map((line) => line.trim()).filter(Boolean);

function WhatIfList({ title, items }: { title: string; items: WhatIfItem[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">{title}</p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.text} className="flex items-start gap-2 text-sm text-foreground">
            <Chip tone={item.basis === "fact" ? "good" : "warn"}>{item.basis === "fact" ? "Fact" : "Estimate"}</Chip>
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WhatIfExplorer({ orgId, onSaveDraft }: { orgId: string; onSaveDraft: (draft: Partial<Draft>) => void }) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const explore = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await journalApi<{ analysis: WhatIfResult }>("/what-if", orgId, { method: "POST", body: { question } });
      setResult(data.analysis);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Panel title="What if…?" hint="Explore a possible decision before you commit. Facts come from your business data; everything else is an estimate.">
      <div className="flex gap-2">
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && question.trim() && !loading) void explore();
          }}
          placeholder="What if I stop serving our smallest clients and focus on enterprise?"
          className={inputClass}
        />
        <PrimaryButton onClick={() => void explore()} disabled={!question.trim() || loading}>
          Explore
        </PrimaryButton>
      </div>
      <div className="mt-3 space-y-3">
        <ErrorNote message={error} />
        {loading && <Spinner />}
        {result && (
          <>
            <p className="text-sm font-medium text-foreground">{result.summary}</p>
            <WhatIfList title="Possible benefits" items={result.benefits} />
            <WhatIfList title="Costs" items={result.costs} />
            <WhatIfList title="Risks" items={result.risks} />
            {result.assumptions.length > 0 && (
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">Assumptions to test</p>
                <ul className="list-disc space-y-0.5 pl-5 text-sm text-foreground">
                  {result.assumptions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.info_needed.length > 0 && (
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">Information still needed</p>
                <ul className="list-disc space-y-0.5 pl-5 text-sm text-foreground">
                  {result.info_needed.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.first_step && <p className="rounded-xl bg-primary/5 px-3 py-2 text-sm text-foreground">A low-risk first step: {result.first_step}</p>}
            <p className="text-[11px] text-text-muted">This is a thinking aid, not a forecast.</p>
            <GhostButton
              onClick={() =>
                onSaveDraft({
                  question: question.trim(),
                  assumptions: result.assumptions.join("\n"),
                  risks: result.risks.map((r) => r.text).join("\n"),
                })
              }
            >
              <Scale className="h-3.5 w-3.5" />
              Save as a decision
            </GhostButton>
          </>
        )}
      </div>
    </Panel>
  );
}

function DecisionForm({ orgId, draft, onSaved, onCancel }: { orgId: string; draft: Draft; onSaved: () => void; onCancel: () => void }) {
  const [form, setForm] = useState<Draft>(draft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof Draft) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await journalApi("/decisions", orgId, {
        method: "POST",
        body: {
          question: form.question,
          options: lines(form.options),
          preferred: form.preferred,
          why: form.why,
          assumptions: lines(form.assumptions),
          risks: lines(form.risks),
          expected_outcome: form.expected_outcome,
          review_on: form.review_on || null,
        },
      });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="Log a decision" hint="Capture your thinking now, so you can learn from it later.">
      <div className="space-y-2.5">
        <input value={form.question} onChange={set("question")} placeholder="What needs to be decided?" className={inputClass} />
        <textarea value={form.options} onChange={set("options")} rows={2} placeholder="Options (one per line)" className={inputClass} />
        <input value={form.preferred} onChange={set("preferred")} placeholder="Which option do you prefer?" className={inputClass} />
        <textarea value={form.why} onChange={set("why")} rows={2} placeholder="Why that one?" className={inputClass} />
        <textarea value={form.assumptions} onChange={set("assumptions")} rows={2} placeholder="Assumptions (one per line)" className={inputClass} />
        <textarea value={form.risks} onChange={set("risks")} rows={2} placeholder="Risks (one per line)" className={inputClass} />
        <input value={form.expected_outcome} onChange={set("expected_outcome")} placeholder="What outcome do you expect? e.g. revenue +20% in 3 months" className={inputClass} />
        <label className="flex items-center gap-2 text-xs text-text-muted">
          Remind me to review on
          <input type="date" value={form.review_on} onChange={set("review_on")} className="rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground" />
        </label>
        <ErrorNote message={error} />
        <div className="flex gap-2">
          <PrimaryButton onClick={() => void save()} disabled={saving || !form.question.trim()}>
            {saving ? "Saving…" : "Save decision"}
          </PrimaryButton>
          <GhostButton onClick={onCancel}>Cancel</GhostButton>
        </div>
      </div>
    </Panel>
  );
}

const RESULT_LABEL = { better: "Better than expected", as_expected: "About as expected", worse: "Worse than expected" } as const;

function DecisionCard({ decision, orgId, onChanged }: { decision: Decision; orgId: string; onChanged: () => void }) {
  const [reviewing, setReviewing] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [result, setResult] = useState<"better" | "as_expected" | "worse">("as_expected");
  const [error, setError] = useState<string | null>(null);
  const overdue = decision.status === "open" && decision.review_on && new Date(decision.review_on) < new Date();

  const saveOutcome = async () => {
    try {
      await journalApi(`/decisions/${decision._id}/outcome`, orgId, { method: "POST", body: { actual_outcome: outcome, result } });
      setReviewing(false);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async () => {
    if (!window.confirm("Delete this decision?")) return;
    try {
      await journalApi(`/decisions/${decision._id}`, orgId, { method: "DELETE" });
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Chip tone={decision.status === "reviewed" ? "good" : overdue ? "warn" : "primary"}>
              {decision.status === "reviewed" ? "Reviewed" : overdue ? "Review due" : "Open"}
            </Chip>
            <span className="text-[11px] text-text-muted">Logged {formatDate(decision.created_at)}</span>
            {decision.review_on && decision.status === "open" && <span className="text-[11px] text-text-muted">· review {formatDate(decision.review_on)}</span>}
          </div>
          <p className="text-sm font-medium text-foreground">{decision.question}</p>
        </div>
        <button onClick={() => void remove()} aria-label="Delete decision" className="cursor-pointer text-text-muted hover:text-rose-400">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 space-y-1 text-xs text-text-muted">
        {decision.preferred && (
          <p>
            <span className="text-foreground">Preferred:</span> {decision.preferred}
            {decision.why ? ` — ${decision.why}` : ""}
          </p>
        )}
        {decision.options.length > 0 && <p>Options: {decision.options.join(" · ")}</p>}
        {decision.assumptions.length > 0 && <p>Assumptions: {decision.assumptions.join("; ")}</p>}
        {decision.risks.length > 0 && <p>Risks: {decision.risks.join("; ")}</p>}
        {decision.expected_outcome && (
          <p>
            <span className="text-foreground">Expected:</span> {decision.expected_outcome}
          </p>
        )}
      </div>
      {decision.status === "reviewed" && (
        <div className="mt-2 rounded-lg bg-surface px-3 py-2 text-xs">
          <Chip tone={decision.result === "worse" ? "warn" : "good"}>{RESULT_LABEL[decision.result ?? "as_expected"]}</Chip>
          <p className="mt-1 text-foreground">What actually happened: {decision.actual_outcome}</p>
        </div>
      )}
      {decision.status === "open" &&
        (reviewing ? (
          <div className="mt-3 space-y-2">
            <textarea value={outcome} onChange={(event) => setOutcome(event.target.value)} rows={2} placeholder="What actually happened?" className={inputClass} />
            <select value={result} onChange={(event) => setResult(event.target.value as typeof result)} className={inputClass}>
              {(Object.keys(RESULT_LABEL) as (keyof typeof RESULT_LABEL)[]).map((key) => (
                <option key={key} value={key}>
                  {RESULT_LABEL[key]}
                </option>
              ))}
            </select>
            <ErrorNote message={error} />
            <div className="flex gap-2">
              <PrimaryButton onClick={() => void saveOutcome()} disabled={!outcome.trim()}>
                Save outcome
              </PrimaryButton>
              <GhostButton onClick={() => setReviewing(false)}>Cancel</GhostButton>
            </div>
          </div>
        ) : (
          <GhostButton className="mt-3" onClick={() => setReviewing(true)}>
            <Lightbulb className="h-3.5 w-3.5" />
            Record what happened
          </GhostButton>
        ))}
    </div>
  );
}

export default function DecisionsView({ orgId, prefill }: { orgId: string; prefill?: string }) {
  const list = useLoader<{ decisions: Decision[] }>(() => journalApi("/decisions", orgId), `decisions-${orgId}`);
  const [draft, setDraft] = useState<Draft | null>(() => (prefill ? { ...EMPTY_DRAFT, question: prefill.slice(0, 300) } : null));

  return (
    <div className="space-y-4">
      <WhatIfExplorer orgId={orgId} onSaveDraft={(partial) => setDraft({ ...EMPTY_DRAFT, ...partial })} />
      {draft ? (
        <DecisionForm
          orgId={orgId}
          draft={draft}
          onCancel={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            list.reload();
          }}
        />
      ) : (
        <PrimaryButton onClick={() => setDraft(EMPTY_DRAFT)}>
          <Scale className="h-4 w-4" />
          Log a decision
        </PrimaryButton>
      )}
      <Panel title="Your decisions" hint="Review them later to see how your thinking held up.">
        <ErrorNote message={list.error} />
        {list.loading ? (
          <Spinner />
        ) : (list.data?.decisions.length ?? 0) === 0 ? (
          <Empty>No decisions logged yet.</Empty>
        ) : (
          <div className="space-y-2">
            {list.data?.decisions.map((decision) => (
              <DecisionCard key={decision._id} decision={decision} orgId={orgId} onChanged={list.reload} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
