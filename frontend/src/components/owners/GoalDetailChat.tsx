"use client";

import { useState, useRef, useEffect } from "react";
import { useGoalStore, Goal, TaskSuggestion } from "@/stores/goalStore";
import {
  MessageSquare, Send, Loader2, Sparkles,
  Target, CheckCircle, Clock, AlertTriangle, Link2,
  ChevronDown, ChevronUp, Square, CheckSquare, Plus,
  User, X, Search
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Button, Input } from "@/components/ui";

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
      .replace(/`(.+?)`/g, "<code>$1</code>");

    const headerMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headerMatch) {
      if (inList) { result.push(`</${listType}>`); inList = false; listType = null; }
      const level = headerMatch[1].length;
      result.push(`<h${level} class="text-sm font-semibold mt-3 mb-1">${headerMatch[2]}</h${level}>`);
      continue;
    }

    const bulletMatch = line.match(/^[-*]\s+(.+)/);
    if (bulletMatch) {
      if (!inList || listType !== "ul") {
        if (inList) result.push(`</${listType}>`);
        result.push('<ul class="list-disc pl-4 space-y-0.5 my-1">');
        inList = true;
        listType = "ul";
      }
      result.push(`<li>${bulletMatch[1]}</li>`);
      continue;
    }

    const numMatch = line.match(/^\d+[.)]\s+(.+)/);
    if (numMatch) {
      if (!inList || listType !== "ol") {
        if (inList) result.push(`</${listType}>`);
        result.push('<ol class="list-decimal pl-4 space-y-0.5 my-1">');
        inList = true;
        listType = "ol";
      }
      result.push(`<li>${numMatch[1]}</li>`);
      continue;
    }

    if (line.trim() === "") {
      if (inList) { result.push(`</${listType}>`); inList = false; listType = null; }
      result.push("<br/>");
      continue;
    }

    if (inList) { result.push(`</${listType}>`); inList = false; listType = null; }
    result.push(`<p class="mb-1">${line}</p>`);
  }

  if (inList) result.push(`</${listType}>`);
  return result.join("\n");
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface PersonSearchResult {
  _id: string;
  full_name: string;
  email: string;
  department?: string;
}

interface Props {
  goalId: string;
  goalTitle: string;
  initialBreakdown?: Goal["breakdown_history"];
  existingFields?: {
    success_criteria?: string;
    kpis?: string;
    timeline_detail?: string;
    dependencies?: string;
  };
  assigneeName?: string;
  assigneeId?: string;
  reviewerName?: string;
  reviewerId?: string;
  organizationId?: string;
  onGoalUpdate?: (updates: Partial<Goal>) => void;
}

