"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useTaskStore } from "@/stores/taskStore";
import { useGoalStore } from "@/stores/goalStore";
import { useOrgChartStore } from "@/stores/orgChartStore";
import DashboardLayout from "@/components/DashboardLayout";
import { GoalSection } from "@/components/owners/DashboardView";
import TaskBoardCard, { firstAssignee, isFinished, needsAttention } from "@/components/TaskBoardCard";
import QuickAddTask from "@/components/QuickAddTask";
import TaskSummaryCard from "@/components/TaskSummaryCard";
import TaskModal from "@/components/TaskModal";
import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/utils";
import { Plus, Search, Zap, CheckCheck, Users, User, UserX, Flag } from "lucide-react";

const COLUMN_PREVIEW = 8;

const pill =
  "inline-flex items-center gap-2 rounded-full border-[2.5px] border-outline px-4 py-2 text-sm font-bold shadow-[3px_3px_0_var(--shadow-hard)] transition-all cursor-pointer hover:-translate-x-px hover:-translate-y-px";

export default function TaskPage() {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const { organization } = useOrganizationStore();
  const { tasks, fetchTasks, loading: tasksLoading } = useTaskStore();
  const { fetchGoals } = useGoalStore();
  const { members, fetchOrgMembers } = useOrgChartStore();

  const [onlyAttention, setOnlyAttention] = useState(false);
  const [onlyApprove, setOnlyApprove] = useState(false);
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [onlyHigh, setOnlyHigh] = useState(false);
  const [expandedCols, setExpandedCols] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskView, setTaskView] = useState<"my" | "team">("my");

  const userEmail = (user as any)?.email || "";

  const directReports = useMemo(() => {
    return members.filter((m) => m.manager_email?.toLowerCase() === userEmail.toLowerCase());
  }, [members, userEmail]);

  const directReportEmails = useMemo(() => {
    return new Set(directReports.map((m) => m.email.toLowerCase()));
  }, [directReports]);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (loading || !user || organization) return;
    const existingPersist = localStorage.getItem("yesboss-organization");
    if (existingPersist) {
      try {
        const parsed = JSON.parse(existingPersist);
        if (parsed?.state?.organization) {
          useOrganizationStore.getState().setOrganization(parsed.state.organization);
          return;
        }
      } catch {}
    }
    useOrganizationStore.getState().fetchOrganizationByEmail(user.email!);
  }, [user, loading, organization]);

  useEffect(() => {
    if (organization?.id) {
      if (role === "owner") fetchGoals(organization.id);
      fetchTasks(organization.id);
      fetchOrgMembers(organization.id);
    }
  }, [organization?.id, role, fetchGoals, fetchTasks, fetchOrgMembers]);

  // Refresh tasks from the backend when the user returns to this tab, so statuses
  // flipped by the Google Tasks sync-back reflect immediately.
  useEffect(() => {
    if (!organization?.id) return;
    const onFocus = () => fetchTasks(organization.id);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [organization?.id, fetchTasks]);

  const visibleTasks = useMemo(() => {
    if (role === "owner") return tasks;
    const aeList = (t: any) =>
      Array.isArray(t.assignee_email)
        ? t.assignee_email.map((x: any) => String(x).toLowerCase())
        : [String(t.assignee_email || "").toLowerCase()];
    if (taskView === "my") {
      return tasks.filter((t) => {
        const ids = t.assignee_id || [];
        const target = userEmail.toLowerCase();
        return ids.some((id) => id.toLowerCase() === target) ||
          aeList(t).includes(target);
      });
    }
    return tasks.filter((t) => {
      const ids = t.assignee_id || [];
      return ids.some((id) => directReportEmails.has(id.toLowerCase())) ||
        aeList(t).some((e: string) => directReportEmails.has(e));
    });
  }, [tasks, role, taskView, userEmail, directReportEmails]);

  const emailToName = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((m) => map.set(m.email.toLowerCase(), (m.full_name || "").trim()));
    return map;
  }, [members]);

  const assigneeOf = (t: (typeof tasks)[number]) => {
    const raw = (Array.isArray(t.assignee_id) && t.assignee_id[0]) || t.assignee_email || "";
    const email = String(raw).toLowerCase();
    const name = emailToName.get(email) || email.split("@")[0];
    const first = name.split(/[\s._-]+/)[0] || "";
    return first ? first.charAt(0).toUpperCase() + first.slice(1) : "";
  };

  const attentionCount = visibleTasks.filter(needsAttention).length;
  const approveCount = visibleTasks.filter((t) => t.status === "completed").length;
  const unassignedCount = visibleTasks.filter((t) => !isFinished(t) && !firstAssignee(t)).length;
  const highCount = visibleTasks.filter((t) => !isFinished(t) && (t.priority === "high" || t.priority === "urgent")).length;
  const finishedCount = visibleTasks.filter(isFinished).length;

  const filteredTasks = visibleTasks.filter((task) => {
    if (onlyAttention && !needsAttention(task)) return false;
    if (onlyApprove && task.status !== "completed") return false;
    if (onlyUnassigned && (isFinished(task) || firstAssignee(task))) return false;
    if (onlyHigh && (isFinished(task) || (task.priority !== "high" && task.priority !== "urgent"))) return false;
    if (searchQuery && !task.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const byDue = (a: (typeof tasks)[number], b: (typeof tasks)[number]) => {
    const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
    const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
    return (Number.isNaN(da) ? Infinity : da) - (Number.isNaN(db) ? Infinity : db);
  };

  // Done holds finished work: completed tasks (flagged "Needs your OK" until approved) come first, then approved ones.
  const byRecent = (a: (typeof tasks)[number], b: (typeof tasks)[number]) =>
    (new Date(b.updated_at).getTime() || 0) - (new Date(a.updated_at).getTime() || 0);
  const columns = [
    { key: "todo", title: "To do", head: "bg-[#FFD93D]", empty: "All clear", tasks: filteredTasks.filter((t) => t.status !== "in_progress" && t.status !== "completed" && t.status !== "approved").sort(byDue) },
    { key: "doing", title: "Doing", head: "bg-[#7CC8FF]", empty: "Nothing in progress", tasks: filteredTasks.filter((t) => t.status === "in_progress").sort(byDue) },
    { key: "done", title: "Done", head: "bg-[#B6F36B]", empty: "Nothing finished yet", tasks: filteredTasks.filter((t) => t.status === "completed" || t.status === "approved").sort((a, b) => Number(b.status === "completed") - Number(a.status === "completed") || byRecent(a, b)) },
  ];

  if (loading || !user) {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Tasks</h1>
            <p className="text-text-muted mt-1">
              {role === "employee"
                ? taskView === "my"
                  ? "Your personal tasks and assignments"
                  : `Tasks from your ${directReports.length} direct report${directReports.length !== 1 ? "s" : ""}`
                : "Everything your team is working on, in one place."}
            </p>
          </div>
          <Button onClick={() => setShowTaskModal(true)} className="flex items-center gap-2 cursor-pointer">
            <Plus className="w-4 h-4" />
            New task
          </Button>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <TaskSummaryCard
            finished={finishedCount}
            total={visibleTasks.length}
            waiting={approveCount}
            isOwner={role === "owner"}
            onReview={() => {
              setOnlyApprove(true);
              setOnlyAttention(false);
              setOnlyUnassigned(false);
              setOnlyHigh(false);
            }}
          />
          {organization?.id && (
            <QuickAddTask orgId={organization.id} members={members} userEmail={userEmail} isOwner={role === "owner"} onError={setError} />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {role === "employee" && directReports.length > 0 && (
            <div className="inline-flex gap-2" role="tablist" aria-label="Whose tasks">
              {([["my", "My tasks", User], ["team", "Team tasks", Users]] as const).map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={taskView === key}
                  onClick={() => setTaskView(key)}
                  className={cn(pill, taskView === key ? "bg-highlight text-on-highlight" : "bg-surface text-foreground")}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            aria-pressed={onlyAttention}
            onClick={() => setOnlyAttention((v) => !v)}
            className={cn(pill, onlyAttention ? "bg-[#FF7A6B] text-[#111]" : "bg-surface text-foreground")}
          >
            <Zap className="w-4 h-4" />
            {attentionCount} need attention
          </button>
          {role === "owner" && (
            <button
              type="button"
              aria-pressed={onlyUnassigned}
              onClick={() => setOnlyUnassigned((v) => !v)}
              className={cn(pill, onlyUnassigned ? "bg-[#FF9FD2] text-[#111]" : "bg-surface text-foreground")}
            >
              <UserX className="w-4 h-4" />
              Nobody yet · {unassignedCount}
            </button>
          )}
          <button
            type="button"
            aria-pressed={onlyHigh}
            onClick={() => setOnlyHigh((v) => !v)}
            className={cn(pill, onlyHigh ? "bg-[#FFD93D] text-[#111]" : "bg-surface text-foreground")}
          >
            <Flag className="w-4 h-4" />
            High priority · {highCount}
          </button>
          {role === "owner" && approveCount > 0 && (
            <button
              type="button"
              aria-pressed={onlyApprove}
              onClick={() => setOnlyApprove((v) => !v)}
              className={cn(pill, onlyApprove ? "bg-[#C9A7FF] text-[#111]" : "bg-surface text-foreground")}
            >
              <CheckCheck className="w-4 h-4" />
              {approveCount} to approve
            </button>
          )}
          <div className="relative ml-auto w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <Input
              type="text"
              placeholder="Search tasks..."
              aria-label="Search tasks"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {error && (
          <p className="rounded-2xl border-2 border-outline bg-rose-500/10 px-4 py-2 text-sm text-rose-400" role="alert">
            {error}
          </p>
        )}

        {tasksLoading && tasks.length === 0 ? (
          <div className="text-center py-12 text-text-muted">Loading tasks...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
            {columns.map((col) => {
              const expanded = expandedCols.includes(col.key);
              const shown = expanded ? col.tasks : col.tasks.slice(0, COLUMN_PREVIEW);
              return (
                <section key={col.key} aria-label={col.title} className="glass rounded-3xl p-3.5 min-w-0">
                  <header className={cn("mb-3.5 flex items-center gap-2.5 rounded-2xl border-[2.5px] border-[#111] px-4 py-2.5 text-[#111]", col.head)}>
                    <h2 className="text-lg font-bold">{col.title}</h2>
                    <span className="ml-auto rounded-full border-2 border-[#111] bg-white px-2.5 text-sm font-extrabold">{col.tasks.length}</span>
                  </header>
                  <div className="space-y-3">
                    {shown.map((task, idx) => (
                      <TaskBoardCard
                        key={task.id || task._id || `task-${idx}`}
                        task={task}
                        assignee={assigneeOf(task)}
                        members={members}
                        isOwner={role === "owner"}
                        onError={setError}
                      />
                    ))}
                    {shown.length === 0 && (
                      <p className="py-6 text-center text-sm font-semibold text-text-muted">
                        {searchQuery || onlyAttention || onlyApprove || onlyUnassigned || onlyHigh ? "No matching tasks" : col.empty}
                      </p>
                    )}
                  </div>
                  {col.tasks.length > COLUMN_PREVIEW && (
                    <button
                      type="button"
                      onClick={() => setExpandedCols((cur) => (cur.includes(col.key) ? cur.filter((k) => k !== col.key) : [...cur, col.key]))}
                      className="mt-3 w-full cursor-pointer py-2 text-sm font-bold text-text-muted hover:text-foreground"
                    >
                      {expanded ? "Show fewer" : `Show all ${col.tasks.length}`}
                    </button>
                  )}
                </section>
              );
            })}
          </div>
        )}

        {role === "owner" && <GoalSection />}
      </div>

      <TaskModal isOpen={showTaskModal} onClose={() => setShowTaskModal(false)} />
    </DashboardLayout>
  );
}
