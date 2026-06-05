"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useGoalStore, Goal } from "@/stores/goalStore";
import { useTaskStore } from "@/stores/taskStore";
import { useOrgChartStore } from "@/stores/orgChartStore";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useAuth } from "@/contexts/AuthContext";
import { useWebSocket } from "@/hooks/useWebSocket";
import {
  Flag, Loader2, CheckCircle, Clock, AlertCircle,
  AlertTriangle, Calendar, Lightbulb,
  Users, Bell, Wifi, WifiOff, ChevronDown, Edit3, X, Check, Trash2,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Button, Modal } from "@/components/ui";
import GoalModal from "@/components/GoalModal";

const DEPARTMENTS = ["Engineering", "Marketing", "Sales", "Operations", "Finance", "Human Resources", "Product", "Design", "Customer Support", "R&D", "Supply Chain", "Legal"];

function PersonSuggest({ value, nameVal, members, filterDept, onChange, placeholder }: {
  value: string; nameVal: string; members: { id: string; email: string; full_name: string; department: string; role: string }[];
  filterDept?: string | null; onChange: (email: string, name: string) => void; placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(nameVal || "");
  const ref = useRef<HTMLDivElement>(null);

  const selected = members.find((m) => m.email === value);
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

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          type="text"
          value={open ? query : (selected?.full_name || nameVal || "")}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { setQuery(selected?.full_name || nameVal || ""); setOpen(true); }}
          placeholder={placeholder}
          className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-primary focus:outline-none pr-8"
        />
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
      </div>
      {open && (
        <div className="absolute z-50 mt-1 left-0 right-0 bg-background border border-border rounded-xl shadow-2xl max-h-48 overflow-y-auto">
          {filtered.slice(0, 10).map((m) => (
            <button key={m.email + '-' + m.full_name} type="button"
              onClick={() => { onChange(m.email, m.full_name); setOpen(false); setQuery(m.full_name); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-surface flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-medium text-primary flex-shrink-0">{m.full_name.charAt(0)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{m.full_name}</p>
                <p className="text-[10px] text-text-muted truncate">{m.email} &middot; {m.department || m.role}</p>
              </div>
            </button>
          ))}
          {filtered.length === 0 && query.trim() && (
            <button type="button"
              onClick={() => { onChange(query.trim(), query.trim()); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-surface">
              Use &ldquo;{query.trim()}&rdquo;
            </button>
          )}
          {filtered.length === 0 && !query.trim() && (
            <p className="p-3 text-xs text-text-muted">No team members found</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function TaskView() {
  const { organization } = useOrganizationStore();
  const { user } = useAuth();
  const { goals, fetchGoals, updateGoal, deleteGoal } = useGoalStore();
  const { tasks, fetchTasks } = useTaskStore();
  const { members, fetchOrgMembers } = useOrgChartStore();
  const orgId = organization?.id;
  const userId = (user as any)?.email || (user as any)?.id;

  const [showGoalModal, setShowGoalModal] = useState(false);
  const [realtimeNotif, setRealtimeNotif] = useState<{ type: string; message: string } | null>(null);
  const [editingGoal, setEditingGoal] = useState<string | null>(null);
  const [editDept, setEditDept] = useState("");
  const [editAssigneeId, setEditAssigneeId] = useState("");
  const [editAssigneeName, setEditAssigneeName] = useState("");
  const [editReviewerId, setEditReviewerId] = useState("");
  const [editReviewerName, setEditReviewerName] = useState("");

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
    setEditAssigneeId(g.assignee_id || "");
    setEditAssigneeName(g.assignee_name || "");
    setEditReviewerId(g.reviewer_id || "");
    setEditReviewerName(g.reviewer_name || "");
  };

  const saveEdit = async (g: Goal) => {
    await updateGoal(g.id, {
      department: editDept || undefined,
      assignee_id: editAssigneeId || undefined,
      assignee_name: editAssigneeName || undefined,
      reviewer_id: editReviewerId || undefined,
      reviewer_name: editReviewerName || undefined,
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
              <Badge variant="outline" className="text-[10px] ml-1">{goals.filter((g) => g.status === "active").length} active</Badge>
            </div>
            <Badge variant="outline" className="text-xs">{goals.length} total</Badge>
          </div>
          <CardDescription>All goals with AI-detected department, defaulter &amp; reviewer. Click ✏️ to edit.</CardDescription>
        </CardHeader>
        <CardContent>
          {goals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Flag className="w-10 h-10 text-text-muted/40 mb-2" />
              <p className="text-sm text-text-muted">No goals yet</p>
              <p className="text-xs text-text-muted/60 mt-1">Create a goal to get started with AI-powered department detection</p>
            </div>
          ) : (
            <div className="space-y-2">
              {goals.map((goal) => {
                const isEditing = editingGoal === goal.id;
                const assigneeMember = members.find((m) => m.email === (goal.assignee_id || ""));
                const reviewerMember = members.find((m) => m.email === (goal.reviewer_id || ""));

                return (
                  <div key={goal.id || Math.random()} className="p-4 rounded-xl bg-surface hover:bg-surface-light transition-all border border-border/50">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${goal.status === "completed" ? "bg-emerald-500/10" : "bg-primary/10"}`}>
                          {goal.status === "completed" ? <CheckCircle className="w-5 h-5 text-emerald-400" /> : <Flag className="w-5 h-5 text-primary" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate">{goal.title}</p>
                            {!isEditing && (
                              <button onClick={() => startEdit(goal)} className="p-0.5 rounded hover:bg-background cursor-pointer flex-shrink-0">
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
                                  <PersonSuggest
                                    value={editAssigneeId} nameVal={editAssigneeName}
                                    members={members} filterDept={editDept || null}
                                    onChange={(email, name) => { setEditAssigneeId(email); setEditAssigneeName(name); }}
                                    placeholder="Search or type name/email..."
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] text-text-muted block mb-1">Reviewer</label>
                                  <PersonSuggest
                                    value={editReviewerId} nameVal={editReviewerName}
                                    members={members} filterDept={editDept || null}
                                    onChange={(email, name) => { setEditReviewerId(email); setEditReviewerName(name); }}
                                    placeholder="Search or type name/email..."
                                  />
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button onClick={() => saveEdit(goal)} className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover cursor-pointer flex items-center gap-1"><Check className="w-3 h-3" /> Save</button>
                                <button onClick={() => setEditingGoal(null)} className="px-3 py-1.5 rounded-lg bg-surface border border-border text-xs hover:bg-background cursor-pointer flex items-center gap-1"><X className="w-3 h-3" /> Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted mt-1">
                              {goal.department && <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium">{goal.department}</span>}
                              {assigneeMember ? (
                                <span className="flex items-center gap-1"><Users className="w-3 h-3" />Defaulter: <strong>{assigneeMember.full_name}</strong></span>
                              ) : goal.assignee_name ? (
                                <span className="flex items-center gap-1"><Users className="w-3 h-3" />Defaulter: <strong>{goal.assignee_name}</strong></span>
                              ) : null}
                              {reviewerMember ? (
                                <span className="flex items-center gap-1"><Users className="w-3 h-3" />Reviewer: <strong>{reviewerMember.full_name}</strong></span>
                              ) : goal.reviewer_name ? (
                                <span className="flex items-center gap-1"><Users className="w-3 h-3" />Reviewer: <strong>{goal.reviewer_name}</strong></span>
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
                          <button onClick={() => handleDeleteGoal(goal.id, goal.title)} className="p-1.5 rounded-lg hover:bg-rose-500/10 text-text-muted hover:text-rose-400 transition-colors cursor-pointer" title="Delete goal">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <GoalModal isOpen={showGoalModal} onClose={() => setShowGoalModal(false)} />
    </div>
  );
}
