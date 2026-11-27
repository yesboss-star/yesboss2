"use client";

import { useEffect, useState } from "react";

// Chrome fires "beforeinstallprompt" once, early, when YesBoss can be installed. We keep the event at module level so a
// button that mounts later (the avatar menu) can still use it.
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let saved: InstallEvent | null = null;
const listeners = new Set<() => void>();
let wired = false;

function wire() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    saved = e as InstallEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    saved = null;
    listeners.forEach((l) => l());
  });
}

wire();

/** `canInstall` is true only while the browser says YesBoss can be installed and it is not installed yet. */
export function useInstallPrompt() {
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    wire();
    const update = () => setCanInstall(!!saved);
    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);

  const install = async () => {
    if (!saved) return;
    const event = saved;
    await event.prompt();
    await event.userChoice.catch(() => null);
    saved = null; // the browser only lets an event be used once
    listeners.forEach((l) => l());
  };

  return { canInstall, install };
}
