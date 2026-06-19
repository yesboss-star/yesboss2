"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Badge, Button } from "@/components/ui";
import { TrendingUp, AlertTriangle, Loader2, RefreshCw, ArrowRight, DollarSign, Target, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface MarketImpact {
  title: string;
  impact_level: string;
  growth_opportunity: string;
  investment_recommendation: string;
  risk_if_ignored: string;
  growth_impact: string;
  category: string[];
}

export default function MarketImpactCard({ orgId }: { orgId?: string }) {
  const router = useRouter();
  const [impacts, setImpacts] = useState<MarketImpact[]>([]);
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchImpact = useCallback(async (refresh = false) => {
    if (!orgId) return;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const url = refresh
        ? `${API_URL}/trends/refresh-impact/${orgId}`
        : `${API_URL}/trends/impact/${orgId}`;
      const res = await fetch(url, { method: refresh ? "POST" : "GET" });
      if (res.ok) {
        const data = await res.json();
        setImpacts(data.impact?.impacts || []);
        setSummary(data.impact?.summary || "");
      }
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId]);

  useEffect(() => { fetchImpact(); }, [fetchImpact]);

  const getImpactColor = (level: string) => {
    switch (level) {
      case "high": return { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", icon: TrendingUp };
      case "medium": return { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", icon: Target };
      default: return { text: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/30", icon: AlertTriangle };
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            <CardTitle>Market Impact</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchImpact(true)}
              disabled={refreshing}
              className="p-1.5 rounded-lg hover:bg-surface text-text-muted hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push("/dashboard/market")}
              className="cursor-pointer text-xs"
            >
              Full Analysis <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </div>
        <CardDescription>AI-analyzed market trends and their impact on your business</CardDescription>
      </CardHeader>
      <CardContent>
        {impacts.length === 0 ? (
          <p className="text-xs text-text-muted text-center py-4">No market impact data available yet.</p>
        ) : (
          <div className="space-y-3">
            {summary && (
              <div className="p-3 rounded-xl bg-gradient-to-br from-primary/5 to-purple-500/5 border border-primary/20">
                <p className="text-xs text-text-muted leading-relaxed">{summary}</p>
              </div>
            )}
            <div className="space-y-2">
              {impacts.slice(0, 3).map((imp, i) => {
                const colors = getImpactColor(imp.impact_level);
                const Icon = colors.icon;
                return (
                  <div key={i} className={`p-3 rounded-xl ${colors.bg} ${colors.border} border`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Icon className={`w-4 h-4 ${colors.text}`} />
                          <span className="text-sm font-semibold">{imp.title}</span>
                          <Badge variant="outline" className={`text-[9px] ${colors.text} ${colors.bg} ${colors.border}`}>
                            {imp.impact_level}
                          </Badge>
                        </div>
                        <p className="text-xs text-text-muted mt-1">{imp.growth_opportunity}</p>
                      </div>
                    </div>
                    {imp.investment_recommendation && (
                      <div className="mt-2 flex items-start gap-1.5 text-[10px] text-text-muted">
                        <DollarSign className="w-3 h-3 text-emerald-400 mt-0.5 flex-shrink-0" />
                        <span>{imp.investment_recommendation}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
