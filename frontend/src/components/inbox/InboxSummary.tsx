"use client";

import { InlineConfirm } from "@/components/ui/InlineConfirm";
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ExternalLink, Inbox, Loader2, Plus, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTaskStore } from "@/stores/taskStore";
import { useZohoStore } from "@/stores/zohoStore";
import { cn, getAuthHeaders } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

type Category = "reply" | "deadline" | "money" | "fyi";

interface MailItem {
  id: string;
  sender: string;
  subject: string;
  line: string;
  received_at: string;
  has_attachment: boolean;
  link: string;
  category: Category;
}

interface MailAction {
  title: string;
  due_date: string | null;
  message_id: string;
  from: string;
  subject: string;
  link: string;
}

type Digest =
  | { state: "not_connected" | "needs_permission" }
  | { state: "error"; message: string }
  | { state: "empty"; hours: number }
  | {
      state: "ok";
      generated_at: string;
      hours: number;
      total: number;
      overview: string;
      summarised: boolean;
      skipped: number;
      labels: Record<Category, string>;
      items: MailItem[];
      actions: MailAction[];
    };

const ORDER: Category[] = ["reply", "deadline", "money", "fyi"];
const TONE: Record<Category, string> = { reply: "#FF9FD2", deadline: "#FFD93D", money: "#B6F36B", fyi: "#7CC8FF" };

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

const button =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-full border-[2.5px] border-outline px-3.5 py-1.5 text-xs font-bold shadow-[3px_3px_0_var(--shadow-hard)] transition-all hover:-translate-x-px hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none";

/** Your own, private summary of your Zoho inbox. It reads only sender, subject and a short preview, changes nothing in
 *  your mailbox, is shown to nobody else, and is only fetched when you open it. */
