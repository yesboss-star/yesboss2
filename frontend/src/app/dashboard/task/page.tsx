"use client";

import { Suspense, useCallback, useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationStore } from "@/stores/organizationStore";
import { useTaskStore } from "@/stores/taskStore";
import { useGoalStore } from "@/stores/goalStore";
import { useOrgChartStore } from "@/stores/orgChartStore";
import DashboardLayout from "@/components/DashboardLayout";
import { GoalSection } from "@/components/owners/DashboardView";
import TaskBoardCard, { firstAssignee, isFinished, needsAttention } from "@/components/TaskBoardCard";
import QuickAddTask from "@/components/QuickAddTask";
import TaskSummaryCard from "@/components/TaskSummaryCard";
import TaskModal from "@/components/TaskModal";
import TaskPanel from "@/components/TaskPanel";
import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useIsPhone } from "@/hooks/useIsPhone";
import { useScrollDown } from "@/hooks/useScrollDown";
import { isAssignedTo, isInShared, matchesFilter, sharedLabel, taskDepartments, type FilterId, type TabId } from "@/lib/taskBoard";
import { Plus, Search, Zap, CheckCheck, Users, User, UserX, Flag, Layers, Share2, Clock, ListFilter } from "lucide-react";

const COLUMN_PREVIEW = 8;

const pill =
  "inline-flex items-center gap-2 rounded-full border-[2.5px] border-outline px-4 py-2 text-sm font-bold shadow-[3px_3px_0_var(--shadow-hard)] transition-all cursor-pointer hover:-translate-x-px hover:-translate-y-px";

const TAB_META: Record<TabId, { label: string; icon: typeof User }> = {
  everyone: { label: "Everyone", icon: Layers },
  mine: { label: "Mine", icon: User },
  shared: { label: "Shared", icon: Share2 },
  team: { label: "My team", icon: Users },
};

export default function TaskPage() {
  // useSearchParams needs a Suspense boundary on a statically built page
  return (
    <Suspense fallback={null}>
      <TaskPageContent />
    </Suspense>
  );
}

