"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui";

interface CollapsibleSectionProps {
  title: string;
  icon?: React.ElementType;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "success" | "warning" | "danger" | "info" | "outline";
  defaultExpanded?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export default function CollapsibleSection({
  title,
  icon: Icon,
  badge,
  badgeVariant = "default",
  defaultExpanded = false,
  actions,
  children,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="rounded-3xl overflow-hidden border-[2.5px] border-outline bg-surface shadow-[4px_4px_0_var(--shadow-hard)]">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-3 flex-1 cursor-pointer text-left bg-transparent border-0 p-0"
        >
          {expanded ? (
            <ChevronDown className="w-5 h-5 text-text-muted flex-shrink-0" />
          ) : (
            <ChevronRight className="w-5 h-5 text-text-muted flex-shrink-0" />
          )}
          {Icon && <Icon className="w-5 h-5 text-primary flex-shrink-0" />}
          <span className="text-base font-semibold flex-1 truncate">{title}</span>
        </button>
        {badge && (
          <Badge variant={badgeVariant} className="text-xs flex-shrink-0">
            {badge}
          </Badge>
        )}
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>
      {expanded && <div className="border-t-2 border-outline">{children}</div>}
    </div>
  );
}
