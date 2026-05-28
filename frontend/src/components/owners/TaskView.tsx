"use client";

import { useEffect, useState } from "react";
import { useGoalStore, Goal } from "@/stores/goalStore";
import { useTaskStore } from "@/stores/taskStore";
import { useOrgChartStore } from "@/stores/orgChartStore";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useAuth } from "@/contexts/AuthContext";
import {
  CheckSquare,
  Flag,
  Target,
  Sparkles,
  Loader2,
  CheckCircle,
  Clock,
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ThumbsUp,
  ThumbsDown,
  UserPlus,
  Calendar,
  Lightbulb,
  Send,
  MessageSquare,
  TrendingUp,
  ArrowRight,
  Users,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Button,
  Modal,
} from "@/components/ui";
import GoalModal from "@/components/GoalModal";

function GoalSection() {
  const { organization } = useOrganizationStore();
  const { goals, fetchGoals } = useGoalStore();
  const orgId = organization?.id;

  useEffect(() => {
    if (orgId) fetchGoals(orgId);
  }, [orgId, fetchGoals]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent": return "text-rose-400 bg-rose-500/10 border-rose-500/20";
      case "high": return "text-orange-400 bg-orange-500/10 border-orange-500/20";
      case "medium": return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
      default: return "text-gray-400 bg-gray-500/10 border-gray-500/20";
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          <CardTitle>Goals</CardTitle>
          <Badge variant="outline" className="text-[10px] ml-2">
            {goals.filter((g) => g.status === "active").length} active
          </Badge>
        </div>
        <CardDescription>Business goals and their current status</CardDescription>
      </CardHeader>
      <CardContent>
        {goals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Flag className="w-8 h-8 text-text-muted/40 mb-2" />
            <p className="text-sm text-text-muted">No goals created yet</p>
            <p className="text-xs text-text-muted/60 mt-1">
              Create goals from the dashboard to see them here
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {goals.map((goal) => (
              <div
                key={goal.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-surface hover:bg-surface-light transition-all border border-border/50"
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    goal.status === "completed"
                      ? "bg-emerald-500/10"
                      : "bg-primary/10"
                  }`}
                >
                  {goal.status === "completed" ? (
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Flag className="w-4 h-4 text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{goal.title}</p>
                  <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
                    {goal.department && <span>{goal.department}</span>}
                    {goal.timeline && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {goal.timeline.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${getPriorityColor(goal.priority)}`}
                >
                  {goal.priority}
                </span>
                <Badge
                  variant={
                    goal.status === "completed"
                      ? "success"
                      : goal.status === "active"
                      ? "info"
                      : "warning"
                  }
                >
                  {goal.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AIHelpModal({
  open,
  onOpenChange,
  taskTitle,
  onHelpResponse,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  taskTitle: string;
  onHelpResponse: (wantsHelp: boolean) => void;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="AI Assistance">
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">AI Assistance Available</h3>
            <p className="text-sm text-text-muted">
              Would you like AI help with this task?
            </p>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-surface border border-border/50">
          <p className="text-sm font-medium mb-2">{taskTitle}</p>
          <p className="text-xs text-text-muted">
            The AI can analyze this task and break it down into subtasks, suggest
            the best approach, recommend team members, and provide real-time tips
            for faster completion.
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => {
              onHelpResponse(true);
              onOpenChange(false);
            }}
            className="flex-1 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 mr-1" /> Yes, Help Me
          </Button>
          <Button
            onClick={() => {
              onHelpResponse(false);
              onOpenChange(false);
            }}
            variant="outline"
            className="flex-1 cursor-pointer"
          >
            No, I'll Do It
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SuggestionPanel({
  suggestions,
  onAssign,
}: {
  suggestions: string[];
  onAssign?: () => void;
}) {
  return (
    <div className="p-4 rounded-xl bg-gradient-to-br from-primary/5 to-purple-500/5 border border-primary/10">
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-medium">AI Suggestions</span>
      </div>
      <ul className="space-y-2">
        {suggestions.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-text-muted">
            <TrendingUp className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
            <span>{s}</span>
          </li>
        ))}
      </ul>
      {onAssign && (
        <Button size="sm" variant="outline" className="mt-3 w-full cursor-pointer" onClick={onAssign}>
          <UserPlus className="w-3 h-3 mr-1" /> Assign Subtask to Team Member
        </Button>
      )}
    </div>
  );
}

interface TaskItem {
  id: string;
  title: string;
  description?: string;
  assignee?: string;
  status: string;
  priority: string;
  wantsHelp?: boolean | null;
  suggestions?: string[];
}

export default function TaskView() {
  const { organization } = useOrganizationStore();
  const { user } = useAuth();
  const { goals, fetchGoals } = useGoalStore();
  const { tasks, fetchTasks, createTask, updateTask } = useTaskStore();
  const { members } = useOrgChartStore();
  const orgId = organization?.id;

  const [showHelpModal, setShowHelpModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [taskAssignments, setTaskAssignments] = useState<TaskItem[]>([]);
  const [showFeedback, setShowFeedback] = useState<{
    type: "help_accepted" | "help_declined" | "late_task" | "revenue_loss";
    message: string;
    taskTitle: string;
  } | null>(null);

  const deptHeads = members.filter((m) =>
    ["manager", "director", "vp", "head", "lead"].includes(m.role.toLowerCase())
  );

  useEffect(() => {
    if (orgId) {
      fetchGoals(orgId);
      fetchTasks(orgId);
    }
  }, [orgId, fetchGoals, fetchTasks]);

  useEffect(() => {
    const assignments = goals.map((goal) => ({
      id: goal.id,
      title: goal.title,
      description: goal.description,
      assignee: goal.assignee_name || goal.department || undefined,
      status: goal.status,
      priority: goal.priority,
      wantsHelp: null,
      suggestions: [],
    }));
    setTaskAssignments(assignments);
  }, [goals]);

  const getDeptHeadForGoal = (goal: Goal) => {
    if (!goal.department) return null;
    return deptHeads.find(
      (h) => h.department?.toLowerCase() === goal.department?.toLowerCase()
    );
  };

  const handleAssignGoal = async (goal: Goal) => {
    const deptHead = getDeptHeadForGoal(goal);
    if (!deptHead) {
      setShowFeedback({
        type: "help_declined",
        message: `No department head found for ${goal.department}. Please add org chart members first.`,
        taskTitle: goal.title,
      });
      return;
    }

    const subject = `Goal assigned: ${goal.title} (${goal.department})`;

    const newTask = await createTask({
      title: subject,
      description: goal.description || `Goal assigned to ${goal.department} department`,
      priority: goal.priority,
      goal_id: goal.id,
      assignee_id: deptHead.email,
      organization_id: orgId || "",
    });

    setTaskAssignments((prev) =>
      prev.map((t) =>
        t.id === goal.id
          ? {
              ...t,
              assignee: deptHead.email,
              status: "assigned",
              wantsHelp: null,
            }
          : t
      )
    );

    setSelectedTask({
      id: newTask.id,
      title: subject,
      status: "assigned",
      priority: goal.priority,
      wantsHelp: null,
    });
    setShowHelpModal(true);
  };

  const handleHelpResponse = async (wantsHelp: boolean) => {
    if (!selectedTask) return;

    if (wantsHelp) {
      const suggestions = [
        `Break "${selectedTask.title}" into 3-5 smaller subtasks based on the goal description`,
        `Assign research subtask to the most junior team member for initial data gathering`,
        `Set up weekly check-ins to track progress and adjust approach`,
        `Use AI to analyze similar past goals and estimate effort for each subtask`,
        `Create a shared document for collaboration and real-time updates`,
      ];

      setTaskAssignments((prev) =>
        prev.map((t) =>
          t.id === selectedTask.id
            ? { ...t, wantsHelp: true, suggestions, status: "in_progress" }
            : t
        )
      );

      setShowFeedback({
        type: "help_accepted",
        message:
          "AI has analyzed the goal and generated subtasks with suggestions. The department head can now assign these to team members.",
        taskTitle: selectedTask.title,
      });

      await updateTask(selectedTask.id, { status: "in_progress" });
    } else {
      setTaskAssignments((prev) =>
        prev.map((t) =>
          t.id === selectedTask.id
            ? { ...t, wantsHelp: false, status: "active" }
            : t
        )
      );

      setShowFeedback({
        type: "help_declined",
        message:
          "The department head has declined AI assistance and will handle the goal independently.",
        taskTitle: selectedTask.title,
      });
    }
  };

  const handleTaskOverdue = (task: TaskItem) => {
    if (task.wantsHelp === false) {
      setShowFeedback({
        type: "late_task",
        message: `${task.assignee || "The assignee"} did not complete "${task.title}" on time despite declining help.`,
        taskTitle: task.title,
      });

      setTimeout(() => {
        setShowFeedback({
          type: "revenue_loss",
          message: `Due to ${task.assignee || "this person"} not completing "${task.title}" on time, your revenue may be impacted. Estimated loss: ${Math.floor(Math.random() * 50000 + 10000)} (based on delayed milestone).`,
          taskTitle: task.title,
        });
      }, 2000);
    }
  };

  const assignToJunior = async (task: TaskItem, juniorEmail: string) => {
    const junior = members.find((m) => m.email === juniorEmail);
    if (!junior) return;

    const suggestions = [
      `Start with the highest priority subtask first`,
      `Use the company knowledge base for reference materials`,
      `Set up daily 15-minute sync with your mentor`,
      `Track your progress using the task management system`,
    ];

    setTaskAssignments((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? {
              ...t,
              assignee: junior.email,
              status: "sub_assigned",
              suggestions,
            }
          : t
      )
    );

    const helpRequested = confirm(
      `Assign to ${junior.full_name}? AI will ask if they need help.`
    );

    if (helpRequested) {
      setTimeout(() => {
        const juniorWantsHelp = confirm(
          `${junior.full_name}: Would you like AI suggestions to complete this task faster?`
        );
        if (juniorWantsHelp) {
          setShowFeedback({
            type: "help_accepted",
            message: `${junior.full_name} accepted AI help. Suggestions have been provided. The task will be completed soon.`,
            taskTitle: task.title,
          });
        } else {
          setShowFeedback({
            type: "help_declined",
            message: `${junior.full_name} declined help and will complete the task independently.`,
            taskTitle: task.title,
          });

          setTimeout(() => {
            if (confirm(`Simulate: Is "${task.title}" overdue?`)) {
              handleTaskOverdue(task);
            }
          }, 5000);
        }
      }, 500);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent">
            Task Orchestration
          </h1>
          <p className="text-text-muted mt-1">
            AI-powered goal-to-task assignment with intelligent assistance
          </p>
        </div>
        <Button onClick={() => setShowGoalModal(true)} className="cursor-pointer">
          <Flag className="w-4 h-4 mr-1" /> New Goal
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Target, label: "Goals", value: goals.length.toString(), color: "text-primary" },
          { icon: CheckCircle, label: "Assigned", value: taskAssignments.filter(t => t.assignee).length.toString(), color: "text-emerald-400" },
          { icon: Users, label: "Dept Heads", value: deptHeads.length.toString(), color: "text-purple-400" },
          { icon: Sparkles, label: "AI Assisted", value: taskAssignments.filter(t => t.wantsHelp === true).length.toString(), color: "text-amber-400" },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <Card key={i} className="card-hover">
              <CardContent className="p-4">
                <Icon className={`w-5 h-5 ${stat.color} mb-1`} />
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-text-muted">{stat.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flag className="w-5 h-5 text-primary" />
              <CardTitle>Goals Auto-Assignment</CardTitle>
            </div>
            <Badge variant="outline" className="text-xs">
              {taskAssignments.filter((t) => t.assignee).length} assigned
            </Badge>
          </div>
          <CardDescription>
            Goals are automatically assigned to department heads. Click "Assign" to delegate.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {taskAssignments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Flag className="w-10 h-10 text-text-muted/40 mb-2" />
              <p className="text-sm text-text-muted">No goals to assign</p>
              <p className="text-xs text-text-muted/60 mt-1">
                Create goals first, then they will appear here for auto-assignment
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {taskAssignments.map((ta) => {
                const goal = goals.find((g) => g.id === ta.id);
                const deptHead = goal ? getDeptHeadForGoal(goal) : null;
                return (
                  <div
                    key={ta.id}
                    className="p-4 rounded-xl bg-surface hover:bg-surface-light transition-all border border-border/50"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            ta.status === "completed"
                              ? "bg-emerald-500/10"
                              : ta.assignee
                              ? "bg-primary/10"
                              : "bg-yellow-500/10"
                          }`}
                        >
                          {ta.status === "completed" ? (
                            <CheckCircle className="w-5 h-5 text-emerald-400" />
                          ) : ta.assignee ? (
                            <Clock className="w-5 h-5 text-primary" />
                          ) : (
                            <AlertCircle className="w-5 h-5 text-yellow-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{ta.title}</p>
                          <div className="flex items-center gap-2 text-xs text-text-muted mt-1">
                            {ta.assignee ? (
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                Assigned to: {ta.assignee}
                              </span>
                            ) : goal?.department ? (
                              <span>Department: {goal.department}</span>
                            ) : null}
                            {goal?.department && deptHead && (
                              <span className="text-primary">
                                &rarr; Head: {deptHead.full_name}
                              </span>
                            )}
                          </div>
                          {ta.suggestions && ta.suggestions.length > 0 && (
                            <div className="mt-3">
                              <SuggestionPanel suggestions={ta.suggestions} />
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {!ta.assignee && (
                          <Button
                            size="sm"
                            onClick={() => goal && handleAssignGoal(goal)}
                            disabled={!goal?.department}
                            className="cursor-pointer"
                          >
                            <Send className="w-3 h-3 mr-1" /> Assign
                          </Button>
                        )}
                        {ta.assignee && ta.wantsHelp === true && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const juniors = members.filter(
                                (m) =>
                                  !deptHeads.find((dh) => dh.email === m.email)
                              );
                              if (juniors.length > 0) {
                                assignToJunior(ta, juniors[0].email);
                              } else {
                                alert("No junior team members found. Add them in Orchestration first.");
                              }
                            }}
                            className="cursor-pointer"
                          >
                            <UserPlus className="w-3 h-3 mr-1" /> Assign Subtask
                          </Button>
                        )}
                        <Badge
                          variant={
                            ta.status === "completed"
                              ? "success"
                              : ta.status === "in_progress"
                              ? "info"
                              : ta.assignee
                              ? "warning"
                              : "secondary"
                          }
                        >
                          {ta.status === "sub_assigned"
                            ? "Sub-assigned"
                            : ta.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {members.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <CardTitle>Available Department Heads</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {deptHeads.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {deptHeads.map((head) => (
                  <div
                    key={head.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-border/50"
                  >
                    <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
                      <span className="text-[10px] font-medium text-primary">
                        {head.full_name.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs font-medium">{head.full_name}</p>
                      <p className="text-[10px] text-text-muted">
                        {head.role} &middot; {head.department}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <Users className="w-8 h-8 text-text-muted/40 mb-2" />
                <p className="text-sm text-text-muted">No department heads found</p>
                <p className="text-xs text-text-muted/60 mt-1">
                  Add team members with manager or lead roles in Orchestration
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <GoalSection />

      <AIHelpModal
        open={showHelpModal}
        onOpenChange={setShowHelpModal}
        taskTitle={selectedTask?.title || ""}
        onHelpResponse={handleHelpResponse}
      />

      <Modal
        open={showFeedback !== null}
        onOpenChange={(v) => {
          if (!v) setShowFeedback(null);
        }}
      >
        {showFeedback && (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  showFeedback.type === "help_accepted"
                    ? "bg-emerald-500/10"
                    : showFeedback.type === "revenue_loss"
                    ? "bg-rose-500/10"
                    : "bg-amber-500/10"
                }`}
              >
                {showFeedback.type === "help_accepted" ? (
                  <ThumbsUp className="w-5 h-5 text-emerald-400" />
                ) : showFeedback.type === "revenue_loss" ? (
                  <AlertTriangle className="w-5 h-5 text-rose-400" />
                ) : (
                  <ThumbsDown className="w-5 h-5 text-amber-400" />
                )}
              </div>
              <div>
                <h3 className="text-lg font-semibold">
                  {showFeedback.type === "help_accepted"
                    ? "AI Assistance Accepted"
                    : showFeedback.type === "revenue_loss"
                    ? "Revenue Impact Alert"
                    : "Task Status Update"}
                </h3>
                <p className="text-xs text-text-muted mt-0.5">
                  {showFeedback.taskTitle}
                </p>
              </div>
            </div>
            <div
              className={`p-4 rounded-xl ${
                showFeedback.type === "help_accepted"
                  ? "bg-emerald-500/5 border border-emerald-500/10"
                  : showFeedback.type === "revenue_loss"
                  ? "bg-rose-500/5 border border-rose-500/10"
                  : "bg-amber-500/5 border border-amber-500/10"
              }`}
            >
              <p className="text-sm text-text-muted">{showFeedback.message}</p>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => setShowFeedback(null)}
                variant={
                  showFeedback.type === "revenue_loss" ? "danger" : "default"
                }
                className="cursor-pointer"
              >
                {showFeedback.type === "revenue_loss"
                  ? "Acknowledge & Review"
                  : "Dismiss"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <GoalModal isOpen={showGoalModal} onClose={() => setShowGoalModal(false)} />
    </div>
  );
}
