"use client";

import { useEffect, useState, useRef, useCallback, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useGoalStore } from "@/stores/goalStore";
import { useTaskStore } from "@/stores/taskStore";
import { useKPIStore } from "@/stores/kpiStore";
import { useOrgChartStore } from "@/stores/orgChartStore";
import { useSessionStore, type SessionMessage, type ClarifyingQuestion, type DelegateParams, type GeneratedSubTask, type BookingParams, type BookingSlot, delegateAssigneeLabel } from "@/stores/sessionStore";
import {
  Sparkles, MessageSquare, Plus, Edit3, Trash2, Paperclip, AtSign,
  Loader2, Send, Lightbulb, Check, ArrowRight, Square, Volume2, Mic, BookOpen,
  Menu, X, FileText, ClipboardList, ListChecks, Image as ImageIcon,
  CalendarDays, CalendarPlus, FileUp, Flag, BookMarked, PieChart as PieChartIcon, TrendingUp, Search, Inbox,
} from "lucide-react";
import DelegatePreviewCard from "@/components/DelegatePreviewCard";
import { VOICE_LANGUAGES, VOICE_LANG_KEY } from "@/components/capture/voice";
import NeedActionCard from "@/components/capture/NeedActionCard";
import DailyBrief from "@/components/capture/DailyBrief";
import MeetingsHub from "@/components/capture/MeetingsHub";
import { InsightChartCard } from "@/components/charts/TaskCharts";
import BrainstormCard, { type BrainstormIdea } from "@/components/capture/BrainstormCard";
import { JournalSavedCard } from "@/components/capture/JournalCards";
import JournalHub from "@/components/capture/JournalHub";
import { useMyWork } from "@/hooks/useMyWork";
import { journalApi } from "@/lib/journalApi";
import { cn, getAuthHeaders } from "@/lib/utils";
import MeetingNotesCard from "@/components/capture/MeetingNotesCard";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { useJournalSpeaker } from "@/hooks/useJournalSpeaker";
import {
  Badge, Button,
} from "@/components/ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMarkdown(line: string): string {
  // Escape FIRST: model output (or a prompt-injected document) must never be able to
  // inject markup such as <img onerror=...>. Only the formatting below produces tags.
  return escapeHtml(line)
    .replace(/&lt;br\s*\/?&gt;/gi, "<br>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code class=\"px-1 py-0.5 rounded bg-surface-light text-[11px]\">$1</code>");
}

