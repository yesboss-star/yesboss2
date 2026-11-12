"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  Inbox,
  Link2,
  ListChecks,
  Loader2,
  Mail,
  MessageSquare,
  Mic,
  Paperclip,
  RefreshCw,
  Search,
  Trash2,
  User,
  X,
} from "lucide-react";
import { Badge, Button, Input } from "@/components/ui";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useCaptureStore, type Capture, type CaptureStatus, type CaptureSuggestion } from "@/stores/captureStore";
import { cn } from "@/lib/utils";

const ACTIVE: CaptureStatus[] = ["queued", "processing"];

function deleteWarning(c: Capture): string {
  if (c.raw_ref?.type === "journal_entry") return "Delete this note? The journal entry it came from is deleted too.";
  if (c.raw_ref?.type === "file") return "Delete this note? The uploaded file stays in Uploaded Data.";
  return "Delete this note?";
}

const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : "no date");

function Entities({ capture }: { capture: Capture }) {
  const e = capture.entities;
  if (!e) return null;
  const groups: [string, string[], React.ElementType][] = [
    ["People", e.people, User],
    ["Dates", e.dates, CalendarDays],
    ["Amounts", e.amounts, ListChecks],
    ["Topics", e.kpis, ListChecks],
  ];
  const shown = groups.filter(([, items]) => items?.length);
  if (!shown.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Found in this note">
      {shown.flatMap(([label, items, Icon]) =>
        items.slice(0, 6).map((item) => (
          <Badge key={`${label}-${item}`} variant="outline" className="gap-1" title={label}>
            <Icon className="h-3 w-3" />
            {item}
          </Badge>
        ))
      )}
    </div>
  );
}

