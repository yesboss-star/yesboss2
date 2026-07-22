"use client";

import { createContext, useContext, useEffect, useState } from "react";
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

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

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
    // Expected — backend may not be running during sign-out
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);
  const { setLastLoginAt } = useUserStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        const token = await getIdToken(firebaseUser);
        const result = await establishSession(token);

        if (result?.success) {
          localStorage.removeItem("yesboss_token");
          localStorage.setItem("yesboss_id_token", token);
          if (result.user) {
            localStorage.setItem("yesboss_user", JSON.stringify(result.user));
          }
          setRole(result.user?.role || "owner");
          setLastLoginAt(new Date().toISOString());
        } else {
          // Backend unreachable — fall back to cached role
          localStorage.setItem("yesboss_id_token", token);
          const cached = localStorage.getItem("yesboss_role");
          setRole(cached === "owner" || cached === "employee" ? cached : "owner");
        }
      } else {
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