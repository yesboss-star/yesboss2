"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useGoalStore } from "@/stores/goalStore";
import { useOrgChartStore } from "@/stores/orgChartStore";
import { useOrganizationStore } from "@/stores/organizationStore";
import { X, Loader2, Sparkles, Calendar, Users, Flag, CheckCircle2, ChevronDown, Check, GitBranch, Clock } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
const DEPARTMENTS = ["Engineering", "Marketing", "Sales", "Operations", "Finance", "Human Resources", "Product", "Design", "Customer Support", "R&D", "Supply Chain", "Legal"];

function PersonMultiSelect({ label, valueIds, valueNames, members, filterDept, onChange }: {
  label: string;
  valueIds: string[];
  valueNames: string[];
  members: { id: string; email: string; full_name: string; department: string; role: string }[];
  filterDept?: string | null;
  onChange: (ids: string[], names: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
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

  const toggleMember = (email: string, name: string) => {
    if (valueIds.includes(email)) {
      onChange(valueIds.filter((id) => id !== email), valueNames.filter((n) => n !== name));
    } else {
      onChange([...valueIds, email], [...valueNames, name]);
    }
    setQuery("");
  };

  return (
    <div ref={ref} className="relative">
      <label className="block text-sm font-medium mb-2"><Users className="w-4 h-4 inline mr-1" />{label}</label>
      {valueIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {valueIds.map((id, i) => (
            <span key={id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 text-primary text-xs">
              {valueNames[i] || id}
              <button type="button" onClick={() => onChange(valueIds.filter((_, j) => j !== i), valueNames.filter((_, j) => j !== i))} className="cursor-pointer hover:text-primary-light">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Type name to search..."
          className="w-full px-4 py-3 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm pr-10"
        />
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-background border border-border rounded-xl shadow-2xl max-h-48 overflow-y-auto">
          {filtered.length > 0 ? (
            filtered.slice(0, 8).map((m) => {
              const selected = valueIds.includes(m.email);
              return (
                <button
                  key={m.email}
                  type="button"
                  onClick={() => toggleMember(m.email, m.full_name)}
                  className={`w-full text-left px-4 py-2.5 text-sm hover:bg-surface flex items-center gap-2 ${
                    selected ? "bg-primary/10 text-primary" : ""
                  }`}
                >
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                    selected ? "bg-primary border-primary" : "border-border"
                  }`}>
                    {selected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-medium text-primary flex-shrink-0">
                    {m.full_name.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{m.full_name}</p>
                    <p className="text-[10px] text-text-muted truncate">{m.email} &middot; {m.department || m.role}</p>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="p-3 text-xs text-text-muted">No matching members found</div>
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
  const { createGoal, loading } = useGoalStore();
  const { organization } = useOrganizationStore();
  const { members, fetchOrgMembers } = useOrgChartStore();
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "medium",
    timeline: "",
    due_date: "",
    department: "",
    assignee_id: [] as string[],
    assignee_name: [] as string[],
    reviewer_id: [] as string[],
    reviewer_name: [] as string[],
    goal_type: "short_term" as "short_term" | "long_term",
    duration: "one_time" as "one_time" | "continuous",
    end_date: "",
    parent_goal_id: "",
    parent_goal_title: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [detectedDept, setDetectedDept] = useState<string | null>(null);
  const [existingGoals, setExistingGoals] = useState<Array<{ id: string; title: string; goal_type?: string }>>([]);
  const [parentSearchOpen, setParentSearchOpen] = useState(false);
  const [parentQuery, setParentQuery] = useState("");
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (parentRef.current && !parentRef.current.contains(e.target as Node)) setParentSearchOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (isOpen && organization?.id) {
      fetch(`${API_URL}/goals?organization_id=${organization.id}&limit=50`)
        .then((r) => r.json())
        .then((data) => setExistingGoals((data.goals || []).map((g: any) => ({ id: g._id || g.id, title: g.title, goal_type: g.goal_type }))))
        .catch(() => {});
    }
  }, [isOpen, organization?.id]);

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
      await createGoal({
        title: formData.title,
        description: formData.description,
        priority: formData.priority,
        timeline: formData.timeline || undefined,
        due_date: formData.due_date || undefined,
        department: formData.department || undefined,
        assignee_id: formData.assignee_id.length > 0 ? formData.assignee_id : undefined,
        assignee_name: formData.assignee_name.length > 0 ? formData.assignee_name : undefined,
        reviewer_id: formData.reviewer_id.length > 0 ? formData.reviewer_id : undefined,
        reviewer_name: formData.reviewer_name.length > 0 ? formData.reviewer_name : undefined,
        organization_id: organization.id,
        goal_type: formData.goal_type,
        duration: formData.duration,
        end_date: formData.end_date || undefined,
        parent_goal_id: formData.parent_goal_id || undefined,
      });

      setFormData({
        title: "", description: "", priority: "medium", timeline: "",
        due_date: "",
        department: "", assignee_id: [], assignee_name: [],
        reviewer_id: [], reviewer_name: [],
        goal_type: "short_term", duration: "one_time", end_date: "",
        parent_goal_id: "", parent_goal_title: "",
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
              <label className="block text-sm font-medium mb-2"><Calendar className="w-4 h-4 inline mr-1" />Deadline</label>
              <input type="date" value={formData.due_date} onChange={(e) => setFormData({ ...formData, due_date: e.target.value })} className="w-full px-4 py-3 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2"><GitBranch className="w-4 h-4 inline mr-1" />Goal Type</label>
              <select value={formData.goal_type} onChange={(e) => setFormData({ ...formData, goal_type: e.target.value as "short_term" | "long_term" })} className="w-full px-4 py-3 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm appearance-none cursor-pointer">
                <option value="short_term">Short Term</option>
                <option value="long_term">Long Term</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2"><Clock className="w-4 h-4 inline mr-1" />Duration</label>
              <select value={formData.duration} onChange={(e) => setFormData({ ...formData, duration: e.target.value as "one_time" | "continuous" })} className="w-full px-4 py-3 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm appearance-none cursor-pointer">
                <option value="one_time">One Time</option>
                <option value="continuous">Continuous</option>
              </select>
            </div>
          </div>

          {formData.duration === "continuous" && (
            <div>
              <label className="block text-sm font-medium mb-2"><Calendar className="w-4 h-4 inline mr-1" />End Date (optional for continuous)</label>
              <input type="date" value={formData.end_date} onChange={(e) => setFormData({ ...formData, end_date: e.target.value })} className="w-full px-4 py-3 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm" />
            </div>
          )}

          <div ref={parentRef} className="relative">
            <label className="block text-sm font-medium mb-2"><GitBranch className="w-4 h-4 inline mr-1" />Parent Goal (optional — makes this a sub-goal)</label>
            {formData.parent_goal_id && (
              <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg bg-primary/10 text-primary text-sm">
                <span>Sub-goal of: {formData.parent_goal_title}</span>
                <button type="button" onClick={() => setFormData({ ...formData, parent_goal_id: "", parent_goal_title: "" })} className="ml-auto cursor-pointer hover:text-primary-light">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            {!formData.parent_goal_id && (
              <div className="relative">
                <input
                  type="text"
                  value={parentQuery}
                  onChange={(e) => { setParentQuery(e.target.value); setParentSearchOpen(true); }}
                  onFocus={() => setParentSearchOpen(true)}
                  placeholder="Search existing goals..."
                  className="w-full px-4 py-3 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm"
                />
                {parentSearchOpen && (
                  <div className="absolute z-50 mt-1 w-full bg-background border border-border rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                    {existingGoals
                      .filter((g) => g.title.toLowerCase().includes(parentQuery.toLowerCase()) && g.id !== formData.parent_goal_id)
                      .slice(0, 8)
                      .map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => { setFormData({ ...formData, parent_goal_id: g.id, parent_goal_title: g.title }); setParentSearchOpen(false); setParentQuery(""); }}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface flex items-center gap-2"
                        >
                          <GitBranch className="w-4 h-4 text-text-muted flex-shrink-0" />
                          <span className="truncate">{g.title}</span>
                          {g.goal_type && <span className="text-[10px] text-text-muted ml-auto capitalize">{g.goal_type.replace("_", " ")}</span>}
                        </button>
                      ))}
                    {existingGoals.filter((g) => g.title.toLowerCase().includes(parentQuery.toLowerCase())).length === 0 && (
                      <div className="p-3 text-xs text-text-muted">No goals found</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <PersonMultiSelect
            label="Defaulter (Assign to)"
            valueIds={formData.assignee_id}
            valueNames={formData.assignee_name}
            members={members}
            filterDept={formData.department || null}
            onChange={(ids, names) => setFormData({ ...formData, assignee_id: ids, assignee_name: names })}
          />
          {formData.assignee_id.length > 0 && (
            <p className="text-xs text-text-muted -mt-3">Tasks will be shown to these people in real-time</p>
          )}

          <PersonMultiSelect
            label="Reviewer"
            valueIds={formData.reviewer_id}
            valueNames={formData.reviewer_name}
            members={members}
            filterDept={formData.department || null}
            onChange={(ids, names) => setFormData({ ...formData, reviewer_id: ids, reviewer_name: names })}
          />

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
