"use client";

import { createContext, useContext, useEffect, useState, useRef } from "react";
import { auth } from "@/lib/firebase";
import { User, onAuthStateChanged, signOut as firebaseSignOut, getIdToken } from "firebase/auth";
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
const USER_SCOPED_STORAGE_KEYS = [
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
  try {
    const res = await fetch(`${API_URL}/organizations/me`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    const org = data.organization;
    if (!org) return;
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
  } catch {
    // Non-fatal — dashboard falls back to generic state
  }
}

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

        // New user signed in — wipe any previous user's persisted org/goals/tasks/
        // journal so their data can never leak into this session.
        clearUserScopedStorage();
        useOrganizationStore.getState().clearOrganization();

        const token = await getIdToken(firebaseUser);
        localStorage.setItem("yesboss_id_token", token);
        const result = await establishSession(token);

        if (result?.success) {
          localStorage.removeItem("yesboss_token");
          if (result.user) {
            localStorage.setItem("yesboss_user", JSON.stringify(result.user));
          }
          setRole(result.user?.role === "owner" ? "owner" : "employee");
          setLastLoginAt(new Date().toISOString());
          await resolveOrganization(token);
        } else {
          const cached = localStorage.getItem("yesboss_role");
          setRole(cached === "owner" ? "owner" : "employee");
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