import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getAuthHeaders } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export interface Goal {
  id: string;
  title: string;
  description?: string;
  priority: string;
  timeline?: string;
  department?: string;
  assignee_id?: string;
  assignee_name?: string;
  reviewer_id?: string;
  reviewer_name?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  priority: string;
  status: string;
  goal_id: string;
  assignee_id?: string;
}

interface GoalState {
  goals: Goal[];
  currentGoal: Goal | null;
  tasks: Task[];
  loading: boolean;
  error: string | null;
  setGoals: (goals: Goal[]) => void;
  setCurrentGoal: (goal: Goal | null) => void;
  setTasks: (tasks: Task[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  fetchGoals: (orgId: string) => Promise<void>;
  createGoal: (data: { title: string; description: string; priority: string; timeline?: string; department?: string; assignee_name?: string; reviewer_name?: string; assignee_id?: string; reviewer_id?: string; organization_id: string }) => Promise<Goal>;
  updateGoal: (goalId: string, data: Partial<Goal>) => Promise<void>;
  deleteGoal: (goalId: string) => Promise<void>;
  generateTasks: (goalId: string, count?: number) => Promise<Task[]>;
  fetchGoalWithTasks: (goalId: string) => Promise<{ goal: Goal; tasks: Task[] }>;
}

export const useGoalStore = create<GoalState>()(
  persist(
    (set, get) => ({
      goals: [],
      currentGoal: null,
      tasks: [],
      loading: false,
      error: null,

      setGoals: (goals) => set({ goals }),
      setCurrentGoal: (goal) => set({ currentGoal: goal }),
      setTasks: (tasks) => set({ tasks }),
      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),

      fetchGoals: async (orgId) => {
        set({ loading: true, error: null });
        try {
          const response = await fetch(`${API_URL}/goals?organization_id=${orgId}`);
          if (!response.ok) throw new Error("Failed to fetch goals");
          const result = await response.json();
          const goals = (result.goals || []).map((g: any) => ({
            ...g,
            id: g._id || g.id,
          }));
          set({ goals, loading: false });
        } catch (error: any) {
          set({ error: error.message, loading: false });
        }
      },

      createGoal: async (data: { title: string; description: string; priority: string; timeline?: string; department?: string; assignee_name?: string; reviewer_name?: string; assignee_id?: string; reviewer_id?: string; organization_id: string }) => {
        set({ loading: true, error: null });
        try {
          const response = await fetch(`${API_URL}/goals`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          if (!response.ok) throw new Error("Failed to create goal");
          const result = await response.json();
          const goal = {
            ...result.goal,
            id: result.goal._id || result.goal.id,
          };
          set((state) => ({
            goals: [goal, ...state.goals],
            loading: false,
          }));
          return goal;
        } catch (error: any) {
          set({ error: error.message, loading: false });
          throw error;
        }
      },

      updateGoal: async (goalId, data) => {
        set({ loading: true, error: null });
        try {
          const response = await fetch(`${API_URL}/goals/${goalId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          if (!response.ok) throw new Error("Failed to update goal");
          const result = await response.json();
          set((state) => ({
            goals: state.goals.map((g) => (g.id === goalId ? result.goal : g)),
            currentGoal: state.currentGoal?.id === goalId ? result.goal : state.currentGoal,
            loading: false,
          }));
        } catch (error: any) {
          set({ error: error.message, loading: false });
          throw error;
        }
      },

      deleteGoal: async (goalId) => {
        set({ loading: true, error: null });
        try {
          const response = await fetch(`${API_URL}/goals/${goalId}`, {
            method: "DELETE",
          });
          if (!response.ok) throw new Error("Failed to delete goal");
          set((state) => ({
            goals: state.goals.filter((g) => g.id !== goalId),
            loading: false,
          }));
        } catch (error: any) {
          set({ error: error.message, loading: false });
          throw error;
        }
      },

      generateTasks: async (goalId, count = 5) => {
        set({ loading: true, error: null });
        try {
          const response = await fetch(`${API_URL}/goals/generate-tasks`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ goal_id: goalId, count }),
          });
          if (!response.ok) throw new Error("Failed to generate tasks");
          const result = await response.json();
          set((state) => ({
            tasks: [...state.tasks, ...result.tasks],
            loading: false,
          }));
          return result.tasks;
        } catch (error: any) {
          set({ error: error.message, loading: false });
          throw error;
        }
      },

      fetchGoalWithTasks: async (goalId) => {
        set({ loading: true, error: null });
        try {
          const response = await fetch(`${API_URL}/goals/${goalId}`);
          if (!response.ok) throw new Error("Failed to fetch goal");
          const result = await response.json();
          const goal = {
            ...result.goal,
            id: result.goal._id || result.goal.id,
          };
          const tasks = (result.tasks || []).map((t: any) => ({
            ...t,
            id: t._id || t.id,
          }));
          set({
            currentGoal: goal,
            tasks,
            loading: false,
          });
          return { goal, tasks };
        } catch (error: any) {
          set({ error: error.message, loading: false });
          throw error;
        }
      },
    }),
    {
      name: "yesboss-goals",
    }
  )
);