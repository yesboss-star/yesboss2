"use client";

import { Component, useCallback, useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import type { SourceRef } from "@/lib/journalApi";

/** Load data once per `key` (and again when `reload()` is called). */
export function useLoader<T>(load: () => Promise<T>, key: string) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null }>({
    data: null,
    loading: true,
    error: null,
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((err: Error) => {
        if (!cancelled) setState((prev) => ({ ...prev, loading: false, error: err.message }));
      });
    return () => {
      cancelled = true;
    };
    // `load` is recreated every render; `key`/`tick` decide when to refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { ...state, reload };
}

export function Panel({ title, hint, action, children }: { title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-text-muted">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Chip({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "primary" | "warn" | "good" }) {
  const tones = {
    default: "bg-background text-text-muted border-border",
    primary: "bg-primary/10 text-primary border-primary/20",
    warn: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    good: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted">{children}</p>;
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{message}</p>;
}

export function Spinner() {
  return (
    <div className="flex justify-center py-8">
      <Loader2 className="h-5 w-5 animate-spin text-primary" />
    </div>
  );
}

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50 ${props.className ?? ""}`}
    />
  );
}

export function GhostButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-text-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 ${props.className ?? ""}`}
    />
  );
}

export const inputClass =
  "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-text-muted focus:border-primary focus:outline-none";

export function formatDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Links back to the original journal entries so the owner can verify context. */
export function SourceLinks({ sources, onOpen }: { sources: SourceRef[]; onOpen: (sessionId: string) => void }) {
  if (!sources.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {sources.slice(0, 6).map((source) =>
        source.session_id ? (
          <button
            key={source.entry_id}
            onClick={() => onOpen(source.session_id as string)}
            title={source.snippet}
            className="cursor-pointer rounded-full border border-border px-2.5 py-0.5 text-[11px] text-text-muted transition-colors hover:border-primary/40 hover:text-primary"
          >
            {formatDate(source.date)} ↗
          </button>
        ) : (
          <span key={source.entry_id} title={source.snippet} className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-text-muted">
            {formatDate(source.date)}
          </span>
        )
      )}
    </div>
  );
}

export function Rating({ label, value, onChange }: { label: string; value: number | null; onChange: (next: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="w-24 text-xs text-text-muted">{label}</span>
      <div className="flex gap-1.5" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            role="radio"
            aria-checked={value === n}
            onClick={() => onChange(n)}
            className={`h-8 w-8 cursor-pointer rounded-full border text-xs transition-colors ${
              value === n ? "border-primary bg-primary text-white" : "border-border text-text-muted hover:border-primary/40"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Keeps one broken record from blanking the whole journal; the user can retry. */
export class SectionBoundary extends Component<{ children: ReactNode; resetKey: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300">
        <p>Something went wrong while showing this section.</p>
        <button onClick={() => this.setState({ failed: false })} className="mt-2 cursor-pointer text-xs underline">
          Try again
        </button>
      </div>
    );
  }
}

export const MOOD_FACES = [
  { value: 1, emoji: "😞", label: "Very low" },
  { value: 2, emoji: "🙁", label: "Low" },
  { value: 3, emoji: "😐", label: "Okay" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 5, emoji: "😄", label: "Great" },
] as const;

export const moodEmoji = (value: number | null | undefined) =>
  value === null || value === undefined ? "·" : MOOD_FACES[Math.min(4, Math.max(0, Math.round(value) - 1))].emoji;

/** One-tap mood: five faces from sad to happy. */
export function MoodFaces({
  value,
  onPick,
  size = "lg",
  disabled,
}: {
  value: number | null;
  onPick: (mood: number) => void;
  size?: "md" | "lg";
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-1.5" role="radiogroup" aria-label="Mood">
      {MOOD_FACES.map(({ value: mood, emoji, label }) => (
        <button
          key={mood}
          role="radio"
          aria-checked={value === mood}
          aria-label={label}
          title={label}
          disabled={disabled}
          onClick={() => onPick(mood)}
          className={`flex flex-1 cursor-pointer items-center justify-center rounded-2xl border transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
            size === "lg" ? "h-14 text-3xl" : "h-11 text-2xl"
          } ${value === mood ? "scale-105 border-primary bg-primary/15" : "border-transparent bg-background hover:scale-105 hover:border-border"}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

export type DetailTab = "insights" | "decisions" | "ideas" | "recaps" | "reminders";
