"use client";

import { useState } from "react";
import { useGoalStore } from "@/stores/goalStore";
import { useOrganizationStore } from "@/stores/organizationStore";
import { X, Loader2, Sparkles, Calendar, Users, Flag, FileText } from "lucide-react";

interface GoalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function GoalModal({ isOpen, onClose }: GoalModalProps) {
  const { createGoal, generateTasks, loading } = useGoalStore();
  const { organization } = useOrganizationStore();
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "medium",
    timeline: "",
    department: "",
    generateTasks: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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
        organization_id: organization.id,
      });

      if (formData.generateTasks && goal.id) {
        await generateTasks(goal.id, 5);
      }

      setFormData({
        title: "",
        description: "",
        priority: "medium",
        timeline: "",
        department: "",
        generateTasks: true,
      });
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
              <p className="text-sm text-text-muted">Set objectives for your team</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface transition-colors cursor-pointer"
          >
            <X className="w-5 h-5 text-text-muted" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">
              Goal Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Increase Q4 Revenue by 25%"
              className="w-full px-4 py-3 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe the goal and its expected outcomes..."
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                <Flag className="w-4 h-4 inline mr-1" />
                Priority
              </label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="w-full px-4 py-3 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm appearance-none cursor-pointer"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                <Calendar className="w-4 h-4 inline mr-1" />
                Timeline
              </label>
              <select
                value={formData.timeline}
                onChange={(e) => setFormData({ ...formData, timeline: e.target.value })}
                className="w-full px-4 py-3 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm appearance-none cursor-pointer"
              >
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

          <div>
            <label className="block text-sm font-medium mb-2">
              <Users className="w-4 h-4 inline mr-1" />
              Department
            </label>
            <select
              value={formData.department}
              onChange={(e) => setFormData({ ...formData, department: e.target.value })}
              className="w-full px-4 py-3 rounded-xl bg-surface border border-border focus:border-primary focus:outline-none text-sm appearance-none cursor-pointer"
            >
              <option value="">General / All</option>
              <option value="sales">Sales</option>
              <option value="marketing">Marketing</option>
              <option value="engineering">Engineering</option>
              <option value="operations">Operations</option>
              <option value="finance">Finance</option>
              <option value="hr">Human Resources</option>
              <option value="product">Product</option>
              <option value="design">Design</option>
            </select>
          </div>

          <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/10">
            <input
              type="checkbox"
              id="generateTasks"
              checked={formData.generateTasks}
              onChange={(e) => setFormData({ ...formData, generateTasks: e.target.checked })}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
            />
            <label htmlFor="generateTasks" className="flex-1 cursor-pointer">
              <span className="text-sm font-medium">AI Generate Tasks</span>
              <p className="text-xs text-text-muted">
                Let AI create 5 initial tasks for this goal
              </p>
            </label>
            <Sparkles className="w-5 h-5 text-primary" />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl glass hover:bg-surface-light text-foreground font-medium transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || loading}
              className="flex-1 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Create Goal
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}