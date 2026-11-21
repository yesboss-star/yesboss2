"use client";

import { useState } from "react";
import { Check, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui";
import { useOrgChartStore } from "@/stores/orgChartStore";
import { getAuthHeaders } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

const WHAT: Record<string, [string, string]> = {
  tasks: ["task", "tasks"],
  goals: ["goal", "goals"],
  meetings: ["meeting", "meetings"],
  notifications: ["notification", "notifications"],
  task_followups: ["follow-up", "follow-ups"],
  commitments: ["commitment", "commitments"],
  org_chart_members: ["person whose manager is this member", "people whose manager is this member"],
};

/** Correct a member's email on the org chart (owners only: the server refuses anyone else).
 *  Everything that used the old address (their tasks, goals, meetings, notifications) moves to the new one,
 *  so a wrong address on the chart never leaves someone's work on an address that is not theirs. */
export default function MemberEmailEditor({
  member,
  orgId,
  onChanged,
}: {
  member: { id: string; email: string };
  orgId?: string;
  onChanged: (email: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(member.email);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/org-chart/members/${member.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ email: value.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.detail === "string" ? data.detail : "Could not change the email.");
      const moved = Object.entries((data.email_changed?.moved || {}) as Record<string, number>)
        .filter(([, n]) => n > 0)
        .map(([key, n]) => `${n} ${(WHAT[key] || [key, key])[n === 1 ? 0 : 1]}`);
      setNotice(data.email_changed ? `Email changed.${moved.length ? ` Moved with it: ${moved.join(", ")}.` : ""}` : "That is already their email.");
      setEditing(false);
      await useOrgChartStore.getState().fetchOrgTree(orgId);
      onChanged(String(data.member?.email || value.trim().toLowerCase()));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={() => {
            setValue(member.email);
            setNotice(null);
            setEditing(true);
          }}
          className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          <Pencil className="h-3 w-3" /> Correct this email
        </button>
        {notice && (
          <p className="flex items-start gap-1.5 text-xs font-medium" role="status">
            <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> {notice}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-surface p-3">
      <label className="block text-[10px] text-text-muted" htmlFor="member-email">
        New email. Their tasks, goals, meetings and notifications move to it.
      </label>
      <input
        id="member-email"
        type="email"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
      />
      {error && <p className="text-xs text-rose-400" role="alert">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void save()} disabled={saving || !value.trim() || value.trim().toLowerCase() === member.email.toLowerCase()} className="cursor-pointer">
          {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Save email
        </Button>
        <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={saving} className="cursor-pointer">
          Cancel
        </Button>
      </div>
    </div>
  );
}
