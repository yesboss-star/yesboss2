"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useUIStore } from "@/stores/uiStore";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useDocumentStore } from "@/stores/documentStore";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, Button } from "@/components/ui";
import { Loader2, Sparkles, Send, CheckSquare, AlertCircle, Clock, Users, MessageSquare, Briefcase, FileText } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isLoading?: boolean;
}

const WELCOME_MESSAGE = "Hi! I'm your AI work assistant. I can help you prioritize tasks, summarize approvals, identify blockers, and — once you've uploaded business documents — answer questions about your company (e.g. \"What was our Q3 revenue?\" or \"What decisions did we make last quarter?\"). Try one of the quick actions below or type your question.";

const QUICK_ACTIONS = [
  { id: "prioritize", label: "How to prioritize today's tasks?", icon: CheckSquare },
  { id: "approvals", label: "Summarize pending approvals", icon: AlertCircle },
  { id: "blockers", label: "What is blocking my workflow?", icon: Clock },
  { id: "updates", label: "Recent team updates", icon: Users },
  { id: "deadlines", label: "What's due this week?", icon: Briefcase },
  { id: "help", label: "How can you help me?", icon: MessageSquare },
  { id: "ask_docs", label: "What does my uploaded data say?", icon: FileText },
];

const generateId = () => `msg_${Math.random().toString(36).substring(7)}`;

