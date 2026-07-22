import { create } from "zustand";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export interface ReportSummary {
  active_goals: number;
  completed_goals: number;
  total_tasks: number;
  completed_tasks: number;
  pending_tasks: number;
  in_progress_tasks: number;
  team_size: number;
  completion_rate: number;
}

export interface Report {
  id: string;
  period: string;
  generated_at: string;
  summary: ReportSummary;
  departments?: Record<string, { goals: number; tasks: number }>;
  template_used?: boolean;
}

export interface TemplateInfo {
  id: string;
  filename: string;
  upload_date: string;
  placeholder_count: number;
}

export interface Placeholder {
  key: string;
  description: string;
}

interface ReportState {
  currentReport: Report | null;
  reportHistory: Report[];
  generating: boolean;
  downloading: boolean;
  loading: boolean;
  error: string | null;
  template: TemplateInfo | null;
  templateLoading: boolean;
  templateUploading: boolean;
  placeholders: Placeholder[];
  setCurrentReport: (report: Report | null) => void;
  setReportHistory: (reports: Report[]) => void;
  generateReport: (period?: string, organization_id?: string, useTemplate?: boolean) => Promise<Report>;
  fetchReportHistory: () => Promise<void>;
  downloadReport: (reportId: string, format?: string) => Promise<void>;
  fetchTemplate: (organization_id: string) => Promise<void>;
  uploadTemplate: (organization_id: string, file: File) => Promise<void>;
  deleteTemplate: (organization_id: string) => Promise<void>;
  fetchPlaceholders: () => Promise<void>;
}

export const useReportStore = create<ReportState>()(
  (set, get) => ({
    currentReport: null,
    reportHistory: [],
    generating: false,
    downloading: false,
    loading: false,
    error: null,
    template: null,
    templateLoading: false,
    templateUploading: false,
    placeholders: [],

    setCurrentReport: (report) => set({ currentReport: report }),
    setReportHistory: (reports) => set({ reportHistory: reports }),

    generateReport: async (period = "weekly", organization_id, useTemplate = false) => {
      set({ generating: true, error: null });
      try {
        const response = await fetch(`${API_URL}/reports/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ period, organization_id, use_template: useTemplate }),
        });
        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          const err = new Error(errBody.detail || "Failed to generate report");
          (err as any).status = response.status;
          throw err;
        }
        const result = await response.json();
        const report = {
          ...result.report,
          id: result.report.id || result.report._id,
        };
        set((state) => ({
          currentReport: report,
          reportHistory: [report, ...state.reportHistory],
          generating: false,
        }));
        return report;
      } catch (error: any) {
        set({ error: error.message, generating: false });
        throw error;
      }
    },

    fetchReportHistory: async () => {
      set({ loading: true, error: null });
      try {
        const response = await fetch(`${API_URL}/reports/history`);
        if (!response.ok) throw new Error("Failed to fetch reports");
        const result = await response.json();
        const reports = (result.reports || []).map((r: any) => ({
          ...r,
          id: r._id || r.id,
        }));
        set({ reportHistory: reports, loading: false });
      } catch (error: any) {
        set({ error: error.message, loading: false });
      }
    },

    downloadReport: async (reportId, format = "pdf") => {
      set({ downloading: true, error: null });
      try {
        const response = await fetch(`${API_URL}/reports/download/${reportId}?format=${format}`);
        if (!response.ok) throw new Error("Failed to download report");
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `yesboss_report_${reportId}.${format === "docx" ? "docx" : "pdf"}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        set({ downloading: false });
      } catch (error: any) {
        set({ error: error.message, downloading: false });
        throw error;
      }
    },

    fetchTemplate: async (organization_id) => {
      set({ templateLoading: true });
      try {
        const response = await fetch(`${API_URL}/reports/template?organization_id=${encodeURIComponent(organization_id)}`);
        if (!response.ok) { set({ templateLoading: false }); return; }
        const result = await response.json();
        set({ template: result.template, templateLoading: false });
      } catch {
        set({ templateLoading: false });
      }
    },

    uploadTemplate: async (organization_id, file) => {
      set({ templateUploading: true, error: null });
      try {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch(`${API_URL}/reports/template/upload?organization_id=${encodeURIComponent(organization_id)}`, {
          method: "POST",
          body: formData,
        });
        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          throw new Error(errBody.detail || "Failed to upload template");
        }
        const result = await response.json();
        set({ template: result.template, templateUploading: false });
      } catch (error: any) {
        set({ error: error.message, templateUploading: false });
        throw error;
      }
    },

    deleteTemplate: async (organization_id) => {
      set({ templateUploading: true });
      try {
        await fetch(`${API_URL}/reports/template?organization_id=${encodeURIComponent(organization_id)}`, {
          method: "DELETE",
        });
        set({ template: null, templateUploading: false });
      } catch {
        set({ templateUploading: false });
      }
    },

    fetchPlaceholders: async () => {
      try {
        const response = await fetch(`${API_URL}/reports/placeholders`);
        if (!response.ok) return;
        const result = await response.json();
        set({ placeholders: result.placeholders || [] });
      } catch {
        // silent
      }
    },
  })
);