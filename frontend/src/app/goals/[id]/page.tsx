"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from "@/components/ui";
import { ArrowLeft, Calendar, Target, Flag, User, Loader2 } from "lucide-react";
import { useGoalStore } from "@/stores/goalStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface GoalDetail {
  id: string;
  title: string;
  description?: string;
  priority: string;
  status: string;
  department?: string;
  assignee_name?: string;
  assignee_id?: string;
  reviewer_name?: string;
  timeline?: string;
  created_at: string;
  progress?: number;
  tasks?: any[];
}

export default function GoalDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [goal, setGoal] = useState<GoalDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const goalId = params?.id as string;

  useEffect(() => {
    if (!goalId) return;
    const fetchGoal = async () => {
      try {
        const res = await fetch(`${API_URL}/goals/${goalId}`);
        if (!res.ok) throw new Error("Goal not found");
        const data = await res.json();
        setGoal({ ...data.goal, id: data.goal._id || data.goal.id, tasks: data.tasks || [] });
      } catch {
        setGoal(null);
      } finally {
        setLoading(false);
      }
    };
    fetchGoal();
  }, [goalId]);

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-text-muted hover:text-foreground mb-4 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
          </div>
        ) : !goal ? (
          <div className="flex flex-col items-center py-16 text-text-muted">
            <Target className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-lg font-medium">Goal not found</p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <Badge variant={goal.priority === "high" ? "default" : "secondary"}>
                    {goal.priority}
                  </Badge>
                  <Badge variant={goal.status === "active" ? "default" : "secondary"}>
                    {goal.status}
                  </Badge>
                </div>
                <h1 className="text-2xl font-bold">{goal.title}</h1>
                {goal.description && (
                  <p className="text-text-muted mt-2">{goal.description}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <Card>
                <CardContent className="flex items-center gap-3 p-4">
                  <User className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-xs text-text-muted">Assignee</p>
                    <p className="text-sm font-medium">{goal.assignee_name || "Unassigned"}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-center gap-3 p-4">
                  <Flag className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-xs text-text-muted">Department</p>
                    <p className="text-sm font-medium">{goal.department || "N/A"}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-center gap-3 p-4">
                  <Calendar className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-xs text-text-muted">Timeline</p>
                    <p className="text-sm font-medium">{goal.timeline || "Not set"}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {goal.tasks && goal.tasks.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Tasks ({goal.tasks.length})</CardTitle>
                </CardHeader>
                <CardContent className="p-0 divide-y divide-border/50">
                  {goal.tasks.map((task: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3">
                      <span className={`w-2 h-2 rounded-full ${
                        task.status === "completed" ? "bg-green-500" :
                        task.status === "in_progress" ? "bg-yellow-500" : "bg-gray-500"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">{task.title || "Task"}</p>
                      </div>
                      <span className="text-xs text-text-muted capitalize">{task.status || "pending"}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
