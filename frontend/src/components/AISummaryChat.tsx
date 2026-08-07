"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useGoalStore } from "@/stores/goalStore";
import { useTaskStore } from "@/stores/taskStore";
import { useKPIStore } from "@/stores/kpiStore";
import { useOrgChartStore } from "@/stores/orgChartStore";
import { useSessionStore, type SessionMessage, type ClarifyingQuestion } from "@/stores/sessionStore";
import {
  Sparkles, MessageSquare, Plus, Edit3, Trash2, Paperclip, AtSign,
  Loader2, Send, Lightbulb, Check, ArrowRight, ChevronLeft,
} from "lucide-react";
import {
  Card, CardHeader, CardTitle, CardContent,
  Badge, Button, Input,
} from "@/components/ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

function renderMarkdown(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let inList = false;
  let listType: "ul" | "ol" | null = null;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    line = line
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, "<code class=\"px-1 py-0.5 rounded bg-surface-light text-[11px]\">$1</code>");

    const headerMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headerMatch) {
      if (inList) { result.push(`</${listType}>`); inList = false; listType = null; }
      const level = headerMatch[1].length;
      result.push(`<h${level} class="text-sm font-semibold mt-4 mb-2 text-foreground">${headerMatch[2]}</h${level}>`);
      continue;
    }

    const bulletMatch = line.match(/^[-*]\s+(.+)/);
    if (bulletMatch) {
      if (!inList || listType !== "ul") {
        if (inList) result.push(`</${listType}>`);
        result.push('<ul class="space-y-1 my-2">');
        inList = true;
        listType = "ul";
      }
      result.push(`<li class="flex items-start gap-2 text-sm"><span class="text-primary mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-primary/60"></span><span>${bulletMatch[1]}</span></li>`);
      continue;
    }

    const numMatch = line.match(/^\d+[.)]\s+(.+)/);
    if (numMatch) {
      if (!inList || listType !== "ol") {
        if (inList) result.push(`</${listType}>`);
        result.push('<ol class="space-y-1.5 my-2 list-none">');
        inList = true;
        listType = "ol";
      }
      result.push(`<li class="flex items-start gap-2 text-sm"><span class="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">${numMatch[1].match(/^\d+/)?.[0] || "•"}</span><span>${numMatch[1].replace(/^\d+[.)]\s*/, "")}</span></li>`);
      continue;
    }

    if (line.trim() === "") {
      if (inList) { result.push(`</${listType}>`); inList = false; listType = null; }
      result.push("<div class=\"h-2\"></div>");
      continue;
    }

    if (inList) { result.push(`</${listType}>`); inList = false; listType = null; }
    result.push(`<p class="text-sm leading-relaxed mb-2 text-foreground/90">${line}</p>`);
  }

  if (inList) result.push(`</${listType}>`);
  return result.join("\n");
}

interface QuestionCardProps {
  question: ClarifyingQuestion;
  onAnswer: (fieldId: string, value: string, label: string) => void;
  onSkip: () => void;
  disabled: boolean;
  questionNumber?: number;
  totalQuestions?: number;
}

function QuestionCard({ question, onAnswer, onSkip, disabled, questionNumber, totalQuestions }: QuestionCardProps) {
  const [answeredLabel, setAnsweredLabel] = useState<string | null>(null);
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState("");

  const handleAnswer = (fieldId: string, value: string, label: string) => {
    if (answeredLabel) return;
    setAnsweredLabel(label);
    onAnswer(fieldId, value, label);
  };

  return (
    <div className="rounded-2xl bg-surface border border-primary/20 p-4 space-y-3 min-w-[280px] max-w-[80%]">
      {questionNumber && (
        <div className="flex items-center gap-2 mb-1">
          {totalQuestions && totalQuestions > 1 ? (
            <>
              <div className="flex-1 h-1 bg-surface-light rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(questionNumber / totalQuestions) * 100}%` }} />
              </div>
              <span className="text-[10px] text-text-muted font-medium whitespace-nowrap">Question {questionNumber} of {totalQuestions}</span>
            </>
          ) : (
            <span className="text-[10px] text-text-muted font-medium">Question {questionNumber}</span>
          )}
        </div>
      )}

      <div className="flex items-start gap-2">
        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Lightbulb className="w-3.5 h-3.5 text-primary" />
        </div>
        <p className="text-sm text-foreground font-medium">{question.text}</p>
      </div>

      {answeredLabel ? (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-primary/10 border border-primary/20 text-sm">
          <Check className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-foreground">You selected: <strong>{answeredLabel}</strong></span>
        </div>
      ) : customMode ? (
        <div className="space-y-2">
          <input
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && customValue.trim()) {
                handleAnswer(question.field_id, customValue.trim(), customValue.trim());
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
                  handleAnswer(question.field_id, customValue.trim(), customValue.trim());
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
              onClick={() => handleAnswer(question.field_id, opt.value, opt.label)}
              disabled={disabled || !!answeredLabel}
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
              disabled={disabled || !!answeredLabel}
              className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border border-dashed border-border hover:border-primary/30 text-sm text-text-muted hover:text-foreground transition-all disabled:opacity-50 cursor-pointer"
            >
              <span className="w-6 h-6 rounded-full bg-surface-light text-text-muted text-xs flex items-center justify-center">✏️</span>
              <span>Type my own answer</span>
            </button>
          )}
        </div>
      )}

      {!answeredLabel && !customMode && (
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={onSkip}
            disabled={disabled}
            className="text-[10px] text-text-muted hover:text-foreground cursor-pointer disabled:opacity-50"
          >
            Skip this question →
          </button>
        </div>
      )}
    </div>
  );
}

