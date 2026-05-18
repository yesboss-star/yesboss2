"use client";

import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { forwardRef } from "react";

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  options: { value: string; label: string; disabled?: boolean }[];
  error?: string;
  className?: string;
  disabled?: boolean;
}

const SelectComponent = ({
  value,
  onValueChange,
  placeholder = "Select an option",
  options,
  error,
  className,
  disabled,
}: SelectProps) => {
  return (
    <div className="w-full">
      <Select.Root value={value} onValueChange={onValueChange} disabled={disabled}>
        <Select.Trigger
          className={cn(
            "w-full h-10 px-4 rounded-xl bg-surface border border-border text-sm text-foreground transition-colors",
            "flex items-center justify-between gap-2",
            "focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20",
            "disabled:pointer-events-none disabled:opacity-50",
            "data-[placeholder]:text-text-muted",
            error && "border-rose-500",
            className
          )}
        >
          <Select.Value placeholder={placeholder} />
          <Select.Icon>
            <ChevronDown className="w-4 h-4 text-text-muted" />
          </Select.Icon>
        </Select.Trigger>

        <Select.Portal>
          <Select.Content
            className="z-50 overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
            position="popper"
            sideOffset={8}
          >
            <Select.ScrollUpButton className="flex items-center justify-center h-8 py-1 text-text-muted cursor-default">
              <ChevronUp className="w-4 h-4" />
            </Select.ScrollUpButton>

            <Select.Viewport className="p-1">
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className={cn(
                    "relative flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm cursor-pointer select-none",
                    "data-[highlighted]:bg-primary/10 data-[highlighted]:text-foreground",
                    "data-[disabled]:opacity-50 data-[disabled]:pointer-events-none",
                    "outline-none"
                  )}
                >
                  <Select.ItemIndicator>
                    <Check className="w-4 h-4 text-primary" />
                  </Select.ItemIndicator>
                  <Select.ItemText>{option.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>

            <Select.ScrollDownButton className="flex items-center justify-center h-8 py-1 text-text-muted cursor-default">
              <ChevronDown className="w-4 h-4" />
            </Select.ScrollDownButton>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
      {error && (
        <p className="mt-1.5 text-xs text-rose-400">{error}</p>
      )}
    </div>
  );
};

export { SelectComponent as Select };
