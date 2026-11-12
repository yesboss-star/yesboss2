"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Check, Loader2, User, X } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { getAuthHeaders } from "@/lib/utils";
import type { Capture, CaptureSuggestion } from "@/stores/captureStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : "no date");

async function call(path: string, method: "GET" | "POST", body?: unknown): Promise<{ capture: Capture }> {
  const res = await fetch(`${API_URL}/captures${path}`, {
    method,
    headers: getAuthHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = "Something went wrong";
    try {
      const data = await res.json();
      if (typeof data?.detail === "string") detail = data.detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

/**
 * What the chat shows after it reads meeting notes: who and when it found, and each action item as a
 * task to assign. Nothing is assigned until you press Assign. The notes themselves stay private.
 */
export default function MeetingNotesCard({ captureId, nameFor }: { captureId: string; nameFor: (email: string) => string }) {
  const [capture, setCapture] = useState<Capture | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setCapture((await call(`/${captureId}`, "GET")).capture);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load these notes");
    }
  }, [captureId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load once when the card appears
    void load();
  }, [load]);

  const act = async (s: CaptureSuggestion, verb: "accept" | "dismiss") => {
    setBusy(s.id);
    setError(null);
    try {
      setCapture((await call(`/${captureId}/suggestions/${s.id}/${verb}`, "POST", verb === "accept" ? {} : undefined)).capture);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  const assignAll = async (pending: CaptureSuggestion[]) => {
    for (const s of pending) {
      setBusy(s.id);
      try {
        setCapture((await call(`/${captureId}/suggestions/${s.id}/accept`, "POST", {})).capture);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
        break;
      }
    }
    setBusy(null);
  };

  if (!capture) {
    return error ? (
      <p className="text-xs text-rose-400">{error}</p>
    ) : (
      <p className="text-xs text-text-muted flex items-center gap-1.5">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading the notes…
      </p>
    );
  }

  const e = capture.entities;
  const chips: [string, string[], React.ElementType][] = e
    ? [["People", e.people, User], ["Dates", e.dates, CalendarDays], ["Amounts", e.amounts, CalendarDays]]
    : [];
  const pending = capture.suggestions.filter((s) => s.status === "pending");

  return (
    <div className="rounded-2xl bg-surface border border-primary/20 p-4 space-y-3 min-w-[300px] max-w-[460px]" aria-label="Meeting notes">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Meeting notes · private to you</p>

      {chips.some(([, items]) => items?.length) && (
        <div className="flex flex-wrap gap-1.5">
          {chips.flatMap(([label, items, Icon]) =>
            (items ?? []).slice(0, 6).map((item) => (
              <Badge key={`${label}-${item}`} variant="outline" className="gap-1" title={label}>
                <Icon className="h-3 w-3" />
                {item}
              </Badge>
            ))
          )}
        </div>
      )}

      {capture.suggestions.length === 0 ? (
        <p className="text-xs text-text-muted">No clear action items. The notes are saved and you can ask me about them.</p>
      ) : (
        <ul className="space-y-2">
          {capture.suggestions.map((s) => {
            const resolved = s.status === "accepted" || s.status === "dismissed";
            return (
              <li key={s.id} className={`rounded-xl border border-border p-3 space-y-1 ${resolved ? "opacity-60" : ""}`}>
                <p className={`text-sm text-foreground ${s.status === "dismissed" ? "line-through" : ""}`}>{s.title}</p>
                <p className="text-xs text-text-muted">
                  For {s.assignee_email ? nameFor(s.assignee_email) : "you"} · due {day(s.due_date)}
                </p>
                {s.status === "accepted" ? (
                  <p className="text-xs text-emerald-400 flex items-center gap-1">
                    <Check className="h-3.5 w-3.5" /> Assigned
                  </p>
                ) : s.status === "dismissed" ? (
                  <p className="text-xs text-text-muted">Skipped</p>
                ) : (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" disabled={busy !== null} onClick={() => act(s, "accept")} className="cursor-pointer">
                      {busy === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Assign
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => act(s, "dismiss")} className="cursor-pointer">
                      <X className="h-3.5 w-3.5" /> Skip
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {pending.length > 1 && (
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => assignAll(pending)} className="cursor-pointer">
          Assign all {pending.length}
        </Button>
      )}
      {error && (
        <p className="text-xs text-rose-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
