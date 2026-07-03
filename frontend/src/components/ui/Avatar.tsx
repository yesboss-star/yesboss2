"use client";

import { forwardRef, HTMLAttributes, useState } from "react";
import { cn } from "@/lib/utils";

const DICEBEAR_BASE = "https://api.dicebear.com/9.x";
const DICEBEAR_STYLES = ["lorelei", "avataaars", "bottts", "micah", "adventurer", "big-smile", "fun-emoji", "thumbs"];

interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  src?: string;
  seed?: string;
  dicebearStyle?: string;
  fallback?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeClasses = {
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-12 h-12 text-base",
  xl: "w-24 h-24 text-3xl",
};

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "?";
};

const AVATAR_GRADIENTS = [
  "from-primary to-purple-500",
  "from-emerald-400 to-cyan-500",
  "from-orange-400 to-rose-500",
  "from-blue-400 to-indigo-500",
  "from-pink-400 to-purple-500",
  "from-amber-400 to-orange-500",
  "from-teal-400 to-green-500",
  "from-violet-400 to-fuchsia-500",
];

const getGradient = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
};

const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, src, seed, dicebearStyle = "lorelei", fallback, size = "md", ...props }, ref) => {
    const [imgError, setImgError] = useState(false);
    const hasCustomImage = src && !imgError;

    if (hasCustomImage) {
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
            onError={() => setImgError(true)}
          />
        </div>
      );
    }

    if (seed) {
      const dicebearUrl = `${DICEBEAR_BASE}/${dicebearStyle}/svg?seed=${encodeURIComponent(seed)}`;
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
            src={dicebearUrl}
            alt={fallback || "Avatar"}
            onError={() => setImgError(true)}
          />
        </div>
      );
    }

    const initials = getInitials(fallback || "");
    const gradient = getGradient(fallback || "default");

    return (
      <div
        ref={ref}
        className={cn(
          "relative flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-white font-bold",
          gradient,
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {initials}
      </div>
    );
  }
);
Avatar.displayName = "Avatar";

const AvatarFallback = forwardRef<HTMLDivElement, { className?: string; children: React.ReactNode }>(
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

export { Avatar, AvatarFallback, DICEBEAR_STYLES, DICEBEAR_BASE };
