import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { forwardRef, HTMLAttributes } from "react";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border-2 border-outline px-2.5 py-0.5 text-xs font-bold transition-colors",
  {
    variants: {
      variant: {
        default: "bg-highlight text-on-highlight",
        secondary: "bg-surface-light text-foreground",
        success: "bg-[#B6F36B] text-[#111111]",
        warning: "bg-[#FFB36B] text-[#111111]",
        danger: "bg-[#FF7A6B] text-[#111111]",
        info: "bg-[#7CC8FF] text-[#111111]",
        outline: "bg-transparent text-foreground",
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
