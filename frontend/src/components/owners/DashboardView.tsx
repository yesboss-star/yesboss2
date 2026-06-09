"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useGoalStore } from "@/stores/goalStore";
import { useTaskStore } from "@/stores/taskStore";
import { useOrgChartStore } from "@/stores/orgChartStore";
import { useMarketTrendsStore } from "@/stores/marketTrendsStore";
import { useReportStore } from "@/stores/reportStore";
import { useAIDashboardAdaptation, type OrgStage } from "@/hooks/useAIDashboardAdaptation";

import {
  Sparkles, Flag, Calendar, Clock, CheckCircle, AlertCircle, ChevronDown,
  TrendingUp, Shield, MessageSquare, DollarSign,
  FileText, Download, Loader2, Newspaper, ExternalLink,
  BarChart3, Target, Zap, Activity, ChevronRight,
  AlertTriangle, Info, Users, User, FileSpreadsheet,
  PieChart as PieChartIcon, Link2, X, Building2, Network,
  Briefcase, Search, RefreshCw,
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
import GoalDetailChat from "@/components/owners/GoalDetailChat";
import KPISuggestionsCard from "@/components/owners/KPISuggestionsCard";
import AISummaryChat from "@/components/AISummaryChat";

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

function ExpandedGoalPipeline({ goal, onClose, orgId: propOrgId }: { goal: any; onClose: () => void; orgId?: string }) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [goalData, setGoalData] = useState(goal);
  const { updateTask } = useTaskStore();
  const { members, fetchOrgMembers } = useOrgChartStore();

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
        setTasks(data.tasks || []);
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
    const nextAssigneeId = member?.id ?? null;
    const nextAssigneeName = member?.full_name ?? "";
    setTasks((prev) => prev.map((t) => (t._id === taskId || t.id === taskId ? { ...t, assignee_id: nextAssigneeId, assignee_name: nextAssigneeName } : t)));
    try {
      await updateTask(taskId, { assignee_id: nextAssigneeId || undefined } as any);
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
          </div>

          {goal.description && (
            <p className="text-sm text-text-muted bg-surface p-3 rounded-xl border border-border/50">
              {goal.description}
            </p>
          )}

          {(goalData.assignee_name || goalData.reviewer_name) && (
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <User className="w-4 h-4" />
              {goalData.assignee_name && <span><strong>Assignee:</strong> {goalData.assignee_name}</span>}
              {goalData.reviewer_name && <span className="ml-2"><strong>Reviewer:</strong> {goalData.reviewer_name}</span>}
            </div>
          )}

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

          <GoalDetailChat
            goalId={goal.id || goal._id}
            goalTitle={goal.title}
            initialBreakdown={goalData.breakdown_history || goal.breakdown_history || []}
            existingFields={{
              success_criteria: goalData.success_criteria || goal.success_criteria,
              kpis: goalData.kpis || goal.kpis,
              timeline_detail: goalData.timeline_detail || goal.timeline_detail,
              dependencies: goalData.dependencies || goal.dependencies,
            }}
            assigneeName={goalData.assignee_name}
            assigneeId={goalData.assignee_id}
            reviewerName={goalData.reviewer_name}
            reviewerId={goalData.reviewer_id}
            organizationId={propOrgId || goal.organization_id}
            onGoalUpdate={handleGoalUpdate}
          />
        </div>
      </ModalContent>
      <ModalFooter>
        <Button variant="outline" onClick={onClose}>Close</Button>
      </ModalFooter>
    </Modal>
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

  const selected = task.assignee_name || (task.assignee_id && members.find((m) => m.id === task.assignee_id)?.full_name);

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
              {task.assignee_id && (
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
          <div className="flex items-center gap-3 text-[11px] text-text-muted mt-0.5">
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3" /> {taskCounts.completed || 0}/{taskCounts.total || 0} tasks
            </span>
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
          value={{ id: goal.assignee_id, name: goal.assignee_name }}
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
}: {
  department: { name: string };
  goals: any[];
  onClose: () => void;
  onSelectGoal: (goal: any) => void;
  onAssignGoal: (goal: any, role: "defaulter" | "reviewer", member: { id: string; full_name: string; email: string } | null) => Promise<void> | void;
}) {
  const style = getDepartmentStyle(department.name);
  const DeptIcon = style.icon;
  const { organization } = useOrganizationStore();
  const { members, fetchOrgMembers } = useOrgChartStore();
  const orgId = organization?.id;
  const [search, setSearch] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (orgId) fetchOrgMembers(orgId);
  }, [orgId, fetchOrgMembers]);

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

          <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/20 text-[11px] text-text-muted flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <span>
              Use the <strong className="text-primary">Defaulter</strong> and <strong className="text-primary">Reviewer</strong> pickers below to assign each goal. Click a goal to open its full pipeline.
            </span>
          </div>

          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${department.name} goals...`}
            icon={<Search className="w-3.5 h-3.5" />}
            className="text-xs h-9"
          />

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Target className="w-8 h-8 text-text-muted/40 mb-2" />
              <p className="text-sm text-text-muted">No goals match your search</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto custom-scrollbar pr-1">
              {filtered.map((goal) => (
                <DepartmentGoalRow
                  key={goal.id || goal._id}
                  goal={goal}
                  members={members}
                  onOpenGoal={onSelectGoal}
                  onAssign={handleAssign}
                  savingKey={savingKey}
                />
              ))}
            </div>
          )}
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
  const { goals, fetchGoals, updateGoal } = useGoalStore();
  const orgId = organization?.id;
  const [expandedGoal, setExpandedGoal] = useState<any>(null);
  const [openDepartment, setOpenDepartment] = useState<string | null>(null);

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
          onAssignGoal={async (g, role, member) => {
            try {
              await updateGoal(g.id || g._id, {
                ...(role === "defaulter"
                  ? { assignee_id: member?.id || undefined, assignee_name: member?.full_name || undefined }
                  : { reviewer_id: member?.id || undefined, reviewer_name: member?.full_name || undefined }),
              } as any);
            } catch {}
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
    </>
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
      description: "Add members and reporting lines to power your goals",
      icon: Network,
      accent: "from-emerald-500/20 to-teal-500/20",
      isDone: memberCount > 0,
      onClick: () => router.push("/dashboard/orchestration"),
    },
    {
      key: "team_structure",
      title: "Define team structure",
      description: "Set up roles, departments, and reporting relationships",
      icon: Building2,
      accent: "from-amber-500/20 to-orange-500/20",
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

  const getStageLabel = (stage: OrgStage) => {
    switch (stage) {
      case "new": return "Getting Started";
      case "onboarding": return "Building Foundation";
      case "growing": return "Growth Mode";
      case "established": return "Executive View";
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

      <KPISuggestionsCard />

      <GoalSection />

      {adaptation.showExecutiveKPIs && <DataCharts goals={goals} />}

      {adaptation.showGrokInsights && (
        <div className="space-y-6">
          <AISummaryChat />
          <WeeklyReportGenerator />
          {/* Market Trends disabled to save AI credits — re-enable when ready */}
          {/* <MarketTrendsSection /> */}
        </div>
      )}

      {adaptation.showRevenueRisk && <RevenueRiskRadar />}
    </div>
  );
}

