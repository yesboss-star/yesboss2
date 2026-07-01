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

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

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
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);
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

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  useEffect(() => {
    if (activeSession) {
      setMessages(activeSession.messages);
    }
  }, [activeSession?.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const ensureSession = async () => {
    if (activeSession) return activeSession;
    if (!organization?.id) return null;
    const s = await createSession(organization.id, "Dashboard Chat");
    return s || null;
  };

  const apiAsk = async (text: string, ctx?: Record<string, string>) => {
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
    const res = await fetch(`${API_URL}/assistant/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
      }),
    });
    if (!res.ok) throw new Error("Ask failed");
    return res.json();
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

  const sendMessage = async () => {
    if ((!input.trim() && !attachedFile) || loading) return;
    const userMsg = input.trim();
    setInput("");

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
          await uploadAttachedFile(userMsg);
          updateSessionContext(s.id, { recently_uploaded_file: fileName });
        } catch { /* proceed */ }
      } else {
        // File-only: upload, show result, done
        setLoading(true);
        try {
          const result = await uploadAttachedFile();
          if (result) {
            const fileMsg: SessionMessage = { role: "user", content: `📎 Uploaded: **${fileName}**`, timestamp: Date.now() };
            const resultMsg: SessionMessage = { role: "assistant", content: `✅ ${result}`, timestamp: Date.now() };
            setMessages((prev) => [...prev, fileMsg, resultMsg]);
            addMessage(s.id, fileMsg);
            addMessage(s.id, resultMsg);
            updateSessionContext(s.id, { recently_uploaded_file: fileName });
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

    try {
      const data = await apiAsk(userMsg);
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
      } else {
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

  const uploadAttachedFile = async (text?: string): Promise<string | null> => {
    if (!attachedFile || !organization?.id) return null;
    setUploading(true);
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
      return data.message || `File **${fileName}** processed.`;
    } catch (err: any) {
      setAttachedFile(null);
      throw err;
    } finally {
      setUploading(false);
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
          {uploading && (
            <div className="flex items-center gap-2 text-text-muted text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Uploading and analyzing file...
            </div>
          )}
          <div ref={chatEndRef} />
          </div>
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
                const cursor = e.target.selectionStart ?? next.length;
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
            onClick={sendMessage}
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
