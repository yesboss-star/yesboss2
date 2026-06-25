"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge } from "@/components/ui";
import { Users, AlertTriangle, Loader2, BarChart3 } from "lucide-react";
import { getAuthHeaders } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export default function EmployeeFrequencyWidget({ orgId }: { orgId?: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    fetch(`${API_URL}/learning/workload-analysis/${orgId}`, {
      headers: { ...getAuthHeaders() },
    })
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [orgId]);

  if (loading) return <div className="p-4 text-sm text-text-muted flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading workload...</div>;
  if (!data?.employees?.length) return null;

  const maxLoad = Math.max(...data.employees.map((e: any) => e.load_percent), 1);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <CardTitle>Team Work Patterns</CardTitle>
          </div>
          {data.overloaded?.length > 0 && (
            <Badge variant="warning" className="text-xs">{data.overloaded.length} overloaded</Badge>
          )}
        </div>
        <CardDescription>Weekly workload based on tracked work patterns</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.employees.slice(0, 8).map((emp: any) => {
          const isOverloaded = emp.status === "overloaded";
          const isUnder = emp.status === "underutilized";
          return (
            <div key={emp.email} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate font-medium">{emp.email.split("@")[0]}</span>
                  {isOverloaded && <AlertTriangle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-text-muted">{emp.active_tasks} tasks</span>
                  <span className={`text-xs font-medium ${
                    isOverloaded ? "text-rose-400" : isUnder ? "text-amber-400" : "text-emerald-400"
                  }`}>{emp.load_percent}%</span>
                </div>
              </div>
              <div className="w-full h-2 bg-surface rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    isOverloaded ? "bg-rose-500" : isUnder ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                  style={{ width: `${(emp.load_percent / maxLoad) * 100}%` }}
                />
              </div>
              {emp.categories?.length > 0 && (
                <p className="text-[10px] text-text-muted truncate">{emp.categories.join(" · ")}</p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
