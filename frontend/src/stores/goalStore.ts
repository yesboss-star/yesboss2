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
  due_date?: string;
  department?: string;
  assignee_id?: string[];
  assignee_name?: string[];
  reviewer_id?: string[];
  reviewer_name?: string[];
  status: string;
  created_at: string;
  updated_at: string;
  progress?: number;
  success_criteria?: string;
  kpis?: string;
  timeline_detail?: string;
  dependencies?: string;
  breakdown_history?: Array<{
    role: string;
    content: string;
    timestamp: string;
  }>;
  task_counts?: {
    total: number;
    completed: number;
    in_progress: number;
    pending: number;
  };
}

export interface TaskSuggestion {
  title: string;
  description?: string;
  priority: string;
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
  updateGoalFromWs: (goal: any) => void;
  addGoalFromWs: (goal: any) => void;
  fetchGoals: (orgId: string) => Promise<void>;
  createGoal: (data: { title: string; description: string; priority: string; timeline?: string; due_date?: string; department?: string; assignee_name?: string[]; reviewer_name?: string[]; assignee_id?: string[]; reviewer_id?: string[]; organization_id: string }) => Promise<Goal>;
  updateGoal: (goalId: string, data: Partial<Goal>) => Promise<void>;
  deleteGoal: (goalId: string) => Promise<void>;
  generateTasks: (goalId: string, count?: number) => Promise<Task[]>;
  fetchGoalWithTasks: (goalId: string) => Promise<{ goal: Goal; tasks: Task[] }>;
  updateGoalBreakdown: (goalId: string, data: Partial<Goal>) => Promise<Goal>;
  goalChat: (goalId: string, message: string) => Promise<{ response: string; probing_questions: string[]; structured_update: Record<string, string>; task_suggestions: TaskSuggestion[]; goal: Goal }>;
  createTasksFromSuggestions: (goalId: string, tasks: TaskSuggestion[]) => Promise<Task[]>;
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

      updateGoalFromWs: (goal) => {
        const mapped = { ...goal, id: goal._id || goal.id };
        set((state) => ({
          goals: state.goals.map((g) => (g.id === mapped.id ? { ...g, ...mapped } : g)),
          currentGoal: state.currentGoal?.id === mapped.id ? { ...state.currentGoal, ...mapped } : state.currentGoal,
        }));
      },

      addGoalFromWs: (goal) => {
        const mapped = { ...goal, id: goal._id || goal.id };
        set((state) => ({
          goals: [mapped, ...state.goals],
        }));
      },

      fetchGoals: async (orgId) => {
        set({ loading: true, error: null });
        try {
          const response = await fetch(`${API_URL}/goals?organization_id=${orgId}&limit=20`);
          if (!response.ok) throw new Error("Failed to fetch goals");
          const result = await response.json();
          const goals = (result.goals || []).map((g: any) => {
            const normalizeField = (v: any) => Array.isArray(v) ? v : (v ? [v] : []);
            return {
              ...g,
              id: g._id || g.id,
              assignee_id: normalizeField(g.assignee_id),
              assignee_name: normalizeField(g.assignee_name),
              reviewer_id: normalizeField(g.reviewer_id),
              reviewer_name: normalizeField(g.reviewer_name),
            };
          });
          set({ goals, loading: false });
        } catch (error: any) {
          set({ error: error.message, loading: false });
        }
      },

