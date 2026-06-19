"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Badge } from "@/components/ui";
import { Activity, TrendingUp, Users, AlertTriangle, Target, CheckCircle, Loader2 } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface OrgHealthData {
  health_score: number;
  health_label: string;
  metrics: {
    goal_completion_rate: number;
    task_completion_rate: number;
    avg_quality_score: number;
    overdue_tasks: number;
    open_bottlenecks: number;
    team_size: number;
    has_org_structure: boolean;
  };
  departments: Record<string, { members: number; goals: number; tasks: number; completed: number }>;
  ai_recommendations: string;
}

export default function OrgHealthWidget({ orgId, compact }: { orgId?: string; compact?: boolean }) {
  const [health, setHealth] = useState<OrgHealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    fetch(`${API_URL}/reports/health/${orgId}`)
      .then((r) => r.json())
      .then((data) => {
        setHealth(data.health || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [orgId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!health) return null;

  const getScoreColor = (score: number) => {
    if (score >= 80) return { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", ring: "stroke-emerald-400" };
    if (score >= 50) return { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", ring: "stroke-amber-400" };
    return { text: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/30", ring: "stroke-rose-400" };
  };

  const colors = getScoreColor(health.health_score);
  const circumference = 2 * Math.PI * 36;
  const dashOffset = circumference - (health.health_score / 100) * circumference;

  if (compact) {
    return (
      <Card className={colors.border}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="relative w-16 h-16 flex-shrink-0">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="36" fill="none" stroke="#1e293b" strokeWidth="6" />
                <circle cx="40" cy="40" r="36" fill="none" className={colors.ring} strokeWidth="6" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dashOffset} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-lg font-bold ${colors.text}`}>{health.health_score}</span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Activity className={`w-4 h-4 ${colors.text}`} />
                <span className="text-sm font-semibold">Org Health</span>
                <Badge variant="outline" className={`text-[10px] ${colors.bg} ${colors.text} ${colors.border}`}>
                  {health.health_label}
                </Badge>
              </div>
              <p className="text-xs text-text-muted mt-1 line-clamp-2">{health.ai_recommendations}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={colors.border}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className={`w-5 h-5 ${colors.text}`} />
            <CardTitle>Organization Health</CardTitle>
          </div>
          <Badge className={`text-xs ${colors.bg} ${colors.text} ${colors.border}`}>
            {health.health_label}
          </Badge>
        </div>
        <CardDescription>AI-driven health assessment of your organization</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6 mb-6">
          <div className="relative w-24 h-24 flex-shrink-0">
            <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="36" fill="none" stroke="#1e293b" strokeWidth="6" />
              <circle cx="40" cy="40" r="36" fill="none" className={colors.ring} strokeWidth="6" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dashOffset} />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-2xl font-bold ${colors.text}`}>{health.health_score}</span>
            </div>
          </div>
          <div className="flex-1 grid grid-cols-2 gap-2">
            {[
              { label: "Goal Completion", value: `${health.metrics.goal_completion_rate}%`, icon: Target, color: "text-primary" },
              { label: "Task Completion", value: `${health.metrics.task_completion_rate}%`, icon: CheckCircle, color: "text-emerald-400" },
              { label: "Team Size", value: health.metrics.team_size, icon: Users, color: "text-purple-400" },
              { label: "Overdue Tasks", value: health.metrics.overdue_tasks, icon: AlertTriangle, color: "text-rose-400" },
            ].map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={i} className="p-2 rounded-lg bg-surface border border-border/50">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Icon className={`w-3 h-3 ${s.color}`} />
                    <span className="text-[10px] text-text-muted">{s.label}</span>
                  </div>
                  <span className={`text-sm font-bold ${s.color}`}>{s.value}</span>
                </div>
              );
            })}
          </div>
        </div>

        {health.ai_recommendations && (
          <div className="p-3 rounded-xl bg-gradient-to-br from-primary/5 to-purple-500/5 border border-primary/20 mb-4">
            <div className="flex items-start gap-2">
              <TrendingUp className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <p className="text-xs text-text-muted leading-relaxed">{health.ai_recommendations}</p>
            </div>
          </div>
        )}

        {Object.keys(health.departments).length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-text-muted mb-2 uppercase tracking-wider">Departments</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(health.departments).map(([name, dept]) => (
                <div key={name} className="p-2 rounded-lg bg-surface border border-border/50">
                  <p className="text-xs font-medium truncate">{name}</p>
                  <p className="text-[10px] text-text-muted">{dept.members} members &middot; {dept.completed}/{dept.tasks} tasks</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
