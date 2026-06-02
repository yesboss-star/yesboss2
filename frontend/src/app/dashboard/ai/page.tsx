"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useUIStore } from "@/stores/uiStore";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useDocumentStore, DocumentContext } from "@/stores/documentStore";
import { useDashboardStore, DashboardInsight } from "@/stores/dashboardStore";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from "@/components/ui";
import { 
  Sparkles, 
  TrendingUp, 
  TrendingDown, 
  ArrowRight, 
  Activity,
  DollarSign,
  Users,
  Workflow,
  Gauge,
  Target,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  BarChart3,
  PieChart,
  LineChart,
  RefreshCw,
  FileText,
  Brain,
  ChevronDown,
  ChevronUp,
  Briefcase,
} from "lucide-react";

const MODULE_ICONS: Record<string, any> = {
  founder: Target,
  finance: DollarSign,
  operations: Activity,
  productivity: Users,
  workflow: Workflow,
};

const PRIORITY_COLORS = {
  success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  info: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  danger: "bg-red-500/10 text-red-400 border-red-500/20",
};

const PRIORITY_ICONS = {
  success: CheckCircle2,
  warning: AlertTriangle,
  info: Info,
  danger: AlertTriangle,
};

export default function AIDashboardPage() {
  const { user, role, loading: authLoading } = useAuth();
  const router = useRouter();
  const { setBreadcrumbs } = useUIStore();
  const { organization } = useOrganizationStore();
  const { 
    insights, 
    modules, 
    currentModule, 
    moduleMetrics,
    loading,
    fetchInsights, 
    fetchModules, 
    fetchModuleMetrics,
    setCurrentModule
  } = useDashboardStore();
  const { context: docContext, fetchContext: fetchDocContext, contextLoading: docContextLoading } =
    useDocumentStore();
  const [activeTab, setActiveTab] = useState<"overview" | "insights" | "modules">("overview");
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([
      { label: "Dashboard", href: "/dashboard" },
      { label: "AI Dashboard" },
    ]);
  }, [setBreadcrumbs]);

  useEffect(() => {
    if (!authLoading) {
      if (!user) router.push("/login");
      else if (role === "owner" && !organization) router.push("/onboarding/owner");
      else if (role === "employee" && !organization) router.push("/onboarding/employee");
    }
  }, [user, role, authLoading, router, organization]);

  useEffect(() => {
    const industry = organization?.industry || "technology";
    fetchModules(industry);
    fetchInsights(industry);
    fetchModuleMetrics(currentModule);
  }, [organization?.industry]);

  useEffect(() => {
    fetchModuleMetrics(currentModule);
    fetchInsights(organization?.industry, currentModule);
  }, [currentModule, organization?.industry]);

  useEffect(() => {
    const orgId = organization?.id;
    if (orgId) {
      fetchDocContext(orgId);
    }
    // Poll every 8s for a short while if any docs are still being analyzed.
  }, [organization?.id]);

  useEffect(() => {
    if (!docContext || docContext.pending_documents === 0) return;
    const orgId = organization?.id;
    if (!orgId) return;
    const handle = setInterval(() => {
      fetchDocContext(orgId);
    }, 8000);
    return () => clearInterval(handle);
  }, [docContext?.pending_documents, organization?.id]);

  const getInsightIcon = (type: string) => {
    switch (type) {
      case "growth": return TrendingUp;
      case "risk": return AlertTriangle;
      case "action": return Zap;
      case "positive": return CheckCircle2;
      case "efficiency": return Activity;
      case "alert": return AlertTriangle;
      default: return Info;
    }
  };

  const filteredInsights = currentModule === "all" 
    ? insights 
    : insights.filter(i => i.category === currentModule);

  const groupedInsights = filteredInsights.reduce((acc, insight) => {
    if (!acc[insight.priority]) acc[insight.priority] = [];
    acc[insight.priority].push(insight);
    return acc;
  }, {} as Record<string, DashboardInsight[]>);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">AI Dashboard</h1>
              <p className="text-text-muted">
                Powered by {organization?.name || "your organization"}'s intelligence
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="cursor-pointer">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button size="sm" className="cursor-pointer">
              Export Report
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 p-1 bg-surface rounded-xl w-fit">
          {["overview", "insights", "modules"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                activeTab === tab 
                  ? "bg-primary text-white" 
                  : "text-text-muted hover:text-foreground"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-1 space-y-2">
            <button
              key="all"
              onClick={() => setCurrentModule("all")}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer ${
                currentModule === "all"
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "hover:bg-surface text-text-muted hover:text-foreground"
              }`}
            >
              <BarChart3 className="w-5 h-5" />
              <span className="text-sm font-medium">All Modules</span>
              <Badge variant="secondary" className="ml-auto text-xs">
                {insights.length}
              </Badge>
            </button>
            {modules.map((module) => {
              const Icon = MODULE_ICONS[module.id] || Target;
              return (
                <button
                  key={module.id}
                  onClick={() => setCurrentModule(module.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer ${
                    currentModule === module.id
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "hover:bg-surface text-text-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-sm font-medium">{module.title}</span>
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {module.insights_count}
                  </Badge>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-4 space-y-6">
            {activeTab === "overview" && (
              <>
                {docContext && docContext.total_documents > 0 && (
                  <Card className="border-primary/20">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-primary" />
                        Your documents
                        <Badge variant="secondary" className="ml-2">
                          {docContext.analyzed_documents}/{docContext.total_documents} analyzed
                        </Badge>
                        {docContextLoading && (
                          <Loader2 className="w-4 h-4 text-text-muted animate-spin ml-auto" />
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {docContext.metrics.length > 0 && (
                        <div>
                          <div className="text-xs uppercase tracking-wider text-text-muted mb-2 flex items-center gap-1">
                            <BarChart3 className="w-3 h-3" /> Key metrics from your files
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {docContext.metrics.slice(0, 6).map((m, i) => (
                              <div
                                key={i}
                                className="rounded-lg bg-surface/60 border border-border p-3"
                              >
                                <div className="text-[10px] uppercase tracking-wider text-text-muted">
                                  {m.name}
                                </div>
                                <div className="text-lg font-bold text-foreground mt-0.5">
                                  {m.value}
                                </div>
                                {m.context && (
                                  <div className="text-[11px] text-text-muted mt-0.5 line-clamp-2">
                                    {m.context}
                                  </div>
                                )}
                                <div className="text-[10px] text-text-muted/70 mt-1 truncate">
                                  from {m.source_file}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <div className="text-xs uppercase tracking-wider text-text-muted mb-2 flex items-center gap-1">
                          <Brain className="w-3 h-3" /> Analyzed documents
                        </div>
                        <div className="space-y-2">
                          {docContext.documents.slice(0, 6).map((d) => {
                            const isOpen = expandedDoc === d.file_id;
                            return (
                              <div
                                key={d.file_id}
                                className="rounded-lg border border-border bg-surface/40 overflow-hidden"
                              >
                                <button
                                  onClick={() =>
                                    setExpandedDoc(isOpen ? null : d.file_id)
                                  }
                                  className="w-full p-3 flex items-center gap-3 hover:bg-surface-light transition-colors text-left cursor-pointer"
                                >
                                  <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                                    {d.insights_status === "completed" ? (
                                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                    ) : d.insights_status === "pending" ? (
                                      <Loader2 className="w-4 h-4 text-primary animate-spin" />
                                    ) : (
                                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate">
                                      {d.filename}
                                    </div>
                                    {d.summary && (
                                      <div className="text-xs text-text-muted line-clamp-1">
                                        {d.summary}
                                      </div>
                                    )}
                                  </div>
                                  <Badge variant="secondary" className="text-[10px] capitalize">
                                    {d.document_category.replace(/_/g, " ")}
                                  </Badge>
                                  {isOpen ? (
                                    <ChevronUp className="w-4 h-4 text-text-muted" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4 text-text-muted" />
                                  )}
                                </button>
                                {isOpen && d.insights_status === "completed" && (
                                  <div className="p-3 border-t border-border bg-surface/20 space-y-3">
                                    {d.summary && (
                                      <div>
                                        <div className="text-[10px] uppercase tracking-wider text-text-muted">
                                          Summary
                                        </div>
                                        <p className="text-xs text-foreground mt-1">
                                          {d.summary}
                                        </p>
                                      </div>
                                    )}
                                    {d.key_metrics.length > 0 && (
                                      <div>
                                        <div className="text-[10px] uppercase tracking-wider text-text-muted">
                                          Key metrics
                                        </div>
                                        <ul className="text-xs space-y-1 mt-1">
                                          {d.key_metrics.slice(0, 6).map((m, i) => (
                                            <li key={i}>
                                              <span className="text-text-muted">{m.name}:</span>{" "}
                                              <span className="font-medium">{m.value}</span>
                                              {m.context && (
                                                <span className="text-text-muted/70">
                                                  {" "}
                                                  — {m.context}
                                                </span>
                                              )}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    {d.decisions.length > 0 && (
                                      <div>
                                        <div className="text-[10px] uppercase tracking-wider text-text-muted">
                                          Decisions
                                        </div>
                                        <ul className="text-xs space-y-1 mt-1">
                                          {d.decisions.map((x, i) => (
                                            <li key={i} className="text-foreground">
                                              • {x}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    {d.action_items.length > 0 && (
                                      <div>
                                        <div className="text-[10px] uppercase tracking-wider text-text-muted">
                                          Action items
                                        </div>
                                        <ul className="text-xs space-y-1 mt-1">
                                          {d.action_items.map((x, i) => (
                                            <li key={i} className="text-foreground">
                                              • {x}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                )}
                                {isOpen && d.insights_status === "pending" && (
                                  <div className="p-3 border-t border-border bg-surface/20 text-xs text-text-muted flex items-center gap-2">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    AI is analyzing this document in the background. Refresh in a
                                    moment.
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {Object.keys(moduleMetrics).length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {Object.entries(moduleMetrics).map(([key, metric]) => (
                      <Card key={key} className="card-hover">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-text-muted uppercase tracking-wide">
                              {key.replace(/_/g, " ")}
                            </span>
                            <div className={`flex items-center gap-1 text-xs ${
                              metric.trend === "up" ? "text-emerald-400" : "text-red-400"
                            }`}>
                              {metric.trend === "up" ? (
                                <TrendingUp className="w-3 h-3" />
                              ) : (
                                <TrendingDown className="w-3 h-3" />
                              )}
                              {Math.abs(metric.change)}%
                            </div>
                          </div>
                          <div className="text-2xl font-bold">{metric.value}</div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {Object.entries(groupedInsights).map(([priority, priorityInsights]) => (
                    <Card key={priority}>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          {(() => {
                            const Icon = PRIORITY_ICONS[priority as keyof typeof PRIORITY_ICONS];
                            return <Icon className={`w-5 h-5 ${
                              priority === "success" ? "text-emerald-400" :
                              priority === "warning" ? "text-amber-400" :
                              priority === "danger" ? "text-red-400" : "text-cyan-400"
                            }`} />;
                          })()}
                          <span className="capitalize">{priority} ({priorityInsights.length})</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {priorityInsights.slice(0, 3).map((insight) => {
                          const Icon = getInsightIcon(insight.type);
                          return (
                            <div key={insight.id} className="flex items-start gap-3 p-3 rounded-lg bg-surface hover:bg-surface-light transition-colors cursor-pointer">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                priority === "success" ? "bg-emerald-500/10" :
                                priority === "warning" ? "bg-amber-500/10" :
                                priority === "danger" ? "bg-red-500/10" : "bg-cyan-500/10"
                              }`}>
                                <Icon className={`w-4 h-4 ${
                                  priority === "success" ? "text-emerald-400" :
                                  priority === "warning" ? "text-amber-400" :
                                  priority === "danger" ? "text-red-400" : "text-cyan-400"
                                }`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{insight.title}</p>
                                <p className="text-xs text-text-muted line-clamp-2 mt-0.5">{insight.description}</p>
                              </div>
                            </div>
                          );
                        })}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}

            {activeTab === "insights" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">AI Insights</h2>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{filteredInsights.length} total</Badge>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredInsights.map((insight) => {
                    const Icon = getInsightIcon(insight.type);
                    const PriorityIcon = PRIORITY_ICONS[insight.priority as keyof typeof PRIORITY_ICONS];
                    return (
                      <Card key={insight.id} className="card-hover">
                        <CardContent className="p-5">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                <Icon className="w-5 h-5 text-primary" />
                              </div>
                              <div>
                                <h3 className="font-medium">{insight.title}</h3>
                                <p className="text-xs text-text-muted capitalize">{insight.category}</p>
                              </div>
                            </div>
                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${PRIORITY_COLORS[insight.priority]}`}>
                              {insight.priority}
                            </span>
                          </div>
                          <p className="text-sm text-text-muted mb-4">{insight.description}</p>
                          {insight.action_items && insight.action_items.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {insight.action_items.map((item, i) => (
                                <Badge key={i} variant="outline" className="text-xs cursor-pointer">
                                  {item}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === "modules" && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {modules.map((module) => {
                  const Icon = MODULE_ICONS[module.id] || Target;
                  return (
                    <Card key={module.id} className="card-hover cursor-pointer" onClick={() => setCurrentModule(module.id)}>
                      <CardContent className="p-5">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center">
                            <Icon className="w-6 h-6 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-semibold">{module.title}</h3>
                            <p className="text-xs text-text-muted">{module.insights_count} insights</p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {module.metrics.slice(0, 3).map((metric) => (
                            <div key={metric} className="flex items-center justify-between text-sm">
                              <span className="text-text-muted capitalize">{metric.replace(/_/g, " ")}</span>
                              <div className="flex items-center gap-1">
                                <div className="w-16 h-1.5 bg-surface rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-primary rounded-full" 
                                    style={{ width: `${Math.random() * 60 + 40}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}