"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTaskStore, Task } from "@/stores/taskStore";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useAuth } from "@/contexts/AuthContext";
import { 
  CheckCircle2, 
  Circle, 
  Clock, 
  AlertCircle, 
  MoreVertical,
  MessageSquare,
  Users,
  ArrowRight,
  Loader2,
  Calendar,
  Link2
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Avatar, AvatarFallback } from "@/components/ui";

interface TaskCardProps {
  task: Task;
  showGoal?: boolean;
  onStatusChange?: (taskId: string, status: string) => void;
}

export default function TaskCard({ task, showGoal = false, onStatusChange }: TaskCardProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { completeTask, approveTask, loading } = useTaskStore();
  const { organization } = useOrganizationStore();
  const [showActions, setShowActions] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
      case "in_progress":
        return <Clock className="w-5 h-5 text-blue-400" />;
      case "pending":
        return <Circle className="w-5 h-5 text-gray-400" />;
      case "approved":
        return <CheckCircle2 className="w-5 h-5 text-purple-400" />;
      default:
        return <Circle className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "in_progress": return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "pending": return "bg-gray-500/10 text-gray-400 border-gray-500/20";
      case "approved": return "bg-purple-500/10 text-purple-400 border-purple-500/20";
      case "rejected": return "bg-red-500/10 text-red-400 border-red-500/20";
      default: return "bg-gray-500/10 text-gray-400 border-gray-500/20";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent": return "bg-red-500/10 text-red-400";
      case "high": return "bg-orange-500/10 text-orange-400";
      case "medium": return "bg-yellow-500/10 text-yellow-400";
      default: return "bg-gray-500/10 text-gray-400";
    }
  };

  const handleComplete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setActionLoading(true);
    try {
      await completeTask(task.id);
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setActionLoading(true);
    try {
      await approveTask(task.id);
    } finally {
      setActionLoading(false);
    }
  };

  const isOwner = user?.user_metadata?.role === "owner";

  return (
    <div 
      className="group relative p-4 rounded-xl bg-surface hover:bg-surface-light border border-transparent hover:border-border transition-all cursor-pointer"
      onClick={() => router.push(`/tasks/${task.id}`)}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={handleComplete}
          disabled={actionLoading || task.status === "completed"}
          className="mt-0.5 flex-shrink-0 cursor-pointer disabled:cursor-not-allowed"
        >
          {actionLoading ? (
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
          ) : (
            getStatusIcon(task.status)
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className={`font-medium text-sm ${task.status === "completed" ? "line-through text-text-muted" : ""}`}>
              {task.title}
            </h3>
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowActions(!showActions);
                }}
                className="p-1 rounded hover:bg-background transition-colors cursor-pointer"
              >
                <MoreVertical className="w-4 h-4 text-text-muted" />
              </button>
              {showActions && (
                <div className="absolute right-0 top-8 w-36 bg-background rounded-lg border border-border shadow-lg z-10 py-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/tasks/${task.id}`);
                      setShowActions(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-surface flex items-center gap-2 cursor-pointer"
                  >
                    <ArrowRight className="w-4 h-4" />
                    View Details
                  </button>
                  {task.status === "completed" && isOwner && (
                    <button
                      onClick={handleApprove}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-surface flex items-center gap-2 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Approve
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {task.description && (
            <p className="text-xs text-text-muted mt-1 line-clamp-2">{task.description}</p>
          )}

          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(task.priority)}`}>
              {task.priority}
            </span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getStatusColor(task.status)}`}>
              {task.status.replace("_", " ")}
            </span>
            {task.due_date && (
              <span className="flex items-center gap-1 text-xs text-text-muted">
                <Calendar className="w-3 h-3" />
                {new Date(task.due_date).toLocaleDateString()}
              </span>
            )}
            {task.dependencies && task.dependencies.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-text-muted">
                <Link2 className="w-3 h-3" />
                {task.dependencies.length} deps
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}