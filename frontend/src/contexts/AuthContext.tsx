"use client";

import { createContext, useContext, useEffect, useState, useRef } from "react";
import { auth } from "@/lib/firebase";
import { installAuthFetch } from "@/lib/authFetch";
import { User, onAuthStateChanged, onIdTokenChanged, signOut as firebaseSignOut, getIdToken, getIdTokenResult } from "firebase/auth";
import { useUserStore } from "@/stores/userStore";
import { useOrganizationStore } from "@/stores/organizationStore";

type UserRole = "owner" | "employee" | null;

interface AuthContextType {
  user: User | null;
  role: UserRole;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  loading: true,
  signOut: async () => {},
});

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

async function establishSession(idToken: string) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${API_URL}/auth/set-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      signal: controller.signal,
      body: JSON.stringify({ id_token: idToken }),
    });
    clearTimeout(timeout);
    const data = await res.json();
    return data;
  } catch {
    return null;
  }
}

async function clearAuthCookies() {
  // The login/signup pages set client-side auth cookies so the proxy lets
  // protected routes through. These are NOT the httpOnly backend cookie, and
  // the backend's clear-session can't remove them. If we leave them behind
  // after sign-out (or when Firebase reports no user), the proxy still sees
  // hasAuth=true and bounces /login -> /dashboard -> /login forever, leaving
  // the dashboard stuck on "Redirecting to login...".
  document.cookie = "yesboss_token=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
  document.cookie = "yesboss_user=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
  document.cookie = "yesboss_role=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
}

// User-scoped data persisted by zustand stores. localStorage is shared across
// accounts/sessions on the same browser, so stale values leak another user's
// org/goals/tasks into the next sign-in. We wipe them whenever the signed-in
// user changes (and on sign-out).
const LAST_UID_KEY = "yesboss_last_uid"; // who the stored data belongs to; cleared with it, so sign-out forgets it too

const USER_SCOPED_STORAGE_KEYS = [
  LAST_UID_KEY,
  "yesboss_id_token",
  "yesboss_user",
  "yesboss_role",
  "yesboss_token",
  "yesboss-organization",
  "yesboss-goals",
  "yesboss-tasks",
  "yesboss-journal",
  "yesboss-user",
  "yesboss-ui",
  "yesboss-assistant-sessions",
  "yesboss-kpi-suggestions",
];

function clearUserScopedStorage() {
  USER_SCOPED_STORAGE_KEYS.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore storage access errors
    }
  });
}

async function clearSession() {
  // Clear the client-side cookies first so the proxy stops treating this
  // browser as authenticated right away (no /login -> /dashboard loop), then
  // best-effort clear the backend's httpOnly cookie.
  clearAuthCookies();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    await fetch(`${API_URL}/auth/clear-session`, {
      method: "POST",
      credentials: "include",
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch {
    // Expected — backend may not be running during sign-out
  }
}

async function resolveOrganization(idToken: string) {
  // Retry once after a short delay: for employees the org is derived from
  // org_chart_members, and a transient 404 (or an org-load race right after
  // session establishment) would otherwise leave the dashboard empty.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${API_URL}/organizations/me`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) {
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 700));
          continue;
        }
        return;
      }
      const data = await res.json();
      const org = data.organization;
      if (!org) {
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 700));
          continue;
        }
        return;
      }
      useOrganizationStore.getState().setOrganization({
        id: org._id || org.id,
        name: org.name || "",
        domain: org.domain || "",
        industry: org.industry || "",
        size: org.size || "",
        micro_vertical: org.micro_vertical,
        createdAt: org.created_at || new Date().toISOString(),
        owner_id: org.owner_id,
        co_owners: org.co_owners || [],
      });
      return;
    } catch {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 700));
        continue;
      }
      return; // Non-fatal — dashboard falls back to generic state
    }
  }
}

// Module scope on purpose: child effects run before AuthProvider's effects, so installing
// inside an effect would miss the first round of fetches.
installAuthFetch();

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);
  const { setLastLoginAt } = useUserStore();
  const lastUidRef = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        // Skip establishSession if UID hasn't changed (e.g., phone linking token refresh)
        // Prevents re-render cascade that overwrites state and changes dashboard
        if (firebaseUser.uid === lastUidRef.current) {
          setLoading(false);
          return;
        }
        lastUidRef.current = firebaseUser.uid;

        // A DIFFERENT user signed in — wipe the previous user's persisted org/goals/tasks/journal so their
        // data can never leak into this session. The same user reloading the page is not wiped: that used to
        // delete their sign-in token at every load, so the first requests of every page went out with no token
        // and came back 401 until a fresh one arrived. A missing marker counts as "different" (safe default).
        const sameUser = localStorage.getItem(LAST_UID_KEY) === firebaseUser.uid;
        if (!sameUser) {
          clearUserScopedStorage();
          useOrganizationStore.getState().clearOrganization();
        }
        localStorage.setItem(LAST_UID_KEY, firebaseUser.uid);

        const token = await getIdToken(firebaseUser);
        localStorage.setItem("yesboss_id_token", token);
        let result = await establishSession(token);
        if (!result?.success) {
          // one slow or failed call (it gives up after 5 seconds) must not decide who you are: try once more
          await new Promise((resolve) => setTimeout(resolve, 1200));
          result = await establishSession(token);
        }

        if (result?.success) {
          localStorage.removeItem("yesboss_token");
          if (result.user) {
            localStorage.setItem("yesboss_user", JSON.stringify(result.user));
          }
          setRole(result.user?.role === "owner" ? "owner" : "employee");
          setLastLoginAt(new Date().toISOString());
          await resolveOrganization(token);
        } else {
          // The backend could not be reached just now. This used to read a saved role that had just been wiped
          // (clearUserScopedStorage), so it always gave "employee": an owner was shown the employee screens with no
          // organization. The sign-in token itself carries the role, so use that, and still look the organization up.
          let fallback: UserRole = "employee";
          try {
            fallback = (await getIdTokenResult(firebaseUser)).claims.role === "owner" ? "owner" : "employee";
          } catch {
            // keep the least-privileged role when even the token cannot be read
          }
          setRole(fallback);
          await resolveOrganization(token);
        }
      } else {
        lastUidRef.current = null;
        clearUserScopedStorage();
        await clearSession();
        setRole(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [setLastLoginAt]);

  // Firebase ID tokens live ~1 hour. onAuthStateChanged does not fire on refresh, so the copy
  // in localStorage (used by getAuthHeaders and the WebSockets) went stale and every call
  // returned 401 after an hour. Keep it current.
  useEffect(() => {
    const store = (token: string) => {
      try { localStorage.setItem("yesboss_id_token", token); } catch { /* storage unavailable */ }
    };
    const refresh = async () => {
      const current = auth.currentUser;
      if (!current) return;
      try { store(await getIdToken(current)); } catch { /* offline: retry on next tick */ }
    };
    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try { store(await getIdToken(firebaseUser)); } catch { /* ignore */ }
      }
    });
    const interval = setInterval(refresh, 10 * 60 * 1000);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      unsubscribe();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const signOut = async () => {
    await firebaseSignOut(auth);
    clearUserScopedStorage();
    useOrganizationStore.getState().clearOrganization();
    await clearSession();
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}