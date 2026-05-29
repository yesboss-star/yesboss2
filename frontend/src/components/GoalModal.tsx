"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useGoalStore } from "@/stores/goalStore";
import { useOrgChartStore } from "@/stores/orgChartStore";
import { useOrganizationStore } from "@/stores/organizationStore";
import { X, Loader2, Sparkles, Calendar, Users, Flag, CheckCircle2, Search, ChevronDown } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
const DEPARTMENTS = ["Engineering", "Marketing", "Sales", "Operations", "Finance", "Human Resources", "Product", "Design", "Customer Support", "R&D", "Supply Chain", "Legal"];

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

interface GoalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function GoalModal({ isOpen, onClose }: GoalModalProps) {
  const { createGoal, generateTasks, loading } = useGoalStore();
  const { organization } = useOrganizationStore();
  const { members, fetchOrgMembers } = useOrgChartStore();
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "medium",
    timeline: "",
    department: "",
    assignee_id: "",
    assignee_name: "",
    reviewer_id: "",
    reviewer_name: "",
    generateTasks: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [detectedDept, setDetectedDept] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && organization?.id) {
      fetchOrgMembers(organization.id);
    }
  }, [isOpen, organization?.id, fetchOrgMembers]);

  const analyzeDepartment = useCallback(async (title: string, description: string) => {
    if (!title.trim() || title.trim().length < 5) {
      setDetectedDept(null);
      return;
    }
    setAnalyzing(true);
    try {
      const res = await fetch(`${API_URL}/goals/analyze-department`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description: description || title, industry: "" }),
      });
      const data = await res.json();
      if (data.department && !formData.department) {
        setDetectedDept(data.department);
        setFormData((prev) => ({ ...prev, department: data.department }));
      }
    } catch {
      // silent
    } finally {
      setAnalyzing(false);
    }
  }, []);

  useEffect(() => {
    if (!formData.title.trim()) return;
    const timer = setTimeout(() => {
      analyzeDepartment(formData.title, formData.description);
    }, 800);
    return () => clearTimeout(timer);
  }, [formData.title, formData.description, analyzeDepartment]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      setError("Goal title is required");
      return;
    }
    if (!organization?.id) {
      setError("Organization not found");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const goal = await createGoal({
        title: formData.title,
        description: formData.description,
        priority: formData.priority,
        timeline: formData.timeline || undefined,
        department: formData.department || undefined,
        assignee_id: formData.assignee_id || undefined,
        assignee_name: formData.assignee_name || undefined,
        reviewer_id: formData.reviewer_id || undefined,
        reviewer_name: formData.reviewer_name || undefined,
        organization_id: organization.id,
      });

      if (formData.generateTasks && goal.id) {
        await generateTasks(goal.id, 5);
      }

      setFormData({
        title: "", description: "", priority: "medium", timeline: "",
        department: "", assignee_id: "", assignee_name: "",
        reviewer_id: "", reviewer_name: "", generateTasks: true,
      });
      setDetectedDept(null);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to create goal");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 bg-background rounded-2xl border border-border shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Flag className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Create New Goal</h2>
              <p className="text-sm text-text-muted">AI auto-detects department &amp; suggests assignees</p>
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
            <label className="block text-sm font-medium mb-2">Goal Title <span className="text-red-400">*</span></label>
            <input type="text" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="e.g., Increase Q4 Revenue by 25%" className="w-full px-4 py-3 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Describe the goal and its expected outcomes..." rows={3} className="w-full px-4 py-3 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm resize-none" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2"><Flag className="w-4 h-4 inline mr-1" />Department <span className="text-[10px] text-text-muted">(AI detected &mdash; you can edit)</span></label>
            <div className="relative">
              <input type="text" value={formData.department} onChange={(e) => setFormData({ ...formData, department: e.target.value })} placeholder="Type or select department..." list="dept-list" className="w-full px-4 py-3 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm" />
              <datalist id="dept-list">
                {DEPARTMENTS.map((d) => <option key={d} value={d} />)}
              </datalist>
            </div>
            {analyzing && (
              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-primary">
                <Loader2 className="w-3 h-3 animate-spin" /> AI analyzing...
              </div>
            )}
            {detectedDept && !analyzing && formData.department === detectedDept && (
              <div className="flex items-center gap-1 mt-1.5 text-xs text-emerald-400">
                <CheckCircle2 className="w-3 h-3" /> AI detected: {detectedDept}
              </div>
            )}
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
              <label className="block text-sm font-medium mb-2"><Calendar className="w-4 h-4 inline mr-1" />Timeline</label>
              <select value={formData.timeline} onChange={(e) => setFormData({ ...formData, timeline: e.target.value })} className="w-full px-4 py-3 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm appearance-none cursor-pointer">
                <option value="">No deadline</option>
                <option value="1_week">1 Week</option>
                <option value="2_weeks">2 Weeks</option>
                <option value="1_month">1 Month</option>
                <option value="3_months">3 Months</option>
                <option value="6_months">6 Months</option>
                <option value="1_year">1 Year</option>
              </select>
            </div>
          </div>

          <PersonComboBox
            label="Defaulter (Assign to)"
            valueId={formData.assignee_id}
            valueName={formData.assignee_name}
            members={members}
            filterDept={formData.department || null}
            onChange={(id, name) => setFormData({ ...formData, assignee_id: id, assignee_name: name })}
          />
          {formData.assignee_id && (
            <p className="text-xs text-text-muted -mt-3">Task will be shown to this person in real-time</p>
          )}

          <PersonComboBox
            label="Reviewer"
            valueId={formData.reviewer_id}
            valueName={formData.reviewer_name}
            members={members}
            filterDept={formData.department || null}
            onChange={(id, name) => setFormData({ ...formData, reviewer_id: id, reviewer_name: name })}
          />

          <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/10">
            <input type="checkbox" id="generateTasks" checked={formData.generateTasks} onChange={(e) => setFormData({ ...formData, generateTasks: e.target.checked })} className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
            <label htmlFor="generateTasks" className="flex-1 cursor-pointer">
              <span className="text-sm font-medium">AI Generate Tasks</span>
              <p className="text-xs text-text-muted">Let AI create 5 initial tasks for this goal</p>
            </label>
            <Sparkles className="w-5 h-5 text-primary" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl glass hover:bg-surface-light text-foreground font-medium transition-all cursor-pointer">Cancel</button>
            <button type="submit" disabled={submitting || loading} className="flex-1 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</> : <><Sparkles className="w-4 h-4" /> Create Goal</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
