"use client";

import { Suspense, useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useUIStore } from "@/stores/uiStore";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useDocumentStore } from "@/stores/documentStore";
import { useAssistantStore, AssistantMode, CounterQuestion, Person, UploadRequest } from "@/stores/assistantStore";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, Button, Badge } from "@/components/ui";
import {
  Loader2, Sparkles, Send, CheckSquare, AlertCircle, Clock, Users, MessageSquare,
  Briefcase, FileText, X, UserPlus, ArrowRight, Check, Target, User as UserIcon,
  Sparkle, Lightbulb, ChevronRight, ExternalLink, ListTodo, Upload, FileUp, RefreshCw, ArrowLeft,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const ALLOWED_UPLOAD_EXT = [".pdf", ".docx", ".doc", ".txt", ".md", ".csv", ".xlsx", ".xls", ".pptx", ".png", ".jpg", ".jpeg"];

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isLoading?: boolean;
  isQuestionCard?: boolean;
  questionData?: CounterQuestion;
  isDelegateSuccess?: boolean;
  isUploadCard?: boolean;
  uploadRequests?: UploadRequest[];
  uploadReasoning?: string;
  pendingOriginalQuestion?: string;
  intentTag?: string;
}

const WELCOME_MESSAGE = `Hi! I'm your AI Business Analyst. 👋

I can:
• **Answer questions** — strategy, finance, ops, anything you'd ask ChatGPT
• **Plan initiatives** — tell me what you want to *start* (e.g. "I want to start hiring") and I'll help shape it
• **Delegate to your team** — "Prepare the Q4 deck and allocate to Sarah" and I'll create the goal + assign the task

Try a quick action below or just type naturally.`;

const QUICK_ACTIONS = [
  { id: "prioritize", label: "How to prioritize today's work?", icon: CheckSquare, intent: "chat" },
  { id: "hiring", label: "I want to start hiring", icon: UserPlus, intent: "action" },
  { id: "blockers", label: "What is blocking growth?", icon: Clock, intent: "chat" },
  { id: "campaign", label: "I want to run a marketing campaign", icon: Briefcase, intent: "action" },
  { id: "doc_q", label: "What does my uploaded data say?", icon: FileText, intent: "doc" },
  { id: "delegate", label: "Delegate a task to a team member", icon: ListTodo, intent: "delegate" },
];

const generateId = () => `msg_${Math.random().toString(36).substring(7)}`;

export default function EmployeeAIAssistantPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    }>
      <EmployeeAIAssistant />
    </Suspense>
  );
}

