"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Badge, Button } from "@/components/ui";
import { TrendingUp, AlertTriangle, Loader2, RefreshCw, ArrowLeft, DollarSign, Target, ExternalLink, Info } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface MarketImpactItem {
  title: string;
  impact_level: string;
  growth_opportunity: string;
  investment_recommendation: string;
  risk_if_ignored: string;
  growth_impact: string;
  category: string[];
}

interface Recommendation {
  area: string;
  recommendation: string;
  estimated_roi: string;
  timeline: string;
  risk_level: string;
}

export default function MarketPage() {
  const router = useRouter();
  const [impacts, setImpacts] = useState<MarketImpactItem[]>([]);
  const [summary, setSummary] = useState("");
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orgId, setOrgId] = useState("");

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
      const [impactRes, recRes] = await Promise.all([
        fetch(impactUrl, { method: refresh ? "POST" : "GET" }),
        fetch(`${API_URL}/trends/recommendations/${orgId}`),
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
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId]);

  useEffect(() => { if (orgId) fetchData(); }, [orgId, fetchData]);

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
                      return (
                        <div key={i} className={`p-4 rounded-xl ${colors.bg} ${colors.border} border`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Icon className={`w-5 h-5 ${colors.text}`} />
                                <span className="text-base font-semibold">{imp.title}</span>
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
