"use client";

import { useState, useEffect } from "react";
import { getAuthHeaders } from "@/lib/utils";
import {
  Modal, ModalHeader, ModalTitle, ModalClose, ModalContent,
} from "@/components/ui/Modal";
import { Clock, Flag, Loader2, AlertCircle, Calendar, CheckCircle, MessageSquare, X } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface CheckInNote {
  goal_id: string;
  note: string;
  action_taken: string;
}

interface CheckInGoal {
  goal_id: string;
  title: string;
  progress: number;
  last_update_days: number;
  status: string;
  priority: string;
  department: string;
}

interface CheckInData {
  check_in_id?: string;
  total_active: number;
  behind_count: number;
  stale_count: number;
  goals: CheckInGoal[];
}

interface CheckInModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId?: string;
  initialData?: CheckInData;
}

export default function CheckInModal({ open, onOpenChange, orgId, initialData }: CheckInModalProps) {
  const [loading, setLoading] = useState(false);
  const [checkInData, setCheckInData] = useState<CheckInData | null>(initialData || null);
  const [notes, setNotes] = useState<Record<string, CheckInNote>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (open && !initialData && orgId) {
      fetchPendingCheckIn();
    }
  }, [open, orgId, initialData]);

  const fetchPendingCheckIn = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/organizations/${orgId}/check-ins/pending`, {
        headers: { ...getAuthHeaders() },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.pending && data.check_in) {
          setCheckInData(data.check_in);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const updateNote = (goalId: string, field: "note" | "action_taken", value: string) => {
    setNotes((prev) => ({
      ...prev,
      [goalId]: { ...(prev[goalId] || { goal_id: goalId, note: "", action_taken: "none" }), [field]: value },
    }));
  };

  const handleSubmit = async () => {
    if (!checkInData) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/organizations/${orgId}/check-ins/pending/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          check_in_id: "pending",
          notes: Object.values(notes).filter((n) => n.action_taken !== "none" || n.note),
        }),
      });
      if (res.ok) {
        setSubmitted(true);
        setTimeout(() => {
          onOpenChange(false);
          setSubmitted(false);
          setNotes({});
          setCheckInData(null);
        }, 1500);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const dismissAll = async () => {
    if (!checkInData) return;
    setSubmitting(true);
    try {
      await fetch(`${API_URL}/organizations/${orgId}/check-ins/pending/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ check_in_id: "pending", notes: [] }),
      });
      setSubmitted(true);
      setTimeout(() => {
        onOpenChange(false);
        setSubmitted(false);
        setCheckInData(null);
      }, 1000);
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "behind": return "text-rose-400 bg-rose-500/10 border-rose-500/20";
      case "stale": return "text-amber-400 bg-amber-500/10 border-amber-500/20";
      default: return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
    }
  };

  const progressBarColor = (pct: number) => {
    if (pct >= 80) return "bg-emerald-500";
    if (pct >= 50) return "bg-amber-500";
    return "bg-rose-500";
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <ModalHeader className="flex items-center justify-between pr-12">
          <ModalTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Weekly Check-In
          </ModalTitle>
          <ModalClose />
        </ModalHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}

          {!loading && submitted && (
            <div className="flex flex-col items-center justify-center py-12 text-emerald-400 gap-3">
              <Clock className="w-10 h-10" />
              <p className="text-lg font-medium">Check-In Recorded</p>
              <p className="text-sm text-text-muted">Your goals have been reviewed</p>
            </div>
          )}

          {!loading && !submitted && checkInData && (
            <>
              {/* Summary */}
              <div className="flex gap-4 flex-wrap">
                <div className="px-4 py-3 rounded-xl bg-primary/5 border border-primary/10 flex items-center gap-3">
                  <Flag className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-2xl font-bold">{checkInData.total_active}</p>
                    <p className="text-xs text-text-muted">Active Goals</p>
                  </div>
                </div>
                {checkInData.behind_count > 0 && (
                  <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-rose-400" />
                    <div>
                      <p className="text-2xl font-bold text-rose-400">{checkInData.behind_count}</p>
                      <p className="text-xs text-text-muted">Behind Schedule</p>
                    </div>
                  </div>
                )}
                {checkInData.stale_count > 0 && (
                  <div className="px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
                    <Clock className="w-5 h-5 text-amber-400" />
                    <div>
                      <p className="text-2xl font-bold text-amber-400">{checkInData.stale_count}</p>
                      <p className="text-xs text-text-muted">No Updates 7d+</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Goal list */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-text-muted">Goals to Review</p>
                {checkInData.goals.map((g) => (
                  <div key={g.goal_id} className="p-4 rounded-xl bg-surface border border-border space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{g.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColor(g.status)}`}>
                            {g.status === "behind" ? "Behind" : g.status === "stale" ? "Stale" : "On Track"}
                          </span>
                          {g.department && (
                            <span className="text-xs text-text-muted">{g.department}</span>
                          )}
                          <span className="text-xs text-text-muted">
                            {g.last_update_days === 0 ? "Updated today" : `${g.last_update_days}d since update`}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {g.priority === "high" && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">High</span>
                        )}
                        {g.priority === "urgent" && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">Urgent</span>
                        )}
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full h-1.5 rounded-full bg-border overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${progressBarColor(g.progress)}`}
                        style={{ width: `${Math.min(g.progress, 100)}%` }}
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const next = notes[g.goal_id]?.action_taken === "flag" ? "none" : "flag";
                          updateNote(g.goal_id, "action_taken", next);
                        }}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                          notes[g.goal_id]?.action_taken === "flag"
                            ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                            : "border-border text-text-muted hover:bg-surface"
                        }`}
                      >
                        <Flag className="w-3 h-3 inline mr-1" />
                        {notes[g.goal_id]?.action_taken === "flag" ? "Flagged" : "Flag Blocked"}
                      </button>
                      <button
                        onClick={() => updateNote(g.goal_id, "action_taken", "dismiss")}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                          notes[g.goal_id]?.action_taken === "dismiss"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : "border-border text-text-muted hover:bg-surface"
                        }`}
                      >
                        <Calendar className="w-3 h-3 inline mr-1" />
                        {notes[g.goal_id]?.action_taken === "dismiss" ? "Reviewed" : "Mark Reviewed"}
                      </button>
                    </div>

                    {/* Note textarea */}
                    {notes[g.goal_id]?.action_taken === "flag" && (
                      <textarea
                        value={notes[g.goal_id]?.note || ""}
                        onChange={(e) => updateNote(g.goal_id, "note", e.target.value)}
                        placeholder="What's blocking this goal?"
                        rows={2}
                        className="w-full px-3 py-2 rounded-lg bg-surface border border-border focus:border-primary focus:outline-none text-sm resize-none"
                      />
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {!loading && !checkInData && !submitted && (
            <div className="flex flex-col items-center justify-center py-12 text-text-muted gap-3">
              <Clock className="w-10 h-10 opacity-40" />
              <p className="text-lg font-medium">No Pending Check-In</p>
              <p className="text-sm">All your goals are up to date</p>
            </div>
          )}
        </div>

        {checkInData && !submitted && (
          <div className="px-6 py-4 border-t border-border flex items-center justify-between">
            <button
              onClick={dismissAll}
              disabled={submitting}
              className="text-sm text-text-muted hover:text-foreground transition-colors cursor-pointer"
            >
              Dismiss All
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => onOpenChange(false)}
                className="px-4 py-2 rounded-lg border border-border text-sm text-text-muted hover:text-foreground transition-colors cursor-pointer"
              >
                Later
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/80 text-white text-sm font-medium transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {submitting ? "Saving..." : "Submit Review"}
              </button>
            </div>
          </div>
        )}
      </ModalContent>
    </Modal>
  );
}
