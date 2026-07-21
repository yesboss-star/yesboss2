"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Badge } from "@/components/ui";
import { Activity, TrendingUp, Loader2, ChevronDown, ChevronRight, Plus, Check, RefreshCw } from "lucide-react";
import { useTaskStore } from "@/stores/taskStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface RecItem {
  title: string;
  body: string;
}

function splitItems(text: string): string[] {
  const parts = text.split(/\n(?:\*\*)?\d+\.(?:\*\*)?\s/);
  if (parts.length <= 1) return [];
  return parts.slice(1).map((p) => p.trim());
}

function extractTitle(block: string): string {
  const cleaned = block.replace(/\*\*/g, "").trim();
  const m = cleaned.match(/^\d+\.\s+(.+)/);
  if (!m) return block;
  return m[1].trim();
}

function stripNumber(block: string): string {
  return block.replace(/^\d+\.\s+/, "").replace(/\*\*/g, "").trim();
}

const renderMarkdownBold = (text: string) => {
  return text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
};

interface OrgHealthData {
  health_score: number;
  health_label: string;
  ai_recommendations: string;
  metrics?: {
    goal_completion_rate: number;
    task_completion_rate: number;
    avg_quality_score: number;
    overdue_tasks: number;
    escalated_tasks: number;
    open_bottlenecks: number;
    team_size: number;
    has_org_structure: boolean;
  };
}

