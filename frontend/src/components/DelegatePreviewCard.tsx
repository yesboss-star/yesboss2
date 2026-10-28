"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui";
import { delegateAssigneeLabel, type DelegateParams, type GeneratedSubTask } from "@/stores/sessionStore";

/** Confirmation card shown before a task/goal is created from an AI chat. */
export default function DelegatePreviewCard({
  params,
  subTasks,
  onConfirm,
  disabled,
}: {
  params: DelegateParams;
  subTasks: GeneratedSubTask[];
  onConfirm: (selected: GeneratedSubTask[]) => void;
  disabled?: boolean;
}) {
  const [selected, setSelected] = useState<boolean[]>(subTasks.map(() => true));

  const typeLabel =
    params.item_type === "goal" ? "Goal" : params.item_type === "both" ? "Task + Goal" : "Task";

  const toggle = (idx: number) => {
    setSelected((prev) => prev.map((v, i) => (i === idx ? !v : v)));
  };

  const checked = selected.filter((v) => v).length;

  return (
    <div className="rounded-2xl bg-surface border border-primary/20 p-4 space-y-3 min-w-[300px] max-w-[420px]">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold uppercase tracking-wider">
          <Sparkles className="w-3 h-3" />
          {typeLabel}
        </span>
        <span className="text-[10px] text-text-muted">Assign to {delegateAssigneeLabel(params)}</span>
      </div>

      <div>
        <p className="text-sm text-foreground font-semibold">{params.title}</p>
        {params.description && <p className="text-xs text-text-muted mt-1">{params.description}</p>}
      </div>

      {subTasks.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium text-text-muted uppercase tracking-wider">
            AI-suggested sub-steps ({checked}/{subTasks.length})
          </p>
          {subTasks.map((st, idx) => (
            <label
              key={idx}
              className="flex items-start gap-2 px-3 py-2 rounded-lg bg-surface-light border border-border cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected[idx]}
                onChange={() => toggle(idx)}
                disabled={disabled}
                className="mt-0.5"
              />
              <span className="flex-1 text-xs text-foreground">{st.title}</span>
            </label>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          onClick={() => onConfirm(subTasks.filter((_, i) => selected[i]))}
          disabled={disabled || (subTasks.length > 0 && checked === 0)}
          className="cursor-pointer"
          size="sm"
        >
          Assign selected
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onConfirm([])}
          disabled={disabled}
          className="cursor-pointer"
        >
          {subTasks.length > 0 ? "Assign without sub-steps" : "Assign"}
        </Button>
      </div>
    </div>
  );
}
