import { forwardRef, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  src?: string;
  fallback?: string;
  size?: "sm" | "md" | "lg";
}

interface AvatarFallbackProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

const sizeClasses = {
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-12 h-12 text-base",
};

const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, src, fallback, size = "md", ...props }, ref) => {
    if (src) {
      return (
        <div
          ref={ref}
          className={cn(
            "relative flex shrink-0 overflow-hidden rounded-full",
            sizeClasses[size],
            className
          )}
          {...props}
        >
          <img
            className="aspect-square h-full w-full object-cover"
            src={src}
            alt={fallback || "Avatar"}
          />
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className={cn(
          "relative flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-purple-500 text-white font-semibold",
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {fallback ? fallback.charAt(0).toUpperCase() : "?"}
      </div>
    );
  }
);
Avatar.displayName = "Avatar";

const AvatarFallback = forwardRef<HTMLDivElement, AvatarFallbackProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-primary to-purple-500 text-white font-semibold",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
AvatarFallback.displayName = "AvatarFallback";

export { Avatar, AvatarFallback };