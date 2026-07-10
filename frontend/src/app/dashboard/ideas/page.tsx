"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useJournalStore } from "@/stores/journalStore";
import { useGoalStore } from "@/stores/goalStore";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent,
  Button, Badge,
} from "@/components/ui";
import {
  Lightbulb, Loader2, Plus, Trash2, Sparkles, MessageSquare,
  BookOpen, Brain, Clock, CheckCircle, ExternalLink,
  Mic, MicOff, Share2, Columns, TrendingUp,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const PIPELINE_LABELS: Record<string, { label: string; color: string }> = {
  backlog: { label: "Backlog", color: "text-gray-400 border-gray-500/30 bg-gray-500/10" },
  in_review: { label: "In Review", color: "text-blue-400 border-blue-500/30 bg-blue-500/10" },
  approved: { label: "Approved", color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
  converted: { label: "Converted", color: "text-purple-400 border-purple-500/30 bg-purple-500/10" },
};

const MOOD_OPTIONS = [
  { value: "great", emoji: "🌟", label: "Great" },
  { value: "good", emoji: "😊", label: "Good" },
  { value: "okay", emoji: "🙂", label: "Okay" },
  { value: "bad", emoji: "😔", label: "Bad" },
];

const TYPE_OPTIONS = [
  { value: "idea", icon: <Lightbulb className="w-4 h-4 text-amber-400" />, label: "Idea" },
  { value: "journal", icon: <BookOpen className="w-4 h-4 text-blue-400" />, label: "Journal" },
  { value: "reflection", icon: <Brain className="w-4 h-4 text-purple-400" />, label: "Reflection" },
];

function useSpeechRecognition() {
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const finalRef = useRef("");
  const recognitionRef = useRef<any>(null);
  const onFinalRef = useRef<((text: string) => void) | null>(null);

  const startListening = useCallback((onFinal?: (text: string) => void) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    finalRef.current = "";
    setInterimText("");
    if (onFinal) onFinalRef.current = onFinal;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalRef.current += event.results[i][0].transcript + " ";
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setInterimText(interim);
    };
    recognition.onend = () => {
      setListening(false);
      setInterimText("");
      if (finalRef.current.trim()) {
        onFinalRef.current?.(finalRef.current.trim());
      }
    };
    recognition.onerror = () => {
      setListening(false);
      setInterimText("");
    };
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
    setInterimText("");
  }, []);

  return { listening, interimText, startListening, stopListening };
}

