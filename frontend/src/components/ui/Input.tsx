import { forwardRef, InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  icon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, icon, rightIcon, type = "text", ...props }, ref) => {
    return (
      <div className="w-full">
        <div className="relative">
          {icon && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
              {icon}
            </div>
          )}
          <input
            type={type}
            className={cn(
              "w-full h-10 px-4 rounded-xl bg-surface border border-border text-sm text-foreground placeholder:text-text-muted transition-colors",
              "focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20",
              "disabled:pointer-events-none disabled:opacity-50",
              error && "border-rose-500 focus:border-rose-500 focus:ring-rose-500/20",
              icon && "pl-12",
              rightIcon && "pr-12",
              className
            )}
            ref={ref}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
              {rightIcon}
            </div>
          )}
        </div>
        {error && (
          <p className="mt-1.5 text-xs text-rose-400">{error}</p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
