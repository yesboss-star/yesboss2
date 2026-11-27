"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUp, Check, Mail, Minus, X } from "lucide-react";
import { Badge, Button, Checkbox } from "@/components/ui";
import { useOrganizationStore } from "@/stores/organizationStore";
import {
  useReviewStore,
  type ReviewEvidence,
  type ReviewItem,
  type ReviewReportRow,
  type ReviewScope,
  type ReviewTrend,
} from "@/stores/reviewStore";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { key: "done", title: "Done this week", empty: "Nothing was finished this week yet.", tone: "text-emerald-400" },
  { key: "missed", title: "Missed", empty: "Nothing is past its due date.", tone: "text-rose-400" },
  { key: "open", title: "Still open", empty: "Nothing is waiting.", tone: "text-foreground" },
  { key: "no_evidence", title: "No evidence either way", empty: "Nothing is unclear.", tone: "text-amber-400" },
] as const;

const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : null);

function EvidenceLine({ e }: { e: ReviewEvidence }) {
  const label = e.strength === "hard" ? "Confirmed" : e.strength === "manual" ? "Marked done" : "A report suggests";
  return (
    <div className="text-xs text-text-muted flex flex-wrap items-center gap-1.5">
      <Badge variant={e.strength === "soft" ? "warning" : "success"}>{label}</Badge>
      {e.note}
      {e.at && <span>· {day(e.at)}</span>}
    </div>
  );
}

function Item({ item, onDone, onDrop, busy }: { item: ReviewItem; onDone: () => void; onDrop: () => void; busy: boolean }) {
  const open = item.state !== "done";
  return (
    <li className="rounded-xl border border-border bg-surface p-3 space-y-1.5">
      <div className="flex items-start gap-2">
        <p className="text-sm text-foreground flex-1">{item.text}</p>
        {item.decided_this_week && <Badge variant="info">Decided this week</Badge>}
      </div>
      <p className="text-xs text-text-muted">
        {item.owner_name || item.owner_email || "Nobody named"}
        {item.due_date ? ` · due ${day(item.due_date)}` : ""}
        {item.task?.status ? ` · task ${item.task.status}` : item.task ? "" : " · no task yet"}
        {" · from "}
        <Link href="/dashboard/home" className="text-primary hover:underline">
          {item.capture.title || "a capture"}
        </Link>
      </p>
      {item.evidence.map((e, i) => (
        <EvidenceLine key={i} e={e} />
      ))}
      {open && (
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="secondary" disabled={busy} onClick={onDone}>
            <Check className="h-3.5 w-3.5" /> Mark done
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onDrop}>
            <X className="h-3.5 w-3.5" /> Not a commitment
          </Button>
        </div>
      )}
    </li>
  );
}

function ReportRow({ r }: { r: ReviewReportRow }) {
  const Arrow = r.direction === "up" ? ArrowUp : r.direction === "down" ? ArrowDown : Minus;
  return (
    <li className="rounded-xl border border-border bg-surface p-3 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-sm font-medium text-foreground capitalize">{r.metric}</span>
      <span className="text-sm text-text-muted flex items-center gap-1.5">
        {r.previous.display} <ArrowRight className="h-3.5 w-3.5" /> <span className="text-foreground">{r.latest.display}</span>
      </span>
      <span className="text-xs flex items-center gap-1 text-foreground">
        <Arrow className="h-3.5 w-3.5" />
        {r.direction === "flat" ? "no change" : r.change_pct !== null ? `${r.change_pct > 0 ? "+" : ""}${(r.change_pct * 100).toFixed(1)}%` : r.change_display}
      </span>
      <span className="text-xs text-text-muted ml-auto">
        {r.series ? `${r.series} · ` : ""}
        {r.latest.capture.title || "report"}
      </span>
    </li>
  );
}

