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
  const { organization, fetchOrganizationByEmail } = useOrganizationStore();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    const initOrg = async () => {
      if (!loading && user && !organization) {
        const email = user.email;
        if (email) {
          const org = await fetchOrganizationByEmail(email);
          if (!org && role === "owner") {
            const storedUser = localStorage.getItem("yesboss_user");
            if (storedUser) {
              const userData = JSON.parse(storedUser);
              if (userData.organization_completed) return;
            }
            router.push("/onboarding/owner");
          }
        }
      }
    };
    initOrg();
  }, [user, role, loading, organization, fetchOrganizationByEmail, router]);

  if (loading || !user) {
    return null;
  }

  return (
    <DashboardLayout>
      <TaskView />
    </DashboardLayout>
  );
}
