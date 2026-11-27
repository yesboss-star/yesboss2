"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useUIStore } from "@/stores/uiStore";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useGoalStore } from "@/stores/goalStore";
import { Loader2, Sparkles, TrendingUp, Users, CheckSquare, Flag, Calendar, Clock, CheckCircle, AlertCircle, BarChart3, Target, Activity, FileText, Zap } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Button } from "@/components/ui";
import GoalModal from "@/components/GoalModal";
import DashboardView from "@/components/owners/DashboardView";
import DailyBrief from "@/components/capture/DailyBrief";
import { useWebSocket } from "@/hooks/useWebSocket";
import { fetchDeduped, getAuthHeaders } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

interface Task {
  id: string;
  _id?: string;
  title: string;
  status: string;
  priority: string;
  due_date: string;
  assigned_by: string;
}

interface PendingReview {
  id: string;
  _id?: string;
  type: string;
  title: string;
  submitted_by: string;
  date: string;
}

interface TeamUpdate {
  id: string;
  _id?: string;
  type: string;
  message: string;
  user: string;
  timestamp: string;
}

interface KPIItem {
  value: number;
  formatted: string;
  change: string;
  trend: string;
  label: string;
  description: string;
  icon: string;
}

export default function DashboardPage() {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const { setBreadcrumbs } = useUIStore();
  const { organization } = useOrganizationStore();
  const { goals, fetchGoals } = useGoalStore();
  const [showGoalModal, setShowGoalModal] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

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

  const [assignedTasks, setAssignedTasks] = useState<Task[]>([]);
  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [teamUpdates, setTeamUpdates] = useState<TeamUpdate[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [kpiData, setKpiData] = useState<Record<string, KPIItem>>({});
  const [kpiLoading, setKpiLoading] = useState(false);
  const [kpiError, setKpiError] = useState(false);

  const handleWsTaskCreated = useCallback((data: any) => {
    if (!data || role !== "employee" || !user?.email) return;
    const rawAE = data.assignee_email;
    const assigneeEmails = Array.isArray(rawAE)
      ? rawAE.map((x: any) => String(x).toLowerCase())
      : [String(rawAE || "").toLowerCase()];
    const assigneeIds = Array.isArray(data.assignee_id) ? data.assignee_id : (data.assignee_id ? [data.assignee_id] : []);
    const userEmail = user.email.toLowerCase();
    if (assigneeEmails.includes(userEmail) || assigneeIds.some((id: string) => id.toLowerCase() === userEmail)) {
      setAssignedTasks((prev) => {
        if (prev.find((t) => t.id === data._id || t.id === data.id)) return prev;
        return [{
          id: data._id || data.id || Math.random().toString(),
          title: data.title || "Untitled Task",
          status: data.status || "pending",
          priority: data.priority || "medium",
          due_date: data.due_date || "",
          assigned_by: data.created_by || "",
        }, ...prev];
      });
    }
  }, [role, user?.email]);

  const { isConnected } = useWebSocket({
    organizationId: organization?.id,
    userId: (user as any)?.uid || (user as any)?.id,
    onTaskCreated: handleWsTaskCreated,
  });


  
  const getKpiIcon = (iconName: string) => {
    const icons: Record<string, React.ElementType> = { Target, CheckSquare, Users, Activity, FileText, Flag, Zap, BarChart3, TrendingUp };
    return icons[iconName] || BarChart3;
  };

  const fetchEmployeeData = async () => {
    setTasksLoading(true);
    try {
      const res = await fetch(`${API_URL}/employees/tasks?org_id=${organization?.id}&email=${user?.email}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setAssignedTasks(data.tasks || []);
        setPendingReviews(data.pending_reviews || []);
        setTeamUpdates(data.team_updates || []);
      }
    } catch (e) {
      console.error("Failed to fetch employee data", e);
    } finally {
      setTasksLoading(false);
    }
  };

  const fetchKPI = useCallback(async () => {
    if (!organization?.id) return;
    setKpiLoading(true);
    setKpiError(false);
    try {
      const emailParam = role === "employee" && user?.email ? `&email=${encodeURIComponent(user.email)}` : "";
      const res = await fetchDeduped(`${API_URL}/dashboard/kpi?organization_id=${organization.id}${emailParam}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setKpiData(data);
      } else {
        setKpiError(true);
      }
    } catch {
      setKpiError(true);
    } finally {
      setKpiLoading(false);
    }
  }, [organization?.id, role, user?.email]);

  useEffect(() => {
    if (organization?.id) {
      if (role === "owner") fetchGoals(organization.id);
      fetchKPI();
    }
  }, [organization?.id, fetchGoals, fetchKPI, role]);

  useEffect(() => {
    if (role === "employee" && organization?.id) {
      fetchEmployeeData();
    }
  }, [role, organization?.id]);

  const handleApproveReview = async (reviewId: string) => {
    try {
      const res = await fetch(`${API_URL}/tasks/${reviewId}/approve`, {
        method: "POST",
        headers: { ...getAuthHeaders() },
      });
      if (res.ok) {
        setPendingReviews((prev) => prev.filter((r) => r.id !== reviewId && r._id !== reviewId));
        const data = await res.json();
        if (data?.task) {
          setAssignedTasks((prev) => prev.map((t) =>
            t.id === reviewId || t._id === reviewId ? { ...t, status: "approved" } : t
          ));
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error("Approve failed:", res.status, errData);
      }
    } catch (e) {
      console.error("Approve error:", e);
    }
  };

  const handleReviewDetails = (reviewId: string) => {
    router.push(`/tasks/${reviewId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center animate-pulse">
            <span className="text-white font-bold text-2xl">Y</span>
          </div>
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
          <p className="text-text-muted text-sm">Loading your workspace...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
          <p className="text-text-muted text-sm">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent": return "bg-red-500/10 text-red-400 border-red-500/20";
      case "high": return "bg-orange-500/10 text-orange-400 border-orange-500/20";
      case "medium": return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
      default: return "bg-gray-500/10 text-gray-400 border-gray-500/20";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case "in_progress": return <Clock className="w-4 h-4 text-blue-400" />;
      default: return <AlertCircle className="w-4 h-4 text-yellow-400" />;
    }
  };

  const getStatBadge = (trend: string) => {
    switch (trend) {
      case "up": return "success" as const;
      case "down": return "warning" as const;
      default: return "info" as const;
    }
  };

  const getEmployeeInsights = () => {
    const taskCount = assignedTasks.length;
    const highPriorityCount = assignedTasks.filter(t => t.priority === "high" || t.priority === "urgent").length;
    const pendingCount = pendingReviews.length;
    const insights = [];
    // facts from your own tasks only: counts, never advice
    if (highPriorityCount > 0) insights.push({ text: `${highPriorityCount} of your tasks ${highPriorityCount === 1 ? "is" : "are"} high priority.`, type: "warning" as const });
    if (taskCount > 0) insights.push({ text: `${taskCount} task${taskCount === 1 ? " is" : "s are"} assigned to you.`, type: "info" as const });
    if (pendingCount > 0) insights.push({ text: `${pendingCount} item${pendingCount === 1 ? " is" : "s are"} waiting for your review.`, type: "info" as const });
    if (insights.length === 0) insights.push({ text: "Nothing is assigned to you right now.", type: "info" as const });
    return insights;
  };

  const kpiCards = [
    { key: "goals_active", icon: Flag, label: "Active Goals", color: "text-primary" },
    { key: "completion_rate", icon: CheckSquare, label: "Completion Rate", color: "text-emerald-400" },
    { key: "team_size", icon: Users, label: "Team Size", color: "text-blue-400" },
    { key: "tasks_pipeline", icon: Activity, label: "In Progress", color: "text-purple-400" },
  ];

  return (
    <>
      {role === "owner" ? (
        <DashboardView onCreateGoal={() => setShowGoalModal(true)} />
      ) : (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">
              Welcome back, {(user as any)?.user_metadata?.full_name || user?.email?.split("@")[0]}
            </h1>
            <p className="text-text-muted mt-1">
              Here's your agenda for {organization?.name || "your organization"} today.
            </p>
          </div>
        </div>

        <DailyBrief />

        {role === "employee" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: CheckSquare, label: "Assigned Tasks", value: assignedTasks.length.toString(), color: assignedTasks.length > 3 ? "text-yellow-400" : "text-emerald-400" },
              { icon: Clock, label: "In Progress", value: assignedTasks.filter(t => t.status === "in_progress").length.toString(), color: "text-blue-400" },
              { icon: AlertCircle, label: "Pending Review", value: pendingReviews.length.toString(), color: pendingReviews.length > 0 ? "text-yellow-400" : "text-emerald-400" },
              { icon: Users, label: "Team Updates", value: teamUpdates.length.toString(), color: "text-purple-400" },
            ].map((stat, i) => (
              <Card key={i} className="card-hover">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <stat.icon className="w-5 h-5 text-primary" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                  <div className="text-sm text-text-muted">{stat.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {role === "employee" && assignedTasks.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckSquare className="w-5 h-5 text-primary" />
                  <CardTitle>Your Tasks</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {assignedTasks.slice(0, 5).map((task) => (
                  <div key={task.id || task._id} className="flex items-center gap-4 p-4 rounded-xl bg-surface hover:bg-surface-light transition-colors">
                    <div className="text-primary">{getStatusIcon(task.status)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{task.title}</p>
                      <div className="flex items-center gap-3 text-xs text-text-muted mt-1">
                        <span>Assigned by {task.assigned_by}</span>
                        {task.due_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {task.due_date}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getPriorityColor(task.priority)}`}>
                      {task.priority}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {role === "employee" && pendingReviews.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-orange-400" />
                  <CardTitle>Pending Reviews</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pendingReviews.map((review) => (
                  <div key={review.id || review._id} className="flex items-center gap-4 p-4 rounded-xl bg-surface hover:bg-surface-light transition-colors">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                      <AlertCircle className="w-5 h-5 text-orange-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{review.title}</p>
                      <div className="flex items-center gap-3 text-xs text-text-muted mt-1">
                        <span>Submitted by {review.submitted_by}</span>
                        <span>{review.date}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleApproveReview(review.id || review._id || "")} className="cursor-pointer">Approve</Button>
                      <Button size="sm" variant="ghost" onClick={() => handleReviewDetails(review.id || review._id || "")} className="cursor-pointer">Details</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {role === "employee" && teamUpdates.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" />
                  <CardTitle>Team Updates</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {teamUpdates.map((update) => (
                  <div key={update.id || update._id} className="flex items-start gap-3 p-3 rounded-xl bg-surface">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs text-primary font-medium">{update.user.charAt(0)}</span>
                    </div>
                    <div>
                      <p className="text-sm">
                        <span className="font-medium">{update.user}</span>{" "}
                        <span className="text-text-muted">{update.message}</span>
                      </p>
                      <p className="text-xs text-text-muted mt-1">{update.timestamp}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <CardTitle>{role === "employee" ? "AI Productivity Insights" : "AI Insights"}</CardTitle>
            </div>
            <CardDescription>
              {role === "employee"
                ? "Your AI assistant has analyzed your work patterns and tasks."
                : "Your AI agents have been analyzing your business data."
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(role === "employee" ? getEmployeeInsights() : [
                { text: kpiData?.completion_rate ? `${kpiData.completion_rate.formatted} task completion rate — ${kpiData.completion_rate.change}` : "No insights are available yet.", type: "info" as const },
                {text: kpiData?.goal_completion_rate ? `Goal completion at ${kpiData.goal_completion_rate.formatted} — ${kpiData.goal_completion_rate.change}` : null, type: "success" as const},
                {text: kpiData?.team_size ? `${kpiData.team_size.formatted} team members ${kpiData.team_size.change}` : null, type: "info" as const},
              ].filter(i => i.text !== null) as { text: string; type: "success" | "warning" | "info" }[]).map((insight, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-surface">
                  <Badge variant={insight.type} className="mt-0.5 flex-shrink-0">{insight.type}</Badge>
                  <p className="text-sm text-text-muted">{insight.text}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

      </div>
      )}

      {role === "owner" && <GoalModal isOpen={showGoalModal} onClose={() => setShowGoalModal(false)} />}
    </>
  );
}