/** A tiny line of the last few reports. It shows the shape only; the numbers are beside it. */
function Sparkline({ values }: { values: number[] }) {
  const w = 96;
  const h = 28;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const x = (i: number) => (values.length === 1 ? w / 2 : (i / (values.length - 1)) * (w - 6) + 3);
  const y = (v: number) => h - 4 - ((v - min) / span) * (h - 8);
  const line = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Last ${values.length} reports`} className="text-primary">
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="2.5" fill="currentColor" />
    </svg>
  );
}

function TrendRow({ t }: { t: ReviewTrend }) {
  const last = t.points[t.points.length - 1];
  const first = t.points[0];
  return (
    <li className="rounded-xl border border-border bg-surface p-3 flex flex-wrap items-center gap-x-4 gap-y-1">
      <div className="min-w-[8rem]">
        <p className="text-sm font-medium text-foreground capitalize">{t.metric}</p>
        <p className="text-xs text-text-muted">{t.series ?? "reports"}</p>
      </div>
      <Sparkline values={t.points.map((p) => p.value)} />
      <p className="text-sm text-foreground">
        {last.display}
        {t.change_pct !== null && (
          <span className="text-xs text-text-muted"> · {t.change_pct > 0 ? "+" : ""}{(t.change_pct * 100).toFixed(1)}% since {first.period}</span>
        )}
      </p>
      {t.note && <Badge variant={t.direction === "flat" ? "secondary" : "info"}>{t.note}</Badge>}
    </li>
  );
}

export default function WeeklyReviewPage() {
  const { organization } = useOrganizationStore();
  const { review, canSeeCompany, emailEnabled, loading, error, notice, fetchReview, markDone, drop, setEmailEnabled, emailMe } =
    useReviewStore();
  const [scope, setScope] = useState<ReviewScope>("personal");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (organization?.id) void fetchReview(organization.id, scope);
  }, [organization?.id, scope, fetchReview]);

  const orgId = organization?.id;
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const counts = review?.counts;
  const tiles = counts
    ? [
        ["Decided", counts.decided],
        ["Done", counts.done],
        ["Open", counts.open],
        ["Missed", counts.missed],
        ["Unclear", counts.no_evidence],
      ]
    : [];
  const nothing = !!counts && !tiles.some(([, n]) => Number(n) > 0) && counts.report_changes === 0 && !review?.trends.length;

  return (
    <>
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent">
            Weekly review
          </h1>
          <p className="text-text-muted mt-1">
            What was decided, what got done, what did not, and what your reports say. Every line shows where it came from.
          </p>
        </div>

        {canSeeCompany && (
          <div className="flex gap-2" role="tablist" aria-label="Which review">
            {(["personal", "company"] as ReviewScope[]).map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={scope === s}
                onClick={() => setScope(s)}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm border transition-colors cursor-pointer",
                  scope === s ? "bg-primary text-white border-primary" : "border-border text-text-muted hover:text-foreground hover:border-primary"
                )}
              >
                {s === "personal" ? "My week" : "Company"}
              </button>
            ))}
          </div>
        )}

        {scope === "company" && (
          <p className="text-xs text-text-muted">
            The company view only uses captures shared with the company or with named people. Private captures and journals are never in it.
          </p>
        )}

        {error && (
          <p className="text-sm text-rose-400" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="text-sm text-emerald-400" role="status">
            {notice}
          </p>
        )}

        {loading && !review ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : review ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {tiles.map(([label, n]) => (
                <div key={label} className="rounded-xl border border-border bg-surface p-3">
                  <p className="text-2xl font-semibold text-foreground">{n}</p>
                  <p className="text-xs text-text-muted">{label}</p>
                </div>
              ))}
            </div>

            {nothing && (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-text-muted text-sm">
                Nothing to review yet. Save meeting notes with action items on the Capture page, create tasks from the suggestions, and
                they appear here.
              </div>
            )}

            {SECTIONS.map(({ key, title, empty, tone }) => {
              const items = review[key];
              if (nothing) return null;
              return (
                <section key={key} className="space-y-2" aria-label={title}>
                  <h2 className={cn("text-sm font-semibold", tone)}>
                    {title} <span className="text-text-muted font-normal">({items.length})</span>
                  </h2>
                  {items.length === 0 ? (
                    <p className="text-xs text-text-muted">{empty}</p>
                  ) : (
                    <ul className="space-y-2">
                      {items.map((item) => (
                        <Item
                          key={item.id}
                          item={item}
                          busy={busy}
                          onDone={() => orgId && run(() => markDone(item.id, orgId, scope))}
                          onDrop={() => orgId && run(() => drop(item.id, orgId, scope))}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}

            {review.reports.length > 0 && (
              <section className="space-y-2" aria-label="What the reports say">
                <h2 className="text-sm font-semibold text-foreground">What the reports say</h2>
                <ul className="space-y-2">
                  {review.reports.map((r) => (
                    <ReportRow key={`${r.series}-${r.metric}`} r={r} />
                  ))}
                </ul>
              </section>
            )}

            {review.trends.length > 0 && (
              <section className="space-y-2" aria-label="Trends">
                <h2 className="text-sm font-semibold text-foreground">Trends over the last few reports</h2>
                <ul className="space-y-2">
                  {review.trends.map((t) => (
                    <TrendRow key={`${t.series}-${t.metric}`} t={t} />
                  ))}
                </ul>
              </section>
            )}

            <section className="rounded-2xl border border-border bg-surface p-4 space-y-3" aria-label="Weekly email">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Mail className="h-4 w-4" /> Weekly email
              </h2>
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <Checkbox checked={emailEnabled} onCheckedChange={(v) => void setEmailEnabled(v === true)} aria-label="Email me this review every Monday" />
                Email me this review every Monday morning
              </label>
              <p className="text-xs text-text-muted">Switching it off only stops the email. This page stays available.</p>
              <Button size="sm" variant="secondary" disabled={!orgId} onClick={() => orgId && void emailMe(orgId, scope)}>
                Email it to me now
              </Button>
            </section>
          </>
        ) : null}
      </div>
    </>
  );
}