export default function GoalDetailChat({
  goalId,
  goalTitle,
  initialBreakdown = [],
  existingFields = {},
  assigneeName = "",
  assigneeId = "",
  reviewerName = "",
  reviewerId = "",
  organizationId = "",
  onGoalUpdate,
}: Props) {
  const { goalChat, createTasksFromSuggestions } = useGoalStore();
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (initialBreakdown && initialBreakdown.length > 0) {
      return initialBreakdown.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
    }
    return [
      {
        role: "assistant",
        content: `Let's refine **${goalTitle}** together. I'll ask specific questions to understand your goal, then suggest actionable sub-tasks. What would you like to start with?`,
      },
    ];
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showFields, setShowFields] = useState(false);
  const [taskSuggestions, setTaskSuggestions] = useState<TaskSuggestion[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set());
  const [creatingTasks, setCreatingTasks] = useState(false);
  const [createdTaskCount, setCreatedTaskCount] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [editAssigneeSearch, setEditAssigneeSearch] = useState("");
  const [editReviewerSearch, setEditReviewerSearch] = useState("");
  const [editAssigneeResults, setEditAssigneeResults] = useState<PersonSearchResult[]>([]);
  const [editReviewerResults, setEditReviewerResults] = useState<PersonSearchResult[]>([]);
  const [editAssigneeName, setEditAssigneeName] = useState(assigneeName);
  const [editAssigneeId, setEditAssigneeId] = useState(assigneeId);
  const [editReviewerName, setEditReviewerName] = useState(reviewerName);
  const [editReviewerId, setEditReviewerId] = useState(reviewerId);
  const [searchingAssignee, setSearchingAssignee] = useState(false);
  const [searchingReviewer, setSearchingReviewer] = useState(false);
  const searchTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const searchPerson = async (query: string, type: "assignee" | "reviewer") => {
    if (!query || query.length < 1 || !organizationId) {
      if (type === "assignee") setEditAssigneeResults([]);
      else setEditReviewerResults([]);
      return;
    }
    if (type === "assignee") setSearchingAssignee(true);
    else setSearchingReviewer(true);
    try {
      const res = await fetch(`${API_URL}/org-chart/members/search?q=${encodeURIComponent(query)}&organization_id=${organizationId}`);
      const data = await res.json();
      const members = (data.members || []).slice(0, 8);
      if (type === "assignee") setEditAssigneeResults(members);
      else setEditReviewerResults(members);
    } catch {
      if (type === "assignee") setEditAssigneeResults([]);
      else setEditReviewerResults([]);
    } finally {
      if (type === "assignee") setSearchingAssignee(false);
      else setSearchingReviewer(false);
    }
  };

  const handleAssigneeSearch = (val: string) => {
    setEditAssigneeSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => searchPerson(val, "assignee"), 300);
  };

  const handleReviewerSearch = (val: string) => {
    setEditReviewerSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => searchPerson(val, "reviewer"), 300);
  };

  const selectAssignee = (person: PersonSearchResult) => {
    setEditAssigneeName(person.full_name);
    setEditAssigneeId(person._id);
    setEditAssigneeSearch("");
    setEditAssigneeResults([]);
  };

  const selectReviewer = (person: PersonSearchResult) => {
    setEditReviewerName(person.full_name);
    setEditReviewerId(person._id);
    setEditReviewerSearch("");
    setEditReviewerResults([]);
  };

  const saveEdit = async () => {
    try {
      const res = await fetch(`${API_URL}/goals/${goalId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignee_name: editAssigneeName || null,
          assignee_id: editAssigneeId || null,
          reviewer_name: editReviewerName || null,
          reviewer_id: editReviewerId || null,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        if (onGoalUpdate && result.goal) {
          onGoalUpdate({
            assignee_name: result.goal.assignee_name,
            assignee_id: result.goal.assignee_id,
            reviewer_name: result.goal.reviewer_name,
            reviewer_id: result.goal.reviewer_id,
          });
        }
      }
    } catch {}
    setEditing(false);
  };

  const toggleTask = (idx: number) => {
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleCreateTasks = async () => {
    const selected = Array.from(selectedTasks).map((idx) => taskSuggestions[idx]);
    if (selected.length === 0) return;
    setCreatingTasks(true);
    try {
      const created = await createTasksFromSuggestions(goalId, selected);
      setCreatedTaskCount((prev) => prev + created.length);
      setTaskSuggestions([]);
      setSelectedTasks(new Set());
    } catch {}
    setCreatingTasks(false);
  };

  const sendMessage = async () => {
    const msg = input.trim();
    if (!msg || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setLoading(true);

    try {
      const result = await goalChat(goalId, msg);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: result.response },
      ]);
      if (result.task_suggestions && result.task_suggestions.length > 0) {
        setTaskSuggestions(result.task_suggestions);
        setSelectedTasks(new Set(result.task_suggestions.map((_: any, i: number) => i)));
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I had trouble processing that. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const hasFields =
    existingFields.success_criteria ||
    existingFields.kpis ||
    existingFields.timeline_detail ||
    existingFields.dependencies;

  return (
    <div className="border-t border-border/50 pt-4 mt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors cursor-pointer w-full"
      >
        <MessageSquare className="w-4 h-4" />
        <span>Goal Refinement Chat</span>
        {createdTaskCount > 0 && (
          <Badge variant="success" className="text-[10px]">
            {createdTaskCount} tasks created
          </Badge>
        )}
        <Badge variant="outline" className="text-[10px] ml-1">
          {initialBreakdown.length} messages
        </Badge>
        <div className="ml-auto">
          {expanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Edit Assignee/Reviewer */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <User className="w-3 h-3" />
              <span>
                <strong>Assignee:</strong> {editAssigneeName || "Unassigned"}
                {editReviewerName && <span className="ml-2"><strong>Reviewer:</strong> {editReviewerName}</span>}
              </span>
            </div>
            <button
              onClick={() => { setEditing(!editing); if (!editing) { setEditAssigneeSearch(""); setEditReviewerSearch(""); setEditAssigneeResults([]); setEditReviewerResults([]); } }}
              className="text-[10px] px-2 py-1 rounded-full bg-primary/5 border border-primary/20 text-text-muted hover:text-primary cursor-pointer"
            >
              {editing ? "Cancel" : "Edit"}
            </button>
          </div>

          {editing && (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-surface border border-border/50">
              <div className="space-y-1">
                <label className="text-[10px] text-text-muted">Defaulter (Assignee)</label>
                <div className="relative">
                  <Input
                    value={editAssigneeSearch}
                    onChange={(e) => handleAssigneeSearch(e.target.value)}
                    placeholder="Search by name or email..."
                    icon={<Search className="w-3 h-3" />}
                    className="text-xs"
                  />
                  {searchingAssignee && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <Loader2 className="w-3 h-3 animate-spin text-text-muted" />
                    </div>
                  )}
                  {editAssigneeResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border/50 rounded-xl shadow-lg z-10 max-h-40 overflow-y-auto">
                      {editAssigneeResults.map((p) => (
                        <button
                          key={p._id}
                          onClick={() => selectAssignee(p)}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-primary/5 transition-colors cursor-pointer border-b border-border/30 last:border-0"
                        >
                          <span className="font-medium">{p.full_name}</span>
                          <span className="text-text-muted ml-2">{p.email}</span>
                          {p.department && <span className="text-text-muted/60 ml-1">· {p.department}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {editAssigneeName && (
                  <div className="flex items-center gap-1 text-xs text-primary">
                    <User className="w-3 h-3" />
                    {editAssigneeName}
                    <button onClick={() => { setEditAssigneeName(""); setEditAssigneeId(""); }} className="text-text-muted hover:text-rose-400 cursor-pointer">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-text-muted">Reviewer</label>
                <div className="relative">
                  <Input
                    value={editReviewerSearch}
                    onChange={(e) => handleReviewerSearch(e.target.value)}
                    placeholder="Search by name or email..."
                    icon={<Search className="w-3 h-3" />}
                    className="text-xs"
                  />
                  {searchingReviewer && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <Loader2 className="w-3 h-3 animate-spin text-text-muted" />
                    </div>
                  )}
                  {editReviewerResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border/50 rounded-xl shadow-lg z-10 max-h-40 overflow-y-auto">
                      {editReviewerResults.map((p) => (
                        <button
                          key={p._id}
                          onClick={() => selectReviewer(p)}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-primary/5 transition-colors cursor-pointer border-b border-border/30 last:border-0"
                        >
                          <span className="font-medium">{p.full_name}</span>
                          <span className="text-text-muted ml-2">{p.email}</span>
                          {p.department && <span className="text-text-muted/60 ml-1">· {p.department}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {editReviewerName && (
                  <div className="flex items-center gap-1 text-xs text-primary">
                    <User className="w-3 h-3" />
                    {editReviewerName}
                    <button onClick={() => { setEditReviewerName(""); setEditReviewerId(""); }} className="text-text-muted hover:text-rose-400 cursor-pointer">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
              <div className="col-span-2 flex justify-end">
                <Button onClick={saveEdit} size="sm" className="cursor-pointer text-xs">
                  Save Changes
                </Button>
              </div>
            </div>
          )}

          {/* Task Suggestions with checkboxes */}
          {taskSuggestions.length > 0 && (
            <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                  <CheckSquare className="w-3 h-3" />
                  Suggested Sub-Tasks
                </h4>
                <Button
                  onClick={handleCreateTasks}
                  disabled={selectedTasks.size === 0 || creatingTasks}
                  size="sm"
                  className="cursor-pointer text-[10px] h-7"
                >
                  {creatingTasks ? (
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  ) : (
                    <Plus className="w-3 h-3 mr-1" />
                  )}
                  Create {selectedTasks.size > 0 ? `(${selectedTasks.size})` : ""}
                </Button>
              </div>
              <div className="space-y-1.5">
                {taskSuggestions.map((task, idx) => (
                  <button
                    key={idx}
                    onClick={() => toggleTask(idx)}
                    className="w-full text-left flex items-center gap-2 p-2 rounded-lg hover:bg-emerald-500/10 transition-colors cursor-pointer group"
                  >
                    {selectedTasks.has(idx) ? (
                      <CheckSquare className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-text-muted group-hover:text-emerald-400 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">{task.title}</p>
                      {task.description && (
                        <p className="text-[10px] text-text-muted truncate">{task.description}</p>
                      )}
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border flex-shrink-0 ${
                      task.priority === "high" || task.priority === "urgent"
                        ? "text-rose-400 bg-rose-500/10 border-rose-500/20"
                        : task.priority === "medium"
                        ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
                        : "text-gray-400 bg-gray-500/10 border-gray-500/20"
                    }`}>
                      {task.priority}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {hasFields && (
            <div>
              <button
                onClick={() => setShowFields(!showFields)}
                className="flex items-center gap-1 text-[10px] text-text-muted hover:text-primary cursor-pointer"
              >
                <Target className="w-3 h-3" />
                {showFields ? "Hide" : "Show"} current breakdown fields
                {showFields ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {showFields && (
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  {existingFields.success_criteria && (
                    <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                      <span className="text-emerald-400 font-medium">Success Criteria</span>
                      <p className="text-text-muted mt-0.5">{existingFields.success_criteria}</p>
                    </div>
                  )}
                  {existingFields.kpis && (
                    <div className="p-2 rounded-lg bg-primary/5 border border-primary/20">
                      <span className="text-primary font-medium">KPIs</span>
                      <p className="text-text-muted mt-0.5">{existingFields.kpis}</p>
                    </div>
                  )}
                  {existingFields.timeline_detail && (
                    <div className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
                      <span className="text-amber-400 font-medium">Timeline</span>
                      <p className="text-text-muted mt-0.5">{existingFields.timeline_detail}</p>
                    </div>
                  )}
                  {existingFields.dependencies && (
                    <div className="p-2 rounded-lg bg-rose-500/5 border border-rose-500/20">
                      <span className="text-rose-400 font-medium">Dependencies</span>
                      <p className="text-text-muted mt-0.5">{existingFields.dependencies}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div
            className="space-y-3 max-h-60 overflow-y-auto pr-1 custom-scrollbar"
            style={{ maxHeight: "240px" }}
          >
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 ${
                  msg.role === "user" ? "flex-row-reverse" : ""
                } animate-in fade-in slide-in-from-bottom-1 duration-200`}
              >
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    msg.role === "user"
                      ? "bg-gradient-to-br from-primary to-purple-500"
                      : "bg-surface border border-border/50"
                  }`}
                >
                  {msg.role === "user" ? (
                    <span className="text-white font-bold text-[9px]">U</span>
                  ) : (
                    <Sparkles className="w-3 h-3 text-primary" />
                  )}
                </div>
                <div
                  className={`max-w-[85%] p-2.5 rounded-xl text-xs leading-relaxed ${
                    msg.role === "user"
                      ? "bg-gradient-to-br from-primary/20 to-purple-500/20 text-foreground"
                      : "bg-surface border border-border/50 text-text-muted"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                    />
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-text-muted text-xs">
                <Loader2 className="w-3 h-3 animate-spin" />
                Refining goal...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Refine this goal..."
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              icon={<MessageSquare className="w-4 h-4 text-text-muted" />}
              className="text-sm"
            />
            <Button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              size="icon"
              className="cursor-pointer flex-shrink-0"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
