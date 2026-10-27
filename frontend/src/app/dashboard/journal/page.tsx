"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useSessionStore, type SessionMessage } from "@/stores/sessionStore";
import { getAuthHeaders } from "@/lib/utils";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { SPEEDS, useJournalSpeaker } from "@/hooks/useJournalSpeaker";
import DashboardLayout from "@/components/DashboardLayout";
import {
  AudioLines,
  Check,
  Copy,
  History,
  Keyboard,
  Loader2,
  Mic,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Square,
  Volume2,
  X,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

type Mode = "write" | "talk";
type LangId = "auto" | "en" | "hi" | "hinglish";

const LANGUAGES: { id: LangId; label: string; recognition: string; voice: string }[] = [
  { id: "auto", label: "Auto", recognition: "en-IN", voice: "en-IN" },
  { id: "en", label: "English", recognition: "en-IN", voice: "en-IN" },
  { id: "hi", label: "हिन्दी", recognition: "hi-IN", voice: "hi-IN" },
  { id: "hinglish", label: "Hinglish", recognition: "en-IN", voice: "hi-IN" },
];

const PROMPTS = [
  "What went well today?",
  "What's weighing on me?",
  "What do I want to focus on?",
  "I need to think something through",
];

const PREF_KEY = "yesboss-journal-prefs";
const EMPTY_MESSAGES: SessionMessage[] = [];

function isJournalSession(session: { kind?: string; title?: string }) {
  return session.kind === "journal" || (!session.kind && (session.title || "").startsWith("Journal"));
}

function journalTitle(ts = Date.now()) {
  return `Journal · ${new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

function loadPrefs(): { mode?: Mode; lang?: LangId } {
  try {
    return JSON.parse(localStorage.getItem(PREF_KEY) || "{}");
  } catch {
    return {};
  }
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function JournalPage() {
  const { user, role, loading: authLoading } = useAuth();
  const router = useRouter();
  const { organization } = useOrganizationStore();
  const { sessions, fetchSessions, createSession, setActiveSession, addMessage, getActiveSession } =
    useSessionStore();

  const [mode, setMode] = useState<Mode>(() => (loadPrefs().mode === "talk" ? "talk" : "write"));
  const [lang, setLang] = useState<LangId>(() => {
    const saved = loadPrefs().lang;
    return LANGUAGES.some((item) => item.id === saved) ? (saved as LangId) : "auto";
  });
  const [input, setInput] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { listening, interimText, startListening, stopListening } = useVoiceInput();
  const speaker = useJournalSpeaker();
  const initialized = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const endRef = useRef<HTMLDivElement>(null);

  const langConfig = LANGUAGES.find((item) => item.id === lang) ?? LANGUAGES[0];

  const currentSession = getActiveSession();
  const activeSession = currentSession && isJournalSession(currentSession) ? currentSession : null;
  const messages = activeSession?.messages || EMPTY_MESSAGES;
  const journalSessions = useMemo(() => sessions.filter(isJournalSession), [sessions]);

  const firstName = useMemo(() => {
    const name = (user as { displayName?: string | null } | null)?.displayName || "";
    return name.trim().split(/\s+/)[0] || "";
  }, [user]);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Remember the chosen mode and language on this device.
  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ mode, lang }));
    } catch {
      /* preferences are optional */
    }
  }, [mode, lang]);

  useEffect(() => {
    if (!organization?.id || initialized.current === organization.id) return;
    initialized.current = organization.id;
    void (async () => {
      await fetchSessions(organization.id, "journal");
      const loaded = useSessionStore.getState().sessions;
      const today = new Date().toDateString();
      const existing = loaded.find(
        (session) => isJournalSession(session) && new Date(session.created_at).toDateString() === today
      );
      if (existing) {
        setActiveSession(existing.id);
      } else {
        await createSession(organization.id, journalTitle(), "journal");
      }
    })();
  }, [organization?.id, fetchSessions, createSession, setActiveSession]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isAsking, interimText]);

  useEffect(() => {
    if (!historyOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHistoryOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [historyOpen]);

  const syncJournalEntry = async (sessionId: string, msgs: SessionMessage[]) => {
    if (!organization?.id || sessionId.startsWith("local_")) return;
    try {
      const res = await fetch(`${API_URL}/journal/sync?organization_id=${organization.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          session_id: sessionId,
          organization_id: organization.id,
          messages: msgs.map((m) => ({ role: m.role, content: m.content, timestamp: m.timestamp })),
        }),
      });
      if (!res.ok) throw new Error("Journal sync failed");
    } catch {
      if (mountedRef.current) {
        setError("This reflection is in your chat, but it didn't save to your journal log.");
      }
    }
  };

  const voiceLangFor = (text: string) =>
    /[ऀ-ॿ]/.test(text) ? "hi-IN" : langConfig.voice;

  /** Send a message. In talk mode the reply is read aloud automatically. */
  const send = async (raw?: string, speakReply = false) => {
    const text = (raw ?? input).trim();
    if (!text || !activeSession || isAsking) return;

    speaker.stop();
    stopListening();
    setInput("");
    setError(null);
    const userMessage: SessionMessage = { role: "user", content: text, timestamp: new Date().getTime() };
    setIsAsking(true);
    await addMessage(activeSession.id, userMessage);

    try {
      const history = [...activeSession.messages, userMessage]
        .filter((message) => message.content)
        .map((message) => ({ role: message.role, content: message.content }))
        .slice(-10);

      const res = await fetch(`${API_URL}/assistant/ask`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          message: text,
          mode: "journal",
          language: lang === "auto" ? undefined : lang,
          session_id: activeSession.id,
          session_context: activeSession.context,
          context: { organization_id: organization?.id, role: role || "owner" },
          conversation_history: history,
        }),
      });
      if (!res.ok) throw new Error("Journal request failed");
      const data = await res.json();
      const reply =
        (data.type === "question" && data.question?.text) ||
        [data.answer, data.follow_up].filter(Boolean).join("\n\n") ||
        "I'm here. Tell me a little more.";

      const assistantMessage: SessionMessage = {
        role: "assistant",
        content: reply,
        is_answer: data.type !== "question",
        timestamp: new Date().getTime(),
      };
      await addMessage(activeSession.id, assistantMessage);
      await syncJournalEntry(activeSession.id, [...activeSession.messages, userMessage, assistantMessage]);
      if (mountedRef.current && speakReply) {
        void speaker.toggle(String(assistantMessage.timestamp), reply, voiceLangFor(reply));
      }
    } catch {
      setError("I couldn't reach your journal just now. Please try again.");
    } finally {
      setIsAsking(false);
    }
  };

  /** Push-to-talk: tap once to start, tap again to finish. */
  const toggleMic = () => {
    if (listening) {
      stopListening(); // the final transcript is delivered by the hook's onend
      return;
    }
    const w = window as Window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    if (!(w.SpeechRecognition || w.webkitSpeechRecognition)) {
      setError("Voice input isn't available in this browser. Please type instead.");
      return;
    }
    if (isAsking || !activeSession) return;
    speaker.stop();
    setError(null);
    startListening(
      (transcript) => {
        if (mode === "talk") {
          void send(transcript, true);
        } else {
          setInput((prev) => (prev ? `${prev.trimEnd()} ${transcript}` : transcript));
        }
      },
      { lang: langConfig.recognition, continuous: true }
    );
  };

  const openEntry = (sessionId: string) => {
    stopListening();
    speaker.stop();
    setError(null);
    setActiveSession(sessionId);
    setHistoryOpen(false);
  };

  const handleNewEntry = async () => {
    if (!organization?.id || isAsking) return;
    stopListening();
    speaker.stop();
    setInput("");
    setError(null);
    await createSession(organization.id, journalTitle(), "journal");
    setHistoryOpen(false);
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    stopListening();
    speaker.stop();
    setMode(next);
  };

  const copyMessage = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1500);
    } catch {
      setError("Couldn't copy to the clipboard.");
    }
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="claude-loader" />
      </div>
    );
  }

  const talkStatus = listening
    ? "Listening… tap again to send"
    : isAsking
      ? "Thinking…"
      : speaker.status === "loading"
        ? "Preparing voice…"
        : speaker.status === "playing"
          ? "Speaking… tap to reply"
          : "Tap the mic and speak";

  const canType = !!activeSession && !isAsking;

  return (
    <DashboardLayout>
      <div className="relative mx-auto flex h-[calc(100vh-7rem)] max-w-3xl flex-col md:h-[calc(100vh-8rem)]">
        {/* Top bar */}
        <header className="flex flex-wrap items-center justify-between gap-2 pb-3">
          <div
            role="tablist"
            aria-label="Journal mode"
            className="flex rounded-full border border-border bg-surface p-1"
          >
            {(
              [
                { id: "write", label: "Write", icon: Pencil },
                { id: "talk", label: "Talk", icon: AudioLines },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                role="tab"
                aria-selected={mode === id}
                onClick={() => switchMode(id)}
                className={`flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  mode === id ? "bg-primary text-white" : "text-text-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="journal-language">
              Language
            </label>
            <select
              id="journal-language"
              value={lang}
              onChange={(event) => {
                stopListening();
                setLang(event.target.value as LangId);
              }}
              className="cursor-pointer rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              {LANGUAGES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id === "auto" ? "Language: Auto" : item.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => setHistoryOpen(true)}
              aria-label="Past entries"
              title="Past entries"
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border bg-surface text-text-muted transition-colors hover:text-foreground"
            >
              <History className="h-4 w-4" />
            </button>
            <button
              onClick={handleNewEntry}
              disabled={isAsking || listening || !organization?.id}
              aria-label="New entry"
              title="New entry"
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border bg-surface text-text-muted transition-colors hover:text-foreground disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Conversation */}
        <section aria-live="polite" className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-1">
          {error && (
            <p className="mb-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {error}
            </p>
          )}

          {messages.length === 0 && !isAsking && (
            <div className="flex h-full flex-col items-center justify-center gap-6 pb-8 text-center">
              <div>
                <h1 className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-3xl font-semibold text-transparent md:text-4xl">
                  {greeting()}
                  {firstName ? `, ${firstName}` : ""}
                </h1>
                <p className="mt-2 text-lg text-text-muted">What&apos;s on your mind today?</p>
              </div>
              <div className="flex max-w-xl flex-wrap justify-center gap-2">
                {PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => void send(prompt, mode === "talk")}
                    disabled={!canType || listening}
                    className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2 text-sm text-text-muted transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-6 py-3">
            {messages.map((message, index) => {
              const id = String(message.timestamp);
              const isUser = message.role === "user";
              const isThisPlaying = speaker.activeId === id;
              return (
                <div key={`${message.timestamp}-${index}`} className={isUser ? "flex justify-end" : "flex gap-3"}>
                  {isUser ? (
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-lg bg-primary/10 px-4 py-3 text-[15px] leading-relaxed text-foreground">
                      {message.content}
                    </div>
                  ) : (
                    <>
                      <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-purple-500 text-white">
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
                          {message.content}
                        </div>
                        <div className="mt-2 flex items-center gap-1">
                          <button
                            onClick={() => void speaker.toggle(id, message.content, voiceLangFor(message.content))}
                            aria-label={isThisPlaying ? "Stop reading aloud" : "Read aloud"}
                            title={isThisPlaying ? "Stop" : "Read aloud"}
                            className={`flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs transition-colors hover:bg-surface ${
                              isThisPlaying ? "text-primary" : "text-text-muted hover:text-foreground"
                            }`}
                          >
                            {isThisPlaying && speaker.status === "loading" ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Preparing voice…
                              </>
                            ) : isThisPlaying ? (
                              <>
                                <Square className="h-3.5 w-3.5 fill-current" />
                                Stop
                              </>
                            ) : (
                              <>
                                <Volume2 className="h-4 w-4" />
                                Listen
                              </>
                            )}
                          </button>
                          <label className="sr-only" htmlFor={`speed-${id}`}>
                            Playback speed
                          </label>
                          <select
                            id={`speed-${id}`}
                            value={speaker.speed}
                            onChange={(event) => speaker.setSpeed(Number(event.target.value))}
                            title="Listening speed"
                            className="h-8 cursor-pointer rounded-full bg-transparent px-2 text-xs text-text-muted transition-colors hover:bg-surface hover:text-foreground focus:outline-none [&>option]:bg-background [&>option]:text-foreground"
                          >
                            {SPEEDS.map((value) => (
                              <option key={value} value={value}>
                                {value}x
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => void copyMessage(id, message.content)}
                            aria-label="Copy"
                            title="Copy"
                            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface hover:text-foreground"
                          >
                            {copiedId === id ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {isAsking && (
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-purple-500 text-white">
                  <Sparkles className="h-4 w-4 animate-pulse" />
                </div>
                <span className="text-sm text-text-muted">Thinking…</span>
              </div>
            )}
            <div ref={endRef} />
          </div>
        </section>

        {/* Composer */}
        <footer className="flex-shrink-0 pt-2">
          {mode === "write" ? (
            <div className="rounded-3xl border border-border bg-surface px-3 py-2 shadow-sm focus-within:border-primary/50">
              {listening && (
                <p className="px-2 pb-1 text-xs italic text-primary">
                  Listening… {interimText || "speak now, then tap the mic again"}
                </p>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  rows={1}
                  placeholder="Write what's on your mind…"
                  disabled={!canType}
                  className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2.5 text-[15px] text-foreground placeholder:text-text-muted focus:outline-none disabled:opacity-50"
                />
                <button
                  onClick={toggleMic}
                  disabled={!canType}
                  aria-label={listening ? "Stop dictation" : "Dictate with your voice"}
                  title={listening ? "Tap to finish" : "Speak instead of typing"}
                  className={`flex h-10 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors disabled:opacity-50 ${
                    listening ? "animate-pulse bg-rose-500 text-white" : "text-text-muted hover:bg-background hover:text-foreground"
                  }`}
                >
                  {listening ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-5 w-5" />}
                </button>
                <button
                  onClick={() => void send()}
                  disabled={!input.trim() || !canType || listening}
                  aria-label="Send"
                  className="flex h-10 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-white transition-opacity disabled:opacity-40"
                >
                  {isAsking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 pb-1">
              {listening && interimText && (
                <p className="max-w-md text-center text-sm italic text-text-muted">{interimText}</p>
              )}
              <div className="relative flex h-20 w-20 items-center justify-center">
                {listening && (
                  <span aria-hidden className="absolute inset-0 rounded-full bg-rose-500/30 animate-ping" />
                )}
                <button
                  onClick={() => {
                    if (speaker.status !== "idle") speaker.stop();
                    toggleMic();
                  }}
                  disabled={!canType && !listening && speaker.status === "idle"}
                  aria-label={listening ? "Tap to send" : "Tap to speak"}
                  className={`relative flex h-16 w-16 cursor-pointer items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 ${
                    listening ? "bg-rose-500" : "bg-gradient-to-br from-primary to-purple-500"
                  }`}
                >
                  {isAsking || speaker.status === "loading" ? (
                    <Loader2 className="h-7 w-7 animate-spin" />
                  ) : listening ? (
                    <Send className="h-6 w-6" />
                  ) : speaker.status === "playing" ? (
                    <AudioLines className="h-7 w-7" />
                  ) : (
                    <Mic className="h-7 w-7" />
                  )}
                </button>
              </div>
              <p role="status" aria-live="polite" className="text-sm text-text-muted">
                {talkStatus}
              </p>
              <button
                onClick={() => switchMode("write")}
                className="flex cursor-pointer items-center gap-1.5 text-xs text-text-muted transition-colors hover:text-foreground"
              >
                <Keyboard className="h-3.5 w-3.5" />
                Type instead
              </button>
            </div>
          )}
          <p className="mt-2 text-center text-[11px] text-text-muted">
            Your journal is private. Voice is never recorded or stored, only the text.
          </p>
        </footer>

        {/* Past entries drawer */}
        {historyOpen && (
          <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-label="Past entries">
            <button
              aria-label="Close"
              className="absolute inset-0 cursor-default bg-black/40"
              onClick={() => setHistoryOpen(false)}
            />
            <aside className="relative flex h-full w-80 max-w-[85vw] flex-col border-l border-border bg-background shadow-xl">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="text-base font-semibold">Past entries</h2>
                <button
                  onClick={() => setHistoryOpen(false)}
                  aria-label="Close"
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-text-muted hover:bg-surface hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="custom-scrollbar flex-1 space-y-1 overflow-y-auto p-2">
                {journalSessions.length === 0 && (
                  <p className="p-3 text-sm text-text-muted">No entries yet.</p>
                )}
                {journalSessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => openEntry(session.id)}
                    className={`w-full cursor-pointer rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                      session.id === activeSession?.id
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-surface"
                    }`}
                  >
                    {session.title.replace("Journal · ", "")}
                  </button>
                ))}
              </div>
              <div className="border-t border-border p-3">
                <button
                  onClick={handleNewEntry}
                  disabled={isAsking || !organization?.id}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  New entry
                </button>
              </div>
            </aside>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
