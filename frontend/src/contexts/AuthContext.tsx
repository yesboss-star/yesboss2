"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { User, onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);
  const { setLastLoginAt } = useUserStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        const storedRole = localStorage.getItem("yesboss_role");
        setRole((storedRole as UserRole) || "employee");
        setLastLoginAt(new Date().toISOString());
      } else {
        const storedUser = localStorage.getItem("yesboss_user");
        if (storedUser) {
          try {
            const userData = JSON.parse(storedUser);
            setRole(userData?.role || null);
          } catch (e) {
            setRole(null);
          }
        } else {
          setRole(null);
        }
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, [setLastLoginAt]);

  const signOut = async () => {
    await firebaseSignOut(auth);
    localStorage.removeItem("yesboss_token");
    localStorage.removeItem("yesboss_user");
    localStorage.removeItem("yesboss_role");
    document.cookie = "yesboss_token=; path=/; max-age=0; SameSite=Lax";
    document.cookie = "yesboss_user=; path=/; max-age=0; SameSite=Lax";
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