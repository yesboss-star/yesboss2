"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { BarChart3, RefreshCw, Loader2 } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { useKPIStore } from "@/stores/kpiStore";
import { useOrganizationStore } from "@/stores/organizationStore";
import { AcceptedKPITile } from "./AcceptedKPITile";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface KPIValue {
  value: number | string;
  formatted: string;
  change?: string;
  trend?: "up" | "down" | "neutral";
  label?: string;
  description?: string;
  icon?: string;
}

export default function AcceptedKPIBanner() {
  const { organization } = useOrganizationStore();
  const orgId = organization?.id;
  const acceptedByOrg = useKPIStore((s) => s.acceptedByOrg);
  const removeKPI = useKPIStore((s) => s.removeKPI);
  const acceptedKPIs = orgId ? acceptedByOrg[orgId] || [] : [];

  const [values, setValues] = useState<Record<string, KPIValue>>({});
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  const valuesFromKPIs = useMemo(() => {
    const map: Record<string, KPIValue> = {};
    for (const kpi of acceptedKPIs) {
      if (kpi.formatted) {
        map[kpi.key] = { value: kpi.value ?? 0, formatted: kpi.formatted };
      }
    }
    return map;
  }, [acceptedKPIs]);

  const mergedValues = useMemo(() => ({ ...valuesFromKPIs, ...values }), [valuesFromKPIs, values]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchValues = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const accepted = useKPIStore.getState().acceptedByOrg[orgId] || [];
      let url = `${API_URL}/dashboard/kpi?organization_id=${encodeURIComponent(orgId)}`;
      if (accepted.length > 0) {
        url += `&accepted_kpis=${encodeURIComponent(JSON.stringify(accepted.map(k => ({ key: k.key, title: k.title }))))}`;
      }
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      if (mountedRef.current) setValues(data || {});
    } catch {
      // silent
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    fetchValues();
    const interval = setInterval(fetchValues, 30000);
    return () => clearInterval(interval);
  }, [orgId, fetchValues]);

  if (!orgId || acceptedKPIs.length === 0) return null;

  return (
    <div className="relative p-4 rounded-2xl bg-gradient-to-br from-primary/5 to-purple-500/5 border border-primary/15">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
            <BarChart3 className="w-3.5 h-3.5 text-primary" />
          </div>
          <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Live KPIs
          </p>
          <Badge variant="success" className="text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1" />
            {acceptedKPIs.length}
          </Badge>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={fetchValues}
          disabled={loading}
          className="h-7 px-2 text-[11px] text-text-muted"
          title="Refresh KPI values"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          <span className="ml-1">{loading ? "Refreshing..." : "Refresh"}</span>
        </Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {acceptedKPIs.map((kpi) => (
          <AcceptedKPITile
            key={kpi.id}
            kpi={kpi}
            value={mergedValues[kpi.key]}
            refreshing={loading}
            onRemove={() => removeKPI(orgId, kpi.id)}
          />
        ))}
      </div>
    </div>
  );
}
