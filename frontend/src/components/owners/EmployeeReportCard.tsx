"use client";

import { Card, CardContent } from "@/components/ui";
import { CheckCircle, Clock, AlertCircle, Target, TrendingUp, Loader2 } from "lucide-react";

interface EmployeeReport {
  employee_email: string;
  employee_name: string;
  department: string;
  period: string;
  generated_at: string;
  metrics: {
    total_tasks: number;
    completed_tasks: number;
    pending_tasks: number;
    in_progress_tasks: number;
    overdue_tasks: number;
    completion_rate: number;
    avg_completion_hours: number;
    goals_touched: number;
  };
  ai_feedback: string;
}

export default function EmployeeReportCard({ report }: { report: EmployeeReport }) {
  const { metrics } = report;
  const getRateColor = (rate: number) => {
    if (rate >= 80) return "text-emerald-400";
    if (rate >= 50) return "text-amber-400";
    return "text-rose-400";
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-primary">
              {report.employee_name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{report.employee_name}</p>
            <p className="text-[10px] text-text-muted">
              {report.department || "No department"} &middot; {report.period}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className={`text-lg font-bold ${getRateColor(metrics.completion_rate)}`}>
              {metrics.completion_rate}%
            </p>
            <p className="text-[10px] text-text-muted">completion</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { label: "Done", value: metrics.completed_tasks, icon: CheckCircle, color: "text-emerald-400" },
            { label: "In Progress", value: metrics.in_progress_tasks, icon: Clock, color: "text-primary" },
            { label: "Pending", value: metrics.pending_tasks, icon: Target, color: "text-yellow-400" },
            { label: "Overdue", value: metrics.overdue_tasks, icon: AlertCircle, color: metrics.overdue_tasks > 0 ? "text-rose-400" : "text-text-muted" },
          ].map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="p-2 rounded-lg bg-surface border border-border/50 text-center">
                <Icon className={`w-3.5 h-3.5 ${s.color} mx-auto mb-0.5`} />
                <p className="text-sm font-bold">{s.value}</p>
                <p className="text-[9px] text-text-muted">{s.label}</p>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-4 text-[10px] text-text-muted mb-2">
          <span className="flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> {metrics.avg_completion_hours}h avg
          </span>
          <span className="flex items-center gap-1">
            <Target className="w-3 h-3" /> {metrics.goals_touched} goals
          </span>
          <span className="flex items-center gap-1">
            <span>{metrics.total_tasks} total tasks</span>
          </span>
        </div>

        {report.ai_feedback && (
          <p className="text-[10px] text-text-muted leading-relaxed italic border-t border-border/50 pt-2 mt-2">
            {report.ai_feedback}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