function renderMarkdown(text: string): string {
  const result: string[] = [];
  const blocks = text.split(/(```[\s\S]*?```)/g);

  for (const block of blocks) {
    const trimmed = block.trim();
    if (trimmed.startsWith("```")) {
      const code = block.replace(/^```[^\n]*\n?/, "").replace(/```$/, "").replace(/\n$/, "");
      result.push(`<pre class="text-[12px] leading-relaxed whitespace-pre overflow-x-auto my-2 p-3 rounded-lg bg-surface-light text-foreground/90">${escapeHtml(code)}</pre>`);
      continue;
    }

    const lines = block.split("\n");
    let inList = false;
    let listType: "ul" | "ol" | null = null;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      const headerMatch = line.match(/^(#{1,3})\s+(.+)/);
      if (headerMatch) {
        if (inList) { result.push(`</${listType}>`); inList = false; listType = null; }
        const level = headerMatch[1].length;
        result.push(`<h${level} class="text-sm font-semibold mt-4 mb-2 text-foreground">${inlineMarkdown(headerMatch[2])}</h${level}>`);
        continue;
      }

      if (line.trim().startsWith("|") && lines[i + 1] && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
        if (inList) { result.push(`</${listType}>`); inList = false; listType = null; }
        const tableLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith("|")) {
          tableLines.push(lines[i].trim());
          i++;
        }
        i--;
        const headerCells = tableLines[0].split("|").slice(1, -1).map((c) => inlineMarkdown(c.trim()));
        const bodyRows = tableLines.slice(2).map((row) =>
          row.split("|").slice(1, -1).map((c) => inlineMarkdown(c.trim()))
        );
        const cellsHtml = (cells: string[], tag: string) =>
          cells.map((c) => `<${tag} class="px-3 py-1.5 text-left align-top text-sm">${c || "&nbsp;"}</${tag}>`).join("");
        result.push(
          `<div class="my-2 overflow-x-auto"><table class="w-full text-left border-collapse min-w-[420px]">` +
          `<thead><tr class="border-b border-surface-strong">${cellsHtml(headerCells, "th")}</tr></thead>` +
          `<tbody>${bodyRows.map((cells) => `<tr class="border-b border-surface-light/60">${cellsHtml(cells, "td")}</tr>`).join("")}</tbody>` +
          `</table></div>`
        );
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
        result.push(`<li class="flex items-start gap-2 text-sm"><span class="text-primary mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-primary/60"></span><span>${inlineMarkdown(bulletMatch[1])}</span></li>`);
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
        result.push(`<li class="flex items-start gap-2 text-sm"><span class="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">${numMatch[1].match(/^\d+/)?.[0] || "•"}</span><span>${inlineMarkdown(numMatch[1].replace(/^\d+[.)]\s*/, ""))}</span></li>`);
        continue;
      }

      if (line.trim() === "") {
        if (inList) { result.push(`</${listType}>`); inList = false; listType = null; }
        result.push("<div class=\"h-2\"></div>");
        continue;
      }

      if (inList) { result.push(`</${listType}>`); inList = false; listType = null; }
      result.push(`<p class="text-sm leading-relaxed mb-2 text-foreground/90">${inlineMarkdown(line)}</p>`);
    }

    if (inList) result.push(`</${listType}>`);
  }

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

type Route = "assistant" | "journal" | "meeting_notes";
/** Chat messages carry extra tags that are stored with them: a notes capture, and (on a reply that suggests the
 *  Journal) the personal message it is about. `route` marks older replies that were written to the journal. */
type Tagged = SessionMessage & { route?: Route; capture_id?: string; suggest_journal?: string; need_action?: boolean; card?: CardKind | "brainstorm" | "journal_saved"; ideas?: BrainstormIdea[]; entry_id?: string };
type SessionLike = { id: string; context: Record<string, string> };
/** A module-level clock, so event handlers do not call Date.now() inside the component body. */
const nowMs = () => Date.now();

/** The server writes times without a timezone (they are UTC), which a browser would read as local time and be hours out. */
const utcMs = (iso?: string) => (iso ? Date.parse(/(Z|[+-]\d\d:?\d\d)$/.test(iso) ? iso : `${iso}Z`) || 0 : 0);

/** "Just now", "5 min ago", "2 h ago", "3 d ago" for the sessions list. */
const ago = (iso?: string) => {
  const minutes = Math.max(0, Math.round((nowMs() - (utcMs(iso) || nowMs())) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
};

/** What the menu offers, in four groups. The first three (the Capture group) are also the tiles on an empty chat.
 *  "compose" entries add a chip to the message bar and wait for your words; the rest answer at once with a card. */
const MODES = [
  { id: "mom", group: "Capture", icon: ClipboardList, colour: "#7CC8FF", title: "MOM", sub: "Meeting notes to action items" },
  { id: "journal", group: "Capture", icon: BookOpen, colour: "#FF9FD2", title: "Journal", sub: "A private note to yourself" },
  { id: "need", group: "Capture", icon: ListChecks, colour: "#FFD93D", title: "Need action", sub: "What needs your OK or attention" },
  { id: "journals", group: "Capture", icon: BookMarked, colour: "#FFC2E2", title: "My journals", sub: "Entries, reminders and ideas" },
  { id: "meetings", group: "Meetings", icon: CalendarDays, colour: "#7CC8FF", title: "Meeting notes", sub: "History, notes, upload and booking" },
  { id: "book", group: "Meetings", icon: CalendarPlus, colour: "#FFA45C", title: "Book meeting", sub: "Say who, when and what" },
  { id: "upload", group: "Meetings", icon: FileUp, colour: "#7FE0A0", title: "Upload meeting", sub: "A private note from a file" },
  { id: "distribution", group: "Insights", icon: PieChartIcon, colour: "#C4A7FF", title: "Task distribution", sub: "Tasks by status" },
  { id: "goals", group: "Insights", icon: Flag, colour: "#FFD93D", title: "Goal progress", sub: "Progress on each goal" },
  { id: "completion", group: "Insights", icon: TrendingUp, colour: "#FF8A7A", title: "Task completion", sub: "Completed against total" },
  { id: "brainstorm", group: "Think", icon: Lightbulb, colour: "#FF9FD2", title: "Brainstorming", sub: "Think an idea through" },
] as const;
type ModeId = (typeof MODES)[number]["id"];
const MODE_GROUPS = ["Capture", "Meetings", "Insights", "Think"] as const;
const TILE_IDS: readonly string[] = ["mom", "journal", "need"];
const TILES = MODES.filter((m) => TILE_IDS.includes(m.id));
/** "Your Inbox Today": a pill that opens your private inbox summary in a window. It is not a chat mode, so it is not in MODES. */
const INBOX_PILL = { id: "inbox", icon: Inbox, colour: "#B6F36B", title: "Your Inbox Today" } as const;
/** Everything else, as the pills under the three tiles. The inbox pill follows the meeting tools. */
const MORE = (() => {
  const rest = MODES.filter((m) => !TILE_IDS.includes(m.id));
  const at = rest.findIndex((m) => m.id === "upload") + 1;
  return [...rest.slice(0, at), INBOX_PILL, ...rest.slice(at)];
})();

/** "show my journals", "list my reminders", "show my ideas": a short request to read your own records back, never a note being written.
 *  Returns which view of your Journal to open, or null when the words are something else. */
const journalViewFor = (text: string): "journals" | "reminders" | "ideas" | null => {
  const t = text.trim();
  if (t.length > 90 || !/\b(show|see|view|list|read|display|open|give|get)\b/i.test(t) || /\b(write|add|save|create|new|set|delete|remove)\b/i.test(t)) return null;
  if (/\breminders?\b/i.test(t)) return "reminders";
  if (/\b(idea vault|ideas)\b/i.test(t)) return "ideas";
  if (/\b(journals?|journal entries|diary)\b/i.test(t)) return "journals";
  return null;
};

/** A card the chat can show in place of a written answer. */
type CardKind = "need" | "meetings" | "distribution" | "goals" | "completion" | "journals" | "reminders" | "ideas";
const CARD_ASKS: Record<CardKind, { ask: string; reply: string }> = {
  need: { ask: "What needs my action?", reply: "Here is what needs your action:" },
  meetings: { ask: "Show my meeting notes", reply: "Here are your meetings. Upload or book one from the buttons:" },
  journals: { ask: "Show my journals", reply: "Here is your Journal. Only you can see it:" },
  reminders: { ask: "Show my reminders", reply: "Here are your reminders. Only you can see them:" },
  ideas: { ask: "Show my ideas", reply: "Here is your Idea vault. Only you can see it:" },
  distribution: { ask: "Show the task distribution", reply: "Here is the task distribution:" },
  goals: { ask: "Show the goal progress", reply: "Here is the goal progress:" },
  completion: { ask: "Show the task completion", reply: "Here is the task completion:" },
};

/** What a chip on the message bar says and what the box asks for. "upload" reads like MOM, with the file picker opened first. */
type ComposeMode = "mom" | "upload" | "book" | "brainstorm" | "journal";
const COMPOSE: Record<ComposeMode, { chip: string; colour: string; icon: typeof ClipboardList; placeholder: string; help: string }> = {
  mom: { chip: "MOM", colour: "#7CC8FF", icon: ClipboardList, placeholder: "Paste your meeting notes here", help: "Paste your notes, or tap + to attach a Word, Excel or text file. I list the action items, and nothing is assigned until you press Assign." },
  upload: { chip: "Upload meeting", colour: "#7FE0A0", icon: FileUp, placeholder: "Add a note about the meeting (optional)", help: "Attach a transcript or notes (.txt, .docx, .pdf) or paste them. I read the meeting, keep it in Meeting notes and list the action items." },
  journal: { chip: "Journal", colour: "#FF9FD2", icon: BookOpen, placeholder: "Write privately…", help: "Write freely, then press Enter. It is saved to your private Journal and nobody else can see it. Afterwards I can set a reminder, only if you ask. Remove the chip to talk normally again." },
  brainstorm: { chip: "Brainstorming", colour: "#FF9FD2", icon: Lightbulb, placeholder: "What do you want to think through?", help: "Tell me a topic. I give you five ways to start, and each can become a task or go to your Idea vault. Nothing is saved until you press a button." },
  book: { chip: "Book meeting", colour: "#FFA45C", icon: CalendarPlus, placeholder: "e.g. Meeting with Rahul tomorrow at 3pm about the launch", help: "Say who, when and what. I find a time that works and show it to you. Nothing is booked, and nobody is invited, until you press the time." },
};

/** The round buttons at the ends of the message bar. */
const roundButton =
  "grid h-11 w-11 flex-shrink-0 cursor-pointer place-items-center rounded-full border-2 border-outline text-foreground transition-all hover:-translate-x-px hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50";

const firstNameOf = (user: { displayName?: string | null; email?: string | null } | null) => {
  const word = (user?.displayName || user?.email?.split("@")[0] || "").split(/[\s._-]+/)[0];
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : "";
};
const greetingFor = (hour: number, name: string) => `${hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}${name ? `, ${name}` : ""}`;

const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".csv", ".xlsx", ".xls", ".png", ".jpg", ".jpeg"];

/** The Let's Talk conversation: a greeting and three tiles when it is empty, one message bar at the bottom always. */
export default function CaptureChat({ extras, topSlot }: { extras?: ReactNode; /** shown above the greeting, only while the page is empty */ topSlot?: ReactNode } = {}) {
  const [inboxOpen, setInboxOpen] = useState(false);
  const router = useRouter();
  // "MOM" chosen from the menu or the tiles: the next message is read as meeting notes, whatever it says
  const [composeMode, setComposeMode] = useState<ComposeMode | null>(null);
  // MOM and Upload meeting both read what you give them as meeting notes
  const readsAsNotes = composeMode === "mom" || composeMode === "upload";
  const [sessionSearch, setSessionSearch] = useState("");
  const [menu, setMenu] = useState<"mode" | "attach" | null>(null);
  const [voiceLang, setVoiceLang] = useState<string>("en-IN");
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
  const [sessionsOpen, setSessionsOpen] = useState(false); // the sessions drawer on a narrow screen
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
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
  const chatEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);
  const lastRouteRef = useRef<Route>("assistant");
  // set by "Talk it through here": the next message skips the Journal suggestion
  const skipJournalSuggestionRef = useRef(false);
  const { listening, liveText, startListening, stopListening } = useVoiceInput();
  // journal replies can be read aloud, as in the Journal page's Talk mode
  const speaker = useJournalSpeaker();
  const { user, role } = useAuth();
  const { organization } = useOrganizationStore();
  const { members } = useOrgChartStore();

  const { myTasks, myGoals, ready: workReady } = useMyWork();
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
    useSessionStore.getState().fetchSessions(orgId, "assistant");
  }, [organization?.id]);

  useEffect(() => {
    if (mentionOpen && !members?.length && organization?.id) {
      useOrgChartStore.getState().fetchOrgMembers(organization.id);
    }
  }, [mentionOpen, members?.length, organization?.id]);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  const hasMessages = messages.length > 0;
  // booking cards whose time has been booked (saved on the confirming message, so it holds after a reload too)
  const closedCards = useMemo(() => new Set(messages.map((m) => m.booked_card).filter((n): n is number => typeof n === "number")), [messages]);
  // with no messages the message bar sits under the greeting and its menus open downwards; once chatting it sits at the bottom
  const menuPos = hasMessages ? "bottom-full mb-2" : "top-full mt-2";

  // the sessions list: searched by title, newest first, grouped by day
  const sessionGroups = useMemo(() => {
    const q = sessionSearch.trim().toLowerCase();
    const midnight = new Date(nowMs());
    midnight.setHours(0, 0, 0, 0);
    const today = midnight.getTime();
    const at = (x: { updated_at?: string; created_at?: string }) => utcMs(x.updated_at || x.created_at);
    const rows = sessions.filter((x) => !q || (x.title || "").toLowerCase().includes(q)).sort((a, b) => at(b) - at(a));
    return ([
      ["Today", rows.filter((x) => at(x) >= today)],
      ["Yesterday", rows.filter((x) => at(x) < today && at(x) >= today - 864e5)],
      ["Earlier", rows.filter((x) => at(x) < today - 864e5)],
    ] as [string, typeof rows][]).filter(([, group]) => group.length);
  }, [sessions, sessionSearch]);

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
      // a chat follows its newest message; the empty screen (brief, tiles) always starts at its top
      container.scrollTop = messages.length ? container.scrollHeight : 0;
    }
  }, [messages]);

  useEffect(() => {
    if (!organization?.id) return;
    try {
      const v = localStorage.getItem(`yesboss-capture-suggestions-${organization.id}`);
      if (v) setSuggestions(JSON.parse(v));
    } catch { /* ignore */ }
  }, [organization?.id]);

  useEffect(() => {
    const orgId = organization?.id;
    if (!orgId) return;
    try {
      if (suggestions) {
        localStorage.setItem(`yesboss-capture-suggestions-${orgId}`, JSON.stringify(suggestions));
      } else {
        localStorage.removeItem(`yesboss-capture-suggestions-${orgId}`);
      }
    } catch { /* ignore */ }
  }, [suggestions, organization?.id]);

  useEffect(() => () => stopListening(), [stopListening]);

  // after a message is sent the box is empty again: shrink it back to one line
  useEffect(() => {
    if (!input && inputRef.current) inputRef.current.style.height = "auto";
  }, [input]);

  const toggleMic = () => {
    if (listening) {
      stopListening();
      return;
    }
    const w = window as Window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    if (!(w.SpeechRecognition || w.webkitSpeechRecognition)) {
      const note: SessionMessage = { role: "assistant", content: "Voice input isn't available in this browser. Please type instead.", timestamp: nowMs() };
      setMessages((prev) => [...prev, note]);
      return;
    }
    speaker.stop(); // the microphone would hear the reply
    startListening((t) => setInput((prev) => (prev ? `${prev.trimEnd()} ${t}` : t)), { lang: voiceLang, continuous: true });
  };

  // remember the spoken language between visits (storage can be blocked, so never rely on it)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(VOICE_LANG_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage can only be read after hydration
      if (stored && VOICE_LANGUAGES.some((l) => l.code === stored)) setVoiceLang(stored);
    } catch { /* ignore */ }
  }, []);

  const chooseVoiceLang = (code: string) => {
    setVoiceLang(code);
    try { localStorage.setItem(VOICE_LANG_KEY, code); } catch { /* ignore */ }
  };

  // the menus in the message bar close on a click elsewhere or Escape
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest?.("[data-menu-root]")) setMenu(null);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  const ensureSession = async () => {
    if (activeSession) return activeSession;
    if (!organization?.id) return null;
    const s = await createSession(organization.id, "Dashboard Chat", "assistant");
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
        title: finalTitle, source: "ai", sourceDetail: "Added from Let's Talk", category: "growth", icon: "BarChart3",
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
  /** Ask the server what this message is. Any failure means "assistant", which is always the safe choice. */
  const routeMessage = async (text: string, opts: { hasFile?: boolean } = {}): Promise<Route> => {
    try {
      const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && !m.is_loading);
      const res = await fetch(`${API_URL}/capture-chat/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          last_route: lastRouteRef.current,
          has_file: !!opts.hasFile,
          open_question: !!lastAssistant && (!!lastAssistant.is_question || /\?\s*$/.test((lastAssistant.content || "").trim())),
        }),
      });
      if (!res.ok) return "assistant";
      const data = await res.json();
      return data.route === "journal" || data.route === "meeting_notes" ? data.route : "assistant";
    } catch {
      return "assistant";
    }
  };

  /** A personal message: nothing is saved from here. The reply offers the Journal (the text goes across to its text
   *  box, unsent) or carrying on here with the assistant. */
  const suggestJournal = (text: string, updated: SessionMessage[], s: SessionLike) => {
    lastRouteRef.current = "assistant";
    const reply: Tagged = {
      role: "assistant",
      content: "That sounds personal. Your **Journal** is the private place for it, and nothing here has been saved. Want to write it there?",
      is_answer: true,
      timestamp: nowMs(),
      suggest_journal: text,
    };
    setMessages([...updated, reply]);
    addMessage(s.id, reply);
  };

  /** "Write in Journal" on a personal message: the words go into the Journal chip, and nothing is saved until you press Enter. */
  const openJournalWith = (text: string) => {
    setComposeMode("journal");
    setInput(text);
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  /** "Talk it through here": the next message goes to the assistant even though it reads as personal. */
  const talkItThroughHere = () => {
    skipJournalSuggestionRef.current = true;
    void sendMessage("Let's talk it through here.");
  };

  /** Needs-action, meeting notes and the three charts, as a card in the chat (no AI call: it is your own data). */
  const showCard = async (kind: CardKind, askedText?: string) => {
    if (loading) return;
    const s = activeSession || (await ensureSession());
    if (!s) return;
    const { ask, reply } = CARD_ASKS[kind];
    const asked: SessionMessage = { role: "user", content: askedText || ask, timestamp: nowMs() };
    const card: Tagged = {
      role: "assistant",
      content: kind === "distribution" || kind === "goals" || kind === "completion"
        ? `${reply.slice(0, -1)}${role === "owner" ? "" : " for your own tasks"}:`
        : reply,
      is_answer: true,
      timestamp: nowMs() + 1,
      card: kind,
    };
    setMessages([...messages, asked, card]);
    addMessage(s.id, asked);
    addMessage(s.id, card);
  };

  /** Brainstorming: five ways to start on a topic, as a card. The AI only suggests; each idea is saved when you press its button. */
  const handleBrainstorm = async (topic: string) => {
    if (!organization?.id) return;
    const s = activeSession || (await ensureSession());
    if (!s) return;
    const asked: SessionMessage = { role: "user", content: topic, timestamp: nowMs() };
    const base = [...messages, asked];
    setMessages([...base, { role: "assistant", content: "", is_loading: true, timestamp: nowMs() }]);
    addMessage(s.id, asked);
    if (s.title === "New Chat" || s.title === "Dashboard Chat") renameSession(s.id, topic.slice(0, 50));
    setLoading(true);
    try {
      const { ideas } = await journalApi<{ topic: string; ideas: BrainstormIdea[] }>("/brainstorm", organization.id, { method: "POST", body: { topic } });
      const reply: Tagged = {
        role: "assistant",
        content: `Here are five ways to start thinking about **${topic.replace(/[.?!]+$/, "")}**:`,
        is_answer: true,
        timestamp: nowMs(),
        card: "brainstorm",
        ideas,
      };
      setMessages([...base, reply]);
      addMessage(s.id, reply);
    } catch (err) {
      const errMsg: SessionMessage = { role: "assistant", content: (err as Error).message || "I couldn't come up with ideas just now. Please try again.", timestamp: nowMs() };
      setMessages([...base, errMsg]);
      addMessage(s.id, errMsg);
    } finally {
      setLoading(false);
    }
  };

  /** Journal: the note is saved to your private Journal (the AI reads it for mood and themes, so it can also come back as context).
   *  The chat keeps only a placeholder and a card that reads the entry back, so the private text is not copied into the chat history. */
  const handleJournalEntry = async (text: string) => {
    if (!organization?.id || !text) return;
    const s = activeSession || (await ensureSession());
    if (!s) return;
    const shown: SessionMessage = { role: "user", content: text, timestamp: nowMs() };
    const base = [...messages, shown];
    setMessages([...base, { role: "assistant", content: "", is_loading: true, timestamp: nowMs() }]);
    addMessage(s.id, { role: "user", content: "📓 Journal entry (private, kept only in your Journal)", timestamp: nowMs() });
    if (s.title === "New Chat" || s.title === "Dashboard Chat") renameSession(s.id, "Journal");
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/journal?organization_id=${encodeURIComponent(organization.id)}`, {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include",
        body: JSON.stringify({ content: text, type: "journal" }),
      });
      if (!res.ok) throw new Error("save failed");
      const { entry } = await res.json();
      const reply: Tagged = { role: "assistant", content: "Saved to your private Journal. Only you can see it.", is_answer: true, timestamp: nowMs(), card: "journal_saved", entry_id: entry._id };
      setMessages([...base, reply]);
      addMessage(s.id, reply);
    } catch {
      const errMsg: SessionMessage = { role: "assistant", content: "I couldn't save that to your Journal just now. Your words are still in the box above, so please try again.", timestamp: nowMs() };
      setMessages([...messages, errMsg]);
      setInput(text);
    } finally {
      setLoading(false);
    }
  };

  /** A tile or a menu entry. Journal opens its own page (with what is typed so far, unsent). */
  const pickMode = (id: ModeId | "inbox") => {
    setMenu(null);
    if (id === "inbox") {
      setInboxOpen(true);
      return;
    }
    if (id === "mom" || id === "book" || id === "upload" || id === "brainstorm" || id === "journal") {
      setComposeMode(id);
      if (id === "upload") setTimeout(() => openPicker("document"), 30);
      else setTimeout(() => inputRef.current?.focus(), 30);
    } else {
      void showCard(id);
    }
  };

  // A link from the Dashboard (?mode=brainstorm | need | journal | book) opens that tool once, then tidies the address.
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (deepLinkDone.current || !organization?.id || !role) return;
    const mode = new URLSearchParams(window.location.search).get("mode");
    // "Need action" reads your tasks, so it waits for the first read instead of showing "nothing needs you" while they load
    if (mode === "need" && !workReady) return;
    deepLinkDone.current = true;
    if (!mode) return;
    window.history.replaceState(null, "", window.location.pathname);
    if (mode === "brainstorm" || mode === "need" || mode === "journal" || mode === "book") pickMode(mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, when the page and the person are known
  }, [organization?.id, role, workReady]);

  const openPicker = (kind: "document" | "image") => {
    setMenu(null);
    const el = fileInputRef.current;
    if (!el) return;
    el.accept = kind === "image" ? ".png,.jpg,.jpeg" : ".pdf,.docx,.txt,.csv,.xlsx,.xls";
    el.click();
  };

  /** Meeting notes: saved privately, read for decisions and action items, and shown as tasks to assign. */
  const handleMeetingNotes = async (
    notes: { text: string; title?: string; fileId?: string },
    base: SessionMessage[],
    s: SessionLike,
  ) => {
    lastRouteRef.current = "meeting_notes";
    setLoading(true);
    setMessages([...base, { role: "assistant", content: "", is_loading: true, timestamp: nowMs() }]);
    try {
      const title = (notes.title || notes.text.split("\n").find((l) => l.trim()) || "Meeting notes").trim().slice(0, 120);
      const created = await fetch(`${API_URL}/captures`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: organization?.id,
          source: notes.fileId ? "file" : "text",
          kind: "mom",
          visibility: "private",
          title,
          text: notes.text || undefined,
          raw_ref: notes.fileId ? { type: "file", id: notes.fileId } : undefined,
        }),
      });
      if (!created.ok) throw new Error("save failed");
      const { capture } = await created.json();
      // Saving starts the analysis in the background. If the server is set not to, start it now. Then wait
      // for the finished result (asking again while it runs would only return the half-done record).
      let result = capture;
      if (result.status === "done" && !result.analysis) {
        const started = await fetch(`${API_URL}/captures/${capture.id}/analyze?wait=true`, { method: "POST" });
        if (started.ok) result = (await started.json()).capture;
      }
      for (let tries = 0; tries < 45 && (result.status === "queued" || result.status === "processing"); tries++) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const latest = await fetch(`${API_URL}/captures/${capture.id}`);
        if (latest.ok) result = (await latest.json()).capture;
      }
      const count = (result.suggestions || []).filter((x: { status: string }) => x.status === "pending").length;
      const reply: Tagged = {
        role: "assistant",
        content: count
          ? `I read this as meeting notes and found **${count} action item${count > 1 ? "s" : ""}**. Nothing is assigned until you press Assign. The notes themselves stay private to you.`
          : "I read this as meeting notes and saved them privately. I didn't find any clear action items.",
        is_answer: true,
        timestamp: nowMs(),
      };
      reply.capture_id = capture.id;
      setMessages([...base, reply]);
      addMessage(s.id, reply);
    } catch {
      const errMsg: SessionMessage = { role: "assistant", content: "I couldn't save those notes just now. Please try again.", timestamp: nowMs() };
      setMessages([...base, errMsg]);
      addMessage(s.id, errMsg);
    } finally {
      setLoading(false);
    }
  };

  const nameForEmail = (email: string) => {
    const hit = members.find((m) => (m.email || "").toLowerCase() === email.toLowerCase());
    return hit?.full_name || email;
  };

  const sendMessage = async (overrideText?: string) => {
    const rawText = typeof overrideText === "string" ? overrideText : input;
    if ((!rawText.trim() && !attachedFile) || loading) return;
    // "Journal" was chosen: the words are a private note. The chip stays on, so several notes can follow one another.
    if (composeMode === "journal" && !attachedFile && typeof overrideText !== "string") {
      setInput("");
      return handleJournalEntry(rawText.trim());
    }
    // "show my journals" and the like: your own entries as a list (typed words only, and never while the Journal chip is on)
    const journalView = !composeMode && !attachedFile && typeof overrideText !== "string" ? journalViewFor(rawText) : null;
    if (journalView) {
      setInput("");
      return showCard(journalView, rawText.trim());
    }
    // "Brainstorming" was chosen: the words are the topic
    if (composeMode === "brainstorm" && !attachedFile && typeof overrideText !== "string") {
      setComposeMode(null);
      setInput("");
      return handleBrainstorm(rawText.trim());
    }
    // "Book meeting" was chosen: the words go to the assistant as a booking request, which answers with free slots to pick from
    if (composeMode === "book" && !attachedFile && typeof overrideText !== "string") {
      setComposeMode(null);
      const words = rawText.trim();
      return sendMessage(/\b(book|schedule|set up|arrange)\b/i.test(words) ? words : `Book a meeting ${words}`);
    }
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
          if (result && result.fileId && (readsAsNotes || (await routeMessage(result.textPreview || fileName, { hasFile: true })) === "meeting_notes")) {
            setComposeMode(null);
            // a file of meeting notes: read it like pasted notes
            const fileMsg: SessionMessage = { role: "user", content: `📎 Uploaded: **${fileName}**`, timestamp: nowMs() };
            const base = [...messages, fileMsg];
            setMessages(base);
            addMessage(s.id, fileMsg);
            updateSessionContext(s.id, { recently_uploaded_file: fileName, file_text_preview: result.textPreview || "" });
            await handleMeetingNotes({ text: "", title: fileName, fileId: result.fileId }, base, s);
            return;
          }
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

    // "MOM" was chosen: these words are meeting notes, whatever they say
    if (readsAsNotes) {
      setComposeMode(null);
      await handleMeetingNotes({ text: userMsg }, updated, s);
      return;
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

    // Meeting notes become tasks to assign. A personal reflection is never saved from here: Let's Talk only
    // suggests the Journal, which the person opens on purpose. Everything else stays with the assistant.
    const route = skipJournalSuggestionRef.current ? "assistant" : await routeMessage(userMsg);
    skipJournalSuggestionRef.current = false;
    if (route === "journal") {
      suggestJournal(userMsg, updated, s);
      return;
    }
    if (route === "meeting_notes") {
      await handleMeetingNotes({ text: userMsg }, updated, s);
      return;
    }
    lastRouteRef.current = "assistant";

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
        if (data.booking_params) {
          updateSessionContext(s.id, { pending_booking: JSON.stringify(data.booking_params) });
        }
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
      } else if (data.type === "delegate_preview" && data.delegate_params) {
        setIsStreaming(false);
        setSuggestions(null);
        const delMsg: SessionMessage = {
          role: "assistant",
          content: data.answer || "",
          is_delegate: true,
          delegate_params: data.delegate_params,
          generated_sub_tasks: data.generated_sub_tasks || [],
          timestamp: Date.now(),
        };
        setMessages([...updated, delMsg]);
        addMessage(s.id, delMsg);
      } else if (data.type === "meeting_booking" && data.booking_params) {
        setIsStreaming(false);
        setSuggestions(null);
        const bookMsg: SessionMessage = {
          role: "assistant",
          content: data.answer || "",
          is_booking: true,
          booking_params: data.booking_params,
          timestamp: Date.now(),
        };
        setMessages([...updated, bookMsg]);
        addMessage(s.id, bookMsg);
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
          const created = addKPI(organization.id, { title, source: "ai", sourceDetail: "Added from Let's Talk", category: "growth", icon: "BarChart3" });
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
        if (data.booking_params) {
          updateSessionContext(s.id, { pending_booking: JSON.stringify(data.booking_params) });
        }
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
      } else if (data.type === "delegate_preview" && data.delegate_params) {
        const delMsg: SessionMessage = {
          role: "assistant",
          content: data.answer || "",
          is_delegate: true,
          delegate_params: data.delegate_params,
          generated_sub_tasks: data.generated_sub_tasks || [],
          timestamp: Date.now(),
        };
        setMessages([...updated, delMsg]);
        addMessage(s.id, delMsg);
        setSuggestions(null);
      } else if (data.type === "meeting_booking" && data.booking_params) {
        const bookMsg: SessionMessage = {
          role: "assistant",
          content: data.answer || "",
          is_booking: true,
          booking_params: data.booking_params,
          timestamp: Date.now(),
        };
        setMessages([...updated, bookMsg]);
        addMessage(s.id, bookMsg);
        setSuggestions(null);
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

  const [dragging, setDragging] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);

  const attachFile = (file: File) => {
    const ext = `.${(file.name.split(".").pop() || "").toLowerCase()}`;
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      setDropError(`"${file.name}" is not a supported type. Use a PDF, Word, text, CSV, Excel file or an image.`);
      return;
    }
    setDropError(null);
    setAttachedFile(file);
  };

  const handleAttachFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) attachFile(file);
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

  /** Pressing a time on a booking card is the confirmation. It books through its own endpoint, not through the AI,
   *  so exactly the time that was pressed is booked, and nothing is booked from a chat request alone. */
  const bookSlot = async (slot: BookingSlot, params: BookingParams, cardId: number) => {
    const s = activeSession || (await ensureSession());
    if (!s || !organization?.id) return;
    const when = `${slot.date ? `${slot.date} ` : ""}${slot.start}`;
    const userMsg: SessionMessage = { role: "user", content: `Yes, book ${when}`, timestamp: Date.now() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    addMessage(s.id, userMsg);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/assistant/confirm-booking`, {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include",
        body: JSON.stringify({
          organization_id: organization.id,
          booking_params: { ...params, available_slots: undefined, booking_result: undefined },
          slot,
        }),
      });
      if (!res.ok) throw new Error("booking failed");
      const data = await res.json();
      const resultMsg: SessionMessage =
        data.type === "meeting_booking" && data.booking_params
          ? { role: "assistant", content: data.answer || "", is_booking: true, booking_params: data.booking_params, timestamp: Date.now() }
          : { role: "assistant", content: data.answer || "Booked. Check your calendar.", is_answer: true, timestamp: Date.now(), ...(data.booking_result?.booked ? { booked_card: cardId } : {}) };
      setMessages([...updated, resultMsg]);
      addMessage(s.id, resultMsg);
    } catch {
      const errMsg: SessionMessage = { role: "assistant", content: "I couldn't book that time, and nothing was booked. Please try again.", timestamp: Date.now() };
      setMessages([...updated, errMsg]);
      addMessage(s.id, errMsg);
    } finally {
      setLoading(false);
    }
  };

  const confirmDelegate = async (msg: SessionMessage, selected: GeneratedSubTask[]) => {
    const params = msg.delegate_params;
    if (!params || !organization?.id) return;
    const session = activeSession || sessions[0];
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/assistant/delegate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: params.title,
          description: params.description ?? null,
          assignee_id: params.assignee_id,
          assignee_name: params.assignee_name,
          assignees: params.assignees,
          priority: params.priority,
          item_type: params.item_type,
          department: params.department ?? null,
          sub_tasks: selected,
          context: {
            user_email: user?.email,
            organization_id: organization?.id,
          },
        }),
      });
      if (!res.ok) throw new Error("Delegate failed");
      await res.json();

      const typeLabel =
        params.item_type === "goal"
          ? "goal"
          : params.item_type === "both"
            ? "goal and task"
            : "task";
      const assigneeLabel = delegateAssigneeLabel(params);
      const summary = selected.length
        ? `✅ **"${params.title}"** assigned to **${assigneeLabel}** as a ${typeLabel} with ${selected.length} sub-task${selected.length > 1 ? "s" : ""}.`
        : `✅ **"${params.title}"** assigned to **${assigneeLabel}** as a ${typeLabel}.`;
      const doneMsg: SessionMessage = {
        role: "assistant",
        content: summary,
        is_answer: true,
        is_delegate: false,
        delegate_params: null,
        generated_sub_tasks: undefined,
        timestamp: Date.now(),
      };
      setMessages((prev) => prev.map((m) => (m === msg ? doneMsg : m)));
      if (session) updateLastMessage(session.id, doneMsg);
    } catch {
      const errMsg: SessionMessage = {
        role: "assistant",
        content: "Couldn't assign that right now. Please try again.",
        timestamp: Date.now(),
      };
      setMessages((prev) => prev.map((m) => (m === msg ? errMsg : m)));
      if (session) updateLastMessage(session.id, errMsg);
    } finally {
      setLoading(false);
    }
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

  const handleNewSession = async () => {
    if (!organization?.id) return;
    await createSession(organization.id, "New Chat", "assistant");
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

  /** The sessions column (desktop) and the same list in a drawer (narrow screens). */
  const renderSessions = (afterPick?: () => void) => (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="mr-auto text-base font-bold">Sessions</h2>
        <button
          type="button"
          onClick={() => { handleNewSession(); afterPick?.(); }}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 border-outline bg-highlight px-3 py-1.5 text-xs font-bold text-on-highlight shadow-[2px_2px_0_var(--shadow-hard)]"
        >
          <Plus className="h-3.5 w-3.5" /> New
        </button>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <label htmlFor="session-search" className="sr-only">Search sessions</label>
        <input
          id="session-search"
          value={sessionSearch}
          onChange={(e) => setSessionSearch(e.target.value)}
          placeholder="Search sessions"
          className="w-full rounded-full border-2 border-outline bg-surface py-2 pl-10 pr-4 text-sm font-medium placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-highlight"
        />
      </div>
      <div className="custom-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pb-2">
        {sessions.length === 0 && (
          <p className="rounded-[20px] border-2 border-dashed border-outline px-4 py-8 text-center text-sm text-text-muted">No sessions yet. Your chats appear here.</p>
        )}
        {sessions.length > 0 && sessionGroups.length === 0 && (
          <p className="px-1 text-sm text-text-muted">Nothing matches &ldquo;{sessionSearch}&rdquo;.</p>
        )}
        {sessionGroups.map(([label, rows]) => (
          <section key={label} aria-label={label}>
            <h3 className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-widest text-text-muted">{label}</h3>
            <ul className="space-y-1.5">
              {rows.map((sess) => {
                const active = sess.id === activeSessionId;
                return (
                  <li key={sess.id} className={cn("group flex items-center gap-1 rounded-2xl border-2 border-outline pr-1.5", active ? "bg-highlight text-on-highlight" : "bg-surface")}>
                    {renamingId === sess.id ? (
                      <form
                        className="flex min-w-0 flex-1 items-center gap-1 p-1.5"
                        onSubmit={(e) => { e.preventDefault(); handleRenameConfirm(sess.id); }}
                      >
                        <label htmlFor={`rename-${sess.id}`} className="sr-only">Rename session</label>
                        <input
                          id={`rename-${sess.id}`}
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          className="min-w-0 flex-1 rounded-xl border-2 border-outline bg-surface px-2.5 py-1.5 text-sm font-bold text-foreground focus:outline-none"
                        />
                        <button type="submit" aria-label="Save name" className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full"><Check className="h-4 w-4" /></button>
                        <button type="button" aria-label="Cancel" onClick={() => setRenamingId(null)} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full"><X className="h-4 w-4" /></button>
                      </form>
                    ) : (
                      <>
                        <button
                          type="button"
                          aria-current={active ? "true" : undefined}
                          onClick={() => { setActiveSession(sess.id); setMessages(sess.messages); afterPick?.(); }}
                          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left"
                        >
                          <MessageSquare className="h-4 w-4 flex-shrink-0 opacity-70" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold">{sess.title}</span>
                            <span className="block text-[11px] opacity-70">{ago(sess.updated_at || sess.created_at)} · {sess.messages.length} message{sess.messages.length === 1 ? "" : "s"}</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Rename ${sess.title}`}
                          onClick={() => { setRenamingId(sess.id); setRenameValue(sess.title); setConfirmDeleteId(null); }}
                          className="flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-full opacity-70 hover:opacity-100"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={confirmDeleteId === sess.id ? `Confirm delete ${sess.title}` : `Delete ${sess.title}`}
                          onClick={() => {
                            if (confirmDeleteId !== sess.id) return setConfirmDeleteId(sess.id);
                            handleDeleteSession(sess.id);
                            setConfirmDeleteId(null);
                          }}
                          className={cn("flex h-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-full", confirmDeleteId === sess.id ? "bg-rose-500 px-2.5 text-[11px] font-bold text-white" : "w-8 opacity-70 hover:opacity-100")}
                        >
                          {confirmDeleteId === sess.id ? "Delete?" : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );

  return (
    <div className="mx-auto flex h-full min-h-[520px] w-full max-w-5xl gap-6">
      <aside aria-label="Sessions" className="hidden w-64 flex-shrink-0 md:block">
        {renderSessions()}
      </aside>

      {sessionsOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-label="Sessions">
          <button type="button" aria-label="Close sessions" className="absolute inset-0 cursor-default bg-black/40" onClick={() => setSessionsOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[min(20rem,85vw)] border-r-[2.5px] border-outline bg-background p-4">
            {renderSessions(() => setSessionsOpen(false))}
          </div>
        </div>
      )}

      <div className="flex h-full min-w-0 max-w-3xl flex-1 flex-col">
        <div className="order-0 flex flex-shrink-0 items-center justify-between pb-2 md:hidden">
          <button
            type="button"
            onClick={() => setSessionsOpen(true)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 border-outline bg-surface px-3 py-1.5 text-xs font-bold shadow-[2px_2px_0_var(--shadow-hard)]"
          >
            <MessageSquare className="h-3.5 w-3.5" /> Sessions <span className="rounded-full bg-highlight px-1.5 text-on-highlight">{sessions.length}</span>
          </button>
          {hasMessages && (
            <button type="button" onClick={handleNewSession} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 border-outline bg-surface px-3 py-1.5 text-xs font-bold">
              <Plus className="h-3.5 w-3.5" /> New chat
            </button>
          )}
        </div>

        {!hasMessages && topSlot && <div className="order-0 flex-shrink-0 pb-3 empty:hidden">{topSlot}</div>}

        {!hasMessages && (
          <div className="order-0 flex-shrink-0 pb-4 pt-1 text-center">
            <h1 suppressHydrationWarning className="text-[28px] font-bold leading-tight text-accent md:text-4xl">
              {greetingFor(new Date(nowMs()).getHours(), firstNameOf(user))}
            </h1>
            <p className="mt-1 text-text-muted">What&apos;s on your mind?</p>
          </div>
        )}

        <div className="custom-scrollbar order-2 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain pb-4 pt-4">
          {!hasMessages && (
            <>
              {inboxOpen && (
                <div role="dialog" aria-modal="true" aria-label="Your Inbox Today" className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={() => setInboxOpen(false)}>
                  <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border-[2.5px] border-outline bg-background p-4 shadow-[6px_6px_0_var(--shadow-hard)] sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-base font-extrabold text-foreground">Your Inbox Today</p>
                      <button type="button" onClick={() => setInboxOpen(false)} aria-label="Close" className="grid h-9 w-9 cursor-pointer place-items-center rounded-full border-2 border-outline bg-surface text-foreground">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {extras}
                  </div>
                </div>
              )}
              {/* an employee has no Dashboard, so the day's brief and the evening wrap-up are here, under the message box */}
              {role === "employee" && <DailyBrief onTool={(mode) => pickMode(mode as ModeId)} />}
              <div className="mt-auto space-y-3">
                <div role="group" aria-label="Quick starts" className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  {TILES.map(({ id, icon: Icon, colour, title, sub }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => pickMode(id)}
                      style={{ background: colour }}
                      className="flex cursor-pointer items-center gap-2.5 rounded-[20px] border-2 border-outline p-2 text-left text-[#111111] shadow-[3px_3px_0_var(--shadow-hard)] transition-all hover:-translate-x-px hover:-translate-y-px sm:flex-col sm:items-start sm:gap-2 sm:p-2.5"
                    >
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 border-[#111111] bg-white">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1 sm:flex-none">
                        <span className="block text-sm font-bold leading-tight">{title}</span>
                        <span className="block text-xs leading-snug opacity-80">{sub}</span>
                      </span>
                    </button>
                  ))}
                </div>
                <div role="group" aria-label="More" className="flex flex-wrap items-center gap-2">
                  <p className="w-full text-[11px] font-bold uppercase tracking-widest text-text-muted">More</p>
                  {MORE.map(({ id, icon: Icon, colour, title }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => pickMode(id)}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-full border-2 border-outline bg-surface py-1.5 pl-1.5 pr-3.5 text-sm font-bold shadow-[2px_2px_0_var(--shadow-hard)] transition-all hover:-translate-x-px hover:-translate-y-px"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-outline text-[#111111]" style={{ background: colour }}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      {title}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-text-muted">
                  Or just ask a question, assign a task or book a meeting: I work out which it is. What you write here is private to you; only a task you assign reaches the person it is for.
                </p>
              </div>
            </>
          )}
            {messages.map((msg, i) => {
              if (msg.is_loading) {
                if (isStreaming) return null;
                return (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-highlight border-2 border-outline flex items-center justify-center flex-shrink-0 mt-1">
                      <Sparkles className="w-3.5 h-3.5 text-on-highlight" />
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
                    className={`w-8 h-8 rounded-full border-2 border-outline flex items-center justify-center flex-shrink-0 mt-1 ${
                      msg.role === "user" ? "bg-[#FF7A6B]" : "bg-highlight"
                    }`}
                  >
                    {msg.role === "user" ? (
                      <span className="text-[#111111] font-bold text-xs">
                        {user?.email?.charAt(0).toUpperCase() || "U"}
                      </span>
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-on-highlight" />
                    )}
                  </div>
                  <div
                    className={`text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "max-w-[75%] px-4 py-2.5 rounded-[22px] rounded-br-md bg-[#FF7A6B] text-[#111111] font-bold border-2 border-outline shadow-[3px_3px_0_var(--shadow-hard)]"
                        : "max-w-[90%] text-foreground"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      msg.is_delegate && msg.delegate_params ? (
                        <div className="space-y-3">
                          {msg.content && <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />}
                          <DelegatePreviewCard
                            params={msg.delegate_params}
                            subTasks={msg.generated_sub_tasks || []}
                            onConfirm={(selected) => confirmDelegate(msg, selected)}
                            disabled={loading}
                          />
                        </div>
                      ) : msg.is_booking && msg.booking_params ? (
                        <div className="space-y-3">
                          {msg.content && <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />}
                          <BookingCard
                            params={msg.booking_params}
                            onBook={(slot) => bookSlot(slot, msg.booking_params as BookingParams, msg.timestamp)}
                            disabled={loading || closedCards.has(msg.timestamp)}
                            done={closedCards.has(msg.timestamp)}
                          />
                        </div>
                      ) : (msg as Tagged).need_action || (msg as Tagged).card === "need" ? (
                        <div className="space-y-3">
                          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                          <NeedActionCard isOwner={role === "owner"} userEmail={user?.email || ""} />
                        </div>
                      ) : (msg as Tagged).card === "brainstorm" && organization?.id ? (
                        <div className="space-y-3">
                          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                          <BrainstormCard orgId={organization.id} ideas={(msg as Tagged).ideas || []} />
                        </div>
                      ) : (msg as Tagged).card === "journal_saved" && organization?.id && (msg as Tagged).entry_id ? (
                        <div className="space-y-3">
                          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                          <JournalSavedCard orgId={organization.id} entryId={(msg as Tagged).entry_id as string} />
                        </div>
                      ) : ((msg as Tagged).card === "journals" || (msg as Tagged).card === "reminders" || (msg as Tagged).card === "ideas") && organization?.id ? (
                        <div className="space-y-3">
                          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                          <JournalHub orgId={organization.id} initialTab={(msg as Tagged).card === "reminders" ? "reminders" : (msg as Tagged).card === "ideas" ? "ideas" : "entries"} />
                        </div>
                      ) : (msg as Tagged).card === "meetings" ? (
                        <div className="space-y-3">
                          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                          {organization?.id && <MeetingsHub orgId={organization.id} nameFor={nameForEmail} />}
                        </div>
                      ) : (msg as Tagged).card === "distribution" || (msg as Tagged).card === "goals" || (msg as Tagged).card === "completion" ? (
                        <div className="space-y-3">
                          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                          <InsightChartCard kind={(msg as Tagged).card as "distribution" | "goals" | "completion"} tasks={myTasks} goals={myGoals} own={role !== "owner"} />
                        </div>
                      ) : (msg as Tagged).capture_id ? (
                        <div className="space-y-3">
                          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                          <MeetingNotesCard captureId={(msg as Tagged).capture_id as string} nameFor={nameForEmail} />
                        </div>
                      ) : (
                        <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                      )
                    ) : (
                      msg.content
                    )}
                    {msg.role === "assistant" && (msg as Tagged).route === "journal" && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {!msg.is_delegate && msg.content && (
                          <button
                            type="button"
                            onClick={() => void speaker.toggle(String(msg.timestamp), msg.content, /[ऀ-ॿ]/.test(msg.content) ? "hi-IN" : "en-IN")}
                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-text-muted transition-colors hover:border-primary/40 hover:text-foreground"
                            aria-label={speaker.activeId === String(msg.timestamp) && speaker.status !== "idle" ? "Stop reading aloud" : "Read this reply aloud"}
                          >
                            {speaker.activeId === String(msg.timestamp) && speaker.status === "loading" ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : speaker.activeId === String(msg.timestamp) && speaker.status === "playing" ? (
                              <Square className="h-3.5 w-3.5" />
                            ) : (
                              <Volume2 className="h-3.5 w-3.5" />
                            )}
                            {speaker.activeId === String(msg.timestamp) && speaker.status !== "idle" ? "Stop" : "Listen"}
                          </button>
                        )}
                      </div>
                    )}
                    {msg.role === "assistant" && (msg as Tagged).suggest_journal && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openJournalWith((msg as Tagged).suggest_journal as string)}
                          className="inline-flex cursor-pointer items-center gap-2 rounded-full border-2 border-outline bg-highlight px-4 py-1.5 text-sm font-bold text-on-highlight shadow-[3px_3px_0_var(--shadow-hard)] transition-all hover:-translate-x-px hover:-translate-y-px"
                        >
                          <BookOpen className="h-4 w-4" /> Write in Journal
                        </button>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => talkItThroughHere()}
                          className="inline-flex cursor-pointer items-center gap-2 rounded-full border-2 border-outline bg-surface px-4 py-1.5 text-sm font-bold text-foreground shadow-[3px_3px_0_var(--shadow-hard)] transition-all hover:-translate-x-px hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Talk it through here
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          {isStreaming && (
            <div className="flex items-start gap-3 animate-in fade-in slide-in-from-bottom-1 duration-200">
              <div className="w-8 h-8 rounded-full bg-highlight border-2 border-outline flex items-center justify-center flex-shrink-0 mt-1">
                <Sparkles className="w-3.5 h-3.5 text-on-highlight" />
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
        <div className="order-2 flex-shrink-0 empty:hidden">
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
        </div>
        <div
          className={cn("relative z-30 flex flex-shrink-0 flex-col", hasMessages ? "order-3 pt-2" : "order-1")}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) attachFile(file);
          }}
        >
          {attachedFile && (
            <div className="mb-2 flex items-center gap-2 rounded-full border-2 border-outline bg-surface px-3.5 py-1.5 text-xs font-bold">
              <Paperclip className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="flex-1 truncate">{attachedFile.name}</span>
              <button
                type="button"
                onClick={removeAttachedFile}
                aria-label="Remove the attached file"
                className="grid h-5 w-5 cursor-pointer place-items-center rounded-full hover:bg-surface-light"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {dropError && (
            <p className="mb-2 text-xs text-rose-400" role="alert">
              {dropError}
            </p>
          )}
          {composeMode && (
            <p className="mb-2 px-2 text-xs font-semibold text-text-muted">{COMPOSE[composeMode].help}</p>
          )}
          {listening && (
            <p className="mb-2 animate-pulse px-2 text-xs font-bold text-rose-400" role="status">
              Listening… {liveText ? `“${liveText}”` : "start speaking"}
            </p>
          )}

          {/* wide: one row. narrow: the text box takes the whole first row and the buttons sit under it */}
          <div className={cn("relative flex flex-wrap items-end gap-2 rounded-[28px] border-[2.5px] border-outline bg-surface p-2 shadow-[4px_4px_0_var(--shadow-hard)] transition-colors sm:flex-nowrap", dragging && "bg-highlight")}>
            <div className="relative flex-shrink-0" data-menu-root>
              <button
                type="button"
                aria-label="Choose what to do: capture, meetings or insights"
                aria-haspopup="menu"
                aria-expanded={menu === "mode"}
                onClick={() => setMenu(menu === "mode" ? null : "mode")}
                className={cn(roundButton, menu === "mode" || composeMode ? "bg-highlight text-on-highlight" : "bg-surface-light")}
              >
                <Menu className="h-5 w-5" />
              </button>
              {menu === "mode" && (
                <div role="menu" className={cn("absolute left-0 z-50 w-72 overflow-hidden rounded-[22px] border-[2.5px] border-outline bg-surface shadow-[4px_4px_0_var(--shadow-hard)]", menuPos)}>
                  <div className="max-h-[min(55vh,24rem)] overflow-y-auto overscroll-contain">
                    {MODE_GROUPS.map((group) => (
                      <div key={group} role="group" aria-label={group}>
                        <p className="bg-surface-light/60 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-widest text-text-muted">{group}</p>
                        {MODES.filter((m) => m.group === group).map(({ id, icon: Icon, colour, title, sub }) => (
                          <button
                            key={id}
                            type="button"
                            role="menuitem"
                            onClick={() => pickMode(id)}
                            className="flex w-full cursor-pointer items-center gap-3 border-b border-border px-3.5 py-2.5 text-left last:border-b-0 hover:bg-surface-light"
                          >
                            <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full border-2 border-outline text-[#111]" style={{ background: colour }}>
                              <Icon className="h-4 w-4" />
                            </span>
                            <span>
                              <span className="block text-sm font-bold">{title}</span>
                              <span className="block text-xs text-text-muted">{sub}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 border-t-2 border-outline bg-surface-light/60 px-3.5 py-2.5">
                    <label htmlFor="voice-language" className="text-xs font-bold text-text-muted">Voice language</label>
                    <select
                      id="voice-language"
                      value={voiceLang}
                      onChange={(e) => chooseVoiceLang(e.target.value)}
                      disabled={listening}
                      className="min-w-0 flex-1 cursor-pointer rounded-full border-2 border-outline bg-surface px-2.5 py-1 text-xs font-bold text-foreground focus:outline-none disabled:opacity-50 [&>option]:bg-surface [&>option]:text-foreground"
                    >
                      {VOICE_LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="relative flex-shrink-0" data-menu-root>
              <button
                type="button"
                aria-label="Attach a document or an image"
                aria-haspopup="menu"
                aria-expanded={menu === "attach"}
                onClick={() => setMenu(menu === "attach" ? null : "attach")}
                className={cn(roundButton, menu === "attach" || attachedFile ? "bg-highlight text-on-highlight" : "bg-surface-light")}
              >
                <Plus className="h-5 w-5" />
              </button>
              {menu === "attach" && (
                <div role="menu" className={cn("absolute left-0 z-50 w-64 overflow-hidden rounded-[22px] border-[2.5px] border-outline bg-surface shadow-[4px_4px_0_var(--shadow-hard)]", menuPos)}>
                  {([
                    { kind: "document", icon: FileText, colour: "#7CC8FF", title: "Document", sub: "PDF, Word, Excel or text" },
                    { kind: "image", icon: ImageIcon, colour: "#FF9FD2", title: "Image", sub: "A photo or screenshot" },
                  ] as const).map(({ kind, icon: Icon, colour, title, sub }) => (
                    <button
                      key={kind}
                      type="button"
                      role="menuitem"
                      onClick={() => openPicker(kind)}
                      className="flex w-full cursor-pointer items-center gap-3 border-b border-border px-3.5 py-3 text-left last:border-b-0 hover:bg-surface-light"
                    >
                      <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full border-2 border-outline text-[#111]" style={{ background: colour }}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span>
                        <span className="block text-sm font-bold">{title}</span>
                        <span className="block text-xs text-text-muted">{sub}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <input ref={fileInputRef} type="file" accept={ACCEPTED_EXTENSIONS.join(",")} className="hidden" onChange={handleAttachFile} />

            <div className="relative order-first min-w-0 basis-full sm:order-none sm:flex-1 sm:basis-0">
              {composeMode && (() => {
                const { chip, colour, icon: ChipIcon } = COMPOSE[composeMode];
                return (
                  <span style={{ background: colour }} className="mb-1 ml-1 inline-flex items-center gap-1.5 rounded-full border-2 border-outline py-0.5 pl-2.5 pr-1 text-xs font-extrabold text-[#111]">
                    <ChipIcon className="h-3.5 w-3.5" /> {chip}
                    <button type="button" onClick={() => setComposeMode(null)} aria-label={`Remove ${chip}`} className="grid h-4 w-4 cursor-pointer place-items-center rounded-full hover:bg-white/60">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })()}
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
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              aria-label="Message"
              onChange={(e) => {
                const next = e.target.value;
                setInput(next);
                const cursor = e.target.selectionStart ?? inputRef.current?.selectionStart ?? next.length;
                updateMentionState(next, cursor);
                // grow with the text (pasted meeting notes are many lines), up to a limit
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
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
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={composeMode ? COMPOSE[composeMode].placeholder : attachedFile ? "Add a note about the file (optional)" : "Ask or write anything"}
              className="max-h-[200px] min-h-[40px] w-full resize-none bg-transparent px-2 py-2.5 text-sm text-foreground placeholder:text-text-muted focus:outline-none"
            />
            </div>

            {input.trim() || attachedFile ? (
              <button
                type="button"
                onClick={() => sendMessage()}
                disabled={loading}
                aria-label="Send"
                className={cn(roundButton, "bg-primary text-on-primary shadow-[2px_2px_0_var(--shadow-hard)]")}
              >
                <Send className="h-5 w-5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={toggleMic}
                aria-label={listening ? "Stop listening" : "Dictate"}
                title={listening ? "Stop listening" : "Dictate"}
                className={cn(roundButton, "ml-auto sm:ml-0", listening ? "animate-pulse bg-rose-500 text-white" : "bg-surface-light")}
              >
                {listening ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
              </button>
            )}
          </div>

        </div>
        </div>
    </div>
  );
}

function BookingCard({
  params,
  onBook,
  disabled,
  done,
}: {
  params: BookingParams;
  onBook: (slot: BookingSlot) => void;
  disabled?: boolean;
  /** a time on this card has been booked: the card is closed */
  done?: boolean;
}) {
  const slots = params.available_slots || [];
  const booked = params.booking_result?.booked;
  // a proposal: the first time is the one asked for, and nothing is booked until a time is pressed
  const confirming = !!params.booking_result?.needs_confirmation;
  const people = params.attendee_emails?.length || 0;

  if (booked) {
    const r = params.booking_result;
    return (
      <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-4 space-y-2 min-w-[280px] max-w-[420px]">
        <div className="flex items-center gap-2 text-emerald-400 font-medium">
          <Check className="w-5 h-5" />
          Meeting Booked
        </div>
        <p className="text-sm text-foreground font-medium">{r?.title || "Meeting"}</p>
        <p className="text-xs text-text-muted">
          {r?.slot?.date ? `${r.slot.date} · ` : ""}
          {r?.slot?.start || ""} – {r?.slot?.end || ""}
          {r?.count && r.count > 1 ? ` (${r.count} occurrences)` : ""}
        </p>
        <p className="text-xs text-text-muted">{r?.attendees?.length || 0} attendee(s)</p>
      </div>
    );
  }

  if (!slots.length) return null;

  return (
    <div className="rounded-2xl bg-surface border border-border p-4 space-y-3 min-w-[280px] max-w-[420px]">
      <p className="text-[10px] font-medium text-text-muted uppercase tracking-wider">{confirming ? "Confirm a time" : "Available Slots"}</p>
      {confirming && (
        <p className="text-sm font-bold">
          {params.title || "Meeting"} <span className="font-normal text-text-muted">· {people} attendee{people === 1 ? "" : "s"}</span>
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {slots.slice(0, 8).map((slot, i) => (
          <button
            key={i}
            onClick={() => onBook(slot)}
            disabled={disabled}
            className={cn(
              "px-3 py-2 rounded-lg border text-sm font-medium transition-all cursor-pointer disabled:opacity-50",
              confirming && i === 0 ? "border-outline bg-highlight text-on-highlight font-bold" : "bg-primary/10 hover:bg-primary/20 border-primary/20 text-primary",
            )}
          >
            {slot.date ? `${slot.date.slice(5)} ` : ""}
            {slot.start} – {slot.end}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-text-muted">{done ? "Booked. Ask again to book another time." : confirming ? "Nothing is booked or sent until you press a time." : "Pressing a time books it and sends the invites."}</p>
    </div>
  );
}
