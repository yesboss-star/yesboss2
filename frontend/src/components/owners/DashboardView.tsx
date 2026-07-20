"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useGoalStore, type Strategy } from "@/stores/goalStore";
import { useTaskStore } from "@/stores/taskStore";
import { useOrgChartStore } from "@/stores/orgChartStore";
import { useMarketTrendsStore } from "@/stores/marketTrendsStore";
import { useReportStore } from "@/stores/reportStore";
import { useAIDashboardAdaptation } from "@/hooks/useAIDashboardAdaptation";
import GoalModal from "@/components/GoalModal";
import TaskModal from "@/components/TaskModal";

import {
  Sparkles, Flag, Calendar, Clock, CheckCircle, AlertCircle, ChevronDown,
  TrendingUp, Shield, MessageSquare, DollarSign,
  FileText, Download, Loader2, Newspaper, ExternalLink,
  BarChart3, Target, Zap, Activity, ChevronRight,
  AlertTriangle, Info, Users, User, FileSpreadsheet,
  PieChart as PieChartIcon, Link2, X, Network,
  Briefcase, Search, RefreshCw, Upload, Trash2, GitBranch, Plus, List, ArrowLeft,
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
import { getAuthHeaders } from "@/lib/utils";
import KPISuggestionsCard from "@/components/owners/KPISuggestionsCard";
import AISummaryChat from "@/components/AISummaryChat";
import MeetingUploadModal from "@/components/owners/MeetingUploadModal";
import ZohoCalendarBooking from "@/components/owners/ZohoCalendarBooking";
import OrgHealthWidget from "@/components/owners/OrgHealthWidget";
import MarketImpactCard from "@/components/owners/MarketImpactCard";
import CheckInModal from "@/components/owners/CheckInModal";
import IndustryBenchmarksCard from "@/components/owners/IndustryBenchmarksCard";
import CollapsibleSection from "@/components/owners/CollapsibleSection";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

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

function ReviewActions({ goalId, goalTitle, onReviewComplete }: { goalId: string; goalTitle: string; onReviewComplete: () => void }) {
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleReview = async (action: "approve" | "reject") => {
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/goals/${goalId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ action, feedback: action === "reject" ? feedback : undefined }),
      });
      if (!res.ok) throw new Error("Review failed");
      onReviewComplete();
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-3">
      <p className="text-sm font-medium flex items-center gap-2">
        <Clock className="w-4 h-4 text-amber-400" />
        <span>Review Required — <span className="text-amber-400">"{goalTitle}"</span> is marked as complete</span>
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => handleReview("approve")}
          disabled={submitting}
          className="flex-1 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-all cursor-pointer disabled:opacity-50"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "✓ Approve"}
        </button>
        <button
          onClick={() => handleReview("reject")}
          disabled={submitting || !feedback.trim()}
          className="flex-1 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium transition-all cursor-pointer disabled:opacity-50"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "✗ Send Back"}
        </button>
      </div>
      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="Optional feedback — why are you sending this back?"
        rows={2}
        className="w-full px-3 py-2 rounded-lg bg-surface border border-border focus:border-primary focus:outline-none text-sm resize-none"
      />
    </div>
  );
}

function RequestReviewButton({ goalId, goalTitle, onReviewRequested }: { goalId: string; goalTitle: string; onReviewRequested: () => void }) {
  const [submitting, setSubmitting] = useState(false);

  const handleRequestReview = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/goals/${goalId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ status: "pending_review" }),
      });
      if (!res.ok) throw new Error("Failed to request review");
      onReviewRequested();
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
      <button
        onClick={handleRequestReview}
        disabled={submitting}
        className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
        {submitting ? "Submitting..." : "Mark as Complete — Request Review"}
      </button>
      <p className="text-xs text-text-muted mt-2 text-center">The owner will review and approve your completion</p>
    </div>
  );
}

