"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  X,
  Check,
  Plus,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  BarChart3,
  FileText,
  Target,
  Lightbulb,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Upload,
  ArrowRight,
  AlertCircle,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from "@/components/ui";
import { useKPIStore, type KPISuggestion, type KPISource, type AcceptedKPI } from "@/stores/kpiStore";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useGoalStore } from "@/stores/goalStore";
import { useTaskStore } from "@/stores/taskStore";
import { useOrgChartStore } from "@/stores/orgChartStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const SUGGEST_INTERVAL_MS = 5 * 60 * 1000;
const SUGGEST_DEBOUNCE_MS = 4 * 1000;
const EMPTY_ARRAY: never[] = [];

type IconName = string;
type LucideIcon = typeof Sparkles;

const SOURCE_BADGES: Record<KPISource, { label: string; color: string; icon: LucideIcon }> = {
  ai: { label: "AI suggestion", color: "text-primary bg-primary/10 border-primary/20", icon: Sparkles },
  document: { label: "From document", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20", icon: FileText },
  goal: { label: "From goal", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", icon: Target },
  progress: { label: "From progress", color: "text-amber-400 bg-amber-500/10 border-amber-500/20", icon: TrendingUp },
};

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

function SourceBadgeIcon({ source, className = "w-2.5 h-2.5" }: { source: KPISource; className?: string }) {
  switch (source) {
    case "document": return <FileText className={className} />;
    case "goal": return <Target className={className} />;
    case "progress": return <TrendingUp className={className} />;
    default: return <Sparkles className={className} />;
  }
}

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  low: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

interface KPIValue {
  value: number | string;
  formatted: string;
  change?: string;
  trend?: "up" | "down" | "neutral";
  label?: string;
  description?: string;
  icon?: IconName;
}

function buildSuggestionPrompt(args: {
  orgName?: string;
  industry?: string;
  microVertical?: string;
  goalCount: number;
  activeGoals: number;
  completedGoals: number;
  taskCount: number;
  completedTasks: number;
  memberCount: number;
  documentCount: number;
  existingKpiKeys: string[];
  triggerDetail?: string;
  triggerSource?: KPISource;
}) {
  const {
    orgName,
    industry,
    microVertical,
    goalCount,
    activeGoals,
    completedGoals,
    taskCount,
    completedTasks,
    memberCount,
    documentCount,
    existingKpiKeys,
    triggerDetail,
    triggerSource,
  } = args;

  const ctxLines = [
    `Business: ${orgName || "Unknown"}`,
    `Industry: ${industry || "general"}${microVertical ? ` (${microVertical})` : ""}`,
    `Goals: ${goalCount} total, ${activeGoals} active, ${completedGoals} completed`,
    `Tasks: ${taskCount} total, ${completedTasks} completed`,
    `Team: ${memberCount} members`,
    `Documents uploaded & analyzed: ${documentCount}`,
  ];
  if (triggerDetail) {
    ctxLines.push(`Recent event: ${triggerSource || "ai"} — ${triggerDetail}`);
  }
  if (existingKpiKeys.length) {
    ctxLines.push(`Already tracked KPIs (do NOT repeat): ${existingKpiKeys.join(", ")}`);
  }

  return `You are a KPI strategist for an executive dashboard.

Step 1 — ANALYZE the available data below. Decide whether the data is SUFFICIENT to recommend meaningful, measurable KPIs for a ${industry || "general"} business at this stage. To be sufficient you need AT LEAST 3 of: industry known, meaningful goals, real tasks, a team, OR uploaded documents describing financials / customers / sales / operations.

Step 2 — OUTPUT a single JSON object (no prose, no markdown) with this exact shape:

{
  "data_sufficient": true | false,
  "data_analysis": "<1 short sentence summarizing what data is available and what is missing>",
  "data_needs": [
    { "type": "revenue" | "customers" | "sales" | "operations" | "team" | "goals" | "tasks" | "documents" | "financials",
      "label": "<short human label, max 40 chars>",
      "description": "<1 sentence telling the user exactly what to upload or add, max 120 chars>"
    }
  ],
  "kpis": [
    {
      "key": "<snake_case unique id, e.g. customer_churn_rate>",
      "title": "<short display name, max 40 chars>",
      "category": "<one of: revenue, growth, operations, finance, sales, team, customer, product>",
      "icon": "<lucide icon name: TrendingUp, BarChart3, Target, DollarSign, Users, Activity, Zap, Flag, FileText>",
      "priority": "<high if critical, else medium>",
      "source": "<ai | document | goal | progress depending on the trigger>"
    }
  ]
}

Rules:
- If data_sufficient is false, return an EMPTY kpis array and populate data_needs with the 2-4 most impactful missing data sources (e.g. "Upload revenue/sales reports", "Add customer count or churn data", "Define at least 1 strategic goal").
- If data_sufficient is true, return 2-3 NEW KPIs in the kpis array and leave data_needs as an empty array.
- Each KPI must be specific, measurable, and meaningful for a ${industry || "general"} business at this stage. No generic vanity metrics.
- Do NOT repeat keys from: ${existingKpiKeys.length ? existingKpiKeys.join(", ") : "(none yet)"}.

Context:
${ctxLines.join("\n")}`;
}

interface DataNeed {
  type: string;
  label: string;
  description: string;
}

interface ParsedKpiResponse {
  data_sufficient: boolean;
  data_analysis: string;
  data_needs: DataNeed[];
  kpis: Record<string, unknown>[];
}

function parseAiSuggestions(raw: string): ParsedKpiResponse | null {
  if (!raw) return null;
  try {
    const trimmed = raw.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : trimmed;
    const objStart = candidate.search(/\{/);
    if (objStart === -1) return null;
    const slice = candidate.slice(objStart);
    const end = slice.lastIndexOf("}");
    const jsonText = end === -1 ? slice : slice.slice(0, end + 1);
    const parsed = JSON.parse(jsonText);
    if (!parsed || typeof parsed !== "object") return null;
    const dataNeedsRaw = Array.isArray(parsed.data_needs) ? parsed.data_needs : [];
    const kpisRaw = Array.isArray(parsed.kpis) ? parsed.kpis : [];
    return {
      data_sufficient: Boolean(parsed.data_sufficient),
      data_analysis: typeof parsed.data_analysis === "string" ? parsed.data_analysis : "",
      data_needs: dataNeedsRaw
        .filter((d: unknown): d is Record<string, unknown> => !!d && typeof d === "object")
        .map((d: Record<string, unknown>) => ({
          type: String(d.type || "documents"),
          label: String(d.label || "More data").slice(0, 60),
          description: String(d.description || "").slice(0, 200),
        })),
      kpis: kpisRaw.filter((k: unknown): k is Record<string, unknown> => !!k && typeof k === "object"),
    };
  } catch {
    return null;
  }
}

function KPISuggestionCard({
  suggestion,
  onAccept,
  onDismiss,
  busy,
}: {
  suggestion: KPISuggestion;
  onAccept: () => void;
  onDismiss: () => void;
  busy?: boolean;
}) {
  const meta = SOURCE_BADGES[suggestion.source] || SOURCE_BADGES.ai;

  return (
    <div className="group relative p-3.5 rounded-xl bg-gradient-to-br from-primary/5 to-purple-500/5 border border-primary/20 hover:border-primary/40 transition-all">
      <button
        onClick={onDismiss}
        disabled={busy}
        className="absolute top-2 right-2 p-1 rounded-md text-text-muted hover:text-foreground hover:bg-surface-light transition-colors disabled:opacity-50"
        aria-label="Dismiss suggestion"
        title="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
          <KpiIcon name={suggestion.icon} className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${meta.color}`}>
              <SourceBadgeIcon source={suggestion.source} />
              {meta.label}
            </span>
            {suggestion.priority && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${PRIORITY_STYLES[suggestion.priority] || PRIORITY_STYLES.medium}`}>
                {suggestion.priority}
              </span>
            )}
            {suggestion.category && (
              <span className="text-[10px] text-text-muted/70 capitalize">{suggestion.category}</span>
            )}
          </div>
          <p className="text-sm font-semibold text-foreground leading-tight">{suggestion.title}</p>
          {suggestion.sourceDetail && (
            <p className="text-[10px] text-text-muted/70 mt-1 truncate">↳ {suggestion.sourceDetail}</p>
          )}
          <div className="flex items-center gap-2 mt-2.5">
            <Button
              size="sm"
              variant="default"
              onClick={onAccept}
              disabled={busy}
              className="h-7 px-2.5 text-[11px]"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Add to dashboard
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onDismiss}
              disabled={busy}
              className="h-7 px-2 text-[11px] text-text-muted"
            >
              Not now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AcceptedKPITile({
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
        className="absolute top-2 right-2 p-1 rounded-md text-text-muted opacity-0 group-hover:opacity-100 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
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
        {value?.formatted || "—"}
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

export default function KPISuggestionsCard() {
  const { organization } = useOrganizationStore();
  const { goals } = useGoalStore();
  const { tasks } = useTaskStore();
  const { members } = useOrgChartStore();
  const router = useRouter();

  const orgId = organization?.id;
  const suggestionsByOrg = useKPIStore((s) => s.suggestionsByOrg);
  const acceptedByOrg = useKPIStore((s) => s.acceptedByOrg);
  const suggestions = useMemo(
    () => (orgId ? suggestionsByOrg[orgId] || EMPTY_ARRAY : EMPTY_ARRAY),
    [suggestionsByOrg, orgId]
  );
  const acceptedKPIs = useMemo(
    () => (orgId ? acceptedByOrg[orgId] || EMPTY_ARRAY : EMPTY_ARRAY),
    [acceptedByOrg, orgId]
  );
  const addSuggestions = useKPIStore((s) => s.addSuggestions);
  const acceptSuggestion = useKPIStore((s) => s.acceptSuggestion);
  const dismissSuggestion = useKPIStore((s) => s.dismissSuggestion);
  const removeKPI = useKPIStore((s) => s.removeKPI);
  const shouldSuggestNow = useKPIStore((s) => s.shouldSuggestNow);
  const markShown = useKPIStore((s) => s.markShown);

  const [values, setValues] = useState<Record<string, KPIValue>>({});
  const [valuesLoading, setValuesLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [busySuggestionId, setBusySuggestionId] = useState<string | null>(null);
  const [justAddedKey, setJustAddedKey] = useState<string | null>(null);
  const [dataNeeds, setDataNeeds] = useState<DataNeed[]>([]);
  const [dataAnalysis, setDataAnalysis] = useState<string>("");
  const [dataSufficient, setDataSufficient] = useState<boolean | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialSuggestDone = useRef(false);

  const goalCount = useMemo(() => goals.filter((g) => g.status !== "cancelled").length, [goals]);
  const activeGoals = useMemo(() => goals.filter((g) => g.status === "active").length, [goals]);
  const completedGoals = useMemo(() => goals.filter((g) => g.status === "completed").length, [goals]);

  const acceptedKeys = useMemo(() => acceptedKPIs.map((k) => k.key), [acceptedKPIs]);
  const orgName = organization?.name;
  const orgIndustry = organization?.industry;
  const orgMicroVertical = organization?.micro_vertical;

  const fetchSuggestions = useCallback(
    async (trigger?: { source: KPISource; detail?: string }) => {
      if (!orgId || suggesting) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setSuggesting(true);
        try {
          const completionRate =
            tasks.length > 0
              ? Math.round(
                  (tasks.filter((t) => t.status === "completed").length / tasks.length) * 100
                )
              : 0;

          const prompt = buildSuggestionPrompt({
            orgName,
            industry: orgIndustry,
            microVertical: orgMicroVertical,
            goalCount,
            activeGoals,
            completedGoals,
            taskCount: tasks.length,
            completedTasks: tasks.filter((t) => t.status === "completed").length,
            memberCount: members.length,
            documentCount: 0,
            existingKpiKeys: [
              ...acceptedKeys,
              "goals_active",
              "completion_rate",
              "team_size",
              "tasks_pipeline",
              "documents",
              "goal_completion_rate",
              "task_velocity",
              "team_efficiency",
            ],
            triggerDetail: trigger?.detail,
            triggerSource: trigger?.source,
          });

          const res = await fetch(`${API_URL}/executive-chat/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: prompt,
              organization_id: orgId,
              context: {
                organization: orgName,
                industry: orgIndustry,
                micro_vertical: orgMicroVertical,
                goal_count: goalCount,
                active_goals: activeGoals,
                completed_goals: completedGoals,
                task_count: tasks.length,
                member_count: members.length,
                completion_rate: completionRate,
              },
              history: [],
            }),
          });

          if (!res.ok) return;
          const data = await res.json();
          const parsed = parseAiSuggestions(data.message || "");
          if (!parsed) return;

          setDataSufficient(parsed.data_sufficient);
          setDataAnalysis(parsed.data_analysis);
          setDataNeeds(parsed.data_needs);

          if (!parsed.data_sufficient || parsed.kpis.length === 0) {
            addSuggestions(orgId, []);
            markShown(orgId);
            return;
          }

          const mapped: KPISuggestion[] = parsed.kpis
            .filter((p) => p && typeof p.key === "string" && typeof p.title === "string")
            .slice(0, 3)
            .map((p) => ({
              id: `sug-${orgId}-${p.key}-${Date.now()}`,
              key: String(p.key).toLowerCase().replace(/\s+/g, "_"),
              title: String(p.title).slice(0, 80),
              rationale: String(p.rationale || p.why || "Recommended based on your business context.").slice(0, 200),
              source: (["document", "goal", "progress", "ai"].includes(String(p.source)) ? p.source : trigger?.source || "ai") as KPISource,
              sourceDetail: trigger?.detail,
              category: typeof p.category === "string" ? p.category : undefined,
              icon: typeof p.icon === "string" ? p.icon : undefined,
              priority: (["high", "medium", "low"].includes(String(p.priority)) ? p.priority : "medium") as "high" | "medium" | "low",
              createdAt: Date.now(),
            }));

          if (mapped.length > 0) {
            addSuggestions(orgId, mapped);
            markShown(orgId);
          }
        } catch {
          // silent
        } finally {
          setSuggesting(false);
        }
      }, trigger ? 200 : SUGGEST_DEBOUNCE_MS);
    },
    [
      orgId,
      suggesting,
      orgName,
      orgIndustry,
      orgMicroVertical,
      goalCount,
      activeGoals,
      completedGoals,
      tasks,
      members.length,
      acceptedKeys,
      addSuggestions,
      markShown,
    ]
  );

  const fetchValues = useCallback(async () => {
    if (!orgId) return;
    setValuesLoading(true);
    try {
      const res = await fetch(`${API_URL}/dashboard/kpi?organization_id=${orgId}`);
      if (!res.ok) return;
      const data = await res.json();
      setValues(data || {});
    } catch {
      // silent
    } finally {
      setValuesLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    fetchValues();
  }, [orgId, fetchValues]);

  useEffect(() => {
    if (!orgId) return;
    if (initialSuggestDone.current) return;
    if (acceptedKPIs.length > 0 || suggestions.length > 0) {
      initialSuggestDone.current = true;
      return;
    }
    initialSuggestDone.current = true;
    if (shouldSuggestNow(orgId, SUGGEST_INTERVAL_MS)) {
      fetchSuggestions();
    }
  }, [orgId, acceptedKPIs.length, suggestions.length, shouldSuggestNow, fetchSuggestions]);

  useEffect(() => {
    if (!orgId) return;

    const onDocUploaded = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      fetchSuggestions({
        source: "document",
        detail: detail?.filename || "New document uploaded & analyzed",
      });
    };

    const onGoalChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      fetchSuggestions({
        source: detail?.source || "goal",
        detail: detail?.detail || "Your goals have new progress",
      });
    };

    window.addEventListener("kpi-document-uploaded", onDocUploaded);
    window.addEventListener("kpi-goal-updated", onGoalChanged);
    return () => {
      window.removeEventListener("kpi-document-uploaded", onDocUploaded);
      window.removeEventListener("kpi-goal-updated", onGoalChanged);
    };
  }, [orgId, fetchSuggestions]);

  useEffect(() => {
    if (!orgId) return;
    if (acceptedKPIs.length === 0) return;
    if (!justAddedKey) return;
    const matched = acceptedKPIs.find((k) => k.key === justAddedKey);
    if (!matched) return;
    const t = setTimeout(() => setJustAddedKey(null), 8000);
    fetchSuggestions({
      source: "progress",
      detail: `You just added "${matched.title}". Suggest 1-2 related KPIs to track alongside it.`,
    });
    return () => clearTimeout(t);
  }, [justAddedKey, acceptedKPIs, orgId, fetchSuggestions]);

  const handleAccept = useCallback(
    (suggestion: KPISuggestion) => {
      if (!orgId) return;
      setBusySuggestionId(suggestion.id);
      const accepted = acceptSuggestion(orgId, suggestion.id);
      setBusySuggestionId(null);
      if (accepted) {
        setJustAddedKey(accepted.key);
        fetchValues();
      }
    },
    [orgId, acceptSuggestion, fetchValues]
  );

  const handleDismiss = useCallback(
    (suggestion: KPISuggestion) => {
      if (!orgId) return;
      dismissSuggestion(orgId, suggestion.id);
    },
    [orgId, dismissSuggestion]
  );

  if (!orgId) return null;

  const hasContent = suggestions.length > 0 || acceptedKPIs.length > 0;
  const visibleSuggestions = suggestions.slice(0, 4);

  return (
    <Card className="border-primary/15">
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base">AI KPI Advisor</CardTitle>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {acceptedKPIs.length > 0 && (
              <Badge variant="success" className="text-[10px]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1" />
                Live
              </Badge>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => fetchSuggestions()}
              disabled={suggesting}
              className="h-7 px-2 text-[11px] text-text-muted"
              title="Ask AI for fresh KPI suggestions"
            >
              {suggesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Refresh suggestions
            </Button>
            {suggestions.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowSuggestions((v) => !v)}
                className="h-7 px-2 text-[11px] text-text-muted"
              >
                {showSuggestions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {showSuggestions ? "Hide" : "Show"} suggestions ({suggestions.length})
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {dataSufficient === false && dataNeeds.length > 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-4 h-4 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  More data needed for KPI suggestions
                </p>
                {dataAnalysis && (
                  <p className="text-[11px] text-text-muted mt-0.5">{dataAnalysis}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {dataNeeds.map((need, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 p-2.5 rounded-lg bg-surface/60 border border-border/40"
                >
                  <FileText className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground leading-tight">{need.label}</p>
                    <p className="text-[11px] text-text-muted leading-snug mt-0.5">
                      {need.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <Button
                size="sm"
                variant="default"
                onClick={() => router.push("/dashboard/data")}
                className="h-7 px-2.5 text-[11px]"
              >
                <Upload className="w-3 h-3" />
                Upload a document
                <ArrowRight className="w-3 h-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => fetchSuggestions()}
                disabled={suggesting}
                className="h-7 px-2 text-[11px] text-text-muted"
              >
                {suggesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Re-check after adding data
              </Button>
            </div>
          </div>
        )}

        {showSuggestions && visibleSuggestions.length > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
              <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                {visibleSuggestions[0].source === "document"
                  ? "Based on your newly uploaded document"
                  : visibleSuggestions[0].source === "goal"
                  ? "Based on your goal progress"
                  : "Recommended for you"}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {visibleSuggestions.map((s) => (
                <KPISuggestionCard
                  key={s.id}
                  suggestion={s}
                  busy={busySuggestionId === s.id}
                  onAccept={() => handleAccept(s)}
                  onDismiss={() => handleDismiss(s)}
                />
              ))}
            </div>
          </div>
        )}

        {acceptedKPIs.length > 0 && (
          <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-3.5 h-3.5 text-primary" />
                  <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                    Your live KPIs
                  </p>
                </div>
                <button
                  onClick={fetchValues}
                  disabled={valuesLoading}
                  className="p-1 rounded-lg hover:bg-surface-light text-text-muted hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
                  title="Refresh KPI values"
                >
                  <RefreshCw className={`w-3 h-3 ${valuesLoading ? "animate-spin" : ""}`} />
                </button>
              </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {acceptedKPIs.map((kpi) => (
                <AcceptedKPITile
                  key={kpi.id}
                  kpi={kpi}
                  value={values[kpi.key]}
                  refreshing={valuesLoading}
                  onRemove={() => removeKPI(orgId, kpi.id)}
                />
              ))}
            </div>
            {justAddedKey && (
              <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                <Check className="w-3 h-3" />
                Added! Looking for related KPIs you might also want to track…
              </p>
            )}
          </div>
        )}

        {!hasContent && (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center rounded-xl border border-dashed border-border/60 bg-surface/40">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/10 to-purple-500/10 border border-primary/20 flex items-center justify-center mb-3">
              {suggesting ? (
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
              ) : (
                <BarChart3 className="w-5 h-5 text-primary/60" />
              )}
            </div>
            <p className="text-sm font-semibold mb-1">No KPIs tracked yet</p>
            <p className="text-xs text-text-muted/80 max-w-md mb-3">
              {goalCount > 0 || tasks.length > 0 || members.length > 0
                ? "Ask the AI to suggest KPIs tailored to your goals, team, and uploaded documents."
                : "Create a goal, add team members, or upload a document first — then the AI can suggest KPIs that actually matter for your business."}
            </p>
            <Button
              size="sm"
              variant="default"
              onClick={() => fetchSuggestions()}
              disabled={suggesting}
              className="h-8 px-3 text-xs"
            >
              {suggesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              Suggest KPIs for me
            </Button>
          </div>
        )}

        {hasContent && suggestions.length === 0 && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-surface/40 border border-border/40">
            <Plus className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
            <p className="text-[11px] text-text-muted">
              Upload a document or update a goal — the AI will proactively suggest new KPIs to track.
            </p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => fetchSuggestions()}
              disabled={suggesting}
              className="h-6 px-2 text-[10px] ml-auto flex-shrink-0"
            >
              Ask for more
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
