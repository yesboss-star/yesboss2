/**
 * Only same-origin, path-style redirect targets are allowed after login/onboarding.
 *
 * `startsWith("/") && !startsWith("//")` is not enough: browsers normalise a backslash
 * to a slash, so `/\evil.com` navigates to `//evil.com` (an open redirect).
 */
export function isSafeRedirect(target: string | null | undefined): target is string {
  if (!target || typeof target !== "string") return false;
  if (!target.startsWith("/") || target.startsWith("//")) return false;
  if (target.includes("\\") || /[\u0000-\u001f]/.test(target)) return false;
  try {
    const base = "http://redirect-check.invalid";
    return new URL(target, base).origin === base;
  } catch {
    return false;
  }
}