      createGoal: async (data: { title: string; description: string; priority: string; timeline?: string; due_date?: string; department?: string; assignee_name?: string[]; reviewer_name?: string[]; assignee_id?: string[]; reviewer_id?: string[]; organization_id: string }) => {
        set({ loading: true, error: null });
        try {
          const response = await fetch(`${API_URL}/goals`, {
            method: "POST",
            headers: { ...getAuthHeaders() },
            body: JSON.stringify(data),
          });
          if (!response.ok) throw new Error("Failed to create goal");
          const result = await response.json();
          const normalizeField = (v: any) => Array.isArray(v) ? v : (v ? [v] : []);
          const goal = {
            ...result.goal,
            id: result.goal._id || result.goal.id,
            assignee_id: normalizeField(result.goal.assignee_id),
            assignee_name: normalizeField(result.goal.assignee_name),
            reviewer_id: normalizeField(result.goal.reviewer_id),
            reviewer_name: normalizeField(result.goal.reviewer_name),
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
            headers: { ...getAuthHeaders() },
            body: JSON.stringify(data),
          });
          if (!response.ok) throw new Error("Failed to update goal");
          const result = await response.json();
          const normalizeField = (v: any) => Array.isArray(v) ? v : (v ? [v] : []);
          const updatedGoal = {
            ...result.goal,
            id: result.goal._id || result.goal.id,
            assignee_id: normalizeField(result.goal.assignee_id),
            assignee_name: normalizeField(result.goal.assignee_name),
            reviewer_id: normalizeField(result.goal.reviewer_id),
            reviewer_name: normalizeField(result.goal.reviewer_name),
          };
          set((state) => ({
            goals: state.goals.map((g) => (g.id === goalId ? updatedGoal : g)),
            currentGoal: state.currentGoal?.id === goalId ? updatedGoal : state.currentGoal,
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
            headers: { ...getAuthHeaders() },
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
          const normalizeField = (v: any) => Array.isArray(v) ? v : (v ? [v] : []);
          const goal = {
            ...result.goal,
            id: result.goal._id || result.goal.id,
            assignee_id: normalizeField(result.goal.assignee_id),
            assignee_name: normalizeField(result.goal.assignee_name),
            reviewer_id: normalizeField(result.goal.reviewer_id),
            reviewer_name: normalizeField(result.goal.reviewer_name),
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

      updateGoalBreakdown: async (goalId, data) => {
        set({ loading: true, error: null });
        try {
          const response = await fetch(`${API_URL}/goals/${goalId}/breakdown`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          if (!response.ok) throw new Error("Failed to update goal breakdown");
          const result = await response.json();
          const normalizeField = (v: any) => Array.isArray(v) ? v : (v ? [v] : []);
          const updatedGoal = {
            ...result.goal,
            id: result.goal._id || result.goal.id,
            assignee_id: normalizeField(result.goal.assignee_id),
            assignee_name: normalizeField(result.goal.assignee_name),
            reviewer_id: normalizeField(result.goal.reviewer_id),
            reviewer_name: normalizeField(result.goal.reviewer_name),
          };
          set((state) => ({
            goals: state.goals.map((g) => (g.id === goalId ? updatedGoal : g)),
            currentGoal: state.currentGoal?.id === goalId ? updatedGoal : state.currentGoal,
            loading: false,
          }));
          return updatedGoal;
        } catch (error: any) {
          set({ error: error.message, loading: false });
          throw error;
        }
      },

      goalChat: async (goalId, message) => {
        set({ loading: true, error: null });
        try {
          const response = await fetch(`${API_URL}/goals/${goalId}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message, goal_id: goalId }),
          });
          if (!response.ok) throw new Error("Failed to send goal chat message");
          const result = await response.json();
          if (result.goal) {
            const normalizeField = (v: any) => Array.isArray(v) ? v : (v ? [v] : []);
            const updatedGoal = {
              ...result.goal,
              id: result.goal._id || result.goal.id,
              assignee_id: normalizeField(result.goal.assignee_id),
              assignee_name: normalizeField(result.goal.assignee_name),
              reviewer_id: normalizeField(result.goal.reviewer_id),
              reviewer_name: normalizeField(result.goal.reviewer_name),
            };
            set((state) => ({
              goals: state.goals.map((g) => (g.id === goalId ? updatedGoal : g)),
              currentGoal: state.currentGoal?.id === goalId ? updatedGoal : state.currentGoal,
              loading: false,
            }));
          } else {
            set({ loading: false });
          }
          return result;
        } catch (error: any) {
          set({ error: error.message, loading: false });
          throw error;
        }
      },

      createTasksFromSuggestions: async (goalId, tasks) => {
        set({ loading: true, error: null });
        try {
          const response = await fetch(`${API_URL}/goals/create-tasks-from-suggestions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ goal_id: goalId, tasks }),
          });
          if (!response.ok) throw new Error("Failed to create tasks from suggestions");
          const result = await response.json();
          const newTasks = (result.tasks || []).map((t: any) => ({
            ...t,
            id: t._id || t.id,
          }));
          set((state) => ({
            tasks: [...newTasks, ...state.tasks],
            loading: false,
          }));
          return newTasks;
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