"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getAuthHeaders } from "@/lib/utils";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Badge, Button } from "@/components/ui";
import {
  TrendingUp, AlertTriangle, Loader2, RefreshCw, ArrowLeft, DollarSign, Target, ExternalLink, Info, Plus,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface MarketImpactItem {
  title: string;
  impact_level: string;
  growth_opportunity: string;
  investment_recommendation: string;
  risk_if_ignored: string;
  growth_impact: string;
  category: string[];
  url?: string;
}

interface Recommendation {
  area: string;
  recommendation: string;
  estimated_roi: string;
  timeline: string;
  risk_level: string;
}

interface HistoryPoint {
  snapshot_date: string;
  impacts: { impact_level: string }[];
}

export default function MarketPage() {
  const router = useRouter();
  const [impacts, setImpacts] = useState<MarketImpactItem[]>([]);
  const [summary, setSummary] = useState("");
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orgId, setOrgId] = useState("");
  const [creatingIds, setCreatingIds] = useState<Set<number>>(new Set());
  const [goalCreated, setGoalCreated] = useState<Map<number, number>>(new Map());
  const [history, setHistory] = useState<HistoryPoint[]>([]);

  useEffect(() => {
    fetch(`${API_URL}/organizations/me`)
      .then((r) => r.json())
      .then((data) => {
        if (data.organization?.id) setOrgId(data.organization.id);
        else if (data.id) setOrgId(data.id);
        else if (data._id) setOrgId(data._id);
      })
      .catch(() => {});
  }, []);

  const fetchData = useCallback(async (refresh = false) => {
    if (!orgId) return;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const impactUrl = refresh
        ? `${API_URL}/trends/refresh-impact/${orgId}`
        : `${API_URL}/trends/impact/${orgId}`;
      const [impactRes, recRes, histRes] = await Promise.all([
        fetch(impactUrl, { method: refresh ? "POST" : "GET" }),
        fetch(`${API_URL}/trends/recommendations/${orgId}`),
        fetch(`${API_URL}/trends/impact-history/${orgId}`),
      ]);
      if (impactRes.ok) {
        const data = await impactRes.json();
        setImpacts(data.impact?.impacts || []);
        setSummary(data.impact?.summary || "");
      }
      if (recRes.ok) {
        const data = await recRes.json();
        setRecommendations(data.recommendations || []);
      }
      if (histRes.ok) {
        const data = await histRes.json();
        setHistory(data.history || []);
      }
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId]);

  useEffect(() => { if (orgId) fetchData(); }, [orgId, fetchData]);

  const createGoal = async (imp: MarketImpactItem, idx: number) => {
    setCreatingIds((prev) => new Set(prev).add(idx));
    try {
      const res = await fetch(
        `${API_URL}/trends/create-goal?organization_id=${encodeURIComponent(orgId)}&title=${encodeURIComponent("Market Trend: " + imp.title)}&description=${encodeURIComponent(imp.growth_opportunity + " " + imp.investment_recommendation)}&department=general`,
        { method: "POST", headers: getAuthHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        setGoalCreated((prev) => new Map(prev).set(idx, data.task_count || 0));
      }
    } catch {} finally {
      setCreatingIds((prev) => {
        const next = new Set(prev);
        next.delete(idx);
        return next;
      });
    }
  };

  const chartData = history
    .map((h) => ({
      date: h.snapshot_date ? new Date(h.snapshot_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "",
      High: h.impacts?.filter((i) => i.impact_level === "high").length || 0,
      Medium: h.impacts?.filter((i) => i.impact_level === "medium").length || 0,
      Low: h.impacts?.filter((i) => i.impact_level === "low" || (i.impact_level !== "high" && i.impact_level !== "medium")).length || 0,
    }))
    .slice(-8);

  const getImpactColor = (level: string) => {
    switch (level) {
      case "high": return { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", icon: TrendingUp };
      case "medium": return { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", icon: Target };
      default: return { text: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/30", icon: AlertTriangle };
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case "low": return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
      case "medium": return "text-amber-400 bg-amber-500/10 border-amber-500/30";
      default: return "text-rose-400 bg-rose-500/10 border-rose-500/30";
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/dashboard")} className="p-2 rounded-lg hover:bg-surface text-text-muted hover:text-foreground transition-colors cursor-pointer">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold">Market Impact Analysis</h1>
              <p className="text-sm text-text-muted mt-1">AI-powered market trend analysis and investment recommendations</p>
            </div>
          </div>
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-sm font-medium cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing..." : "Refresh Analysis"}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
          </div>
        ) : (
          <div className="space-y-6">
            {summary && (
              <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-purple-500/5">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-text-muted leading-relaxed">{summary}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {chartData.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-primary" />
                    <CardTitle>Impact History</CardTitle>
                  </div>
                  <CardDescription>How market impact levels have changed over recent snapshots</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                        <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
                        <Tooltip
                          contentStyle={{
                            background: "#1e293b",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="High" fill="#10b981" radius={[4, 4, 0, 0]} stackId="a" />
                        <Bar dataKey="Medium" fill="#f59e0b" radius={[4, 4, 0, 0]} stackId="a" />
                        <Bar dataKey="Low" fill="#f43f5e" radius={[4, 4, 0, 0]} stackId="a" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  <CardTitle>Trend Impact Analysis</CardTitle>
                </div>
                <CardDescription>Each trend assessed for impact level, growth opportunity, and risk</CardDescription>
              </CardHeader>
              <CardContent>
                {impacts.length === 0 ? (
                  <p className="text-sm text-text-muted text-center py-8">No market impact data available yet.</p>
                ) : (
                  <div className="space-y-4">
                    {impacts.map((imp, i) => {
                      const colors = getImpactColor(imp.impact_level);
                      const Icon = colors.icon;
                      const isCreating = creatingIds.has(i);
                      const isCreated = goalCreated.has(i);
                      const taskCount = goalCreated.get(i) || 0;
                      return (
                        <div key={i} className={`p-4 rounded-xl ${colors.bg} ${colors.border} border`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Icon className={`w-5 h-5 ${colors.text}`} />
                                {imp.url ? (
                                  <a href={imp.url} target="_blank" rel="noopener noreferrer" className="text-base font-semibold hover:underline">{imp.title}</a>
                                ) : (
                                  <span className="text-base font-semibold">{imp.title}</span>
                                )}
                                <Badge variant="outline" className={`text-[10px] ${colors.text} ${colors.bg} ${colors.border}`}>
                                  {imp.impact_level} impact
                                </Badge>
                                {imp.growth_impact && (
                                  <Badge variant="outline" className="text-[10px] text-primary bg-primary/10 border-primary/30">
                                    {imp.growth_impact}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-text-muted mt-2">{imp.growth_opportunity}</p>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                                {imp.investment_recommendation && (
                                  <div className="p-2.5 rounded-lg bg-surface border border-border/50">
                                    <div className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-400 mb-1">
                                      <DollarSign className="w-3 h-3" /> Investment
                                    </div>
                                    <p className="text-xs text-text-muted">{imp.investment_recommendation}</p>
                                  </div>
                                )}
                                {imp.risk_if_ignored && (
                                  <div className="p-2.5 rounded-lg bg-surface border border-border/50">
                                    <div className="flex items-center gap-1.5 text-[10px] font-medium text-rose-400 mb-1">
                                      <AlertTriangle className="w-3 h-3" /> Risk
                                    </div>
                                    <p className="text-xs text-text-muted">{imp.risk_if_ignored}</p>
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={() => createGoal(imp, i)}
                                disabled={isCreating || isCreated}
                                className={`mt-3 flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50 ${
                                  isCreated
                                    ? "text-emerald-400 bg-emerald-500/10"
                                    : "text-primary bg-primary/10 hover:bg-primary/20"
                                }`}
                              >
                                {isCreating ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : isCreated ? (
                                  <><Target className="w-3.5 h-3.5" /> Goal + {taskCount} Task{taskCount !== 1 ? "s" : ""}</>
                                ) : (
                                  <><Plus className="w-3.5 h-3.5" /> Create Goal from This Trend</>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-emerald-400" />
                  <CardTitle>Investment Recommendations</CardTitle>
                </div>
                <CardDescription>AI-generated investment opportunities based on market trends</CardDescription>
              </CardHeader>
              <CardContent>
                {recommendations.length === 0 ? (
                  <p className="text-sm text-text-muted text-center py-8">No recommendations available yet.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {recommendations.map((rec, i) => (
                      <div key={i} className="p-4 rounded-xl bg-surface border border-border/50 hover:border-primary/30 transition-all">
                        <div className="flex items-center gap-2 mb-2">
                          <Target className="w-4 h-4 text-primary" />
                          <span className="text-sm font-semibold">{rec.area}</span>
                        </div>
                        <p className="text-xs text-text-muted mb-3">{rec.recommendation}</p>
                        <div className="flex flex-wrap gap-2 text-[10px]">
                          {rec.estimated_roi && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                              ROI: {rec.estimated_roi}
                            </span>
                          )}
                          {rec.timeline && (
                            <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30">
                              {rec.timeline}
                            </span>
                          )}
                          {rec.risk_level && (
                            <span className={`px-2 py-0.5 rounded-full border ${getRiskColor(rec.risk_level)}`}>
                              {rec.risk_level} risk
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
