"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useUIStore } from "@/stores/uiStore";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useGoalStore } from "@/stores/goalStore";
import { Loader2, Sparkles, TrendingUp, Users, CheckSquare, Flag, Calendar, Clock, CheckCircle, AlertCircle, Lightbulb, BarChart3, Target, Activity, FileText, Zap, Upload, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Button } from "@/components/ui";
import GoalModal from "@/components/GoalModal";
import DashboardView from "@/components/owners/DashboardView";
import ZohoCalendarBooking from "@/components/owners/ZohoCalendarBooking";
import MeetingUploadModal from "@/components/owners/MeetingUploadModal";
import AISummaryChat from "@/components/AISummaryChat";
import { getAuthHeaders } from "@/lib/utils";

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
  const { organization, setOrganization, fetchOrganizationByEmail } = useOrganizationStore();
  const { goals, fetchGoals } = useGoalStore();
  const [showGoalModal, setShowGoalModal] = useState(false);
  
  const [assignedTasks, setAssignedTasks] = useState<Task[]>([]);
  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [teamUpdates, setTeamUpdates] = useState<TeamUpdate[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [kpiData, setKpiData] = useState<Record<string, KPIItem>>({});
  const [kpiLoading, setKpiLoading] = useState(false);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const [meetingHistory, setMeetingHistory] = useState<any[]>([]);
  const [meetingsLoading, setMeetingsLoading] = useState(false);
  const [expandedTitles, setExpandedTitles] = useState<Set<string>>(new Set());

  
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

  const fetchKPI = async () => {
    if (!organization?.id) return;
    setKpiLoading(true);
    try {
      const res = await fetch(`${API_URL}/dashboard/kpi?organization_id=${organization.id}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setKpiData(data);
      }
    } catch (e) {
      console.error("Failed to fetch KPI data", e);
    } finally {
      setKpiLoading(false);
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
      fetchKPI();
    }
  }, [organization?.id, fetchGoals]);

  const fetchMeetingHistory = async () => {
    if (!organization?.id) return;
    setMeetingsLoading(true);
    try {
      const res = await fetch(`${API_URL}/meetings/history?organization_id=${organization.id}&limit=50`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setMeetingHistory(data.meetings || []);
      }
    } catch {
    } finally {
      setMeetingsLoading(false);
    }
  };

  useEffect(() => {
    if (role === "employee" && organization?.id) {
      fetchEmployeeData();
    }
  }, [role, organization?.id, user?.email]);

  const handleDeleteMeeting = async (meetingId: string) => {
    try {
      const orgId = organization?.id;
      if (!orgId) return;
      const res = await fetch(`${API_URL}/meetings/${meetingId}?organization_id=${orgId}`, {
        method: "DELETE",
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setMeetingHistory((prev) => prev.filter((m) => m.id !== meetingId));
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error("Delete failed:", res.status, errData);
      }
    } catch (e) {
      console.error("Delete error:", e);
    }
  };

  useEffect(() => {
    if (organization?.id && role === "employee") {
      fetchMeetingHistory();
    }
  }, [organization?.id, role]);

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
    if (highPriorityCount > 0) insights.push({ text: `You have ${highPriorityCount} high-priority tasks due soon. Consider prioritizing these first.`, type: "warning" as const });
    if (taskCount > 5) insights.push({ text: `You're managing ${taskCount} tasks. Your AI suggests breaking down complex items into smaller steps.`, type: "info" as const });
    if (pendingCount > 0) insights.push({ text: `You have ${pendingCount} items waiting for your review. Timely approvals keep the team moving forward.`, type: "success" as const });
    if (taskCount <= 3) insights.push({ text: "Your workload is balanced. Great time to check in with your manager on upcoming priorities.", type: "success" as const });
    if (insights.length === 0) insights.push({ text: "All caught up! Your AI assistant is ready to help with your next priority.", type: "info" as const });
    return insights;
  };

  const kpiCards = [
    { key: "goals_active", icon: Flag, label: "Active Goals", color: "text-primary" },
    { key: "completion_rate", icon: CheckSquare, label: "Completion Rate", color: "text-emerald-400" },
    { key: "team_size", icon: Users, label: "Team Size", color: "text-blue-400" },
    { key: "tasks_pipeline", icon: Activity, label: "In Progress", color: "text-purple-400" },
  ];

  return (
    <DashboardLayout>
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

        {role === "employee" && !kpiLoading && Object.keys(kpiData).length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {kpiCards.map(({ key, icon: Icon, label, color }) => {
              const kpi = kpiData[key];
              if (!kpi) return null;
              return (
                <Card key={key} className="card-hover">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <Badge variant={getStatBadge(kpi.trend)}>{kpi.change}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${color}`}>{kpi.formatted}</div>
                    <div className="text-sm text-text-muted">{kpi.label}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

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
                  <div key={task.id} className="flex items-center gap-4 p-4 rounded-xl bg-surface hover:bg-surface-light transition-colors">
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

        {role === "employee" && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Upload className="w-5 h-5 text-primary" />
                  <CardTitle>Meeting Notes</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="primary" onClick={() => setShowUploadModal(true)} className="cursor-pointer">
                    <Upload className="w-4 h-4" />
                    Upload Meeting
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowBooking(true)} className="cursor-pointer">
                    <Calendar className="w-4 h-4" />
                    Book Meeting
                  </Button>
                </div>
              </div>
              <CardDescription>Upload meeting notes to auto-create tasks via AI</CardDescription>
            </CardHeader>
            <CardContent>
              {meetingsLoading ? (
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
                const grouped = meetingHistory.reduce((acc, m) => {
                  const key = m.title || "Untitled";
                  (acc[key] = acc[key] || []).push(m);
                  return acc;
                }, {} as Record<string, any[]>);
                const sortedGroups = (Object.entries(grouped) as [string, any[]][]).sort(([, a], [, b]) => {
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
                { text: kpiData?.completion_rate ? `${kpiData.completion_rate.formatted} task completion rate — ${kpiData.completion_rate.change}` : "Loading insights...", type: "info" as const },
                { text: kpiData?.goal_completion_rate ? `Goal completion at ${kpiData.goal_completion_rate.formatted} — ${kpiData.goal_completion_rate.change}` : null, type: "success" as const },
                { text: kpiData?.team_size ? `${kpiData.team_size.formatted} team members ${kpiData.team_size.change}` : null, type: "info" as const },
              ].filter(Boolean) as { text: string; type: "success" | "warning" | "info" }[]).map((insight, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-surface">
                  <Badge variant={insight.type} className="mt-0.5 flex-shrink-0">{insight.type}</Badge>
                  <p className="text-sm text-text-muted">{insight.text}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {role === "employee" && (
          <div className="h-[600px]">
            <AISummaryChat />
          </div>
        )}

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
                {[
                  "Based on your workload, prioritize high-urgency tasks first and batch similar work together.",
                  "Consider blocking 2 hours daily for deep work on complex tasks.",
                  "Review your task deadlines and update statuses to keep your pipeline accurate.",
                  "Taking short breaks between tasks improves focus and decision quality.",
                ].map((suggestion, i) => (
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
      <MeetingUploadModal
        open={showUploadModal}
        onOpenChange={setShowUploadModal}
        onSuccess={() => fetchMeetingHistory()}
      />
      {showBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowBooking(false)}>
          <div className="w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <ZohoCalendarBooking onClose={() => setShowBooking(false)} />
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
