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
    const res = await fetch(`${API_URL}/auth/set-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: idToken }),
    });
    const data = await res.json();
    return data;
  } catch (e) {
    console.error("Session establishment failed:", e);
    return null;
  }
}

async function clearSession() {
  try {
    await fetch(`${API_URL}/auth/clear-session`, {
      method: "POST",
    });
  } catch (e) {
    console.error("Session clear failed:", e);
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
          if (result.user) {
            localStorage.setItem("yesboss_user", JSON.stringify(result.user));
          }
          setRole(result.user?.role || "owner");
          setLastLoginAt(new Date().toISOString());
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