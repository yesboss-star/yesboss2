"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/utils";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { Bell, Loader2, MessageSquare, RefreshCw, Zap } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

interface ThreadMessage {
  dir?: string;
  text?: string;
  modality?: string;
  ts?: string;
}

interface ThreadDoc {
  _id?: string;
  status?: string;
  criticality?: string;
  next_followup_at?: string;
  messages?: ThreadMessage[];
  risk_notes?: string;
  reply_count?: number;
  nudge_count?: number;
  summarized?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  assigned: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  acknowledged: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  in_progress: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  blocked: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  extension_requested: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  overdue: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

const CRITICALITY_COLORS: Record<string, string> = {
  low: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  critical: "bg-rose-500/10 text-rose-400 border-rose-500/20",
};

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

export default function FollowupThread({ taskId }: { taskId: string }) {
  const [thread, setThread] = useState<ThreadDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [nudging, setNudging] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!taskId) return;
    try {
      const res = await fetch(
        `${API_URL}/zoho/cliq/threads?task_id=${encodeURIComponent(taskId)}`,
        { headers: getAuthHeaders() }
      );
      if (!res.ok) {
        setThread(null);
        return;
      }
      const data = (await res.json()) as { threads?: ThreadDoc[] };
      setThread(Array.isArray(data.threads) && data.threads.length > 0 ? data.threads[0] : null);
    } catch {
      setThread(null);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    let active = true;
    (async () => {
      await load();
      if (!active) return;
    })();
    return () => {
      active = false;
    };
  }, [load]);

  const nudge = async () => {
    if (!thread?._id || nudging) return;
    setNudging(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/zoho/cliq/threads/${thread._id}/nudge`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { detail?: string };
        setError(body.detail || "Could not send a nudge.");
        return;
      }
      const data = (await res.json()) as { thread?: ThreadDoc };
      if (data.thread) setThread(data.thread);
      else await load();
    } catch {
      setError("Could not send a nudge.");
    } finally {
      setNudging(false);
    }
  };

  if (loading || !thread) return null;

  const messages = Array.isArray(thread.messages) ? thread.messages : null;
  const riskView = messages === null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="w-4 h-4" /> Cliq Follow-up
        </CardTitle>
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
              STATUS_COLORS[thread.status || "assigned"] || STATUS_COLORS.assigned
            }`}
          >
            {String(thread.status || "assigned").replace(/_/g, " ")}
          </span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
              CRITICALITY_COLORS[thread.criticality || "low"] || CRITICALITY_COLORS.low
            }`}
          >
            {thread.criticality || "low"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {thread.next_followup_at && (
          <p className="text-xs text-text-muted">
            Next nudge: {formatDate(thread.next_followup_at)}
          </p>
        )}

        {riskView ? (
          <div className="p-3 rounded-xl bg-surface border border-border/50 text-sm">
            <p className="text-text-muted">{thread.risk_notes || "Manager risk view — transcript hidden."}</p>
            <p className="text-xs text-text-muted mt-2">
              {typeof thread.reply_count === "number" ? thread.reply_count : 0} repl
              {(thread.reply_count === 1) ? "y" : "ies"}
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {messages.length === 0 && (
              <p className="text-xs text-text-muted">No messages yet.</p>
            )}
            {messages.map((message: ThreadMessage, index: number) => (
              <div
                key={index}
                className={`flex ${message.dir === "in" ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                    message.dir === "in"
                      ? "bg-surface border border-border/50"
                      : "bg-primary/10 border border-primary/20"
                  }`}
                >
                  <p>{message.text}</p>
                  <p className="text-[10px] text-text-muted mt-1">
                    {message.dir === "in" ? "Assignee" : "YesBoss"}
                    {message.modality && message.modality !== "text" ? ` · ${message.modality}` : ""}
                    {message.ts ? ` · ${formatDate(message.ts)}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={nudge} disabled={nudging} className="cursor-pointer">
            {nudging ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Nudge now
          </Button>
          <span className="text-xs text-text-muted flex items-center gap-1">
            <MessageSquare className="w-3 h-3" />
            {typeof thread.nudge_count === "number" ? thread.nudge_count : 0} nudge(s) sent
          </span>
        </div>
        {error && <p className="text-xs text-rose-400">{error}</p>}
        {!riskView && thread.summarized && (
          <p className="text-xs text-text-muted flex items-center gap-1">
            <Bell className="w-3 h-3" /> Summary sent to the assignee.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
