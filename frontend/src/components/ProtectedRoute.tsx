"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: ("owner" | "employee")[];
}

export default function ProtectedRoute({
  children,
  allowedRoles,
}: ProtectedRouteProps) {
  const { user, role, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
      return;
    }

    if (!loading && user && allowedRoles && role && !allowedRoles.includes(role)) {
      if (role === "owner") {
        router.push("/onboarding/owner");
      } else {
        router.push("/onboarding/employee");
      }
    }
  }, [user, role, loading, router, allowedRoles]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-text-muted text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return null;
  }

  return <>{children}</>;
}
