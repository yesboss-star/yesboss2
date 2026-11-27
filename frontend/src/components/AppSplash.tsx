"use client";

import { useEffect } from "react";

/** The opening animation of the installed app: the logo pops in on a white screen (the same white and icon Android shows
 *  while the app starts, so the two run into each other) and then the screen fades away into YesBoss.
 *
 *  It plays once each time the app is opened, never on the website in a browser tab (CSS in globals.css only shows it in
 *  the installed app), and never again while the app stays open. The "no-splash" switch is set by a tiny script in
 *  layout.tsx before anything is painted, so a refresh does not replay it. */
export function AppSplash() {
  useEffect(() => {
    try {
      sessionStorage.setItem("yb_splash_done", "1");
    } catch {
      /* private mode: it may play again, which is harmless */
    }
  }, []);

  return (
    <div className="app-splash" aria-hidden="true">
      <div className="app-splash-inner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={112} height={112} className="app-splash-logo" />
        <span className="app-splash-name">
          Yes<span>Boss</span>
        </span>
      </div>
    </div>
  );
}
