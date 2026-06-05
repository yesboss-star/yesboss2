"use client";

import { useUIStore } from "@/stores/uiStore";
import { usePathname } from "next/navigation";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const pathname = usePathname();

  if (pathname?.startsWith("/dashboard")) return null;

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="fixed top-4 right-4 z-50 p-2.5 rounded-xl bg-surface/80 backdrop-blur-sm border border-border text-text-muted hover:text-foreground hover:border-primary/30 shadow-lg transition-all duration-300 cursor-pointer"
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
}
