"use client";

import { useEffect, useState } from "react";
import { useOrgChartStore, OrgMember } from "@/stores/orgChartStore";
import { useTaskStore } from "@/stores/taskStore";
import { useGoalStore } from "@/stores/goalStore";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useAuth } from "@/contexts/AuthContext";
import {
  Share2,
  Upload,
  UserPlus,
  Mail,
  Loader2,
  Plus,
  Minus,
  Trash2,
  Send,
  ArrowRight,
  CheckCircle,
  AlertCircle,
  FileSpreadsheet,
  FileText,
  X,
  UserCheck,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Button,
  Input,
  Select,
  Modal,
} from "@/components/ui";

function TreeNode({
  node,
  onAdd,
  onDelete,
}: {
  node: OrgMember;
  onAdd: (parentEmail: string) => void;
  onDelete: (memberId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;

  const getRoleColor = (role: string) => {
    switch (role.toLowerCase()) {
      case "ceo":
      case "founder":
      case "owner":
        return "text-purple-400 bg-purple-500/10 border-purple-500/20";
      case "cto":
      case "cfo":
      case "coo":
      case "cxo":
        return "text-primary bg-primary/10 border-primary/20";
      case "vp":
      case "director":
      case "head":
        return "text-amber-400 bg-amber-500/10 border-amber-500/20";
      case "manager":
      case "lead":
        return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
      default:
        return "text-gray-400 bg-gray-500/10 border-gray-500/20";
    }
  };

  const isRoot =
    node.role?.toLowerCase() === "ceo" ||
    node.role?.toLowerCase() === "founder" ||
    node.role?.toLowerCase() === "owner";

  return (
    <div className="flex items-start gap-0">
      {/* Node Card */}
      <div className="relative group flex-shrink-0">
        <div
          className={`relative w-44 p-2.5 rounded-lg border transition-all duration-200 ${
            isRoot
              ? "bg-gradient-to-br from-primary/10 to-purple-500/10 border-primary/30"
              : "bg-surface/80 border-border/50 hover:border-primary/30"
          }`}
        >
          {/* Role + Department at top */}
          <div className="flex items-center gap-1 flex-wrap mb-1.5">
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${getRoleColor(node.role)}`}>
              {node.role}
            </span>
            {node.department && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-surface border border-border/50 text-text-muted">
                {node.department}
              </span>
            )}
          </div>
          {/* Avatar + Name + Email */}
          <div className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
                isRoot
                  ? "bg-gradient-to-br from-primary to-purple-500"
                  : "bg-gradient-to-br from-primary/30 to-purple-500/30"
              }`}
            >
              <span className="text-xs font-bold text-white">{node.full_name?.charAt(0) || "?"}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate">{node.full_name}</p>
              <p className="text-[9px] text-text-muted truncate">{node.email}</p>
            </div>
          </div>
          {/* Hover actions: add / remove */}
          <div className="absolute -top-1.5 -right-1.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); onAdd(node.email); }}
              className="w-4 h-4 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/80 transition-all hover:scale-110 cursor-pointer shadow-sm"
              title="Add direct report"
            >
              <Plus className="w-2.5 h-2.5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}
              className="w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center hover:bg-rose-600 transition-all hover:scale-110 cursor-pointer shadow-sm"
              title="Remove member"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
          {/* Expand/Collapse toggle (between card and children line) */}
          {hasChildren && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="absolute -right-1.5 top-1/2 -translate-y-1/2 translate-x-full w-4 h-4 rounded-full bg-surface border border-border flex items-center justify-center hover:bg-primary/10 hover:border-primary/30 transition-all z-10 cursor-pointer shadow-sm"
            >
              {expanded ? (
                <Minus className="w-2.5 h-2.5 text-text-muted" />
              ) : (
                <Plus className="w-2.5 h-2.5 text-primary" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Children branch to the right */}
      {hasChildren && expanded && (
        <div className="flex items-stretch ml-0.5">
          {/* Horizontal connector from card edge to vertical bar */}
          <div className="w-3 flex items-center">
            <div className="h-px bg-border/50 w-full" />
          </div>
          {/* Vertical bar + children */}
          <div className="border-l border-border/50 pl-3 flex flex-col gap-1.5">
            {node.children!.map((child, i) => (
              <div key={child.id || i} className="relative">
                {/* Horizontal connector from vertical bar to child card */}
                <div className="absolute left-0 top-1/2 -translate-x-full w-3 h-px bg-border/50" />
                <TreeNode node={child} onAdd={onAdd} onDelete={onDelete} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrchestrationView() {
  const { tree, members, loading, fetchOrgTree, uploadFile, addMember, deleteMember } =
    useOrgChartStore();
  const { organization } = useOrganizationStore();
  const { user } = useAuth();
  const { createTask, fetchTasks } = useTaskStore();
  const { createGoal } = useGoalStore();

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [addChildFor, setAddChildFor] = useState<string | null>(null);
  const [existingOrgTask, setExistingOrgTask] = useState<{
    assignee_email: string;
    assignee_name: string;
    status: string;
  } | null>(null);

  const [uploadResult, setUploadResult] = useState<{
    inserted: number;
    errors: string[];
  } | null>(null);

  const [manualForm, setManualForm] = useState({
    email: "",
    full_name: "",
    role: "employee",
    department: "",
    manager_email: "",
  });

  const [nameSuggestions, setNameSuggestions] = useState<OrgMember[]>([]);
  const [emailSuggestions, setEmailSuggestions] = useState<OrgMember[]>([]);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const [showEmailSuggestions, setShowEmailSuggestions] = useState(false);

  const [assignForm, setAssignForm] = useState({
    assignee_email: "",
    message: "",
  });

  const [addMethod, setAddMethod] = useState<"upload" | "manual" | "assign" | null>(null);

  useEffect(() => {
    fetchOrgTree(organization?.id);
  }, [fetchOrgTree, organization?.id]);

  useEffect(() => {
    if (!organization?.id) return;
    fetchTasks(organization.id).then(() => {
      const { tasks } = useTaskStore.getState();
      const orgTask = tasks.find(
        (t) =>
          t.title.includes("Build organization chart") &&
          t.assignee_id &&
          t.status !== "completed" &&
          t.status !== "cancelled"
      );
      if (orgTask) {
        const matched = members.find((m) => m.email === orgTask.assignee_id);
        setExistingOrgTask({
          assignee_email: orgTask.assignee_id || "",
          assignee_name: matched?.full_name || orgTask.assignee_id || "",
          status: orgTask.status,
        });
      } else {
        setExistingOrgTask(null);
      }
    });
  }, [organization?.id, fetchTasks, members]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    try {
      const result = await uploadFile(selectedFile, organization?.id);
      setUploadResult(result);
    } catch (err: any) {
      setUploadResult({ inserted: 0, errors: [err.message] });
    } finally {
      setUploading(false);
    }
  };

  const handleNameChange = (value: string) => {
    setManualForm({ ...manualForm, full_name: value });
    if (value.trim()) {
      const matches = members.filter(m =>
        m.full_name.toLowerCase().includes(value.toLowerCase())
      );
      setNameSuggestions(matches);
      setShowNameSuggestions(matches.length > 0);
    } else {
      setShowNameSuggestions(false);
    }
  };

  const handleEmailChange = (value: string) => {
    setManualForm({ ...manualForm, email: value });
    if (value.trim()) {
      const matches = members.filter(m =>
        m.email.toLowerCase().includes(value.toLowerCase())
      );
      setEmailSuggestions(matches);
      setShowEmailSuggestions(matches.length > 0);
    } else {
      setShowEmailSuggestions(false);
    }
  };

  const handleAddChild = (parentEmail: string) => {
    setManualForm({ ...manualForm, manager_email: parentEmail });
    setAddChildFor(parentEmail);
    setShowManualModal(true);
  };

  const handleManualAdd = async () => {
    if (!manualForm.email || !manualForm.full_name) return;
    try {
      await addMember(manualForm, organization?.id);
      setShowManualModal(false);
      setAddChildFor(null);
      setManualForm({
        email: "",
        full_name: "",
        role: "employee",
        department: "",
        manager_email: "",
      });
    } catch {}
  };

  const handleAssign = async () => {
    if (!assignForm.assignee_email || !organization?.id) return;
    try {
      // Create a goal first
      const goal = await createGoal({
        title: `Build organization chart for ${organization.name}`,
        description:
          assignForm.message ||
          "Set up the organization chart with team members, roles, and reporting structure.",
        priority: "high",
        assignee_name:
          members.find((m) => m.email === assignForm.assignee_email)?.full_name ||
          assignForm.assignee_email,
        reviewer_name: user?.email || "",
        organization_id: organization.id,
      });

      // Create a task linked to the goal
      const task = await createTask({
        title: `Build organization chart for ${organization.name}`,
        description:
          assignForm.message ||
          "Please set up the organization chart with team members, roles, and reporting structure.",
        priority: "high",
        goal_id: goal.id,
        assignee_id: assignForm.assignee_email,
        organization_id: organization.id,
      });

      setExistingOrgTask({
        assignee_email: assignForm.assignee_email,
        assignee_name:
          members.find((m) => m.email === assignForm.assignee_email)?.full_name ||
          assignForm.assignee_email,
        status: task.status || "pending",
      });

      setShowAssignModal(false);
      setAssignForm({ assignee_email: "", message: "" });
    } catch (e) {
      console.error("Failed to assign org chart task:", e);
    }
  };

  const handleDeleteMember = async (memberId: string) => {
    if (confirm("Remove this member from the org chart?")) {
      await deleteMember(memberId, organization?.id);
    }
  };

  const getInitialView = () => {
    if (members.length === 0) return "empty";
    return "chart";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent">
            Organization Orchestration
          </h1>
          <p className="text-text-muted mt-1">
            Build and visualize your organizational structure
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {members.length} members
          </Badge>
        </div>
      </div>

      {members.length === 0 ? (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-purple-500/5">
          <CardContent className="p-8">
            <div className="flex flex-col items-center text-center max-w-lg mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center mb-4">
                <Share2 className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">
                Build Your Organization Chart
              </h2>
              <p className="text-sm text-text-muted mb-6">
                Choose how you'd like to set up your org structure. You can upload a file,
                add members manually, or assign this task to a team member.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
                <button
                  onClick={() => {
                    setAddMethod("upload");
                    setShowUploadModal(true);
                  }}
                  className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-surface border border-border/50 hover:border-primary/30 hover:bg-surface-light transition-all group cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Upload className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Upload File</p>
                    <p className="text-[10px] text-text-muted mt-0.5">
                      CSV or Excel format
                    </p>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setAddMethod("manual");
                    setShowManualModal(true);
                  }}
                  className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-surface border border-border/50 hover:border-primary/30 hover:bg-surface-light transition-all group cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <UserPlus className="w-6 h-6 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Add Manually</p>
                    <p className="text-[10px] text-text-muted mt-0.5">
                      Enter email & role
                    </p>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setAddMethod("assign");
                    setShowAssignModal(true);
                  }}
                  className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-surface border border-border/50 hover:border-primary/30 hover:bg-surface-light transition-all group cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Send className="w-6 h-6 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Assign Task</p>
                    <p className="text-[10px] text-text-muted mt-0.5">
                      Delegate to someone
                    </p>
                  </div>
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex items-center gap-3 mb-2">
          <Button
            onClick={() => setShowManualModal(true)}
            size="sm"
            className="cursor-pointer"
          >
            <UserPlus className="w-4 h-4 mr-1" /> Add Member
          </Button>
          <Button
            onClick={() => setShowUploadModal(true)}
            variant="outline"
            size="sm"
            className="cursor-pointer"
          >
            <Upload className="w-4 h-4 mr-1" /> Upload CSV/Excel
          </Button>
          <Button
            onClick={() => setShowAssignModal(true)}
            variant="outline"
            size="sm"
            className="cursor-pointer relative"
          >
            <Send className="w-4 h-4 mr-1" /> Assign Task
            {existingOrgTask && (
              <span className="ml-1.5 w-2 h-2 rounded-full bg-primary animate-pulse" title={`Assigned to ${existingOrgTask.assignee_name}`} />
            )}
          </Button>
        </div>
      )}

      {loading && members.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {tree.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Share2 className="w-5 h-5 text-primary" />
              <CardTitle>Organization Structure</CardTitle>
              <Badge variant="default" className="text-[10px] ml-2">
                {tree.length} {tree.length === 1 ? "root" : "roots"}
              </Badge>
            </div>
            <CardDescription>
              Hierarchical view of your team — who reports to whom
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto pb-4">
              <div className="flex gap-6 min-w-max">
                {tree.map((rootNode, i) => (
                  <TreeNode
                    key={rootNode.id || i}
                    node={rootNode}
                    onAdd={handleAddChild}
                    onDelete={handleDeleteMember}
                  />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Modal open={showUploadModal} onOpenChange={setShowUploadModal} title="Upload Org Data">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Upload className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Upload Org Data</h3>
              <p className="text-sm text-text-muted">
                Upload CSV or Excel file with these column names:
              </p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {["EmployeeID", "First Name", "Last Name", "Email ID", "Department", "Title", "Reporting To"].map((col) => (
                  <span key={col} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                    {col}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="border-2 border-dashed border-border/50 rounded-xl p-6 text-center hover:border-primary/30 transition-colors">
            {!selectedFile ? (
              <div>
                <FileSpreadsheet className="w-8 h-8 text-text-muted mx-auto mb-2" />
                <p className="text-sm text-text-muted mb-2">
                  Drop your file here or click to browse
                </p>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileChange}
                  className="text-sm text-text-muted file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                />
              </div>
            ) : (
              <div className="flex items-center justify-center gap-3">
                <FileText className="w-6 h-6 text-primary" />
                <span className="text-sm font-medium">{selectedFile.name}</span>
                <button
                  onClick={() => setSelectedFile(null)}
                  className="p-1 rounded hover:bg-surface cursor-pointer"
                >
                  <X className="w-4 h-4 text-text-muted" />
                </button>
              </div>
            )}
          </div>

          {uploadResult && (
            <div
              className={`p-3 rounded-xl ${
                uploadResult.errors.length > 0
                  ? "bg-amber-500/10 border border-amber-500/20"
                  : "bg-emerald-500/10 border border-emerald-500/20"
              }`}
            >
              <div className="flex items-center gap-2">
                {uploadResult.errors.length > 0 ? (
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                ) : (
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                )}
                <span className="text-sm">
                  {uploadResult.inserted} members added
                  {uploadResult.errors.length > 0 &&
                    `, ${uploadResult.errors.length} errors`}
                </span>
              </div>
              {uploadResult.errors.length > 0 && (
                <ul className="mt-2 text-xs text-text-muted space-y-1">
                  {uploadResult.errors.slice(0, 3).map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowUploadModal(false)} className="cursor-pointer">
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              className="cursor-pointer"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <Upload className="w-4 h-4 mr-1" />
              )}
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={showManualModal} onOpenChange={(open) => { setShowManualModal(open); if (!open) setAddChildFor(null); }} title="Add Member Manually">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">
                {addChildFor ? "Add Direct Report" : "Add Member Manually"}
              </h3>
              <p className="text-sm text-text-muted">
                {addChildFor
                  ? `Reporting to: ${addChildFor}`
                  : "Enter the details of the team member"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 relative">
              <label className="text-xs text-text-muted mb-1 block">Full Name</label>
              <Input
                value={manualForm.full_name}
                onChange={(e) => handleNameChange(e.target.value)}
                onFocus={() => {
                  if (nameSuggestions.length > 0) setShowNameSuggestions(true);
                }}
                onBlur={() => setTimeout(() => setShowNameSuggestions(false), 200)}
                placeholder="John Doe"
              />
              {showNameSuggestions && (
                <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-surface border border-border rounded-xl shadow-lg max-h-40 overflow-y-auto">
                  {nameSuggestions.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onMouseDown={() => {
                        setManualForm({ ...manualForm, full_name: m.full_name, email: m.email });
                        setShowNameSuggestions(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-primary/10 transition-colors cursor-pointer"
                    >
                      <span className="font-medium">{m.full_name}</span>
                      <span className="text-text-muted text-xs ml-2">{m.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="col-span-2 relative">
              <label className="text-xs text-text-muted mb-1 block">Email</label>
              <Input
                type="email"
                value={manualForm.email}
                onChange={(e) => handleEmailChange(e.target.value)}
                onFocus={() => {
                  if (emailSuggestions.length > 0) setShowEmailSuggestions(true);
                }}
                onBlur={() => setTimeout(() => setShowEmailSuggestions(false), 200)}
                placeholder="john@company.com"
                icon={<Mail className="w-4 h-4 text-text-muted" />}
              />
              {showEmailSuggestions && (
                <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-surface border border-border rounded-xl shadow-lg max-h-40 overflow-y-auto">
                  {emailSuggestions.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onMouseDown={() => {
                        setManualForm({ ...manualForm, email: m.email, full_name: m.full_name });
                        setShowEmailSuggestions(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-primary/10 transition-colors cursor-pointer"
                    >
                      <span className="font-medium">{m.email}</span>
                      <span className="text-text-muted text-xs ml-2">{m.full_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 block">Role</label>
              <Select
                value={manualForm.role}
                onValueChange={(v) => setManualForm({ ...manualForm, role: v })}
                options={[
                  { value: "ceo", label: "CEO" },
                  { value: "cto", label: "CTO" },
                  { value: "cfo", label: "CFO" },
                  { value: "coo", label: "COO" },
                  { value: "vp", label: "VP" },
                  { value: "director", label: "Director" },
                  { value: "manager", label: "Manager" },
                  { value: "lead", label: "Team Lead" },
                  { value: "employee", label: "Employee" },
                ]}
              />
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 block">Department</label>
              <Select
                value={manualForm.department}
                onValueChange={(v) => setManualForm({ ...manualForm, department: v })}
                options={[
                  { value: "Engineering", label: "Engineering" },
                  { value: "Marketing", label: "Marketing" },
                  { value: "Sales", label: "Sales" },
                  { value: "Operations", label: "Operations" },
                  { value: "Finance", label: "Finance" },
                  { value: "Human Resources", label: "Human Resources" },
                  { value: "Product", label: "Product" },
                  { value: "Design", label: "Design" },
                  { value: "Customer Support", label: "Customer Support" },
                  { value: "R&D", label: "R&D" },
                  { value: "Supply Chain", label: "Supply Chain" },
                ]}
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-text-muted mb-1 block">
                Manager Email
                {addChildFor && <span className="text-primary ml-1">(pre-filled)</span>}
              </label>
              <Input
                type="email"
                value={manualForm.manager_email}
                onChange={(e) =>
                  setManualForm({ ...manualForm, manager_email: e.target.value })
                }
                placeholder="manager@company.com"
                className={addChildFor ? "border-primary/30" : ""}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowManualModal(false)} className="cursor-pointer">
              Cancel
            </Button>
            <Button
              onClick={handleManualAdd}
              disabled={!manualForm.email || !manualForm.full_name}
              className="cursor-pointer"
            >
              <UserCheck className="w-4 h-4 mr-1" /> Add Member
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={showAssignModal} onOpenChange={setShowAssignModal} title="Assign Org Chart Task">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Send className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Assign Org Chart Task</h3>
              <p className="text-sm text-text-muted">
                Delegate the org chart setup to a team member
              </p>
            </div>
          </div>

          {existingOrgTask && (
            <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">
                  Already assigned to <span className="text-primary">{existingOrgTask.assignee_name}</span>
                </p>
                <div className="text-xs text-text-muted mt-0.5">
                  Status: <Badge variant="outline" className="text-[10px] ml-1">{existingOrgTask.status}</Badge>
                </div>
                <div className="text-xs text-text-muted mt-1">
                  Reassign below to change the assignee, or wait for completion.
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-text-muted mb-1 block">
              Assignee Email
            </label>
            <Input
              type="email"
              value={assignForm.assignee_email}
              onChange={(e) =>
                setAssignForm({ ...assignForm, assignee_email: e.target.value })
              }
              placeholder="colleague@company.com"
              icon={<Mail className="w-4 h-4 text-text-muted" />}
            />
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">
              Additional Instructions (optional)
            </label>
            <textarea
              value={assignForm.message}
              onChange={(e) =>
                setAssignForm({ ...assignForm, message: e.target.value })
              }
              placeholder="Please include all team members..."
              className="w-full p-3 rounded-xl bg-surface border border-border text-sm focus:outline-none focus:border-primary transition-colors resize-none h-20"
            />
          </div>

          <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
            <p className="text-xs text-text-muted">
              You (the owner) will be set as the reviewer. The assignee will see this
              task on their dashboard and can start building the org chart.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowAssignModal(false)} className="cursor-pointer">
              Cancel
            </Button>
            <Button
              onClick={handleAssign}
              disabled={!assignForm.assignee_email}
              className="cursor-pointer"
            >
              <ArrowRight className="w-4 h-4 mr-1" /> Assign Task
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
