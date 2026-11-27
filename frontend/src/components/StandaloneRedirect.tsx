"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

const QUERY = "(display-mode: standalone)";

/** True only inside the installed YesBoss app (not in a normal browser tab). False while rendering on the server. */
function useInstalledApp(): boolean {
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

/** The installed app is for working, not for the marketing website: if it ever lands on the public home page it goes
 *  straight on to the app (a signed-out person is sent to the login page from there). A covering screen hides the
 *  marketing page for the instant before the redirect. */
export function StandaloneRedirect() {
  const installed = useInstalledApp();
  const router = useRouter();
  useEffect(() => {
    if (installed) router.replace("/dashboard");
  }, [installed, router]);
  if (!installed) return null;
  return <div className="fixed inset-0 z-[100] bg-background" aria-hidden="true" />;
}