function EntryCard({ entry, onDelete, orgId }: { entry: any; onDelete: (id: string) => void; orgId?: string }) {
  const router = useRouter();
  const [creatingTask, setCreatingTask] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const typeMeta = TYPE_OPTIONS.find((t) => t.value === entry.type) || TYPE_OPTIONS[0];
  const moodMeta = MOOD_OPTIONS.find((m) => m.value === entry.mood);
  const createdDate = new Date(entry.created_at).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
  const createdTime = new Date(entry.created_at).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit",
  });

  const createTaskFromItem = async (item: { text: string; priority: string }) => {
    if (!orgId) return;
    setCreatingTask(item.text);
    try {
      const res = await fetch(`${API_URL}/tasks?organization_id=${orgId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: item.text,
          priority: item.priority,
          description: `Created from journal entry: ${entry.content.substring(0, 200)}`,
          status: "pending",
          organization_id: orgId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.task) {
          router.push(`/dashboard/task?highlight=${data.task.id || data.task._id}`);
        }
      }
    } catch {} finally {
      setCreatingTask(null);
    }
  };

  return (
    <div className="group p-4 rounded-xl bg-surface border border-border/40 hover:border-primary/30 transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            {typeMeta.icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-[10px]">{typeMeta.label}</Badge>
              {moodMeta && (
                <span className="text-xs" title={moodMeta.label}>{moodMeta.emoji}</span>
              )}
              <span className="text-[10px] text-text-muted flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {createdDate} at {createdTime}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={() => onDelete(entry._id)}
          className="p-1.5 rounded-lg hover:bg-rose-500/10 text-text-muted hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all cursor-pointer shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="mt-3 text-sm text-foreground leading-relaxed whitespace-pre-wrap">{entry.content}</p>
      {entry.ai_analysis ? (
        <div className="mt-3 p-3 rounded-lg bg-gradient-to-r from-primary/5 to-purple-500/5 border border-primary/10">
          <div className="flex items-center gap-1.5 text-xs text-primary font-medium mb-1.5">
            <Sparkles className="w-3 h-3" />
            AI Analysis — {entry.ai_analysis.category}
          </div>
          <p className="text-xs text-text-muted mb-2">{entry.ai_analysis.summary}</p>
          {entry.ai_analysis.actionable_items && entry.ai_analysis.actionable_items.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-text-muted font-medium">Actionable items:</p>
              {entry.ai_analysis.actionable_items.map((item: any, i: number) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-surface/50 border border-border/30">
                  <span className="text-xs flex-1">{item.text}</span>
                  <button
                    onClick={() => createTaskFromItem(item)}
                    disabled={creatingTask === item.text}
                    className="px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 text-[10px] font-medium hover:bg-emerald-500/20 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1 shrink-0"
                  >
                    {creatingTask === item.text ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <CheckCircle className="w-3 h-3" />
                    )}
                    Create Task
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 p-3 rounded-lg bg-surface/50 border border-border/30">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Loader2 className="w-3 h-3 animate-spin" />
            AI analysis in progress...
          </div>
        </div>
      )}
      {entry.linked_goals && entry.linked_goals.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {entry.linked_goals.map((gid: string) => (
            <span key={gid} className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] border border-emerald-500/20 flex items-center gap-1">
              <ExternalLink className="w-2.5 h-2.5" />
              Linked to goal
            </span>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {entry.pipeline_status && PIPELINE_LABELS[entry.pipeline_status] && (
          <Badge variant="outline" className={`text-[10px] ${PIPELINE_LABELS[entry.pipeline_status].color}`}>
            {PIPELINE_LABELS[entry.pipeline_status].label}
          </Badge>
        )}
        <div className="flex items-center gap-1 ml-auto">
          <select
            value={entry.pipeline_status || "backlog"}
            onChange={async (e) => {
              const val = e.target.value;
              try {
                await fetch(`${API_URL}/journal/${entry._id}/pipeline`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status: val }),
                });
              } catch {}
            }}
            className="text-[9px] bg-surface border border-border/30 rounded px-1.5 py-0.5 text-text-muted cursor-pointer"
          >
            <option value="backlog">Backlog</option>
            <option value="in_review">In Review</option>
            <option value="approved">Approved</option>
            <option value="converted">Converted</option>
          </select>
          <button
            onClick={async () => {
              if (sharing) return;
              setSharing(true);
              try {
                await fetch(`${API_URL}/journal/${entry._id}/share`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                });
              } catch {} finally {
                setSharing(false);
              }
            }}
            disabled={sharing}
            className="p-1 rounded hover:bg-primary/10 text-text-muted hover:text-primary transition-colors cursor-pointer"
            title="Share with team"
          >
            <Share2 className="w-3 h-3" />
          </button>
        </div>
      </div>
      {entry.is_shared && (
        <span className="text-[9px] text-primary/60 flex items-center gap-1 mt-1">
          <Share2 className="w-2.5 h-2.5" />
          Shared with team
        </span>
      )}
    </div>
  );
}

export default function IdeasPage() {
  const { user, role } = useAuth();
  const { organization } = useOrganizationStore();
  const { entries, loading, fetchEntries, createEntry, deleteEntry } = useJournalStore();
  const orgId = organization?.id;

  const [showCompose, setShowCompose] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [newType, setNewType] = useState("idea");
  const [newMood, setNewMood] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState<string>("");
  const [tab, setTab] = useState<"entries" | "pipeline" | "trends">("entries");
  const { listening, interimText, startListening, stopListening } = useSpeechRecognition();
  const [moodTrends, setMoodTrends] = useState<any[]>([]);
  const [moodSummary, setMoodSummary] = useState<any>(null);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const hasMic = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  useEffect(() => {
    if (orgId) fetchEntries(orgId, filter || undefined);
  }, [orgId, fetchEntries, filter]);

  useEffect(() => {
    if (tab === "trends" && orgId && moodTrends.length === 0 && !trendsLoading) {
      setTrendsLoading(true);
      fetch(`${API_URL}/journal/mood-trends?organization_id=${orgId}&days=30`)
        .then((r) => r.json())
        .then((data) => {
          setMoodTrends(data.trends || []);
          setMoodSummary(data.summary || null);
        })
        .catch(() => {})
        .finally(() => setTrendsLoading(false));
    }
  }, [tab, orgId, moodTrends.length, trendsLoading]);

  const handleSubmit = async () => {
    if (!newContent.trim() || !orgId) return;
    setSubmitting(true);
    try {
      await createEntry({ content: newContent.trim(), type: newType, mood: newMood || undefined }, orgId);
      setNewContent("");
      setNewType("idea");
      setNewMood("");
      setShowCompose(false);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredEntries = filter
    ? entries.filter((e) => e.type === filter)
    : entries;

  const pipelineGroups = ["backlog", "in_review", "approved", "converted"].map((status) => ({
    status,
    label: PIPELINE_LABELS[status].label,
    color: PIPELINE_LABELS[status].color,
    items: entries.filter((e) => (e.pipeline_status || "backlog") === status),
  }));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <Lightbulb className="w-7 h-7 text-amber-400" />
              Have an Idea
            </h1>
            <p className="text-text-muted mt-1 text-sm">
              Capture ideas, journal your thoughts, or reflect on your day.
              AI will analyze your entries and turn them into actionable tasks.
            </p>
          </div>
          <Button onClick={() => setShowCompose(true)} className="cursor-pointer gap-1.5">
            <Plus className="w-4 h-4" />
            New Entry
          </Button>
        </div>

        {showCompose && (
          <Card className="border-primary/30">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center gap-2">
                {TYPE_OPTIONS.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setNewType(t.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      newType === t.value
                        ? "bg-primary text-white shadow-sm"
                        : "bg-surface border border-border/50 text-text-muted hover:border-primary/30"
                    }`}
                  >
                    {t.icon}
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="relative">
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder={
                    newType === "idea"
                      ? "What's your idea? Describe it in detail..."
                      : newType === "journal"
                      ? "How was your day? What happened?"
                      : "What's on your mind? Any reflections to share?"
                  }
                  className="w-full min-h-[120px] p-3 pr-10 rounded-lg bg-surface border border-border/50 focus:border-primary focus:outline-none text-sm resize-none"
                />
                {hasMic && (
                  <button
                    type="button"
                    onClick={listening ? stopListening : () => startListening((text: string) => setNewContent((prev) => prev ? `${prev}\n${text}` : text))}
                    className={`absolute top-3 right-3 p-1.5 rounded-lg transition-colors cursor-pointer ${
                      listening ? "bg-rose-500/20 text-rose-400 animate-pulse" : "bg-surface border border-border/30 text-text-muted hover:text-primary hover:border-primary/30"
                    }`}
                    title={listening ? "Stop recording" : "Start voice input"}
                  >
                    {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                )}
              </div>
              {listening && (
                <div className="flex items-center gap-2 text-xs text-rose-400">
                  <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
                  {interimText ? `"${interimText}"` : "Listening..."}
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">Mood:</span>
                {MOOD_OPTIONS.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setNewMood(newMood === m.value ? "" : m.value)}
                    className={`px-2 py-1 rounded-lg text-xs transition-all cursor-pointer ${
                      newMood === m.value
                        ? "bg-primary/10 border border-primary/30 text-primary"
                        : "bg-surface border border-border/30 text-text-muted hover:border-primary/20"
                    }`}
                  >
                    {m.emoji} {m.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setShowCompose(false)} className="cursor-pointer">
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={submitting || !newContent.trim()} className="cursor-pointer">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
                  Save & Analyze
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!showCompose && (
          <div className="flex items-center gap-2 border-b border-border/40 pb-2">
            {[
              { key: "entries" as const, icon: <MessageSquare className="w-4 h-4" />, label: "Entries" },
              { key: "pipeline" as const, icon: <Columns className="w-4 h-4" />, label: "Pipeline" },
              { key: "trends" as const, icon: <TrendingUp className="w-4 h-4" />, label: "Mood Trends" },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-medium transition-all cursor-pointer ${
                  tab === t.key
                    ? "bg-primary/10 text-primary border-b-2 border-primary"
                    : "text-text-muted hover:text-primary"
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        )}

        {!showCompose && tab === "entries" && (
          <>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFilter("")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  !filter ? "bg-primary text-white" : "bg-surface border border-border/40 text-text-muted hover:border-primary/30"
                }`}
              >
                All
              </button>
              {TYPE_OPTIONS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setFilter(t.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    filter === t.value
                      ? "bg-primary text-white"
                      : "bg-surface border border-border/40 text-text-muted hover:border-primary/30"
                  }`}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
              {filteredEntries.length > 0 && (
                <span className="text-xs text-text-muted ml-auto">{filteredEntries.length} entries</span>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : filteredEntries.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/10 to-purple-500/10 flex items-center justify-center mx-auto mb-4 border border-amber-500/20">
                    <Lightbulb className="w-8 h-8 text-amber-400/60" />
                  </div>
                  <CardTitle className="text-lg mb-1">
                    {filter ? `No ${filter} entries yet` : "No ideas yet"}
                  </CardTitle>
                  <CardDescription className="max-w-md mx-auto">
                    {filter === "idea"
                      ? "Got a new concept, feature, or improvement? Write it down and let AI analyze it."
                      : filter === "journal"
                      ? "Write about your day, challenges, or wins. AI will help connect the dots."
                      : filter === "reflection"
                      ? "Take a moment to reflect on what's working and what's not."
                      : "Click 'New Entry' to capture your first idea, journal entry, or reflection."}
                  </CardDescription>
                  <Button onClick={() => setShowCompose(true)} className="mt-4 cursor-pointer">
                    <Plus className="w-4 h-4 mr-1.5" />
                    New Entry
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredEntries.map((entry) => (
                  <EntryCard key={entry._id} entry={entry} onDelete={deleteEntry} orgId={orgId} />
                ))}
              </div>
            )}
          </>
        )}

        {!showCompose && tab === "pipeline" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {pipelineGroups.map((group) => (
              <div key={group.status} className="p-3 rounded-xl bg-surface border border-border/40">
                <div className="flex items-center justify-between mb-3">
                  <Badge variant="outline" className={`text-[10px] ${group.color}`}>
                    {group.label}
                  </Badge>
                  <span className="text-[10px] text-text-muted">{group.items.length}</span>
                </div>
                <div className="space-y-2 min-h-[120px]">
                  {group.items.length === 0 ? (
                    <p className="text-[10px] text-text-muted text-center py-6">No items</p>
                  ) : (
                    group.items.slice(0, 10).map((entry) => (
                      <div key={entry._id} className="p-2 rounded-lg bg-gradient-to-r from-primary/5 to-purple-500/5 border border-border/30">
                        <p className="text-[11px] leading-relaxed line-clamp-2">{entry.content}</p>
                        <div className="flex items-center gap-1 mt-1.5">
                          {entry.mood && (
                            <span className="text-[9px]">{MOOD_OPTIONS.find((m) => m.value === entry.mood)?.emoji}</span>
                          )}
                          <span className="text-[9px] text-text-muted ml-auto">
                            {new Date(entry.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                  {group.items.length > 10 && (
                    <p className="text-[9px] text-text-muted text-center">+{group.items.length - 10} more</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!showCompose && tab === "trends" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Mood Trends (30 days)
              </CardTitle>
              {moodSummary && (
                <CardDescription>
                  {moodSummary.total_entries} entries with mood data across {moodSummary.days_with_data} days
                  {moodSummary.most_common_mood && (
                    <> &middot; Most common: {MOOD_OPTIONS.find((m) => m.value === moodSummary.most_common_mood)?.emoji} {moodSummary.most_common_mood}</>
                  )}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {trendsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              ) : moodTrends.length === 0 ? (
                <div className="py-12 text-center text-xs text-text-muted">
                  <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No mood data yet. Start journaling with a mood to see trends.
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={moodTrends}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: "8px", fontSize: "12px" }}
                        labelStyle={{ color: "#e2e8f0" }}
                      />
                      <Legend wrapperStyle={{ fontSize: "10px" }} />
                      <Line type="monotone" dataKey="great" stroke="#22c55e" strokeWidth={2} dot={false} name="Great" />
                      <Line type="monotone" dataKey="good" stroke="#3b82f6" strokeWidth={2} dot={false} name="Good" />
                      <Line type="monotone" dataKey="okay" stroke="#eab308" strokeWidth={2} dot={false} name="Okay" />
                      <Line type="monotone" dataKey="bad" stroke="#ef4444" strokeWidth={2} dot={false} name="Bad" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}