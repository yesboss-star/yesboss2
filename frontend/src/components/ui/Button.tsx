import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { forwardRef } from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border-2 text-sm font-bold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "border-outline bg-accent text-white hover:bg-accent-hover shadow-[4px_4px_0_var(--shadow-hard)] hover:-translate-x-px hover:-translate-y-px hover:shadow-[5px_5px_0_var(--shadow-hard)]",
        primary: "border-outline bg-primary text-white hover:bg-primary-light shadow-[4px_4px_0_var(--shadow-hard)] hover:-translate-x-px hover:-translate-y-px hover:shadow-[5px_5px_0_var(--shadow-hard)]",
        secondary: "border-outline bg-surface text-foreground hover:bg-surface-light shadow-[4px_4px_0_var(--shadow-hard)] hover:-translate-x-px hover:-translate-y-px hover:shadow-[5px_5px_0_var(--shadow-hard)]",
        ghost: "border-transparent text-text-muted hover:text-foreground hover:bg-surface-light",
        outline: "border-outline bg-surface text-foreground hover:bg-surface-light shadow-[4px_4px_0_var(--shadow-hard)] hover:-translate-x-px hover:-translate-y-px hover:shadow-[5px_5px_0_var(--shadow-hard)]",
        danger: "border-outline bg-rose-500 text-white hover:bg-rose-600 shadow-[4px_4px_0_var(--shadow-hard)] hover:-translate-x-px hover:-translate-y-px hover:shadow-[5px_5px_0_var(--shadow-hard)]",
        link: "border-transparent text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 py-2.5",
        sm: "h-8 px-3 text-xs",
        lg: "h-14 px-8 text-base",
        icon: "h-10 w-10",
        iconSm: "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : null}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
