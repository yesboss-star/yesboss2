"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Button, Input, Label } from "@/components/ui";
import { Loader2, Calendar, Clock, Users, CheckCircle, X, Plus } from "lucide-react";
import { useZohoStore } from "@/stores/zohoStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("yesboss_id_token");
  const h: Record<string, string> = {};
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

interface UserSuggestion {
  id: string;
  name: string;
  email: string;
  type: string;
}

const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 30) {
    TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
}

export default function ZohoCalendarBooking({ onClose }: { onClose?: () => void }) {
  const { connected, loading, checkStatus } = useZohoStore();
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    checkStatus().finally(() => setInitialLoading(false));
  }, [checkStatus]);

  const [step, setStep] = useState<"select" | "book" | "done">("select");
  const [attendees, setAttendees] = useState<{ name: string; email: string }[]>([]);
  const [attendeeInput, setAttendeeInput] = useState("");
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [fromTime, setFromTime] = useState("09:00");
  const [toTime, setToTime] = useState("10:00");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState<{ start: string; end: string }[]>([]);
  const [loadingCheck, setLoadingCheck] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [attendeeResults, setAttendeeResults] = useState<any[]>([]);
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [showTitleDropdown, setShowTitleDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const titleRef = useRef<HTMLDivElement>(null);
  const titleDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (titleRef.current && !titleRef.current.contains(e.target as Node)) {
        setShowTitleDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (initialLoading || loading) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-text-muted">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
          Checking connection...
        </CardContent>
      </Card>
    );
  }

  if (!connected) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-text-muted">
          Connect your Zoho account in Settings &gt; Integrations to book meetings.
        </CardContent>
      </Card>
    );
  }

  const searchUsers = async (q: string) => {
    if (!q || q.length < 1) { setSuggestions([]); return; }
    try {
      const res = await fetch(`${API_URL}/zoho/calendar/users/search?q=${encodeURIComponent(q)}`, {
        credentials: "include",
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.users || []);
      }
    } catch {}
  };

  const handleAttendeeInput = (val: string) => {
    setAttendeeInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchUsers(val), 200);
    setShowSuggestions(true);
  };

  const addAttendee = (name: string, email: string) => {
    if (attendees.some((a) => a.email === email)) return;
    setAttendees([...attendees, { name, email }]);
    setAttendeeInput("");
    setSuggestions([]);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const removeAttendee = (email: string) => {
    setAttendees(attendees.filter((a) => a.email !== email));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && attendeeInput.includes("@")) {
      e.preventDefault();
      const email = attendeeInput.trim();
      if (email && !attendees.some((a) => a.email === email)) {
        addAttendee(email, email);
      }
    }
  };

  const checkAvailability = async () => {
    if (!attendees.length || !date || !fromTime || !toTime) return;
    if (fromTime >= toTime) { setError("End time must be after start time"); return; }
    setLoadingCheck(true);
    setError("");
    setConflict(false);
    setBusy([]);
    try {
      const emails = attendees.map((a) => a.email).join(",");
      const res = await fetch(
        `${API_URL}/zoho/calendar/freebusy?emails=${encodeURIComponent(emails)}&date=${date}&from_time=${fromTime}&to_time=${toTime}`,
        { credentials: "include", headers: authHeaders() }
      );
      if (!res.ok) {
        const errData = await res.json();
        setError(errData.detail || "Failed to check availability");
        return;
      }
      const data = await res.json();
      setConflict(data.conflict || false);
      setBusy(data.busy || []);
      if (data.conflict) {
        setError("Time slot conflicts with existing events. See busy times below.");
      } else {
        setStep("book");
      }
    } catch {
      setError("Network error checking availability");
    } finally {
      setLoadingCheck(false);
    }
  };

  const fetchTitleSuggestions = async (q: string) => {
    if (!q || q.length < 1) { setTitleSuggestions([]); setShowTitleDropdown(false); return; }
    try {
      const res = await fetch(`${API_URL}/meetings/titles?q=${encodeURIComponent(q)}`, {
        credentials: "include",
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setTitleSuggestions(data.titles || []);
        setShowTitleDropdown((data.titles || []).length > 0);
      }
    } catch {}
  };

  const onTitleChange = (val: string) => {
    setTitle(val);
    clearTimeout(titleDebounceRef.current);
    titleDebounceRef.current = setTimeout(() => fetchTitleSuggestions(val), 200);
  };

  const bookMeeting = async () => {
    if (!title) return;
    setLoadingCheck(true);
    setError("");
    try {
      const startDt = `${date.replace(/-/g, "")}T${fromTime.replace(":", "")}00+0530`;
      const endDt = `${date.replace(/-/g, "")}T${toTime.replace(":", "")}00+0530`;
      const attendeeList = attendees.map((a) => ({ email: a.email }));

      const res = await fetch(`${API_URL}/zoho/calendar/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify({
          attendees: attendeeList,
          title,
          description,
          start: startDt,
          end: endDt,
          timezone: "Asia/Kolkata",
        }),
      });
      if (!res.ok) {
        const errData = await res.json();
        setError(errData.detail || "Failed to book meeting");
        return;
      }
      const data = await res.json();
      setResult(data);
      setAttendeeResults(data.attendee_results || []);
      setStep("done");
    } catch {
      setError("Network error booking meeting");
    } finally {
      setLoadingCheck(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            <CardTitle>Book a Meeting</CardTitle>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface text-text-muted cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <CardDescription>Schedule a meeting via Zoho Calendar</CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-400">
            {error}
          </div>
        )}

        {step === "select" && (
          <div className="space-y-4">
            <div>
              <Label>Attendees</Label>
              <div className="flex flex-wrap gap-1.5 mt-1 mb-1.5">
                {attendees.map((a) => (
                  <span key={a.email} className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-primary/10 text-primary text-xs border border-primary/20">
                    {a.name}
                    <button onClick={() => removeAttendee(a.email)} className="hover:text-rose-400 cursor-pointer">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="relative">
                <Input
                  ref={inputRef}
                  value={attendeeInput}
                  onChange={(e) => handleAttendeeInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={() => attendeeInput.length > 0 && setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder="@name or email, press Enter to add"
                  className="mt-1"
                />
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg bg-surface border border-border/50 shadow-lg max-h-48 overflow-y-auto">
                    {suggestions.map((s) => (
                      <button
                        key={s.email}
                        onMouseDown={(e) => { e.preventDefault(); addAttendee(s.name, s.email); }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm hover:bg-primary/5 transition-colors cursor-pointer"
                      >
                        <Users className="w-3.5 h-3.5 text-text-muted shrink-0" />
                        <div className="min-w-0">
                          <div className="text-text font-medium truncate">{s.name}</div>
                          <div className="text-[11px] text-text-muted truncate">{s.email}</div>
                        </div>
                        <Plus className="w-3.5 h-3.5 text-text-muted ml-auto shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>From</Label>
                <select
                  value={fromTime}
                  onChange={(e) => setFromTime(e.target.value)}
                  className="mt-1 w-full p-2 rounded-lg bg-surface border border-border/50 text-sm"
                >
                  {TIME_OPTIONS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>To</Label>
                <select
                  value={toTime}
                  onChange={(e) => setToTime(e.target.value)}
                  className="mt-1 w-full p-2 rounded-lg bg-surface border border-border/50 text-sm"
                >
                  {TIME_OPTIONS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            <Button
              onClick={checkAvailability}
              disabled={loadingCheck || !attendees.length || !date || !fromTime || !toTime}
              className="w-full cursor-pointer"
            >
              {loadingCheck ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Clock className="w-4 h-4 mr-2" />
              )}
              Check Availability
            </Button>
          </div>
        )}

        {step === "book" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">
                {date} | {fromTime}–{toTime}
                <span className="ml-2 text-emerald-400 text-xs">Available</span>
              </span>
              <button onClick={() => setStep("select")} className="text-primary hover:underline cursor-pointer text-xs">
                Change
              </button>
            </div>

            {busy.length > 0 && (
              <div>
                <p className="text-xs text-text-muted mb-1">Busy times (other events):</p>
                <div className="flex flex-wrap gap-1">
                  {busy.map((b, i) => (
                    <span key={i} className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 text-[10px] border border-rose-500/30">
                      {b.start}–{b.end}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
              {attendees.map((a) => (
                <span key={a.email} className="px-2 py-0.5 rounded-lg bg-primary/10 text-primary text-xs border border-primary/20">
                  {a.name}
                </span>
              ))}
            </div>

            <div ref={titleRef} className="relative">
              <Label>Meeting Title</Label>
              <Input value={title} onChange={(e) => onTitleChange(e.target.value)} onFocus={() => { if (titleSuggestions.length > 0) setShowTitleDropdown(true); }} placeholder="e.g. Sprint Planning" className="mt-1" />
              {showTitleDropdown && titleSuggestions.length > 0 && (
                <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-surface border border-border/50 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                  {titleSuggestions.map((t, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => { setTitle(t); setShowTitleDropdown(false); }}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-primary/10 transition-colors cursor-pointer border-b border-border/20 last:border-0"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label>Description (optional)</Label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Meeting agenda..."
                className="mt-1 w-full p-2 rounded-lg bg-surface border border-border/50 text-sm resize-none h-20"
              />
            </div>
            <Button onClick={bookMeeting} disabled={loadingCheck || !title} className="w-full cursor-pointer">
              {loadingCheck ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Calendar className="w-4 h-4 mr-2" />}
              {loadingCheck ? "Booking..." : "Book Meeting"}
            </Button>
          </div>
        )}

        {step === "done" && result && (
          <div className="text-center space-y-3">
            <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto" />
            <p className="text-sm font-medium">Meeting Booked!</p>
            <div className="p-3 rounded-xl bg-surface border border-border/50 text-xs text-left space-y-1">
              <p><strong>Title:</strong> {result.title}</p>
              <p><strong>Time:</strong> {date} | {fromTime} – {toTime}</p>
              <p><strong>Attendees:</strong> {result.attendees?.map((a: any) => a.email || a).join(", ")}</p>
            </div>
            {attendeeResults.length > 0 && (
              <div className="p-3 rounded-xl bg-surface border border-border/50 text-xs text-left">
                <p className="font-medium mb-1">Calendar booking results:</p>
                {attendeeResults.map((ar: any) => (
                  <p key={ar.email} className={ar.event_id ? "text-emerald-400" : "text-amber-400"}>
                    {ar.email}: {ar.event_id ? "Booked" : ar.status === "not_connected" ? "Zoho not connected" : ar.status === "no_token" ? "Invalid token" : ar.status === "no_calendar" ? "No default calendar" : "Failed"}
                  </p>
                ))}
              </div>
            )}
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={() => { setStep("select"); setResult(null); setTitle(""); setAttendees([]); setAttendeeResults([]); }} className="cursor-pointer text-xs">
                Book Another
              </Button>
              {onClose && (
                <Button onClick={onClose} className="cursor-pointer text-xs">
                  Done
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
