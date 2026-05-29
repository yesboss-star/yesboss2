"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationStore } from "@/stores/organizationStore";
import DashboardLayout from "@/components/DashboardLayout";
import TaskView from "@/components/owners/TaskView";

export default function TaskPage() {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const { organization } = useOrganizationStore();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (loading || !user || organization) return;
    const existingPersist = localStorage.getItem("yesboss-organization");
    if (existingPersist) {
      try {
        const parsed = JSON.parse(existingPersist);
        if (parsed?.state?.organization) {
          useOrganizationStore.getState().setOrganization(parsed.state.organization);
          return;
        }
      } catch {}
    }
    useOrganizationStore.getState().fetchOrganizationByEmail(user.email!);
  }, [user, loading, organization]);

  if (loading || !user) {
    return null;
  }

  return (
    <DashboardLayout>
      <TaskView />
    </DashboardLayout>
  );
}
