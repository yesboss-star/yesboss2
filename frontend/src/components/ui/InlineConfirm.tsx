"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A two-step confirmation that stays on the page. It replaces the browser's confirm() box, which is easy to dismiss by
 *  accident, looks different on every device, and does not appear at all in some embedded browsers.
 *  `trigger` draws the normal button and gets a function that arms the confirmation.
 *  `warning` says what will happen, and shows next to the buttons once armed. */
export function InlineConfirm({
  trigger,
  onConfirm,
  label = "Delete?",
  keepLabel = "Keep",
  warning,
  className,
}: {
  trigger: (arm: () => void) => ReactNode;
  onConfirm: () => void;
  label?: string;
  keepLabel?: string;
  warning?: string;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed) return <>{trigger(() => setArmed(true))}</>;
  return (
    <span role="group" aria-label="Confirm" className={cn("inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold", className)}>
      {warning && <span className="max-w-xs font-medium text-text-muted">{warning}</span>}
      <button
        type="button"
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
        className="cursor-pointer rounded-full border-2 border-outline bg-[#FF9FA0] px-2.5 py-0.5 text-[#111]"
      >
        {label}
      </button>
      <button type="button" onClick={() => setArmed(false)} className="cursor-pointer text-text-muted">
        {keepLabel}
      </button>
    </span>
  );
}
