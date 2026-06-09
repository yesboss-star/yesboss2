"use client";

import { Suspense, useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useUIStore } from "@/stores/uiStore";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useSessionStore, type ChatSession, type SessionMessage, type ClarifyingQuestion } from "@/stores/sessionStore";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, Button } from "@/components/ui";
import {
  Loader2, Sparkles, Send, MessageSquare, Plus, X, Trash2, Edit3, Check,
  ChevronRight, PanelLeftOpen, PanelLeftClose, FileText, Lightbulb, ArrowRight,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const generateId = () => `msg_${Math.random().toString(36).substring(7)}`;

const WELCOME_MESSAGE = "Hi, I'm your AI analyst. Ask me anything about your business, and I'll either answer directly or ask smart questions to give you the best response.";

const QUICK_ACTIONS = [
  { id: "finances", label: "How are my finances?", icon: FileText },
  { id: "growth", label: "What's blocking growth?", icon: Lightbulb },
  { id: "team", label: "How is my team doing?", icon: MessageSquare },
  { id: "priorities", label: "What should I focus on?", icon: Sparkles },
];

export default function AssistantPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="claude-loader" />
      </div>
    }>
      <AssistantInner />
    </Suspense>
  );
}

function AssistantInner() {
  const { user, role, loading: authLoading } = useAuth();
  const router = useRouter();
  const { setBreadcrumbs } = useUIStore();
  const { organization } = useOrganizationStore();
  const {
    sessions, activeSessionId, fetchSessions, createSession, deleteSession,
    renameSession, setActiveSession, addMessage, updateLastMessage,
    updateSessionContext, getActiveSession,
  } = useSessionStore();

  const [input, setInput] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  const activeSession = useMemo(() => getActiveSession(), [sessions, activeSessionId, getActiveSession]);
  const messages = activeSession?.messages || [];

  useEffect(() => {
    setBreadcrumbs([
      { label: "Dashboard", href: "/dashboard" },
      { label: "AI Business Analytics" },
    ]);
  }, [setBreadcrumbs]);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!initialized.current && organization?.id) {
      initialized.current = true;
      fetchSessions(organization.id);
      if (!activeSessionId) {
        createSession(organization.id, "New Chat");
      }
    }
  }, [organization?.id, fetchSessions, createSession, activeSessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleNewSession = async () => {
    if (!organization?.id) return;
    await createSession(organization.id, "New Chat");
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !activeSession || isAsking) return;
    setInput("");
    setIsAsking(true);

    const userMsg: SessionMessage = { role: "user", content: text, timestamp: Date.now() };
    addMessage(activeSession.id, userMsg);

    const loadingId = generateId();
    const loadingMsg: SessionMessage = { role: "assistant", content: "", is_loading: true, timestamp: Date.now() };
    addMessage(activeSession.id, loadingMsg);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch(`${API_URL}/assistant/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          session_id: activeSession.id,
          session_context: activeSession.context,
          context: {
            user_email: user?.email,
            organization_id: organization?.id,
            organization_name: organization?.name,
            role: role || "owner",
          },
          conversation_history: history.slice(-10),
        }),
      });

      if (!res.ok) throw new Error("Ask failed");
      const data = await res.json();

      updateLastMessage(activeSession.id, { is_loading: false });

      if (data.type === "question" && data.question) {
        const q = data.question as ClarifyingQuestion;
        const qMsg: SessionMessage = {
          role: "assistant",
          content: q.text,
          is_question: true,
          question_data: q,
          timestamp: Date.now(),
        };
        updateLastMessage(activeSession.id, qMsg);
      } else if (data.type === "answer" && data.answer) {
        let answer = data.answer;
        if (data.follow_up) answer += "\n\n" + data.follow_up;
        updateLastMessage(activeSession.id, {
          role: "assistant",
          content: answer,
          is_answer: true,
          timestamp: Date.now(),
        });
      } else {
        updateLastMessage(activeSession.id, {
          role: "assistant",
          content: "I'm not sure how to answer that. Could you rephrase?",
          timestamp: Date.now(),
        });
      }
    } catch {
      updateLastMessage(activeSession.id, {
        role: "assistant",
        content: "Something went wrong. Please try again.",
        is_loading: false,
        timestamp: Date.now(),
      });
    } finally {
      setIsAsking(false);
    }
  };

  const handleAnswerQuestion = async (fieldId: string, value: string, valueLabel: string) => {
    if (!activeSession) return;

    const userMsg: SessionMessage = { role: "user", content: valueLabel, timestamp: Date.now() };
    addMessage(activeSession.id, userMsg);

    updateSessionContext(activeSession.id, { [fieldId]: value });

    const loadingId = generateId();
    const loadingMsg: SessionMessage = { role: "assistant", content: "", is_loading: true, timestamp: Date.now() };
    addMessage(activeSession.id, loadingMsg);

    setIsAsking(true);

    try {
      const updatedContext = { ...activeSession.context, [fieldId]: value };
      const history = [...activeSession.messages, userMsg].map((m) => ({ role: m.role, content: m.content || "" }));

      const res = await fetch(`${API_URL}/assistant/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: valueLabel,
          session_id: activeSession.id,
          session_context: updatedContext,
          context: {
            user_email: user?.email,
            organization_id: organization?.id,
            organization_name: organization?.name,
            role: role || "owner",
          },
          conversation_history: history.slice(-10),
        }),
      });

      if (!res.ok) throw new Error("Ask failed");
      const data = await res.json();

      updateLastMessage(activeSession.id, { is_loading: false });

      if (data.type === "question" && data.question) {
        const q = data.question as ClarifyingQuestion;
        const qMsg: SessionMessage = {
          role: "assistant",
          content: q.text,
          is_question: true,
          question_data: q,
          timestamp: Date.now(),
        };
        updateLastMessage(activeSession.id, qMsg);
      } else if (data.type === "answer" && data.answer) {
        let answer = data.answer;
        if (data.follow_up) answer += "\n\n" + data.follow_up;
        updateLastMessage(activeSession.id, {
          role: "assistant",
          content: answer,
          is_answer: true,
          timestamp: Date.now(),
        });
      } else {
        updateLastMessage(activeSession.id, {
          role: "assistant",
          content: "Thanks! Let me know if you have more questions.",
          timestamp: Date.now(),
        });
      }
    } catch {
      updateLastMessage(activeSession.id, {
        role: "assistant",
        content: "Something went wrong. Please try again.",
        is_loading: false,
        timestamp: Date.now(),
      });
    } finally {
      setIsAsking(false);
    }
  };

  const handleSkipQuestion = () => {
    if (!activeSession) return;
    const lastMsg = activeSession.messages[activeSession.messages.length - 1];
    if (lastMsg?.is_question) {
      handleAnswerQuestion("skipped", "skipped", "Skip this question");
    }
  };

  const handleRename = (session: ChatSession) => {
    setRenamingId(session.id);
    setRenameValue(session.title);
  };

  const handleRenameConfirm = (sessionId: string) => {
    if (renameValue.trim()) {
      renameSession(sessionId, renameValue.trim());
    }
    setRenamingId(null);
  };

  const lastQuestion = useMemo(() => {
    if (!activeSession) return null;
    for (let i = activeSession.messages.length - 1; i >= 0; i--) {
      const m = activeSession.messages[i];
      if (m.is_question && m.question_data) return m;
    }
    return null;
  }, [messages]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="claude-loader" />
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-7rem)] md:h-[calc(100vh-8rem)] gap-0 overflow-hidden">
        {/* Session Sidebar */}
        <div className={`${sidebarOpen ? "w-64" : "w-0"} transition-all duration-300 overflow-hidden flex-shrink-0 border-r border-border`}>
          <div className="h-full flex flex-col bg-surface/30">
            <div className="p-3 border-b border-border">
              <button
                onClick={handleNewSession}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-sm font-medium transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                New Chat
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => setActiveSession(session.id)}
                  className={`group flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-all ${
                    activeSessionId === session.id
                      ? "bg-primary/15 text-foreground border border-primary/30"
                      : "hover:bg-surface-light text-text-muted border border-transparent"
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" />
                  {renamingId === session.id ? (
                    <input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleRenameConfirm(session.id)}
                      onBlur={() => handleRenameConfirm(session.id)}
                      className="flex-1 bg-surface border border-border rounded px-1 py-0.5 text-xs outline-none"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="flex-1 truncate text-xs">{session.title}</span>
                  )}
                  <div className="hidden group-hover:flex items-center gap-0.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRename(session); }}
                      className="p-1 rounded hover:bg-surface-light text-text-muted hover:text-foreground cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                      className="p-1 rounded hover:bg-surface-light text-text-muted hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface/20">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-lg hover:bg-surface-light text-text-muted cursor-pointer"
            >
              {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
            </button>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold">AI Business Analytics</h1>
              <p className="text-[10px] text-text-muted">Ask, answer, get insights</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 custom-scrollbar">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <p className="text-text-muted text-sm max-w-md">{WELCOME_MESSAGE}</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {QUICK_ACTIONS.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setInput(a.label)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-border hover:border-primary/30 text-xs text-text-muted hover:text-foreground transition-all cursor-pointer"
                    >
                      <a.icon className="w-3.5 h-3.5" />
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center flex-shrink-0 mt-1">
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
                <div className={`max-w-[80%] ${msg.role === "user" ? "order-1" : ""}`}>
                  {msg.is_loading ? (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-surface border border-border">
                      <div className="claude-loader" />
                      <span className="text-xs text-text-muted">Thinking...</span>
                    </div>
                  ) : msg.is_question && msg.question_data ? (
                    <QuestionCard
                      question={msg.question_data}
                      onAnswer={(fieldId, value, label) => handleAnswerQuestion(fieldId, value, label)}
                      onSkip={handleSkipQuestion}
                      disabled={isAsking}
                    />
                  ) : (
                    <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary text-white"
                        : "bg-surface border border-border text-foreground"
                    }`}>
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    </div>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-xs text-primary font-medium">
                      {user?.email?.charAt(0).toUpperCase() || "U"}
                    </span>
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border p-4">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                placeholder="Ask me anything about your business..."
                disabled={isAsking || !activeSession}
                className="flex-1 px-4 py-2.5 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm disabled:opacity-50"
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || isAsking || !activeSession}
                className="cursor-pointer"
              >
                {isAsking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

interface QuestionCardProps {
  question: ClarifyingQuestion;
  onAnswer: (fieldId: string, value: string, label: string) => void;
  onSkip: () => void;
  disabled: boolean;
}

function QuestionCard({ question, onAnswer, onSkip, disabled }: QuestionCardProps) {
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState("");

  return (
    <div className="rounded-2xl bg-surface border border-primary/20 p-4 space-y-3 min-w-[280px]">
      <div className="flex items-start gap-2">
        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Lightbulb className="w-3.5 h-3.5 text-primary" />
        </div>
        <p className="text-sm text-foreground font-medium">{question.text}</p>
      </div>

      {customMode ? (
        <div className="space-y-2">
          <input
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && customValue.trim()) {
                onAnswer(question.field_id, customValue.trim(), customValue.trim());
                setCustomValue("");
                setCustomMode(false);
              }
            }}
            placeholder="Type your answer..."
            autoFocus
            className="w-full px-3 py-2 rounded-lg bg-surface-light border border-border focus:border-primary focus:outline-none text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (customValue.trim()) {
                  onAnswer(question.field_id, customValue.trim(), customValue.trim());
                  setCustomValue("");
                  setCustomMode(false);
                }
              }}
              disabled={!customValue.trim() || disabled}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
            >
              <ArrowRight className="w-3 h-3" />
              Submit
            </button>
            <button
              onClick={() => setCustomMode(false)}
              className="px-3 py-1.5 rounded-lg bg-surface-light text-text-muted text-xs hover:text-foreground cursor-pointer"
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {question.options?.map((opt, idx) => (
            <button
              key={opt.value}
              onClick={() => onAnswer(question.field_id, opt.value, opt.label)}
              disabled={disabled}
              className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg bg-surface-light border border-border hover:border-primary/40 hover:bg-primary/5 text-sm transition-all disabled:opacity-50 cursor-pointer group"
            >
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                {idx + 1}
              </span>
              <span className="text-foreground">{opt.label}</span>
            </button>
          ))}
          {question.allow_custom && (
            <button
              onClick={() => setCustomMode(true)}
              disabled={disabled}
              className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border border-dashed border-border hover:border-primary/30 text-sm text-text-muted hover:text-foreground transition-all disabled:opacity-50 cursor-pointer"
            >
              <span className="w-6 h-6 rounded-full bg-surface-light text-text-muted text-xs flex items-center justify-center">✏️</span>
              <span>Type my own answer</span>
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <button
          onClick={onSkip}
          disabled={disabled}
          className="text-[10px] text-text-muted hover:text-foreground cursor-pointer disabled:opacity-50"
        >
          Skip this question →
        </button>
      </div>
    </div>
  );
}
