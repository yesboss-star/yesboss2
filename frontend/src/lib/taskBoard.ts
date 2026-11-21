import type { Task } from "@/stores/taskStore";
import { daysUntil, firstAssignee, isFinished } from "@/components/TaskBoardCard";

/** Tabs above the board. Owners get Everyone / Mine / Shared; employees get Mine / Shared (and My team when they manage people). */
export type TabId = "everyone" | "mine" | "shared" | "team";

/** One filter at a time. */
export type FilterId = "all" | "approve" | "unassigned" | "high" | "late";

const lower = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** Every email a task is assigned to (assignee_id is a list of emails; assignee_email is the first one, or a list on old data). */
export function assigneeEmails(task: Task): string[] {
  const out: string[] = [];
  const add = (v: unknown) => {
    const e = lower(v);
    if (e && !out.includes(e)) out.push(e);
  };
  (Array.isArray(task.assignee_id) ? task.assignee_id : []).forEach(add);
  (Array.isArray(task.assignee_email) ? (task.assignee_email as unknown[]) : [task.assignee_email]).forEach(add);
  return out;
}

export const isAssignedTo = (task: Task, email: string) => !!email && assigneeEmails(task).includes(lower(email));

/** The people a task is shared with. They can see it, comment on it and ask Task AI about it, but not change it. */
export const reviewersOf = (task: Task): string[] => (task.reviewers || []).map(lower).filter(Boolean);

export const isSharedWith = (task: Task, email: string) => !!email && reviewersOf(task).includes(lower(email));

/** Owners see every task that has been shared; everyone else sees the ones they are part of. */
export function isInShared(task: Task, email: string, isOwner: boolean): boolean {
  return reviewersOf(task).length > 0 && (isOwner || isAssignedTo(task, email) || isSharedWith(task, email));
}

/** Late = past its due date and not finished. (Due today is shown on the card but is not late yet.) */
export function isLate(task: Task): boolean {
  const days = daysUntil(task.due_date);
  return !isFinished(task) && days !== null && days < 0;
}

export function matchesFilter(task: Task, filter: FilterId): boolean {
  switch (filter) {
    case "approve":
      return task.status === "completed";
    case "unassigned":
      return !isFinished(task) && !firstAssignee(task);
    case "high":
      return !isFinished(task) && (task.priority === "high" || task.priority === "urgent");
    case "late":
      return isLate(task);
    default:
      return true;
  }
}

/** The department shown on a card: the task's own, or its assignee's, plus the department of each person it is shared with. */
export function taskDepartments(task: Task, departmentOf: (email: string) => string | undefined): string[] {
  const out: string[] = [];
  const add = (d?: string) => {
    const v = (d || "").trim();
    if (v && !out.includes(v)) out.push(v);
  };
  add(task.department || departmentOf(firstAssignee(task)));
  reviewersOf(task).forEach((e) => add(departmentOf(e)));
  return out;
}

/** "You review this", "You and 2 more review", or "Shared with Asha +1". null when the task is not shared. */
export function sharedLabel(task: Task, myEmail: string, firstNameOf: (email: string) => string): string | null {
  const people = reviewersOf(task);
  if (!people.length) return null;
  const me = lower(myEmail);
  const others = people.filter((e) => e !== me);
  if (people.includes(me)) return others.length ? `You and ${others.length} more review` : "You review this";
  return `Shared with ${firstNameOf(others[0])}${others.length > 1 ? ` +${others.length - 1}` : ""}`;
}
