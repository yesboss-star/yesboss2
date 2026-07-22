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
  Users,
  Activity,
  Database,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from "@/components/ui";
import { useKPIStore, type KPISuggestion, type KPISource, type AcceptedKPI } from "@/stores/kpiStore";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useGoalStore } from "@/stores/goalStore";
import { useTaskStore } from "@/stores/taskStore";
import { useOrgChartStore } from "@/stores/orgChartStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const SUGGEST_INTERVAL_MS = 5 * 60 * 1000;


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
  focusKpi?: string;
  focusKpiTitle?: string;
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
    focusKpi,
    focusKpiTitle,
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
  if (focusKpi && focusKpiTitle) {
    ctxLines.push(`focus_kpi: The user uploaded data specifically to track "${focusKpiTitle}" (${focusKpi}). If the new document data supports this KPI, PRIORITIZE suggesting it.`);
  }
  if (existingKpiKeys.length) {
    ctxLines.push(`Already tracked KPIs (do NOT repeat): ${existingKpiKeys.join(", ")}`);
  }

  return `You are a KPI strategist for an executive dashboard.

Step 1 — ANALYZE the DOCUMENTS section of the context block above. Scan all document content thoroughly, including row-level data (invoice line items, opportunity rows, etc.), column headers, and any numbers present. The data likely contains transactional details with embedded numeric values. Extract the meaningful KPIs from whatever data exists — even row-level transactional data contains revenue, sales amounts, customer names, and deal values you can aggregate.

Set data_sufficient to true if documents exist and contain any numeric or financial data at all (including invoice amounts, opportunity sizes, line-item totals, quantities, dates, customer names). Only set data_sufficient to false if every document is completely empty or contains zero numbers.

Step 2 — OUTPUT a single JSON object (no prose, no markdown) with this exact shape:

{
  "data_sufficient": true | false,
  "data_analysis": "<1 short sentence summarizing what data is available and what is missing>",
  "data_needs": [
    { "type": "revenue" | "customers" | "sales" | "operations" | "team" | "goals" | "tasks" | "documents" | "financials",
      "label": "<short human label, max 40 chars>",
      "description": "<1 sentence telling the user exactly what to upload or add, max 120 chars>",
      "suggested_kpi": "<snake_case kpi key this data would unlock, e.g. revenue_growth_rate>",
      "suggested_kpi_title": "<human readable KPI title this data unlocks, max 40 chars, e.g. Revenue Growth Rate>"
    }
  ],
  "kpis": [
    {
      "key": "<snake_case unique id, e.g. customer_churn_rate>",
      "title": "<short display name, max 40 chars>",
      "value": "<current numeric value extracted from documents, e.g. 12 or '450' or '$1.2M'>",
      "formatted": "<human-readable display string, e.g. '12 contracts' or '$1.2M revenue' or '23% rate'>",
      "category": "<one of: revenue, growth, operations, finance, sales, team, customer, product>",
      "icon": "<lucide icon name: TrendingUp, BarChart3, Target, DollarSign, Users, Activity, Zap, Flag, FileText>",
      "priority": "<high if critical, else medium>",
      "source": "<ai | document | goal | progress depending on the trigger>"
    }
  ]
}

Rules:
- If data_sufficient is false, return an EMPTY kpis array and populate data_needs with the 2-4 most impactful missing data sources.
- For each data_needs item, specify what specific KPI it would unlock. Example: uploading revenue data → suggested_kpi: "revenue_growth_rate", suggested_kpi_title: "Revenue Growth Rate". Be specific to this business's actual industry and context.
- If data_sufficient is true, return 2-3 NEW KPIs in the kpis array and leave data_needs as an empty array.
- Each KPI must be specific, measurable, and meaningful for a ${industry || "general"} business at this stage. No generic vanity metrics.
- Do NOT repeat keys from: ${existingKpiKeys.length ? existingKpiKeys.join(", ") : "(none yet)"}.
- If the trigger includes a "focus_kpi" context, the user uploaded data specifically to track that KPI. Analyze the new document data and if it supports that KPI, PRIORITIZE suggesting it.

Context:
${ctxLines.join("\n")}`;
}

