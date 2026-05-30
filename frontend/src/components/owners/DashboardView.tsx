"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useGoalStore } from "@/stores/goalStore";
import { useMarketTrendsStore } from "@/stores/marketTrendsStore";
import { useReportStore } from "@/stores/reportStore";
import { useAIDashboardAdaptation, type OrgStage } from "@/hooks/useAIDashboardAdaptation";
import {
  Sparkles, Flag, Calendar, Clock, CheckCircle, AlertCircle,
  TrendingUp, TrendingDown, DollarSign, Shield, MessageSquare,
  FileText, Download, Send, Loader2, Newspaper, ExternalLink,
  BarChart3, Target, Zap, Activity, Bell, ChevronRight,
  AlertTriangle, Info, Users, User, FileSpreadsheet, Paperclip,
  PieChart as PieChartIcon, Link2
} from "lucide-react";
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent,
  Badge, Button, Input, Modal, ModalHeader, ModalTitle,
  ModalClose, ModalContent, ModalFooter,
} from "@/components/ui";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RePieChart, Pie, Cell, LineChart as ReLineChart, Line,
  AreaChart, Area, Legend
} from "recharts";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const ICON_MAP: Record<string, any> = {
  Target, CheckCircle, Users, Activity, FileText, TrendingUp,
  TrendingDown, DollarSign, Shield, BarChart3, Clock, Flag,
};

function renderMarkdown(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let inList = false;
  let listType: "ul" | "ol" | null = null;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    line = line
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, "<code>$1</code>");

    const headerMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headerMatch) {
      if (inList) { result.push(`</${listType}>`); inList = false; listType = null; }
      const level = headerMatch[1].length;
      result.push(`<h${level} class="text-sm font-semibold mt-3 mb-1">${headerMatch[2]}</h${level}>`);
      continue;
    }

    const bulletMatch = line.match(/^[-*]\s+(.+)/);
    if (bulletMatch) {
      if (!inList || listType !== "ul") {
        if (inList) result.push(`</${listType}>`);
        result.push('<ul class="list-disc pl-4 space-y-0.5 my-1">');
        inList = true;
        listType = "ul";
      }
      result.push(`<li>${bulletMatch[1]}</li>`);
      continue;
    }

    const numMatch = line.match(/^\d+[.)]\s+(.+)/);
    if (numMatch) {
      if (!inList || listType !== "ol") {
        if (inList) result.push(`</${listType}>`);
        result.push('<ol class="list-decimal pl-4 space-y-0.5 my-1">');
        inList = true;
        listType = "ol";
      }
      result.push(`<li>${numMatch[1]}</li>`);
      continue;
    }

    if (line.trim() === "") {
      if (inList) { result.push(`</${listType}>`); inList = false; listType = null; }
      result.push("<br/>");
      continue;
    }

    if (inList) { result.push(`</${listType}>`); inList = false; listType = null; }
    result.push(`<p class="mb-1">${line}</p>`);
  }

  if (inList) result.push(`</${listType}>`);
  return result.join("\n");
}

function EmptyStateTemplate({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/10 to-purple-500/10 flex items-center justify-center mb-3 border border-primary/20">
        <BarChart3 className="w-6 h-6 text-primary/60" />
      </div>
      <h3 className="text-sm font-semibold text-text-muted mb-1">{title}</h3>
      <p className="text-xs text-text-muted/60 max-w-xs">{hint}</p>
    </div>
  );
}

