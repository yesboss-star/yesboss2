"use client";

import { useId } from "react";

/** The four-point "sparkle" star in the blue to purple to pink gradient. */
export default function GeminiSpark({ className = "h-5 w-5" }: { className?: string }) {
  const gradientId = useId();
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="3" y1="21" x2="21" y2="3" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4285f4" />
          <stop offset="0.55" stopColor="#9b72cb" />
          <stop offset="1" stopColor="#d96570" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gradientId})`}
        d="M12 1.5C12.6 7.6 16.4 11.4 22.5 12 16.4 12.6 12.6 16.4 12 22.5 11.4 16.4 7.6 12.6 1.5 12 7.6 11.4 11.4 7.6 12 1.5Z"
      />
    </svg>
  );
}