interface DataNeed {
  type: string;
  label: string;
  description: string;
  suggested_kpi?: string;
  suggested_kpi_title?: string;
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
          suggested_kpi: typeof d.suggested_kpi === "string" ? d.suggested_kpi : undefined,
          suggested_kpi_title: typeof d.suggested_kpi_title === "string" ? d.suggested_kpi_title : undefined,
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
          {suggestion.formatted && (
            <p className="text-lg font-bold text-foreground mt-0.5">{suggestion.formatted}</p>
          )}
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

export default function KPISuggestionsCard() {
  const { organization } = useOrganizationStore();
  const { goals } = useGoalStore();
  const { tasks } = useTaskStore();
  const { members } = useOrgChartStore();
  const router = useRouter();

  const orgId = organization?.id;
  const suggestionsByOrg = useKPIStore((s) => s.suggestionsByOrg);
  const acceptedByOrg = useKPIStore((s) => s.acceptedByOrg);
  const suggestions = useMemo<KPISuggestion[]>(
    () => (orgId ? suggestionsByOrg[orgId] || [] : []),
    [suggestionsByOrg, orgId]
  );
  const acceptedKPIs = useMemo<AcceptedKPI[]>(
    () => (orgId ? acceptedByOrg[orgId] || [] : []),
    [acceptedByOrg, orgId]
  );
  const addSuggestions = useKPIStore((s) => s.addSuggestions);
  const acceptSuggestion = useKPIStore((s) => s.acceptSuggestion);
  const dismissSuggestion = useKPIStore((s) => s.dismissSuggestion);
  const shouldSuggestNow = useKPIStore((s) => s.shouldSuggestNow);
  const markShown = useKPIStore((s) => s.markShown);
  const setDataNeeds = useKPIStore((s) => s.setDataNeeds);
  const setDataSufficient = useKPIStore((s) => s.setDataSufficient);
  const setDataAnalysis = useKPIStore((s) => s.setDataAnalysis);
  const storeDataNeeds = useKPIStore((s) => orgId ? s.dataNeedsByOrg[orgId] : undefined);
  const storeDataSufficient = useKPIStore((s) => orgId ? s.dataSufficientByOrg[orgId] : undefined);
  const storeDataAnalysis = useKPIStore((s) => orgId ? s.dataAnalysisByOrg[orgId] : undefined);

  const [values, setValues] = useState<Record<string, KPIValue>>({});
  const [valuesLoading, setValuesLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [busySuggestionId, setBusySuggestionId] = useState<string | null>(null);
  const [justAddedKey, setJustAddedKey] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const initialSuggestDone = useRef(false);
  const pendingUploadKpiRef = useRef<{ kpi?: string; kpiTitle?: string }>({});

  useEffect(() => {
    if (!suggesting) { setElapsed(0); return; }
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [suggesting]);

  const goalCount = useMemo(() => goals.filter((g) => g.status !== "cancelled").length, [goals]);
  const activeGoals = useMemo(() => goals.filter((g) => g.status === "active").length, [goals]);
  const completedGoals = useMemo(() => goals.filter((g) => g.status === "completed").length, [goals]);

  const acceptedKeys = useMemo<string[]>(() => acceptedKPIs.map((k) => k.key), [acceptedKPIs]);
  const orgName = organization?.name;
  const orgIndustry = organization?.industry;
  const orgMicroVertical = organization?.micro_vertical;

  const fetchSuggestions = useCallback(
    async (trigger?: { source: KPISource; detail?: string; suggestedKpi?: string; suggestedKpiTitle?: string }) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);

      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const cancelSignal = abortRef.current.signal;

      const doFetch = async () => {
        const id = useOrganizationStore.getState().organization?.id;
        if (!id) { return; }
        setSuggesting(true);
        const safetyTimer = setTimeout(() => {
          if (mountedRef.current) setSuggesting(false);
        }, 30000);
        let fetchTimeout: ReturnType<typeof setTimeout> | undefined;
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
            documentCount: docCount,
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
            focusKpi: trigger?.suggestedKpi,
            focusKpiTitle: trigger?.suggestedKpiTitle,
          });

          fetchTimeout = setTimeout(() => abortRef.current?.abort(), 90000);
          const res = await fetch(`${API_URL}/strategy-chat/chat`, {
            signal: cancelSignal,
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: prompt,
              organization_id: id,
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

          if (!res.ok) {
            console.warn(`[KPI] API returned ${res.status}`);
            return;
          }
          const data = await res.json();
          const rawMsg = data.message || "";
          const parsed = parseAiSuggestions(rawMsg);
          if (!parsed) {
            console.warn("[KPI] parseAiSuggestions returned null, raw:", rawMsg.slice(0, 500));
            return;
          }

          if (id) {
            setDataSufficient(id, parsed.data_sufficient);
            setDataAnalysis(id, parsed.data_analysis);
            setDataNeeds(id, parsed.data_needs);
          }

          if (!parsed.data_sufficient || parsed.kpis.length === 0) {
            if (!parsed.data_sufficient) console.warn("[KPI] AI says data insufficient:", parsed.data_analysis);
            else console.warn("[KPI] AI returned 0 KPIs");
            addSuggestions(id, []);
            markShown(id);
            return;
          }

          const mapped: KPISuggestion[] = parsed.kpis
            .filter((p) => p && typeof p.key === "string" && typeof p.title === "string")
            .slice(0, 3)
            .map((p) => ({
              id: `sug-${id}-${p.key}-${Date.now()}`,
              key: String(p.key).toLowerCase().replace(/\s+/g, "_"),
              title: String(p.title).slice(0, 80),
              rationale: String(p.rationale || p.why || "Recommended based on your business context.").slice(0, 200),
              source: (["document", "goal", "progress", "ai"].includes(String(p.source)) ? p.source : trigger?.source || "ai") as KPISource,
              sourceDetail: trigger?.detail,
              category: typeof p.category === "string" ? p.category : undefined,
              icon: typeof p.icon === "string" ? p.icon : undefined,
              priority: (["high", "medium", "low"].includes(String(p.priority)) ? p.priority : "medium") as "high" | "medium" | "low",
              value: typeof p.value === "number" || typeof p.value === "string" ? p.value : undefined,
              formatted: p.formatted ? String(p.formatted).slice(0, 60) : undefined,
              createdAt: Date.now(),
            }));

          if (mapped.length > 0) {
            addSuggestions(id, mapped);
            markShown(id);
          }
        } catch (err) {
          const isAbort = err instanceof DOMException && (err.name === "AbortError" || err.name === "TimeoutError");
          if (isAbort) {
            console.warn("[KPI] fetch suggestions request aborted/timeout");
          } else {
            console.warn("[KPI] fetchSuggestions error:", err);
          }
        } finally {
          clearTimeout(safetyTimer);
          clearTimeout(fetchTimeout);
          setSuggesting(false);
        }
      };

      if (trigger) {
        debounceRef.current = setTimeout(doFetch, 200);
      } else {
        doFetch();
      }
    },
    [
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
      const accepted = useKPIStore.getState().acceptedByOrg[orgId] || [];
      let url = `${API_URL}/dashboard/kpi?organization_id=${encodeURIComponent(orgId)}`;
      if (accepted.length > 0) {
        url += `&accepted_kpis=${encodeURIComponent(JSON.stringify(accepted.map(k => ({ key: k.key, title: k.title }))))}`;
      }
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[KPI] fetchValues API returned ${res.status}`);
        return;
      }
      const data = await res.json();
      setValues(data || {});
    } catch (err) {
      console.warn("[KPI] fetchValues error:", err);
    } finally {
      setValuesLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    fetchValues();
    const interval = setInterval(fetchValues, 30000);
    return () => clearInterval(interval);
  }, [orgId, fetchValues]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const readinessChecks = useMemo(() => {
    const docCount = Number(values.documents?.value || 0);
    return [
      { key: "org_chart", label: "Org chart", met: members.length > 0, detail: members.length > 0 ? `${members.length} team members` : "No team members yet", icon: Users },
      { key: "goals", label: "Goals defined", met: goalCount >= 1, detail: goalCount > 0 ? `${goalCount} goals (${activeGoals} active)` : "No goals yet", icon: Target },
      { key: "tasks", label: "Tasks created", met: tasks.length > 0, detail: tasks.length > 0 ? `${tasks.length} tasks` : "No tasks yet", icon: Activity },
      { key: "documents", label: "Uploaded data", met: docCount > 0, detail: docCount > 0 ? `${docCount} document(s)` : "No documents uploaded", icon: FileText },
      { key: "industry", label: "Industry info", met: !!orgIndustry, detail: orgIndustry || "Not configured", icon: Database },
    ];
  }, [members, goalCount, activeGoals, tasks, values, orgIndustry]);

  const [fallbackDocCount, setFallbackDocCount] = useState<number | null>(null);
  useEffect(() => {
    if (!orgId) return;
    fetch(`${API_URL}/dashboard/document-count?organization_id=${encodeURIComponent(orgId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && typeof d.count === "number") setFallbackDocCount(d.count); })
      .catch(() => {});
  }, [orgId]);

  const docCount = Number(values.documents?.value ?? fallbackDocCount ?? 0);
  const docCountRef = useRef(docCount);
  docCountRef.current = docCount;
  const readinessMet = useMemo(() => readinessChecks.filter(c => c.met).length, [readinessChecks]);
  const readyForSuggestions = docCount > 0;

  const handleFileUpload = useCallback(async (file: File) => {
    if (!orgId) return;
    setUploading(true);
    const { kpi, kpiTitle } = pendingUploadKpiRef.current;
    pendingUploadKpiRef.current = {};
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("organization_id", orgId);
      await fetch(`${API_URL}/strategy-chat/upload-and-analyze`, {
        method: "POST",
        body: formData,
      });
      window.dispatchEvent(new CustomEvent("kpi-document-uploaded", {
        detail: {
          filename: file.name,
          suggested_kpi: kpi,
          suggested_kpi_title: kpiTitle,
        },
      }));
      await fetchValues();
    } catch {
      // silent
    } finally {
      setUploading(false);
    }
  }, [orgId, fetchValues]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFileUpload(f);
  }, [handleFileUpload]);

  useEffect(() => {
    if (!orgId) return;
    if (initialSuggestDone.current) return;
    initialSuggestDone.current = true;
  }, [orgId]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (!orgId) return;

    const onDocUploaded = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      fetchSuggestions({
        source: "document",
        detail: detail?.filename || "New document uploaded & analyzed",
        suggestedKpi: detail?.suggested_kpi,
        suggestedKpiTitle: detail?.suggested_kpi_title,
      });
    };

    const onGoalChanged = (e: Event) => {
      if (docCountRef.current === 0) return;
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

  const hasContent = acceptedKPIs.length > 0 || (readyForSuggestions && suggestions.length > 0);
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
              disabled={false}
              className="h-7 px-2 text-[11px] text-text-muted"
              title="Ask AI for fresh KPI suggestions"
            >
              {suggesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              {suggesting ? `AI analyzing... ${elapsed}s` : "Refresh suggestions"}
            </Button>
            {hasContent && suggestions.length > 0 && (
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
        {storeDataSufficient === false && storeDataNeeds && storeDataNeeds.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-4 h-4 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  Upload data to unlock specific KPIs
                </p>
                {storeDataAnalysis && (
                  <p className="text-[11px] text-text-muted mt-0.5">{storeDataAnalysis}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {storeDataNeeds.map((need, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border/50 bg-surface/30 p-4 space-y-3"
                >
                  {need.suggested_kpi_title ? (
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/10 to-purple-500/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                        <Target className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-text-muted/70 font-medium uppercase tracking-wider">To track</p>
                        <p className="text-sm font-semibold text-foreground leading-tight mt-0.5">
                          {need.suggested_kpi_title}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      <p className="text-sm font-semibold text-foreground">{need.label}</p>
                    </div>
                  )}
                  <p className="text-[11px] text-text-muted leading-snug">
                    {need.description}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (need.suggested_kpi) {
                        try {
                          sessionStorage.setItem("pendingKpiContext", JSON.stringify({
                            kpi: need.suggested_kpi,
                            kpiTitle: need.suggested_kpi_title || need.suggested_kpi,
                          }));
                        } catch {}
                      }
                      router.push("/dashboard/data");
                    }}
                    className="h-7 px-2.5 text-[10px] w-full"
                  >
                    <Upload className="w-3 h-3" />
                    Upload file to track this KPI
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => fetchSuggestions()}
                disabled={false}
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

        {!hasContent && !suggesting && (!storeDataNeeds || storeDataNeeds.length === 0) && (
          <div className="flex flex-col items-center justify-center py-10 px-6 text-center rounded-xl border border-dashed border-border/60 bg-surface/40">
            {docCount === 0 ? (
              <>
                <BarChart3 className="w-10 h-10 text-primary/40 mb-4" />
                <p className="text-sm font-semibold mb-1">Upload data to get KPI suggestions</p>
                <p className="text-xs text-text-muted/80 max-w-sm mb-4">
                  Upload your business data (CSV, PDF, Excel) in the Data section first.
                  The AI will analyze it and recommend KPIs tailored to your actual numbers.
                </p>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => router.push("/dashboard/data")}
                  className="h-8 px-4 text-xs"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Go to Data
                </Button>
              </>
            ) : (
              <>
                <Check className="w-10 h-10 text-emerald-400 mb-4" />
                <p className="text-sm font-semibold mb-1">Data uploaded</p>
                <p className="text-xs text-text-muted/80 max-w-sm mb-4">
                  Your data is ready. Generate AI-powered KPI suggestions based on what you uploaded?
                </p>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => fetchSuggestions()}
                  disabled={false}
                  className="h-8 px-4 text-xs"
                >
                  {suggesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {suggesting ? "Generating..." : "Suggest KPIs"}
                </Button>
              </>
            )}
          </div>
        )}

        {!hasContent && suggesting && (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center rounded-xl border border-dashed border-border/60 bg-surface/40">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/10 to-purple-500/10 border border-primary/20 flex items-center justify-center mb-3">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            </div>
            <p className="text-sm font-semibold mb-1">Analyzing your data...</p>
            <p className="text-xs text-text-muted/80 max-w-md">
              The AI is reviewing your organization data to suggest the most relevant KPIs.
            </p>
          </div>
        )}

        {hasContent && suggestions.length === 0 && storeDataSufficient !== false && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-surface/40 border border-border/40">
            <Plus className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
            <p className="text-[11px] text-text-muted">
              Upload a document or update a goal — the AI will proactively suggest new KPIs to track.
            </p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => fetchSuggestions()}
              disabled={false}
              className="h-6 px-2 text-[10px] ml-auto flex-shrink-0"
            >
              Ask for more
            </Button>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt,.csv,.xlsx,.xls,.png,.jpg,.jpeg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFileUpload(f);
          }}
        />
      </CardContent>
    </Card>
  );
}
