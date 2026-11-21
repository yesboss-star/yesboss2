"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Check, ChevronDown, Loader2 } from "lucide-react";
import { getAuthHeaders } from "@/lib/utils";
import { journalApi } from "@/lib/journalApi";
import { cn } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

interface Entry {
  _id: string;
  content?: string;
  mood?: string | null;
  created_at?: string;
  ai_analysis?: {
    summary?: string;
    takeaways?: string[];
    actionable_items?: { text: string }[];
  } | null;
}

const FACE: Record<string, string> = { great: "😄", good: "🙂", okay: "😐", bad: "😞" };
const when = (iso?: string) => {
  // the server writes UTC without a timezone
  const t = Date.parse(iso && !/(Z|[+-]\d\d:?\d\d)$/.test(iso) ? `${iso}Z` : iso || "");
  return Number.isNaN(t) ? "" : new Date(t).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
};

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { headers: getAuthHeaders(), credentials: "include" });
  if (!res.ok) throw new Error(res.status === 403 ? "That entry is private." : "Could not load your journal just now.");
  return res.json();
}

const pill = "inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 border-outline px-3 py-1 text-xs font-bold shadow-[2px_2px_0_var(--shadow-hard)] transition-all hover:-translate-x-px hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60";

/** Shown after a note is saved from the chat. The note itself is not kept in the chat: this card reads it back from your
 *  Journal, shows what the AI noticed once it has finished, and offers a reminder that is only set when you press a button. */
export function JournalSavedCard({ orgId, entryId }: { orgId: string; entryId: string }) {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reminder, setReminder] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // the AI reading takes a few seconds: look again until it has landed (or give up quietly)
    (async () => {
      for (let attempt = 0; attempt < 8 && alive; attempt++) {
        try {
          const { entry: e } = await getJson<{ entry: Entry }>(`/journal/${entryId}`);
          if (!alive) return;
          setEntry(e);
          if (e.ai_analysis) return;
        } catch (err) {
          if (alive) setError((err as Error).message);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
    })();
    return () => {
      alive = false;
    };
  }, [entryId]);

  const analysis = entry?.ai_analysis;
  const reminderText = analysis?.actionable_items?.[0]?.text || `Revisit your journal note: “${(entry?.content || "").slice(0, 80)}”`;

  const remind = async (days: number, label: string) => {
    setBusy(true);
    setError(null);
    try {
      await journalApi("/reminders", orgId, { method: "POST", body: { text: reminderText, type: "after_days", days, entry_id: entryId } });
      setReminder(label);
    } catch (err) {
      setError((err as Error).message || "Could not set that reminder.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2.5 rounded-2xl border-2 border-outline bg-surface p-3.5 shadow-[3px_3px_0_var(--shadow-hard)]">
      {!entry && !error && (
        <p className="flex items-center gap-2 text-xs text-text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading your note…
        </p>
      )}
      {entry && (
        <div className="space-y-1.5 text-sm">
          <p className="flex flex-wrap items-center gap-2">
            {entry.mood && FACE[entry.mood] && <span className="rounded-full border-2 border-outline bg-surface-light px-2 py-0.5 text-xs font-bold">{FACE[entry.mood]} {entry.mood}</span>}
            {analysis ? <span className="text-xs font-bold text-text-muted">Here is what I noticed</span> : <span className="text-xs text-text-muted">Still reading it…</span>}
          </p>
          {analysis?.summary && <p className="font-semibold">{analysis.summary}</p>}
          {!!analysis?.takeaways?.length && (
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-text-muted">
              {analysis.takeaways.slice(0, 2).map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {entry && (
        <div className="rounded-2xl border-2 border-dashed border-outline p-2.5">
          {reminder ? (
            <p className="inline-flex items-center gap-1.5 text-sm font-bold">
              <Check className="h-4 w-4" /> I will remind you {reminder}.
            </p>
          ) : (
            <>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-text-muted">Want a reminder about this?</p>
              <p className="mb-2 truncate text-xs text-text-muted">{reminderText}</p>
              <div className="flex flex-wrap gap-2">
                {([[1, "tomorrow"], [3, "in 3 days"], [7, "in a week"]] as const).map(([days, label]) => (
                  <button key={days} type="button" disabled={busy} onClick={() => void remind(days, label)} className={cn(pill, "bg-surface")}>
                    <Bell className="h-3.5 w-3.5" /> {label[0].toUpperCase() + label.slice(1)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {error && <p className="text-xs text-rose-400" role="alert">{error}</p>}
      <p className="text-xs text-text-muted">
        Only you can see this. <Link href="/dashboard/journal" className="font-bold underline">Open the full Journal</Link>
      </p>
    </div>
  );
}

const PAGE = 8;

/** Your own journal entries, newest first, loaded from your Journal in pages. */
export function JournalListCard({ orgId }: { orgId: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(
    async (skip: number) => {
      setLoading(true);
      setError(null);
      try {
        const data = await getJson<{ entries: Entry[]; total: number }>(`/journal?organization_id=${encodeURIComponent(orgId)}&type=journal&limit=${PAGE}&skip=${skip}`);
        setEntries((prev) => (skip ? [...prev, ...data.entries] : data.entries));
        setTotal(data.total ?? 0);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [orgId],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the first page when the card appears
    void load(0);
  }, [load]);

  if (loading && !entries.length) {
    return (
      <p className="flex items-center gap-2 text-xs text-text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading your journal…
      </p>
    );
  }
  if (error && !entries.length) return <p className="text-xs text-rose-400" role="alert">{error}</p>;
  if (!entries.length) return <p className="text-sm text-text-muted">No journal entries yet. Choose Journal and write your first one.</p>;

  return (
    <div className="space-y-2">
      <ul className="space-y-2" aria-label="Your journal entries">
        {entries.map((e) => {
          const open = openId === e._id;
          const text = (e.content || "").trim();
          const headline = e.ai_analysis?.summary || text.slice(0, 120);
          return (
            <li key={e._id} className="overflow-hidden rounded-2xl border-2 border-outline bg-surface">
              <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : e._id)} className="flex w-full cursor-pointer items-start gap-3 px-3.5 py-2.5 text-left hover:bg-surface-light">
                <span className="mt-0.5 text-lg leading-none">{(e.mood && FACE[e.mood]) || "📓"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-bold uppercase tracking-widest text-text-muted">{when(e.created_at)}</span>
                  <span className={cn("block text-sm font-semibold", !open && "line-clamp-2")}>{headline || "(empty entry)"}</span>
                </span>
                <ChevronDown className={cn("mt-1 h-4 w-4 flex-shrink-0 text-text-muted transition-transform", open && "rotate-180")} />
              </button>
              {open && text && <p className="whitespace-pre-wrap border-t-2 border-outline px-3.5 py-3 text-sm">{text}</p>}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
        <span>Showing {entries.length} of {total}. Only you can see these.</span>
        {entries.length < total && (
          <button type="button" disabled={loading} onClick={() => void load(entries.length)} className={cn(pill, "bg-highlight text-on-highlight")}>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Show older
          </button>
        )}
        <Link href="/dashboard/journal" className="font-bold underline">Open the full Journal</Link>
      </div>
      {error && <p className="text-xs text-rose-400" role="alert">{error}</p>}
    </div>
  );
}