function ExpandedGoalPipeline({ goal, onClose, orgId: propOrgId }: { goal: any; onClose: () => void; orgId?: string }) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [goalData, setGoalData] = useState(goal);
  const { updateTask } = useTaskStore();
  const { generateStrategies, selectStrategy, createGoal } = useGoalStore();
  const { members, fetchOrgMembers } = useOrgChartStore();
  const [confirmingStrategy, setConfirmingStrategy] = useState<{ index: number; strat: any } | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [childGoalSuggestions, setChildGoalSuggestions] = useState<any[]>([]);
  const [generatingChildGoals, setGeneratingChildGoals] = useState(false);
  const [childGoalsBeingAdded, setChildGoalsBeingAdded] = useState<number[]>([]);

  const handleGenerateChildGoals = async () => {
    setGeneratingChildGoals(true);
    try {
      const res = await fetch(`${API_URL}/goals/${goalData.id || goalData._id}/suggest-children`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      });
      if (res.ok) {
        const data = await res.json();
        setChildGoalSuggestions(data.suggestions || []);
      }
    } catch (e) {
      console.error("Failed to generate child goal suggestions", e);
    } finally {
      setGeneratingChildGoals(false);
    }
  };

  const handleAddChildGoal = async (suggestion: any, index: number) => {
    if (childGoalsBeingAdded.includes(index)) return;
    setChildGoalsBeingAdded((prev) => [...prev, index]);
    try {
      await createGoal({
        title: suggestion.title,
        description: suggestion.description || suggestion.title,
        priority: suggestion.priority || "medium",
        department: suggestion.department || goalData.department || "",
        assignee_id: goalData.assignee_id || [],
        assignee_name: goalData.assignee_name || [],
        timeline: suggestion.suggested_timeline || "",
        organization_id: propOrgId || goalData.organization_id,
        goal_type: "short_term",
        duration: "one_time",
        parent_goal_id: goalData.id || goalData._id,
        industry: goalData.industry || "",
        micro_vertical: goalData.micro_vertical || "",
      });
      // Refresh goal data to pick up new sub-goal
      try {
        const refresh = await fetch(`${API_URL}/goals/${goalData.id || goalData._id}`, {
          headers: { ...getAuthHeaders() },
        });
        if (refresh.ok) {
          const data = await refresh.json();
          if (data.goal) setGoalData((prev: any) => ({ ...prev, sub_goals: data.goal.sub_goals }));
        }
      } catch {}
    } catch (e) {
      console.error("Failed to add child goal", e);
      setChildGoalsBeingAdded((prev) => prev.filter((i) => i !== index));
    }
  };

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    setGoalData(goal);
  }, [goal]);

  useEffect(() => {
    if (propOrgId) fetchOrgMembers(propOrgId);
  }, [propOrgId, fetchOrgMembers]);

  const loadTasks = useCallback(() => {
    setLoading(true);
    fetch(`${API_URL}/goals/${goal.id}`)
      .then((r) => r.json())
      .then((data) => {
        const normalizeList = (v: any) => Array.isArray(v) ? v : (v ? [v] : []);
        setTasks((data.tasks || []).map((t: any) => ({ ...t, assignee_id: normalizeList(t.assignee_id), assignee_name: normalizeList(t.assignee_name) })));
        if (data.goal) {
          setGoalData((prev: any) => ({ ...prev, ...data.goal, id: data.goal._id || data.goal.id || prev.id }));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [goal.id]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handleGoalUpdate = (updates: any) => {
    setGoalData((prev: any) => ({ ...prev, ...updates }));
  };

  const taskCounts = goalData.task_counts ?? {
    total: tasks.length,
    completed: tasks.filter((t) => t.status === "completed").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    pending: tasks.filter((t) => t.status === "pending").length,
  };

  const computedProgress = taskCounts.total > 0
    ? Math.round((taskCounts.completed / taskCounts.total) * 100)
    : goalData.progress ?? 0;

  const statusCounts = {
    completed: taskCounts.completed,
    in_progress: taskCounts.in_progress,
    pending: taskCounts.pending,
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
      case "in_progress": return "text-primary bg-primary/10 border-primary/20";
      default: return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
    }
  };

  const handleTaskAssigneeChange = async (task: any, member: { id: string; full_name: string; email: string } | null) => {
    const taskId = task._id || task.id;
    if (!taskId) return;
    const nextAssigneeIds = member?.id ? [member.id] : [];
    const nextAssigneeName = member?.full_name ?? "";
    setTasks((prev) => prev.map((t) => (t._id === taskId || t.id === taskId ? { ...t, assignee_id: nextAssigneeIds, assignee_name: nextAssigneeName } : t)));
    try {
      await updateTask(taskId, { assignee_id: nextAssigneeIds, assignee_name: nextAssigneeName } as any);
    } catch {
      loadTasks();
    }
  };

  const handleTaskStatusChange = async (task: any, status: string) => {
    const taskId = task._id || task.id;
    if (!taskId) return;
    setTasks((prev) => prev.map((t) => (t._id === taskId || t.id === taskId ? { ...t, status } : t)));
    try {
      await updateTask(taskId, { status } as any);
    } catch {
      loadTasks();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 overflow-hidden">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 flex gap-4 items-start max-w-[90vw]">
        {/* Goal Details Card */}
        <div className="w-[528px] max-w-full glass rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[calc(100vh-80px)]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-2 min-w-0">
              <Flag className="w-5 h-5 text-primary flex-shrink-0" />
              <span className="text-lg font-semibold truncate">{goal.title}</span>
            </div>
            <button onClick={onClose} className="rounded-lg p-2 text-text-muted hover:text-foreground hover:bg-surface transition-colors cursor-pointer flex-shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-4">
            <div className="space-y-4">
              {/* Badges */}
              <div className="flex items-center gap-3 flex-wrap">
                {goal.department && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 capitalize flex items-center gap-1">
                    <Briefcase className="w-3 h-3" /> {goal.department}
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
                {goal.is_default && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Default
                  </span>
                )}
                {goal.goal_type && (
                  <span className={`text-xs px-2.5 py-1 rounded-full border flex items-center gap-1 ${
                    goal.goal_type === "long_term"
                      ? "text-indigo-400 bg-indigo-500/10 border-indigo-500/20"
                      : "text-amber-400 bg-amber-500/10 border-amber-500/20"
                  }`}>
                    <Flag className="w-3 h-3" /> {goal.goal_type === "long_term" ? "Long Term" : "Short Term"}
                  </span>
                )}
                {goal.status === "pending_review" && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1 animate-pulse">
                    <Clock className="w-3 h-3" /> Waiting for Review
                  </span>
                )}
              </div>

              {/* Approve/Reject — shown when goal is pending_review and current user is the owner */}
              {goal.status === "pending_review" && user?.uid === goal.created_by && (
                <ReviewActions goalId={goal.id || goal._id} goalTitle={goal.title} onReviewComplete={() => loadTasks()} />
              )}

              {/* Request Review — shown when goal is active and current user is NOT the owner (assignee side) */}
              {goal.status === "active" && user?.uid !== goal.created_by && (
                <RequestReviewButton goalId={goal.id || goal._id} goalTitle={goal.title} onReviewRequested={() => loadTasks()} />
              )}

              {/* Parent goal link */}
              {goalData.parent_goal && (
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 text-sm flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="text-text-muted">
                    Sub-goal of: <span className="text-primary font-medium">{goalData.parent_goal.title}</span>
                  </span>
                </div>
              )}

              {/* Description */}
              {goal.description && (
                <p className="text-sm text-text-muted bg-surface p-3 rounded-xl border border-border/50">
                  {goal.description}
                </p>
              )}

              {/* Assignee/Reviewer */}
              {(goalData.assignee_name || goalData.reviewer_name) && (
                <div className="flex items-center gap-2 text-sm text-text-muted">
                  <User className="w-4 h-4" />
                  {goalData.assignee_name && <span><strong>Assignee:</strong> {goalData.assignee_name}</span>}
                  {goalData.reviewer_name && <span className="ml-2"><strong>Reviewer:</strong> {goalData.reviewer_name}</span>}
                </div>
              )}

              {/* Progress */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-primary/5 to-purple-500/5 border border-primary/20">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold">Overall Goal Progress</span>
                  </div>
                  <span className={`text-lg font-bold ${
                    computedProgress >= 100 ? "text-emerald-400" :
                    computedProgress >= 50 ? "text-primary" : "text-yellow-400"
                  }`}>
                    {computedProgress}%
                  </span>
                </div>
                <div className="h-2.5 bg-surface rounded-full overflow-hidden border border-border/50">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      computedProgress >= 100 ? "bg-emerald-400" :
                      computedProgress >= 50 ? "bg-primary" : "bg-yellow-400"
                    }`}
                    style={{ width: `${Math.min(computedProgress, 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-text-muted mt-1.5">
                  {taskCounts.completed} of {taskCounts.total} tasks completed
                </p>
              </div>

              {/* Status counts */}
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

              {/* Strategies */}
              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary" />
                  Strategic Approaches
                </h4>
                {!goalData.strategies || goalData.strategies.length === 0 ? (
                  <div className="p-4 rounded-xl bg-surface border border-primary/20 text-center">
                    <p className="text-xs text-text-muted mb-2">No strategies generated yet. Generate AI-powered strategic approaches for this goal.</p>
                    <button
                      onClick={async () => {
                        try {
                          const strategies = await generateStrategies(goalData.id || goalData._id);
                          setGoalData((prev: any) => ({ ...prev, strategies, strategy_status: "generated" }));
                        } catch {}
                      }}
                      className="px-4 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-xs font-medium cursor-pointer"
                    >
                      Generate Strategies
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {goalData.strategies.map((strat: any, i: number) => {
                      const isSelected = goalData.selected_strategy?.index === i;
                      return (
                        <div
                          key={i}
                          className={`p-3 rounded-xl border transition-all ${
                            isSelected
                              ? "bg-emerald-500/10 border-emerald-500/30"
                              : "bg-surface border-border/50 hover:border-primary/40"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold">{strat.name}</span>
                                {strat.market_aligned && (
                                  <Badge variant="info" className="text-[10px]">Market-Aligned</Badge>
                                )}
                                {isSelected && (
                                  <Badge variant="success" className="text-[10px]">Selected</Badge>
                                )}
                              </div>
                              <p className="text-xs text-text-muted mt-1">{strat.description}</p>
                              <div className="flex flex-wrap gap-2 mt-2 text-[10px] text-text-muted">
                                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {strat.estimated_timeline || "TBD"}</span>
                                <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" /> {strat.expected_impact || "N/A"}</span>
                              </div>
                              {strat.key_risks && strat.key_risks.length > 0 && (
                                <div className="mt-2">
                                  <p className="text-[10px] font-medium text-rose-400 mb-1">Risks:</p>
                                  <ul className="list-disc list-inside text-[10px] text-text-muted space-y-0.5">
                                    {strat.key_risks.slice(0, 3).map((risk: string, j: number) => (
                                      <li key={j}>{risk}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {strat.resources_needed && strat.resources_needed.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                  {strat.resources_needed.slice(0, 4).map((res: string, j: number) => (
                                    <span key={j} className="px-1.5 py-0.5 rounded-full bg-primary/5 border border-primary/20 text-[9px] text-text-muted">{res}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                            {!isSelected && goalData.strategy_status !== "tasks_created" && (
                              <button
                                onClick={() => setConfirmingStrategy({ index: i, strat })}
                                className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-xs font-medium cursor-pointer flex-shrink-0"
                              >
                                Select
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Suggested Child Goals (for long-term goals) */}
              {goalData.goal_type === "long_term" && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-primary" />
                    Suggested Child Goals
                  </h4>
                  {!childGoalSuggestions || childGoalSuggestions.length === 0 ? (
                    <div className="p-4 rounded-xl bg-surface border border-primary/20 text-center">
                      <p className="text-xs text-text-muted mb-2">Generate AI-suggested short-term child goals for this parent goal.</p>
                      <button
                        onClick={handleGenerateChildGoals}
                        disabled={generatingChildGoals}
                        className="px-4 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-xs font-medium cursor-pointer disabled:opacity-50"
                      >
                        {generatingChildGoals ? (
                          <span className="flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Generating...</span>
                        ) : "Generate Child Goals"}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {childGoalSuggestions.map((s: any, i: number) => {
                        const alreadyAdded = childGoalsBeingAdded.includes(i);
                        return (
                          <div key={i} className="p-3 rounded-xl border bg-surface border-border/50 hover:border-primary/40 transition-all">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold">{s.title}</span>
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                    s.priority === "high"
                                      ? "bg-red-500/15 text-red-400"
                                      : s.priority === "medium"
                                      ? "bg-amber-500/15 text-amber-400"
                                      : "bg-blue-500/15 text-blue-400"
                                  }`}>{s.priority}</span>
                                </div>
                                <p className="text-xs text-text-muted mt-1">{s.description}</p>
                                <div className="flex items-center gap-2 mt-1.5">
                                  {s.department && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium">{s.department}</span>
                                  )}
                                  {s.suggested_timeline && (
                                    <span className="text-[10px] text-text-muted flex items-center gap-1">
                                      <Calendar className="w-3 h-3" /> {s.suggested_timeline}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={() => handleAddChildGoal(s, i)}
                                disabled={alreadyAdded}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex-shrink-0 ${
                                  alreadyAdded
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                    : "bg-primary/10 text-primary hover:bg-primary/20"
                                }`}
                              >
                                {alreadyAdded ? (
                                  <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Added</span>
                                ) : (
                                  <span className="flex items-center gap-1"><Plus className="w-3 h-3" /> Add</span>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Tasks */}
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
                  <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                    {tasks.map((task: any) => (
                      <TaskRow
                        key={task._id || task.id}
                        task={task}
                        members={members}
                        department={goalData.department}
                        onAssigneeChange={(member) => handleTaskAssigneeChange(task, member)}
                        onStatusChange={(status) => handleTaskStatusChange(task, status)}
                        getStatusColor={getStatusColor}
                      />
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end px-6 py-4 border-t border-border">
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>

          {/* Strategy Confirmation Modal */}
          <Modal open={!!confirmingStrategy} onOpenChange={(open: boolean) => { if (!open) setConfirmingStrategy(null); }} size="md">
            <ModalHeader>
              <ModalTitle>Confirm Strategy Selection</ModalTitle>
              <ModalClose />
            </ModalHeader>
            <ModalContent>
              {confirmingStrategy && (
                <div className="py-2 space-y-4">
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-gradient-to-br from-primary/5 to-purple-500/5 border border-primary/20">
                    <Target className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">{confirmingStrategy.strat.name}</p>
                      <p className="text-xs text-text-muted mt-1">{confirmingStrategy.strat.description}</p>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-text-muted">
                      This will generate 3-7 tasks from this strategy and add them to this goal. Tasks can be reviewed and edited after creation.
                    </p>
                  </div>
                </div>
              )}
            </ModalContent>
            <ModalFooter>
              <Button variant="outline" onClick={() => setConfirmingStrategy(null)} disabled={selecting}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (!confirmingStrategy) return;
                  setSelecting(true);
                  try {
                    const result = await selectStrategy(goalData.id || goalData._id, confirmingStrategy.index, propOrgId);
                    setGoalData((prev: any) => ({
                      ...prev,
                      selected_strategy: { index: confirmingStrategy.index, name: confirmingStrategy.strat.name },
                      strategy_status: "tasks_created",
                    }));
                    loadTasks();
                    setConfirmingStrategy(null);
                  } catch {} finally {
                    setSelecting(false);
                  }
                }}
                disabled={selecting}
                className="cursor-pointer"
              >
                {selecting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle className="w-4 h-4 mr-1" />}
                {selecting ? "Creating Tasks..." : "Create Tasks"}
              </Button>
            </ModalFooter>
          </Modal>
        </div>
      </div>
  );
}

function TaskRow({
  task,
  members,
  department,
  onAssigneeChange,
  onStatusChange,
  getStatusColor,
}: {
  task: any;
  members: { id: string; email: string; full_name: string; department: string; role: string }[];
  department?: string;
  onAssigneeChange: (member: { id: string; email: string; full_name: string } | null) => void;
  onStatusChange: (status: string) => void;
  getStatusColor: (status: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members
      .filter((m) => !department || !m.department || m.department.toLowerCase() === department.toLowerCase() || true)
      .filter((m) => !q || m.full_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
      .slice(0, 8);
  }, [members, query, department]);

  const selected = (Array.isArray(task.assignee_name) ? task.assignee_name[0] : task.assignee_name) || (task.assignee_id && task.assignee_id.length > 0 && members.find((m) => task.assignee_id.includes(m.id))?.full_name);

  const statusOptions = [
    { value: "pending", label: "Pending" },
    { value: "in_progress", label: "In Progress" },
    { value: "completed", label: "Completed" },
  ];

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-surface border border-border/50">
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
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <div className="relative">
            <select
              value={task.status || "pending"}
              onChange={(e) => onStatusChange(e.target.value)}
              className={`text-[10px] appearance-none pl-2 pr-6 py-0.5 rounded-full border bg-transparent cursor-pointer focus:outline-none ${getStatusColor(task.status)}`}
            >
              {statusOptions.map((s) => (
                <option key={s.value} value={s.value} className="bg-surface text-foreground">
                  {s.label}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-70" />
          </div>
          {task.priority && (
            <span className="text-[10px] text-text-muted capitalize">{task.priority}</span>
          )}
        </div>
      </div>
      <div ref={ref} className="relative flex-shrink-0 w-44">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-1 text-[10px] px-2 py-1 rounded-lg bg-background border border-border text-text-muted hover:border-primary/40 hover:text-foreground transition-colors"
        >
          <span className="flex items-center gap-1 truncate">
            <User className="w-3 h-3 flex-shrink-0" />
            {selected ? <span className="truncate">{selected}</span> : <span className="text-text-muted/60">Assign…</span>}
          </span>
          <ChevronDown className="w-3 h-3 flex-shrink-0" />
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 z-30 w-56 bg-background border border-border rounded-xl shadow-2xl overflow-hidden">
            <div className="p-2 border-b border-border/50">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search team members..."
                icon={<Search className="w-3 h-3" />}
                className="h-7 text-xs"
                autoFocus
              />
            </div>
            <div className="max-h-44 overflow-y-auto">
              {task.assignee_id && task.assignee_id.length > 0 && (
                <button
                  type="button"
                  onClick={() => { onAssigneeChange(null); setOpen(false); setQuery(""); }}
                  className="w-full text-left px-3 py-1.5 text-[11px] text-rose-400 hover:bg-rose-500/10 flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Unassign
                </button>
              )}
              {filtered.length === 0 ? (
                <p className="p-3 text-[11px] text-text-muted text-center">No team members found</p>
              ) : (
                filtered.map((m) => (
                  <button
                    key={m.id || m.email}
                    type="button"
                    onClick={() => { onAssigneeChange({ id: m.id, email: m.email, full_name: m.full_name }); setOpen(false); setQuery(""); }}
                    className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-primary/10 flex items-center gap-2"
                  >
                    <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[9px] font-medium flex items-center justify-center flex-shrink-0">
                      {m.full_name.charAt(0)}
                    </span>
                    <span className="flex-1 min-w-0 truncate">{m.full_name}</span>
                    <span className="text-text-muted/60 truncate">{m.department || m.role}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const DEPARTMENT_PALETTE: { name: string; bg: string; text: string; border: string; icon: any }[] = [
  { name: "Sales", bg: "from-emerald-500/15 to-teal-500/10", text: "text-emerald-400", border: "border-emerald-500/30", icon: TrendingUp },
  { name: "Finance", bg: "from-amber-500/15 to-orange-500/10", text: "text-amber-400", border: "border-amber-500/30", icon: DollarSign },
  { name: "Marketing", bg: "from-pink-500/15 to-rose-500/10", text: "text-pink-400", border: "border-pink-500/30", icon: Sparkles },
  { name: "Engineering", bg: "from-primary/15 to-cyan-500/10", text: "text-primary", border: "border-primary/30", icon: Zap },
  { name: "Operations", bg: "from-violet-500/15 to-purple-500/10", text: "text-violet-400", border: "border-violet-500/30", icon: Activity },
  { name: "Human Resources", bg: "from-fuchsia-500/15 to-pink-500/10", text: "text-fuchsia-400", border: "border-fuchsia-500/30", icon: Users },
  { name: "Product", bg: "from-blue-500/15 to-indigo-500/10", text: "text-blue-400", border: "border-blue-500/30", icon: Target },
  { name: "Design", bg: "from-rose-500/15 to-pink-500/10", text: "text-rose-400", border: "border-rose-500/30", icon: Sparkles },
  { name: "Customer Support", bg: "from-teal-500/15 to-cyan-500/10", text: "text-teal-400", border: "border-teal-500/30", icon: MessageSquare },
  { name: "R&D", bg: "from-indigo-500/15 to-blue-500/10", text: "text-indigo-400", border: "border-indigo-500/30", icon: FileText },
  { name: "Supply Chain", bg: "from-lime-500/15 to-emerald-500/10", text: "text-lime-400", border: "border-lime-500/30", icon: Network },
  { name: "Legal", bg: "from-slate-500/15 to-gray-500/10", text: "text-slate-400", border: "border-slate-500/30", icon: Shield },
];

function getDepartmentStyle(name: string) {
  return DEPARTMENT_PALETTE.find((d) => d.name.toLowerCase() === (name || "").toLowerCase())
    || { name: name || "Other", bg: "from-gray-500/10 to-slate-500/5", text: "text-text-muted", border: "border-border/50", icon: Briefcase };
}

function InlinePersonPicker({
  value,
  members,
  type,
  onChange,
  saving,
}: {
  value: { id?: string; name?: string };
  members: { id: string; email: string; full_name: string; department: string; role: string }[];
  type: "defaulter" | "reviewer";
  onChange: (member: { id: string; full_name: string; email: string } | null) => void;
  saving?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members
      .filter((m) => !q || m.full_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
      .slice(0, 8);
  }, [members, query]);

  const label = type === "defaulter" ? "Defaulter" : "Reviewer";
  const selected = value.name || "";

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className={`w-full flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg border transition-colors ${
          selected
            ? "bg-primary/10 text-primary border-primary/30"
            : "bg-background text-text-muted border-border hover:border-primary/30"
        }`}
      >
        <User className="w-3 h-3 flex-shrink-0" />
        <span className="truncate flex-1 text-left">
          {selected || `${label}…`}
        </span>
        {saving ? <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" /> : <ChevronDown className="w-3 h-3 flex-shrink-0 opacity-60" />}
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute z-30 mt-1 left-0 w-56 bg-background border border-border rounded-xl shadow-2xl overflow-hidden"
        >
          <div className="p-2 border-b border-border/50">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}...`}
              icon={<Search className="w-3 h-3" />}
              className="h-7 text-xs"
              autoFocus
            />
          </div>
          <div className="max-h-44 overflow-y-auto">
            {value.id && (
              <button
                type="button"
                onClick={() => { onChange(null); setOpen(false); setQuery(""); }}
                className="w-full text-left px-3 py-1.5 text-[11px] text-rose-400 hover:bg-rose-500/10 flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Unassign {label.toLowerCase()}
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="p-3 text-[11px] text-text-muted text-center">No team members found</p>
            ) : (
              filtered.map((m) => (
                <button
                  key={m.id || m.email}
                  type="button"
                  onClick={() => { onChange({ id: m.id, full_name: m.full_name, email: m.email }); setOpen(false); setQuery(""); }}
                  className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-primary/10 flex items-center gap-2"
                >
                  <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[9px] font-medium flex items-center justify-center flex-shrink-0">
                    {m.full_name.charAt(0)}
                  </span>
                  <span className="flex-1 min-w-0 truncate">{m.full_name}</span>
                  <span className="text-text-muted/60 truncate">{m.department || m.role}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const _pick = (val: any) => (Array.isArray(val) && val.length > 0 ? val[0] : (Array.isArray(val) ? undefined : val));

function DepartmentGoalRow({
  goal,
  members,
  onOpenGoal,
  onAssign,
  savingKey,
}: {
  goal: any;
  members: { id: string; email: string; full_name: string; department: string; role: string }[];
  onOpenGoal: (goal: any) => void;
  onAssign: (goal: any, role: "defaulter" | "reviewer", member: { id: string; full_name: string; email: string } | null) => void;
  savingKey: string | null;
}) {
  const progress = goal.progress ?? (goal.status === "completed" ? 100 : goal.status === "active" ? 60 : 20);
  const taskCounts = goal.task_counts ?? { total: 0, completed: 0, in_progress: 0, pending: 0 };
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent": return "text-rose-400 bg-rose-500/10 border-rose-500/20";
      case "high": return "text-orange-400 bg-orange-500/10 border-orange-500/20";
      case "medium": return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
      default: return "text-gray-400 bg-gray-500/10 border-gray-500/20";
    }
  };

  return (
    <div
      onClick={() => onOpenGoal(goal)}
      className="w-full text-left p-3 rounded-xl bg-surface hover:bg-surface-light transition-all border border-border/50 hover:border-primary/40 hover:shadow-md cursor-pointer group"
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
            goal.status === "completed" ? "bg-emerald-500/10" :
            goal.status === "active" ? "bg-primary/10" : "bg-yellow-500/10"
          }`}
        >
          {goal.status === "completed" ? (
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          ) : goal.status === "active" ? (
            <Clock className="w-4 h-4 text-primary" />
          ) : (
            <AlertCircle className="w-4 h-4 text-yellow-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{goal.title}</p>
          <div className="flex items-center gap-2 text-[11px] text-text-muted mt-0.5">
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3" /> {taskCounts.completed || 0}/{taskCounts.total || 0} tasks
            </span>
            {goal.is_default && (
              <span className="flex items-center gap-0.5 text-purple-400">
                <Sparkles className="w-2.5 h-2.5" /> Default
              </span>
            )}
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border flex-shrink-0 ${getPriorityColor(goal.priority)}`}>
          {goal.priority}
        </span>
        <div className="w-20 flex-shrink-0">
          <div className="flex items-center gap-1">
            <div className="flex-1 h-1.5 bg-background rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  progress >= 100 ? "bg-emerald-400" :
                  progress >= 50 ? "bg-primary" :
                  progress > 0 ? "bg-yellow-400" : "bg-gray-500/30"
                }`}
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-text-muted w-7 text-right">{progress}%</span>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-primary transition-colors flex-shrink-0" />
      </div>
      <div
        onClick={(e) => e.stopPropagation()}
        className="mt-2 pl-12 flex items-center gap-2"
      >
        <InlinePersonPicker
          type="defaulter"
          value={{ id: _pick(goal.assignee_id), name: _pick(goal.assignee_name) }}
          members={members}
          saving={savingKey === `${goal.id || goal._id}:defaulter`}
          onChange={(m) => onAssign(goal, "defaulter", m)}
        />
        <InlinePersonPicker
          type="reviewer"
          value={{ id: goal.reviewer_id, name: goal.reviewer_name }}
          members={members}
          saving={savingKey === `${goal.id || goal._id}:reviewer`}
          onChange={(m) => onAssign(goal, "reviewer", m)}
        />
      </div>
    </div>
  );
}

function DepartmentGoalsModal({
  department,
  goals,
  onClose,
  onSelectGoal,
  onAssignGoal,
  onAddGoal,
  onAddTask,
}: {
  department: { name: string };
  goals: any[];
  onClose: () => void;
  onSelectGoal: (goal: any) => void;
  onAssignGoal: (goal: any, role: "defaulter" | "reviewer", member: { id: string; full_name: string; email: string } | null) => Promise<void> | void;
  onAddGoal?: () => void;
  onAddTask?: () => void;
}) {
  const style = getDepartmentStyle(department.name);
  const DeptIcon = style.icon;
  const { organization } = useOrganizationStore();
  const { members, fetchOrgMembers } = useOrgChartStore();
  const { tasks } = useTaskStore();
  const orgId = organization?.id;
  const [search, setSearch] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (orgId) fetchOrgMembers(orgId);
  }, [orgId, fetchOrgMembers]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    if (showMenu) {
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }
  }, [showMenu]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return goals;
    return goals.filter((g) =>
      (g.title || "").toLowerCase().includes(q) ||
      (g.assignee_name || "").toLowerCase().includes(q) ||
      (g.reviewer_name || "").toLowerCase().includes(q) ||
      (g.status || "").toLowerCase().includes(q)
    );
  }, [goals, search]);

  const activeCount = goals.filter((g) => g.status === "active").length;
  const completedCount = goals.filter((g) => g.status === "completed").length;
  const totalTasks = goals.reduce((acc, g) => acc + (g.task_counts?.total || 0), 0);
  const completedTasks = goals.reduce((acc, g) => acc + (g.task_counts?.completed || 0), 0);
  const aggregateProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const unassignedCount = goals.filter((g) => !g.assignee_id).length;

  const handleAssign = async (
    goal: any,
    role: "defaulter" | "reviewer",
    member: { id: string; full_name: string; email: string } | null
  ) => {
    const key = `${goal.id || goal._id}:${role}`;
    setSavingKey(key);
    try {
      await onAssignGoal(goal, role, member);
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <Modal open={true} onOpenChange={(open) => { if (!open) onClose(); }} size="xl">
      <ModalHeader>
        <ModalTitle>
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${style.bg} ${style.border} border flex items-center justify-center`}>
                <DeptIcon className={`w-4 h-4 ${style.text}`} />
              </div>
              <div className="flex flex-col">
                <span>{department.name} Goals</span>
                <span className="text-[10px] text-text-muted font-normal">
                  {goals.length} goal{goals.length === 1 ? "" : "s"} · {activeCount} active · {completedCount} done · {unassignedCount} unassigned
                </span>
              </div>
            </div>

          </div>
        </ModalTitle>
        <ModalClose />
      </ModalHeader>
      <ModalContent>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="p-3 rounded-xl bg-surface border border-border/50 text-center">
              <p className="text-lg font-bold text-primary">{goals.length}</p>
              <p className="text-[10px] text-text-muted">Total Goals</p>
            </div>
            <div className="p-3 rounded-xl bg-surface border border-border/50 text-center">
              <p className="text-lg font-bold text-emerald-400">{completedTasks}/{totalTasks}</p>
              <p className="text-[10px] text-text-muted">Tasks Done</p>
            </div>
            <div className="p-3 rounded-xl bg-surface border border-border/50 text-center">
              <p className={`text-lg font-bold ${
                aggregateProgress >= 100 ? "text-emerald-400" :
                aggregateProgress >= 50 ? "text-primary" : "text-yellow-400"
              }`}>{aggregateProgress}%</p>
              <p className="text-[10px] text-text-muted">Progress</p>
            </div>
          </div>

          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${department.name} goals...`}
            icon={<Search className="w-3.5 h-3.5" />}
            className="text-xs h-9"
          />

          <DepartmentDrillView
            goals={filtered}
            members={members}
            tasks={tasks}
            orgId={orgId}
            savingKey={savingKey}
            onOpenGoal={onSelectGoal}
            onAssign={handleAssign}
            departmentName={department.name}
          />
        </div>
      </ModalContent>
      <ModalFooter>
        <div className="relative flex items-center gap-2 ml-auto">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={() => setShowMenu(!showMenu)} className="flex items-center gap-1 cursor-pointer">
            <Plus className="w-4 h-4" /> Add
          </Button>
          {showMenu && (
            <div
              ref={menuRef}
              className="absolute bottom-full right-0 mb-1 w-36 rounded-lg bg-surface border border-border/50 shadow-lg overflow-hidden z-50"
            >
              <button
                onClick={() => { setShowMenu(false); onAddGoal?.(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-primary/10 transition-colors cursor-pointer"
              >
                <Flag className="w-4 h-4 text-primary" />
                Goal
              </button>
              <button
                onClick={() => { setShowMenu(false); onAddTask?.(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-primary/10 transition-colors cursor-pointer border-t border-border/50"
              >
                <CheckCircle className="w-4 h-4 text-primary" />
                Task
              </button>
            </div>
          )}
        </div>
      </ModalFooter>
    </Modal>
  );
}

function DepartmentDrillView({
  goals,
  members,
  tasks: _tasks,
  orgId,
  savingKey,
  onOpenGoal,
  onAssign,
  departmentName,
}: {
  goals: any[];
  members: any[];
  tasks: any[];
  orgId: string | undefined;
  savingKey: string | null;
  onOpenGoal: (goal: any) => void;
  onAssign: (goal: any, role: "defaulter" | "reviewer", member: { id: string; full_name: string; email: string } | null) => Promise<void> | void;
  departmentName: string;
}) {
  const [level, setLevel] = useState<"goals" | "subgoals" | "tasks">("goals");
  const [parentGoal, setParentGoal] = useState<any>(null);
  const [subGoal, setSubGoal] = useState<any>(null);
  const [suggestedSubgoals, setSuggestedSubgoals] = useState<any[]>([]);
  const [loadingSubgoals, setLoadingSubgoals] = useState(false);
  const [suggestedTasks, setSuggestedTasks] = useState<any[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [taskSearch, setTaskSearch] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<Set<number>>(new Set());
  const [selectedTaskSuggestionIds, setSelectedTaskSuggestionIds] = useState<Set<number>>(new Set());
  const [addingSubgoals, setAddingSubgoals] = useState(false);
  const [addingTasks, setAddingTasks] = useState(false);
  const { updateTask, createTask, deleteTask, fetchTasks } = useTaskStore();
  const { createGoal, deleteGoal, fetchGoals } = useGoalStore();
  const [goalTaskCache, setGoalTaskCache] = useState<Record<string, any[]>>({});
  const [subgoalOptimistic, setSubgoalOptimistic] = useState<Record<string, Record<string, any>>>({});

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
      case "in_progress": return "text-primary bg-primary/10 border-primary/20";
      default: return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
    }
  };

  const pick = (val: any) => (Array.isArray(val) && val.length > 0 ? val[0] : (Array.isArray(val) ? undefined : val));

  const parentGoals = useMemo(() => {
    const childIds = new Set(goals.filter((g) => g.parent_goal_id).map((g) => g.parent_goal_id));
    return goals.filter((g) => g.goal_type === "long_term" || childIds.has(g.id || g._id) || (!g.parent_goal_id && g.goal_type !== "short_term"));
  }, [goals]);

  const childGoalsByParent = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const g of goals) {
      const pid = g.parent_goal_id;
      if (pid) {
        const arr = map.get(pid) || [];
        arr.push(g);
        map.set(pid, arr);
      }
    }
    return map;
  }, [goals]);

  const orphanGoals = useMemo(() => {
    const parentIds = new Set(parentGoals.map((g) => g.id || g._id));
    return goals.filter((g) => !g.parent_goal_id && !parentIds.has(g.id || g._id));
  }, [goals, parentGoals]);

  const loadGoalTasks = async (gid: string) => {
    if (goalTaskCache[gid]) return;
    try {
      const res = await fetch(`${API_URL}/tasks?goal_id=${gid}&organization_id=${orgId}`, {
        headers: { ...getAuthHeaders() },
      });
      if (res.ok) {
        const data = await res.json();
        const norm = (v: any) => Array.isArray(v) ? v : (v ? [v] : []);
        setGoalTaskCache((prev) => ({ ...prev, [gid]: (data.tasks || []).map((t: any) => ({ ...t, id: t._id || t.id, assignee_id: norm(t.assignee_id), assignee_name: norm(t.assignee_name) })) }));
      }
    } catch {}
  };

  const suggestSubgoals = async () => {
    if (!parentGoal || !orgId) return;
    setLoadingSubgoals(true);
    setSuggestedSubgoals([]);
    setSelectedSuggestionIds(new Set());
    try {
      const res = await fetch(`${API_URL}/goals/${parentGoal.id || parentGoal._id}/suggest-children`, {
        method: "POST",
        headers: { ...getAuthHeaders() },
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestedSubgoals(data.suggestions || []);
      }
    } catch {} finally {
      setLoadingSubgoals(false);
    }
  };

  const suggestTasks = async () => {
    if (!subGoal) return;
    setLoadingTasks(true);
    setSuggestedTasks([]);
    setSelectedTaskSuggestionIds(new Set());
    try {
      const res = await fetch(`${API_URL}/goals/suggest-breakdown`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          title: subGoal.title,
          description: subGoal.description || "",
          industry: subGoal.industry || "",
          micro_vertical: subGoal.micro_vertical || "",
          goal_type: subGoal.goal_type || "short_term",
          department: subGoal.department || departmentName,
          organization_id: orgId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestedTasks(data.tasks || []);
      }
    } catch {} finally {
      setLoadingTasks(false);
    }
  };

  const addSelectedSubgoals = async () => {
    if (!parentGoal || !orgId) return;
    setAddingSubgoals(true);
    const items = suggestedSubgoals.filter((_, i) => selectedSuggestionIds.has(i));
    const results = await Promise.allSettled(
      items.map((s) =>
        createGoal({
          title: s.title,
          description: s.description || s.title,
          priority: s.priority || "medium",
          department: s.department || parentGoal.department || departmentName,
          organization_id: orgId,
          goal_type: "short_term",
          duration: "one_time",
          parent_goal_id: parentGoal.id || parentGoal._id,
          industry: parentGoal.industry || "",
          micro_vertical: parentGoal.micro_vertical || "",
        } as any)
      )
    );
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      console.warn("[addSelectedSubgoals] failed to create", failed.length, "sub-goals");
    }
    setSuggestedSubgoals([]);
    setSelectedSuggestionIds(new Set());
    setAddingSubgoals(false);
  };

  const addSelectedTasks = async () => {
    if (!subGoal || !orgId) return;
    setAddingTasks(true);
    const items = suggestedTasks.filter((_, i) => selectedTaskSuggestionIds.has(i));
    const gid = subGoal.id || subGoal._id;
    const results = await Promise.allSettled(
      items.map((s) =>
        createTask({
          title: s.title,
          description: s.description || "",
          priority: s.priority || "medium",
          goal_id: gid,
          organization_id: orgId,
        } as any)
      )
    );
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      console.warn("[addSelectedTasks] failed to create", failed.length, "tasks");
    }
    // Clear cache so tasks appear immediately via store prop
    setGoalTaskCache((prev) => {
      const next = { ...prev };
      delete next[gid];
      return next;
    });
    loadGoalTasks(gid); // background refresh
    setSuggestedTasks([]);
    setSelectedTaskSuggestionIds(new Set());
    setAddingTasks(false);
  };

  const handleCreateTask = async () => {
    if (!newTaskTitle.trim() || !subGoal || !orgId) return;
    const gid = subGoal.id || subGoal._id;
    try {
      await createTask({ title: newTaskTitle.trim(), goal_id: gid, organization_id: orgId } as any);
      setNewTaskTitle("");
      setShowCreateForm(false);
      setGoalTaskCache((prev) => {
        const next = { ...prev };
        delete next[gid];
        return next;
      });
      await loadGoalTasks(gid);
    } catch {}
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteTask(taskId);
      if (subGoal) {
        const gid = subGoal.id || subGoal._id;
        setGoalTaskCache((prev) => ({ ...prev, [gid]: (prev[gid] || []).filter((t: any) => t.id !== taskId) }));
      }
    } catch {}
  };

  const currentTasks = subGoal ? goalTaskCache[subGoal.id || subGoal._id] || _tasks.filter((t: any) => t.goal_id === (subGoal.id || subGoal._id)) : [];

  const filteredTasks = useMemo(() => {
    const q = taskSearch.trim().toLowerCase();
    if (!q) return currentTasks;
    return currentTasks.filter((t: any) => (t.title || "").toLowerCase().includes(q));
  }, [currentTasks, taskSearch]);

  const renderProgressBar = (pct: number) => (
    <div className="flex items-center gap-1 w-16 flex-shrink-0">
      <div className="flex-1 h-1.5 bg-background rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${pct >= 100 ? "bg-emerald-400" : pct >= 50 ? "bg-primary" : pct > 0 ? "bg-yellow-400" : "bg-gray-500/30"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-[10px] text-text-muted w-7 text-right font-medium">{pct}%</span>
    </div>
  );

  const renderPersonPickers = (goal: any) => {
    const gid = goal.id || goal._id;
    const ov = subgoalOptimistic[gid];
    const handleAssignLocal = async (g: any, role: "defaulter" | "reviewer", member: { id: string; full_name: string; email: string } | null) => {
      const ggid = g.id || g._id;
      if (role === "defaulter") {
        setSubgoalOptimistic((prev) => ({ ...prev, [ggid]: { ...prev[ggid], assignee_id: member?.id ? [member.id] : [], assignee_name: member?.full_name || "" } }));
      } else {
        setSubgoalOptimistic((prev) => ({ ...prev, [ggid]: { ...prev[ggid], reviewer_id: member?.id ? [member.id] : [], reviewer_name: member?.full_name || "" } }));
      }
      try {
        await onAssign(g, role, member);
      } catch {
        setSubgoalOptimistic((prev) => { const n = { ...prev }; delete n[ggid]; return n; });
      }
    };
    return (
      <div className="flex items-center gap-2">
        <InlinePersonPicker type="defaulter" value={{ id: pick(ov?.assignee_id ?? goal.assignee_id), name: pick(ov?.assignee_name ?? goal.assignee_name) }} members={members} saving={savingKey === `${gid}:defaulter`} onChange={(m) => handleAssignLocal(goal, "defaulter", m)} />
        <InlinePersonPicker type="reviewer" value={{ id: pick(ov?.reviewer_id ?? goal.reviewer_id), name: pick(ov?.reviewer_name ?? goal.reviewer_name) }} members={members} saving={savingKey === `${gid}:reviewer`} onChange={(m) => handleAssignLocal(goal, "reviewer", m)} />
      </div>
    );
  };

  // ─── Level 1: Goals (Long-term goals list) ───
  const renderGoalsList = () => (
    <div className="space-y-2 max-h-[55vh] overflow-y-auto custom-scrollbar pr-1">
      {parentGoals.length === 0 && orphanGoals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Target className="w-8 h-8 text-text-muted/40 mb-2" />
          <p className="text-sm text-text-muted">No goals</p>
        </div>
      ) : (
        <>
          {parentGoals.length > 0 && <p className="text-[11px] font-medium text-text-muted mb-1 flex items-center gap-1"><Flag className="w-3.5 h-3.5 text-primary" /> Long-term Goals ({parentGoals.length})</p>}
          {parentGoals.map((goal) => {
            const gid = goal.id || goal._id;
            const t = goal.task_counts || {};
            const pct = t.total > 0 ? Math.round((t.completed / t.total) * 100) : goal.progress || 0;
            return (
              <div key={gid} className="border border-primary/20 rounded-xl bg-gradient-to-br from-primary/5 to-purple-500/5 overflow-hidden">
                <div onClick={() => { setParentGoal(goal); setLevel("subgoals"); }} className="flex items-center gap-3 p-3 hover:bg-primary/5 transition-colors cursor-pointer" role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setParentGoal(goal); setLevel("subgoals"); } }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 bg-primary/10">
                    <Flag className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold truncate">{goal.title}</span>
                    <div className="flex items-center gap-2 text-[10px] text-text-muted mt-0.5">
                      {(childGoalsByParent.get(gid)?.length || 0) > 0 && <span>{childGoalsByParent.get(gid)?.length} sub-goals</span>}
                      {t.total > 0 && <span>{t.completed}/{t.total} tasks</span>}
                    </div>
                  </div>
                  {renderProgressBar(pct)}
                  <ChevronRight className="w-4 h-4 text-primary flex-shrink-0" />
                </div>
              </div>
            );
          })}
          {orphanGoals.length > 0 && (
            <div className="pt-1">
              <p className="text-[10px] font-medium text-text-muted mb-1 flex items-center gap-1"><Flag className="w-3 h-3" /> Standalone ({orphanGoals.length})</p>
              {orphanGoals.map((goal) => (
                <div key={goal.id || goal._id} className="border border-primary/20 rounded-xl bg-gradient-to-br from-primary/5 to-purple-500/5 overflow-hidden">
                  <div onClick={() => onOpenGoal(goal)} className="flex items-center gap-3 p-3 hover:bg-primary/5 transition-colors cursor-pointer" role="button" tabIndex={0}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-primary/10"><Flag className="w-3.5 h-3.5 text-primary" /></div>
                    <div className="flex-1 min-w-0"><span className="text-xs font-semibold truncate">{goal.title}</span></div>
                    <ChevronRight className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );

  // ─── Level 2: Sub-goals of a parent ───
  const renderSubgoalsView = () => {
    if (!parentGoal) return null;
    const pid = parentGoal.id || parentGoal._id;
    const children = childGoalsByParent.get(pid) || [];
    return (
      <div className="space-y-3 max-h-[55vh] overflow-y-auto custom-scrollbar pr-1">
        <button onClick={() => { setLevel("goals"); setParentGoal(null); setSuggestedSubgoals([]); }} className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors cursor-pointer mb-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to goals
        </button>
        <div className="flex items-center gap-2 p-3 rounded-xl bg-gradient-to-br from-primary/5 to-purple-500/5 border border-primary/20">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-primary/10"><Flag className="w-4 h-4 text-primary" /></div>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold">{parentGoal.title}</span>
            <span className="text-[10px] text-text-muted ml-1">{children.length} sub-goal{children.length !== 1 ? "s" : ""}</span>
          </div>
        </div>

        {/* Suggest sub-goals */}
        <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold flex items-center gap-1"><GitBranch className="w-3 h-3 text-primary" /> Suggested Sub-goals</span>
            <button onClick={suggestSubgoals} disabled={loadingSubgoals} className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1">
              {loadingSubgoals ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {loadingSubgoals ? "Loading..." : "Generate"}
            </button>
          </div>
          {suggestedSubgoals.length === 0 ? (
            <p className="text-[9px] text-text-muted">Generate AI-suggested sub-goals for this goal.</p>
          ) : (
            <div className="space-y-1.5 mt-1.5">
              {suggestedSubgoals.map((s: any, i: number) => {
                const isSelected = selectedSuggestionIds.has(i);
                return (
                  <div key={i} className={`p-2 rounded-lg border ${isSelected ? "bg-emerald-500/10 border-emerald-500/30" : "bg-surface border-border/50"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium">{s.title}</span>
                        <p className="text-[10px] text-text-muted mt-0.5">{s.description}</p>
                        <div className="flex items-center gap-2 mt-1 text-[9px] text-text-muted">
                          {s.department && <span>{s.department}</span>}
                          {s.suggested_timeline && <span><Calendar className="w-2.5 h-2.5 inline mr-0.5" />{s.suggested_timeline}</span>}
                          {s.priority && <span className={`px-1 py-0.5 rounded text-[8px] font-medium ${s.priority === "high" ? "text-orange-400 bg-orange-500/10" : s.priority === "medium" ? "text-yellow-400 bg-yellow-500/10" : "text-gray-400 bg-gray-500/10"}`}>{s.priority}</span>}
                        </div>
                      </div>
                      <div
                        onClick={(e) => { e.stopPropagation(); setSelectedSuggestionIds((prev) => { const next = new Set(prev); next.has(i) ? next.delete(i) : next.add(i); return next; }); }}
                        className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer flex-shrink-0 mt-0.5 ${isSelected ? "bg-primary border-primary" : "bg-background border-border"}`}
                        role="button"
                        tabIndex={0}
                      >
                        {isSelected && <CheckCircle className="w-3 h-3 text-white" />}
                      </div>
                    </div>
                  </div>
                );
              })}
              {selectedSuggestionIds.size > 0 && (
                <button onClick={addSelectedSubgoals} disabled={addingSubgoals} className="w-full py-1.5 rounded-lg text-[10px] font-medium bg-primary text-white hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50">
                  {addingSubgoals ? <span className="flex items-center gap-1 justify-center"><Loader2 className="w-3 h-3 animate-spin" /> Adding...</span> : `Add ${selectedSuggestionIds.size} selected`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Existing sub-goals */}
        {children.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium text-text-muted flex items-center gap-1">{children.length} sub-goal{children.length !== 1 ? "s" : ""}</p>
            {children.map((child) => (
              <div key={child.id || child._id} className="border border-primary/20 rounded-xl bg-gradient-to-br from-primary/5 to-purple-500/5 overflow-hidden">
                <div onClick={() => { setSubGoal(child); setLevel("tasks"); loadGoalTasks(child.id || child._id); }} className="flex items-center gap-3 p-3 hover:bg-primary/5 transition-colors cursor-pointer" role="button" tabIndex={0}>
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${child.status === "completed" ? "bg-emerald-500/10" : "bg-primary/10"}`}>
                    {child.status === "completed" ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Clock className="w-3.5 h-3.5 text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-semibold truncate">{child.title}</span>
                    <div className="flex items-center gap-1.5 text-[9px] text-text-muted mt-0.5">
                      {(child.task_counts?.total || 0) > 0 && <span>{child.task_counts.completed}/{child.task_counts.total} tasks</span>}
                      {child.priority && <span className={`px-1 py-0.5 rounded text-[8px] font-medium ${child.priority === "urgent" ? "text-rose-400 bg-rose-500/10" : child.priority === "high" ? "text-orange-400 bg-orange-500/10" : child.priority === "medium" ? "text-yellow-400 bg-yellow-500/10" : "text-gray-400 bg-gray-500/10"}`}>{child.priority}</span>}
                    </div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                </div>
                <div onClick={(e) => e.stopPropagation()} className="px-3 pb-2 flex items-center gap-1.5 flex-wrap">
                  {renderPersonPickers(child)}
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteGoal(child.id || child._id); }}
                    className="p-1 rounded text-text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer flex-shrink-0 ml-auto"
                    title="Delete sub-goal"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : suggestedSubgoals.length === 0 ? (
          <p className="text-[10px] text-text-muted text-center py-3">No sub-goals yet. Use the Generate button above to create AI-suggested sub-goals.</p>
        ) : null}
      </div>
    );
  };

  // ─── Level 3: Tasks of a sub-goal ───
  const renderTasksView = () => {
    if (!subGoal) return null;
    const gid = subGoal.id || subGoal._id;
    return (
      <div className="space-y-3 max-h-[55vh] overflow-y-auto custom-scrollbar pr-1">
        <button onClick={() => { setLevel("subgoals"); setSubGoal(null); setSuggestedTasks([]); setTaskSearch(""); setShowCreateForm(false); }} className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors cursor-pointer mb-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to sub-goals
        </button>
        <div className="flex items-center gap-2 p-3 rounded-xl bg-gradient-to-br from-primary/5 to-purple-500/5 border border-primary/20">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${subGoal.status === "completed" ? "bg-emerald-500/10" : "bg-primary/10"}`}>
            {subGoal.status === "completed" ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Flag className="w-3.5 h-3.5 text-primary" />}
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold">{subGoal.title}</span>
            <span className="text-[10px] text-text-muted ml-1">{currentTasks.length} task{currentTasks.length !== 1 ? "s" : ""}</span>
          </div>
          {renderPersonPickers(subGoal)}
        </div>

        {/* Search + Create */}
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input value={taskSearch} onChange={(e) => setTaskSearch(e.target.value)} placeholder="Search tasks..." className="w-full h-8 pl-8 pr-3 text-xs bg-background border border-border rounded-lg focus:outline-none focus:border-primary" />
          </div>
          <button onClick={() => setShowCreateForm((v) => !v)} className="px-3 h-8 rounded-lg text-xs font-medium bg-primary text-white hover:bg-primary/90 transition-colors cursor-pointer flex items-center gap-1 flex-shrink-0">
            <Plus className="w-3.5 h-3.5" /> Create
          </button>
        </div>

        {/* Suggest tasks */}
        <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold flex items-center gap-1"><Sparkles className="w-3 h-3 text-primary" /> AI Task Suggestions</span>
            <button onClick={suggestTasks} disabled={loadingTasks} className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1">
              {loadingTasks ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {loadingTasks ? "Loading..." : "Suggest"}
            </button>
          </div>
          {suggestedTasks.length > 0 && (
            <div className="space-y-1.5 mt-1.5">
              {suggestedTasks.map((s: any, i: number) => {
                const isSelected = selectedTaskSuggestionIds.has(i);
                return (
                  <div key={i} className={`p-2 rounded-lg border ${isSelected ? "bg-emerald-500/10 border-emerald-500/30" : "bg-surface border-border/50"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium">{s.title}</span>
                        <p className="text-[10px] text-text-muted mt-0.5">{s.description}</p>
                        {s.assignee_hint && <span className="text-[9px] text-text-muted mt-0.5 block"><User className="w-2.5 h-2.5 inline mr-0.5" />{s.assignee_hint}</span>}
                      </div>
                      <div
                        onClick={(e) => { e.stopPropagation(); setSelectedTaskSuggestionIds((prev) => { const next = new Set(prev); next.has(i) ? next.delete(i) : next.add(i); return next; }); }}
                        className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer flex-shrink-0 mt-0.5 ${isSelected ? "bg-primary border-primary" : "bg-background border-border"}`}
                        role="button"
                        tabIndex={0}
                      >
                        {isSelected && <CheckCircle className="w-3 h-3 text-white" />}
                      </div>
                    </div>
                  </div>
                );
              })}
              {selectedTaskSuggestionIds.size > 0 && (
                <button onClick={addSelectedTasks} disabled={addingTasks} className="w-full py-1.5 rounded-lg text-[10px] font-medium bg-primary text-white hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50">
                  {addingTasks ? <span className="flex items-center gap-1 justify-center"><Loader2 className="w-3 h-3 animate-spin" /> Adding...</span> : `Add ${selectedTaskSuggestionIds.size} selected`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Manual create form */}
        {showCreateForm && (
          <div className="p-3 rounded-xl bg-surface border border-primary/20">
            <p className="text-[10px] font-semibold mb-2">Create Task</p>
            <div className="flex gap-2">
              <input value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleCreateTask(); }} placeholder="Task title..." className="flex-1 h-8 px-3 text-xs bg-background border border-border rounded-lg focus:outline-none focus:border-primary" autoFocus />
              <button onClick={handleCreateTask} disabled={!newTaskTitle.trim()} className="px-3 h-8 rounded-lg text-xs font-medium bg-primary text-white hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
          </div>
        )}

        {/* Tasks list */}
        <div className="space-y-1.5">
          {filteredTasks.length === 0 ? (
            <p className="text-[10px] text-text-muted text-center py-3">{taskSearch ? "No matching tasks" : "No tasks yet. Create one or use AI suggestions above."}</p>
          ) : (
            filteredTasks.map((task: any) => (
              <div key={task.id} className="flex items-center gap-2 p-2 rounded-lg bg-surface border border-border/50 group">
                <div className="flex-1 min-w-0">
                  <TaskRow
                    task={task}
                    members={members}
                    department={subGoal.department}
                    onAssigneeChange={(member) => {
                      const tid = task.id;
                      updateTask(tid, { assignee_id: member?.id ? [member.id] : [], assignee_name: member?.full_name || "" } as any).catch(() => {});
                      setGoalTaskCache((prev) => ({ ...prev, [gid]: (prev[gid] || _tasks.filter((t: any) => t.goal_id === gid)).map((t: any) => t.id === tid ? { ...t, assignee_id: member?.id ? [member.id] : [], assignee_name: member?.full_name || "" } : t) }));
                    }}
                    onStatusChange={(status) => {
                      const tid = task.id;
                      updateTask(tid, { status } as any).catch(() => {});
                      setGoalTaskCache((prev) => ({ ...prev, [gid]: (prev[gid] || _tasks.filter((t: any) => t.goal_id === gid)).map((t: any) => t.id === tid ? { ...t, status } : t) }));
                    }}
                    getStatusColor={getStatusColor}
                  />
                </div>
                <button onClick={() => handleDeleteTask(task.id)} className="p-1 rounded text-text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer flex-shrink-0" title="Delete task">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  if (level === "tasks" && subGoal) return renderTasksView();
  if (level === "subgoals" && parentGoal) return renderSubgoalsView();
  return renderGoalsList();
}

function GoalSection() {
  const { organization } = useOrganizationStore();
  const { goals, fetchGoals, updateGoal } = useGoalStore();
  const orgId = organization?.id;
  const [expandedGoal, setExpandedGoal] = useState<any>(null);
  const [openDepartment, setOpenDepartment] = useState<string | null>(null);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [returnDepartment, setReturnDepartment] = useState<string | null>(null);

  const handleAddGoal = useCallback(() => {
    setReturnDepartment(openDepartment);
    setOpenDepartment(null);
    setShowGoalModal(true);
  }, [openDepartment]);

  const handleAddTask = useCallback(() => {
    setReturnDepartment(openDepartment);
    setOpenDepartment(null);
    setShowTaskModal(true);
  }, [openDepartment]);

  const handleGoalModalClose = useCallback(() => {
    setShowGoalModal(false);
    if (returnDepartment) {
      setOpenDepartment(returnDepartment);
      setReturnDepartment(null);
    }
  }, [returnDepartment]);

  const handleTaskModalClose = useCallback(() => {
    setShowTaskModal(false);
    if (returnDepartment) {
      setOpenDepartment(returnDepartment);
      setReturnDepartment(null);
    }
  }, [returnDepartment]);

  const handleGoalBack = useCallback(() => {
    setShowGoalModal(false);
    if (returnDepartment) {
      setOpenDepartment(returnDepartment);
      setReturnDepartment(null);
    }
  }, [returnDepartment]);

  const handleTaskBack = useCallback(() => {
    setShowTaskModal(false);
    if (returnDepartment) {
      setOpenDepartment(returnDepartment);
      setReturnDepartment(null);
    }
  }, [returnDepartment]);

  useEffect(() => {
    if (orgId) fetchGoals(orgId);
  }, [orgId, fetchGoals]);

  const departments = useMemo(() => {
    const map = new Map<string, { name: string; goals: any[] }>();
    for (const g of goals) {
      const raw = (g.department || "Unassigned").trim() || "Unassigned";
      const key = raw.toLowerCase();
      if (!map.has(key)) map.set(key, { name: raw, goals: [] });
      map.get(key)!.goals.push(g);
    }
    return Array.from(map.values()).sort((a, b) => b.goals.length - a.goals.length);
  }, [goals]);

  const totalActive = goals.filter((g) => g.status === "active").length;
  const totalCompleted = goals.filter((g) => g.status === "completed").length;
  const totalTasks = goals.reduce((acc, g) => acc + (g.task_counts?.total || 0), 0);
  const totalDone = goals.reduce((acc, g) => acc + (g.task_counts?.completed || 0), 0);
  const overallProgress = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;

  const openDepartmentGoals = openDepartment
    ? goals.filter((g) => (g.department || "Unassigned") === openDepartment)
    : [];

  if (goals.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Flag className="w-5 h-5 text-primary" />
            <CardTitle>Goals Pipeline</CardTitle>
          </div>
          <CardDescription>Track your business goals and pipeline by department</CardDescription>
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
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <span className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-primary text-white">Department</span>
              <Badge variant="outline" className="text-xs">{goals.length} total</Badge>
              <Badge variant="outline" className="text-xs">{totalActive} active</Badge>
              <Badge variant="outline" className="text-xs">{totalCompleted} done</Badge>
            </div>
          </div>
          <CardDescription>
            Goals grouped by department. Click a department to view its goals, then click any goal to manage its task pipeline, assignees and refinement chat.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 p-3 rounded-xl bg-gradient-to-br from-primary/5 to-purple-500/5 border border-primary/20">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">Pipeline Progress</span>
                <span className="text-[10px] text-text-muted">
                  {totalDone} / {totalTasks} tasks
                </span>
              </div>
              <span className={`text-sm font-bold ${
                overallProgress >= 100 ? "text-emerald-400" :
                overallProgress >= 50 ? "text-primary" : "text-yellow-400"
              }`}>
                {overallProgress}%
              </span>
            </div>
            <div className="h-2 bg-surface rounded-full overflow-hidden border border-border/50">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  overallProgress >= 100 ? "bg-emerald-400" :
                  overallProgress >= 50 ? "bg-primary" : "bg-yellow-400"
                }`}
                style={{ width: `${Math.min(overallProgress, 100)}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {departments.map((dept) => {
                const style = getDepartmentStyle(dept.name);
                const DeptIcon = style.icon;
                const activeCount = dept.goals.filter((g) => g.status === "active").length;
                const completedCount = dept.goals.filter((g) => g.status === "completed").length;
                const dTasks = dept.goals.reduce((acc, g) => acc + (g.task_counts?.total || 0), 0);
                const dDone = dept.goals.reduce((acc, g) => acc + (g.task_counts?.completed || 0), 0);
                const dProgress = dTasks > 0 ? Math.round((dDone / dTasks) * 100) : 0;
                const topGoals = [...dept.goals]
                  .sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0))
                  .slice(0, 3);

                return (
                  <button
                    key={dept.name}
                    onClick={() => setOpenDepartment(dept.name)}
                    className={`group text-left p-4 rounded-2xl bg-gradient-to-br ${style.bg} ${style.border} border hover:shadow-lg hover:scale-[1.01] transition-all cursor-pointer`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-9 h-9 rounded-xl bg-background/60 border ${style.border} flex items-center justify-center`}>
                          <DeptIcon className={`w-4 h-4 ${style.text}`} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold capitalize leading-none">{dept.name}</p>
                          <p className="text-[10px] text-text-muted mt-1">
                            {dept.goals.length} goal{dept.goals.length === 1 ? "" : "s"}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className={`w-4 h-4 ${style.text} opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all`} />
                    </div>

                    <div className="flex items-center gap-2 mb-2 text-[10px]">
                      {activeCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                          {activeCount} active
                        </span>
                      )}
                      {completedCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {completedCount} done
                        </span>
                      )}
                    </div>

                    <div className="space-y-1 mb-2">
                      {topGoals.map((g) => (
                        <div key={g.id || g._id} className="flex items-center gap-1.5 text-[11px] truncate">
                          {g.status === "completed" ? (
                            <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                          ) : g.status === "active" ? (
                            <Clock className="w-3 h-3 text-primary flex-shrink-0" />
                          ) : (
                            <AlertCircle className="w-3 h-3 text-yellow-400 flex-shrink-0" />
                          )}
                          <span className="truncate text-text-muted">{g.title}</span>
                        </div>
                      ))}
                      {dept.goals.length > topGoals.length && (
                        <p className="text-[10px] text-text-muted/60">+{dept.goals.length - topGoals.length} more</p>
                      )}
                    </div>

                    {dTasks > 0 && (
                      <div>
                        <div className="flex items-center justify-between text-[10px] text-text-muted mb-1">
                          <span>{dDone}/{dTasks} tasks</span>
                          <span className={dProgress >= 100 ? "text-emerald-400" : dProgress >= 50 ? "text-primary" : "text-yellow-400"}>
                            {dProgress}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-background/60 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              dProgress >= 100 ? "bg-emerald-400" :
                              dProgress >= 50 ? "bg-primary" : "bg-yellow-400"
                            }`}
                            style={{ width: `${Math.min(dProgress, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
        </CardContent>
      </Card>

      {openDepartment && (
        <DepartmentGoalsModal
          department={{ name: openDepartment }}
          goals={openDepartmentGoals}
          onClose={() => setOpenDepartment(null)}
          onSelectGoal={(g) => { setOpenDepartment(null); setExpandedGoal(g); }}
          onAddGoal={handleAddGoal}
          onAddTask={handleAddTask}
          onAssignGoal={async (g, role, member) => {
            const gid = g.id || g._id;
            const data = role === "defaulter"
              ? { assignee_id: member?.id ? [member.id] : [], assignee_name: member?.full_name || "" }
              : { reviewer_id: member?.id ? [member.id] : [], reviewer_name: member?.full_name || "" };
            try {
              await updateGoal(gid, data as any);
              console.warn("[assign] updateGoal OK", gid, role, member?.full_name);
            } catch (e) {
              console.error("[assign] updateGoal FAILED", gid, role, member?.full_name, e);
            }
          }}
        />
      )}

      {expandedGoal && (
        <ExpandedGoalPipeline
          goal={expandedGoal}
          onClose={() => setExpandedGoal(null)}
          orgId={orgId}
        />
      )}

      {showGoalModal && (
        <GoalModal isOpen={showGoalModal} onClose={handleGoalModalClose} onBack={handleGoalBack} />
      )}
      {showTaskModal && (
        <TaskModal isOpen={showTaskModal} onClose={handleTaskModalClose} onBack={handleTaskBack} />
      )}
    </>
  );
}

function HierarchyGoalCard({
  parentGoal,
  childGoals,
  onOpenGoal,
  onAssign,
}: {
  parentGoal: any;
  childGoals: any[];
  onOpenGoal: (goal: any) => void;
  onAssign: (goal: any, role: "defaulter" | "reviewer", member: { id: string; full_name: string; email: string } | null) => Promise<void> | void;
}) {
  const [expanded, setExpanded] = useState(true);
  const { members, fetchOrgMembers } = useOrgChartStore();
  const { organization } = useOrganizationStore();
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (organization?.id) fetchOrgMembers(organization.id);
  }, [organization?.id, fetchOrgMembers]);

  const parentProgress = parentGoal.progress ?? 0;
  const parentTasks = parentGoal.task_counts ?? { total: 0, completed: 0, in_progress: 0, pending: 0 };

  const handleAssign = async (goal: any, role: "defaulter" | "reviewer", member: { id: string; full_name: string; email: string } | null) => {
    const key = `${goal.id || goal._id}:${role}`;
    setSavingKey(key);
    try {
      await onAssign(goal, role, member);
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-purple-500/5 overflow-hidden">
      {/* Parent (LT) goal header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3.5 hover:bg-primary/5 transition-colors cursor-pointer text-left"
      >
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
          parentGoal.status === "completed" ? "bg-emerald-500/10" : "bg-primary/10"
        }`}>
          {parentGoal.status === "completed" ? (
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          ) : (
            <Flag className="w-4 h-4 text-primary" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold truncate">{parentGoal.title}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 flex-shrink-0">
              Long Term
            </span>
            {parentGoal.status === "completed" && (
              <Badge variant="success" className="text-[10px]">Done</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-text-muted mt-0.5">
            <span>{parentGoal.department || "No department"}</span>
            {parentTasks.total > 0 && (
              <span>&middot; {parentTasks.completed}/{parentTasks.total} tasks</span>
            )}
            <span>&middot; {childGoals.length} sub-goal{childGoals.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-16">
            <div className="flex items-center gap-1">
              <div className="flex-1 h-1.5 bg-background rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    parentProgress >= 100 ? "bg-emerald-400" :
                    parentProgress >= 50 ? "bg-primary" :
                    parentProgress > 0 ? "bg-yellow-400" : "bg-gray-500/30"
                  }`}
                  style={{ width: `${Math.min(parentProgress, 100)}%` }}
                />
              </div>
              <span className="text-[10px] text-text-muted w-7 text-right">{parentProgress}%</span>
            </div>
          </div>
          {expanded ? <ChevronDown className="w-4 h-4 text-text-muted" /> : <ChevronRight className="w-4 h-4 text-text-muted" />}
        </div>
      </button>

      {/* Child goals */}
      {expanded && childGoals.length > 0 && (
        <div className="border-t border-primary/10">
          <div className="py-1.5 px-2">
            {childGoals.map((child) => {
              const childProgress = child.progress ?? 0;
              const childTasks = child.task_counts ?? { total: 0, completed: 0, in_progress: 0, pending: 0 };
              return (
                <div
                  key={child.id}
                  className="flex items-center gap-2 p-2 rounded-xl hover:bg-surface/80 transition-colors group cursor-pointer"
                  onClick={() => onOpenGoal(child)}
                >
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 bg-yellow-500/10">
                    <Target className="w-3 h-3 text-yellow-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{child.title}</p>
                    <p className="text-[10px] text-text-muted">
                      {child.department || "No dept"} &middot; {childTasks.completed}/{childTasks.total} tasks
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <InlinePersonPicker
                      type="defaulter"
                      value={{ id: child.assignee_id?.[0], name: child.assignee_name?.[0] }}
                      members={members}
                      saving={savingKey === `${child.id || child._id}:defaulter`}
                      onChange={(m) => handleAssign(child, "defaulter", m)}
                    />
                  </div>
                  <div className="w-14 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <div className="flex-1 h-1 bg-background rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            childProgress >= 100 ? "bg-emerald-400" :
                            childProgress >= 50 ? "bg-primary" :
                            childProgress > 0 ? "bg-yellow-400" : "bg-gray-500/30"
                          }`}
                          style={{ width: `${Math.min(childProgress, 100)}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-text-muted w-5 text-right">{childProgress}%</span>
                    </div>
                  </div>
                  <ChevronRight className="w-3 h-3 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state for LT goal without children */}
      {expanded && childGoals.length === 0 && (
        <div className="border-t border-primary/10 px-4 py-3 text-center">
          <p className="text-[11px] text-text-muted">No short-term goals linked yet</p>
          <p className="text-[10px] text-text-muted/60 mt-0.5">Create a short-term goal and set this as its parent</p>
        </div>
      )}
    </div>
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
    const diff = Date.now() - new Date(dateStr.endsWith("Z") || dateStr.endsWith("+00:00") ? dateStr : dateStr + "Z").getTime();
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
          Growth-driving market trends for {organization?.industry || "your industry"}
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
                  {article.growth_impact && (
                    <div className="mt-1.5">
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                        <TrendingUp className="w-2.5 h-2.5" />
                        Growth driver: {article.growth_impact}
                      </span>
                    </div>
                  )}
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

  const fetchRisk = useCallback(() => {
    if (!organization?.id) return;
    setLoading(true);
    fetch(`${API_URL}/dashboard/kpi?organization_id=${organization.id}`)
      .then((r) => r.json())
      .then((data) => {
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
        setRisks([]); setLoading(false);
      });
  }, [organization?.id]);

  useEffect(() => {
    fetchRisk();
  }, [fetchRisk]);

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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <CardTitle>Business Risk Radar</CardTitle>
          </div>
          <button
            onClick={fetchRisk}
            disabled={loading}
            className="p-1.5 rounded-lg hover:bg-surface-light text-text-muted hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh risk analysis"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
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

export default function DashboardView({ onCreateGoal }: { onCreateGoal?: () => void } = {}) {
  const { user } = useAuth();
  const router = useRouter();
  const { organization } = useOrganizationStore();
  const { goals, fetchGoals } = useGoalStore();
  const { members } = useOrgChartStore();
  const { adaptation, getAISummary } = useAIDashboardAdaptation();
  const [aiSummary, setAiSummary] = useState("");
  const orgId = organization?.id;

  const progressSignature = useMemo(
    () => goals.map((g) => `${g.id}:${g.progress ?? 0}:${g.status}`).join("|"),
    [goals]
  );
  const prevSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (!orgId) return;
    if (prevSignatureRef.current === null) {
      prevSignatureRef.current = progressSignature;
      return;
    }
    if (prevSignatureRef.current !== progressSignature && goals.length > 0) {
      prevSignatureRef.current = progressSignature;
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("kpi-goal-updated", {
            detail: { source: "goal", detail: "Goal progress changed" },
          })
        );
      }
    }
  }, [progressSignature, goals.length, orgId]);
  const [escalatedTasks, setEscalatedTasks] = useState<any[]>([]);
  const [escalationsLoading, setEscalationsLoading] = useState(false);

  const fetchEscalations = useCallback(async () => {
    if (!orgId) return;
    setEscalationsLoading(true);
    try {
      const res = await fetch(`${API_URL}/tasks?organization_id=${orgId}&overdue=true&escalation_level=2`);
      if (res.ok) {
        const data = await res.json();
        setEscalatedTasks(data.tasks || []);
      }
    } catch {} finally {
      setEscalationsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (orgId) fetchEscalations();
  }, [orgId, fetchEscalations]);

  const searchParams = useSearchParams();
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [meetingHistory, setMeetingHistory] = useState<any[]>([]);
  const [meetingHistoryLoading, setMeetingHistoryLoading] = useState(false);
  const [expandedTitles, setExpandedTitles] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (searchParams?.get("checkin") === "true" && orgId) {
      setShowCheckInModal(true);
    }
  }, [searchParams, orgId]);

  const fetchMeetingHistory = useCallback(async () => {
    if (!orgId) return;
    setMeetingHistoryLoading(true);
    try {
      const res = await fetch(`${API_URL}/meetings/history?organization_id=${orgId}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setMeetingHistory(data.meetings || []);
      }
    } catch {} finally {
      setMeetingHistoryLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (orgId) fetchMeetingHistory();
  }, [orgId, fetchMeetingHistory]);

  const handleDeleteMeeting = useCallback(async (meetingId: string) => {
    if (!orgId) return;
    try {
      const res = await fetch(`${API_URL}/meetings/${meetingId}?organization_id=${orgId}`, {
        method: "DELETE",
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setMeetingHistory((prev) => prev.filter((m: any) => m.id !== meetingId));
      }
    } catch (e) {
      console.error("Delete meeting error:", e);
    }
  }, [orgId]);

  const [dismissedSetupCards, setDismissedSetupCards] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem("yesboss_dismissed_setup_cards");
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(
        "yesboss_dismissed_setup_cards",
        JSON.stringify(Array.from(dismissedSetupCards))
      );
    } catch {}
  }, [dismissedSetupCards]);

  const setupGoalsCount = goals.filter((g) => g.status !== "cancelled").length;
  const memberCount = members.length;

  const setupCards: Array<{
    key: string;
    title: string;
    description: string;
    icon: React.ElementType;
    accent: string;
    isDone: boolean;
    onClick: () => void;
  }> = [
    {
      key: "goal",
      title: "Create your first goal",
      description: "Set up your first business objective to start tracking progress",
      icon: Target,
      accent: "from-primary/20 to-purple-500/20",
      isDone: setupGoalsCount > 0,
      onClick: () => onCreateGoal?.(),
    },
    {
      key: "org_chart",
      title: "Build your org chart",
      description: "Add members, roles, and departments to build your team",
      icon: Network,
      accent: "from-emerald-500/20 to-teal-500/20",
      isDone: memberCount > 0,
      onClick: () => router.push("/dashboard/orchestration"),
    },
  ];

  const visibleSetupCards = setupCards.filter(
    (c) => !c.isDone && !dismissedSetupCards.has(c.key)
  );
  const showSetupCards = adaptation.showSetupWizard && visibleSetupCards.length > 0;

  useEffect(() => {
    if (orgId) fetchGoals(orgId);
  }, [orgId, fetchGoals]);

  useEffect(() => {
    if (adaptation.stage !== "new") {
      getAISummary().then(setAiSummary);
    }
  }, [adaptation.stage, getAISummary]);

  const activeGoalCount = goals.filter(g => g.status === "active").length;
  const urgentGoals = goals.filter(g => g.priority === "urgent").length;
  const meetingCount = meetingHistory.length;

  const goalsBadge = urgentGoals > 0
    ? `${urgentGoals} urgent`
    : activeGoalCount > 0
      ? `${activeGoalCount} active`
      : undefined;
  const meetingsBadge = meetingCount > 0 ? `${meetingCount} meetings` : undefined;

  const goalsExpanded = urgentGoals > 0 || activeGoalCount === 0;
  const analyticsExpanded = false;
  const meetingsExpanded = meetingCount > 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
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

      {showSetupCards && (
        <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <Info className="w-6 h-6 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-amber-400 mb-1">
                  {adaptation.stage === "new" ? "Welcome to Your Executive Dashboard" : "Great Start!"}
                </h3>
                <p className="text-sm text-text-muted mb-3">{adaptation.emptyStateMessage}</p>
                <div className="flex flex-wrap gap-2">
                  {visibleSetupCards.map((card) => {
                    const Icon = card.icon;
                    return (
                      <button
                        key={card.key}
                        onClick={card.onClick}
                        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 hover:border-amber-500/40 transition-colors cursor-pointer"
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {card.title}
                      </button>
                    );
                  })}
                </div>
              </div>
              <button
                onClick={() => {
                  setDismissedSetupCards((prev) => {
                    const next = new Set(prev);
                    visibleSetupCards.forEach((c) => next.add(c.key));
                    return next;
                  });
                }}
                className="p-1.5 rounded-lg text-text-muted hover:text-foreground hover:bg-surface-light transition-colors cursor-pointer flex-shrink-0"
                title="Dismiss"
                aria-label="Dismiss welcome banner"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {adaptation.showGrokInsights && <OrgHealthWidget orgId={orgId} compact />}

      <CollapsibleSection title="Goals Pipeline" icon={Target} badge={goalsBadge} badgeVariant={urgentGoals > 0 ? "warning" : "default"} defaultExpanded={goalsExpanded}>
        <GoalSection />
      </CollapsibleSection>

      {adaptation.showExecutiveKPIs && (
        <CollapsibleSection title="AI Business Analytics" icon={BarChart3} defaultExpanded={false}>
          <DataCharts goals={goals} />
        </CollapsibleSection>
      )}

      <CollapsibleSection title="AI KPI Advisor" icon={BarChart3} defaultExpanded={false}>
        <KPISuggestionsCard />
      </CollapsibleSection>

      {adaptation.showGrokInsights && <WeeklyReportGenerator />}

      <CollapsibleSection
        title="Meeting Notes"
        icon={Upload}
        badge={meetingsBadge}
        defaultExpanded={meetingsExpanded}
        actions={
          <>
            <Button size="sm" variant="primary" onClick={() => setShowMeetingModal(true)} className="cursor-pointer">
              <Upload className="w-4 h-4" />
              Upload Meeting
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowBookingModal(true)} className="cursor-pointer">
              <Calendar className="w-4 h-4" />
              Book Meeting
            </Button>
          </>
        }
      >
        <div className="p-6">
          <CardDescription className="mb-4">Upload meeting notes to auto-create tasks via AI</CardDescription>
          {meetingHistoryLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : meetingHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
                <Upload className="w-6 h-6 text-primary/60" />
              </div>
              <p className="text-sm text-text-muted">No meetings uploaded yet</p>
              <p className="text-xs text-text-muted/60 mt-1">Upload meeting notes to extract tasks automatically</p>
            </div>
          ) : (() => {
            const grouped = meetingHistory.reduce((acc: Record<string, any[]>, m: any) => {
              const key = m.title || "Untitled";
              (acc[key] = acc[key] || []).push(m);
              return acc;
            }, {} as Record<string, any[]>);
            const sortedGroups = Object.entries(grouped).sort(([, a], [, b]) => {
              const latestA = Math.max(...a.map((x: any) => new Date(x.created_at || 0).getTime()));
              const latestB = Math.max(...b.map((x: any) => new Date(x.created_at || 0).getTime()));
              return latestB - latestA;
            });
            const toggleTitle = (t: string) => {
              setExpandedTitles(prev => {
                const next = new Set(prev);
                next.has(t) ? next.delete(t) : next.add(t);
                return next;
              });
            };
            return (
              <div className="space-y-1">
                {sortedGroups.map(([title, meetings]) => {
                  const isExpanded = expandedTitles.has(title);
                  const latest = meetings[0];
                  return (
                    <div key={title} className="rounded-xl border border-border/50 overflow-hidden">
                      <button
                        onClick={() => toggleTitle(title)}
                        className="w-full flex items-center gap-3 p-3 bg-surface hover:bg-surface/80 transition-colors cursor-pointer text-left"
                      >
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-text-muted flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-text-muted flex-shrink-0" />}
                        <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm font-medium flex-1 truncate">{title}</span>
                        <Badge variant="outline" className="text-xs flex-shrink-0">{meetings.length}</Badge>
                        {latest.created_at && (
                          <span className="text-[10px] text-text-muted flex-shrink-0">{new Date(latest.created_at).toLocaleDateString()}</span>
                        )}
                      </button>
                      {isExpanded && (
                        <div className="border-t border-border/50">
                          {meetings.map((m: any) => (
                            <div key={m.id} className="flex items-center gap-3 px-3 py-2.5 pl-12 bg-surface/50 border-b border-border/30 last:border-0">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-text-muted">
                                  {m.task_count || 0} tasks · {m.created_at ? new Date(m.created_at).toLocaleDateString() : ""}
                                </p>
                              </div>
                              <Badge variant="outline" className="text-[10px] flex-shrink-0">{m.task_count || 0}</Badge>
                              <button onClick={(e) => { e.stopPropagation(); handleDeleteMeeting(m.id); }} className="p-1 rounded-lg hover:bg-rose-500/10 text-text-muted hover:text-rose-400 transition-colors cursor-pointer flex-shrink-0">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Market Impact" icon={TrendingUp} defaultExpanded={false}>
        <MarketImpactCard orgId={orgId} />
      </CollapsibleSection>

      {adaptation.showGrokInsights && (
        <div className="h-[600px]">
          <AISummaryChat />
        </div>
      )}

      {adaptation.showRevenueRisk && (
        <>
          <RevenueRiskRadar />
          <IndustryBenchmarksCard industry={organization?.industry || ""} microVertical={organization?.micro_vertical} />
        </>
      )}

      {escalatedTasks.length > 0 && (
        <Card className="border-rose-500/20 bg-gradient-to-br from-rose-500/5 to-transparent">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
                <CardTitle>Escalations</CardTitle>
              </div>
              <Badge variant="warning" className="text-xs">{escalatedTasks.length} escalated</Badge>
            </div>
            <CardDescription>Tasks escalated to owner — overdue 3+ days</CardDescription>
          </CardHeader>
          <CardContent>
            {escalationsLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-2">
                {escalatedTasks.slice(0, 5).map((task: any) => {
                  const dueStr = task.due_date || "";
                  const daysOverdue = dueStr
                    ? Math.floor((Date.now() - new Date(dueStr).getTime()) / 86400000)
                    : 0;
                  const assignee = task.assignee_email || (task.assignee_id?.[0] || "Unassigned");
                  return (
                    <div key={task._id} className="flex items-center gap-3 p-3 rounded-xl bg-surface border border-rose-500/10">
                      <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center flex-shrink-0">
                        <AlertCircle className="w-4 h-4 text-rose-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{task.title}</p>
                        <p className="text-xs text-text-muted">
                          {assignee} · {daysOverdue}d overdue
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="cursor-pointer flex-shrink-0"
                        onClick={() => router.push(`/dashboard/tasks/${task._id}`)}
                      >
                        View
                      </Button>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
        </Card>
      )}

      <MeetingUploadModal
        open={showMeetingModal}
        onOpenChange={setShowMeetingModal}
        onSuccess={() => fetchMeetingHistory()}
      />

      <CheckInModal
        open={showCheckInModal}
        onOpenChange={setShowCheckInModal}
        orgId={orgId}
      />

      {showBookingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowBookingModal(false)}>
          <div className="w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <ZohoCalendarBooking onClose={() => setShowBookingModal(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