export default function AISummaryChat() {
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStart, setMentionStart] = useState<number>(-1);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pendingQuestion, setPendingQuestion] = useState<ClarifyingQuestion | null>(null);
  const [questionCount, setQuestionCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [taskImportPreview, setTaskImportPreview] = useState<any>(null);
  const [taskImportLoading, setTaskImportLoading] = useState(false);
  const [taskImportConfirming, setTaskImportConfirming] = useState(false);
  const [taskImportResult, setTaskImportResult] = useState<any>(null);
  const [selectedTaskIndices, setSelectedTaskIndices] = useState<Set<number>>(new Set());
  const [importSuggestion, setImportSuggestion] = useState<any>(null);
  const [suggestionGoalCreating, setSuggestionGoalCreating] = useState(false);
  const [suggestionGoalCreated, setSuggestionGoalCreated] = useState(false);
  const [missingDataRequest, setMissingDataRequest] = useState<any>(null);
  const [reAnalyzing, setReAnalyzing] = useState(false);
  const [insights, setInsights] = useState<any[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [actionItems, setActionItems] = useState<any[] | null>(null);
  const [selectedActionIndices, setSelectedActionIndices] = useState<Set<number>>(new Set());
  const [actionItemsCreating, setActionItemsCreating] = useState(false);
  const [actionItemsCreated, setActionItemsCreated] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [suggestions, setSuggestions] = useState<any[] | null>(null);
  const [sessionInsights, setSessionInsights] = useState<any[]>([]);
  const [sessionInsightsOpen, setSessionInsightsOpen] = useState(false);
  const [sessionInsightsLoading, setSessionInsightsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);
  const proactiveTriggeredRef = useRef<string | null>(null);
  const { user, role } = useAuth();
  const { organization } = useOrganizationStore();
  const { goals } = useGoalStore();
  const { tasks } = useTaskStore();
  const { members } = useOrgChartStore();

  const directReportEmails = useMemo(() => {
    const email = user?.email?.toLowerCase() || "";
    return new Set(
      members
        .filter((m: any) => (m.manager_email || "").toLowerCase() === email)
        .map((m: any) => m.email.toLowerCase())
    );
  }, [members, user?.email]);

  const myTasks = useMemo(() => {
    if (role === "owner") return tasks;
    const email = user?.email?.toLowerCase() || "";
    return tasks.filter((t) => {
      const assigneeEmail = (t.assignee_email || "").toLowerCase();
      const assigneeIds = t.assignee_id || [];
      const inAssignees = assigneeIds.some((id) => id.toLowerCase() === email);
      const inDirectReports = assigneeIds.some((id) => directReportEmails.has(id.toLowerCase()));
      return assigneeEmail === email || inAssignees || directReportEmails.has(assigneeEmail) || inDirectReports;
    });
  }, [tasks, role, user?.email, directReportEmails]);

  const myGoals = useMemo(() => {
    if (role === "owner") return goals;
    const email = user?.email?.toLowerCase() || "";
    return goals.filter((g) => {
      const ids = g.assignee_id || [];
      return ids.some((id) => id.toLowerCase() === email);
    });
  }, [goals, role, user?.email]);
  const { addKPI } = useKPIStore();
  const {
    sessions, activeSessionId, createSession,
    setActiveSession, updateSessionContext,
    deleteSession, renameSession,
    addMessage, updateLastMessage,
  } = useSessionStore();
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current || !organization?.id) return;
    initRef.current = true;
    const orgId = organization.id;
    useSessionStore.getState().fetchSessions(orgId);
    useOrgChartStore.getState().fetchOrgMembers(orgId);
    useGoalStore.getState().fetchGoals(orgId);
    useTaskStore.getState().fetchTasks(orgId);
  }, [organization?.id]);

  useEffect(() => {
    if (mentionOpen && !members?.length && organization?.id) {
      useOrgChartStore.getState().fetchOrgMembers(organization.id);
    }
  }, [mentionOpen, members?.length, organization?.id]);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  useEffect(() => {
    if (activeSession) {
      setMessages(activeSession.messages);
    }
  }, [activeSession?.id]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const container = chatEndRef.current?.parentElement;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!organization?.id) return;
    try {
      const v = localStorage.getItem(`yesboss-suggestions-${organization.id}`);
      if (v) setSuggestions(JSON.parse(v));
    } catch { /* ignore */ }
  }, [organization?.id]);

  useEffect(() => {
    const orgId = organization?.id;
    if (!orgId) return;
    try {
      if (suggestions) {
        localStorage.setItem(`yesboss-suggestions-${orgId}`, JSON.stringify(suggestions));
      } else {
        localStorage.removeItem(`yesboss-suggestions-${orgId}`);
      }
    } catch { /* ignore */ }
  }, [suggestions, organization?.id]);

  useEffect(() => {
    if (!activeSession || !organization?.id) return;
    if (proactiveTriggeredRef.current === activeSession.id) return;
    if (activeSession.messages.length > 0) return;
    proactiveTriggeredRef.current = activeSession.id;

    const doProactive = async () => {
      const s = activeSession;
      const loadingMsg: SessionMessage = { role: "assistant", content: "", is_loading: true, timestamp: Date.now() };
      setMessages([loadingMsg]);
      try {
        const data = await apiAsk("Analyze my business", undefined, true);
        if (!data) return;
        let content = data.answer || data.response || "";
        const followUp = data.follow_up || "";
        if (followUp) content += "\n\n" + followUp;
        const resultMsg: SessionMessage = { role: "assistant", content, is_answer: true, timestamp: Date.now() };
        setMessages([resultMsg]);
        addMessage(s.id, resultMsg);
        if (data.suggestions && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
          setSuggestions(data.suggestions);
        }
        if (data.action_items && Array.isArray(data.action_items) && data.action_items.length > 0) {
          const capped = data.action_items.slice(0, 5);
          setActionItems(capped);
          setSelectedActionIndices(new Set(capped.map((_: any, i: number) => i)));
          setActionItemsCreated(false);
        }
      } catch {
        setMessages([]);
      }
    };
    doProactive();
  }, [activeSession?.id, organization?.id]);

  const ensureSession = async () => {
    if (activeSession) return activeSession;
    if (!organization?.id) return null;
    const s = await createSession(organization.id, "Dashboard Chat");
    return s || null;
  };

  const apiAsk = async (text: string, ctx?: Record<string, string>, proactive?: boolean) => {
    const s = activeSession || await ensureSession();
    if (!s) return null;
    const mergedCtx = ctx ? { ...s.context, ...ctx } : s.context;
    const membersCtx = members?.length
      ? { org_members: JSON.stringify(members.map((m: any) => ({ name: m.full_name, email: m.email, role: m.role, department: m.department, manager_email: m.manager_email }))) }
      : {};
    const goalsCtx = myGoals?.length
      ? { org_goals: JSON.stringify(myGoals.map((g: any) => ({ title: g.title, status: g.status, progress: g.progress, assignee_id: g.assignee_id }))) }
      : {};
    const enrichedCtx = { ...mergedCtx, ...membersCtx, ...goalsCtx, user_email: user?.email || "" };
    const history = messages.map((m) => ({ role: m.role, content: m.content || "" }));
    const body: Record<string, any> = {
      message: text,
      session_id: s.id,
      session_context: enrichedCtx,
      context: {
        user_email: user?.email,
        organization_id: organization?.id,
        organization_name: organization?.name,
        role: role || "owner",
      },
      conversation_history: history.slice(-10),
    };
    if (proactive) body.proactive = true;
    const res = await fetch(`${API_URL}/assistant/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Ask failed");
    return res.json();
  };

  const apiAskStream = async (
    text: string,
    onToken: (token: string) => void,
    ctx?: Record<string, string>,
    proactive?: boolean,
  ): Promise<any> => {
    const s = activeSession || await ensureSession();
    if (!s) return null;
    const mergedCtx = ctx ? { ...s.context, ...ctx } : s.context;
    const membersCtx = members?.length
      ? { org_members: JSON.stringify(members.map((m: any) => ({ name: m.full_name, email: m.email, role: m.role, department: m.department, manager_email: m.manager_email }))) }
      : {};
    const goalsCtx = myGoals?.length
      ? { org_goals: JSON.stringify(myGoals.map((g: any) => ({ title: g.title, status: g.status, progress: g.progress, assignee_id: g.assignee_id }))) }
      : {};
    const enrichedCtx = { ...mergedCtx, ...membersCtx, ...goalsCtx, user_email: user?.email || "" };
    const history = messages.map((m) => ({ role: m.role, content: m.content || "" }));
    const body: Record<string, any> = {
      message: text,
      session_id: s.id,
      session_context: enrichedCtx,
      context: {
        user_email: user?.email,
        organization_id: organization?.id,
        organization_name: organization?.name,
        role: role || "owner",
      },
      conversation_history: history.slice(-10),
    };
    if (proactive) body.proactive = true;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(`${API_URL}/assistant/ask-stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error("Ask stream failed");

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buf = "";
    let metadata: any = null;
    const donePromise = new Promise<any>((resolve, reject) => {
      const abortTimer = setTimeout(() => {
        controller.abort();
        reject(new Error("Stream timeout"));
      }, 60000);
      const pump = () => {
        reader!.read().then(({ value, done }) => {
          if (done) {
            clearTimeout(abortTimer);
            resolve(metadata);
            return;
          }
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() || "";
          for (const part of parts) {
            const lines = part.split("\n");
            let eventType = "message";
            let data = "";
            for (const line of lines) {
              if (line.startsWith("event: ")) eventType = line.slice(7).trim();
              else if (line.startsWith("data: ")) data = line.slice(6);
            }
            if (!data) continue;
            if (eventType === "done") { clearTimeout(abortTimer); resolve(metadata); return; }
            if (eventType === "metadata") { try { metadata = JSON.parse(data); } catch {} continue; }
            try {
              const parsed = JSON.parse(data);
              if (parsed.token) onToken(parsed.token);
            } catch {}
          }
          pump();
        }).catch((err) => {
          clearTimeout(abortTimer);
          reject(err);
        });
      };
      pump();
    });
    return donePromise;
  };

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

  const findMemberByName = useCallback(
    (query: string) => {
      if (!query || !members?.length) return null;
      const q = query.trim().toLowerCase();
      if (!q) return null;
      const exact = members.find((m: any) => (m.full_name || "").toLowerCase() === q);
      if (exact) return exact;
      const startsWith = members.find((m: any) =>
        (m.full_name || "").toLowerCase().startsWith(q)
      );
      if (startsWith) return startsWith;
      const includes = members.find((m: any) =>
        (m.full_name || "").toLowerCase().includes(q)
      );
      return includes || null;
    },
    [members]
  );

  const extractKpiTitleFromAssistant = useCallback((reply: string): string | null => {
    if (!reply) return null;
    const cleaned = reply
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/[*_`>#-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const metricSuffixes = "Rate|Ratio|Count|Score|Index|Margin|Growth|Trend|Volume|NPS|CAC|LTV|MRR|ARR|Velocity|Efficiency|Productivity|Engagement|Satisfaction|Pipeline|Runway|Burn|Retention|Conversion|Churn|Forecast|Throughput";

    const suffixMatch = cleaned.match(
      new RegExp("\\b([A-Za-z][A-Za-z0-9 &/'-]{2,50}?)\\s+(?:" + metricSuffixes + ")\\b", "i")
    );
    if (suffixMatch) {
      const t = suffixMatch[0].trim();
      if (t.length >= 3 && t.length <= 60) return t.charAt(0).toUpperCase() + t.slice(1);
    }

    return null;
  }, []);

  const isKpiIntent = useCallback((msg: string): boolean => {
    const m = msg.toLowerCase();
    return /\b(add|track|make|create|set|turn|convert)\b[^.\n]{0,40}\bkpi\b/.test(m) ||
      /\bkpi\b[^.\n]{0,40}\b(add|track|create|set|register|for)\b/.test(m);
  }, []);

  const handleAddAsKPI = useCallback(
    (title?: string, sourceReply?: string) => {
      if (!organization?.id) return;
      const activeSess = useSessionStore.getState().getActiveSession();
      const sessId = activeSess?.id;
      const baseSource = sourceReply ||
        [...messages].reverse().find((m) => m.role === "assistant")?.content ||
        "";
      const finalTitle = (title || extractKpiTitleFromAssistant(baseSource) || "").trim();
      if (!finalTitle) {
        const noKpiMsg: SessionMessage = { role: "assistant", content: "I couldn't pin down which metric to track as a KPI from our last reply. Could you name it? (e.g. *Customer Churn Rate*)", timestamp: Date.now() };
        setMessages([...messages, noKpiMsg]);
        if (sessId) addMessage(sessId, noKpiMsg);
        return;
      }
      const created = addKPI(organization.id, {
        title: finalTitle, source: "ai", sourceDetail: "Added from AI Business Analytics chat", category: "growth", icon: "BarChart3",
      });
      const confirm = created
        ? `✅ Added **${finalTitle}** as a new KPI card. It will start showing values as soon as the dashboard refreshes (every 30s).`
        : `I couldn't add that KPI right now — please try again.`;
      const userKpiMsg: SessionMessage = { role: "user", content: `Make this a KPI: ${finalTitle}`, timestamp: Date.now() };
      const asstKpiMsg: SessionMessage = { role: "assistant", content: confirm, timestamp: Date.now() };
      setMessages([...messages, userKpiMsg, asstKpiMsg]);
      if (sessId) { addMessage(sessId, userKpiMsg); addMessage(sessId, asstKpiMsg); }
    },
    [organization?.id, messages, addKPI, addMessage, extractKpiTitleFromAssistant]
  );

  // `overrideText` lets quick-reply chips send their action directly. Without it
  // they'd have to setInput() then call sendMessage(), which reads the previous
  // render's `input` and silently sends nothing. Guarded with a typeof check
  // because this is also used bare as onClick={sendMessage}, which passes an event.
  const sendMessage = async (overrideText?: string) => {
    const rawText = typeof overrideText === "string" ? overrideText : input;
    if ((!rawText.trim() && !attachedFile) || loading) return;
    const userMsg = rawText.trim();
    setInput("");
    setSuggestions(null);

    // Get or create session ONCE — reuse across all calls in this function
    const session = activeSession || await ensureSession();
    if (!session) return;
    const s = session;

    // Upload file first (if attached) — before answering a question or sending text
    if (attachedFile) {
      const fileName = attachedFile.name;
      if (userMsg) {
        // File + text: upload with text context, then proceed
        try {
          const result = await uploadAttachedFile(userMsg);
          if (result) {
            updateSessionContext(s.id, { recently_uploaded_file: fileName, file_text_preview: result.textPreview });
            checkTaskImport(result.fileId, fileName);
          }
        } catch { /* proceed */ }
      } else {
        // File-only: upload, then check for task import
        setLoading(true);
        try {
          const result = await uploadAttachedFile();
          if (result) {
            const hasTasks = await checkTaskImport(result.fileId, fileName);

            const fileMsg: SessionMessage = { role: "user", content: `📎 Uploaded: **${fileName}**`, timestamp: Date.now() };
            setMessages((prev) => [...prev, fileMsg]);
            addMessage(s.id, fileMsg);

            if (!hasTasks) {
              const resultMsg: SessionMessage = { role: "assistant", content: `✅ ${result.message}`, timestamp: Date.now() };
              setMessages((prev) => [...prev, resultMsg]);
              addMessage(s.id, resultMsg);
            }
            updateSessionContext(s.id, { recently_uploaded_file: fileName, file_text_preview: result.textPreview || "" });
          }
        } catch (err: any) {
          const errMsg: SessionMessage = { role: "assistant", content: `❌ Upload failed: ${err.message || "Unknown error"}`, timestamp: Date.now() };
          setMessages((prev) => [...prev, errMsg]);
          addMessage(s.id, errMsg);
        } finally {
          setLoading(false);
        }
        return;
      }
    }

    // If file uploaded with text + question pending → answer it
    if (pendingQuestion) {
      setPendingQuestion(null);
      await handleAnswerQuestion(pendingQuestion.field_id, userMsg, userMsg, s);
      return;
    }

    // No question pending — send as regular message (file already uploaded if any)
    if (!userMsg) return;

    const userMsgObj: SessionMessage = { role: "user", content: userMsg, timestamp: Date.now() };
    const updated = [...messages, userMsgObj];
    setMessages(updated);
    addMessage(s.id, userMsgObj);

    if (s.title === "New Chat" || s.title === "Dashboard Chat") {
      const autoTitle = userMsg.replace(/^(create|set|make|add)\s+(a\s+|an\s+)?/i, "").trim().slice(0, 50);
      if (autoTitle) renameSession(s.id, autoTitle);
    }

    if (isKpiIntent(userMsg) && organization?.id) {
      const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")?.content;
      const title = extractKpiTitleFromAssistant(lastAssistant || "") || userMsg.replace(/add|track|make|create|set|turn|convert|this|as|a|kpi/gi, "").trim();
      if (title) {
        const confirmQ: ClarifyingQuestion = {
          id: `confirm_kpi_${Date.now()}`,
          field_id: "confirm_kpi",
          text: `I understand you want to track **${title}** as a KPI. Shall I add it to your dashboard?`,
          options: [
            { value: "yes", label: "Yes, add it" },
            { value: "no", label: "No, thanks" },
          ],
          allow_custom: false,
        };
        setPendingQuestion(confirmQ);
        setQuestionCount(c => c + 1);
        return;
      } else {
        const kpiMsg: SessionMessage = { role: "assistant", content: "I see you want to track something as a KPI. Could you tell me the specific metric name you'd like to track? (e.g. *Customer Churn Rate*)", timestamp: Date.now() };
        setMessages([...updated, kpiMsg]);
        addMessage(s.id, kpiMsg);
        return;
      }
    }

    setLoading(true);
    const loadingMsg: SessionMessage = { role: "assistant", content: "", is_loading: true, timestamp: Date.now() };
    setMessages([...updated, loadingMsg]);

    let streamedAnswer = "";
    try {
      const data = await apiAskStream(
        userMsg,
        (token) => {
          streamedAnswer += token;
          setIsStreaming(true);
          setStreamingContent(streamedAnswer);
        },
      );
      setIsStreaming(false);
      if (!data) return;

      if (data.type === "question" && data.question) {
        const q = data.question as ClarifyingQuestion;
        const hasOptions = q.options && q.options.length > 0;
        if (hasOptions) {
          const qMsg: SessionMessage = { role: "assistant", content: q.text, is_question: true, timestamp: Date.now() };
          setPendingQuestion(q);
          setQuestionCount(c => c + 1);
          setMessages([...updated, qMsg]);
          addMessage(s.id, qMsg);
        } else {
          const qMsg: SessionMessage = { role: "assistant", content: q.text, timestamp: Date.now() };
          setMessages([...updated, qMsg]);
          addMessage(s.id, qMsg);
        }
      } else if (data.type === "answer" && data.answer) {
        let answer = data.answer;
        if (data.follow_up) answer += "\n\n" + data.follow_up;
        const answerMsg: SessionMessage = { role: "assistant", content: answer, is_answer: true, timestamp: Date.now() };
        setMessages([...updated, answerMsg]);
        addMessage(s.id, answerMsg);
        if (data.action_items && Array.isArray(data.action_items) && data.action_items.length > 0) {
          const capped = data.action_items.slice(0, 5);
          setActionItems(capped);
          setSelectedActionIndices(new Set(capped.map((_: any, i: number) => i)));
          setActionItemsCreated(false);
        }
        if (data.missing_data && data.missing_data.doc_type && data.missing_data.reason) {
          setMissingDataRequest({ ...data.missing_data, originalMessage: userMsg });
        }
        if (data.suggestions && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
          setSuggestions(data.suggestions);
        } else {
          setSuggestions(null);
        }
      } else {
        setIsStreaming(false);
        setSuggestions(null);
        const fallbackMsg: SessionMessage = { role: "assistant", content: "Thanks! Let me know if you have more questions.", timestamp: Date.now() };
        setMessages([...updated, fallbackMsg]);
        addMessage(s.id, fallbackMsg);
      }
    } catch {
      const errMsg: SessionMessage = { role: "assistant", content: "I'm having trouble connecting to my analysis engine. Please try again.", timestamp: Date.now() };
      setMessages([...updated, errMsg]);
      addMessage(s.id, errMsg);
    } finally {
      setLoading(false);
      setIsStreaming(false);
    }
  };

  const handleAnswerQuestion = async (fieldId: string, value: string, valueLabel: string, existingSession?: any) => {
    const s = existingSession || activeSession || await ensureSession();
    if (!s) return;

    setPendingQuestion(null);
    const userMsg: SessionMessage = { role: "user", content: valueLabel, timestamp: Date.now() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    addMessage(s.id, userMsg);

    updateSessionContext(s.id, { [fieldId]: value });

    if (fieldId === "confirm_kpi" && organization?.id) {
      if (value === "yes") {
        const title = extractKpiTitleFromAssistant(pendingQuestion?.text || "") || "New KPI";
        if (title) {
          const created = addKPI(organization.id, { title, source: "ai", sourceDetail: "Added from AI Business Analytics chat", category: "growth", icon: "BarChart3" });
          const confirm = created ? `✅ Added **${title}** as a new KPI card on your dashboard.` : `I couldn't add that KPI right now. Please try again.`;
          const kpiMsg: SessionMessage = { role: "assistant", content: confirm, timestamp: Date.now() };
          setMessages([...updated, kpiMsg]);
          addMessage(s.id, kpiMsg);
        }
      } else {
        const noMsg: SessionMessage = { role: "assistant", content: "No problem! Let me know if you need anything else.", timestamp: Date.now() };
        setMessages([...updated, noMsg]);
        addMessage(s.id, noMsg);
      }
      return;
    }

    setLoading(true);

    try {
      const data = await apiAsk(valueLabel, { ...s.context, [fieldId]: value });
      if (!data) return;

      if (data.type === "question" && data.question) {
        const q = data.question as ClarifyingQuestion;
        const hasOptions = q.options && q.options.length > 0;
        if (hasOptions) {
          const qMsg: SessionMessage = { role: "assistant", content: q.text, is_question: true, timestamp: Date.now() };
          setPendingQuestion(q);
          setQuestionCount(c => c + 1);
          setMessages([...updated, qMsg]);
          addMessage(s.id, qMsg);
        } else {
          const qMsg: SessionMessage = { role: "assistant", content: q.text, timestamp: Date.now() };
          setMessages([...updated, qMsg]);
          addMessage(s.id, qMsg);
        }
      } else if (data.type === "answer" && data.answer) {
        let answer = data.answer;
        if (data.follow_up) answer += "\n\n" + data.follow_up;
        const answerMsg: SessionMessage = { role: "assistant", content: answer, is_answer: true, timestamp: Date.now() };
        setMessages([...updated, answerMsg]);
        addMessage(s.id, answerMsg);
        if (data.action_items && Array.isArray(data.action_items) && data.action_items.length > 0) {
          const capped = data.action_items.slice(0, 5);
          setActionItems(capped);
          setSelectedActionIndices(new Set(capped.map((_: any, i: number) => i)));
          setActionItemsCreated(false);
        }
        if (data.missing_data && data.missing_data.doc_type && data.missing_data.reason) {
          setMissingDataRequest({ ...data.missing_data, originalMessage: valueLabel });
        }
        if (data.suggestions && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
          setSuggestions(data.suggestions);
        } else {
          setSuggestions(null);
        }
      } else {
        const fallbackMsg: SessionMessage = { role: "assistant", content: "Thanks! Let me know if you have more questions.", timestamp: Date.now() };
        setMessages([...updated, fallbackMsg]);
        addMessage(s.id, fallbackMsg);
      }
    } catch {
      const errMsg: SessionMessage = { role: "assistant", content: "Something went wrong. Please try again.", timestamp: Date.now() };
      setMessages([...updated, errMsg]);
      addMessage(s.id, errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleAttachFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachedFile(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachedFile = () => {
    setAttachedFile(null);
  };

  const uploadAttachedFile = async (text?: string): Promise<{ message: string; textPreview: string; fileId: string } | null> => {
    if (!attachedFile || !organization?.id) return null;
    setUploading(true);
    setInsightsLoading(true);
    const formData = new FormData();
    formData.append("file", attachedFile);
    formData.append("organization_id", organization.id);
    if (text?.trim()) formData.append("text_context", text.trim());

    try {
      const response = await fetch(`${API_URL}/strategy-chat/upload-and-analyze`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Upload failed");
      const data = await response.json();
      const fileName = attachedFile.name;
      setAttachedFile(null);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("kpi-document-uploaded", { detail: { filename: fileName } }));
      }

      // Fetch proactive insights after successful upload
      try {
        const insRes = await fetch(`${API_URL}/assistant/generate-insights`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organization_id: organization.id }),
        });
        if (insRes.ok) {
          const insData = await insRes.json();
          if (insData.insights && insData.insights.length > 0) {
            setInsights(insData.insights);
          }
        }
      } catch { /* insights are optional */ }

      return { message: data.message || `File **${fileName}** processed.`, textPreview: data.text_preview || "", fileId: data.file_id || "" };
    } catch (err: any) {
      setAttachedFile(null);
      throw err;
    } finally {
      setUploading(false);
      setInsightsLoading(false);
    }
  };

  const checkTaskImport = useCallback(async (fileId: string, fileName: string): Promise<boolean> => {
    if (!organization?.id) return false;
    const ext = fileName.toLowerCase().split(".").pop();
    if (ext !== "xlsx" && ext !== "xls") return false;

    setTaskImportLoading(true);
    try {
      const formData = new FormData();
      formData.append("file_id", fileId);
      formData.append("organization_id", organization.id);
      const res = await fetch(`${API_URL}/tasks/bulk-import/preview`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (data.is_task_file && data.detected_count > 0) {
        setTaskImportPreview(data);
        setTaskImportResult(null);
        setSelectedTaskIndices(new Set(data.rows.map((_: any, i: number) => i)));
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      setTaskImportLoading(false);
    }
  }, [organization?.id]);

  const handleTaskImportConfirm = async () => {
    if (!taskImportPreview || !organization?.id) return;
    const selectedRows = taskImportPreview.rows.filter((_: any, i: number) => selectedTaskIndices.has(i));
    if (selectedRows.length === 0) return;
    setTaskImportConfirming(true);
    try {
      const formData = new FormData();
      formData.append("tasks", JSON.stringify(selectedRows));
      formData.append("organization_id", organization.id);
      const res = await fetch(`${API_URL}/tasks/bulk-import/confirm`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Import failed" }));
        throw new Error(err.detail);
      }
      const data = await res.json();
      setTaskImportResult(data);
      setTaskImportPreview(null);

      if (data.suggestion) {
        setImportSuggestion(data.suggestion);
      }

      let content = `✅ **Bulk Import Complete** — ${data.created_count} tasks created${data.failed_count > 0 ? `, ${data.failed_count} failed` : ""}.`;
      if (data.suggestion?.suggestion_text) {
        content += `\n\n💡 ${data.suggestion.suggestion_text}`;
      }
      const resultMsg: SessionMessage = {
        role: "assistant",
        content,
        timestamp: Date.now(),
      };
      const session = activeSession || sessions[0];
      if (session) {
        setMessages((prev) => [...prev, resultMsg]);
        addMessage(session.id, resultMsg);
      }
    } catch (err: any) {
      const errMsg: SessionMessage = {
        role: "assistant",
        content: `❌ Import failed: ${err.message}`,
        timestamp: Date.now(),
      };
      const session = activeSession || sessions[0];
      if (session) {
        setMessages((prev) => [...prev, errMsg]);
        addMessage(session.id, errMsg);
      }
    } finally {
      setTaskImportConfirming(false);
    }
  };

  const toggleTaskSelection = (index: number) => {
    setSelectedTaskIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const selectAllTasks = () => {
    if (!taskImportPreview) return;
    setSelectedTaskIndices(new Set(taskImportPreview.rows.map((_: any, i: number) => i)));
  };

  const deselectAllTasks = () => {
    setSelectedTaskIndices(new Set());
  };

  const dismissTaskImport = () => {
    setTaskImportPreview(null);
    setTaskImportResult(null);
    setImportSuggestion(null);
    setSuggestionGoalCreated(false);
    setSelectedTaskIndices(new Set());
  };

  const dismissImportSuggestion = () => {
    setImportSuggestion(null);
    setSuggestionGoalCreated(false);
  };

  const handleMissingDataUpload = async () => {
    if (!missingDataRequest || !organization?.id) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.docx,.txt,.csv,.xlsx,.xls,.png,.jpg,.jpeg";
    input.onchange = async (e: any) => {
      const file = e.target?.files?.[0];
      if (!file) return;
      setReAnalyzing(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("organization_id", organization.id);
        const uploadRes = await fetch(`${API_URL}/strategy-chat/upload-and-analyze`, {
          method: "POST",
          body: formData,
        });
        if (!uploadRes.ok) throw new Error("Upload failed");
        const uploadData = await uploadRes.json();
        const fileId = uploadData.file_id;
        if (!fileId) throw new Error("No file_id in upload response");

        const reRes = await fetch(`${API_URL}/assistant/re-analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            file_id: fileId,
            original_message: missingDataRequest.originalMessage,
            organization_id: organization.id,
            session_id: activeSession?.id || sessions[0]?.id,
            context: {
              user_email: user?.email,
              organization_id: organization?.id,
              organization_name: organization?.name,
              role: role || "owner",
            },
            conversation_history: messages.map((m) => ({ role: m.role, content: m.content || "" })).slice(-10),
          }),
        });
        if (!reRes.ok) throw new Error("Re-analysis failed");
        const reData = await reRes.json();

        setMissingDataRequest(null);

        if (reData.type === "answer" && reData.answer) {
          let answer = reData.answer;
          if (reData.follow_up) answer += "\n\n" + reData.follow_up;
          const answerMsg: SessionMessage = { role: "assistant", content: answer, is_answer: true, timestamp: Date.now() };
          const session = activeSession || sessions[0];
          if (session) {
            setMessages((prev) => [...prev, answerMsg]);
            addMessage(session.id, answerMsg);
          }
          if (reData.action_items && Array.isArray(reData.action_items) && reData.action_items.length > 0) {
            const capped = reData.action_items.slice(0, 5);
            setActionItems(capped);
            setSelectedActionIndices(new Set(capped.map((_: any, i: number) => i)));
            setActionItemsCreated(false);
          }
        } else {
          const fallbackMsg: SessionMessage = { role: "assistant", content: reData.answer || "Thanks! I've analyzed the file. What else can I help with?", timestamp: Date.now() };
          const session = activeSession || sessions[0];
          if (session) {
            setMessages((prev) => [...prev, fallbackMsg]);
            addMessage(session.id, fallbackMsg);
          }
        }
      } catch (err: any) {
        const errMsg: SessionMessage = { role: "assistant", content: `❌ Re-analysis failed: ${err.message}`, timestamp: Date.now() };
        const session = activeSession || sessions[0];
        if (session) {
          setMessages((prev) => [...prev, errMsg]);
          addMessage(session.id, errMsg);
        }
      } finally {
        setReAnalyzing(false);
      }
    };
    input.click();
  };

  const dismissMissingData = () => {
    setMissingDataRequest(null);
  };

  const dismissInsight = (index: number) => {
    setInsights((prev) => prev.filter((_, i) => i !== index));
  };

  const dismissAllInsights = () => {
    setInsights([]);
  };

  const handleCreateInsightGoal = async (insight: any) => {
    if (!insight?.suggested_goal_title || !organization?.id) return;
    try {
      const res = await fetch(`${API_URL}/goals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: insight.suggested_goal_title,
          description: insight.explanation || "",
          organization_id: organization.id,
          department: insight.suggested_department || null,
          priority: "medium",
        }),
      });
      if (!res.ok) throw new Error("Failed to create goal");
      const created = await res.json();
      const goalMsg: SessionMessage = {
        role: "assistant",
        content: `🎯 **Goal Created:** "${created.title || insight.suggested_goal_title}" from your document insight.`,
        timestamp: Date.now(),
      };
      const session = activeSession || sessions[0];
      if (session) {
        setMessages((prev) => [...prev, goalMsg]);
        addMessage(session.id, goalMsg);
      }
      dismissInsight(insights.indexOf(insight));
    } catch (err: any) {
      const errMsg: SessionMessage = {
        role: "assistant",
        content: `❌ Failed to create goal: ${err.message}`,
        timestamp: Date.now(),
      };
      const session = activeSession || sessions[0];
      if (session) {
        setMessages((prev) => [...prev, errMsg]);
        addMessage(session.id, errMsg);
      }
    }
  };

  const handleCreateSuggestedGoal = async () => {
    if (!importSuggestion?.suggested_goal_title || !organization?.id) return;
    setSuggestionGoalCreating(true);
    try {
      const res = await fetch(`${API_URL}/goals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: importSuggestion.suggested_goal_title,
          description: importSuggestion.suggested_goal_description || `Goal auto-created from imported task cluster`,
          organization_id: organization.id,
          priority: "medium",
        }),
      });
      if (!res.ok) throw new Error("Failed to create goal");
      setSuggestionGoalCreated(true);
      const created = await res.json();
      const goalMsg: SessionMessage = {
        role: "assistant",
        content: `🎯 **Goal Created:** "${created.title || importSuggestion.suggested_goal_title}" — tasks from this import are now trackable under this goal.`,
        timestamp: Date.now(),
      };
      const session = activeSession || sessions[0];
      if (session) {
        setMessages((prev) => [...prev, goalMsg]);
        addMessage(session.id, goalMsg);
      }
    } catch (err: any) {
      const errMsg: SessionMessage = {
        role: "assistant",
        content: `❌ Failed to create goal: ${err.message}`,
        timestamp: Date.now(),
      };
      const session = activeSession || sessions[0];
      if (session) {
        setMessages((prev) => [...prev, errMsg]);
        addMessage(session.id, errMsg);
      }
    } finally {
      setSuggestionGoalCreating(false);
    }
  };

  const toggleActionSelection = (index: number) => {
    setSelectedActionIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleCreateActionItems = async () => {
    if (!actionItems || !organization?.id) return;
    const selected = actionItems.filter((_: any, i: number) => selectedActionIndices.has(i));
    if (selected.length === 0) return;
    setActionItemsCreating(true);
    try {
      const membersCtx = members?.length
        ? { org_members: JSON.stringify(members.map((m: any) => ({ name: m.full_name, email: m.email }))) }
        : {};
      const res = await fetch(`${API_URL}/assistant/bulk-create-tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: organization.id,
          action_items: selected.map((item: any) => ({
            title: item.title,
            description: item.description || "",
            priority: item.priority || "medium",
            assignee_name: item.assignee_name || null,
            assignee_email: item.assignee_email || null,
          })),
          context: { organization_id: organization.id, user_email: user?.email },
        }),
      });
      if (!res.ok) throw new Error("Bulk create failed");
      const data = await res.json();
      const resultMsg: SessionMessage = {
        role: "assistant",
        content: `✅ **${data.created_count} action item${data.created_count !== 1 ? "s" : ""} turned into tasks**${data.failed_count > 0 ? ` (${data.failed_count} failed)` : ""}.`,
        timestamp: Date.now(),
      };
      const session = activeSession || sessions[0];
      if (session) {
        setMessages((prev) => [...prev, resultMsg]);
        addMessage(session.id, resultMsg);
      }
      setActionItemsCreated(true);
    } catch (err: any) {
      const errMsg: SessionMessage = {
        role: "assistant",
        content: `❌ Failed to create tasks: ${err.message}`,
        timestamp: Date.now(),
      };
      const session = activeSession || sessions[0];
      if (session) {
        setMessages((prev) => [...prev, errMsg]);
        addMessage(session.id, errMsg);
      }
    } finally {
      setActionItemsCreating(false);
    }
  };

  const dismissActionItems = () => {
    setActionItems(null);
    setSelectedActionIndices(new Set());
    setActionItemsCreated(false);
  };

  const fetchSessionInsights = async () => {
    if (!organization?.id || sessionInsightsOpen) return;
    setSessionInsightsLoading(true);
    setSessionInsightsOpen(true);
    try {
      const res = await fetch(`${API_URL}/sessions/insights/${organization.id}?limit=20`, {
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        setSessionInsights(data.insights || []);
      }
    } catch {
      // silent
    } finally {
      setSessionInsightsLoading(false);
    }
  };

  const confirmSessionInsight = async (insightId: string) => {
    try {
      await fetch(`${API_URL}/sessions/insights/confirm?insight_id=${insightId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      setSessionInsights((prev) => prev.filter((i) => i._id !== insightId));
    } catch {
      // silent
    }
  };

  const dismissSessionInsight = async (insightId: string) => {
    try {
      await fetch(`${API_URL}/sessions/insights/dismiss?insight_id=${insightId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      setSessionInsights((prev) => prev.filter((i) => i._id !== insightId));
    } catch {
      // silent
    }
  };

  const handleNewSession = async () => {
    if (!organization?.id) return;
    await createSession(organization.id, "New Chat");
    setMessages([]);
  };

  const handleRenameConfirm = (sessionId: string) => {
    if (renameValue.trim()) {
      renameSession(sessionId, renameValue.trim());
    }
    setRenamingId(null);
  };

  const handleDeleteSession = (sessionId: string) => {
    deleteSession(sessionId);
    if (sessionId === activeSessionId) {
      setMessages([]);
    }
  };

  return (
    <Card className="flex flex-col h-full min-h-[520px]">
      <CardHeader className="flex-shrink-0 pb-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          <CardTitle>AI Business Analytics</CardTitle>
          <Badge variant="default" className="text-[10px] ml-2">Real-time</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex min-h-0 p-0">
        {/* Session Sidebar */}
        <div className={`${sidebarOpen ? "w-52" : "w-0"} flex-shrink-0 border-r border-border bg-surface/20 flex flex-col overflow-hidden transition-all duration-200`}>
          <div className="p-2.5 border-b border-border flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1 rounded hover:bg-surface-light text-text-muted hover:text-foreground transition-colors cursor-pointer flex-shrink-0"
              title="Collapse sidebar"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {sidebarOpen && (
              <button
                onClick={handleNewSession}
                className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                New Session
              </button>
            )}
          </div>
          {sidebarOpen && (
            <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 custom-scrollbar">
              {sessions.length === 0 && (
                <p className="px-3 py-3 text-xs text-text-muted text-center">No sessions yet</p>
              )}
              {sessions.map((s) => (
                <div
                  key={s.id}
                  onClick={() => { setActiveSession(s.id); setMessages(s.messages); }}
                  className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs cursor-pointer transition-all ${
                    s.id === activeSessionId
                      ? "bg-primary/15 text-foreground border border-primary/30"
                      : "hover:bg-surface-light text-text-muted border border-transparent"
                  }`}
                >
                  <MessageSquare className="w-3 h-3 flex-shrink-0" />
                  {renamingId === s.id ? (
                    <input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") handleRenameConfirm(s.id); }}
                      onBlur={() => handleRenameConfirm(s.id)}
                      className="flex-1 bg-surface border border-border rounded px-1 py-0.5 text-[11px] outline-none"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="flex-1 truncate">{s.title}</span>
                  )}
                  <div className="hidden group-hover:flex items-center gap-0.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); setRenamingId(s.id); setRenameValue(s.title); }}
                      className="p-0.5 rounded hover:bg-surface-light text-text-muted hover:text-foreground cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.id); }}
                      className="p-0.5 rounded hover:bg-surface-light text-text-muted hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {sidebarOpen && (
            <div className="border-t border-border">
              <button
                onClick={fetchSessionInsights}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-text-muted hover:text-foreground hover:bg-surface-light/50 transition-colors cursor-pointer"
              >
                <Lightbulb className="w-3.5 h-3.5" />
                <span>Past Insights</span>
                {sessionInsightsLoading && <Loader2 className="w-3 h-3 animate-spin ml-auto" />}
                {!sessionInsightsOpen && !sessionInsightsLoading && <span className="ml-auto text-[10px] text-primary">Show</span>}
              </button>
              {sessionInsightsOpen && (
                <div className="max-h-[200px] overflow-y-auto p-1.5 space-y-1 custom-scrollbar">
                  {sessionInsights.length === 0 && !sessionInsightsLoading && (
                    <p className="px-2 py-2 text-[10px] text-text-muted text-center">No pending insights</p>
                  )}
                  {sessionInsights.map((insight: any) => (
                    <div key={insight._id} className="group flex items-start gap-1.5 px-2 py-1.5 rounded-lg bg-surface/30 text-[10px]">
                      <span className="flex-1 text-text-muted leading-relaxed line-clamp-2">{insight.summary}</span>
                      <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
                        <button
                          onClick={() => confirmSessionInsight(insight._id)}
                          className="p-0.5 rounded hover:bg-emerald-500/20 text-text-muted hover:text-emerald-400 cursor-pointer"
                          title="Mark as done"
                          aria-label={`Confirm insight: ${(insight.summary || "").slice(0, 60)}`}
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => dismissSessionInsight(insight._id)}
                          className="p-0.5 rounded hover:bg-rose-500/20 text-text-muted hover:text-rose-400 cursor-pointer"
                          title="Dismiss"
                          aria-label={`Dismiss insight: ${(insight.summary || "").slice(0, 60)}`}
                        >
                          <span className="text-[11px] font-bold leading-none" aria-hidden="true">×</span>
                        </button>
                      </div>
                    </div>
                  ))}
                  {sessionInsights.length > 0 && (
                    <button
                      onClick={() => setSessionInsightsOpen(false)}
                      className="w-full text-[10px] text-text-muted hover:text-foreground text-center pt-1 cursor-pointer"
                    >
                      Collapse
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        {!sidebarOpen && (
          <div className="flex-shrink-0 w-8 flex flex-col items-center pt-2 border-r border-border bg-surface/20">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded hover:bg-surface-light text-text-muted hover:text-foreground transition-colors cursor-pointer"
              title="Expand sidebar"
            >
              <ChevronLeft className="w-4 h-4 rotate-180" />
            </button>
          </div>
        )}

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar min-h-0">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center mb-4">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-lg font-semibold text-foreground mb-1">How can I help you today?</h2>
                <p className="text-sm text-text-muted font-medium max-w-sm mb-6">
                  Ask me anything about your business — goals, tasks, documents, or advice.
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {[
                    "What should I focus on this week?",
                    "Summarize my latest document",
                    "How are my goals tracking?",
                    "Give me business advice",
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setInput(prompt)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-surface border border-border/50 hover:border-primary/30 hover:bg-surface-light transition-colors text-text-muted cursor-pointer"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg, i) => {
              if (msg.is_loading) {
                if (isStreaming) return null;
                return (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center flex-shrink-0 mt-1">
                      <Sparkles className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="claude-loader" />
                      <span className="text-xs text-text-muted">Thinking...</span>
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={i}
                  className={`flex items-start gap-3 ${
                    msg.role === "user" ? "flex-row-reverse" : ""
                  } animate-in fade-in slide-in-from-bottom-1 duration-200`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${
                      msg.role === "user"
                        ? "bg-gradient-to-br from-primary to-purple-500"
                        : "bg-gradient-to-br from-primary to-purple-500"
                    }`}
                  >
                    {msg.role === "user" ? (
                      <span className="text-white font-bold text-xs">
                        {user?.email?.charAt(0).toUpperCase() || "U"}
                      </span>
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-white" />
                    )}
                  </div>
                  <div
                    className={`text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "max-w-[75%] px-4 py-2.5 rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/20 text-foreground"
                        : "max-w-[90%] text-foreground"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              );
            })}
          {isStreaming && (
            <div className="flex items-start gap-3 animate-in fade-in slide-in-from-bottom-1 duration-200">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center flex-shrink-0 mt-1">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="max-w-[90%] text-foreground">
                <div className="text-sm leading-relaxed">
                  <span dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingContent) }} />
                  <span className="inline-block w-1.5 h-4 bg-primary/70 animate-pulse ml-0.5 rounded-sm align-middle" />
                </div>
              </div>
            </div>
          )}
          {uploading && (
            <div className="flex items-center gap-2 text-text-muted text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Uploading and analyzing file...
            </div>
          )}
          <div ref={chatEndRef} />
          </div>
        {suggestions && suggestions.length > 0 && !loading && (
          <div className="flex-shrink-0 px-4 py-2 border-t border-border/50">
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Suggested follow-up actions"
              onKeyDown={(e) => {
                const buttons = (e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>("button");
                const current = Array.from(buttons).findIndex((b) => b === document.activeElement);
                if (current === -1) return;
                let next = current;
                if (e.key === "ArrowRight") next = (current + 1) % buttons.length;
                else if (e.key === "ArrowLeft") next = (current - 1 + buttons.length) % buttons.length;
                else return;
                e.preventDefault();
                buttons[next]?.focus();
              }}
            >
              {suggestions.map((s: any, i: number) => (
                <button
                  key={i}
                  type="button"
                  disabled={loading}
                  tabIndex={0}
                  onClick={() => {
                    setSuggestions(null);
                    sendMessage(s.action || s.label);
                  }}
                  className="px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 text-xs text-foreground cursor-pointer transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {pendingQuestion && (
          <div className="flex-shrink-0 border-t border-border bg-surface/40 px-4 py-3">
            <QuestionCard
              question={pendingQuestion}
              onAnswer={(fieldId, value, label) => handleAnswerQuestion(fieldId, value, label)}
              onSkip={() => { setPendingQuestion(null); sendMessage(); }}
              disabled={loading}
              questionNumber={questionCount}
            />
          </div>
        )}
        {missingDataRequest && (
          <div className="flex-shrink-0 border-t border-border bg-surface/40 px-4 py-3">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-primary">
                  📄 <span className="text-foreground">Missing Data</span>
                </p>
                <Button variant="outline" onClick={dismissMissingData} className="text-xs cursor-pointer" size="sm">
                  Dismiss
                </Button>
              </div>
              <div className="p-3 rounded-lg border border-dashed border-primary/30 bg-primary/5">
                <p className="text-sm font-medium mb-1">
                  I need your <span className="text-primary">{missingDataRequest.doc_type}</span>
                </p>
                <p className="text-xs text-text-muted mb-3">{missingDataRequest.reason}</p>
                <Button
                  onClick={handleMissingDataUpload}
                  disabled={reAnalyzing}
                  className="text-xs cursor-pointer"
                  size="sm"
                >
                  {reAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}
                  {reAnalyzing ? "Analyzing..." : `Upload ${missingDataRequest.doc_type}`}
                </Button>
              </div>
            </div>
          </div>
        )}
        {actionItems && !actionItemsCreated && (
          <div className="flex-shrink-0 border-t border-border bg-surface/40 px-4 py-3 max-h-[360px] overflow-y-auto">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-primary">
                  📋 <span className="text-foreground">{selectedActionIndices.size}</span> of {actionItems.length} action items
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={dismissActionItems} className="text-xs cursor-pointer" size="sm">
                    Dismiss
                  </Button>
                  <Button
                    onClick={handleCreateActionItems}
                    disabled={actionItemsCreating || selectedActionIndices.size === 0}
                    className="text-xs cursor-pointer"
                    size="sm"
                  >
                    {actionItemsCreating ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    {actionItemsCreating ? "Creating..." : `Create ${selectedActionIndices.size} Task${selectedActionIndices.size !== 1 ? "s" : ""}`}
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
                {actionItems.map((item: any, i: number) => (
                  <div
                    key={i}
                    role="checkbox"
                    aria-checked={selectedActionIndices.has(i)}
                    aria-label={`${item.title} (${item.priority} priority${item.assignee_name ? `, assignee: ${item.assignee_name}` : ""})`}
                    tabIndex={0}
                    onClick={() => toggleActionSelection(i)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleActionSelection(i); } }}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                      selectedActionIndices.has(i)
                        ? "bg-background border-border/50"
                        : "bg-surface/30 border-border/20 opacity-60"
                    }`}
                  >
                    <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border transition-colors ${
                      selectedActionIndices.has(i)
                        ? "bg-primary border-primary text-white"
                        : "border-border hover:border-primary/50"
                    }`} aria-hidden="true">
                      {selectedActionIndices.has(i) && (
                        <Check className="w-3 h-3" />
                      )}
                    </div>
                    <span className="flex-1 truncate font-medium">{item.title}</span>
                    {item.assignee_name && (
                      <span className="text-text-muted truncate max-w-[120px]">{item.assignee_name}</span>
                    )}
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full capitalize flex-shrink-0 ${
                      item.priority === "high" ? "bg-rose-500/10 text-rose-400" :
                      item.priority === "low" ? "bg-emerald-500/10 text-emerald-400" :
                      "bg-amber-500/10 text-amber-400"
                    }`}>
                      {item.priority}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {importSuggestion && !suggestionGoalCreated && (
          <div className="flex-shrink-0 border-t border-border bg-surface/40 px-4 py-3">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-primary">💡 After Import Suggestion</p>
                <Button variant="outline" onClick={dismissImportSuggestion} className="text-xs cursor-pointer" size="sm">
                  Dismiss
                </Button>
              </div>
              <div className="space-y-2 text-sm">
                {importSuggestion.suggested_goal_title && (
                  <div className="flex items-center justify-between p-2 rounded-lg border bg-background border-border/50">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">🎯 Create goal: <span className="text-primary">{importSuggestion.suggested_goal_title}</span></p>
                      {importSuggestion.suggested_goal_description && (
                        <p className="text-xs text-text-muted truncate mt-0.5">{importSuggestion.suggested_goal_description}</p>
                      )}
                    </div>
                    <Button
                      onClick={handleCreateSuggestedGoal}
                      disabled={suggestionGoalCreating}
                      className="text-xs cursor-pointer ml-3 flex-shrink-0"
                      size="sm"
                    >
                      {suggestionGoalCreating ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                      {suggestionGoalCreating ? "Creating..." : "Create Goal"}
                    </Button>
                  </div>
                )}
                {importSuggestion.tasks_without_dates_count > 0 && (
                  <div className="p-2 rounded-lg border bg-amber-500/5 border-amber-500/20">
                    <p className="text-xs">
                      ⏰ <span className="font-medium">{importSuggestion.tasks_without_dates_count} task{importSuggestion.tasks_without_dates_count !== 1 ? "s" : ""}</span> {importSuggestion.tasks_without_dates_count !== 1 ? "have" : "has"} no due date — consider setting deadlines to keep things on track.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {insights.length > 0 && (
          <div className="flex-shrink-0 border-t border-border bg-surface/40 px-4 py-3 max-h-[400px] overflow-y-auto">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-primary">
                  💡 <span className="text-foreground">{insights.length} insight{insights.length !== 1 ? "s" : ""} from your documents</span>
                </p>
                <Button variant="outline" onClick={dismissAllInsights} className="text-xs cursor-pointer" size="sm">
                  Dismiss all
                </Button>
              </div>
              <div className="space-y-2">
                {insights.map((insight: any, i: number) => (
                  <div key={i} className="p-3 rounded-lg border bg-background border-border/50 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full capitalize ${
                            insight.type === "trend" ? "bg-blue-500/10 text-blue-400" :
                            insight.type === "anomaly" ? "bg-rose-500/10 text-rose-400" :
                            insight.type === "gap" ? "bg-amber-500/10 text-amber-400" :
                            insight.type === "benchmark" ? "bg-emerald-500/10 text-emerald-400" :
                            "bg-purple-500/10 text-purple-400"
                          }`}>{insight.type}</span>
                        </div>
                        <p className="text-sm font-medium">{insight.title}</p>
                        <p className="text-xs text-text-muted mt-0.5">{insight.explanation}</p>
                      </div>
                      <button onClick={() => dismissInsight(i)} aria-label={`Dismiss insight: ${insight.title || ""}`} className="text-text-muted hover:text-foreground cursor-pointer flex-shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                    {insight.suggested_goal_title && (
                      <Button
                        onClick={() => handleCreateInsightGoal(insight)}
                        className="text-xs cursor-pointer"
                        size="sm"
                      >
                        🎯 Create Goal
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {insightsLoading && (
          <div className="flex-shrink-0 border-t border-border px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing your documents for insights...
            </div>
          </div>
        )}
        {taskImportLoading && (
          <div className="flex-shrink-0 border-t border-border px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <Loader2 className="w-4 h-4 animate-spin" />
              Detecting tasks in your file...
            </div>
          </div>
        )}
        {taskImportPreview && !taskImportResult && (
          <div className="flex-shrink-0 border-t border-border bg-surface/40 px-4 py-3 max-h-[400px] overflow-y-auto">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <p className="text-sm font-medium text-primary">
                    📊 <span className="text-foreground">{selectedTaskIndices.size}</span> of {taskImportPreview.detected_count} tasks selected
                  </p>
                  {selectedTaskIndices.size === taskImportPreview.detected_count ? (
                    <button onClick={deselectAllTasks} className="text-[11px] text-text-muted hover:text-primary cursor-pointer underline-offset-2 hover:underline">
                      Deselect All
                    </button>
                  ) : (
                    <button onClick={selectAllTasks} className="text-[11px] text-text-muted hover:text-primary cursor-pointer underline-offset-2 hover:underline">
                      Select All
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={dismissTaskImport} className="text-xs cursor-pointer" size="sm">
                    Dismiss
                  </Button>
                  <Button
                    onClick={handleTaskImportConfirm}
                    disabled={taskImportConfirming || selectedTaskIndices.size === 0}
                    className="text-xs cursor-pointer"
                    size="sm"
                  >
                    {taskImportConfirming ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    {taskImportConfirming ? "Importing..." : `Import ${selectedTaskIndices.size} of ${taskImportPreview.detected_count} Tasks`}
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                {taskImportPreview.rows.slice(0, 50).map((row: any, i: number) => (
                  <div
                    key={i}
                    role="checkbox"
                    aria-checked={selectedTaskIndices.has(i)}
                    aria-label={`${row.title} (${row.priority} priority${row.assignee_name ? `, assignee: ${row.assignee_name}` : ""})`}
                    tabIndex={0}
                    onClick={() => toggleTaskSelection(i)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleTaskSelection(i); } }}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                      selectedTaskIndices.has(i)
                        ? "bg-background border-border/50"
                        : "bg-surface/30 border-border/20 opacity-60"
                    }`}
                  >
                    <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border transition-colors ${
                      selectedTaskIndices.has(i)
                        ? "bg-primary border-primary text-white"
                        : "border-border hover:border-primary/50"
                    }`} aria-hidden="true">
                      {selectedTaskIndices.has(i) && (
                        <Check className="w-3 h-3" />
                      )}
                    </div>
                    <span className="flex-1 truncate font-medium">{row.title}</span>
                    {row.assignee_name && (
                      <span className="text-text-muted truncate max-w-[120px]">{row.assignee_name}</span>
                    )}
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full capitalize flex-shrink-0 ${
                      row.priority === "high" ? "bg-rose-500/10 text-rose-400" :
                      row.priority === "low" ? "bg-emerald-500/10 text-emerald-400" :
                      "bg-amber-500/10 text-amber-400"
                    }`}>
                      {row.priority}
                    </span>
                  </div>
                ))}
                {taskImportPreview.detected_count > 50 && (
                  <p className="text-[10px] text-text-muted text-center">
                    +{taskImportPreview.detected_count - 50} more tasks
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        {taskImportResult && (
          <div className="flex-shrink-0 border-t border-border px-4 py-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <div>
                <p className="text-sm font-medium text-emerald-400">✅ Import Complete</p>
                <p className="text-xs text-text-muted">{taskImportResult.created_count} tasks created{taskImportResult.failed_count > 0 ? `, ${taskImportResult.failed_count} failed` : ""}</p>
              </div>
              <Button variant="outline" onClick={dismissTaskImport} className="text-xs cursor-pointer" size="sm">
                Dismiss
              </Button>
            </div>
          </div>
        )}
        <div className="flex flex-col px-4 pb-4 pt-2 border-t border-border flex-shrink-0">
          {attachedFile && (
            <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-xs">
              <Paperclip className="w-3.5 h-3.5 text-primary" />
              <span className="flex-1 truncate text-foreground">{attachedFile.name}</span>
              <button
                onClick={removeAttachedFile}
                className="p-0.5 rounded hover:bg-surface-light text-text-muted hover:text-rose-400 cursor-pointer"
              >
                X
              </button>
            </div>
          )}
          <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.csv,.xlsx,.xls,.png,.jpg,.jpeg"
            className="hidden"
            onChange={handleAttachFile}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            variant="outline"
            size="icon"
            className="cursor-pointer flex-shrink-0"
            title="Attach a file"
          >
            <Paperclip className="w-4 h-4" />
          </Button>
          <div className="relative flex-1">
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
                  <Badge variant="outline" className="text-[9px] font-medium">
                    {mentionSuggestions.length}
                  </Badge>
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
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => {
                const next = e.target.value;
                setInput(next);
                const cursor = e.target.selectionStart ?? inputRef.current?.selectionStart ?? next.length;
                updateMentionState(next, cursor);
              }}
              onKeyDown={(e) => {
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
                if (e.key === "Enter") {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Ask anything, or attach a file to analyze…"
              icon={<MessageSquare className="w-4 h-4 text-text-muted" />}
            />
          </div>
          <Button
            onClick={() => sendMessage()}
            disabled={loading || (!input.trim() && !attachedFile)}
            size="icon"
            className="cursor-pointer flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        </div>
        </div>
      </CardContent>
    </Card>
  );
}
