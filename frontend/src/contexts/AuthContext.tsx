"use client";

import { createContext, useContext, useEffect, useState, useRef } from "react";
import { auth } from "@/lib/firebase";
import { User, onAuthStateChanged, signOut as firebaseSignOut, getIdToken } from "firebase/auth";
import { useUserStore } from "@/stores/userStore";

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

async function clearSession() {
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
    // Expected â€” backend may not be running during sign-out
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

        const token = await getIdToken(firebaseUser);
        localStorage.setItem("yesboss_id_token", token);
        const result = await establishSession(token);

        if (result?.success) {
          localStorage.removeItem("yesboss_token");
          if (result.user) {
            localStorage.setItem("yesboss_user", JSON.stringify(result.user));
          }
          setRole(result.user?.role || "owner");
          setLastLoginAt(new Date().toISOString());
        } else {
          const cached = localStorage.getItem("yesboss_role");
          setRole(cached === "owner" || cached === "employee" ? cached : "owner");
        }
      } else {
        lastUidRef.current = null;
        await clearSession();
        setRole(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [setLastLoginAt]);

  const signOut = async () => {
    await firebaseSignOut(auth);
    localStorage.removeItem("yesboss_user");
    localStorage.removeItem("yesboss_role");
    localStorage.removeItem("yesboss_id_token");
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