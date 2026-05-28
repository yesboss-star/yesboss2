"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useGoalStore } from "@/stores/goalStore";
import { useMarketTrendsStore } from "@/stores/marketTrendsStore";
import { useReportStore } from "@/stores/reportStore";
import { useAIDashboardAdaptation, type OrgStage } from "@/hooks/useAIDashboardAdaptation";
import {
  Sparkles,
  Flag,
  Calendar,
  Clock,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Shield,
  MessageSquare,
  FileText,
  Download,
  Send,
  Loader2,
  Newspaper,
  ExternalLink,
  BarChart3,
  Target,
  Zap,
  Activity,
  Bell,
  ChevronRight,
  AlertTriangle,
  Info,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Button,
  Input,
} from "@/components/ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

function EmptyStateTemplate({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/10 to-purple-500/10 flex items-center justify-center mb-3 border border-primary/20">
        <BarChart3 className="w-6 h-6 text-primary/60" />
      </div>
      <h3 className="text-sm font-semibold text-text-muted mb-1">{title}</h3>
      <p className="text-xs text-text-muted/60 max-w-xs">{hint}</p>
    </div>
  );
}

function GoalSection() {
  const { organization } = useOrganizationStore();
  const { goals, fetchGoals } = useGoalStore();
  const orgId = organization?.id;

  useEffect(() => {
    if (orgId) fetchGoals(orgId);
  }, [orgId, fetchGoals]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "text-emerald-400 bg-emerald-500/10";
      case "active": return "text-primary bg-primary/10";
      default: return "text-yellow-400 bg-yellow-500/10";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent": return "text-rose-400 bg-rose-500/10 border-rose-500/20";
      case "high": return "text-orange-400 bg-orange-500/10 border-orange-500/20";
      case "medium": return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
      default: return "text-gray-400 bg-gray-500/10 border-gray-500/20";
    }
  };

  if (goals.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Flag className="w-5 h-5 text-primary" />
            <CardTitle>Goals</CardTitle>
          </div>
          <CardDescription>Track your business goals and pipeline</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyStateTemplate
            title="No goals yet"
            hint="Create goals from the dashboard to start tracking your business objectives. You can add title, description, priority, timeline, and assign to departments."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flag className="w-5 h-5 text-primary" />
            <CardTitle>Goals Pipeline</CardTitle>
          </div>
          <Badge variant="outline" className="text-xs">
            {goals.filter((g) => g.status === "active").length} active
          </Badge>
        </div>
        <CardDescription>Real-time status of your business goals</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {goals.map((goal) => (
            <div
              key={goal.id}
              className="flex items-center gap-4 p-4 rounded-xl bg-surface hover:bg-surface-light transition-all border border-border/50"
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  goal.status === "completed"
                    ? "bg-emerald-500/10"
                    : goal.status === "active"
                    ? "bg-primary/10"
                    : "bg-yellow-500/10"
                }`}
              >
                {goal.status === "completed" ? (
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                ) : goal.status === "active" ? (
                  <Clock className="w-5 h-5 text-primary" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-yellow-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium truncate">{goal.title}</p>
                  {goal.status === "active" && (
                    <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
                      <Bell className="w-3 h-3" />
                      In progress
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-text-muted mt-1">
                  {goal.department && (
                    <span className="capitalize px-2 py-0.5 rounded-full bg-surface border border-border/50">
                      {goal.department}
                    </span>
                  )}
                  {goal.timeline && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {goal.timeline.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getPriorityColor(goal.priority)}`}
              >
                {goal.priority}
              </span>
              <div className="w-20">
                <div className="flex items-center gap-1">
                  <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        goal.status === "completed"
                          ? "bg-emerald-400"
                          : goal.status === "active"
                          ? "bg-primary"
                          : "bg-yellow-400"
                      }`}
                      style={{
                        width: goal.status === "completed" ? "100%" : goal.status === "active" ? "60%" : "20%",
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-text-muted w-6 text-right">
                    {goal.status === "completed" ? "100%" : goal.status === "active" ? "60%" : "20%"}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AISummaryChat() {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([
    {
      role: "assistant",
      content:
        "Hello! I'm your AI Business Analyst powered by Grok. I can analyze your business data, answer questions about goals, tasks, and provide strategic insights. What would you like to know?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const { organization } = useOrganizationStore();

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const history = messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      }));

      const response = await fetch(`${API_URL}/executive-chat/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          context: {
            organization: organization?.name,
            industry: organization?.industry,
          },
          history,
        }),
      });

      if (!response.ok) throw new Error("Chat failed");

      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.message || "I've analyzed your query. Here are my insights...",
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "I'm having trouble connecting to my analysis engine. Please try again or check your connection.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          <CardTitle>AI Business Analysis</CardTitle>
          <Badge variant="default" className="text-[10px] ml-2">
            Powered by Grok
          </Badge>
        </div>
        <CardDescription>
          Ask questions about your business data, goals, and get AI-powered insights
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-64 overflow-y-auto space-y-3 mb-4 pr-2 custom-scrollbar">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 ${
                msg.role === "user" ? "flex-row-reverse" : ""
              }`}
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  msg.role === "user"
                    ? "bg-gradient-to-br from-primary to-purple-500"
                    : "bg-surface border border-border/50"
                }`}
              >
                {msg.role === "user" ? (
                  <span className="text-white font-bold text-xs">U</span>
                ) : (
                  <Sparkles className="w-4 h-4 text-primary" />
                )}
              </div>
              <div
                className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                  msg.role === "user"
                    ? "bg-gradient-to-br from-primary/20 to-purple-500/20 text-foreground"
                    : "bg-surface border border-border/50 text-text-muted"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-text-muted text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing your business data...
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your business..."
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            icon={<MessageSquare className="w-4 h-4 text-text-muted" />}
          />
          <Button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            size="icon"
            className="cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function WeeklyReportGenerator() {
  const { currentReport, generating, downloading, generateReport, downloadReport } =
    useReportStore();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          <CardTitle>Weekly Report Generator</CardTitle>
        </div>
        <CardDescription>
          Generate and download comprehensive business reports
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-br from-primary/5 to-purple-500/5 border border-primary/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Weekly Business Report</p>
              <p className="text-xs text-text-muted">
                Goals, tasks, department breakdown, and completion rates
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => generateReport("weekly")}
              disabled={generating}
              className="cursor-pointer"
              size="sm"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <Zap className="w-4 h-4 mr-1" />
              )}
              {generating ? "Generating..." : "Generate"}
            </Button>
            {currentReport && (
              <Button
                onClick={() => downloadReport(currentReport.id)}
                disabled={downloading}
                variant="outline"
                size="sm"
                className="cursor-pointer"
              >
                <Download className="w-4 h-4 mr-1" />
                {downloading ? "Downloading..." : "Download PDF"}
              </Button>
            )}
          </div>
        </div>
        {currentReport && (
          <div className="mt-3 grid grid-cols-4 gap-3">
            {[
              { label: "Active Goals", value: currentReport.summary.active_goals, icon: Target, color: "text-primary" },
              { label: "Tasks Done", value: currentReport.summary.completed_tasks, icon: CheckCircle, color: "text-emerald-400" },
              { label: "Team Size", value: currentReport.summary.team_size, icon: Activity, color: "text-purple-400" },
              { label: "Completion Rate", value: `${currentReport.summary.completion_rate}%`, icon: TrendingUp, color: "text-amber-400" },
            ].map((stat, i) => {
              const Icon = stat.icon;
              return (
                <div key={i} className="p-3 rounded-xl bg-surface border border-border/50">
                  <Icon className={`w-4 h-4 ${stat.color} mb-1`} />
                  <p className="text-lg font-bold">{stat.value}</p>
                  <p className="text-[10px] text-text-muted">{stat.label}</p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MarketTrendsSection() {
  const { articles, loading, fetchTrends } = useMarketTrendsStore();
  const { organization } = useOrganizationStore();

  useEffect(() => {
    fetchTrends(organization?.industry, organization?.micro_vertical);
  }, [organization?.industry, organization?.micro_vertical, fetchTrends]);

  const getTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Newspaper className="w-5 h-5 text-primary" />
            <CardTitle>Market Trends</CardTitle>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {organization?.industry || "General"}
          </Badge>
        </div>
        <CardDescription>
          Recent news and trends in your industry
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : articles.length === 0 ? (
          <EmptyStateTemplate
            title="No market data available"
            hint="Market trends will appear here once we gather data about your industry."
          />
        ) : (
          <div className="space-y-2">
            {articles.slice(0, 5).map((article, i) => (
              <a
                key={i}
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 p-3 rounded-xl bg-surface hover:bg-surface-light transition-all border border-border/50 group cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Newspaper className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                      {article.title}
                    </p>
                    <ExternalLink className="w-3 h-3 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                  </div>
                  <p className="text-xs text-text-muted line-clamp-1 mt-0.5">
                    {article.description}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] text-text-muted/60">
                      {article.source}
                    </span>
                    <span className="text-[10px] text-text-muted/40">&middot;</span>
                    <span className="text-[10px] text-text-muted/60">
                      {getTimeAgo(article.published_at)}
                    </span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RevenueRiskRadar() {
  const risks = [
    {
      title: "Cash Flow Risk",
      level: "medium",
      value: 45,
      description: "Receivables aging beyond 45 days",
      impact: "Medium impact on operations",
      icon: DollarSign,
    },
    {
      title: "Market Volatility",
      level: "low",
      value: 25,
      description: "Industry fluctuation within normal range",
      impact: "Low immediate concern",
      icon: TrendingUp,
    },
    {
      title: "Goal Completion Risk",
      level: "high",
      value: 72,
      description: "3 active goals behind schedule",
      impact: "High - may affect Q2 targets",
      icon: Target,
    },
    {
      title: "Team Capacity",
      level: "medium",
      value: 55,
      description: "Team utilization at 85% capacity",
      impact: "Medium - consider hiring",
      icon: Activity,
    },
    {
      title: "Revenue Concentration",
      level: "high",
      value: 68,
      description: "Top 2 clients represent 60% of revenue",
      impact: "High diversification needed",
      icon: TrendingDown,
    },
    {
      title: "Compliance Risk",
      level: "low",
      value: 15,
      description: "All regulatory requirements met",
      impact: "Low - no action needed",
      icon: Shield,
    },
  ];

  const getRiskColor = (level: string) => {
    switch (level) {
      case "high":
        return { bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/20", bar: "bg-rose-400" };
      case "medium":
        return { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20", bar: "bg-amber-400" };
      default:
        return { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20", bar: "bg-emerald-400" };
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <CardTitle>Revenue Risk Radar</CardTitle>
          <Badge variant="warning" className="text-[10px] ml-2">
            Real-time
          </Badge>
        </div>
        <CardDescription>
          Monitor key risk areas affecting your business
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {risks.map((risk, i) => {
            const colors = getRiskColor(risk.level);
            const Icon = risk.icon;
            return (
              <div
                key={i}
                className={`p-4 rounded-xl ${colors.bg} ${colors.border} border transition-all hover:shadow-lg`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${colors.text}`} />
                    <span className="text-sm font-medium">{risk.title}</span>
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${colors.bg} ${colors.text} ${colors.border} border`}>
                    {risk.level}
                  </span>
                </div>
                <div className="mb-2">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-text-muted">Risk Score</span>
                    <span className={colors.text}>{risk.value}%</span>
                  </div>
                  <div className="h-2 bg-black/20 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${colors.bar} transition-all duration-500`}
                      style={{ width: `${risk.value}%` }}
                    />
                  </div>
                </div>
                <p className="text-xs text-text-muted mt-2">{risk.description}</p>
                <p className={`text-[10px] ${colors.text} mt-1`}>{risk.impact}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardView() {
  const { user } = useAuth();
  const { organization } = useOrganizationStore();
  const { goals, fetchGoals } = useGoalStore();
  const { adaptation, getAISummary } = useAIDashboardAdaptation();
  const [aiSummary, setAiSummary] = useState("");
  const orgId = organization?.id;

  useEffect(() => {
    if (orgId) fetchGoals(orgId);
  }, [orgId, fetchGoals]);

  useEffect(() => {
    if (adaptation.stage !== "new") {
      getAISummary().then(setAiSummary);
    }
  }, [adaptation.stage, getAISummary]);

  const activeGoalCount = goals.filter(g => g.status === "active").length;

  const getStageLabel = (stage: OrgStage) => {
    switch (stage) {
      case "new": return "Getting Started";
      case "onboarding": return "Building Foundation";
      case "growing": return "Growth Mode";
      case "established": return "Executive View";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent">
            Executive Dashboard
          </h1>
          <p className="text-text-muted mt-1">
            {organization?.name
              ? `${organization.name} — ${organization.industry || "Business"}`
              : "Your business command center"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
            {getStageLabel(adaptation.stage)}
          </span>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-emerald-400">Live</span>
          </div>
        </div>
      </div>

      {aiSummary && (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-purple-500/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <p className="text-sm text-text-muted">{aiSummary}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {adaptation.showSetupWizard && (
        <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <Info className="w-6 h-6 text-amber-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-amber-400 mb-1">
                  {adaptation.stage === "new" ? "Welcome to Your Executive Dashboard" : "Great Start!"}
                </h3>
                <p className="text-sm text-text-muted mb-3">{adaptation.emptyStateMessage}</p>
                {adaptation.suggestedFocus.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {adaptation.suggestedFocus.map((item, i) => (
                      <span key={i} className="text-xs px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {item}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {adaptation.showExecutiveKPIs && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: TrendingUp, label: "Revenue", value: goals.length > 0 ? "$47.2K" : "---", change: "+12.5%", badge: "success" as const },
            { icon: Activity, label: "Active Users", value: goals.length > 0 ? "1,847" : "---", change: "+8.2%", badge: "info" as const },
            { icon: Target, label: "Goals Active", value: activeGoalCount.toString() || "0", change: `${goals.length} total`, badge: "default" as const },
            { icon: CheckCircle, label: "Completion Rate", value: goals.length > 0 ? "68%" : "---", change: goals.length > 0 ? "On track" : "No data", badge: "secondary" as const },
          ].map((stat, i) => {
            const Icon = stat.icon;
            return (
              <Card key={i} className="card-hover">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/10 to-purple-500/10 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <Badge variant={stat.badge}>{stat.change}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <div className="text-sm text-text-muted">{stat.label}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <GoalSection />

      {adaptation.showGrokInsights && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AISummaryChat />
          <div className="space-y-6">
            <WeeklyReportGenerator />
            <MarketTrendsSection />
          </div>
        </div>
      )}

      {adaptation.showRevenueRisk && <RevenueRiskRadar />}
    </div>
  );
}
