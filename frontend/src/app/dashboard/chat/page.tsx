"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useUIStore } from "@/stores/uiStore";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useChatStore, ChatMessage, ExpertResponse } from "@/stores/chatStore";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, Button, Badge, Avatar } from "@/components/ui";
import { 
  Send, 
  Loader2, 
  Sparkles, 
  Bot, 
  User, 
  Trash2, 
  Copy, 
  Check,
  ChevronDown,
  Zap,
  TrendingUp,
  DollarSign,
  Users,
  Target,
  Briefcase,
  MessageCircle,
  Bot as BotIcon,
  ArrowRight,
  RefreshCw,
  Lightbulb,
  FileText,
  BarChart3
} from "lucide-react";

const EXPERT_ICONS: Record<string, any> = {
  "Finance Expert": DollarSign,
  "Operations Expert": TrendingUp,
  "Strategy Expert": Target,
  "HR Expert": Users,
  "Sales Expert": BarChart3,
  "Product Expert": Briefcase,
};

const QUICK_QUESTIONS = [
  "What's our revenue trend this quarter?",
  "What are the top operational bottlenecks?",
  "How should we position our product for growth?",
  "What's our employee retention rate?",
  "Which sales leads should we prioritize?",
];

export default function ExecutiveChatPage() {
  const { user, role, loading: authLoading } = useAuth();
  const router = useRouter();
  const { setBreadcrumbs } = useUIStore();
  const { organization } = useOrganizationStore();
  const { 
    messages, 
    experts, 
    loading, 
    streaming,
    fetchExperts, 
    sendMessage, 
    clearChat 
  } = useChatStore();
  
  const [input, setInput] = useState("");
  const [showExperts, setShowExperts] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setBreadcrumbs([
      { label: "Dashboard", href: "/dashboard" },
      { label: "AI Assistant" },
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
    fetchExperts();
  }, [fetchExperts]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const message = input;
    setInput("");
    await sendMessage(message, messages, organization?.id);
  };

  const handleQuickQuestion = async (question: string) => {
    setInput(question);
    await sendMessage(question, messages, organization?.id);
  };

  const handleCopy = async (content: string, id: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const renderExpertBadge = (expert: string) => {
    const Icon = EXPERT_ICONS[expert] || BotIcon;
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-primary/10 to-purple-500/10 border border-primary/20">
        <Icon className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-medium text-primary">{expert}</span>
      </div>
    );
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-8rem)] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Executive AI Assistant</h1>
              <p className="text-sm text-text-muted">Your AI-powered COO</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={clearChat}
              className="cursor-pointer text-text-muted hover:text-foreground"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear Chat
            </Button>
          </div>
        </div>

        <div className="flex-1 flex gap-4 overflow-hidden">
          <div className="w-64 flex-shrink-0 space-y-4">
            <Card className="p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Bot className="w-4 h-4 text-primary" />
                Available Experts
              </h3>
              <div className="space-y-2">
                {experts.length > 0 ? experts.map((expert) => {
                  const Icon = EXPERT_ICONS[expert.id] || BotIcon;
                  return (
                    <button
                      key={expert.id}
                      onClick={() => handleQuickQuestion(expert.example_questions[0])}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-surface transition-colors text-left cursor-pointer"
                    >
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{expert.name}</p>
                        <p className="text-xs text-text-muted truncate">{expert.description}</p>
                      </div>
                    </button>
                  );
                }) : (
                  <>
                    {["Finance", "Operations", "Strategy", "HR", "Sales", "Product"].map((exp) => {
                      const Icon = EXPERT_ICONS[`${exp} Expert`] || BotIcon;
                      return (
                        <button
                          key={exp}
                          onClick={() => handleQuickQuestion(`Tell me about our ${exp.toLowerCase()} performance`)}
                          className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-surface transition-colors text-left cursor-pointer"
                        >
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Icon className="w-4 h-4 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{exp} Expert</p>
                          </div>
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
            </Card>

            <Card className="p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-400" />
                Quick Questions
              </h3>
              <div className="space-y-2">
                {QUICK_QUESTIONS.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleQuickQuestion(q)}
                    className="w-full text-left text-xs p-2 rounded-lg bg-surface hover:bg-surface-light transition-colors text-text-muted hover:text-foreground cursor-pointer line-clamp-2"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </Card>
          </div>

          <Card className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center mb-4">
                    <Sparkles className="w-10 h-10 text-white" />
                  </div>
                  <h2 className="text-xl font-bold mb-2">Welcome to Your AI Assistant</h2>
                  <p className="text-text-muted max-w-md mb-6">
                    Ask me anything about your business. I&apos;ll consult with our expert agents 
                    to provide you with comprehensive insights and recommendations.
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                    {QUICK_QUESTIONS.slice(0, 3).map((q, i) => (
                      <button
                        key={i}
                        onClick={() => handleQuickQuestion(q)}
                        className="px-4 py-2 rounded-full bg-surface hover:bg-surface-light text-sm transition-colors cursor-pointer"
                      >
                        {q.split(" ")[0]}...
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${
                      msg.role === "user" 
                        ? "bg-primary/20" 
                        : "bg-gradient-to-br from-primary to-purple-500"
                    }`}>
                      {msg.role === "user" ? (
                        <User className="w-4 h-4 text-primary" />
                      ) : (
                        <Bot className="w-4 h-4 text-white" />
                      )}
                    </div>
                    <div className={`flex-1 max-w-[80%] ${msg.role === "user" ? "text-right" : ""}`}>
                      {msg.role === "assistant" && msg.expertResponses && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {msg.expertResponses.map((exp, i) => (
                            <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-border">
                              {renderExpertBadge(exp.expert)}
                              <span className="text-xs text-text-muted">
                                {Math.round(exp.confidence * 100)}% confidence
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className={`rounded-2xl p-4 ${
                        msg.role === "user"
                          ? "bg-primary text-white"
                          : "bg-surface border border-border"
                      }`}>
                        <div className="prose prose-sm max-w-none">
                          {msg.content.split("\n").map((line, i) => {
                            const renderInline = (text: string) =>
                              text.split(/(\*\*[^*]+\*\*)/).map((part, j) =>
                                part.startsWith("**") && part.endsWith("**")
                                  ? <strong key={j}>{part.slice(2, -2)}</strong>
                                  : part
                              );
                            if (line.startsWith("## ")) {
                              return <h3 key={i} className="text-lg font-bold mt-4 mb-2">{renderInline(line.replace("## ", ""))}</h3>;
                            }
                            if (line.startsWith("### ")) {
                              return <h4 key={i} className="font-semibold mt-3 mb-1">{renderInline(line.replace("### ", ""))}</h4>;
                            }
                            if (line.startsWith("- ")) {
                              return <li key={i} className="ml-4">{renderInline(line.replace("- ", ""))}</li>;
                            }
                            if (line.startsWith("* ") && !line.includes("**")) {
                              return <li key={i} className="ml-4 text-text-muted">{line.replace("* ", "")}</li>;
                            }
                            return line ? <p key={i} className="mb-2">{renderInline(line)}</p> : null;
                          })}
                        </div>
                      </div>
                      {msg.role === "assistant" && (
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            onClick={() => handleCopy(msg.content, msg.id)}
                            className="p-1.5 rounded-lg hover:bg-surface transition-colors cursor-pointer text-text-muted"
                          >
                            {copiedId === msg.id ? (
                              <Check className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      )}
                      {msg.actionItems && msg.actionItems.length > 0 && (
                        <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                          <div className="flex items-center gap-2 mb-2">
                            <Zap className="w-4 h-4 text-amber-400" />
                            <span className="text-sm font-medium text-amber-400">Action Items</span>
                          </div>
                          <ul className="space-y-1">
                            {msg.actionItems.map((item, i) => (
                              <li key={i} className="text-xs text-text-muted flex items-center gap-2">
                                <ArrowRight className="w-3 h-3 text-amber-400" />
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <p className="text-xs text-text-muted mt-2">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
              {streaming && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-surface border border-border rounded-2xl p-4">
                    <div className="flex items-center gap-2 text-text-muted">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Consulting experts...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t border-border">
              <div className="flex items-end gap-3">
                <div className="flex-1 relative">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask anything about your business..."
                    className="w-full px-4 py-3 pr-12 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none resize-none min-h-[48px] max-h-32"
                    rows={1}
                  />
                  <button
                    onClick={() => setShowExperts(!showExperts)}
                    className="absolute right-3 bottom-3 p-1.5 rounded-lg hover:bg-surface-light transition-colors cursor-pointer"
                  >
                    <Bot className="w-4 h-4 text-text-muted" />
                  </button>
                </div>
                <Button
                  onClick={handleSend}
                  disabled={!input.trim() || loading}
                  className="px-4 h-12 rounded-xl cursor-pointer"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-text-muted mt-2 text-center">
                AI can make mistakes. Verify important information.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}