function Related({ capture }: { capture: Capture }) {
  if (!capture.links.length) return null;
  const label = { goal: "Goal", task: "Task", capture: "Note" } as const;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-text-muted flex items-center gap-1">
        <Link2 className="h-3.5 w-3.5" /> Related
      </p>
      <ul className="space-y-1">
        {capture.links.map((l) => (
          <li key={`${l.type}-${l.id}`} className="text-xs text-foreground/90" title={l.reason ?? undefined}>
            <Badge variant="secondary" className="mr-1.5">{label[l.type]}</Badge>
            {l.title}
            {l.reason && <span className="text-text-muted"> · {l.reason}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Suggestion({ capture, s, busy, setBusy }: { capture: Capture; s: CaptureSuggestion; busy: boolean; setBusy: (b: boolean) => void }) {
  const { acceptSuggestion, dismissSuggestion } = useCaptureStore();
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch {
      // the store shows the message
    } finally {
      setBusy(false);
    }
  };
  const resolved = s.status === "accepted" || s.status === "dismissed";
  return (
    <li className={cn("rounded-xl border border-border p-3 space-y-1", resolved && "opacity-60")}>
      <p className={cn("text-sm text-foreground", s.status === "dismissed" && "line-through")}>{s.title}</p>
      <p className="text-xs text-text-muted">
        {s.assignee_email ? `For ${s.assignee_email}` : "For you"} · due {day(s.due_date)}
        {s.reason ? ` · “${s.reason}”` : ""}
      </p>
      {s.status === "accepted" ? (
        <p className="text-xs text-emerald-400 flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Task created</p>
      ) : s.status === "dismissed" ? (
        <p className="text-xs text-text-muted">Dismissed</p>
      ) : (
        <div className="flex gap-2 pt-1">
          <Button size="sm" disabled={busy || s.status === "accepting"} onClick={() => run(() => acceptSuggestion(capture.id, s.id))}>
            <Check className="h-3.5 w-3.5" /> Create task
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => dismissSuggestion(capture.id, s.id))}>
            <X className="h-3.5 w-3.5" /> Dismiss
          </Button>
        </div>
      )}
    </li>
  );
}

function SavedItem({ capture }: { capture: Capture }) {
  const { deleteCapture, reanalyze } = useCaptureStore();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const SourceIcon =
    capture.source === "voice" ? Mic : capture.source === "file" ? Paperclip : capture.source === "email" ? Mail : capture.source === "cliq" ? MessageSquare : null;
  // Without an AI model the "summary" is just the first sentence again, so only show a written one.
  const summary = capture.analysis?.provider === "llm" ? capture.analysis.summary : null;
  const full = capture.text || "";
  const expandable = full.length > (capture.preview?.length ?? 0) + 1;
  const suggestions = [
    ...capture.suggestions.filter((s) => s.status === "pending" || s.status === "accepting"),
    ...capture.suggestions.filter((s) => s.status === "accepted" || s.status === "dismissed"),
  ];

  const guard = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch {
      // the store shows the message
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-2xl border border-border bg-surface p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
        {SourceIcon && <SourceIcon className="h-3.5 w-3.5" aria-label={capture.source} />}
        <span>{new Date(capture.created_at).toLocaleString()}</span>
      </div>

      {capture.title && <h3 className="text-sm font-semibold text-foreground">{capture.title}</h3>}
      {summary && <p className="text-sm text-foreground/80 italic">{summary}</p>}
      {(capture.preview || full) && (
        <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">{open ? full : capture.preview}</p>
      )}
      {expandable && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs text-primary hover:underline cursor-pointer">
          {open ? "Show less" : "Show more"}
        </button>
      )}

      {ACTIVE.includes(capture.status) && (
        <p className="flex items-center gap-1.5 text-xs text-primary" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analysing…
        </p>
      )}
      {capture.status === "failed" && (
        <p className="flex items-center gap-2 text-xs text-rose-400">
          <AlertTriangle className="h-3.5 w-3.5" /> The analysis failed{capture.error ? `: ${capture.error}` : "."}
          <button type="button" disabled={busy} onClick={() => guard(() => reanalyze(capture.id))} className="text-primary hover:underline cursor-pointer">
            Try again
          </button>
        </p>
      )}

      <Entities capture={capture} />
      <Related capture={capture} />

      {suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-text-muted flex items-center gap-1">
            <ListChecks className="h-3.5 w-3.5" /> Suggested tasks
          </p>
          <ul className="space-y-2">
            {suggestions.map((s) => (
              <Suggestion key={s.id} capture={capture} s={s} busy={busy} setBusy={setBusy} />
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-1 pt-1">
        <div className="ml-auto flex items-center gap-1">
          {!ACTIVE.includes(capture.status) && (
            <Button variant="ghost" size="sm" onClick={() => guard(() => reanalyze(capture.id))} disabled={busy}>
              <RefreshCw className="h-3.5 w-3.5" /> Re-analyse
            </Button>
          )}
          <Button
            variant="ghost"
            size="iconSm"
            aria-label="Delete note"
            disabled={busy}
            onClick={() => window.confirm(deleteWarning(capture)) && guard(() => deleteCapture(capture.id))}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </li>
  );
}

/** Notes that arrived outside the chat (forwarded email, Cliq) and the meeting notes read in the chat. */
export function CaptureList() {
  const { organization } = useOrganizationStore();
  const { captures, total, loading, error, fetchCaptures } = useCaptureStore();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (organization?.id) void fetchCaptures(organization.id, { q: debounced });
  }, [organization?.id, debounced, fetchCaptures]);

  // While something is being analysed, check back until it finishes.
  const working = captures.some((c) => ACTIVE.includes(c.status));
  useEffect(() => {
    if (!working || !organization?.id) return;
    const timer = setInterval(() => void fetchCaptures(organization.id, { q: debounced }, { silent: true }), 2500);
    return () => clearInterval(timer);
  }, [working, organization?.id, debounced, fetchCaptures]);

  return (
    <section className="space-y-4" aria-label="Saved notes">
      <div className="relative w-full sm:w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search saved notes" className="pl-9" aria-label="Search saved notes" />
      </div>

      {error && (
        <p className="text-sm text-rose-400" role="alert">
          {error}
        </p>
      )}

      {loading && captures.length === 0 ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : captures.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-text-muted">
          <Inbox className="h-8 w-8 mx-auto mb-2 opacity-60" />
          <p className="text-sm">{debounced ? "Nothing matches that search." : "No saved notes yet. Meeting notes you paste in the chat, and anything you forward by email or send to the Cliq bot, appear here."}</p>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {captures.map((c) => (
              <SavedItem key={c.id} capture={c} />
            ))}
          </ul>
          {total > captures.length && <p className="text-xs text-text-muted text-center">Showing the latest {captures.length} of {total}.</p>}
        </>
      )}
    </section>
  );
}
