"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, ChevronDown, Loader2, Trash2, Upload } from "lucide-react";
import CalendarBooking from "@/components/owners/CalendarBooking";
import MeetingUploadModal from "@/components/owners/MeetingUploadModal";
import MeetingsListCard from "@/components/capture/MeetingsListCard";
import { useAuth } from "@/contexts/AuthContext";
import { useTaskStore } from "@/stores/taskStore";
import { cn, getAuthHeaders } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

type Meeting = {
  id: string;
  title?: string;
  task_count?: number;
  created_at?: string;
  start_dt?: string;
  status?: string;
  attendees?: string[];
  zoho_event_id?: string;
  google_event_id?: string;
  event_ids?: Record<string, string>;
};

const pill = "inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 border-outline px-3 py-1 text-xs font-bold transition-all hover:-translate-x-px hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50";
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString() : "");

/** Booked meetings store their start as 20261121T090000+0530. An unreadable start counts as already past. */
const startsInFuture = (m: Meeting) => {
  const t = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})([+-]\d{2})(\d{2})$/.exec(m.start_dt || "");
  return !!t && Date.parse(`${t[1]}-${t[2]}-${t[3]}T${t[4]}:${t[5]}:${t[6]}${t[7]}:${t[8]}`) > Date.now();
};

/** Deleting a meeting that is still ahead also cancels its calendar event, so say so before it happens. */
const willCancelCalendar = (m: Meeting) =>
  !!(m.zoho_event_id || m.google_event_id || (m.event_ids && Object.keys(m.event_ids).length)) && m.status !== "cancelled" && startsInFuture(m);

/** What pressing Delete will do, in words, shown before it does it. */
const consequence = (m: Meeting) => {
  const parts = ["This removes it from your history."];
  if (m.task_count) parts.push(`The ${m.task_count} task${m.task_count === 1 ? "" : "s"} made from it stay.`);
  if (willCancelCalendar(m)) {
    const n = m.attendees?.length || 0;
    parts.push(`Its calendar event is cancelled${n ? ` and ${n} ${n === 1 ? "person is" : "people are"} told` : ""}.`);
    // meetings booked before attendees' own copies were tracked can only have the main event removed
    if (n && !(m.event_ids && Object.keys(m.event_ids).length)) parts.push("A copy on an attendee's own calendar may stay, so check theirs.");
  }
  return parts.join(" ");
};

/** All your meeting tools in one chat card: the meeting history (the same list the Dashboard used to show), your private notes,
 *  and the Upload and Book windows. An owner sees the company's meetings; anyone else sees only their own. */