export default function EmployeeAIAssistant() {
  const { user, role, loading: authLoading } = useAuth();
  const router = useRouter();
  const { setBreadcrumbs } = useUIStore();
  const { organization } = useOrganizationStore();
  const {
    context: docContext,
    fetchContext: fetchDocContext,
    askQuestion: askDocQuestion,
  } = useDocumentStore();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    const orgId = organization?.id;
    if (orgId) {
      fetchDocContext(orgId);
    }
  }, [organization?.id, fetchDocContext]);

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
    if (!initialized.current && !authLoading && user) {
      initialized.current = true;
      const timer = setTimeout(() => {
        const welcomeMessage: Message = {
          id: generateId(),
          role: "assistant",
          content: WELCOME_MESSAGE,
          timestamp: new Date(),
        };
        setMessages([welcomeMessage]);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [authLoading, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = {
      id: generateId(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    const aiMessageId = generateId();
    const loadingMessage: Message = {
      id: aiMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isLoading: true,
    };
    setMessages((prev) => [...prev, loadingMessage]);

    const lower = text.toLowerCase();
    const docHints = [
      "uploaded",
      "my data",
      "my doc",
      "our doc",
      "our data",
      "the report",
      "the deck",
      "revenue",
      "mrr",
      "arr",
      "churn",
      "cac",
      "ltv",
      "q1",
      "q2",
      "q3",
      "q4",
      "financial",
      "customers do",
      "decisions we",
      "action items",
      "what does my",
    ];
    const isDocQuestion =
      docHints.some((h) => lower.includes(h)) ||
      lower.startsWith("what does") ||
      lower.startsWith("what is our") ||
      lower.startsWith("how much") ||
      lower.startsWith("when did") ||
      lower.startsWith("who is our");

    const hasDocs = (docContext?.analyzed_documents ?? 0) > 0;

    if (isDocQuestion && hasDocs && organization?.id) {
      const answer = await askDocQuestion(organization.id, text);
      if (answer) {
        let content = answer.answer || "I couldn't find a clear answer in your documents.";
        if (answer.sources && answer.sources.length > 0) {
          const src = answer.sources[0];
          content += `\n\n_Source: ${src.filename}_`;
        }
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === aiMessageId
              ? { ...msg, content, isLoading: false }
              : msg
          )
        );
        setIsLoading(false);
        return;
      }
    }

    try {
      const res = await fetch(`${API_URL}/chatbot/employee-assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          context: {
            user_email: user?.email,
            organization_id: organization?.id,
            organization_name: organization?.name,
            document_summary: hasDocs ? docContext?.summary : "",
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === aiMessageId
              ? { ...msg, content: data.response, isLoading: false }
              : msg
          )
        );
      } else {
        throw new Error("Failed to get response");
      }
    } catch {
      const response = getFallbackResponse(text);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === aiMessageId
            ? { ...msg, content: response, isLoading: false }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const getFallbackResponse = (message: string): string => {
    const lower = message.toLowerCase();
    
    if (lower.includes("prioritize") || lower.includes("priority") || lower.includes("today")) {
      return `Based on your current workload, here's how I'd recommend prioritizing:\n\n**High Priority:**\n1. Any tasks marked "urgent" or "high" priority\n2. Tasks with approaching deadlines (next 2 days)\n3. Items assigned directly by your manager\n\n**Medium Priority:**\n1. Tasks due this week\n2. Collaborative tasks waiting on others\n\n**Low Priority:**\n1. Tasks marked "low" priority\n2. Optional improvements or enhancements\n\n💡 *Pro tip: Block 2 hours each morning for your most important task.*`;
    }
    
    if (lower.includes("approval") || lower.includes("pending") || lower.includes("review")) {
      return `You currently have pending items waiting for your review:\n\n**Action Required:**\n• Review expense reports (2 pending)\n• Approve time-off requests (1 pending)\n\n**Quick Actions:**\n• Click "Approve" for routine requests\n• Click "Details" for items needing more attention\n\n💡 *Timely approvals keep your team moving forward!*`;
    }
    
    if (lower.includes("block") || lower.includes("stuck") || lower.includes("blocking")) {
      return `Let me help identify potential workflow blockers:\n\n**Common Blockers to Check:**\n1. **Waiting on others** - Dependencies not yet completed\n2. **Missing information** - Awaiting specs or details\n3. **Resource constraints** - Tools, access, or time\n4. **Decisions pending** - Waiting for approvals\n\n💡 *Tip: Check your task details for dependency status. If stuck, consider reaching out to your manager or the task owner.*`;
    }
    
    if (lower.includes("deadline") || lower.includes("due") || lower.includes("week")) {
      return `Here's your upcoming deadline overview:\n\n**Due Soon (Today/Tomorrow):**\n• Review Q2 marketing report (High)\n\n**Due This Week:**\n• Update client presentation (Medium)\n• Complete team meeting notes (Low)\n\n**Total: 3 tasks this week**\n\n💡 *You have good bandwidth. Consider starting with the high-priority item.*`;
    }
    
    if (lower.includes("team") || lower.includes("update")) {
      return `Recent team activity:\n\n**Today:**\n• Sarah Johnson completed 'Website redesign sprint 3'\n\n**This Week:**\n• Mike Brown reached 85% of Q2 target\n• New project kickoff: Mobile App v2.0\n\n**Announcements:**\n• Team meeting moved to Thursday 2pm\n\n💡 *Stay connected with your team through regular check-ins!*`;
    }
    
    return `I'm here to help! I can assist with:\n\n• **Task Prioritization** - "What should I work on today?"\n• **Approval Summaries** - "What approvals are pending?"\n• **Blocker Identification** - "What's blocking my work?"\n• **Deadline Tracking** - "What's due this week?"\n• **Team Updates** - "Any recent team news?"\n\nJust ask me anything about your work!`;
  };

  const handleQuickAction = (actionId: string) => {
    const action = QUICK_ACTIONS.find((a) => a.id === actionId);
    if (action) {
      sendMessage(action.label);
    }
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
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">AI Assistant</h1>
              <p className="text-text-muted">Your personal work assistant</p>
            </div>
          </div>
        </div>

        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardContent className="flex-1 flex flex-col p-0">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${message.role === "user" ? "justify-end" : ""}`}
                >
                  {message.role === "assistant" && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      message.role === "user"
                        ? "bg-primary text-white"
                        : "bg-surface"
                    }`}
                  >
                    {message.isLoading ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-text-muted text-sm">Thinking...</span>
                      </div>
                    ) : (
                      <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                    )}
                  </div>
                  {message.role === "user" && (
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs text-primary font-medium">
                        {user?.email?.charAt(0).toUpperCase() || "U"}
                      </span>
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {messages.length <= 1 && (
              <div className="px-4 pb-4">
                <p className="text-sm text-text-muted mb-3">Quick actions:</p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action.id}
                      onClick={() => handleQuickAction(action.id)}
                      disabled={isLoading}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface hover:bg-surface-light transition-colors text-sm cursor-pointer disabled:opacity-50"
                    >
                      <action.icon className="w-4 h-4 text-primary" />
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-border p-4">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && !isLoading && sendMessage(input)}
                  placeholder="Ask me anything about your tasks, approvals, or workflow..."
                  disabled={isLoading}
                  className="flex-1 px-4 py-3 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm disabled:opacity-50"
                />
                <Button
                  onClick={() => sendMessage(input)}
                  disabled={isLoading || !input.trim()}
                  className="cursor-pointer"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}