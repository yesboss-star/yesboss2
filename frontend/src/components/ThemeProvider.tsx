"use client";

import { useEffect } from "react";
import { useUIStore } from "@/stores/uiStore";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useUIStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: light)");
      const update = () => root.setAttribute("data-theme", mq.matches ? "light" : "dark");
      update();
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }
    root.setAttribute("data-theme", theme);
  }, [theme]);

  return <>{children}</>;
}
