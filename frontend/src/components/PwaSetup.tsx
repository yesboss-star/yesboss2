"use client";

import { useEffect } from "react";
import "@/hooks/useInstallPrompt"; // start listening for the install event as early as possible

/** Registers the service worker as soon as the app opens. Chrome only offers "Install app" for a page whose service
 *  worker is registered; push alerts use the same worker (see lib/pushNotifications.ts). It caches nothing. */
export function PwaSetup() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* installing is a nice extra; the app works without it */
    });
  }, []);
  return null;
}
