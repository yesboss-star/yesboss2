"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ClipboardList, Loader2 } from "lucide-react";
import MeetingNotesCard from "@/components/capture/MeetingNotesCard";
import { useCaptureStore } from "@/stores/captureStore";
import { useOrganizationStore } from "@/stores/organizationStore";
import { cn } from "@/lib/utils";

const SHOWN = 8;

/** Your own meeting notes as a list in the chat. Open one to see what it found and to assign its action items.
 *  Notes are private to the person who saved them, so this only ever lists the signed-in person's own. */
export default function MeetingsListCard({ nameFor }: { nameFor: (email: string) => string }) {
  const orgId = useOrganizationStore((s) => s.organization?.id);
  const { captures, loading, fetchCaptures } = useCaptureStore();
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (orgId) void fetchCaptures(orgId, { kind: "mom" }, { silent: true });
  }, [orgId, fetchCaptures]);

  const notes = captures.filter((c) => c.kind === "mom").slice(0, SHOWN);

  if (loading && !notes.length) {
    return (
      <p className="flex items-center gap-2 text-xs text-text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading your meeting notes…
      </p>
    );
  }
  if (!notes.length) {
    return <p className="text-sm text-text-muted">No meeting notes yet. Choose MOM or Upload meeting and I will read them for you.</p>;
  }

  return (
    <ul className="space-y-2" aria-label="Your meeting notes">
      {notes.map((c) => {
        const pending = (c.suggestions || []).filter((s) => s.status === "pending").length;
        const open = openId === c.id;
        return (
          <li key={c.id} className="overflow-hidden rounded-2xl border-2 border-outline bg-surface">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : c.id)}
              className="flex w-full cursor-pointer items-center gap-3 px-3.5 py-2.5 text-left hover:bg-surface-light"
            >
              <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full border-2 border-outline bg-[#7CC8FF] text-[#111]">
                <ClipboardList className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{c.title || "Meeting notes"}</span>
                <span className="block text-xs text-text-muted">
                  {c.created_at ? new Date(c.created_at).toLocaleDateString() : "no date"}
                  {pending ? ` · ${pending} action item${pending > 1 ? "s" : ""} to review` : ""}
                </span>
              </span>
              <ChevronDown className={cn("h-4 w-4 flex-shrink-0 text-text-muted transition-transform", open && "rotate-180")} />
            </button>
            {open && (
              <div className="border-t-2 border-outline p-3">
                <MeetingNotesCard captureId={c.id} nameFor={nameFor} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