function ExpandedGoalPipeline({ goal, onClose }: { goal: any; onClose: () => void }) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/goals/${goal.id}`)
      .then((r) => r.json())
      .then((data) => {
        setTasks(data.tasks || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [goal.id]);

  const statusCounts = {
    completed: tasks.filter((t) => t.status === "completed").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    pending: tasks.filter((t) => t.status === "pending").length,
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
      case "in_progress": return "text-primary bg-primary/10 border-primary/20";
      default: return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
    }
  };

  return (
      <Modal open={true} onOpenChange={(open) => { if (!open) onClose(); }} size="xl">
      <ModalHeader>
        <ModalTitle>
          <div className="flex items-center gap-2">
            <Flag className="w-5 h-5 text-primary" />
            <span>{goal.title}</span>
          </div>
        </ModalTitle>
        <ModalClose />
      </ModalHeader>
      <ModalContent>
        <div className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            {goal.department && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 capitalize">
                {goal.department}
              </span>
            )}
            {goal.priority && (
              <span className={`text-xs px-2.5 py-1 rounded-full border ${
                goal.priority === "urgent" ? "text-rose-400 bg-rose-500/10 border-rose-500/20" :
                goal.priority === "high" ? "text-orange-400 bg-orange-500/10 border-orange-500/20" :
                "text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
              }`}>
                {goal.priority}
              </span>
            )}
            {goal.timeline && (
              <span className="text-xs flex items-center gap-1 text-text-muted">
                <Calendar className="w-3 h-3" /> {goal.timeline.replace(/_/g, " ")}
              </span>
            )}
            <Badge variant={goal.status === "completed" ? "success" : goal.status === "active" ? "info" : "warning"}>
              {goal.status}
            </Badge>
          </div>

          {goal.description && (
            <p className="text-sm text-text-muted bg-surface p-3 rounded-xl border border-border/50">
              {goal.description}
            </p>
          )}

          {goal.assignee_name && (
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <User className="w-4 h-4" />
              <span><strong>Assignee:</strong> {goal.assignee_name}</span>
              {goal.reviewer_name && <span className="ml-2"><strong>Reviewer:</strong> {goal.reviewer_name}</span>}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Completed", value: statusCounts.completed, color: "text-emerald-400" },
              { label: "In Progress", value: statusCounts.in_progress, color: "text-primary" },
              { label: "Pending", value: statusCounts.pending, color: "text-yellow-400" },
            ].map((s, i) => (
              <div key={i} className="p-3 rounded-xl bg-surface border border-border/50 text-center">
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-text-muted">{s.label}</p>
              </div>
            ))}
          </div>

          {goal.task_counts && (
            <div>
              <div className="flex justify-between text-xs text-text-muted mb-1.5">
                <span>Overall Progress</span>
                <span className={goal.progress >= 100 ? "text-emerald-400" : goal.progress >= 50 ? "text-primary" : "text-yellow-400"}>
                  {goal.progress}%
                </span>
              </div>
              <div className="h-2 bg-surface rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    goal.progress >= 100 ? "bg-emerald-400" : goal.progress >= 50 ? "bg-primary" : "bg-yellow-400"
                  }`}
                  style={{ width: `${Math.min(goal.progress, 100)}%` }}
                />
              </div>
            </div>
          )}

          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Task Pipeline ({tasks.length})
            </h4>
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : tasks.length === 0 ? (
              <p className="text-xs text-text-muted text-center py-4">No tasks created for this goal yet.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                {tasks.map((task: any) => (
                  <div key={task._id || task.id} className="flex items-center gap-3 p-3 rounded-xl bg-surface border border-border/50">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      task.status === "completed" ? "bg-emerald-500/10" :
                      task.status === "in_progress" ? "bg-primary/10" : "bg-yellow-500/10"
                    }`}>
                      {task.status === "completed" ? (
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                      ) : task.status === "in_progress" ? (
                        <Clock className="w-4 h-4 text-primary" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-yellow-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{task.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${getStatusColor(task.status)}`}>
                          {task.status.replace("_", " ")}
                        </span>
                        {task.priority && (
                          <span className="text-[10px] text-text-muted capitalize">{task.priority}</span>
                        )}
                        {task.assignee_id && (
                          <span className="text-[10px] text-text-muted flex items-center gap-1">
                            <User className="w-3 h-3" /> {task.assignee_id}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </ModalContent>
      <ModalFooter>
        <Button variant="outline" onClick={onClose}>Close</Button>
      </ModalFooter>
    </Modal>
  );
}

function GoalSection() {
  const { organization } = useOrganizationStore();
  const { goals, fetchGoals } = useGoalStore();
  const orgId = organization?.id;
  const [expandedGoal, setExpandedGoal] = useState<any>(null);

  useEffect(() => {
    if (orgId) fetchGoals(orgId);
  }, [orgId, fetchGoals]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "text-emerald-400 bg-emerald-500/10";
      case "active": return "text-primary bg-primary/10";
      default: return "text-yellow-400 bg-yellow-500/10";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent": return "text-rose-400 bg-rose-500/10 border-rose-500/20";
      case "high": return "text-orange-400 bg-orange-500/10 border-orange-500/20";
      case "medium": return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
      default: return "text-gray-400 bg-gray-500/10 border-gray-500/20";
    }
  };

  if (goals.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Flag className="w-5 h-5 text-primary" />
            <CardTitle>Goals Pipeline</CardTitle>
          </div>
          <CardDescription>Track your business goals and pipeline</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyStateTemplate
            title="No goals yet"
            hint="Create goals from the dashboard to start tracking your business objectives."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flag className="w-5 h-5 text-primary" />
              <CardTitle>Goals Pipeline</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {goals.filter((g) => g.status === "active").length} active
              </Badge>
              <Badge variant="outline" className="text-xs">
                {goals.length} total
              </Badge>
            </div>
          </div>
          <CardDescription>Click any goal to see the full task pipeline</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {goals.map((goal) => {
              const progress = goal.progress ?? (goal.status === "completed" ? 100 : goal.status === "active" ? 60 : 20);
              const taskCounts = goal.task_counts ?? { total: 0, completed: 0, in_progress: 0, pending: 0 };
              return (
                <button
                  key={goal.id}
                  onClick={() => setExpandedGoal(goal)}
                  className="w-full text-left flex items-center gap-4 p-4 rounded-xl bg-surface hover:bg-surface-light transition-all border border-border/50 hover:border-primary/30 hover:shadow-md cursor-pointer group"
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      goal.status === "completed"
                        ? "bg-emerald-500/10"
                        : goal.status === "active"
                        ? "bg-primary/10"
                        : "bg-yellow-500/10"
                    }`}
                  >
                    {goal.status === "completed" ? (
                      <CheckCircle className="w-5 h-5 text-emerald-400" />
                    ) : goal.status === "active" ? (
                      <Clock className="w-5 h-5 text-primary" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-yellow-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate group-hover:text-primary transition-colors">{goal.title}</p>
                      {goal.status === "active" && (
                        <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
                          <Bell className="w-3 h-3" />
                          In progress
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-text-muted mt-1">
                      {goal.department && (
                        <span className="capitalize px-2 py-0.5 rounded-full bg-surface border border-border/50">
                          {goal.department}
                        </span>
                      )}
                      {goal.assignee_name && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {goal.assignee_name}
                        </span>
                      )}
                      {(taskCounts.total || 0) > 0 && (
                        <span className="text-text-muted/60">
                          {taskCounts.completed || 0}/{taskCounts.total} tasks
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getPriorityColor(goal.priority)}`}
                  >
                    {goal.priority}
                  </span>
                  <div className="w-24">
                    <div className="flex items-center gap-1">
                      <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            progress >= 100
                              ? "bg-emerald-400"
                              : progress >= 50
                              ? "bg-primary"
                              : progress > 0
                              ? "bg-yellow-400"
                              : "bg-gray-500/30"
                          }`}
                          style={{ width: `${Math.min(progress, 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-text-muted w-6 text-right">{progress}%</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-primary transition-colors flex-shrink-0" />
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {expandedGoal && (
        <ExpandedGoalPipeline
          goal={expandedGoal}
          onClose={() => setExpandedGoal(null)}
        />
      )}
    </>
  );
}

function AISummaryChat() {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>(() => {
    try {
      const saved = localStorage.getItem("yesboss-aisummary-chat");
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [loadedFromApi, setLoadedFromApi] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { organization } = useOrganizationStore();

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!organization?.id || loadedFromApi) return;
    fetch(`${API_URL}/executive-chat/history?organization_id=${organization.id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.history?.length) {
          const reversed = [...data.history].reverse().map((m: any) => ({
            role: m.role,
            content: m.content,
          }));
          setMessages(reversed);
        }
        setLoadedFromApi(true);
      })
      .catch(() => setLoadedFromApi(true));
  }, [organization?.id, loadedFromApi]);

  const saveMessages = useCallback((msgs: { role: string; content: string }[]) => {
    try {
      localStorage.setItem("yesboss-aisummary-chat", JSON.stringify(msgs));
    } catch {}
  }, []);

  useEffect(() => {
    if (messages.length > 0) saveMessages(messages);
  }, [messages, saveMessages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    const updated = [...messages, { role: "user" as const, content: userMsg }];
    setMessages(updated);
    saveMessages(updated);
    setLoading(true);

    fetch(`${API_URL}/executive-chat/history?organization_id=${organization?.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "user", content: userMsg }),
    }).catch(() => {});

    try {
      const history = messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      }));

      const response = await fetch(`${API_URL}/executive-chat/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          organization_id: organization?.id,
          context: {
            organization: organization?.name,
            industry: organization?.industry,
            micro_vertical: organization?.micro_vertical,
          },
          history,
        }),
      });

      if (!response.ok) throw new Error("Chat failed");

      const data = await response.json();
      const reply = data.message || "I've analyzed your query. Here are my insights...";
      const final = [...updated, { role: "assistant" as const, content: reply }];
      setMessages(final);
      saveMessages(final);

      fetch(`${API_URL}/executive-chat/history?organization_id=${organization?.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "assistant", content: reply }),
      }).catch(() => {});
    } catch {
      const errMsgs = [
        ...updated,
        { role: "assistant" as const, content: "I'm having trouble connecting to my analysis engine. Please try again or check your connection." },
      ];
      setMessages(errMsgs);
      saveMessages(errMsgs);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !organization?.id) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("organization_id", organization.id);

    try {
      const response = await fetch(`${API_URL}/executive-chat/upload-and-analyze`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let errDetail = "Upload failed";
        try { const errBody = await response.json(); errDetail = errBody.detail || errDetail; } catch {}
        throw new Error(errDetail);
      }

      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "user",
          content: `📎 Uploaded: **${file.name}**`,
        },
        {
          role: "assistant",
          content: data.message
            ? `✅ ${data.message}\n\n**Preview:** ${data.text_preview?.substring(0, 300)}...`
            : `✅ File **${file.name}** uploaded and analyzed! Ask me anything about it.`,
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `❌ Failed to upload and analyze **${file.name}**: ${err.message || "Unknown error"}`,
        },
      ]);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleUrlUpload = async () => {
    const url = urlValue.trim();
    if (!url || !organization?.id || urlLoading) return;
    setUrlLoading(true);
    setShowUrlInput(false);
    setUrlValue("");

    const formData = new FormData();
    formData.append("url", url);
    formData.append("organization_id", organization.id);

    setMessages((prev) => [...prev, { role: "user", content: `📎 Import from URL: ${url}` }]);

    try {
      const response = await fetch(`${API_URL}/executive-chat/upload-url`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        let errDetail = "Upload failed";
        try { const errBody = await response.json(); errDetail = errBody.detail || errDetail; } catch {}
        throw new Error(errDetail);
      }
      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `✅ ${data.message}\n\n**Preview:** ${data.text_preview?.substring(0, 300)}...`,
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `❌ Failed to import from URL: ${err.message || "Unknown error"}` },
      ]);
    } finally {
      setUrlLoading(false);
    }
  };

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="flex-shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          <CardTitle>AI Business Analytics</CardTitle>
          <Badge variant="default" className="text-[10px] ml-2">Real-time</Badge>
        </div>
        <CardDescription>
          Ask about your business or upload files/URLs for analysis
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-2 custom-scrollbar" style={{ maxHeight: "320px" }}>
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 ${
                msg.role === "user" ? "flex-row-reverse" : ""
              } animate-in fade-in slide-in-from-bottom-1 duration-200`}
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  msg.role === "user"
                    ? "bg-gradient-to-br from-primary to-purple-500"
                    : "bg-surface border border-border/50"
                }`}
              >
                {msg.role === "user" ? (
                  <span className="text-white font-bold text-xs">U</span>
                ) : (
                  <Sparkles className="w-4 h-4 text-primary" />
                )}
              </div>
              <div
                className={`max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-gradient-to-br from-primary/20 to-purple-500/20 text-foreground"
                    : "bg-surface border border-border/50 text-text-muted"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-text-muted text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing your business data...
            </div>
          )}
          {uploading && (
            <div className="flex items-center gap-2 text-text-muted text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Uploading and analyzing file...
            </div>
          )}
          {urlLoading && (
            <div className="flex items-center gap-2 text-text-muted text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Fetching and analyzing URL...
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
        {showUrlInput && (
          <div className="flex gap-2 mb-2 flex-shrink-0">
            <Input
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              placeholder="Paste a file URL (PDF, DOCX, etc)..."
              onKeyDown={(e) => e.key === "Enter" && handleUrlUpload()}
              icon={<Link2 className="w-4 h-4 text-text-muted" />}
            />
            <Button onClick={handleUrlUpload} disabled={urlLoading || !urlValue.trim()} size="icon" className="cursor-pointer flex-shrink-0">
              <Send className="w-4 h-4" />
            </Button>
            <Button onClick={() => { setShowUrlInput(false); setUrlValue(""); }} variant="outline" size="icon" className="cursor-pointer flex-shrink-0">
              X
            </Button>
          </div>
        )}
        <div className="flex gap-2 flex-shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.csv,.xlsx,.xls,.png,.jpg,.jpeg"
            className="hidden"
            onChange={handleFileUpload}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            variant="outline"
            size="icon"
            className="cursor-pointer flex-shrink-0"
            title="Upload a file for analysis"
          >
            <Paperclip className="w-4 h-4" />
          </Button>
          <Button
            onClick={() => setShowUrlInput(!showUrlInput)}
            disabled={urlLoading}
            variant="outline"
            size="icon"
            className="cursor-pointer flex-shrink-0"
            title="Import from URL"
          >
            <Link2 className="w-4 h-4" />
          </Button>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your business or uploaded files..."
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            icon={<MessageSquare className="w-4 h-4 text-text-muted" />}
          />
          <Button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            size="icon"
            className="cursor-pointer flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function WeeklyReportGenerator() {
  const { currentReport, generating, downloading, generateReport, downloadReport } =
    useReportStore();
  const { organization } = useOrganizationStore();
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");

  const showAlert = (title: string, message: string) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertOpen(true);
  };

  const handleGenerate = async () => {
    try {
      await generateReport("weekly", organization?.id);
    } catch (err: any) {
      if (err?.message?.includes("Insufficient data") || err?.status === 400) {
        showAlert("Insufficient Data", "You need at least one goal or task before generating a report. Create a goal first to get started.");
      } else {
        showAlert("Generation Failed", err?.message || "Could not generate the report. Please try again.");
      }
    }
  };

  const handleDownload = async (format: string = "pdf") => {
    if (!currentReport) return;
    try {
      await downloadReport(currentReport.id, format);
    } catch (err: any) {
      showAlert("Download Failed", err?.message || "Could not download the report. Please try again.");
    }
  };

  return (
    <>
      <Modal open={alertOpen} onOpenChange={setAlertOpen} size="md">
        <ModalHeader>
          <ModalTitle>{alertTitle}</ModalTitle>
          <ModalClose />
        </ModalHeader>
        <ModalContent>
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-4">
              <AlertTriangle className="w-8 h-8 text-amber-400" />
            </div>
            <p className="text-sm text-text-muted">{alertMessage}</p>
          </div>
        </ModalContent>
        <ModalFooter>
          <Button variant="outline" onClick={() => setAlertOpen(false)}>
            Got it
          </Button>
        </ModalFooter>
      </Modal>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <CardTitle>Weekly Report Generator</CardTitle>
          </div>
          <CardDescription>
            Generate and download comprehensive business reports (PDF &amp; Word)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-br from-primary/5 to-purple-500/5 border border-primary/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Weekly Business Report</p>
                <p className="text-xs text-text-muted">
                  Goals, tasks, department breakdown, and completion rates
                </p>
              </div>
            </div>
            <Button
              onClick={handleGenerate}
              disabled={generating}
              className="cursor-pointer"
              size="sm"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <Zap className="w-4 h-4 mr-1" />
              )}
              {generating ? "Generating..." : "Generate"}
            </Button>
          </div>
          {currentReport && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Active Goals", value: currentReport.summary.active_goals, icon: Target, color: "text-primary" },
                  { label: "Tasks Done", value: currentReport.summary.completed_tasks, icon: CheckCircle, color: "text-emerald-400" },
                  { label: "Team Size", value: currentReport.summary.team_size, icon: Activity, color: "text-purple-400" },
                  { label: "Completion Rate", value: `${currentReport.summary.completion_rate}%`, icon: TrendingUp, color: "text-amber-400" },
                ].map((stat, i) => {
                  const Icon = stat.icon;
                  return (
                    <div key={i} className="p-3 rounded-xl bg-surface border border-border/50">
                      <Icon className={`w-4 h-4 ${stat.color} mb-1`} />
                      <p className="text-lg font-bold">{stat.value}</p>
                      <p className="text-[10px] text-text-muted">{stat.label}</p>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => handleDownload("pdf")}
                  disabled={downloading}
                  variant="outline"
                  size="sm"
                  className="cursor-pointer flex-1"
                >
                  <Download className="w-4 h-4 mr-1" />
                  {downloading ? "Downloading..." : "Download PDF"}
                </Button>
                <Button
                  onClick={() => handleDownload("docx")}
                  disabled={downloading}
                  variant="outline"
                  size="sm"
                  className="cursor-pointer flex-1"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-1" />
                  {downloading ? "Downloading..." : "Download Word"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function MarketTrendsSection() {
  const { articles, loading, fetchTrends } = useMarketTrendsStore();
  const { organization } = useOrganizationStore();

  useEffect(() => {
    fetchTrends(organization?.industry, organization?.micro_vertical);
  }, [organization?.industry, organization?.micro_vertical, fetchTrends]);

  const getTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Newspaper className="w-5 h-5 text-primary" />
            <CardTitle>Market Trends</CardTitle>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {organization?.industry || "General"}
          </Badge>
        </div>
        <CardDescription>
          Click any article to read the full story on the source website
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : articles.length === 0 ? (
          <EmptyStateTemplate
            title="No market data available"
            hint="Market trends will appear here once we gather data about your industry."
          />
        ) : (
          <div className="space-y-2">
            {articles.slice(0, 5).map((article, i) => (
              <a
                key={i}
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 p-3 rounded-xl bg-surface hover:bg-surface-light transition-all border border-border/50 group cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Newspaper className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                      {article.title}
                    </p>
                    <ExternalLink className="w-3 h-3 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                  </div>
                  <p className="text-xs text-text-muted line-clamp-1 mt-0.5">
                    {article.description}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] text-text-muted/60">
                      {article.source}
                    </span>
                    <span className="text-[10px] text-text-muted/40">&middot;</span>
                    <span className="text-[10px] text-text-muted/60">
                      {getTimeAgo(article.published_at)}
                    </span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DataCharts({ goals, tasks }: { goals: any[]; tasks?: any[] }) {
  const [chartTasks, setChartTasks] = useState<any[]>([]);
  const { organization } = useOrganizationStore();

  useEffect(() => {
    if (!organization?.id) return;
    fetch(`${API_URL}/tasks?organization_id=${organization.id}`)
      .then((r) => r.json())
      .then((data) => setChartTasks(data.tasks || []))
      .catch(() => {});
  }, [organization?.id]);

  const allTasks = tasks || chartTasks;

  const taskStatusData = [
    { name: "Completed", value: allTasks.filter((t: any) => t.status === "completed").length, color: "#10b981" },
    { name: "In Progress", value: allTasks.filter((t: any) => t.status === "in_progress").length, color: "#0ea5e9" },
    { name: "Pending", value: allTasks.filter((t: any) => t.status === "pending").length, color: "#eab308" },
  ].filter((d) => d.value > 0);

  const goalProgressData = goals.slice(0, 8).map((g) => ({
    name: g.title?.length > 15 ? g.title.substring(0, 15) + "..." : g.title || "Goal",
    progress: g.progress ?? 0,
  }));

  const COLORS = ["#0ea5e9", "#10b981", "#eab308", "#f97316", "#8b5cf6", "#ec4899"];

  if (allTasks.length === 0 && goals.length === 0) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {taskStatusData.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <PieChartIcon className="w-5 h-5 text-primary" />
              <CardTitle>Task Distribution</CardTitle>
            </div>
            <CardDescription>Real-time breakdown of all task statuses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart>
                  <Pie
                    data={taskStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {taskStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </RePieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {goalProgressData.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              <CardTitle>Goal Progress</CardTitle>
            </div>
            <CardDescription>Completion percentage per goal</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={goalProgressData} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" tick={{ fill: "#64748b", fontSize: 10 }} width={90} />
                  <Tooltip
                    contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }}
                    formatter={(value: any) => [`${value}%`, "Progress"]}
                  />
                  <Bar dataKey="progress" radius={[0, 6, 6, 0]}>
                    {goalProgressData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {taskStatusData.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              <CardTitle>Task Completion</CardTitle>
            </div>
            <CardDescription>Completed vs total tasks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={[
                    { name: "Pending", value: taskStatusData.find((d) => d.name === "Pending")?.value || 0 },
                    { name: "In Progress", value: taskStatusData.find((d) => d.name === "In Progress")?.value || 0 },
                    { name: "Completed", value: taskStatusData.find((d) => d.name === "Completed")?.value || 0 },
                  ]}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }}
                  />
                  <Area type="monotone" dataKey="value" stroke="#0ea5e9" fill="url(#colorGradient)" strokeWidth={2} />
                  <defs>
                    <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RevenueRiskRadar() {
  const [risks, setRisks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { organization } = useOrganizationStore();

  useEffect(() => {
    if (!organization?.id) return;
    let cancelled = false;
    const fetchRisk = () => {
      fetch(`${API_URL}/dashboard/kpi?organization_id=${organization.id}`)
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          const computed = [];
          if (data.goals_active) {
            const val = data.goals_active.value;
            computed.push({
              title: "Goal Completion Risk",
              level: val > 5 ? "high" : val > 2 ? "medium" : "low",
              value: Math.min(val * 15, 95),
              description: `${val} active goals in progress`,
              impact: val > 5 ? "High - review priorities" : val > 2 ? "Medium - monitor progress" : "Low - on track",
              icon: Target,
            });
          }
          if (data.completion_rate) {
            const rate = data.completion_rate.value;
            computed.push({
              title: "Task Completion Rate",
              level: rate < 30 ? "high" : rate < 60 ? "medium" : "low",
              value: 100 - rate,
              description: `${rate}% tasks completed`,
              impact: rate >= 60 ? "Good momentum" : rate >= 30 ? "Needs attention" : "Critical - intervene",
              icon: CheckCircle,
            });
          }
          if (data.team_size) {
            computed.push({
              title: "Team Capacity",
              level: "medium",
              value: Math.min(data.team_size.value * 10, 80),
              description: `${data.team_size.value} team members`,
              impact: "Monitor team workload distribution",
              icon: Activity,
            });
          }
          if (data.tasks_pipeline) {
            const pend = data.tasks_pipeline.change?.match(/(\d+) pending/);
            const pendingCount = pend ? parseInt(pend[1]) : 0;
            computed.push({
              title: "Task Backlog",
              level: pendingCount > 10 ? "high" : pendingCount > 5 ? "medium" : "low",
              value: Math.min(pendingCount * 8, 90),
              description: `${pendingCount} pending tasks in queue`,
              impact: pendingCount > 10 ? "High - assign resources" : pendingCount > 5 ? "Medium - review priorities" : "Low - manageable",
              icon: Clock,
            });
          }
          setRisks(computed.length > 0 ? computed : [
            { title: "No Risk Data", level: "low", value: 0, description: "Add goals and tasks to see risk analysis", impact: "Start creating goals", icon: Shield },
          ]);
          setLoading(false);
        })
        .catch(() => {
          if (!cancelled) { setRisks([]); setLoading(false); }
        });
    };
    fetchRisk();
    const interval = setInterval(fetchRisk, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [organization?.id]);

  const getRiskColor = (level: string) => {
    switch (level) {
      case "high": return { bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/20", bar: "bg-rose-400" };
      case "medium": return { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20", bar: "bg-amber-400" };
      default: return { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20", bar: "bg-emerald-400" };
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <CardTitle>Business Risk Radar</CardTitle>
          <Badge variant="warning" className="text-[10px] ml-2">Real-time</Badge>
        </div>
        <CardDescription>AI-analyzed risks based on your actual business data</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {risks.slice(0, 6).map((risk, i) => {
              const colors = getRiskColor(risk.level);
              const Icon = risk.icon;
              return (
                <div key={i} className={`p-4 rounded-xl ${colors.bg} ${colors.border} border transition-all hover:shadow-lg`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${colors.text}`} />
                      <span className="text-sm font-medium">{risk.title}</span>
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${colors.bg} ${colors.text} ${colors.border} border`}>
                      {risk.level}
                    </span>
                  </div>
                  <div className="mb-2">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-text-muted">Risk Score</span>
                      <span className={colors.text}>{risk.value}%</span>
                    </div>
                    <div className="h-2 bg-black/20 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${colors.bar} transition-all duration-500`} style={{ width: `${risk.value}%` }} />
                    </div>
                  </div>
                  <p className="text-xs text-text-muted mt-2">{risk.description}</p>
                  <p className={`text-[10px] ${colors.text} mt-1`}>{risk.impact}</p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardView() {
  const { user } = useAuth();
  const { organization } = useOrganizationStore();
  const { goals, fetchGoals } = useGoalStore();
  const { adaptation, getAISummary } = useAIDashboardAdaptation();
  const [aiSummary, setAiSummary] = useState("");
  const [kpiData, setKpiData] = useState<Record<string, any> | null>(null);
  const [kpiLoading, setKpiLoading] = useState(false);
  const orgId = organization?.id;

  useEffect(() => {
    if (orgId) fetchGoals(orgId);
  }, [orgId, fetchGoals]);

  useEffect(() => {
    if (adaptation.stage !== "new") {
      getAISummary().then(setAiSummary);
    }
  }, [adaptation.stage, getAISummary]);

  useEffect(() => {
    if (!orgId || !adaptation.showExecutiveKPIs) return;
    let cancelled = false;
    const fetchKpi = () => {
      setKpiLoading(true);
      fetch(`${API_URL}/dashboard/kpi?organization_id=${orgId}`)
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (!cancelled) { setKpiData(data); setKpiLoading(false); }
        })
        .catch(() => { if (!cancelled) setKpiLoading(false); });
    };
    fetchKpi();
    const interval = setInterval(fetchKpi, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [orgId, adaptation.showExecutiveKPIs]);

  const activeGoalCount = goals.filter(g => g.status === "active").length;

  const getStageLabel = (stage: OrgStage) => {
    switch (stage) {
      case "new": return "Getting Started";
      case "onboarding": return "Building Foundation";
      case "growing": return "Growth Mode";
      case "established": return "Executive View";
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "up": return <TrendingUp className="w-3 h-3 text-emerald-400" />;
      case "down": return <TrendingDown className="w-3 h-3 text-rose-400" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent">
            Executive Dashboard
          </h1>
          <p className="text-text-muted mt-1">
            {organization?.name
              ? `${organization.name} — ${organization.industry || "Business"}${organization.micro_vertical ? ` — ${organization.micro_vertical}` : ""}`
              : "Your business command center"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
            {getStageLabel(adaptation.stage)}
          </span>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-emerald-400">Live</span>
          </div>
        </div>
      </div>

      {aiSummary && (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-purple-500/5 animate-in fade-in slide-in-from-top-1 duration-300">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <p className="text-sm text-text-muted">{aiSummary}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {adaptation.showSetupWizard && (
        <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <Info className="w-6 h-6 text-amber-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-amber-400 mb-1">
                  {adaptation.stage === "new" ? "Welcome to Your Executive Dashboard" : "Great Start!"}
                </h3>
                <p className="text-sm text-text-muted mb-3">{adaptation.emptyStateMessage}</p>
                {adaptation.suggestedFocus.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {adaptation.suggestedFocus.map((item, i) => (
                      <span key={i} className="text-xs px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {item}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {adaptation.showExecutiveKPIs && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="w-10 h-10 rounded-xl bg-surface" />
                </CardHeader>
                <CardContent>
                  <div className="h-8 w-20 bg-surface rounded mb-2" />
                  <div className="h-4 w-16 bg-surface rounded" />
                </CardContent>
              </Card>
            ))
          ) : kpiData ? (
            Object.entries(kpiData).slice(0, 8).map(([key, kpi]: [string, any], i) => {
              const IconComponent = ICON_MAP[kpi.icon] || BarChart3;
              return (
                <Card key={key} className="card-hover animate-in fade-in slide-in-from-bottom-1 duration-300" style={{ animationDelay: `${i * 50}ms` }}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/10 to-purple-500/10 flex items-center justify-center">
                        <IconComponent className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex items-center gap-1">
                        {getTrendIcon(kpi.trend)}
                        <Badge variant="secondary" className="text-[10px]">{kpi.change || "---"}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{kpi.formatted ?? "---"}</div>
                    <div className="text-sm text-text-muted">{kpi.label || key.replace(/_/g, " ")}</div>
                    {kpi.description && (
                      <p className="text-[10px] text-text-muted/60 mt-1">{kpi.description}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })
          ) : (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <div className="w-10 h-10 rounded-xl bg-surface" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">--</div>
                  <div className="text-sm text-text-muted">No data yet</div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      <GoalSection />

      {adaptation.showExecutiveKPIs && <DataCharts goals={goals} />}

      {adaptation.showGrokInsights && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AISummaryChat />
          <div className="space-y-6">
            <WeeklyReportGenerator />
            <MarketTrendsSection />
          </div>
        </div>
      )}

      {adaptation.showRevenueRisk && <RevenueRiskRadar />}
    </div>
  );
}