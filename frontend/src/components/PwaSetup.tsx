"use client";

import { useEffect } from "react";
import "@/hooks/useInstallPrompt"; // start listening for the install event as early as possible

/** Registers the service worker as soon as the app opens (and stops pinch-zoom inside the installed app). Chrome only offers "Install app" for a page whose service
 *  worker is registered; push alerts use the same worker (see lib/pushNotifications.ts). It caches nothing. */
export function PwaSetup() {
  useEffect(() => {
    // Inside the installed app the screen must not zoom when someone pinches. A normal browser tab keeps pinch-zoom,
    // which people with weaker eyesight rely on.
    if (window.matchMedia("(display-mode: standalone)").matches) {
      const meta = document.querySelector('meta[name="viewport"]');
      meta?.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no");
    }

    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* installing is a nice extra; the app works without it */
    });
  }, []);
  return null;
}
