"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, Tabs, TabsList, TabsTrigger, TabsContent, Badge, Button } from "@/components/ui";
import { BarChart3, Download, FileText, TrendingUp, Users, DollarSign, Loader2, RefreshCw, ArrowLeft } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface ReportSummary {
  total_goals: number;
  active_goals: number;
  completed_goals: number;
  total_tasks: number;
  completed_tasks: number;
  pending_tasks: number;
  in_progress_tasks: number;
}

export default function ReportsPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const [goalsRes, tasksRes] = await Promise.all([
        fetch(`${API_URL}/goals`),
        fetch(`${API_URL}/tasks`),
      ]);
      const goalsData = await goalsRes.json();
      const tasksData = await tasksRes.json();

      const goals = goalsData.goals || [];
      const tasks = tasksData.tasks || [];

      setSummary({
        total_goals: goals.length,
        active_goals: goals.filter((g: any) => g.status === "active").length,
        completed_goals: goals.filter((g: any) => g.status === "completed").length,
        total_tasks: tasks.length,
        completed_tasks: tasks.filter((t: any) => t.status === "completed").length,
        pending_tasks: tasks.filter((t: any) => t.status === "pending").length,
        in_progress_tasks: tasks.filter((t: any) => t.status === "in_progress").length,
      });
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await fetch(`${API_URL}/reports/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: "weekly" }),
      });
    } catch {}
    setGenerating(false);
  };

  const metrics = summary ? [
    { label: "Active Goals", value: summary.active_goals, total: summary.total_goals, icon: TrendingUp, color: "text-blue-400" },
    { label: "Completed Tasks", value: summary.completed_tasks, total: summary.total_tasks, icon: Users, color: "text-green-400" },
    { label: "In Progress", value: summary.in_progress_tasks, total: summary.total_tasks, icon: BarChart3, color: "text-yellow-400" },
    { label: "Pending", value: summary.pending_tasks, total: summary.total_tasks, icon: FileText, color: "text-gray-400" },
  ] : [];

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/dashboard/notifications")} className="p-2 rounded-lg hover:bg-surface text-text-muted hover:text-foreground transition-colors cursor-pointer">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold">Reports</h1>
              <p className="text-sm text-text-muted mt-1">
                {summary ? `${summary.total_goals} goals, ${summary.total_tasks} tasks` : "Organization overview"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchSummary}
              className="p-2 rounded-lg hover:bg-surface text-text-muted hover:text-foreground transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-sm font-medium cursor-pointer disabled:opacity-50"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {generating ? "Generating..." : "Generate Report"}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {metrics.map((m, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <m.icon className={`w-5 h-5 ${m.color}`} />
                      <span className="text-xs text-text-muted">of {m.total}</span>
                    </div>
                    <p className="text-2xl font-bold">{m.value}</p>
                    <p className="text-xs text-text-muted mt-1">{m.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Tabs defaultValue="overview">
              <TabsList className="mb-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="goals">Goals Breakdown</TabsTrigger>
                <TabsTrigger value="tasks">Tasks Breakdown</TabsTrigger>
              </TabsList>

              <TabsContent value="overview">
                <Card>
                  <CardHeader>
                    <CardTitle>Performance Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {summary ? (
                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span>Goals Progress</span>
                            <span>{summary.completed_goals}/{summary.total_goals} completed</span>
                          </div>
                          <div className="h-2 rounded-full bg-border overflow-hidden">
                            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${summary.total_goals ? (summary.completed_goals / summary.total_goals) * 100 : 0}%` }} />
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span>Tasks Progress</span>
                            <span>{summary.completed_tasks}/{summary.total_tasks} completed</span>
                          </div>
                          <div className="h-2 rounded-full bg-border overflow-hidden">
                            <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${summary.total_tasks ? (summary.completed_tasks / summary.total_tasks) * 100 : 0}%` }} />
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span>In Progress</span>
                            <span>{summary.in_progress_tasks}/{summary.total_tasks}</span>
                          </div>
                          <div className="h-2 rounded-full bg-border overflow-hidden">
                            <div className="h-full rounded-full bg-yellow-500 transition-all" style={{ width: `${summary.total_tasks ? (summary.in_progress_tasks / summary.total_tasks) * 100 : 0}%` }} />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-text-muted">No data available</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="goals">
                <Card>
                  <CardContent className="p-4">
                    {summary ? (
                      <div className="space-y-3">
                        <div className="flex justify-between items-center py-2 border-b border-border">
                          <span className="text-sm font-medium">Status</span>
                          <span className="text-sm font-medium">Count</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Active</span>
                          <Badge variant="default">{summary.active_goals}</Badge>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Completed</span>
                          <Badge variant="secondary">{summary.completed_goals}</Badge>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-text-muted py-4">No goals data</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="tasks">
                <Card>
                  <CardContent className="p-4">
                    {summary ? (
                      <div className="space-y-3">
                        <div className="flex justify-between items-center py-2 border-b border-border">
                          <span className="text-sm font-medium">Status</span>
                          <span className="text-sm font-medium">Count</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Pending</span>
                          <Badge variant="secondary">{summary.pending_tasks}</Badge>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm">In Progress</span>
                          <Badge variant="default">{summary.in_progress_tasks}</Badge>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Completed</span>
                          <Badge variant="secondary">{summary.completed_tasks}</Badge>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-text-muted py-4">No tasks data</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
