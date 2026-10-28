"use client";

import { useState } from "react";
import { Bell, Check, Trash2 } from "lucide-react";
import { journalApi, type Reminder } from "@/lib/journalApi";
import { Chip, Empty, ErrorNote, Panel, PrimaryButton, Spinner, formatDate, inputClass, useLoader } from "./shared";

type TriggerType = "date" | "after_days" | "after_meeting" | "project_active";

const TRIGGER_LABEL: Record<TriggerType, string> = {
  date: "On a date",
  after_days: "After some days",
  after_meeting: "After a meeting",
  project_active: "When a goal becomes active",
};

function describe(reminder: Reminder) {
  const { trigger } = reminder;
  if (trigger.type === "date" && trigger.due_at) return `On ${formatDate(trigger.due_at)}`;
  if (trigger.type === "after_meeting") return `After the meeting “${trigger.match}”`;
  if (trigger.type === "project_active") return `When “${trigger.goal_title}” becomes active`;
  return "";
}

export default function RemindersView({ orgId, onOpen }: { orgId: string; onOpen: (entryId: string) => void }) {
  const list = useLoader<{ reminders: Reminder[] }>(() => journalApi("/reminders", orgId), `reminders-${orgId}`);
  const [text, setText] = useState("");
  const [type, setType] = useState<TriggerType>("date");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const placeholder =
    type === "after_days" ? "Number of days, e.g. 30" : type === "after_meeting" ? "Part of the meeting title, e.g. Acme" : "Goal title, e.g. Launch pricing";

  const add = async () => {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { text, type };
      if (type === "date") body.due_at = value;
      if (type === "after_days") body.days = Number(value);
      if (type === "after_meeting") body.match = value;
      if (type === "project_active") body.goal_title = value;
      await journalApi("/reminders", orgId, { method: "POST", body });
      setText("");
      setValue("");
      list.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const act = async (reminder: Reminder, action: "done" | "delete") => {
    try {
      if (action === "done") await journalApi(`/reminders/${reminder._id}/done`, orgId, { method: "POST" });
      else await journalApi(`/reminders/${reminder._id}`, orgId, { method: "DELETE" });
      list.reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const active = list.data?.reminders.filter((r) => r.status === "active") ?? [];
  const history = list.data?.reminders.filter((r) => r.status !== "active") ?? [];

  return (
    <div className="space-y-4">
      <Panel title="Reminders" hint="Come back to an unresolved thought at the right moment. Decisions and experiments add their own reminders.">
        <div className="space-y-2.5">
          <input value={text} onChange={(event) => setText(event.target.value)} placeholder="What should I remind you about?" maxLength={240} className={inputClass} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={type}
              onChange={(event) => {
                setType(event.target.value as TriggerType);
                setValue("");
              }}
              className={`${inputClass} sm:w-60`}
            >
              {(Object.keys(TRIGGER_LABEL) as TriggerType[]).map((key) => (
                <option key={key} value={key}>
                  {TRIGGER_LABEL[key]}
                </option>
              ))}
            </select>
            {type === "date" ? (
              <input type="date" value={value} onChange={(event) => setValue(event.target.value)} className={inputClass} />
            ) : (
              <input
                value={value}
                onChange={(event) => setValue(event.target.value)}
                inputMode={type === "after_days" ? "numeric" : undefined}
                placeholder={placeholder}
                className={inputClass}
              />
            )}
          </div>
          <ErrorNote message={error ?? list.error} />
          <PrimaryButton onClick={() => void add()} disabled={saving || !text.trim() || !value.trim()}>
            <Bell className="h-4 w-4" />
            {saving ? "Saving…" : "Add reminder"}
          </PrimaryButton>
        </div>
      </Panel>

      {list.loading ? (
        <Spinner />
      ) : (
        <>
          <Panel title="Waiting">
            {active.length === 0 ? (
              <Empty>No active reminders.</Empty>
            ) : (
              <div className="space-y-2">
                {active.map((reminder) => (
                  <div key={reminder._id} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-background p-3">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground">{reminder.text}</p>
                      <p className="mt-0.5 text-[11px] text-text-muted">{describe(reminder)}</p>
                      {reminder.entry_id && (
                        <button onClick={() => onOpen(reminder.entry_id as string)} className="mt-1 cursor-pointer text-[11px] text-primary hover:underline">
                          Original entry ↗
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => void act(reminder, "done")} aria-label="Mark done" className="cursor-pointer text-text-muted hover:text-emerald-500">
                        <Check className="h-4 w-4" />
                      </button>
                      <button onClick={() => void act(reminder, "delete")} aria-label="Delete reminder" className="cursor-pointer text-text-muted hover:text-rose-400">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
          {history.length > 0 && (
            <Panel title="Earlier">
              <div className="space-y-2">
                {history.slice(0, 15).map((reminder) => (
                  <div key={reminder._id} className="flex items-center justify-between gap-3 text-sm text-text-muted">
                    <span className="truncate">{reminder.text}</span>
                    <Chip tone={reminder.status === "done" ? "good" : "default"}>{reminder.status}</Chip>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
