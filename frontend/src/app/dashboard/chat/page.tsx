"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useUIStore } from "@/stores/uiStore";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useChatStore, ChatMessage } from "@/stores/chatStore";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, Button } from "@/components/ui";
import { 
  Send, Loader2, Sparkles, Bot, User, Trash2, MessageSquare, Plus, X,
  ChevronRight, PanelLeftOpen, PanelLeftClose, FileText, Lightbulb, ArrowRight,
  Check, Copy, Zap, TrendingUp, Target, Briefcase, BarChart3
} from "lucide-react";

const QUICK_ACTIONS = [
  { id: "finances", label: "How are my finances?", icon: FileText },
  { id: "growth", label: "What's blocking growth?", icon: Lightbulb },
  { id: "team", label: "How is my team doing?", icon: MessageSquare },
  { id: "priorities", label: "What should I focus on?", icon: Sparkles },
];

const QUICK_QUESTIONS = [
  "What's our revenue trend this quarter?",
  "What are the top operational bottlenecks?",
  "How should we position our product for growth?",
  "What's our employee retention rate?",
  "Which sales leads should we prioritize?",
];

export default function StrategyChatPage() {
  const { user, role, loading: authLoading } = useAuth();
  const router = useRouter();
  const { setBreadcrumbs } = useUIStore();
  const { organization } = useOrganizationStore();
  const { 
    messages, sessions, activeSessionId, loading, askLoading, experts,
    fetchExperts, sendMessage, askMessage, clearChat,
    fetchSessions, createSession, deleteSession, setActiveSession,
  } = useChatStore();
  
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const orgId = organization?.id;

  useEffect(() => {
    setBreadcrumbs([
      { label: "Dashboard", href: "/dashboard" },
      { label: "Strategy Chat" },
    ]);
  }, [setBreadcrumbs]);

  useEffect(() => {
    if (orgId) fetchSessions(orgId);
  }, [orgId, fetchSessions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = useCallback(async () => {
    const text = input.trim();
    if (!text || askLoading || loading) return;
    setInput("");
    await askMessage(text, orgId);
  }, [input, askLoading, loading, askMessage, orgId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleNewSession = async () => {
    if (orgId) {
      await createSession(orgId);
    }
  };

  const handleQuickAction = (id: string) => {
    const q = QUICK_ACTIONS.find(a => a.id === id);
    if (q) {
      setInput(q.label);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-4rem)] gap-0">
        {/* Sidebar */}
        <div className={`${sidebarOpen ? "w-64" : "w-0"} transition-all duration-200 border-r border-border bg-surface/50 flex flex-col overflow-hidden flex-shrink-0`}>
          {sidebarOpen && (
            <>
              <div className="p-3 border-b border-border">
                <button
                  onClick={handleNewSession}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-primary hover:bg-primary/80 text-white text-sm font-medium transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  New Chat
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {sessions.map((s) => (
                  <div
                    key={s._id}
                    className={`group flex items-center justify-between px-3 py-2 rounded-lg text-sm cursor-pointer transition-all ${
                      activeSessionId === s._id ? "bg-primary/10 text-primary" : "hover:bg-surface text-text-muted"
                    }`}
                    onClick={() => {
                      setActiveSession(s._id);
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{s.title}</span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteSession(s._id); }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 text-red-400 transition-all cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Main chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface/30">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-lg hover:bg-surface text-text-muted transition-all cursor-pointer"
            >
              {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
            </button>
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-primary" />
              <h2 className="font-semibold">Strategy Chat</h2>
            </div>
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="ml-auto p-1.5 rounded-lg hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-all cursor-pointer"
                title="Clear chat"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {messages.length === 0 && !askLoading && (
              <div className="flex flex-col items-center justify-center h-full px-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center mb-4">
                  <Bot className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Strategy Chat</h3>
                <p className="text-sm text-text-muted text-center max-w-md mb-6">
                  Ask about your business, delegate tasks to your team, or explore strategic insights.
                </p>
                
                {/* Quick actions */}
                <div className="grid grid-cols-2 gap-3 max-w-lg w-full mb-8">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action.id}
                      onClick={() => handleQuickAction(action.id)}
                      className="flex items-center gap-3 p-3 rounded-xl bg-surface border border-border hover:border-primary/30 hover:bg-primary/5 transition-all cursor-pointer text-left"
                    >
                      <action.icon className="w-5 h-5 text-primary flex-shrink-0" />
                      <span className="text-sm font-medium">{action.label}</span>
                    </button>
                  ))}
                </div>

                {/* Example questions */}
                <div className="flex flex-wrap gap-2 justify-center max-w-xl">
                  {QUICK_QUESTIONS.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => setInput(q)}
                      className="text-xs px-3 py-1.5 rounded-full bg-surface border border-border hover:border-primary/30 text-text-muted hover:text-foreground transition-all cursor-pointer"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="px-4 py-4 space-y-4 max-w-4xl mx-auto">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                  {msg.role !== "user" && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                      <Bot className="w-4 h-4 text-primary" />
                    </div>
                  )}
                  
                  <div className={`max-w-[80%] ${msg.role === "user" ? "order-1" : ""}`}>
                    {msg.role === "user" ? (
                      <div className="px-4 py-2.5 rounded-2xl bg-primary text-primary-foreground text-sm">
                        {msg.content}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="px-4 py-3 rounded-2xl bg-surface border border-border">
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        </div>

                        {/* Question cards (from assistant flow) */}
                        {msg.question && (
                          <div className="px-4 py-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                            <p className="text-sm font-medium text-amber-400 mb-2">{msg.question.question}</p>
                            {msg.question.options && (
                              <div className="flex flex-wrap gap-2">
                                {msg.question.options.map((opt: any, i: number) => (
                                  <button
                                    key={i}
                                    onClick={() => setInput(typeof opt === "string" ? opt : opt.label || opt.value)}
                                    className="text-xs px-3 py-1.5 rounded-full bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 transition-all cursor-pointer"
                                  >
                                    {typeof opt === "string" ? opt : opt.label || opt.value}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Delegate result */}
                        {msg.delegate && (
                          <div className="px-4 py-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                            <div className="flex items-center gap-2 text-emerald-400 font-medium text-sm mb-2">
                              <Check className="w-4 h-4" />
                              Delegated to {msg.delegate.assignee || "team member"}
                            </div>
                            <p className="text-xs text-text-muted">
                              Goal: {msg.delegate.goal?.title || msg.delegate.title}
                            </p>
                          </div>
                        )}

                        {/* Meeting booking */}
                        {msg.meeting && msg.meeting.booking_result?.booked && (
                          <div className="px-4 py-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                            <div className="flex items-center gap-2 text-emerald-400 font-medium text-sm">
                              <Check className="w-4 h-4" />
                              Meeting Booked
                            </div>
                          </div>
                        )}

                        {/* Expert responses */}
                        {msg.expertResponses && msg.expertResponses.length > 0 && (
                          <div className="space-y-2">
                            {msg.expertResponses.map((exp, i) => (
                              <details key={i} className="px-4 py-2.5 rounded-xl bg-surface/50 border border-border">
                                <summary className="text-xs font-medium text-primary cursor-pointer flex items-center gap-2">
                                  <Zap className="w-3 h-3" />
                                  {exp.expert} ({Math.round(exp.confidence * 100)}% confidence)
                                </summary>
                                <p className="text-xs text-text-muted mt-2">{exp.response}</p>
                              </details>
                            ))}
                          </div>
                        )}

                        {/* Copy button */}
                        <button
                          onClick={() => copyToClipboard(msg.content, msg.id)}
                          className="text-xs text-text-muted hover:text-foreground transition-all flex items-center gap-1 cursor-pointer"
                        >
                          {copiedId === msg.id ? (
                            <><Check className="w-3 h-3" /> Copied</>
                          ) : (
                            <><Copy className="w-3 h-3" /> Copy</>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {msg.role === "user" && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                      <User className="w-4 h-4 text-blue-400" />
                    </div>
                  )}
                </div>
              ))}

              {askLoading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                  <div className="px-4 py-3 rounded-2xl bg-surface border border-border">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input bar */}
          <div className="border-t border-border bg-surface/30 px-4 py-3">
            <div className="flex items-end gap-2 max-w-4xl mx-auto">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about your business, delegate a task, or explore strategy..."
                  rows={1}
                  className="w-full px-4 py-2.5 pr-12 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm resize-none"
                  style={{ minHeight: "42px", maxHeight: "120px" }}
                />
              </div>
              <button
                onClick={handleSubmit}
                disabled={!input.trim() || askLoading || loading}
                className="p-2.5 rounded-xl bg-primary hover:bg-primary/80 text-white disabled:opacity-30 transition-all cursor-pointer flex-shrink-0"
              >
                {askLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
