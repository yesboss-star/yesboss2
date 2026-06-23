"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useGoalStore } from "@/stores/goalStore";
import { useOrgChartStore } from "@/stores/orgChartStore";
import { useTaskStore } from "@/stores/taskStore";
import { useOrganizationStore } from "@/stores/organizationStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export type OrgStage = "new" | "onboarding" | "growing" | "established";

export interface DashboardAdaptation {
  stage: OrgStage;
  showSetupWizard: boolean;
  showExecutiveKPIs: boolean;
  showGrokInsights: boolean;
  showRevenueRisk: boolean;
  emptyStateMessage: string;
  suggestedFocus: string[];
  insights: string[];
}

function classifyStage(
  goalCount: number,
  memberCount: number,
  taskCount: number,
  orgSize: string | undefined
): OrgStage {
  if (goalCount === 0 && memberCount === 0) return "new";
  if (goalCount > 0 && memberCount === 0) return "onboarding";
  if (goalCount > 0 && memberCount > 0 && taskCount < 5) return "growing";
  return "established";
}

function buildAdaptation(stage: OrgStage, goalCount: number, memberCount: number, taskCount: number): DashboardAdaptation {
  const base: DashboardAdaptation = {
    stage,
    showSetupWizard: stage === "new" || stage === "onboarding",
    showExecutiveKPIs: stage === "growing" || stage === "established",
    showGrokInsights: true,
    showRevenueRisk: stage === "established",
    emptyStateMessage: "",
    suggestedFocus: [],
    insights: [],
  };

  switch (stage) {
    case "new":
      return {
        ...base,
        emptyStateMessage: "Welcome! Start by creating your first business goal or building your organization chart.",
        suggestedFocus: ["Create your first goal", "Build your org chart", "Define team structure"],
        insights: ["Set up your first business objective to start tracking progress"],
      };
    case "onboarding":
      return {
        ...base,
        emptyStateMessage: "Great start! You have goals defined. Now build your team structure.",
        suggestedFocus: ["Upload org chart", "Add team members", "Assign goal owners"],
        insights: [`You have ${goalCount} goal${goalCount > 1 ? 's' : ''} defined. Connect them to your team.`],
      };
    case "growing":
      return {
        ...base,
        emptyStateMessage: `You're making progress with ${goalCount} goals and ${memberCount} team members.`,
        suggestedFocus: ["Create tasks from goals", "Set up department leads", "Define OKRs"],
        insights: [
          `${goalCount} active goals being tracked`,
          `${memberCount} team members in your org chart`,
        ],
      };
    case "established":
      return {
        ...base,
        emptyStateMessage: `Your business is running with ${goalCount} goals, ${memberCount} team members, and ${taskCount} active tasks.`,
        suggestedFocus: ["Review goal completion", "Analyze team performance", "Generate weekly report"],
        insights: [
          `${goalCount} goals tracked across departments`,
          `${memberCount} team members in your organization`,
        ],
      };
  }
}

export function useAIDashboardAdaptation() {
  const { user, role } = useAuth();
  const { organization } = useOrganizationStore();
  const { goals, fetchGoals } = useGoalStore();
  const { members, fetchOrgMembers } = useOrgChartStore();
  const { tasks, fetchTasks } = useTaskStore();
  const orgId = organization?.id;

  const [adaptation, setAdaptation] = useState<DashboardAdaptation>(() =>
    buildAdaptation("new", 0, 0, 0)
  );

  useEffect(() => {
    if (orgId) {
      fetchGoals(orgId);
      fetchOrgMembers();
      fetchTasks(orgId);
    }
  }, [orgId, fetchGoals, fetchOrgMembers, fetchTasks]);

  const goalCount = goals.filter(g => g.status !== "cancelled").length;
  const memberCount = members.length;
  const taskCount = tasks.length;

  useEffect(() => {
    const stage = classifyStage(goalCount, memberCount, taskCount, organization?.size);
    setAdaptation(buildAdaptation(stage, goalCount, memberCount, taskCount));
  }, [goalCount, memberCount, taskCount, organization?.size]);

  const getAISummary = useCallback(async (): Promise<string> => {
    try {
      const response = await fetch(`${API_URL}/strategy-chat/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Analyze our current business state and provide a one-paragraph executive summary of what needs attention.",
          context: {
            organization: organization?.name,
            industry: organization?.industry,
            goals_count: goalCount,
            members_count: memberCount,
            tasks_count: taskCount,
            org_stage: adaptation.stage,
          },
          history: [],
        }),
      });
      if (response.ok) {
        const data = await response.json();
        return data.message || "";
      }
    } catch {
      // fallback to local insights
    }
    return "";
  }, [organization, goalCount, memberCount, taskCount, adaptation.stage]);

  return { adaptation, getAISummary };
}
