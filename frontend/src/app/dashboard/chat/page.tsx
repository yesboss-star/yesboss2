"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useUIStore } from "@/stores/uiStore";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useChatStore, ChatMessage } from "@/stores/chatStore";
import { useOrgChartStore } from "@/stores/orgChartStore";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, Button } from "@/components/ui";
import { 
  Send, Loader2, Sparkles, Bot, User, Trash2, MessageSquare, Plus, X,
  ChevronRight, PanelLeftOpen, PanelLeftClose, FileText, Lightbulb, ArrowRight,
  Check, Copy, Zap, TrendingUp, Target, Briefcase, BarChart3, AtSign
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
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStart, setMentionStart] = useState<number>(-1);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);
  const orgId = organization?.id;
  const { members, fetchOrgMembers } = useOrgChartStore();

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
    if (orgId) fetchOrgMembers(orgId);
  }, [orgId, fetchOrgMembers]);

  useEffect(() => {
    if (mentionOpen && !members?.length && orgId) {
      fetchOrgMembers(orgId);
    }
  }, [mentionOpen, members?.length, orgId, fetchOrgMembers]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView();
  }, [messages]);

  const mentionSuggestions = useMemo(() => {
    if (!members?.length) return [] as any[];
    const q = mentionQuery.trim().toLowerCase();
    const list = members
      .map((m: any) => ({ m, name: (m.full_name || "").trim() }))
      .filter((x) => x.name)
      .map((x) => {
        const lower = x.name.toLowerCase();
        const starts = q && lower.startsWith(q) ? 0 : 1;
        const includes = q && lower.includes(q) ? 0 : 1;
        return { member: x.m, name: x.name, rank: starts * 2 + includes };
      })
      .filter((x) => (q ? x.rank < 2 : true))
      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
      .slice(0, 6)
      .map((x) => x.member);
    return list;
  }, [members, mentionQuery]);

  const updateMentionState = useCallback(
    (text: string, cursor: number) => {
      const upto = text.slice(0, cursor);
      const atIdx = upto.lastIndexOf("@");
      if (atIdx === -1) {
        setMentionOpen(false);
        setMentionQuery("");
        setMentionStart(-1);
        return;
      }
      const between = upto.slice(atIdx + 1);
      if (/\s/.test(between)) {
        setMentionOpen(false);
        setMentionQuery("");
        setMentionStart(-1);
        return;
      }
      setMentionOpen(true);
      setMentionQuery(between);
      setMentionStart(atIdx);
      setMentionActiveIndex(0);
    },
    []
  );

  const insertMention = useCallback(
    (member: any) => {
      if (!member || mentionStart < 0) return;
      const name = (member.full_name || "").trim();
      if (!name) return;
      const cursor = inputRef.current?.selectionStart ?? input.length;
      const before = input.slice(0, mentionStart);
      const afterStart = mentionStart + 1 + mentionQuery.length;
      const after = input.slice(afterStart);
      const inserted = `@${name} `;
      const newText = `${before}${inserted}${after}`.replace(/\s+/g, " ");
      setInput(newText);
      setMentionOpen(false);
      setMentionQuery("");
      setMentionStart(-1);
      requestAnimationFrame(() => {
        const pos = (before + inserted).length;
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(pos, pos);
      });
    },
    [mentionStart, mentionQuery, input]
  );

  const handleSubmit = useCallback(async () => {
    const text = input.trim();
    if (!text || askLoading || loading) return;
    setInput("");
    await askMessage(text, orgId);
  }, [input, askLoading, loading, askMessage, orgId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mentionOpen && mentionSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionActiveIndex((i) => (i + 1) % mentionSuggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionActiveIndex((i) =>
          (i - 1 + mentionSuggestions.length) % mentionSuggestions.length
        );
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        insertMention(mentionSuggestions[mentionActiveIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionOpen(false);
        return;
      }
    }
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
                            <p className="text-sm font-medium text-amber-400 mb-2">{String(msg.question.question ?? "")}</p>
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
                {mentionOpen && mentionSuggestions.length > 0 && (
                  <div
                    ref={mentionListRef}
                    className="absolute bottom-full left-0 right-0 mb-2 rounded-2xl border-2 border-primary/40 bg-surface/95 backdrop-blur-md shadow-2xl shadow-black/50 overflow-hidden z-50 ring-1 ring-primary/10"
                  >
                    <div className="px-3 py-2 flex items-center gap-2 border-b border-border/60 bg-gradient-to-r from-primary/10 to-purple-500/10">
                      <div className="w-6 h-6 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
                        <AtSign className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <p className="text-[11px] font-semibold text-foreground flex-1">
                        {mentionQuery
                          ? `People matching "@${mentionQuery}"`
                          : "Mention a team member"}
                      </p>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                        {mentionSuggestions.length}
                      </span>
                    </div>
                    <ul className="max-h-60 overflow-y-auto custom-scrollbar py-1" role="listbox">
                      {mentionSuggestions.map((m: any, idx: number) => {
                        const isActive = idx === mentionActiveIndex;
                        return (
                          <li
                            key={m.id || m.email || m.full_name}
                            role="option"
                            aria-selected={isActive}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              insertMention(m);
                            }}
                            onMouseEnter={() => setMentionActiveIndex(idx)}
                            className={`flex items-center gap-3 mx-1.5 my-0.5 px-2.5 py-2 rounded-xl cursor-pointer transition-all ${
                              isActive
                                ? "bg-primary/15 text-foreground ring-1 ring-primary/30 shadow-sm"
                                : "text-text-muted hover:bg-surface-light/60"
                            }`}
                          >
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                              isActive
                                ? "bg-gradient-to-br from-primary to-purple-500 border-primary/50"
                                : "bg-gradient-to-br from-primary/20 to-purple-500/20 border-primary/20"
                            }`}>
                              <span className={`text-xs font-bold ${
                                isActive ? "text-white" : "text-primary"
                              }`}>
                                {(m.full_name || "?").trim().charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium truncate ${
                                isActive ? "text-foreground" : "text-foreground/90"
                              }`}>
                                {m.full_name}
                              </p>
                              <p className="text-[11px] text-text-muted/70 truncate">
                                {[m.role, m.department].filter(Boolean).join(" • ") || m.email}
                              </p>
                            </div>
                            {isActive && (
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <kbd className="text-[9px] px-1.5 py-0.5 rounded border border-border/60 bg-surface text-text-muted font-mono">
                                  ↵
                                </kbd>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    <div className="px-3 py-1.5 flex items-center justify-between border-t border-border/60 bg-surface-light/30 text-[10px] text-text-muted/70">
                      <div className="flex items-center gap-2">
                        <kbd className="px-1 py-0.5 rounded border border-border/60 bg-surface font-mono">↑↓</kbd>
                        <span>navigate</span>
                        <kbd className="px-1 py-0.5 rounded border border-border/60 bg-surface font-mono ml-1">↵</kbd>
                        <span>select</span>
                      </div>
                      <kbd className="px-1 py-0.5 rounded border border-border/60 bg-surface font-mono">esc</kbd>
                    </div>
                  </div>
                )}
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => {
                    const next = e.target.value;
                    setInput(next);
                    const cursor = e.target.selectionStart ?? inputRef.current?.selectionStart ?? next.length;
                    updateMentionState(next, cursor);
                  }}
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
