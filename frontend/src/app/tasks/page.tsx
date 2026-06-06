"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useUIStore } from "@/stores/uiStore";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useTaskStore, Task } from "@/stores/taskStore";
import { useGoalStore } from "@/stores/goalStore";
import DashboardLayout from "@/components/DashboardLayout";
import TaskCard from "@/components/TaskCard";
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Input } from "@/components/ui";
import { 
  Plus, 
  Filter, 
  LayoutGrid, 
  List, 
  Search, 
  Flag, 
  CheckSquare,
  Clock,
  AlertCircle,
  ArrowLeft
} from "lucide-react";

type ViewMode = "list" | "board";
type FilterStatus = "all" | "pending" | "in_progress" | "completed" | "approved";

export default function TasksPage() {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const { setBreadcrumbs } = useUIStore();
  const { organization } = useOrganizationStore();
  const { tasks, fetchTasks, loading: tasksLoading } = useTaskStore();
  const { goals, fetchGoals } = useGoalStore();
  
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterGoal, setFilterGoal] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    setBreadcrumbs([
      { label: "Dashboard", href: "/dashboard" },
      { label: "Tasks" },
    ]);
  }, [setBreadcrumbs]);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push("/login");
      } else if (role === "owner" && !organization) {
        router.push("/onboarding/owner");
      } else if (role === "employee" && !organization) {
        router.push("/onboarding/employee");
      }
    }
  }, [user, role, loading, router, organization]);

  useEffect(() => {
    if (organization?.id) {
      fetchGoals(organization.id);
      fetchTasks(organization.id);
    }
  }, [organization?.id, fetchGoals, fetchTasks]);

  const filteredTasks = tasks.filter((task) => {
    if (filterStatus !== "all" && task.status !== filterStatus) return false;
    if (filterGoal !== "all" && task.goal_id !== filterGoal) return false;
    if (searchQuery && !task.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const taskStats = {
    total: tasks.length,
    pending: tasks.filter(t => t.status === "pending").length,
    inProgress: tasks.filter(t => t.status === "in_progress").length,
    completed: tasks.filter(t => t.status === "completed").length,
  };

  const getColumnTasks = (status: string) => {
    return filteredTasks.filter(t => t.status === status);
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center animate-pulse">
            <span className="text-white font-bold text-2xl">Y</span>
          </div>
          <p className="text-text-muted text-sm">Loading tasks...</p>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/dashboard/notifications")} className="p-2 rounded-lg hover:bg-surface text-text-muted hover:text-foreground transition-colors cursor-pointer">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">Tasks</h1>
              <p className="text-text-muted mt-1">
                Manage and track all tasks across your organization
              </p>
            </div>
          </div>
          <Button onClick={() => router.push("/tasks/new")} className="flex items-center gap-2 cursor-pointer">
            <Plus className="w-4 h-4" />
            New Task
          </Button>
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
                    {tasks.filter(t => t.priority === "urgent" || t.priority === "high").length}
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
              filteredTasks.map((task) => (
                <TaskCard key={task.id} task={task} showGoal={!!task.goal_id} />
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
                      <TaskCard key={task.id} task={task} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}