export default function OrgHealthWidget({ orgId, compact }: { orgId?: string; compact?: boolean }) {
  const storeCreateTask = useTaskStore((s) => s.createTask);
  const [health, setHealth] = useState<OrgHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [creating, setCreating] = useState<Set<number>>(new Set());
  const [created, setCreated] = useState<Set<number>>(new Set());

  const blocks = useMemo(() => {
    const text = health?.ai_recommendations;
    if (!text) return [];
    return splitItems(text);
  }, [health?.ai_recommendations]);

  const createTask = useCallback(async (idx: number) => {
    const block = blocks[idx];
    if (!block) return;
    setCreating(prev => new Set(prev).add(idx));
    try {
      await storeCreateTask({
        title: extractTitle(block),
        description: stripNumber(block),
        priority: "medium",
        organization_id: orgId!,
      });
      setCreated(prev => new Set(prev).add(idx));
    } catch {
      // silently fail
    } finally {
      setCreating(prev => {
        const next = new Set(prev);
        next.delete(idx);
        return next;
      });
    }
  }, [orgId, blocks, storeCreateTask]);

  const refreshHealth = useCallback(() => {
    if (!orgId) return;
    setRefreshing(true);
    fetch(`${API_URL}/reports/health/${orgId}`)
      .then((r) => r.json())
      .then((data) => {
        setHealth(data.health || null);
        setRefreshing(false);
      })
      .catch(() => setRefreshing(false));
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    fetch(`${API_URL}/reports/health/${orgId}`)
      .then((r) => r.json())
      .then((data) => {
        setHealth(data.health || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [orgId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!health) return null;

  const getScoreColor = (score: number) => {
    if (score >= 80) return { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", ring: "stroke-emerald-400" };
    if (score >= 50) return { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", ring: "stroke-amber-400" };
    return { text: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/30", ring: "stroke-rose-400" };
  };

  const colors = getScoreColor(health.health_score);
  const circumference = 2 * Math.PI * 36;
  const dashOffset = circumference - (health.health_score / 100) * circumference;

  const scoreDiagnosis = (() => {
    const m = health?.metrics;
    if (!m) return "";
    const reasons: string[] = [];
    if (m.goal_completion_rate < 30) reasons.push(`only ${m.goal_completion_rate}% of goals completed`);
    if (m.task_completion_rate < 30) reasons.push(`only ${m.task_completion_rate}% of tasks completed`);
    if (m.overdue_tasks > 0) reasons.push(`${m.overdue_tasks} overdue tasks`);
    if (m.escalated_tasks > 0) reasons.push(`${m.escalated_tasks} escalated tasks`);
    if (m.avg_quality_score < 3) reasons.push(`quality score of ${m.avg_quality_score}/5`);
    if (m.open_bottlenecks > 0) reasons.push(`${m.open_bottlenecks} open bottlenecks`);
    if (reasons.length === 0) return "Your organization is on track but has room to grow.";
    return `Score is ${health?.health_score}/100 because ${reasons.join(", ")}.`;
  })();

  const renderBlocks = () => {
    if (blocks.length > 0) {
      return (
        <div className="space-y-3">
          <div className="flex items-start gap-2 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
            <span className="text-xs font-semibold text-foreground">Strategic Recommendations</span>
          </div>
          {scoreDiagnosis && (
            <p className="text-[11px] text-text-muted leading-relaxed">{scoreDiagnosis}</p>
          )}
          {blocks.map((block, i) => {
            const isCreating = creating.has(i);
            const isCreated = created.has(i);
            const title = extractTitle(block);
            const body = stripNumber(block);
            return (
              <div key={i} className="p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-xs font-semibold text-foreground" dangerouslySetInnerHTML={{ __html: renderMarkdownBold(title) }} />
                  <button
                    onClick={() => createTask(i)}
                    disabled={isCreating || isCreated}
                    className={`flex-shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer text-xs font-semibold whitespace-nowrap px-3 py-1.5 rounded-lg ${
                      isCreated
                        ? "bg-emerald-500 text-white"
                        : "bg-primary text-white hover:bg-primary/80"
                    }`}
                  >
                    {isCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isCreated ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    {isCreated ? "Task Created" : "Add as Task"}
                  </button>
                </div>
                <p className="text-[11px] text-text-muted leading-relaxed whitespace-pre-line" dangerouslySetInnerHTML={{ __html: renderMarkdownBold(body) }} />
              </div>
            );
          })}
        </div>
      );
    }
    const lines = health?.ai_recommendations?.split("\n").filter(Boolean) || [];
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
          <span className="text-xs font-semibold text-foreground">Strategic Recommendations</span>
        </div>
        {scoreDiagnosis && (
          <p className="text-[11px] text-text-muted leading-relaxed">{scoreDiagnosis}</p>
        )}
        {lines.map((point, i) => {
          const stripped = point.replace(/\*\*/g, "").trim();
          const isNumbered = /^\d+\.\s/.test(stripped);
          const isCreating = creating.has(i);
          const isCreated = created.has(i);
          return (
            <div key={i} className="flex items-start gap-2 group">
              {isNumbered && <div className="w-1.5 h-1.5 rounded-full bg-primary/60 mt-1.5 flex-shrink-0" />}
              <p className={`text-xs leading-relaxed flex-1 ${isNumbered ? "text-foreground font-semibold" : "text-text-muted"}`} dangerouslySetInnerHTML={{ __html: renderMarkdownBold(point) }} />
              {isNumbered && (
                <button
                  onClick={async () => {
                    setCreating(prev => new Set(prev).add(i));
                    try {
                      await storeCreateTask({
                        title: stripped.replace(/^\d+\.\s+/, ""),
                        priority: "medium",
                        organization_id: orgId!,
                      });
                      setCreated(prev => new Set(prev).add(i));
                    } catch {} finally {
                      setCreating(prev => {
                        const next = new Set(prev);
                        next.delete(i);
                        return next;
                      });
                    }
                  }}
                  disabled={isCreating || isCreated}
                  className={`flex-shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer text-xs font-semibold whitespace-nowrap px-3 py-1.5 rounded-lg ${
                    isCreated
                      ? "bg-emerald-500 text-white"
                      : "bg-primary text-white hover:bg-primary/80"
                  }`}
                >
                  {isCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isCreated ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                  {isCreated ? "Task Created" : "Add as Task"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  if (compact) {
    return (
      <Card className={colors.border}>
        <div className="flex items-center p-4">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer hover:bg-surface/50 transition-colors"
          >
            <div className="relative w-16 h-16 flex-shrink-0">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="36" fill="none" stroke="#1e293b" strokeWidth="6" />
                <circle cx="40" cy="40" r="36" fill="none" className={colors.ring} strokeWidth="6" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dashOffset} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-lg font-bold ${colors.text}`}>{health.health_score}</span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Activity className={`w-4 h-4 ${colors.text}`} />
                <span className="text-sm font-semibold">Org Health</span>
                <Badge variant="outline" className={`text-[10px] ${colors.bg} ${colors.text} ${colors.border}`}>
                  {health.health_label}
                </Badge>
              </div>
            </div>
            {expanded ? <ChevronDown className="w-4 h-4 text-text-muted flex-shrink-0 ml-2" /> : <ChevronRight className="w-4 h-4 text-text-muted flex-shrink-0 ml-2" />}
          </button>
          <button
            onClick={refreshHealth}
            disabled={refreshing}
            className="flex-shrink-0 p-1 rounded-md hover:bg-surface-light text-text-muted hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh health assessment"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
        {expanded && <div className="px-4 pb-4">{renderBlocks()}</div>}
      </Card>
    );
  }

  return (
    <Card className={colors.border}>
      <div className="flex items-stretch">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 min-w-0 cursor-pointer text-left"
        >
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className={`w-5 h-5 ${colors.text}`} />
                <CardTitle>Organization Health</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`text-xs ${colors.bg} ${colors.text} ${colors.border}`}>
                  {health.health_label}
                </Badge>
                {expanded ? <ChevronDown className="w-4 h-4 text-text-muted" /> : <ChevronRight className="w-4 h-4 text-text-muted" />}
              </div>
            </div>
            <CardDescription>AI-driven health assessment of your organization</CardDescription>
          </CardHeader>
        </button>
        <button
          onClick={refreshHealth}
          disabled={refreshing}
          className="flex-shrink-0 p-2 rounded-md hover:bg-surface-light text-text-muted hover:text-foreground transition-colors cursor-pointer disabled:opacity-50 self-center mr-3"
          title="Refresh health assessment"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>
      {expanded && (
        <CardContent>
          <div className="flex items-center gap-6 mb-6">
            <div className="relative w-24 h-24 flex-shrink-0">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="36" fill="none" stroke="#1e293b" strokeWidth="6" />
                <circle cx="40" cy="40" r="36" fill="none" className={colors.ring} strokeWidth="6" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dashOffset} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-2xl font-bold ${colors.text}`}>{health.health_score}</span>
              </div>
            </div>
            <div className="flex-1">
              <div className="p-3 rounded-xl bg-gradient-to-br from-primary/5 to-purple-500/5 border border-primary/20">
                <div className="flex items-start gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-xs font-semibold text-foreground">Recommendations</span>
                </div>
                {renderBlocks()}
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
