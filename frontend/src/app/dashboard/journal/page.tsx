"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useSessionStore, type SessionMessage } from "@/stores/sessionStore";
import { getAuthHeaders } from "@/lib/utils";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui";
import {
  BookOpen,
  Loader2,
  Mic,
  MicOff,
  Plus,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

const PROMPTS = [
  "What went well today?",
  "What's weighing on me?",
  "What do I want to focus on?",
];

type SpeechWindow = Window & {
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
};

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

function toSpeech(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_`>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function JournalPage() {
  const { user, role, loading: authLoading } = useAuth();
  const router = useRouter();
  const { organization } = useOrganizationStore();
  const {
    sessions,
    fetchSessions,
    createSession,
    setActiveSession,
    addMessage,
    getActiveSession,
  } = useSessionStore();

  const [input, setInput] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { listening, interimText, startListening, stopListening } = useVoiceInput();
  const initialized = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const endRef = useRef<HTMLDivElement>(null);

  const currentSession = getActiveSession();
  const activeSession = currentSession && isJournalSession(currentSession) ? currentSession : null;
  const messages = activeSession?.messages || EMPTY_MESSAGES;

  const journalSessions = useMemo(
    () => sessions.filter(isJournalSession).slice(0, 6),
    [sessions]
  );

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    if (!organization?.id || initialized.current === organization.id) return;
    initialized.current = organization.id;
    void (async () => {
      await fetchSessions(organization.id, "journal");
      const loaded = useSessionStore.getState().sessions;
      const today = new Date().toDateString();
      const existing = loaded.find(
        (session) =>
          isJournalSession(session) &&
          new Date(session.created_at).toDateString() === today
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

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!voiceOn || !("speechSynthesis" in window)) return;
      const clean = toSpeech(text);
      if (!clean) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(clean);
      const preferred = window.speechSynthesis
        .getVoices()
        .find((voice) => voice.lang.startsWith("en") && /natural|samantha|google/i.test(voice.name));
      if (preferred) utterance.voice = preferred;
      utterance.lang = "en-US";
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
    },
    [voiceOn]
  );

  const syncJournalEntry = async (sessionId: string, msgs: SessionMessage[]) => {
    if (!organization?.id || sessionId.startsWith("local_")) return;
    try {
      const res = await fetch(`${API_URL}/journal/sync?organization_id=${organization.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          session_id: sessionId,
          organization_id: organization.id,
          messages: msgs.map((m) => ({
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
          })),
        }),
      });
      if (!res.ok) throw new Error("Journal sync failed");
    } catch {
      if (mountedRef.current) {
        setError("This reflection is in your chat, but it didn't save to your journal log.");
      }
    }
  };

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || !activeSession || isAsking) return;

    stopSpeaking();
    stopListening();
    setInput("");
    setError(null);
    const userMessage: SessionMessage = {
      role: "user",
      content: text,
      timestamp: new Date().getTime(),
    };
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
          session_id: activeSession.id,
          session_context: activeSession.context,
          context: {
            organization_id: organization?.id,
            role: role || "owner",
          },
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
      if (mountedRef.current) speak(reply);
    } catch {
      setError("I couldn't reach your journal just now. Please try again.");
    } finally {
      setIsAsking(false);
    }
  };

  const toggleListening = () => {
    if (listening) {
      stopListening();
      return;
    }
    const speechWindow = window as SpeechWindow;
    if (!(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition)) {
      setError("Voice input isn't available in this browser. Type below.");
      return;
    }
    if (isAsking || !activeSession) return;
    stopSpeaking();
    setError(null);
    startListening((text) => {
      void send(text);
    });
  };

  const openEntry = (sessionId: string) => {
    stopListening();
    stopSpeaking();
    setError(null);
    setActiveSession(sessionId);
  };

  const toggleSpeech = () => {
    if (!("speechSynthesis" in window)) {
      setError("Voice replies aren't available in this browser.");
      return;
    }
    if (voiceOn) stopSpeaking();
    setVoiceOn((on) => !on);
  };

  const handleNewEntry = async () => {
    if (!organization?.id || isAsking) return;
    stopListening();
    stopSpeaking();
    setInput("");
    setError(null);
    await createSession(organization.id, journalTitle(), "journal");
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="claude-loader" />
      </div>
    );
  }

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const status = listening
    ? "Listening…"
    : isAsking
      ? "Reflecting…"
      : speaking
        ? "Speaking… tap the orb to reply"
        : "Tap the orb to speak, or type below";

  return (
    <DashboardLayout>
      <div className="mx-auto flex h-[calc(100vh-7rem)] max-w-4xl flex-col md:h-[calc(100vh-8rem)]">
        <header className="flex flex-wrap items-center justify-between gap-3 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Journal</h1>
              <p className="text-xs text-text-muted">{today}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="iconSm"
              onClick={toggleSpeech}
              aria-label={voiceOn ? "Mute voice replies" : "Unmute voice replies"}
              title={voiceOn ? "Mute voice replies" : "Unmute voice replies"}
            >
              {voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={handleNewEntry} disabled={isAsking || listening || !organization?.id}>
              <Plus className="h-4 w-4" />
              New entry
            </Button>
          </div>
        </header>

        {journalSessions.length > 1 && (
          <div className="mb-2 flex flex-shrink-0 gap-2 overflow-x-auto pb-1">
            {journalSessions.map((session) => (
              <button
                key={session.id}
                onClick={() => openEntry(session.id)}
                className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs transition-colors cursor-pointer ${
                  session.id === activeSession?.id
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-text-muted hover:border-primary/30 hover:text-foreground"
                }`}
              >
                {session.title.replace("Journal · ", "")}
              </button>
            ))}
          </div>
        )}

        <section className="flex flex-shrink-0 flex-col items-center justify-center py-2">
          <div className="relative flex h-40 w-40 items-center justify-center md:h-44 md:w-44">
            <span aria-hidden className="absolute -inset-6 rounded-full bg-primary/20 blur-3xl animate-pulse-glow" />
            {listening && (
              <span
                aria-hidden
                className="absolute inset-0 rounded-full border border-primary/50 animate-[ping_2s_ease-out_infinite]"
              />
            )}
            <button
              type="button"
              onClick={toggleListening}
              disabled={!activeSession || isAsking}
              aria-label={listening ? "Stop listening" : "Start voice journal"}
              className="group relative flex h-full w-full items-center justify-center rounded-full outline-none transition-transform focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
            >
              <span
                aria-hidden
                className="absolute inset-0 rounded-full opacity-90 animate-[spin_14s_linear_infinite]"
                style={{
                  background:
                    "conic-gradient(from 0deg, var(--primary), #8b5cf6, var(--accent), var(--primary))",
                }}
              />
              <span className="absolute inset-[7px] rounded-full bg-background/85 backdrop-blur-xl" />
              <span className="relative z-10 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary to-purple-500 text-white shadow-lg shadow-primary/30 transition-transform group-hover:scale-105">
                {isAsking ? (
                  <Loader2 className="h-8 w-8 animate-spin" />
                ) : listening ? (
                  <MicOff className="h-8 w-8" />
                ) : speaking ? (
                  <Volume2 className="h-8 w-8" />
                ) : (
                  <Mic className="h-8 w-8" />
                )}
              </span>
            </button>
          </div>
          <p role="status" aria-live="polite" className="mt-3 text-center text-sm text-text-muted">
            {status}
          </p>
          {listening && interimText && (
            <p className="mt-1 max-w-md text-center text-xs italic text-text-muted">{interimText}</p>
          )}
        </section>

        <section
          aria-live="polite"
          className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-1 py-3"
        >
          {error && (
            <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {error}
            </p>
          )}

          {messages.length === 0 && !isAsking && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="text-sm text-text-muted">{"What's on your mind today?"}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => void send(prompt)}
                    disabled={!activeSession || listening}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-text-muted transition-colors hover:border-primary/30 hover:text-foreground disabled:opacity-50 cursor-pointer"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={`${message.timestamp}-${index}`}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  message.role === "user"
                    ? "bg-primary text-white"
                    : "border border-border bg-surface text-foreground"
                }`}
              >
                {message.content}
              </div>
            </div>
          ))}

          {isAsking && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-xs text-text-muted">Reflecting…</span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </section>

        <footer className="flex-shrink-0 pt-3">
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
              placeholder="Write or speak what's on your mind…"
              disabled={isAsking || listening || !activeSession}
              className="max-h-32 min-h-[46px] flex-1 resize-none rounded-xl border border-border bg-surface px-4 py-3 text-sm focus:border-primary focus:outline-none disabled:opacity-50"
            />
            <Button
              variant="primary"
              onClick={() => void send()}
              disabled={!input.trim() || isAsking || listening || !activeSession}
              aria-label="Send journal entry"
            >
              {isAsking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="mt-2 text-center text-[11px] text-text-muted">
            Enter to send · Shift+Enter for a new line · Tap the orb to talk
          </p>
        </footer>
      </div>
    </DashboardLayout>
  );
}
