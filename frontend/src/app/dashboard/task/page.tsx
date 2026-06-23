"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useTaskStore } from "@/stores/taskStore";
import { useGoalStore } from "@/stores/goalStore";
import { useOrgChartStore } from "@/stores/orgChartStore";
import DashboardLayout from "@/components/DashboardLayout";
import TaskView from "@/components/owners/TaskView";
import TaskCard from "@/components/TaskCard";
import TaskModal from "@/components/TaskModal";
import { Card, CardContent, Badge, Button, Input } from "@/components/ui";
import {
  Plus, LayoutGrid, List, Search, CheckSquare,
  Clock, AlertCircle, Users, User
} from "lucide-react";

type ViewMode = "list" | "board";
type FilterStatus = "all" | "pending" | "in_progress" | "completed" | "approved";

export default function TaskPage() {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const { organization } = useOrganizationStore();
  const { tasks, fetchTasks, loading: tasksLoading } = useTaskStore();
  const { goals, fetchGoals } = useGoalStore();
  const { members, fetchOrgMembers } = useOrgChartStore();

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
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
      fetchGoals(organization.id);
      fetchTasks(organization.id);
      fetchOrgMembers(organization.id);
    }
  }, [organization?.id, fetchGoals, fetchTasks, fetchOrgMembers]);

  const visibleTasks = useMemo(() => {
    if (role === "owner") return tasks;
    if (taskView === "my") {
      return tasks.filter((t) => {
        const ids = t.assignee_id || [];
        return ids.some((id) => id.toLowerCase() === userEmail.toLowerCase()) ||
          (t.assignee_email || "").toLowerCase() === userEmail.toLowerCase();
      });
    }
    return tasks.filter((t) => {
      const ids = t.assignee_id || [];
      return ids.some((id) => directReportEmails.has(id.toLowerCase())) ||
        directReportEmails.has((t.assignee_email || "").toLowerCase());
    });
  }, [tasks, role, taskView, userEmail, directReportEmails]);

  const visibleGoalIds = useMemo(() => {
    const ids = new Set(visibleTasks.map((t) => t.goal_id).filter(Boolean));
    return ids;
  }, [visibleTasks]);

  const visibleGoals = useMemo(() => {
    if (role === "owner") return goals;
    return goals.filter((g) => visibleGoalIds.has((g as any).id || (g as any)._id));
  }, [goals, role, visibleGoalIds]);

  const filteredTasks = visibleTasks.filter((task) => {
    if (filterStatus !== "all" && task.status !== filterStatus) return false;
    if (searchQuery && !task.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const taskStats = {
    total: visibleTasks.length,
    pending: visibleTasks.filter(t => t.status === "pending").length,
    inProgress: visibleTasks.filter(t => t.status === "in_progress").length,
    completed: visibleTasks.filter(t => t.status === "completed").length,
  };

  const getColumnTasks = (status: string) => {
    return filteredTasks.filter(t => t.status === status);
  };

  if (loading || !user) {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">AI Task Cascade</h1>
            <p className="text-text-muted mt-1">
              {role === "employee"
                ? taskView === "my"
                  ? "Your personal tasks and assignments"
                  : `Tasks from your ${directReports.length} direct report${directReports.length !== 1 ? "s" : ""}`
                : "Manage and track all tasks across your organization"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {role === "employee" && directReports.length > 0 && (
              <div className="flex items-center gap-1 border border-border rounded-lg p-1">
                <button
                  onClick={() => setTaskView("my")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all cursor-pointer ${
                    taskView === "my" ? "bg-primary text-white" : "text-text-muted hover:text-foreground"
                  }`}
                >
                  <User className="w-4 h-4" />
                  My Tasks
                </button>
                <button
                  onClick={() => setTaskView("team")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all cursor-pointer ${
                    taskView === "team" ? "bg-primary text-white" : "text-text-muted hover:text-foreground"
                  }`}
                >
                  <Users className="w-4 h-4" />
                  Team Tasks
                </button>
              </div>
            )}
            <Button onClick={() => setShowTaskModal(true)} className="flex items-center gap-2 cursor-pointer">
              <Plus className="w-4 h-4" />
              New Task
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="card-hover">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <CheckSquare className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{taskStats.total}</p>
                  <p className="text-sm text-text-muted">Total Tasks</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="card-hover">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{taskStats.pending + taskStats.inProgress}</p>
                  <p className="text-sm text-text-muted">In Progress</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="card-hover">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <CheckSquare className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{taskStats.completed}</p>
                  <p className="text-sm text-text-muted">Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="card-hover">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {visibleTasks.filter(t => t.priority === "urgent" || t.priority === "high").length}
                  </p>
                  <p className="text-sm text-text-muted">High Priority</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <Input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={filterStatus === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus("all")}
              className="cursor-pointer"
            >
              All
            </Button>
            <Button
              variant={filterStatus === "pending" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus("pending")}
              className="cursor-pointer"
            >
              Pending
            </Button>
            <Button
              variant={filterStatus === "in_progress" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus("in_progress")}
              className="cursor-pointer"
            >
              In Progress
            </Button>
            <Button
              variant={filterStatus === "completed" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus("completed")}
              className="cursor-pointer"
            >
              Done
            </Button>
          </div>

          <div className="flex items-center gap-1 border border-border rounded-lg p-1">
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 rounded ${viewMode === "list" ? "bg-surface" : "hover:bg-surface/50"} cursor-pointer`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("board")}
              className={`p-2 rounded ${viewMode === "board" ? "bg-surface" : "hover:bg-surface/50"} cursor-pointer`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="border-t border-border pt-6">
          <h2 className="text-lg font-semibold mb-4">Task Cascade</h2>
          <TaskView goals={visibleGoals} />
        </div>

        {viewMode === "list" ? (
          <div className="space-y-2">
            {tasksLoading ? (
              <div className="text-center py-12 text-text-muted">Loading tasks...</div>
            ) : filteredTasks.length === 0 ? (
              <div className="text-center py-12">
                <CheckSquare className="w-12 h-12 text-text-muted mx-auto mb-4" />
                <h3 className="text-lg font-medium">No tasks found</h3>
                <p className="text-text-muted mt-1">
                  {searchQuery || filterStatus !== "all"
                    ? "Try adjusting your filters"
                    : "Create your first task to get started"}
                </p>
              </div>
            ) : (
              filteredTasks.map((task, idx) => (
                <TaskCard key={task.id || task._id || `task-${idx}`} task={task} showGoal={!!task.goal_id} />
              ))
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {["pending", "in_progress", "completed", "approved"].map((status) => {
              const columnTasks = getColumnTasks(status);
              return (
                <div key={status} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-sm capitalize">{status.replace("_", " ")}</h3>
                    <Badge variant="outline">{columnTasks.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {columnTasks.map((task) => (
                      <TaskCard key={task.id || task._id} task={task} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <TaskModal isOpen={showTaskModal} onClose={() => setShowTaskModal(false)} />
    </DashboardLayout>
  );
}
