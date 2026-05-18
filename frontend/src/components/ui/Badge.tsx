import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { forwardRef, HTMLAttributes } from "react";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary/10 text-primary",
        secondary: "bg-surface-light text-text-muted",
        success: "bg-emerald-500/10 text-emerald-400",
        warning: "bg-amber-500/10 text-amber-400",
        danger: "bg-rose-500/10 text-rose-400",
        info: "bg-cyan-500/10 text-cyan-400",
        outline: "border border-border text-text-muted",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(badgeVariants({ variant }), className)}
        {...props}
      />
    );
  }
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
