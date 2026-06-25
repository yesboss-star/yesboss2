"use client";

import { Fragment, useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useGoalStore, Goal } from "@/stores/goalStore";
import { useTaskStore } from "@/stores/taskStore";
import { useOrgChartStore } from "@/stores/orgChartStore";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useAuth } from "@/contexts/AuthContext";
import { useWebSocket } from "@/hooks/useWebSocket";
import {
  Flag, Loader2, CheckCircle, Clock, AlertCircle,
  AlertTriangle, Calendar, Lightbulb,
  Users, Bell, Wifi, WifiOff,   ChevronDown, ChevronRight, Circle, Edit3, X, Check, Trash2, Search,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Button, Modal, Input } from "@/components/ui";
import GoalModal from "@/components/GoalModal";
import TaskModal from "@/components/TaskModal";

const DEPARTMENTS = ["Engineering", "Marketing", "Sales", "Operations", "Finance", "Human Resources", "Product", "Design", "Customer Support", "R&D", "Supply Chain", "Legal"];

function PersonMultiSelectInline({ values, nameVals, members, filterDept, onChange, placeholder }: {
  values: string[]; nameVals: string[]; members: { id: string; email: string; full_name: string; department: string; role: string }[];
  filterDept?: string | null; onChange: (emails: string[], names: string[]) => void; placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const filtered = members.filter((m) => {
    const dm = !filterDept || m.department?.toLowerCase() === filterDept.toLowerCase();
    const q = query.toLowerCase();
    return dm && (m.full_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
  });

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const toggleMember = (email: string, name: string) => {
    if (values.includes(email)) {
      onChange(values.filter((v) => v !== email), nameVals.filter((n, i) => values[i] !== email));
    } else {
      onChange([...values, email], [...nameVals, name]);
    }
    setQuery("");
  };

  return (
    <div ref={ref} className="relative">
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {values.map((id, i) => (
            <span key={id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px]">
              {nameVals[i] || id}
              <button type="button" onClick={() => onChange(values.filter((_, j) => j !== i), nameVals.filter((_, j) => j !== i))} className="cursor-pointer hover:text-primary-light">
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-primary focus:outline-none pr-8"
        />
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
      </div>
      {open && (
        <div className="absolute z-50 mt-1 left-0 right-0 bg-background border border-border rounded-xl shadow-2xl max-h-48 overflow-y-auto">
          {filtered.slice(0, 10).map((m) => {
            const selected = values.includes(m.email);
            return (
              <button key={m.email} type="button"
                onClick={() => toggleMember(m.email, m.full_name)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-surface flex items-center gap-2 ${selected ? "bg-primary/10 text-primary" : ""}`}>
                <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center flex-shrink-0 ${selected ? "bg-primary border-primary" : "border-border"}`}>
                  {selected && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-medium text-primary flex-shrink-0">{m.full_name.charAt(0)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{m.full_name}</p>
                  <p className="text-[10px] text-text-muted truncate">{m.email} &middot; {m.department || m.role}</p>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && <p className="p-3 text-xs text-text-muted">No team members found</p>}
        </div>
      )}
    </div>
  );
}

export default function TaskView({ goals: propGoals }: { goals?: any[] }) {
  const router = useRouter();
  const { organization } = useOrganizationStore();
  const { user } = useAuth();
  const { goals: storeGoals, fetchGoals, updateGoal, deleteGoal } = useGoalStore();
  const goals = propGoals ?? storeGoals;
  const { tasks, fetchTasks, updateTask } = useTaskStore();
  const { members, fetchOrgMembers } = useOrgChartStore();
  const orgId = organization?.id;
  const userId = (user as any)?.email || (user as any)?.id;

  const [showGoalModal, setShowGoalModal] = useState(false);
  const [realtimeNotif, setRealtimeNotif] = useState<{ type: string; message: string } | null>(null);
  const [editingGoal, setEditingGoal] = useState<string | null>(null);
  const [goalFilterStatus, setGoalFilterStatus] = useState<string>("all");
  const [goalSearchQuery, setGoalSearchQuery] = useState("");
  const [editDept, setEditDept] = useState("");
  const [editAssigneeId, setEditAssigneeId] = useState<string[]>([]);
  const [editAssigneeName, setEditAssigneeName] = useState<string[]>([]);
  const [editReviewerId, setEditReviewerId] = useState<string[]>([]);
  const [editReviewerName, setEditReviewerName] = useState<string[]>([]);
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);
  const [addTaskGoalId, setAddTaskGoalId] = useState<string | null>(null);

  const goalTasks = useMemo(() => {
    if (!expandedGoalId) return [];
    return tasks.filter((t) => t.goal_id === expandedGoalId);
  }, [expandedGoalId, tasks]);

  const filteredGoals = useMemo(() => {
    return goals.filter((g) => {
      if (goalFilterStatus !== "all") {
        if (goalFilterStatus === "active") {
          if (g.status !== "active" && g.status !== "pending") return false;
        } else if (g.status !== goalFilterStatus) return false;
      }
      if (goalSearchQuery && !g.title.toLowerCase().includes(goalSearchQuery.toLowerCase())) return false;
      return true;
    });
  }, [goals, goalFilterStatus, goalSearchQuery]);

  const goalStats = useMemo(() => ({
    total: goals.length,
    active: goals.filter((g) => g.status === "active" || g.status === "pending").length,
    inProgress: goals.filter((g) => g.status === "in_progress").length,
    completed: goals.filter((g) => g.status === "completed").length,
  }), [goals]);

  const handleTaskStatusChange = async (taskId: string, status: string) => {
    try { await updateTask(taskId, { status } as any); } catch {}
  };

  const handleWsGoalUpdate = useCallback((data: any) => {
    if (!data) return;
    const item = { ...data, id: data._id || data.id };
    const { goals: gs } = useGoalStore.getState();
    if (!item.id) return;
    if (gs.find((g: any) => g.id === item.id)) {
      useGoalStore.setState({ goals: gs.map((g: any) => g.id === item.id ? item : g) });
    }
  }, []);

  const handleWsGoalCreated = useCallback((data: any) => {
    if (!data) return;
    const goal = { ...data, id: data._id || data.id };
    if (!goal.id) return;
    const { goals: gs } = useGoalStore.getState();
    if (gs.find((g: any) => g.id === goal.id)) return;
    useGoalStore.setState({ goals: [goal, ...gs] });
    setRealtimeNotif({ type: "goal", message: `New goal: "${goal.title}"` });
    setTimeout(() => setRealtimeNotif(null), 4000);
  }, []);

  const handleWsTaskCreated = useCallback((data: any) => {
    if (!data) return;
    const task = { ...data, id: data._id || data.id };
    if (!task.id) return;
    const { tasks: ts } = useTaskStore.getState();
    if (ts.find((t: any) => t.id === task.id)) return;
    useTaskStore.setState({ tasks: [task, ...ts] });
  }, []);

  const { isConnected } = useWebSocket({
    organizationId: orgId, userId,
    onGoalCreated: handleWsGoalCreated,
    onTaskCreated: handleWsTaskCreated,
    onTaskUpdated: handleWsGoalUpdate,
  });

  useEffect(() => {
    if (orgId) { fetchGoals(orgId); fetchTasks(orgId); fetchOrgMembers(orgId); }
  }, [orgId, fetchGoals, fetchTasks, fetchOrgMembers]);

  const startEdit = (g: Goal) => {
    setEditingGoal(g.id);
    setEditDept(g.department || "");
    setEditAssigneeId(Array.isArray(g.assignee_id) ? g.assignee_id : g.assignee_id ? [g.assignee_id] : []);
    setEditAssigneeName(Array.isArray(g.assignee_name) ? g.assignee_name : g.assignee_name ? [g.assignee_name] : []);
    setEditReviewerId(Array.isArray(g.reviewer_id) ? g.reviewer_id : g.reviewer_id ? [g.reviewer_id] : []);
    setEditReviewerName(Array.isArray(g.reviewer_name) ? g.reviewer_name : g.reviewer_name ? [g.reviewer_name] : []);
  };

  const saveEdit = async (g: Goal) => {
    await updateGoal(g.id, {
      department: editDept || undefined,
      assignee_id: editAssigneeId.length > 0 ? editAssigneeId : undefined,
      assignee_name: editAssigneeName.length > 0 ? editAssigneeName : undefined,
      reviewer_id: editReviewerId.length > 0 ? editReviewerId : undefined,
      reviewer_name: editReviewerName.length > 0 ? editReviewerName : undefined,
    });
    setEditingGoal(null);
  };

  const handleDeleteGoal = async (goalId: string, title: string) => {
    if (!confirm(`Delete goal "${title}"? This will also remove all associated tasks.`)) return;
    try {
      await deleteGoal(goalId);
    } catch { /* handled by store */ }
  };

  const getPriorityColor = (p: string) => {
    switch (p) {
      case "urgent": return "text-rose-400 bg-rose-500/10 border-rose-500/20";
      case "high": return "text-orange-400 bg-orange-500/10 border-orange-500/20";
      case "medium": return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
      default: return "text-gray-400 bg-gray-500/10 border-gray-500/20";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent">Task Orchestration</h1>
            <p className="text-text-muted mt-1">Goals with AI department detection, defaulter &amp; reviewer</p>
          </div>
          <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium ${isConnected ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
            {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {isConnected ? "Live" : "Offline"}
          </div>
        </div>
        <Button onClick={() => setShowGoalModal(true)} className="cursor-pointer"><Flag className="w-4 h-4 mr-1" /> New Goal</Button>
      </div>

      {realtimeNotif && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/10 border border-primary/20 text-sm animate-pulse">
          <Bell className="w-4 h-4 text-primary" /><span>{realtimeNotif.message}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flag className="w-5 h-5 text-primary" />
              <CardTitle>Goals</CardTitle>
              <Badge variant="outline" className="text-[10px] ml-1">{goalStats.active} active</Badge>
            </div>
            <Badge variant="outline" className="text-xs">{goals.length} total</Badge>
          </div>
          <CardDescription>All goals with AI-detected department, defaulter &amp; reviewer. Click ✏️ to edit.</CardDescription>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mt-4">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <Input
                type="text"
                placeholder="Search goals..."
                value={goalSearchQuery}
                onChange={(e) => setGoalSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={goalFilterStatus === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setGoalFilterStatus("all")}
                className="cursor-pointer"
              >
                All
              </Button>
              <Button
                variant={goalFilterStatus === "active" ? "default" : "outline"}
                size="sm"
                onClick={() => setGoalFilterStatus("active")}
                className="cursor-pointer"
              >
                Pending
              </Button>
              <Button
                variant={goalFilterStatus === "in_progress" ? "default" : "outline"}
                size="sm"
                onClick={() => setGoalFilterStatus("in_progress")}
                className="cursor-pointer"
              >
                In Progress
              </Button>
              <Button
                variant={goalFilterStatus === "completed" ? "default" : "outline"}
                size="sm"
                onClick={() => setGoalFilterStatus("completed")}
                className="cursor-pointer"
              >
                Done
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredGoals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Flag className="w-10 h-10 text-text-muted/40 mb-2" />
              <p className="text-sm text-text-muted">{goals.length === 0 ? "No goals yet" : "No goals match your filters"}</p>
              <p className="text-xs text-text-muted/60 mt-1">
                {goals.length === 0
                  ? "Create a goal to get started with AI-powered department detection"
                  : "Try adjusting your search or filter"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredGoals.map((goal) => {
                const isEditing = editingGoal === goal.id;
                const assigneeMembers = members.filter((m) => {
                  const ids = Array.isArray(goal.assignee_id) ? goal.assignee_id : goal.assignee_id ? [goal.assignee_id] : [];
                  return ids.includes(m.email);
                });
                const reviewerMembers = members.filter((m) => {
                  const ids = Array.isArray(goal.reviewer_id) ? goal.reviewer_id : goal.reviewer_id ? [goal.reviewer_id] : [];
                  return ids.includes(m.email);
                });

                return (
                  <Fragment key={goal.id || Math.random()}>
                    <div className="p-4 rounded-xl bg-surface hover:bg-surface-light transition-all border border-border/50 cursor-pointer"
                      onClick={() => setExpandedGoalId(expandedGoalId === goal.id ? null : goal.id)}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${goal.status === "completed" ? "bg-emerald-500/10" : "bg-primary/10"}`}>
                            {goal.status === "completed" ? <CheckCircle className="w-5 h-5 text-emerald-400" /> : <Flag className="w-5 h-5 text-primary" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium truncate">{goal.title}</p>
                              {!isEditing && (
                                <button onClick={(e) => { e.stopPropagation(); startEdit(goal); }} className="p-0.5 rounded hover:bg-background cursor-pointer flex-shrink-0">
                                  <Edit3 className="w-3.5 h-3.5 text-text-muted hover:text-primary" />
                                </button>
                              )}
                            </div>

                            {isEditing ? (
                              <div className="mt-3 space-y-3">
                                <div>
                                  <label className="text-[10px] text-text-muted block mb-1">Department</label>
                                  <input type="text" value={editDept} onChange={(e) => setEditDept(e.target.value)} list="edit-dept-list" placeholder="Type department name..." className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-primary focus:outline-none" />
                                  <datalist id="edit-dept-list">{DEPARTMENTS.map((d) => <option key={d} value={d} />)}</datalist>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="text-[10px] text-text-muted block mb-1">Defaulter</label>
                                    <PersonMultiSelectInline
                                      values={editAssigneeId} nameVals={editAssigneeName}
                                      members={members} filterDept={editDept || null}
                                      onChange={(ids, names) => { setEditAssigneeId(ids); setEditAssigneeName(names); }}
                                      placeholder="Search team members..."
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-text-muted block mb-1">Reviewer</label>
                                    <PersonMultiSelectInline
                                      values={editReviewerId} nameVals={editReviewerName}
                                      members={members} filterDept={editDept || null}
                                      onChange={(ids, names) => { setEditReviewerId(ids); setEditReviewerName(names); }}
                                      placeholder="Search team members..."
                                    />
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={(e) => { e.stopPropagation(); saveEdit(goal); }} className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover cursor-pointer flex items-center gap-1"><Check className="w-3 h-3" /> Save</button>
                                  <button onClick={(e) => { e.stopPropagation(); setEditingGoal(null); }} className="px-3 py-1.5 rounded-lg bg-surface border border-border text-xs hover:bg-background cursor-pointer flex items-center gap-1"><X className="w-3 h-3" /> Cancel</button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted mt-1">
                                {goal.department && <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium">{goal.department}</span>}
                                {assigneeMembers.length > 0 ? (
                                  <span className="flex items-center gap-1"><Users className="w-3 h-3" />Defaulter: <strong>{assigneeMembers.map((m) => m.full_name).join(", ")}</strong></span>
                                ) : goal.assignee_name ? (
                                  <span className="flex items-center gap-1"><Users className="w-3 h-3" />Defaulter: <strong>{Array.isArray(goal.assignee_name) ? goal.assignee_name.join(", ") : goal.assignee_name}</strong></span>
                                ) : null}
                                {reviewerMembers.length > 0 ? (
                                  <span className="flex items-center gap-1"><Users className="w-3 h-3" />Reviewer: <strong>{reviewerMembers.map((m) => m.full_name).join(", ")}</strong></span>
                                ) : goal.reviewer_name ? (
                                  <span className="flex items-center gap-1"><Users className="w-3 h-3" />Reviewer: <strong>{Array.isArray(goal.reviewer_name) ? goal.reviewer_name.join(", ") : goal.reviewer_name}</strong></span>
                                ) : null}
                                {goal.timeline && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{goal.timeline.replace(/_/g, " ")}</span>}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${getPriorityColor(goal.priority)}`}>{goal.priority}</span>
                          <Badge variant={goal.status === "completed" ? "success" : goal.status === "active" ? "info" : "warning"}>{goal.status}</Badge>
                          {!isEditing && (
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteGoal(goal.id, goal.title); }} className="p-1.5 rounded-lg hover:bg-rose-500/10 text-text-muted hover:text-rose-400 transition-colors cursor-pointer" title="Delete goal">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    {expandedGoalId === goal.id && (
                      <div className="ml-4 pl-4 border-l-2 border-primary/20 space-y-1.5 mt-1">
                        <div className="flex items-center justify-between py-1">
                          <div className="flex items-center gap-2">
                            <ChevronRight className="w-3.5 h-3.5 text-primary" />
                            <span className="text-xs font-medium text-text-muted">Tasks ({goalTasks.length})</span>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); setAddTaskGoalId(goal.id); }}
                            className="text-xs text-primary hover:text-primary-light flex items-center gap-1 cursor-pointer">
                            + Add Task
                          </button>
                        </div>
                        {goalTasks.length === 0 ? (
                          <p className="text-xs text-text-muted py-2 pl-5">No tasks in this goal</p>
                        ) : (
                          goalTasks.map((task) => (
                            <div key={task.id || task._id}
                              onClick={() => router.push(`/tasks/${task.id || task._id}`)}
                              className="flex items-center gap-3 p-3 rounded-lg bg-background border border-border/50 hover:border-primary/20 hover:bg-surface transition-colors cursor-pointer">
                              <div className="flex-shrink-0">
                                {task.status === "completed" ? (
                                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                                ) : task.status === "in_progress" ? (
                                  <Clock className="w-4 h-4 text-blue-400" />
                                ) : (
                                  <Circle className="w-4 h-4 text-gray-400" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{task.title}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getPriorityColor(task.priority)}`}>{task.priority}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {["pending", "in_progress", "completed"].map((s) => (
                                  <button key={s}
                                    onClick={(e) => { e.stopPropagation(); handleTaskStatusChange(task.id || task._id || "", s); }}
                                    className={`px-2 py-1 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                                      task.status === s
                                        ? s === "completed" ? "bg-emerald-500/10 text-emerald-400"
                                          : s === "in_progress" ? "bg-blue-500/10 text-blue-400"
                                            : "bg-gray-500/10 text-gray-400"
                                        : "bg-background text-text-muted hover:bg-surface"
                                    }`}>
                                    {s === "completed" ? "Done" : s === "in_progress" ? "In Prog" : "Pending"}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <GoalModal isOpen={showGoalModal} onClose={() => setShowGoalModal(false)} />
      <TaskModal isOpen={!!addTaskGoalId} onClose={() => setAddTaskGoalId(null)} goalId={addTaskGoalId || undefined} />
    </div>
  );
}
