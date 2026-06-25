"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge } from "@/components/ui";
import { BarChart3, Loader2, TrendingUp, Clock, AlertCircle } from "lucide-react";
import { getAuthHeaders } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export default function IndustryBenchmarksCard({ industry, microVertical }: { industry: string; microVertical?: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!industry) return;
    setLoading(true);
    const params = new URLSearchParams({ industry });
    if (microVertical) params.append("micro_vertical", microVertical);
    fetch(`${API_URL}/learning/industry-recommendations?${params}`, {
      headers: { ...getAuthHeaders() },
    })
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [industry, microVertical]);

  if (loading) return <div className="p-4 text-sm text-text-muted flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading benchmarks...</div>;
  if (!data?.recommendations?.length) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          <CardTitle>Industry Benchmarks</CardTitle>
        </div>
        <CardDescription>Cross-company comparisons for {industry}{microVertical ? ` / ${microVertical}` : ""}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.recommendations.map((r: any, i: number) => {
          let icon = <TrendingUp className="w-4 h-4" />;
          let color = "text-primary";
          if (r.type === "delay_pattern") { icon = <Clock className="w-4 h-4" />; color = "text-amber-400"; }
          if (r.type === "completion_rate") { icon = <AlertCircle className="w-4 h-4" />; color = "text-emerald-400"; }
          return (
            <div key={i} className="p-3 rounded-xl bg-surface border border-border">
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 ${color}`}>{icon}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{r.title}</p>
                  {r.avg_duration_days && (
                    <p className="text-xs text-text-muted mt-0.5">Avg duration: {r.avg_duration_days} days ({r.sample_size} samples)</p>
                  )}
                  {r.common_reasons && (
                    <div className="mt-1">
                      <p className="text-[10px] text-text-muted">Top delay reasons:</p>
                      <ul className="list-disc list-inside text-[10px] text-text-muted">
                        {r.common_reasons.map((reason: string, j: number) => (
                          <li key={j}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {r.completion_rate && (
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${r.completion_rate}%` }} />
                      </div>
                      <span className="text-xs font-medium text-emerald-400">{r.completion_rate}%</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {data.total_outcomes_analyzed > 0 && (
          <p className="text-[10px] text-text-muted text-center">{data.total_outcomes_analyzed} outcomes analyzed</p>
        )}
      </CardContent>
    </Card>
  );
}
