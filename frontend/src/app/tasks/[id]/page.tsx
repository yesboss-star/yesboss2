"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useUIStore } from "@/stores/uiStore";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useTaskStore } from "@/stores/taskStore";
import { useGoalStore } from "@/stores/goalStore";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Textarea, Avatar, AvatarFallback } from "@/components/ui";
import { 
  ArrowLeft, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Calendar,
  User,
  MessageSquare,
  Link2,
  Send,
  Loader2,
  Trash2,
  Edit
} from "lucide-react";

export default function TaskDetailPage() {
  const params = useParams();
  const taskId = params.id as string;
  const router = useRouter();
  const { user } = useAuth();
  const { setBreadcrumbs } = useUIStore();
  const { organization } = useOrganizationStore();
  const { currentTask, comments, fetchTaskWithComments, updateTask, completeTask, approveTask, deleteTask, addComment, loading } = useTaskStore();
  const { goals } = useGoalStore();
  
  const [newComment, setNewComment] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editStatus, setEditStatus] = useState("");

  useEffect(() => {
    setBreadcrumbs([
      { label: "Dashboard", href: "/dashboard" },
      { label: "Tasks", href: "/tasks" },
      { label: "Task Details" },
    ]);
  }, [setBreadcrumbs]);

  useEffect(() => {
    if (taskId && taskId !== "new") {
      fetchTaskWithComments(taskId);
    }
  }, [taskId, fetchTaskWithComments]);

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    setCommentLoading(true);
    try {
      await addComment(taskId, newComment);
      setNewComment("");
    } finally {
      setCommentLoading(false);
    }
  };

  const handleStatusChange = async (status: string) => {
    await updateTask(taskId, { status });
    setEditStatus("");
  };

  const handleComplete = async () => {
    await completeTask(taskId);
  };

  const handleApprove = async () => {
    await approveTask(taskId);
  };

  const handleDelete = async () => {
    if (confirm("Are you sure you want to delete this task?")) {
      await deleteTask(taskId);
      router.push("/tasks");
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

  const relatedGoal = currentTask?.goal_id ? goals.find(g => g.id === currentTask.goal_id) : null;
  const isOwner = (user as any)?.user_metadata?.role === "owner";
  const assigneeIds = Array.isArray(currentTask?.assignee_id) ? currentTask.assignee_id : (currentTask?.assignee_id ? [currentTask.assignee_id] : []);

  if (!currentTask && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  if (!currentTask) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h3 className="text-lg font-medium">Task not found</h3>
          <Button onClick={() => router.push("/tasks")} className="mt-4 cursor-pointer">
            Back to Tasks
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/tasks")}
            className="p-2 rounded-lg hover:bg-surface transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{currentTask.title}</h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getPriorityColor(currentTask.priority)}`}>
                {currentTask.priority}
              </span>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(currentTask.status)}`}>
                {currentTask.status.replace("_", " ")}
              </span>
              {relatedGoal && (
                <Badge variant="outline" className="cursor-pointer" onClick={() => router.push(`/goals/${relatedGoal.id}`)}>
                  {relatedGoal.title}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {currentTask.status !== "completed" && (
              <Button onClick={handleComplete} className="cursor-pointer">
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Complete
              </Button>
            )}
            {currentTask.status === "completed" && isOwner && (
              <Button onClick={handleApprove} variant="outline" className="cursor-pointer">
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Approve
              </Button>
            )}
            <Button variant="ghost" onClick={handleDelete} className="cursor-pointer text-red-400 hover:text-red-500">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-text-muted whitespace-pre-wrap">
                  {currentTask.description || "No description provided"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  Comments ({comments.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 mb-4">
                  {comments.map((comment) => (
                    <div key={comment.id} className="flex gap-3">
                      <Avatar className="w-8 h-8">
                        <AvatarFallback className="text-xs">
                          {comment.user_email?.[0]?.toUpperCase() || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{comment.user_email}</span>
                          <span className="text-xs text-text-muted">
                            {new Date(comment.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm text-text-muted mt-1">{comment.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Add a comment..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    className="min-h-[80px]"
                  />
                </div>
                <Button
                  onClick={handleAddComment}
                  disabled={commentLoading || !newComment.trim()}
                  className="mt-2 cursor-pointer"
                >
                  {commentLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Add Comment
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <User className="w-4 h-4 text-text-muted" />
                  <div>
                    <p className="text-xs text-text-muted">Created by</p>
                    <p className="text-sm">User</p>
                  </div>
                </div>
                {assigneeIds.length > 0 && (
                  <div className="flex items-start gap-3">
                    <User className="w-4 h-4 text-text-muted mt-0.5" />
                    <div>
                      <p className="text-xs text-text-muted">Assignees</p>
                      <div className="flex flex-col gap-1 mt-1">
                        {assigneeIds.map((aid) => (
                          <p key={aid} className="text-sm">{aid}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {currentTask.due_date && (
                  <div className="flex items-center gap-3">
                    <Calendar className="w-4 h-4 text-text-muted" />
                    <div>
                      <p className="text-xs text-text-muted">Due Date</p>
                      <p className="text-sm">{new Date(currentTask.due_date).toLocaleDateString()}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-text-muted" />
                  <div>
                    <p className="text-xs text-text-muted">Created</p>
                    <p className="text-sm">{new Date(currentTask.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                {currentTask.dependencies && currentTask.dependencies.length > 0 && (
                  <div className="flex items-start gap-3">
                    <Link2 className="w-4 h-4 text-text-muted mt-0.5" />
                    <div>
                      <p className="text-xs text-text-muted">Dependencies</p>
                      <p className="text-sm">{currentTask.dependencies.length} tasks</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Update Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {["pending", "in_progress", "completed"].map((status) => (
                  <Button
                    key={status}
                    variant={currentTask.status === status ? "default" : "outline"}
                    onClick={() => handleStatusChange(status)}
                    className="w-full justify-start capitalize cursor-pointer"
                    disabled={loading}
                  >
                    {status.replace("_", " ")}
                  </Button>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}