export default function InboxSummary({ orgId }: { orgId: string }) {
  const { user } = useAuth();
  const email: string = (user as { email?: string } | null)?.email || "";
  const { createTask } = useTaskStore();
  const { connected, mailEnabled, connecting, checkStatus, connect } = useZohoStore();

  const [open, setOpen] = useState(false);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const [taskError, setTaskError] = useState<string | null>(null);

  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/mail/digest${refresh ? "?refresh=true" : ""}`, { credentials: "include", headers: getAuthHeaders() });
      setDigest(res.ok ? await res.json() : { state: "error", message: `Could not load your inbox summary (${res.status}).` });
    } catch {
      setDigest({ state: "error", message: "Could not reach the server. Please try again." });
    } finally {
      setLoading(false);
    }
  }, []);

  // the mailbox is only read when the person opens the card (and has allowed it)
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !digest && !loading) void load();
  };

  const stop = async () => {
    await fetch(`${API_URL}/mail/stop`, { method: "POST", credentials: "include", headers: getAuthHeaders() }).catch(() => undefined);
    setDigest(null);
    setOpen(false);
    await checkStatus();
  };

  const addTask = async (a: MailAction) => {
    setTaskError(null);
    try {
      await createTask({
        title: a.title,
        description: `From ${a.from}: ${a.subject}\n${a.link}`,
        due_date: a.due_date ?? undefined,
        assignee_id: email ? [email] : undefined,
        assignee_email: email || undefined,
        organization_id: orgId,
      });
      setAdded((prev) => ({ ...prev, [a.message_id + a.title]: true }));
    } catch (err) {
      setTaskError((err as Error).message || "Could not add that task.");
    }
  };

  // ---------------------------------------------------------------- not set up yet
  if (!mailEnabled) {
    return (
      <section className="glass flex flex-wrap items-center gap-3 rounded-3xl p-4" aria-label="Inbox summary">
        <Inbox className="h-5 w-5 flex-shrink-0 text-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-foreground">Summarise my inbox</p>
          <p className="text-xs text-text-muted">
            {connected
              ? "Zoho is connected for tasks and calendar. Allow read-only access to also get a private summary of your mail."
              : "Connect Zoho to get a private summary of your mail. Read-only: YesBoss never sends, moves or deletes anything."}
          </p>
        </div>
        <button type="button" onClick={() => void connect({ mail: true })} disabled={connecting} className={cn(button, "bg-highlight text-on-highlight")}>
          {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Inbox className="h-4 w-4" />} {connected ? "Allow inbox access" : "Connect Zoho inbox"}
        </button>
      </section>
    );
  }

  // ---------------------------------------------------------------- set up
  const ok = digest?.state === "ok" ? digest : null;
  return (
    <section className="glass rounded-3xl p-4" aria-label="Inbox summary">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full cursor-pointer items-center gap-3 text-left">
        <Inbox className="h-5 w-5 flex-shrink-0 text-foreground" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-extrabold text-foreground">Your inbox today</span>
          <span className="block truncate text-xs text-text-muted">
            {ok ? (ok.overview || `${ok.total} new mail${ok.total === 1 ? "" : "s"} in the last ${ok.hours} hours`) : "Private to you. Opens a summary of your recent mail."}
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 flex-shrink-0 text-text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div className="mt-4 space-y-4 text-sm">
          {loading && !ok && (
            <p className="flex items-center gap-2 text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Reading your recent mail…
            </p>
          )}
          {digest?.state === "error" && (
            <p className="text-text-muted" role="alert">
              {digest.message}{" "}
              <button type="button" className="font-bold underline" onClick={() => void load(true)}>
                Try again
              </button>
            </p>
          )}
          {digest?.state === "needs_permission" && (
            <p className="text-text-muted">
              Zoho no longer allows YesBoss to read your inbox.{" "}
              <button type="button" className="font-bold underline" onClick={() => void connect({ mail: true })}>
                Allow it again
              </button>
            </p>
          )}
          {digest?.state === "empty" && <p className="text-text-muted">No new mail in the last {digest.hours} hours.</p>}

          {ok && (
            <>
              {!ok.summarised && (
                <p className="rounded-2xl border-2 border-dashed border-outline bg-surface-light px-3 py-2 text-xs text-text-muted">
                  The summaries could not be written just now, so this is your mail as a plain list.
                </p>
              )}

              {ok.actions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-text-muted">Suggested tasks · only added when you press Add</p>
                  {ok.actions.map((a) => {
                    const key = a.message_id + a.title;
                    return (
                      <div key={key} className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface-light px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-foreground">{a.title}</p>
                          <p className="truncate text-xs text-text-muted">
                            {a.from} · {a.subject}
                            {a.due_date ? ` · due ${a.due_date}` : ""}
                          </p>
                        </div>
                        <button type="button" disabled={added[key]} onClick={() => void addTask(a)} className={cn(button, "bg-surface text-foreground")}>
                          <Plus className="h-3.5 w-3.5" /> {added[key] ? "Added" : "Add as task"}
                        </button>
                      </div>
                    );
                  })}
                  {taskError && (
                    <p className="text-xs text-rose-500" role="alert">
                      {taskError}
                    </p>
                  )}
                </div>
              )}

              {ORDER.map((cat) => {
                const rows = ok.items.filter((i) => i.category === cat);
                if (rows.length === 0) return null;
                return (
                  <div key={cat} className="space-y-2">
                    <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-text-muted">
                      <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-outline" style={{ background: TONE[cat] }} />
                      {ok.labels[cat]} · {rows.length}
                    </p>
                    {rows.map((m) => (
                      <a
                        key={m.id}
                        href={m.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-2xl border border-border bg-surface-light px-3 py-2 transition-colors hover:border-outline"
                      >
                        <span className="flex items-center gap-2 text-xs text-text-muted">
                          <span className="truncate font-bold text-foreground">{m.sender}</span>
                          <span className="flex-shrink-0">{ago(m.received_at)}</span>
                          <ExternalLink className="ml-auto h-3 w-3 flex-shrink-0" aria-label="Opens in Zoho Mail" />
                        </span>
                        <span className="block truncate font-semibold text-foreground">{m.subject}</span>
                        {m.line && <span className="block text-xs text-text-muted">{m.line}</span>}
                      </a>
                    ))}
                  </div>
                );
              })}

              <p className="text-xs text-text-muted">
                {ok.total} mail{ok.total === 1 ? "" : "s"} in the last {ok.hours} hours
                {ok.skipped > 0 ? ` · ${ok.skipped} newsletter or automatic mail${ok.skipped === 1 ? "" : "s"} left out` : ""} · updated {ago(ok.generated_at)}
              </p>
            </>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
            <button type="button" onClick={() => void load(true)} disabled={loading} className={cn(button, "bg-surface text-foreground")}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
            </button>
            <InlineConfirm
              label="Stop reading"
              keepLabel="Keep reading"
              warning="Your saved summary is deleted. Zoho tasks and calendar stay connected."
              onConfirm={() => void stop()}
              trigger={(arm) => (
                <button type="button" onClick={arm} className="text-xs font-semibold text-text-muted underline underline-offset-2 hover:text-rose-500">
                  Stop reading my inbox
                </button>
              )}
            />
            <p className="basis-full text-[11px] text-text-muted">
              Only you can see this. YesBoss reads sender, subject and a short preview, never whole messages or attachments, and never changes your mailbox.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
