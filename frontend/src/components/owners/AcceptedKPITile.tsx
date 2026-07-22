"use client";

import { X, Loader2, TrendingUp, TrendingDown, Minus, BarChart3, FileText, Target, Lightbulb, Sparkles } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import type { AcceptedKPI } from "@/stores/kpiStore";

interface KPIValue {
  value: number | string;
  formatted: string;
  change?: string;
  trend?: "up" | "down" | "neutral";
  label?: string;
  description?: string;
  icon?: string;
}

function KpiIcon({ name, className = "w-4 h-4" }: { name?: string; className?: string }) {
  switch (name) {
    case "TrendingUp": return <TrendingUp className={className} />;
    case "TrendingDown": return <TrendingDown className={className} />;
    case "BarChart3": return <BarChart3 className={className} />;
    case "Target": return <Target className={className} />;
    case "FileText": return <FileText className={className} />;
    case "Lightbulb": return <Lightbulb className={className} />;
    case "DollarSign": return <TrendingUp className={className} />;
    case "Users": return <Target className={className} />;
    case "Activity": return <BarChart3 className={className} />;
    case "Zap": return <Sparkles className={className} />;
    case "Flag": return <Target className={className} />;
    case "Clock": return <BarChart3 className={className} />;
    case "CheckCircle": return <TrendingUp className={className} />;
    default: return <Sparkles className={className} />;
  }
}

export function AcceptedKPITile({
  kpi,
  value,
  onRemove,
  refreshing,
}: {
  kpi: AcceptedKPI;
  value?: KPIValue;
  onRemove: () => void;
  refreshing?: boolean;
}) {
  const trend = value?.trend;
  const trendColor =
    trend === "up" ? "text-emerald-400" : trend === "down" ? "text-rose-400" : "text-text-muted";

  return (
    <div className="group relative p-4 rounded-2xl bg-gradient-to-br from-surface to-surface-light border border-border/50 hover:border-primary/30 transition-all">
      <button
        onClick={onRemove}
        className="absolute top-2 right-2 p-1 rounded-md text-text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-all"
        aria-label="Remove KPI"
        title="Remove"
      >
        <X className="w-3 h-3" />
      </button>
      <div className="flex items-start justify-between mb-2 pr-5">
        <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
          <KpiIcon name={kpi.icon || value?.icon} className="w-4 h-4 text-primary" />
        </div>
        {refreshing ? (
          <Loader2 className="w-3 h-3 text-text-muted animate-spin" />
        ) : trend === "up" ? (
          <TrendingUp className={`w-3.5 h-3.5 ${trendColor}`} />
        ) : trend === "down" ? (
          <TrendingDown className={`w-3.5 h-3.5 ${trendColor}`} />
        ) : trend ? (
          <Minus className={`w-3.5 h-3.5 ${trendColor}`} />
        ) : null}
      </div>
      <p className="text-[10px] uppercase tracking-wider text-text-muted/80 font-medium truncate">
        {kpi.title}
      </p>
      <p className="text-xl font-bold text-foreground mt-0.5 truncate">
        {value?.formatted || kpi.formatted || "—"}
      </p>
      {value?.change && (
        <p className="text-[10px] text-text-muted mt-1 truncate">{value.change}</p>
      )}
      {kpi.category && (
        <Badge variant="outline" className="text-[9px] mt-2 capitalize">{kpi.category}</Badge>
      )}
    </div>
  );
}