function TaskPageContent() {
  const { user, role, loading } = useAuth();
  // an employee on a phone gets the Android-style page: filters pinned under the top bar, To do / Doing / Done as tabs, a floating New task button
  const isPhone = useIsPhone();
  const phoneEmployee = isPhone && role === "employee";
  const scrollingDown = useScrollDown(phoneEmployee);
  const [statusTab, setStatusTab] = useState<"todo" | "doing" | "done">("todo");
  const router = useRouter();
  const { organization } = useOrganizationStore();
  const { tasks, fetchTasks, loading: tasksLoading } = useTaskStore();
  const { goals, fetchGoals } = useGoalStore();
  const { members, fetchOrgMembers } = useOrgChartStore();

  const [tabChoice, setTabChoice] = useState<TabId | null>(null);
  const [filter, setFilter] = useState<FilterId>("all");
  const [dept, setDept] = useState("");
  const [expandedCols, setExpandedCols] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showTaskModal, setShowTaskModal] = useState(false);
  // The open task lives in the address (/dashboard/task?task=<id>), so the old task page, emails and notification links
  // can all open it, and Back / refresh behave.
  const openId = useSearchParams().get("task");

  const isOwner = role === "owner";
  const userEmail = (user as any)?.email || "";
  const userId = (user as any)?.uid || (user as any)?.id || "";

  const directReports = useMemo(() => {
    return members.filter((m) => m.manager_email?.toLowerCase() === userEmail.toLowerCase());
  }, [members, userEmail]);

  const directReportEmails = useMemo(() => {
    return new Set(directReports.map((m) => m.email.toLowerCase()));
  }, [directReports]);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (loading || !user || organization) return;
    const existingPersist = localStorage.getItem("yesboss-organization");
    if (existingPersist) {
      try {
        const parsed = JSON.parse(existingPersist);
        if (parsed?.state?.organization) {
          useOrganizationStore.getState().setOrganization(parsed.state.organization);
          return;
        }
      } catch {}
    }
    useOrganizationStore.getState().fetchOrganizationByEmail(user.email!);
  }, [user, loading, organization]);

  useEffect(() => {
    if (organization?.id) {
      // Goals for everyone: the goal tag on a card only appears for goals the person is allowed to see
      fetchGoals(organization.id);
      fetchTasks(organization.id);
      fetchOrgMembers(organization.id);
    }
  }, [organization?.id, fetchGoals, fetchTasks, fetchOrgMembers]);

  // Refresh tasks from the backend when the user returns to this tab, so statuses
  // flipped by the Google Tasks sync-back reflect immediately.
  useEffect(() => {
    if (!organization?.id) return;
    const onFocus = () => fetchTasks(organization.id);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [organization?.id, fetchTasks]);

  // Next keeps useSearchParams in step with history.replaceState, so this opens and closes the panel without a page load.
  const openTask = useCallback((id: string) => {
    window.history.replaceState(null, "", `${window.location.pathname}?task=${encodeURIComponent(id)}`);
  }, []);
  const closeTask = useCallback(() => {
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const tabs: TabId[] = isOwner ? ["everyone", "mine", "shared"] : directReports.length > 0 ? ["mine", "shared", "team"] : ["mine", "shared"];
  const tab: TabId = tabChoice && tabs.includes(tabChoice) ? tabChoice : tabs[0];

  const inTab = useCallback(
    (t: (typeof tasks)[number], which: TabId) => {
      if (which === "everyone") return true;
      if (which === "mine") return isAssignedTo(t, userEmail);
      if (which === "shared") return isInShared(t, userEmail, isOwner);
      const reports = directReportEmails;
      return [...(t.assignee_id || []), t.assignee_email || ""].some((e) => reports.has(String(e).toLowerCase()));
    },
    [userEmail, isOwner, directReportEmails]
  );

  const tabCounts = useMemo(() => {
    const out = {} as Record<TabId, number>;
    (["everyone", "mine", "shared", "team"] as TabId[]).forEach((k) => {
      out[k] = tasks.filter((t) => inTab(t, k)).length;
    });
    return out;
  }, [tasks, inTab]);

  const tabTasks = useMemo(() => tasks.filter((t) => inTab(t, tab)), [tasks, inTab, tab]);

  const emailToName = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((m) => map.set(m.email.toLowerCase(), (m.full_name || "").trim()));
    return map;
  }, [members]);

  const emailToDept = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((m) => m.department && map.set(m.email.toLowerCase(), m.department));
    return map;
  }, [members]);
  const departmentOf = useCallback((email: string) => emailToDept.get((email || "").toLowerCase()), [emailToDept]);

  const goalTitles = useMemo(() => new Map(goals.map((g) => [g.id, g.title])), [goals]);

  const nameOfEmail = useCallback((email: string) => emailToName.get((email || "").toLowerCase()) || (email || "").split("@")[0], [emailToName]);
  const firstNameOf = useCallback(
    (email: string) => {
      const first = nameOfEmail(email).split(/[\s._-]+/)[0] || "";
      return first ? first.charAt(0).toUpperCase() + first.slice(1) : "";
    },
    [nameOfEmail]
  );

  const assigneeOf = (t: (typeof tasks)[number]) => firstNameOf(firstAssignee(t));

  // Departments present in this tab, for the department filter.
  const deptOptions = useMemo(() => {
    const set = new Set<string>();
    tabTasks.forEach((t) => taskDepartments(t, departmentOf).forEach((d) => set.add(d)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [tabTasks, departmentOf]);
  const activeDept = dept && deptOptions.includes(dept) ? dept : "";

  // Everything the header counts and filter chips count: this tab, this department.
  const visibleTasks = useMemo(
    () => (activeDept ? tabTasks.filter((t) => taskDepartments(t, departmentOf).includes(activeDept)) : tabTasks),
    [tabTasks, activeDept, departmentOf]
  );

  const counts: Record<FilterId, number> = {
    all: visibleTasks.length,
    approve: visibleTasks.filter((t) => matchesFilter(t, "approve")).length,
    unassigned: visibleTasks.filter((t) => matchesFilter(t, "unassigned")).length,
    high: visibleTasks.filter((t) => matchesFilter(t, "high")).length,
    late: visibleTasks.filter((t) => matchesFilter(t, "late")).length,
  };
  const attentionCount = visibleTasks.filter(needsAttention).length;
  const finishedCount = visibleTasks.filter(isFinished).length;

  const filteredTasks = visibleTasks.filter((task) => {
    if (!matchesFilter(task, filter)) return false;
    if (searchQuery && !task.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const byDue = (a: (typeof tasks)[number], b: (typeof tasks)[number]) => {
    const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
    const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
    return (Number.isNaN(da) ? Infinity : da) - (Number.isNaN(db) ? Infinity : db);
  };

  // Done holds finished work: completed tasks (flagged "Needs your OK" until approved) come first, then approved ones.
  const byRecent = (a: (typeof tasks)[number], b: (typeof tasks)[number]) =>
    (new Date(b.updated_at).getTime() || 0) - (new Date(a.updated_at).getTime() || 0);
  const columns = [
    { key: "todo", title: "To do", head: "bg-[#FFD93D]", empty: "All clear", tasks: filteredTasks.filter((t) => t.status !== "in_progress" && t.status !== "completed" && t.status !== "approved").sort(byDue) },
    { key: "doing", title: "Doing", head: "bg-[#7CC8FF]", empty: "Nothing in progress", tasks: filteredTasks.filter((t) => t.status === "in_progress").sort(byDue) },
    { key: "done", title: "Done", head: "bg-[#B6F36B]", empty: "Nothing finished yet", tasks: filteredTasks.filter((t) => t.status === "completed" || t.status === "approved").sort((a, b) => Number(b.status === "completed") - Number(a.status === "completed") || byRecent(a, b)) },
  ];

  const filterChips: { id: FilterId; text: string; icon: typeof Zap; on: string; show: boolean }[] = [
    { id: "all", text: "All", icon: ListFilter, on: "bg-highlight text-on-highlight", show: true },
    { id: "approve", text: "Needs your OK", icon: CheckCheck, on: "bg-[#C9A7FF] text-[#111]", show: isOwner },
    { id: "unassigned", text: "Nobody yet", icon: UserX, on: "bg-[#FF9FD2] text-[#111]", show: isOwner },
    { id: "high", text: "High priority", icon: Flag, on: "bg-[#FFD93D] text-[#111]", show: true },
    { id: "late", text: "Late", icon: Clock, on: "bg-[#FF7A6B] text-[#111]", show: true },
  ];

  const captions: Record<TabId, string> = {
    everyone: "Everything your team is working on, in one place.",
    mine: "Tasks assigned to you.",
    shared: "Tasks that have a reviewer, or that you share with someone.",
    team: `Tasks from your ${directReports.length} direct report${directReports.length !== 1 ? "s" : ""}.`,
  };

  if (loading || !user) {
    return null;
  }

  const filtering = !!searchQuery || filter !== "all" || !!activeDept;

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Tasks</h1>
            <p className="text-text-muted mt-1">{captions[tab]}</p>
          </div>
          <Button onClick={() => setShowTaskModal(true)} className={cn("flex items-center gap-2 cursor-pointer", phoneEmployee && "hidden")}>
            <Plus className="w-4 h-4" />
            New task
          </Button>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <TaskSummaryCard
            finished={finishedCount}
            total={visibleTasks.length}
            waiting={counts.approve}
            isOwner={isOwner}
            onReview={() => setFilter("approve")}
          />
          {organization?.id && (
            <QuickAddTask orgId={organization.id} members={members} userEmail={userEmail} isOwner={isOwner} onError={setError} />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex flex-wrap gap-2" role="tablist" aria-label="Whose tasks">
            {tabs.map((key) => {
              const { label, icon: Icon } = TAB_META[key];
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTabChoice(key)}
                  className={cn(pill, tab === key ? "bg-highlight text-on-highlight" : "bg-surface text-foreground")}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                  <span className="rounded-full border-2 border-outline bg-background/60 px-2 text-xs font-extrabold text-foreground">{tabCounts[key]}</span>
                </button>
              );
            })}
          </div>
          {deptOptions.length > 0 && (
            <>
              <label htmlFor="task-dept" className="sr-only">
                Department
              </label>
              <select
                id="task-dept"
                value={activeDept}
                onChange={(e) => setDept(e.target.value)}
                className={cn(pill, "cursor-pointer appearance-auto", activeDept ? "bg-[#7CC8FF] text-[#111]" : "bg-surface text-foreground", "[&>option]:bg-surface [&>option]:text-foreground")}
              >
                <option value="">All departments</option>
                {deptOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </>
          )}
          <div className="relative ml-auto w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <Input
              type="text"
              placeholder="Search tasks..."
              aria-label="Search tasks"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div
          className={cn(phoneEmployee && "sticky z-20 -mx-4 space-y-3 bg-background px-4 pb-3 pt-2 transition-[top] duration-200")}
          style={phoneEmployee ? { top: "var(--hdr, 0px)" } : undefined}
        >
        <div className={cn("flex items-center gap-3", phoneEmployee ? "-mx-4 flex-nowrap overflow-x-auto px-4 pb-1 [scrollbar-width:none]" : "flex-wrap")} role="group" aria-label="Show">
          {filterChips
            .filter((c) => c.show)
            .map(({ id, text, icon: Icon, on }) => (
              <button
                key={id}
                type="button"
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
                className={cn(pill, "shrink-0 whitespace-nowrap", filter === id ? on : "bg-surface text-foreground")}
              >
                <Icon className="w-4 h-4" />
                {text} · {counts[id]}
              </button>
            ))}
          {attentionCount > 0 && filter === "all" && !phoneEmployee && (
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-muted">
              <Zap className="w-4 h-4" />
              {attentionCount} due today or late
            </span>
          )}
        </div>
        {phoneEmployee && (
          <div role="tablist" aria-label="Task status" className="flex gap-1 rounded-full border-[2.5px] border-outline bg-surface p-1 shadow-[3px_3px_0_var(--shadow-hard)]">
            {columns.map((c) => (
              <button
                key={c.key}
                type="button"
                role="tab"
                aria-selected={statusTab === c.key}
                onClick={() => setStatusTab(c.key as "todo" | "doing" | "done")}
                className={cn("flex-1 cursor-pointer rounded-full px-2 py-2 text-sm font-bold", statusTab === c.key ? "bg-highlight text-on-highlight" : "text-foreground")}
              >
                {c.title} <span className="opacity-70">{c.tasks.length}</span>
              </button>
            ))}
          </div>
        )}
        </div>

        {error && (
          <p className="rounded-2xl border-2 border-outline bg-rose-500/10 px-4 py-2 text-sm text-rose-400" role="alert">
            {error}
          </p>
        )}

        {tasksLoading && tasks.length === 0 ? (
          <div className="text-center py-12 text-text-muted">Loading tasks...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
            {columns.filter((c) => !phoneEmployee || c.key === statusTab).map((col) => {
              const expanded = expandedCols.includes(col.key);
              const shown = expanded ? col.tasks : col.tasks.slice(0, COLUMN_PREVIEW);
              return (
                <section key={col.key} aria-label={col.title} className="glass rounded-3xl p-3.5 min-w-0">
                  <header className={cn("mb-3.5 flex items-center gap-2.5 rounded-2xl border-[2.5px] border-[#111] px-4 py-2.5 text-[#111]", col.head, phoneEmployee && "hidden")}>
                    <h2 className="text-lg font-bold">{col.title}</h2>
                    <span className="ml-auto rounded-full border-2 border-[#111] bg-white px-2.5 text-sm font-extrabold">{col.tasks.length}</span>
                  </header>
                  <div className="space-y-3">
                    {shown.map((task, idx) => (
                      <TaskBoardCard
                        key={task.id || task._id || `task-${idx}`}
                        task={task}
                        assignee={assigneeOf(task)}
                        members={members}
                        isOwner={isOwner}
                        onError={setError}
                        onOpen={openTask}
                        departments={taskDepartments(task, departmentOf)}
                        goalTitle={task.goal_id ? goalTitles.get(task.goal_id) : undefined}
                        sharedLabel={sharedLabel(task, userEmail, firstNameOf)}
                      />
                    ))}
                    {shown.length === 0 && (
                      <p className="py-6 text-center text-sm font-semibold text-text-muted">{filtering ? "No matching tasks" : col.empty}</p>
                    )}
                  </div>
                  {col.tasks.length > COLUMN_PREVIEW && (
                    <button
                      type="button"
                      onClick={() => setExpandedCols((cur) => (cur.includes(col.key) ? cur.filter((k) => k !== col.key) : [...cur, col.key]))}
                      className="mt-3 w-full cursor-pointer py-2 text-sm font-bold text-text-muted hover:text-foreground"
                    >
                      {expanded ? "Show fewer" : `Show all ${col.tasks.length}`}
                    </button>
                  )}
                </section>
              );
            })}
          </div>
        )}

        {isOwner && <GoalSection />}
      </div>

      {phoneEmployee && (
        <button
          type="button"
          aria-label="New task"
          onClick={() => setShowTaskModal(true)}
          className="fixed right-4 z-30 flex h-14 cursor-pointer items-center gap-2 rounded-[20px] border-[2.5px] border-[#111] bg-[#FFD93D] px-4 font-extrabold text-[#111] shadow-[4px_4px_0_#111] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0_#111]"
          style={{ bottom: "calc(6.25rem + env(safe-area-inset-bottom, 0px))" }}
        >
          <Plus className="h-6 w-6 flex-shrink-0" />
          <span className={cn("overflow-hidden whitespace-nowrap transition-all duration-200", scrollingDown ? "max-w-0 opacity-0" : "max-w-28")}>New task</span>
        </button>
      )}

      <TaskModal isOpen={showTaskModal} onClose={() => setShowTaskModal(false)} />
      {openId && (
        <TaskPanel
          taskId={openId}
          onClose={closeTask}
          isOwner={isOwner}
          userEmail={userEmail}
          userId={userId}
          members={members}
          goals={goals}
        />
      )}
    </DashboardLayout>
  );
}
