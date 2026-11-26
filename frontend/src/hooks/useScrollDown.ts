"use client";

import { useEffect, useState } from "react";

/** True while the page is being scrolled down (so a bar can slide away or a button can shrink), false while scrolling up or near the top.
 *  It only reacts when the page is long enough to scroll, so a short page never flickers. */
export function useScrollDown(enabled: boolean): boolean {
  const [down, setDown] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let last = window.scrollY;
    let quietUntil = 0;
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - last;
      last = y;
      if (Date.now() < quietUntil) return;
      if (document.documentElement.scrollHeight - window.innerHeight < 240) {
        setDown(false);
        return;
      }
      if (delta > 6 && y > 90) {
        setDown(true);
        quietUntil = Date.now() + 300;
      } else if (delta < -6 || y < 30) {
        setDown(false);
        quietUntil = Date.now() + 300;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [enabled]);
  return enabled && down;
}
