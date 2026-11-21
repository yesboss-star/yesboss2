"use client";

import { useEffect, useState } from "react";
import { Badge, Button } from "@/components/ui";
import { Loader2, TrendingUp, TrendingDown, Minus, FileText } from "lucide-react";
import { getAuthHeaders } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

type Currency = "INR" | "USD" | null;

/** The figure in the currency the document used: rupees (lakh / crore), dollars (K / M), or a plain number when it did not say. */
function formatValue(val: number | null, currency: Currency): string {
  if (val == null) return "—";
  const sign = val < 0 ? "-" : "";
  const n = Math.abs(val);
  if (currency === "INR") {
    if (n >= 10000000) return `${sign}₹${(n / 10000000).toFixed(1)}Cr`;
    if (n >= 100000) return `${sign}₹${(n / 100000).toFixed(1)}L`;
    return `${sign}₹${n.toLocaleString("en-IN")}`;
  }
  if (currency === "USD") {
    if (n >= 1000000) return `${sign}$${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${sign}$${(n / 1000).toFixed(1)}K`;
    return `${sign}$${n.toLocaleString("en-US")}`;
  }
  return `${sign}${n.toLocaleString("en-IN")}`;
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
  const [notice, setNotice] = useState<string | null>(null);

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
    setNotice(null);
    try {
      const res = await fetch(`${API_URL}/finance/extract?organization_id=${organizationId}`, {
        method: "POST",
        headers: { ...getAuthHeaders() },
      });
      if (res.ok) {
        const result = await res.json();
        if (result.extracted) fetchMetrics();
        else setNotice("No financial figures were found in your recent documents. Upload a P&L, budget or financial report.");
      } else {
        setNotice("Could not read your documents just now. Please try again.");
      }
    } catch {
      setNotice("Could not read your documents just now. Please try again.");
    }
    setExtracting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-text-muted"><Loader2 className="w-4 h-4 animate-spin" />Loading...</div>
    );
  }

  if (!data?.metrics || Object.keys(data.metrics).length === 0 || data.metrics.document_type === "other") {
    return (
      <div className="p-6">
        <p className="text-sm text-text-muted mb-3">No financial data extracted yet. Upload a P&L, budget, or financial report to get started.</p>
        <Button onClick={handleExtract} disabled={extracting} className="text-xs cursor-pointer" size="sm">
          {extracting ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
          {extracting ? "Analyzing..." : "Extract from latest document"}
        </Button>
        {notice && <p className="mt-3 text-sm text-text-muted" role="status">{notice}</p>}
      </div>
    );
  }

  const m = data.metrics;

  // the currency the document used (the first figure that says so), or none
  const currency: Currency = ([m.revenue, m.expenses, m.net_profit, m.gross_profit, m.cash_flow, m.burn_rate].map((x) => x?.currency).find((c) => c === "INR" || c === "USD") as Currency | undefined) ?? null;

  const metricRows = [
    { label: "Revenue", value: m.revenue?.value, trend: data.trend?.revenue },
    { label: "Expenses", value: m.expenses?.value, trend: data.trend?.expenses },
    { label: "Net Profit", value: m.net_profit?.value, trend: data.trend?.net_profit },
    { label: "Gross Profit", value: m.gross_profit?.value, trend: data.trend?.gross_profit },
    { label: "Cash Flow", value: m.cash_flow?.value, trend: data.trend?.cash_flow },
    { label: "Burn Rate", value: m.burn_rate?.value, trend: data.trend?.burn_rate },
  ].filter((r) => r.value != null);

  return (
    <div className="space-y-3 p-6">
        <div className="flex justify-end">
          <Badge variant="outline" className="text-[10px]">{m.document_type?.replace("_", " ") || "Report"}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {metricRows.slice(0, 6).map((r) => (
            <div key={r.label} className="rounded-2xl border border-border bg-surface-light p-3">
              <p className="text-[10px] text-text-muted uppercase tracking-wider">{r.label}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-sm font-semibold">{formatValue(r.value, currency)}</span>
                <TrendIndicator trend={r.trend} />
              </div>
            </div>
          ))}
        </div>

        {m.runway_months != null && (
          <div className="rounded-2xl border border-border bg-surface-light p-3 flex items-center justify-between">
            <span className="text-xs text-text-muted">Runway</span>
            <span className="text-sm font-semibold">{m.runway_months} months <TrendIndicator trend={data.trend?.runway_months} /></span>
          </div>
        )}

        {(m.revenue_growth_pct != null || m.profit_margin_pct != null) && (
          <div className="flex gap-2">
            {m.revenue_growth_pct != null && (
              <div className="flex-1 p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-center">
                <p className="text-[10px] text-text-muted uppercase">Revenue Growth</p>
                <p className={`text-sm font-semibold ${m.revenue_growth_pct < 0 ? "text-rose-400" : "text-emerald-400"}`}>{m.revenue_growth_pct > 0 ? "+" : ""}{m.revenue_growth_pct}%</p>
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
            <span className="text-[10px] text-text-muted">Updated {new Date(data.extracted_at).toLocaleDateString()}{data.filename ? ` · ${data.filename}` : ""}</span>
          )}
        </div>
        {notice && <p className="text-sm text-text-muted" role="status">{notice}</p>}
    </div>
  );
}