function EmployeeAIAssistant() {
  const { user, role, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setBreadcrumbs } = useUIStore();
  const { organization } = useOrganizationStore();
  const {
    context: docContext,
    fetchContext: fetchDocContext,
    askQuestion: askDocQuestion,
  } = useDocumentStore();
  const fetchContext = fetchDocContext;

  const {
    mode, intent, topic, gathered, pendingQuestion, originalMessage,
    isLoading, error: storeError, lastDelegate, recentDelegates,
    pendingQuestionMessage, pendingUploadRequests, pendingReasoning, isUploading,
    reset, setOriginal, analyze, askNextQuestion, submitGathered, sendChat, searchPeople,
    setPendingUpload, clearPendingUpload, setIsUploading,
  } = useAssistantStore();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [freeText, setFreeText] = useState("");
  const [freeTextFor, setFreeTextFor] = useState<string | null>(null);
  const [personQuery, setPersonQuery] = useState("");
  const [personResults, setPersonResults] = useState<Person[]>([]);
  const [showPersonPicker, setShowPersonPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const inFlight = useRef(false);

  const assistantCtx = useMemo(() => ({
    user_email: user?.email ?? undefined,
    organization_id: organization?.id,
    organization_name: organization?.name,
    document_summary: (docContext?.analyzed_documents ?? 0) > 0 ? docContext?.summary || "" : "",
    role: role || "owner",
    analyzed_documents: docContext?.analyzed_documents ?? 0,
    has_employees: docContext ? (docContext.total_documents > 0 ? 1 : 0) : 0,
  }), [user?.email, organization?.id, organization?.name, docContext?.analyzed_documents, docContext?.summary, docContext?.total_documents, role]);

  useEffect(() => {
    const orgId = organization?.id;
    if (orgId) fetchDocContext(orgId);
  }, [organization?.id, fetchDocContext]);

  useEffect(() => {
    setBreadcrumbs([
      { label: "Dashboard", href: "/dashboard" },
      { label: "AI Business Analytics" },
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
        // Check for ?delegate=1 — came from the AI dashboard "Delegate to team member" button
        const shouldDelegate = searchParams?.get("delegate") === "1";
        const titleParam = searchParams?.get("title") || "";
        const descParam = searchParams?.get("description") || "";
        if (shouldDelegate && titleParam) {
          // Seed the delegate flow
          setOriginal(titleParam);
          useAssistantStore.setState({
            mode: "delegate_q",
            intent: "delegate",
            gathered: { title: titleParam, description: descParam },
            pendingQuestion: {
              question: "Who should own this? (Type a name, or pick from your team.)",
              field_id: "assignee_name",
              field_type: "person",
              options: null,
              emoji: "👤",
              progress: "Step 1 of 5",
            },
          });
          setMessages([
            {
              id: generateId(),
              role: "assistant",
              content: `Got it — let's delegate **${titleParam}** to the right person. 👇`,
              timestamp: new Date(),
            },
          ]);
          setShowPersonPicker(true);
          // Clean up the URL so a refresh doesn't re-seed
          router.replace("/dashboard/assistant");
          return;
        }
        setMessages([{
          id: generateId(),
          role: "assistant",
          content: WELCOME_MESSAGE,
          timestamp: new Date(),
        }]);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [authLoading, user, searchParams, router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Person picker search (debounced)
  useEffect(() => {
    if (!showPersonPicker || !personQuery) {
      setPersonResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const orgId = organization?.id;
      if (!orgId) return;
      const people = await searchPeople(personQuery, orgId);
      setPersonResults(people);
    }, 200);
    return () => clearTimeout(t);
  }, [personQuery, showPersonPicker, organization?.id, searchPeople]);

  const history = useMemo(
    () => messages.map(m => ({ role: m.role, content: m.content })),
    [messages]
  );

  const addMessage = (msg: Partial<Message>) => {
    setMessages((prev) => [...prev, { id: generateId(), timestamp: new Date(), ...msg } as Message]);
  };

  const updateLastMessage = (id: string, patch: Partial<Message>) => {
    setMessages((prev) => prev.map(m => (m.id === id ? { ...m, ...patch } : m)));
  };

  const isDocQuestion = (text: string): boolean => {
    const lower = text.toLowerCase();
    const docHints = [
      "uploaded", "my data", "my doc", "our doc", "our data", "the report", "the deck",
      "revenue", "mrr", "arr", "churn", "cac", "ltv", "q1", "q2", "q3", "q4",
      "financial", "decisions we", "action items", "what does my",
    ];
    return docHints.some((h) => lower.includes(h)) ||
      lower.startsWith("what does") ||
      lower.startsWith("what is our") ||
      lower.startsWith("how much") ||
      lower.startsWith("when did") ||
      lower.startsWith("who is our");
  };

  const handleSend = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || inFlight.current) return;
    inFlight.current = true;

    addMessage({ role: "user", content: text });
    setInput("");

    const aiId = generateId();
    addMessage({ id: aiId, role: "assistant", content: "", isLoading: true });

    try {
      // Doc question path (preserved from previous version)
      if (isDocQuestion(text) && (docContext?.analyzed_documents ?? 0) > 0 && organization?.id) {
        const answer = await askDocQuestion(organization.id, text);
        let content = answer?.answer || "I couldn't find a clear answer in your documents.";
        if (answer?.sources?.[0]) {
          content += `\n\n_Source: ${answer.sources[0].filename}_`;
        }
        updateLastMessage(aiId, { content, isLoading: false, intentTag: "doc" });
        return;
      }

      // Analyze intent (chat vs action vs delegate)
      const { intent: detected } = await analyze(text, assistantCtx, history);

      if (detected === "chat") {
        // Use the new intelligent chat that diagnoses data first
        const result = await sendChat(text, assistantCtx, history);
        if (result.status === "needs_data") {
          // AI is asking for uploads — show the upload card
          setPendingUpload(text, result.upload_requests || [], result.response);
          updateLastMessage(aiId, {
            content: "",
            isLoading: false,
            isUploadCard: true,
            uploadRequests: result.upload_requests || [],
            uploadReasoning: result.response,
            pendingOriginalQuestion: text,
            intentTag: "needs_data",
          });
        } else {
          updateLastMessage(aiId, {
            content: result.response,
            isLoading: false,
            intentTag: result.question_type || "chat",
          });
        }
        return;
      }

      // Action or delegate — start the question flow
      setOriginal(text);
      const q = await askNextQuestion(text, assistantCtx);
      if (!q) {
        updateLastMessage(aiId, {
          content: "Hmm, I couldn't start the flow. Try rephrasing?",
          isLoading: false,
        });
        return;
      }
      if (q.field_id === "done") {
        await runSubmit(aiId);
        return;
      }
      updateLastMessage(aiId, {
        content: "",
        isLoading: false,
        isQuestionCard: true,
        questionData: q,
        intentTag: detected,
      });
    } catch (e) {
      updateLastMessage(aiId, {
        content: "Something went wrong. Try again?",
        isLoading: false,
      });
    } finally {
      inFlight.current = false;
    }
  };

  const runSubmit = async (replaceId?: string) => {
    try {
      const result = await submitGathered();
      const successContent = `✅ Done! I've set up the goal and assigned the task.\n\n**${result.goal.title}**\n👤 Assigned to **${result.assignee.name}**${result.assignee.role ? ` (${result.assignee.role})` : ""}\n${result.sub_tasks?.length ? `\n📋 Also created ${result.sub_tasks.length} sub-tasks so ${result.assignee.name.split(" ")[0]} has a clear first week of work.` : ""}\n\nThey'll see this on their dashboard now. 🚀`;
      const targetId = replaceId || generateId();
      setMessages((prev) => {
        const without = prev.filter(m => m.id !== replaceId);
        return [...without, {
          id: targetId,
          role: "assistant",
          content: successContent,
          timestamp: new Date(),
          isDelegateSuccess: true,
          intentTag: "done",
        }];
      });
      setShowPersonPicker(false);
      setPersonQuery("");
      setFreeText("");
      setFreeTextFor(null);
    } catch (e) {
      const errMsg = useAssistantStore.getState().error || "Could not create the task";
      const targetId = replaceId || generateId();
      updateLastMessage(targetId, { content: `❌ ${errMsg}`, isLoading: false });
    }
  };

  const handleAnswer = async (questionId: string, fieldId: string, value: string, valueLabel?: string) => {
    if (!fieldId || fieldId === "done") return;
    inFlight.current = true;
    setShowPersonPicker(false);
    setFreeText("");
    setFreeTextFor(null);

    // Update gathered in store
    useAssistantStore.setState((s) => ({
      gathered: { ...s.gathered, [fieldId]: value },
    }));

    // If this is a "select" with a label, show user's choice in the chat history
    if (valueLabel) {
      addMessage({ role: "user", content: valueLabel });
    }

    const aiId = generateId();
    addMessage({ id: aiId, role: "assistant", content: "", isLoading: true });

    try {
      const q = await askNextQuestion(value, assistantCtx);
      if (q?.field_id === "done") {
        // Replace loading message with the final result
        await runSubmit(aiId);
        return;
      }
      updateLastMessage(aiId, {
        content: "",
        isLoading: false,
        isQuestionCard: true,
        questionData: q || undefined,
        intentTag: intent || undefined,
      });
    } finally {
      inFlight.current = false;
    }
  };

  const handleSkip = async (questionId: string, fieldId: string) => {
    handleAnswer(questionId, fieldId, "");
  };

  const handleReset = () => {
    reset();
    setShowPersonPicker(false);
    setPersonQuery("");
    setFreeText("");
    setFreeTextFor(null);
    setMessages((prev) => [
      ...prev,
      {
        id: generateId(),
        role: "assistant",
        content: "No worries — let's start fresh. What would you like to do?",
        timestamp: new Date(),
      },
    ]);
  };

  const handleUploadFiles = async (files: File[], originalQuestion: string) => {
    if (!files.length || !organization?.id) return;
    if (inFlight.current) return;
    inFlight.current = true;
    setIsUploading(true);

    // Show a status bubble
    const statusId = generateId();
    addMessage({
      id: statusId,
      role: "assistant",
      content: `Uploading ${files.length} file${files.length > 1 ? "s" : ""} and analyzing them... 📎`,
      timestamp: new Date(),
      isLoading: true,
    });

    try {
      // Upload each file via the existing /files/process endpoint
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("org_id", organization.id);
        if (organization.name) formData.append("company_name", organization.name);
        if (organization.industry) formData.append("industry", organization.industry);
        if (organization.micro_vertical) formData.append("micro_vertical", organization.micro_vertical);

        const res = await fetch(`${API_URL}/files/process`, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Upload failed: ${errText}`);
        }
      }

      // Refresh document context
      if (fetchContext) await fetchContext(organization.id);

      updateLastMessage(statusId, {
        content: `✅ Got it — ${files.length} file${files.length > 1 ? "s" : ""} uploaded. Let me read them now and get back to you.`,
        isLoading: false,
      });

      // Now re-ask the original question with fresh data
      const aiId = generateId();
      addMessage({ id: aiId, role: "assistant", content: "", isLoading: true });

      const refreshedCtx = { ...assistantCtx };
      if (docContext) {
        refreshedCtx.analyzed_documents = docContext.analyzed_documents + files.length;
      }
      const result = await sendChat(originalQuestion, refreshedCtx, history);
      clearPendingUpload();
      updateLastMessage(aiId, {
        content: result.response,
        isLoading: false,
        intentTag: result.question_type || "chat",
      });
    } catch (e: any) {
      updateLastMessage(statusId, {
        content: `❌ Upload failed: ${e?.message || "Try again."}`,
        isLoading: false,
      });
    } finally {
      setIsUploading(false);
      inFlight.current = false;
    }
  };

  const handleQuickAction = (actionId: string) => {
    const action = QUICK_ACTIONS.find((a) => a.id === actionId);
    if (!action) return;
    if (action.intent === "doc") {
      handleSend("What does my uploaded data say?");
    } else if (action.intent === "delegate") {
      // Direct delegate shortcut
      setOriginal("New task");
      useAssistantStore.setState({
        mode: "delegate_q",
        intent: "delegate",
        gathered: { title: "New task", description: "" },
        pendingQuestion: {
          question: "Who should own this? (Type a name, or pick from your team.)",
          field_id: "assignee_name",
          field_type: "person",
          options: null,
          emoji: "👤",
          progress: "Step 1 of 5",
        },
      });
      addMessage({
        role: "assistant",
        content: "Let's delegate a task. 👇",
        timestamp: new Date(),
      });
      setShowPersonPicker(true);
    } else {
      handleSend(action.label);
    }
  };

  const renderQuestionCard = (q: CounterQuestion) => {
    const isText = q.field_type === "text";
    const isSelect = q.field_type === "select_dept" || q.field_type === "select_priority";
    const isPerson = q.field_type === "person";
    const isDone = q.field_type === "done";
    return renderQuestionCardBody(q, isText, isSelect, isPerson, isDone);
  };

  // Upload card — drag-drop files that the AI needs to answer the user's question
  const renderUploadCard = (requests: UploadRequest[], reasoning: string, originalQuestion: string) => {
    const [isDragging, setIsDragging] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const onFiles = (filesList: FileList | null) => {
      if (!filesList) return;
      const accepted: File[] = [];
      for (let i = 0; i < filesList.length; i++) {
        const f = filesList.item(i);
        if (!f) continue;
        const ext = "." + (f.name.split(".").pop() || "").toLowerCase();
        if (ALLOWED_UPLOAD_EXT.includes(ext)) accepted.push(f);
      }
      setSelectedFiles((prev) => [...prev, ...accepted]);
    };

    const onDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      onFiles(e.dataTransfer.files);
    };

    const handleUploadClick = () => {
      if (selectedFiles.length === 0) return;
      handleUploadFiles(selectedFiles, originalQuestion);
      setSelectedFiles([]);
    };

    return (
      <div className="space-y-3">
        {/* Reasoning line from AI */}
        {reasoning && (
          <div className="text-sm whitespace-pre-wrap text-text-secondary leading-relaxed">
            {reasoning}
          </div>
        )}

        {/* Specific upload requests */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide">What I need</p>
          {requests.map((r, i) => (
            <div key={i} className="flex gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 text-xs font-semibold flex items-center justify-center flex-shrink-0">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{r.document_type}</p>
                <p className="text-xs text-text-muted mt-0.5">{r.why}</p>
                {r.example && (
                  <p className="text-xs text-text-muted mt-1 italic">e.g. {r.example}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Drag-drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${
            isDragging
              ? "border-primary bg-primary/10"
              : "border-border hover:border-primary/50 hover:bg-surface-light"
          }`}
        >
          <FileUp className="w-8 h-8 text-text-muted mx-auto mb-2" />
          <p className="text-sm text-foreground">
            Drop your files here or <span className="text-primary font-medium">browse</span>
          </p>
          <p className="text-xs text-text-muted mt-1">
            PDF, DOCX, XLSX, CSV, TXT, images
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ALLOWED_UPLOAD_EXT.join(",")}
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
        </div>

        {/* Selected files preview */}
        {selectedFiles.length > 0 && (
          <div className="space-y-1.5">
            {selectedFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded bg-surface-light border border-border text-xs">
                <FileText className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <span className="truncate flex-1">{f.name}</span>
                <span className="text-text-muted">{(f.size / 1024).toFixed(1)}KB</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFiles((prev) => prev.filter((_, idx) => idx !== i));
                  }}
                  className="text-text-muted hover:text-rose-400"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <button
              onClick={handleUploadClick}
              disabled={isUploading}
              className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading & analyzing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Upload & continue
                </>
              )}
            </button>
          </div>
        )}

        {/* Alternative — ask as general knowledge */}
        <button
          onClick={() => {
            clearPendingUpload();
            addMessage({
              id: generateId(),
              role: "assistant",
              content: "No worries — let me give you a general answer based on best practices instead. Could you rephrase what you'd like to know?",
              timestamp: new Date(),
            });
          }}
          className="text-xs text-text-muted hover:text-foreground flex items-center gap-1 cursor-pointer"
        >
          <Lightbulb className="w-3 h-3" />
          Or just give me general advice
        </button>
      </div>
    );
  };

  const renderQuestionCardBody = (q: CounterQuestion, isText: boolean, isSelect: boolean, isPerson: boolean, isDone: boolean) => {
    return (
      <div className="space-y-3">
        {q.question && (
          <div className="text-sm text-foreground">
            {q.emoji && <span className="mr-1">{q.emoji}</span>}
            {q.question}
          </div>
        )}
        {q.progress && (
          <div className="text-[10px] uppercase tracking-wider text-text-muted">
            {q.progress}
          </div>
        )}

        {isSelect && q.options && (
          <div className="grid grid-cols-2 gap-2">
            {q.options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleAnswer(q.field_id, q.field_id, opt.value, opt.label)}
                disabled={isLoading || inFlight.current}
                className="text-left px-3 py-2.5 rounded-lg bg-surface hover:bg-primary/10 border border-border hover:border-primary/30 text-sm transition-all cursor-pointer disabled:opacity-50"
              >
                {opt.label}
              </button>
            ))}
            <button
              onClick={() => setFreeTextFor(q.field_id)}
              className="col-span-2 text-left px-3 py-2.5 rounded-lg bg-surface/40 hover:bg-surface border border-dashed border-border text-xs text-text-muted hover:text-foreground transition-all cursor-pointer"
            >
              ✏️ Type my own answer
            </button>
          </div>
        )}

        {isPerson && (
          <div className="space-y-2">
            <input
              type="text"
              value={personQuery}
              onChange={(e) => { setPersonQuery(e.target.value); setShowPersonPicker(true); }}
              onFocus={() => setShowPersonPicker(true)}
              placeholder="Type a team member's name…"
              className="w-full px-3 py-2.5 rounded-lg bg-surface border border-border focus:border-primary focus:outline-none text-sm"
            />
            {showPersonPicker && personResults.length > 0 && (
              <div className="rounded-lg border border-border bg-surface/80 backdrop-blur max-h-48 overflow-y-auto">
                {personResults.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      handleAnswer(q.field_id, "assignee_id", p.id, p.name);
                      useAssistantStore.setState((s) => ({ gathered: { ...s.gathered, assignee_name: p.name } }));
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-primary/10 flex items-center gap-2 cursor-pointer border-b border-border last:border-b-0"
                  >
                    <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-[10px] text-primary font-semibold">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="text-[10px] text-text-muted truncate">
                        {p.role}{p.department ? ` · ${p.department}` : ""}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-text-muted" />
                  </button>
                ))}
              </div>
            )}
            {showPersonPicker && personQuery && personResults.length === 0 && (
              <div className="text-xs text-text-muted p-2 rounded-lg bg-surface/40 border border-dashed border-border">
                No team member matches "{personQuery}". They might not be added yet — try the People page.
              </div>
            )}
          </div>
        )}

        {isText && (
          <div className="flex gap-2">
            <input
              type="text"
              value={freeTextFor === q.field_id ? freeText : ""}
              onChange={(e) => { setFreeText(e.target.value); setFreeTextFor(q.field_id); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && freeText.trim()) {
                  handleAnswer(q.field_id, q.field_id, freeText.trim(), freeText.trim());
                }
              }}
              placeholder="Type your answer…"
              autoFocus
              className="flex-1 px-3 py-2.5 rounded-lg bg-surface border border-border focus:border-primary focus:outline-none text-sm"
            />
            <Button
              size="sm"
              onClick={() => freeText.trim() && handleAnswer(q.field_id, q.field_id, freeText.trim(), freeText.trim())}
              disabled={!freeText.trim() || inFlight.current}
              className="cursor-pointer"
            >
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <button
            onClick={handleReset}
            className="text-[10px] text-text-muted hover:text-foreground cursor-pointer"
          >
            ✕ Cancel flow
          </button>
          {q.field_id !== "assignee_name" && q.field_id !== "title" && (
            <button
              onClick={() => handleSkip(q.field_id, q.field_id)}
              className="text-[10px] text-text-muted hover:text-foreground cursor-pointer"
            >
              Skip →
            </button>
          )}
        </div>
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
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/dashboard/notifications")} className="p-2 rounded-lg hover:bg-surface text-text-muted hover:text-foreground transition-colors cursor-pointer">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">AI Business Analytics</h1>
              <p className="text-text-muted text-sm">
                {mode === "action_q" || mode === "delegate_q"
                  ? <><Lightbulb className="w-3 h-3 inline mr-1" />Plan in progress — answer to keep going</>
                  : mode === "creating"
                    ? <><Loader2 className="w-3 h-3 inline mr-1 animate-spin" />Setting things up…</>
                    : mode === "done" && lastDelegate
                      ? <>Last delegation: <span className="text-foreground">{lastDelegate.goal.title}</span></>
                      : "Ask anything. Plan. Delegate. Done."}
              </p>
            </div>
          </div>
          {recentDelegates.length > 0 && (
            <button
              onClick={() => router.push("/dashboard/orchestration")}
              className="hidden md:flex items-center gap-2 text-xs text-text-muted hover:text-foreground cursor-pointer"
            >
              <ListTodo className="w-4 h-4" />
              See all tasks
              <ExternalLink className="w-3 h-3" />
            </button>
          )}
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
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${message.role === "user" ? "bg-primary text-white" : "bg-surface border border-border"}`}>
                    {message.intentTag && message.intentTag !== "chat" && message.intentTag !== "doc" && (
                      <Badge variant="outline" className="text-[10px] mb-1.5">
                        {message.intentTag === "action" && "🎯 Planning"}
                        {message.intentTag === "delegate" && "🚀 Delegating"}
                        {message.intentTag === "done" && "✅ Done"}
                      </Badge>
                    )}
                    {message.isLoading ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-text-muted text-sm">Thinking…</span>
                      </div>
                    ) : message.isQuestionCard && message.questionData ? (
                      renderQuestionCard(message.questionData)
                    ) : message.isUploadCard ? (
                      renderUploadCard(message.uploadRequests || [], message.uploadReasoning || "", message.pendingOriginalQuestion || "")
                    ) : message.isDelegateSuccess ? (
                      <div className="space-y-2">
                        <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                        {lastDelegate && (
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => router.push("/dashboard/orchestration")}
                              className="text-[11px] flex items-center gap-1 text-primary hover:underline cursor-pointer"
                            >
                              <Target className="w-3 h-3" /> View goal
                            </button>
                            <button
                              onClick={() => router.push("/dashboard/task")}
                              className="text-[11px] flex items-center gap-1 text-primary hover:underline cursor-pointer"
                            >
                              <ListTodo className="w-3 h-3" /> View tasks
                            </button>
                            <button
                              onClick={handleReset}
                              className="text-[11px] flex items-center gap-1 text-text-muted hover:text-foreground cursor-pointer ml-auto"
                            >
                              <Sparkle className="w-3 h-3" /> Do another
                            </button>
                          </div>
                        )}
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
              {storeError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
                  <AlertCircle className="w-4 h-4" />
                  {storeError}
                </div>
              )}
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
                      disabled={isLoading || inFlight.current}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface hover:bg-surface-light border border-border hover:border-primary/30 text-sm cursor-pointer disabled:opacity-50 transition-all"
                    >
                      <action.icon className={`w-4 h-4 ${action.intent === "delegate" ? "text-amber-400" : action.intent === "action" ? "text-emerald-400" : "text-primary"}`} />
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
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && !isLoading && !inFlight.current && handleSend(input)}
                  placeholder={
                    mode === "action_q" || mode === "delegate_q"
                      ? "Or type a quick reply above…"
                      : "Ask me anything, plan an initiative, or delegate a task…"
                  }
                  disabled={isLoading || inFlight.current}
                  className="flex-1 px-4 py-3 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm disabled:opacity-50"
                />
                <Button
                  onClick={() => handleSend(input)}
                  disabled={isLoading || !input.trim() || inFlight.current}
                  className="cursor-pointer"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-[10px] text-text-muted mt-2 text-center">
                {role === "owner"
                  ? "Owner mode — your team members will be notified when you delegate."
                  : "Employee mode — ask me about your work."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
