"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useUIStore } from "@/stores/uiStore";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useGoalStore } from "@/stores/goalStore";
import { Loader2, Sparkles, TrendingUp, Users, CheckSquare, DollarSign, Plus, Flag, Calendar, ArrowRight, Clock, CheckCircle, AlertCircle, Lightbulb, MessageSquare } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Button } from "@/components/ui";
import GoalModal from "@/components/GoalModal";
import DashboardView from "@/components/owners/DashboardView";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string;
  assigned_by: string;
}

interface PendingReview {
  id: string;
  type: string;
  title: string;
  submitted_by: string;
  date: string;
}

interface TeamUpdate {
  id: string;
  type: string;
  message: string;
  user: string;
  timestamp: string;
}

export default function DashboardPage() {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const { setBreadcrumbs } = useUIStore();
  const { organization, setOrganization, fetchOrganizationByEmail } = useOrganizationStore();
  const { goals, fetchGoals } = useGoalStore();
  const [showGoalModal, setShowGoalModal] = useState(false);
  
  const [assignedTasks, setAssignedTasks] = useState<Task[]>([]);
  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [teamUpdates, setTeamUpdates] = useState<TeamUpdate[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  const fetchEmployeeData = async () => {
    setTasksLoading(true);
    try {
      const res = await fetch(`${API_URL}/employees/tasks?org_id=${organization?.id}&email=${user?.email}`);
      if (res.ok) {
        const data = await res.json();
        setAssignedTasks(data.tasks || []);
        setPendingReviews(data.pending_reviews || []);
        setTeamUpdates(data.team_updates || []);
      }
    } catch {
      setAssignedTasks([
        { id: "1", title: "Review Q2 marketing report", status: "in_progress", priority: "high", due_date: "2026-05-18", assigned_by: "John Smith" },
        { id: "2", title: "Update client presentation", status: "pending", priority: "medium", due_date: "2026-05-20", assigned_by: "Sarah Johnson" },
        { id: "3", title: "Complete team meeting notes", status: "pending", priority: "low", due_date: "2026-05-22", assigned_by: "Mike Brown" },
      ]);
      setPendingReviews([
        { id: "1", type: "expense", title: "Conference travel reimbursement", submitted_by: "Alice Chen", date: "2026-05-14" },
        { id: "2", type: "timeoff", title: "PTO request - June 1-5", submitted_by: "Bob Wilson", date: "2026-05-15" },
      ]);
      setTeamUpdates([
        { id: "1", type: "task", message: "completed 'Website redesign sprint 3'", user: "Sarah Johnson", timestamp: "2 hours ago" },
        { id: "2", type: "goal", message: "reached 85% of Q2 target", user: "Mike Brown", timestamp: "4 hours ago" },
        { id: "3", type: "announcement", message: "New project kickoff: Mobile App v2.0", user: "John Smith", timestamp: "Yesterday" },
      ]);
    } finally {
      setTasksLoading(false);
    }
  };

  useEffect(() => {
    setBreadcrumbs([{ label: "Dashboard" }]);
  }, [setBreadcrumbs]);

  useEffect(() => {
    if (loading || !user || organization) return;
    const existingPersist = localStorage.getItem("yesboss-organization");
    if (existingPersist) {
      try {
        const parsed = JSON.parse(existingPersist);
        if (parsed?.state?.organization) {
          setOrganization(parsed.state.organization);
          return;
        }
      } catch {}
    }
    fetchOrganizationByEmail(user.email!);
  }, [user, loading, organization, setOrganization, fetchOrganizationByEmail]);

  useEffect(() => {
    if (organization?.id) {
      fetchGoals(organization.id);
    }
  }, [organization?.id, fetchGoals]);

  useEffect(() => {
    if (role === "employee" && organization?.id) {
      const timer = setTimeout(() => {
        fetchEmployeeData();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [role, organization?.id, user?.email]);

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

  if (!user) return null;

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

  const getTimelineLabel = (timeline: string) => {
    const map: Record<string, string> = {
      "1_week": "1 week",
      "2_weeks": "2 weeks", 
      "1_month": "1 month",
      "3_months": "3 months",
      "6_months": "6 months",
      "1_year": "1 year",
    };
    return map[timeline] || timeline;
  };

  const getEmployeeInsights = () => {
    const taskCount = assignedTasks.length;
    const highPriorityCount = assignedTasks.filter(t => t.priority === "high" || t.priority === "urgent").length;
    const pendingCount = pendingReviews.length;
    
    const insights = [];
    
    if (highPriorityCount > 0) {
      insights.push({ text: `You have ${highPriorityCount} high-priority tasks due soon. Consider prioritizing these first.`, type: "warning" as const });
    }
    
    if (taskCount > 5) {
      insights.push({ text: `You're managing ${taskCount} tasks. Your AI suggests breaking down complex items into smaller steps.`, type: "info" as const });
    }
    
    if (pendingCount > 0) {
      insights.push({ text: `You have ${pendingCount} items waiting for your review. Timely approvals keep the team moving forward.`, type: "success" as const });
    }
    
    if (taskCount <= 3) {
      insights.push({ text: "Your workload is balanced. Great time to check in with your manager on upcoming priorities.", type: "success" as const });
    }
    
    if (insights.length === 0) {
      insights.push({ text: "All caught up! Your AI assistant is ready to help with your next priority.", type: "info" as const });
    }
    
    return insights;
  };

  const getWorkflowSuggestions = () => [
    "Based on your communication preference, daily async updates would work well for your team.",
    "Consider blocking 2 hours daily for deep work on complex tasks.",
    "Your team is most productive on Tuesdays - schedule important meetings then.",
    "Try the Pomodoro technique: 25 min focused work, 5 min break for repetitive tasks.",
  ];

  return (
    <DashboardLayout>
      {role === "owner" ? (
        <DashboardView />
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

        {role === "employee" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: TrendingUp, label: "Revenue", value: "$47.2K", change: "+12.5%", badge: "success" as const },
              { icon: Users, label: "Active Users", value: "1,847", change: "+8.2%", badge: "info" as const },
              { icon: CheckSquare, label: "Tasks Done", value: "342", change: "+24.1%", badge: "success" as const },
              { icon: DollarSign, label: "Savings", value: "$12.4K", change: "This month", badge: "warning" as const },
            ].map((stat, i) => (
              <Card key={i} className="card-hover">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <stat.icon className="w-5 h-5 text-primary" />
                    </div>
                    <Badge variant={stat.badge}>{stat.change}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <div className="text-sm text-text-muted">{stat.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {role === "employee" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: CheckSquare, label: "Assigned Tasks", value: assignedTasks.length.toString(), badge: assignedTasks.length > 3 ? "warning" as const : "info" as const },
              { icon: Clock, label: "In Progress", value: assignedTasks.filter(t => t.status === "in_progress").length.toString(), badge: "info" as const },
              { icon: AlertCircle, label: "Pending Review", value: pendingReviews.length.toString(), badge: pendingReviews.length > 0 ? "warning" as const : "success" as const },
              { icon: Users, label: "Team Updates", value: teamUpdates.length.toString(), badge: "info" as const },
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
                  <div className="text-2xl font-bold">{stat.value}</div>
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
                <Button variant="ghost" size="sm" className="cursor-pointer">
                  View All <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {assignedTasks.slice(0, 5).map((task) => (
                  <div key={task.id} className="flex items-center gap-4 p-4 rounded-xl bg-surface hover:bg-surface-light transition-colors">
                    <div className="text-primary">
                      {getStatusIcon(task.status)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{task.title}</p>
                      <div className="flex items-center gap-3 text-xs text-text-muted mt-1">
                        <span>Assigned by {task.assigned_by}</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {task.due_date}
                        </span>
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
                <Button variant="ghost" size="sm" className="cursor-pointer">
                  Review All <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pendingReviews.map((review) => (
                  <div key={review.id} className="flex items-center gap-4 p-4 rounded-xl bg-surface hover:bg-surface-light transition-colors">
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
                      <Button size="sm" variant="outline" className="cursor-pointer">Approve</Button>
                      <Button size="sm" variant="ghost" className="cursor-pointer">Details</Button>
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
                  <div key={update.id} className="flex items-start gap-3 p-3 rounded-xl bg-surface">
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
                { text: "Revenue forecast shows 23% growth next quarter based on current pipeline.", type: "success" as const },
                { text: "3 workflow bottlenecks detected in the design team. Consider reallocating resources.", type: "warning" as const },
                { text: "Customer satisfaction at 94% — 5% above industry benchmark.", type: "info" as const },
              ]).map((insight, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-surface">
                  <Badge variant={insight.type} className="mt-0.5 flex-shrink-0">
                    {insight.type}
                  </Badge>
                  <p className="text-sm text-text-muted">{insight.text}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {role === "employee" && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-primary" />
                <CardTitle>Workflow Suggestions</CardTitle>
              </div>
              <CardDescription>
                AI-powered recommendations to optimize your productivity.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {getWorkflowSuggestions().map((suggestion, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-surface hover:bg-surface-light transition-colors">
                    <Lightbulb className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-text-muted">{suggestion}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      )}

      <GoalModal isOpen={showGoalModal} onClose={() => setShowGoalModal(false)} />
    </DashboardLayout>
  );
}
