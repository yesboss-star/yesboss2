"use client";

import { ArrowRight } from "lucide-react";

interface Props {
  finished: number;
  total: number;
  /** Finished tasks that still wait for the owner's OK. */
  waiting: number;
  isOwner: boolean;
  /** Shows only the tasks that need the owner's OK. */
  onReview: () => void;
}

/** "5 of 10 finished" with a ring, and how many wait for approval. */
export default function TaskSummaryCard({ finished, total, waiting, isOwner, onReview }: Props) {
  const share = total > 0 ? finished / total : 0;
  const radius = 34;
  const circumference = 2 * Math.PI * radius;

  return (
    <section className="glass flex items-center gap-5 rounded-3xl p-5" aria-label="Task progress">
      <svg viewBox="0 0 80 80" className="h-20 w-20 flex-shrink-0 -rotate-90" role="img" aria-label={`${Math.round(share * 100)} percent finished`}>
        <circle cx="40" cy="40" r={radius} fill="none" strokeWidth="9" className="stroke-surface-light" />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          stroke="#B6F36B"
          strokeDasharray={`${circumference * share} ${circumference}`}
        />
      </svg>
      <div className="min-w-0">
        <p className="text-xl font-bold leading-tight">
          {finished} of {total} finished
        </p>
        <p className="mt-0.5 text-sm text-text-muted">
          {waiting > 0 ? `${waiting} ${isOwner ? "wait for your OK" : "waiting for approval"}` : "Nothing waiting for approval"}
        </p>
        {isOwner && waiting > 0 && (
          <button
            type="button"
            onClick={onReview}
            className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-full border-2 border-outline bg-[#C9A7FF] px-3.5 py-1 text-sm font-bold text-[#111] shadow-[3px_3px_0_var(--shadow-hard)] transition-all hover:-translate-x-px hover:-translate-y-px"
          >
            Review <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </section>
  );
}
