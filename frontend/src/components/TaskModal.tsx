"use client";

import { useState, useEffect, useRef } from "react";
import { useTaskStore } from "@/stores/taskStore";
import { useGoalStore } from "@/stores/goalStore";
import { useOrgChartStore } from "@/stores/orgChartStore";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useAuth } from "@/contexts/AuthContext";
import { X, Loader2, Sparkles, Calendar, Users, Flag, CheckSquare, ChevronDown } from "lucide-react";

function PersonComboBox({ label, valueId, valueName, members, filterDept, onChange }: {
  label: string;
  valueId: string;
  valueName: string;
  members: { id: string; email: string; full_name: string; department: string; role: string }[];
  filterDept?: string | null;
  onChange: (id: string, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(valueName || "");
  const ref = useRef<HTMLDivElement>(null);

  const filtered = members.filter((m) => {
    const deptMatch = !filterDept || m.department?.toLowerCase() === filterDept.toLowerCase();
    const q = query.toLowerCase();
    return deptMatch && (m.full_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!open) setQuery(valueName || "");
  }, [open, valueName]);

  const selectedName = valueId ? (members.find((m) => m.email === valueId)?.full_name || valueName || query) : "";

  return (
    <div ref={ref} className="relative">
      <label className="block text-sm font-medium mb-2"><Users className="w-4 h-4 inline mr-1" />{label}</label>
      <div className="relative">
        <input
          type="text"
          value={open ? query : selectedName}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { setQuery(valueName || ""); setOpen(true); }}
          placeholder={`Search or type ${label.toLowerCase()} name/email...`}
          className="w-full px-4 py-3 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm pr-10"
        />
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-background border border-border rounded-xl shadow-2xl max-h-48 overflow-y-auto">
          {filtered.length > 0 ? (
            filtered.slice(0, 8).map((m) => (
              <button
                key={m.email}
                type="button"
                onClick={() => { onChange(m.email, m.full_name); setOpen(false); setQuery(m.full_name); }}
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-surface flex items-center gap-2 ${
                  m.email === valueId ? "bg-primary/10 text-primary" : ""
                }`}
              >
                <span className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-medium text-primary flex-shrink-0">
                  {m.full_name.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{m.full_name}</p>
                  <p className="text-[10px] text-text-muted truncate">{m.email} &middot; {m.department || m.role}</p>
                </div>
              </button>
            ))
          ) : (
            <div className="p-3 space-y-1">
              <p className="text-xs text-text-muted">No matching members found</p>
              {query.trim() && (
                <button
                  type="button"
                  onClick={() => { onChange(query.trim(), query.trim()); setOpen(false); setQuery(query.trim()); }}
                  className="w-full text-left px-3 py-2 text-sm bg-primary/5 rounded-lg hover:bg-primary/10 text-primary"
                >
                  Use &ldquo;{query.trim()}&rdquo; as {label.toLowerCase()}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TaskModal({ isOpen, onClose }: TaskModalProps) {
  const { createTask, loading } = useTaskStore();
  const { goals } = useGoalStore();
  const { organization } = useOrganizationStore();
  const { members, fetchOrgMembers } = useOrgChartStore();
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "medium",
    due_date: "",
    department: "",
    goal_id: "",
    assignee_id: "",
    assignee_name: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen && organization?.id) {
      fetchOrgMembers(organization.id);
    }
  }, [isOpen, organization?.id, fetchOrgMembers]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      setError("Task title is required");
      return;
    }
    if (!organization?.id) {
      setError("Organization not found");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await createTask({
        title: formData.title,
        description: formData.description || undefined,
        priority: formData.priority,
        due_date: formData.due_date || undefined,
        department: formData.department || undefined,
        goal_id: formData.goal_id || undefined,
        assignee_id: formData.assignee_id || undefined,
        assignee_email: formData.assignee_id || undefined,
        organization_id: organization.id,
      });

      setFormData({
        title: "", description: "", priority: "medium", due_date: "",
        department: "", goal_id: "", assignee_id: "", assignee_name: "",
      });
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to create task");
    } finally {
      setSubmitting(false);
    }
  };

  const userEmail = (user as any)?.email || "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 bg-background rounded-2xl border border-border shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <CheckSquare className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Create New Task</h2>
              <p className="text-sm text-text-muted">Assign tasks across your organization</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface transition-colors cursor-pointer">
            <X className="w-5 h-5 text-text-muted" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">Task Title <span className="text-red-400">*</span></label>
            <input type="text" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="e.g., Design new landing page" className="w-full px-4 py-3 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Describe the task details, acceptance criteria, etc..." rows={3} className="w-full px-4 py-3 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm resize-none" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2"><Flag className="w-4 h-4 inline mr-1" />Department</label>
            <div className="relative">
              <input type="text" value={formData.department} onChange={(e) => setFormData({ ...formData, department: e.target.value })} placeholder="e.g., Engineering, Marketing..." list="dept-list" className="w-full px-4 py-3 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm" />
              <datalist id="dept-list">
                {["Engineering", "Marketing", "Sales", "Operations", "Finance", "Human Resources", "Product", "Design", "Customer Support", "R&D", "Supply Chain", "Legal"].map((d) => <option key={d} value={d} />)}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2"><Flag className="w-4 h-4 inline mr-1" />Priority</label>
              <select value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: e.target.value })} className="w-full px-4 py-3 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm appearance-none cursor-pointer">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2"><Calendar className="w-4 h-4 inline mr-1" />Deadline</label>
              <input type="date" value={formData.due_date} onChange={(e) => setFormData({ ...formData, due_date: e.target.value })} className="w-full px-4 py-3 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2"><CheckSquare className="w-4 h-4 inline mr-1" />Related Goal (optional)</label>
            <select value={formData.goal_id} onChange={(e) => setFormData({ ...formData, goal_id: e.target.value })} className="w-full px-4 py-3 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm appearance-none cursor-pointer">
              <option value="">No goal linked</option>
              {goals.filter((g) => g.status === "active").map((goal) => (
                <option key={goal.id} value={goal.id}>{goal.title}</option>
              ))}
            </select>
          </div>

          <PersonComboBox
            label="Assign to"
            valueId={formData.assignee_id}
            valueName={formData.assignee_name}
            members={members}
            filterDept={formData.department || null}
            onChange={(id, name) => setFormData({ ...formData, assignee_id: id, assignee_name: name })}
          />
          {!formData.assignee_id && (
            <button
              type="button"
              onClick={() => {
                setFormData({ ...formData, assignee_id: userEmail, assignee_name: "Myself" });
              }}
              className="text-xs text-primary hover:text-primary-light transition-colors"
            >
              Assign to myself
            </button>
          )}
          {formData.assignee_id && formData.assignee_id === userEmail && (
            <p className="text-xs text-text-muted -mt-3">Task assigned to you</p>
          )}
          {formData.assignee_id && formData.assignee_id !== userEmail && (
            <p className="text-xs text-text-muted -mt-3">Task will be assigned to team member with real-time notification</p>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl glass hover:bg-surface-light text-foreground font-medium transition-all cursor-pointer">Cancel</button>
            <button type="submit" disabled={submitting || loading} className="flex-1 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</> : <><Sparkles className="w-4 h-4" /> Create Task</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
