import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getAuthHeaders } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export interface Task {
  id: string;
  _id?: string;
  title: string;
  description?: string;
  priority: string;
  status: string;
  goal_id?: string;
  assignee_id?: string[];
  assignee_email?: string;
  department?: string;
  due_date?: string;
  dependencies: string[];
  reviewers: string[];
  created_at: string;
  updated_at: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  content: string;
  user_id: string;
  user_email: string;
  created_at: string;
}

interface TaskState {
  tasks: Task[];
  currentTask: Task | null;
  comments: TaskComment[];
  loading: boolean;
  error: string | null;
  setTasks: (tasks: Task[]) => void;
  setCurrentTask: (task: Task | null) => void;
  setComments: (comments: TaskComment[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  updateTaskFromWs: (task: any) => void;
  addTaskFromWs: (task: any) => void;
  fetchTasks: (orgId: string, filters?: { goal_id?: string; assignee_id?: string; status?: string }) => Promise<void>;
  fetchTaskWithComments: (taskId: string) => Promise<void>;
  createTask: (data: { title: string; description?: string; priority?: string; goal_id?: string; assignee_id?: string[]; assignee_email?: string; department?: string; due_date?: string; organization_id: string }) => Promise<Task>;
  updateTask: (taskId: string, data: Partial<Task>) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  completeTask: (taskId: string) => Promise<void>;
  approveTask: (taskId: string) => Promise<void>;
  fetchSuggestions: (orgId: string, title: string, description?: string, department?: string) => Promise<any>;
  fetchDeadlineSuggestion: (title: string, description?: string) => Promise<any>;
  fetchWorkloadCheck: (orgId: string, email: string) => Promise<any>;
  addComment: (taskId: string, content: string) => Promise<void>;
}

export const useTaskStore = create<TaskState>()(
  persist(
    (set, get) => ({
      tasks: [],
      currentTask: null,
      comments: [],
      loading: false,
      error: null,

      setTasks: (tasks) => {
        const deduped = tasks.filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i);
        set({ tasks: deduped });
      },
      setCurrentTask: (task) => set({ currentTask: task }),
      setComments: (comments) => set({ comments }),
      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),

      updateTaskFromWs: (task) => {
        const raw = task.assignee_id;
        const mapped = {
          ...task,
          id: task._id || task.id,
          assignee_id: Array.isArray(raw) ? raw : (raw ? [raw] : []),
        };
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === mapped.id ? mapped : t)),
          currentTask: state.currentTask?.id === mapped.id ? mapped : state.currentTask,
        }));
      },

      addTaskFromWs: (task) => {
        const raw = task.assignee_id;
        const mapped = {
          ...task,
          id: task._id || task.id,
          assignee_id: Array.isArray(raw) ? raw : (raw ? [raw] : []),
        };
        set((state) => {
          if (state.tasks.find((t) => t.id === mapped.id)) {
            return { tasks: state.tasks.map((t) => (t.id === mapped.id ? mapped : t)) };
          }
          return { tasks: [mapped, ...state.tasks] };
        });
      },

      fetchTasks: async (orgId, filters = {}) => {
        set({ loading: true, error: null });
        try {
          const params = new URLSearchParams({ organization_id: orgId });
          if (filters.goal_id) params.append("goal_id", filters.goal_id);
          if (filters.assignee_id) params.append("assignee_id", filters.assignee_id);
          if (filters.status) params.append("status", filters.status);
          
          const response = await fetch(`${API_URL}/tasks?${params}`, {
            headers: { ...getAuthHeaders() },
          });
          if (!response.ok) throw new Error("Failed to fetch tasks");
          const result = await response.json();
          const tasks = (result.tasks || []).map((t: any) => {
            const raw = t.assignee_id;
            return {
              ...t,
              id: t._id || t.id,
              assignee_id: Array.isArray(raw) ? raw : (raw ? [raw] : []),
            };
          });
          const deduped = tasks.filter((t: any, i: number, a: any[]) => a.findIndex((x: any) => x.id === t.id) === i);
          set({ tasks: deduped, loading: false });
        } catch (error: any) {
          set({ error: error.message, loading: false });
        }
      },

      fetchTaskWithComments: async (taskId) => {
        set({ loading: true, error: null });
        try {
          const response = await fetch(`${API_URL}/tasks/${taskId}`, {
            headers: { ...getAuthHeaders() },
          });
          if (!response.ok) throw new Error("Failed to fetch task");
          const result = await response.json();
          const rawTask = result.task;
          const task = {
            ...rawTask,
            id: rawTask._id || rawTask.id,
            assignee_id: Array.isArray(rawTask.assignee_id) ? rawTask.assignee_id : (rawTask.assignee_id ? [rawTask.assignee_id] : []),
          };
          const comments = (result.comments || []).map((c: any) => ({
            ...c,
            id: c._id || c.id,
          }));
          set({
            currentTask: task,
            comments,
            loading: false,
          });
        } catch (error: any) {
          set({ error: error.message, loading: false });
        }
      },

      createTask: async (data) => {
        set({ loading: true, error: null });
        try {
          const { organization_id, ...bodyData } = data;
          const params = organization_id ? `?organization_id=${organization_id}` : "";
          const response = await fetch(`${API_URL}/tasks${params}`, {
            method: "POST",
            headers: { ...getAuthHeaders() },
            body: JSON.stringify(bodyData),
          });
          if (!response.ok) throw new Error("Failed to create task");
          const result = await response.json();
          const raw = result.task.assignee_id;
          const task = {
            ...result.task,
            id: result.task._id || result.task.id,
            assignee_id: Array.isArray(raw) ? raw : (raw ? [raw] : []),
          };
          set((state) => ({
            tasks: [task, ...state.tasks],
            loading: false,
          }));
          return task;
        } catch (error: any) {
          set({ error: error.message, loading: false });
          throw error;
        }
      },

      updateTask: async (taskId, data) => {
        set({ loading: true, error: null });
        try {
          const response = await fetch(`${API_URL}/tasks/${taskId}`, {
            method: "PUT",
            headers: { ...getAuthHeaders() },
            body: JSON.stringify(data),
          });
          if (!response.ok) throw new Error("Failed to update task");
          const result = await response.json();
          const raw = result.task.assignee_id;
          const task = {
            ...result.task,
            id: result.task._id || result.task.id,
            assignee_id: Array.isArray(raw) ? raw : (raw ? [raw] : []),
          };
          set((state) => ({
            tasks: state.tasks.map((t) => (t.id === taskId ? task : t)),
            currentTask: state.currentTask?.id === taskId ? task : state.currentTask,
            loading: false,
          }));
        } catch (error: any) {
          set({ error: error.message, loading: false });
          throw error;
        }
      },

      deleteTask: async (taskId) => {
        set({ loading: true, error: null });
        try {
          const response = await fetch(`${API_URL}/tasks/${taskId}`, {
            method: "DELETE",
            headers: { ...getAuthHeaders() },
          });
          if (!response.ok) throw new Error("Failed to delete task");
          set((state) => ({
            tasks: state.tasks.filter((t) => t.id !== taskId),
            loading: false,
          }));
        } catch (error: any) {
          set({ error: error.message, loading: false });
          throw error;
        }
      },

      completeTask: async (taskId) => {
        try {
          const response = await fetch(`${API_URL}/tasks/${taskId}/complete`, {
            method: "POST",
            headers: { ...getAuthHeaders() },
          });
          if (!response.ok) throw new Error("Failed to complete task");
          const result = await response.json();
          const raw = result.task.assignee_id;
          const task = {
            ...result.task,
            assignee_id: Array.isArray(raw) ? raw : (raw ? [raw] : []),
          };
          set((state) => ({
            tasks: state.tasks.map((t) => (t.id === taskId ? task : t)),
            currentTask: state.currentTask?.id === taskId ? task : state.currentTask,
          }));
        } catch (error: any) {
          set({ error: error.message });
          throw error;
        }
      },

      approveTask: async (taskId) => {
        try {
          const response = await fetch(`${API_URL}/tasks/${taskId}/approve`, {
            method: "POST",
            headers: { ...getAuthHeaders() },
          });
          if (!response.ok) throw new Error("Failed to approve task");
          const result = await response.json();
          const raw = result.task.assignee_id;
          const task = {
            ...result.task,
            assignee_id: Array.isArray(raw) ? raw : (raw ? [raw] : []),
          };
          set((state) => ({
            tasks: state.tasks.map((t) => (t.id === taskId ? task : t)),
            currentTask: state.currentTask?.id === taskId ? task : state.currentTask,
          }));
        } catch (error: any) {
          set({ error: error.message });
          throw error;
        }
      },

      fetchSuggestions: async (orgId: string, title: string, description?: string, department?: string) => {
        try {
          const params = new URLSearchParams({
            title,
            organization_id: orgId,
          });
          if (description) params.append("description", description);
          if (department) params.append("department", department);
          const response = await fetch(`${API_URL}/smart/suggest-assignees?${params}`, {
            headers: { ...getAuthHeaders() },
          });
          if (!response.ok) return null;
          return await response.json();
        } catch { return null; }
      },

      fetchDeadlineSuggestion: async (title: string, description?: string) => {
        try {
          const response = await fetch(`${API_URL}/smart/suggest-deadline`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getAuthHeaders() },
            body: JSON.stringify({ title, description: description || "" }),
          });
          if (!response.ok) return null;
          return await response.json();
        } catch { return null; }
      },

      fetchWorkloadCheck: async (orgId: string, email: string) => {
        try {
          const response = await fetch(`${API_URL}/smart/check-workload/${orgId}/${email}`, {
            headers: { ...getAuthHeaders() },
          });
          if (!response.ok) return null;
          return await response.json();
        } catch { return null; }
      },

      addComment: async (taskId, content) => {
        try {
          const response = await fetch(`${API_URL}/tasks/${taskId}/comments`, {
            method: "POST",
            headers: { ...getAuthHeaders() },
            body: JSON.stringify({ content }),
          });
          if (!response.ok) throw new Error("Failed to add comment");
          const result = await response.json();
          set((state) => ({
            comments: [...state.comments, result.comment],
          }));
        } catch (error: any) {
          set({ error: error.message });
          throw error;
        }
      },
    }),
    {
      name: "yesboss-tasks",
    }
  )
);