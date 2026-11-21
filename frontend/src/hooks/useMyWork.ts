"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useGoalStore } from "@/stores/goalStore";
import { useOrgChartStore } from "@/stores/orgChartStore";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useTaskStore } from "@/stores/taskStore";

type Member = { email?: string; manager_email?: string };

/** The tasks and goals this person may see, read from the shared stores.
 *  An owner sees everything; anyone else sees their own tasks and their direct reports' tasks, and the goals they are on.
 *  `ready` turns true once the first task read has finished, so a screen never says "nothing needs you" while tasks are still loading. */
export function useMyWork() {
  const { user, role } = useAuth();
  const orgId = useOrganizationStore((s) => s.organization?.id);
  const { tasks } = useTaskStore();
  const { goals } = useGoalStore();
  const { members } = useOrgChartStore();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false); // the task read kept failing, so a screen can say so instead of staying blank
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (!orgId) return;
    let alive = true;
    useGoalStore.getState().fetchGoals(orgId);
    useOrgChartStore.getState().fetchOrgMembers(orgId);
    // fetchTasks keeps a failure in the store instead of throwing, and the very first read can land before sign-in has settled
    // (a 401): a failed read must not look like "no tasks", so try again a few times before giving up quietly
    (async () => {
      for (let attempt = 0; attempt < 4 && alive; attempt++) {
        await useTaskStore.getState().fetchTasks(orgId);
        if (!alive) return;
        if (!useTaskStore.getState().error) {
          setReady(true);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      if (alive) setFailed(true);
    })();
    return () => {
      alive = false;
    };
  }, [orgId, tries]);

  const retry = () => {
    setFailed(false);
    setTries((n) => n + 1);
  };

  const email = user?.email?.toLowerCase() || "";

  const directReportEmails = useMemo(
    () => new Set((members as Member[]).filter((m) => (m.manager_email || "").toLowerCase() === email).map((m) => (m.email || "").toLowerCase())),
    [members, email],
  );

  const myTasks = useMemo(() => {
    if (role === "owner") return tasks;
    return tasks.filter((t) => {
      const ae = (t as { assignee_email?: string | string[] }).assignee_email;
      const assigneeEmails = Array.isArray(ae) ? ae.map((x) => String(x).toLowerCase()) : [String(ae || "").toLowerCase()];
      const assigneeIds = t.assignee_id || [];
      return (
        assigneeEmails.includes(email) ||
        assigneeIds.some((id) => id.toLowerCase() === email) ||
        assigneeEmails.some((e) => directReportEmails.has(e)) ||
        assigneeIds.some((id) => directReportEmails.has(id.toLowerCase()))
      );
    });
  }, [tasks, role, email, directReportEmails]);

  const myGoals = useMemo(() => {
    if (role === "owner") return goals;
    return goals.filter((g) => (g.assignee_id || []).some((id) => id.toLowerCase() === email));
  }, [goals, role, email]);

  return { myTasks, myGoals, ready, failed, retry, role, email, orgId };
}