export default function MeetingsHub({ orgId, nameFor }: { orgId: string; nameFor: (email: string) => string }) {
  const { user, role } = useAuth();
  const [tab, setTab] = useState<"history" | "notes">("history");
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openTitle, setOpenTitle] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showBooking, setShowBooking] = useState(false);

  const email = user?.email || "";

  const load = useCallback(async () => {
    setError(null);
    try {
      const emailParam = role === "employee" && email ? `&email=${encodeURIComponent(email)}` : "";
      const res = await fetch(`${API_URL}/meetings/history?organization_id=${encodeURIComponent(orgId)}&limit=50${emailParam}`, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Could not load your meetings just now.");
      const data = await res.json();
      setMeetings(data.meetings || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [orgId, role, email]);

  useEffect(() => {
    // wait until the role is known, so an employee never briefly sees the company's list
    if (!role) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the history when the card appears
    void load();
  }, [role, load]);

  const remove = async (m: Meeting) => {
    setConfirmId(null);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`${API_URL}/meetings/${m.id}?organization_id=${encodeURIComponent(orgId)}`, { method: "DELETE", credentials: "include", headers: getAuthHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.detail === "string" ? data.detail : "Could not delete that meeting.");
      setMeetings((prev) => prev.filter((x) => x.id !== m.id));
      const said = ["Deleted."];
      if (data.tasks_kept) said.push(`${data.tasks_kept} task${data.tasks_kept === 1 ? "" : "s"} made from it ${data.tasks_kept === 1 ? "was" : "were"} kept.`);
      if (data.calendar_cancelled) said.push(`The calendar event was cancelled${data.attendees_told ? ` and ${data.attendees_told} ${data.attendees_told === 1 ? "person was" : "people were"} told` : ""}.`);
      else if (willCancelCalendar(m)) said.push("I could not confirm the calendar event was cancelled, so please check your calendar.");
      setNotice(said.join(" "));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // one row per meeting title, newest first; each opens to its uploads
  const groups = useMemo(() => {
    const byTitle = new Map<string, Meeting[]>();
    for (const m of meetings) {
      const key = m.title || "Untitled";
      byTitle.set(key, [...(byTitle.get(key) || []), m]);
    }
    const latest = (list: Meeting[]) => Math.max(...list.map((x) => new Date(x.created_at || 0).getTime()));
    return [...byTitle.entries()].sort(([, a], [, b]) => latest(b) - latest(a));
  }, [meetings]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Your meetings" className="flex flex-wrap gap-2">
          {([["history", "History"], ["notes", "My notes"]] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn(pill, tab === id ? "bg-highlight text-on-highlight shadow-[2px_2px_0_var(--shadow-hard)]" : "bg-surface")}>
              {label}
            </button>
          ))}
        </div>
        <span className="ml-auto flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowUpload(true)} className={cn(pill, "bg-primary text-on-primary")}>
            <Upload className="h-3.5 w-3.5" /> Upload meeting
          </button>
          <button type="button" onClick={() => setShowBooking(true)} className={cn(pill, "bg-surface")}>
            <Calendar className="h-3.5 w-3.5" /> Book meeting
          </button>
        </span>
      </div>

      {tab === "history" ? (
        <div className="space-y-2">
          <p className="text-xs text-text-muted">Upload meeting notes to auto-create tasks via AI. Meetings with the same title are grouped.</p>
          {error && <p className="text-xs text-rose-400" role="alert">{error}</p>}
          {notice && <p className="text-xs font-bold" role="status">{notice}</p>}
          {loading || !role ? (
            <p className="flex items-center gap-2 text-xs text-text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading your meetings…
            </p>
          ) : groups.length === 0 ? (
            <p className="rounded-2xl border-2 border-dashed border-outline px-4 py-6 text-center text-sm text-text-muted">No meetings uploaded yet. Press Upload meeting to start.</p>
          ) : (
            <ul className="space-y-2" aria-label="Meeting history">
              {groups.map(([title, list]) => {
                const open = openTitle === title;
                const tasks = list.reduce((n, m) => n + (m.task_count || 0), 0);
                return (
                  <li key={title} className="overflow-hidden rounded-2xl border-2 border-outline bg-surface">
                    <button type="button" aria-expanded={open} onClick={() => setOpenTitle(open ? null : title)} className="flex w-full cursor-pointer items-center gap-3 px-3.5 py-2.5 text-left hover:bg-surface-light">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{title}</span>
                        <span className="block text-xs text-text-muted">
                          {list.length} upload{list.length === 1 ? "" : "s"} · {tasks} task{tasks === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span className="flex-shrink-0 rounded-full border-2 border-outline px-2.5 py-0.5 text-[11px] font-bold">{day(list[0]?.created_at)}</span>
                      <ChevronDown className={cn("h-4 w-4 flex-shrink-0 text-text-muted transition-transform", open && "rotate-180")} />
                    </button>
                    {open && (
                      <ul className="border-t-2 border-outline">
                        {list.map((m) => (
                          <li key={m.id} className="border-b border-outline/30 px-3.5 py-2 last:border-0">
                            <div className="flex items-center gap-3">
                              <span className="min-w-0 flex-1 text-xs text-text-muted">
                                {m.task_count || 0} task{(m.task_count || 0) === 1 ? "" : "s"} · {day(m.created_at)}
                              </span>
                              {confirmId === m.id ? (
                                <span className="flex flex-shrink-0 items-center gap-2 text-xs font-bold">
                                  <button type="button" onClick={() => void remove(m)} className="cursor-pointer rounded-full border-2 border-outline bg-[#FF9FA0] px-2.5 py-0.5 text-[#111]">
                                    Delete?
                                  </button>
                                  <button type="button" onClick={() => setConfirmId(null)} className="cursor-pointer text-text-muted">
                                    Keep
                                  </button>
                                </span>
                              ) : (
                                <button type="button" onClick={() => setConfirmId(m.id)} aria-label={`Delete ${title} from ${day(m.created_at)}`} className="flex-shrink-0 cursor-pointer text-text-muted hover:text-rose-400">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                            {confirmId === m.id && <p className="mt-1 text-[11px] text-text-muted">{consequence(m)}</p>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-text-muted">Quick private notes you made with MOM or the Upload meeting chip. Only you can see them.</p>
          <MeetingsListCard nameFor={nameFor} />
        </div>
      )}

      <MeetingUploadModal
        open={showUpload}
        onOpenChange={setShowUpload}
        onSuccess={() => {
          void load();
          // the new meeting's action items are tasks now, so refresh the shared task list too
          void useTaskStore.getState().fetchTasks(orgId);
        }}
      />
      {showBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowBooking(false)}>
          <div className="mx-4 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CalendarBooking onClose={() => setShowBooking(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
