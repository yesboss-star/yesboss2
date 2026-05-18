import { forwardRef, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <div className="w-full">
        <textarea
          className={cn(
            "w-full min-h-[100px] px-4 py-3 rounded-xl bg-surface border border-border text-sm text-foreground placeholder:text-text-muted transition-colors resize-none",
            "focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20",
            "disabled:pointer-events-none disabled:opacity-50",
            error && "border-rose-500 focus:border-rose-500 focus:ring-rose-500/20",
            className
          )}
          ref={ref}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-xs text-rose-400">{error}</p>
        )}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
