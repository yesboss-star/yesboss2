"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from "@/components/ui";
import { DollarSign, Loader2, TrendingUp, TrendingDown, Minus, FileText } from "lucide-react";
import { getAuthHeaders } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

function formatValue(val: number | null): string {
  if (val == null) return "—";
  if (val >= 10000000) return `â‚¹${(val / 10000000).toFixed(1)}Cr`;
  if (val >= 100000) return `â‚¹${(val / 100000).toFixed(1)}L`;
  return `â‚¹${val.toLocaleString("en-IN")}`;
}

function TrendIndicator({ trend }: { trend: { change_pct: number; direction: string } | undefined }) {
  if (!trend) return null;
  const color = trend.direction === "up" ? "text-emerald-400" : trend.direction === "down" ? "text-rose-400" : "text-text-muted";
  const Icon = trend.direction === "up" ? TrendingUp : trend.direction === "down" ? TrendingDown : Minus;
  return (
    <span className={`flex items-center gap-0.5 text-xs ${color}`}>
      <Icon className="w-3 h-3" />
      {Math.abs(trend.change_pct).toFixed(1)}%
    </span>
  );
}

export default function FinancialMetricsCard({ organizationId }: { organizationId: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);

  const fetchMetrics = () => {
    if (!organizationId) return;
    setLoading(true);
    fetch(`${API_URL}/finance/metrics/${organizationId}?limit=3`, {
      headers: { ...getAuthHeaders() },
    })
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchMetrics(); }, [organizationId]);

  const handleExtract = async () => {
    setExtracting(true);
    try {
      const res = await fetch(`${API_URL}/finance/extract?organization_id=${organizationId}`, {
        method: "POST",
        headers: { ...getAuthHeaders() },
      });
      if (res.ok) {
        const result = await res.json();
        if (result.extracted) fetchMetrics();
      }
    } catch { /* ignore */ }
    setExtracting(false);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader><div className="flex items-center gap-2"><DollarSign className="w-5 h-5 text-primary" /><CardTitle>Financial Metrics</CardTitle></div></CardHeader>
        <CardContent><div className="flex items-center gap-2 text-sm text-text-muted"><Loader2 className="w-4 h-4 animate-spin" />Loading...</div></CardContent>
      </Card>
    );
  }

  if (!data?.metrics || Object.keys(data.metrics).length === 0 || data.metrics.document_type === "other") {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><DollarSign className="w-5 h-5 text-primary" /><CardTitle>Financial Metrics</CardTitle></div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-text-muted mb-3">No financial data extracted yet. Upload a P&L, budget, or financial report to get started.</p>
          <Button onClick={handleExtract} disabled={extracting} className="text-xs cursor-pointer" size="sm">
            {extracting ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
            {extracting ? "Analyzing..." : "Extract from latest document"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const m = data.metrics;

  const metricRows = [
    { label: "Revenue", value: m.revenue?.value, trend: data.trend?.revenue },
    { label: "Expenses", value: m.expenses?.value, trend: data.trend?.expenses },
    { label: "Net Profit", value: m.net_profit?.value, trend: data.trend?.net_profit },
    { label: "Gross Profit", value: m.gross_profit?.value, trend: data.trend?.gross_profit },
    { label: "Cash Flow", value: m.cash_flow?.value, trend: data.trend?.cash_flow },
    { label: "Burn Rate", value: m.burn_rate?.value, trend: data.trend?.burn_rate },
  ].filter((r) => r.value != null);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-primary" />
            <CardTitle>Financial Metrics</CardTitle>
          </div>
          <Badge variant="outline" className="text-[10px]">{m.document_type?.replace("_", " ") || "Report"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {metricRows.slice(0, 6).map((r) => (
            <div key={r.label} className="p-2.5 rounded-lg bg-surface border border-border">
              <p className="text-[10px] text-text-muted uppercase tracking-wider">{r.label}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-sm font-semibold">{formatValue(r.value)}</span>
                <TrendIndicator trend={r.trend} />
              </div>
            </div>
          ))}
        </div>

        {m.runway_months != null && (
          <div className="p-2.5 rounded-lg bg-surface border border-border flex items-center justify-between">
            <span className="text-xs text-text-muted">Runway</span>
            <span className="text-sm font-semibold">{m.runway_months} months <TrendIndicator trend={data.trend?.runway_months} /></span>
          </div>
        )}

        {(m.revenue_growth_pct != null || m.profit_margin_pct != null) && (
          <div className="flex gap-2">
            {m.revenue_growth_pct != null && (
              <div className="flex-1 p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-center">
                <p className="text-[10px] text-text-muted uppercase">Revenue Growth</p>
                <p className="text-sm font-semibold text-emerald-400">+{m.revenue_growth_pct}%</p>
              </div>
            )}
            {m.profit_margin_pct != null && (
              <div className="flex-1 p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/20 text-center">
                <p className="text-[10px] text-text-muted uppercase">Profit Margin</p>
                <p className="text-sm font-semibold text-blue-400">{m.profit_margin_pct.toFixed(1)}%</p>
              </div>
            )}
          </div>
        )}

        {m.notes && (
          <p className="text-xs text-text-muted italic">{m.notes}</p>
        )}

        {m.key_risks && m.key_risks.length > 0 && (
          <div className="p-2 rounded-lg bg-rose-500/5 border border-rose-500/20">
            <p className="text-[10px] text-rose-400 font-medium uppercase mb-1">Key Risks</p>
            {m.key_risks.map((risk: string, i: number) => (
              <p key={i} className="text-xs text-rose-300/80">• {risk}</p>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <Button onClick={handleExtract} disabled={extracting} className="text-xs cursor-pointer" size="sm" variant="outline">
            {extracting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            {extracting ? "Extracting..." : "Re-extract"}
          </Button>
          {data.extracted_at && (
            <span className="text-[10px] text-text-muted">Updated {new Date(data.extracted_at).toLocaleDateString()}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
