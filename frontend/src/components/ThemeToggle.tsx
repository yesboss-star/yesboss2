"use client";

import { useUIStore } from "@/stores/uiStore";
import { usePathname } from "next/navigation";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const pathname = usePathname();

  // The dashboard has its own toggle in the header, and the landing page puts one inside its navbar
  // (a floating one would sit under that fixed navbar and could not be clicked).
  if (pathname === "/" || pathname?.startsWith("/dashboard")) return null;

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="fixed top-4 right-4 z-50 p-2.5 rounded-full bg-surface border-2 border-outline text-foreground shadow-[3px_3px_0_var(--shadow-hard)] hover:-translate-x-px hover:-translate-y-px transition-all duration-300 cursor-pointer"
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
}
