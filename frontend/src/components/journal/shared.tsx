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
    <section className="glass rounded-3xl p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-foreground">{title}</h2>
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
    default: "bg-surface text-foreground",
    primary: "bg-[#C9A7FF] text-[#111]",
    warn: "bg-[#FFD93D] text-[#111]",
    good: "bg-[#B6F36B] text-[#111]",
  };
  return <span className={`inline-flex items-center rounded-full border-2 border-outline px-2.5 py-0.5 text-[11px] font-bold ${tones[tone]}`}>{children}</span>;
}

/** One row inside a panel: an idea, a decision, a recap, a pattern. */
export const itemCard = "rounded-2xl border-2 border-outline bg-background p-3.5";

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border-2 border-dashed border-outline px-4 py-6 text-center text-sm text-text-muted">{children}</p>;
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="rounded-2xl border-2 border-outline bg-[#FF9FA0] px-3 py-2 text-xs font-semibold text-[#111]">{message}</p>;
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
      className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full border-[2.5px] border-outline bg-highlight px-4 py-2 text-sm font-bold text-on-highlight shadow-[3px_3px_0_var(--shadow-hard)] transition-all hover:-translate-x-px hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none ${props.className ?? ""}`}
    />
  );
}

export function GhostButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full border-2 border-outline bg-surface px-3 py-1.5 text-xs font-bold text-foreground transition-all hover:-translate-x-px hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${props.className ?? ""}`}
    />
  );
}

export const inputClass =
  "w-full rounded-2xl border-2 border-outline bg-surface px-3.5 py-2 text-sm text-foreground placeholder:text-text-muted focus:shadow-[3px_3px_0_var(--shadow-hard)] focus:outline-none";

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
            className="cursor-pointer rounded-full border-2 border-outline bg-surface px-2.5 py-0.5 text-[11px] font-bold text-foreground transition-colors hover:bg-highlight hover:text-on-highlight"
          >
            {formatDate(source.date)} ↗
          </button>
        ) : (
          <span key={source.entry_id} title={source.snippet} className="rounded-full border-2 border-outline px-2.5 py-0.5 text-[11px] font-bold text-text-muted">
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
            className={`h-8 w-8 cursor-pointer rounded-full border-2 border-outline text-xs font-bold transition-colors ${
              value === n ? "bg-highlight text-on-highlight" : "bg-surface text-foreground hover:bg-surface-light"
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
      <div className="rounded-2xl border-2 border-outline bg-[#FF9FA0] p-4 text-sm font-semibold text-[#111]">
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

const FACE_COLOURS = ["#FF7A6B", "#FFB36B", "#FFD93D", "#B6F36B", "#7CC8FF"];

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
          style={{ background: FACE_COLOURS[mood - 1] }}
          className={`flex flex-1 cursor-pointer items-center justify-center rounded-2xl border-2 border-outline transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
            size === "lg" ? "h-14 text-3xl" : "h-11 text-2xl"
          } ${value === mood ? "-translate-y-0.5 scale-105 shadow-[3px_3px_0_var(--shadow-hard)]" : "opacity-80 hover:scale-105 hover:opacity-100"}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

export type DetailTab = "insights" | "decisions" | "ideas" | "recaps" | "reminders";
