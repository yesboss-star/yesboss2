"use client";

import { useUIStore } from "@/stores/uiStore";
import { Sun, Moon } from "lucide-react";

export function ThemeToggleInline() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="p-2 rounded-full border-2 border-outline bg-surface text-foreground shadow-[3px_3px_0_var(--shadow-hard)] hover:-translate-x-px hover:-translate-y-px transition-all cursor-pointer"
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
}
