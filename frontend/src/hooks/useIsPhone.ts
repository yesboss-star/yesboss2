"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(max-width: 1023px)";

/** True on a phone or small tablet (the same width where the sidebar becomes a drawer). False while rendering on the server. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(QUERY);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => window.matchMedia(QUERY).matches,
    () => false
  );
}
