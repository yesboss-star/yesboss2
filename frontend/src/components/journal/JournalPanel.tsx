"use client";

import { useEffect } from "react";
import { ChevronLeft, X } from "lucide-react";
import GeminiSpark from "./GeminiSpark";
import OverviewView from "./OverviewView";
import InsightsView from "./InsightsView";
import DecisionsView from "./DecisionsView";
import IdeasView from "./IdeasView";
import RecapsView from "./RecapsView";
import RemindersView from "./RemindersView";
import { SectionBoundary, type DetailTab } from "./shared";

export type PanelTab = "overview" | DetailTab;

/** Detail pages (used for ?view=... links and titles). */
export const PANEL_TABS: { id: DetailTab; label: string }[] = [
  { id: "insights", label: "Mood and patterns" },
  { id: "decisions", label: "Decisions" },
  { id: "ideas", label: "Idea vault" },
  { id: "recaps", label: "Recaps" },
  { id: "reminders", label: "Reminders" },
];

/**
 * Side panel with everything the journal has organised. It opens on one combined
 * overview page; each card drills into its full section and back.
 */
export default function JournalPanel({
  orgId,
  tab,
  onTab,
  onClose,
  onAsk,
  onOpenSession,
  onOpenEntry,
  decisionPrefill,
}: {
  orgId: string;
  tab: PanelTab;
  onTab: (tab: PanelTab) => void;
  onClose: () => void;
  onAsk: (question: string) => void;
  onOpenSession: (sessionId: string) => void;
  onOpenEntry: (entryId: string) => void;
  decisionPrefill?: string;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const detailTitle = PANEL_TABS.find((item) => item.id === tab)?.label;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-label="Journal insights">
      <button aria-label="Close panel" className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-[1px]" onClick={onClose} />
      <aside className="relative flex h-full w-full flex-col border-l-[2.5px] border-outline bg-background shadow-2xl md:w-[70vw] md:max-w-[1000px]">
        <header className="flex items-center justify-between gap-3 border-b-[2.5px] border-outline bg-surface px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            {tab === "overview" ? (
              <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full border-[2.5px] border-outline bg-highlight text-on-highlight">
                <GeminiSpark className="h-5 w-5" />
              </span>
            ) : (
              <button
                onClick={() => onTab("overview")}
                aria-label="Back to overview"
                className="grid h-10 w-10 flex-shrink-0 cursor-pointer place-items-center rounded-full border-[2.5px] border-outline bg-surface text-foreground shadow-[3px_3px_0_var(--shadow-hard)] transition-all hover:-translate-x-px hover:-translate-y-px"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <h2 className="truncate text-lg font-bold text-foreground">{tab === "overview" ? "Journal insights" : detailTitle}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-10 w-10 flex-shrink-0 cursor-pointer place-items-center rounded-full border-[2.5px] border-outline bg-surface text-foreground shadow-[3px_3px_0_var(--shadow-hard)] transition-all hover:-translate-x-px hover:-translate-y-px"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-5">
          <SectionBoundary resetKey={tab}>
            {tab === "overview" && <OverviewView orgId={orgId} onOpenDetail={onTab} />}
            {tab === "insights" && <InsightsView orgId={orgId} onAsk={onAsk} onOpen={onOpenSession} />}
            {tab === "decisions" && <DecisionsView key={decisionPrefill ?? "none"} orgId={orgId} prefill={decisionPrefill} />}
            {tab === "ideas" && <IdeasView orgId={orgId} onOpen={onOpenSession} />}
            {tab === "recaps" && <RecapsView orgId={orgId} onOpen={onOpenSession} />}
            {tab === "reminders" && <RemindersView orgId={orgId} onOpen={onOpenEntry} />}
          </SectionBoundary>
        </div>
      </aside>
    </div>
  );
}
