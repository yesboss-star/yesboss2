/**
 * Attach the Firebase ID token to every request that goes to our own API.
 *
 * The backend now rejects unauthenticated calls to tenant data routes, but ~40 call sites
 * across stores and components built their headers by hand and several sent none at all.
 * Wrapping fetch once means no call site can forget the header again. The token is only ever
 * sent to our API origin, never to third-party URLs, and an explicit Authorization header
 * set by the caller is left untouched.
 */
const TOKEN_KEY = "yesboss_id_token";

function apiBase(): string {
  return (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");
}

function isOwnApi(url: string): boolean {
  try {
    const resolved = new URL(url, window.location.origin);
    const base = apiBase();
    if (base && resolved.href.startsWith(base + "/")) return true;
    return resolved.origin === window.location.origin && resolved.pathname.startsWith("/api/v1/");
  } catch {
    return false;
  }
}

export function installAuthFetch(): void {
  if (typeof window === "undefined") return;
  const w = window as typeof window & { __yesbossAuthFetch?: boolean };
  if (w.__yesbossAuthFetch) return;
  w.__yesbossAuthFetch = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (isOwnApi(url)) {
        const token = localStorage.getItem(TOKEN_KEY);
        if (token) {
          const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
          if (!headers.has("Authorization")) {
            headers.set("Authorization", `Bearer ${token}`);
            if (input instanceof Request && !init?.headers) {
              return originalFetch(new Request(input, { headers }));
            }
            return originalFetch(input, { ...init, headers });
          }
        }
      }
    } catch {
      /* fall through to the untouched request */
    }
    return originalFetch(input, init);
  };
}
