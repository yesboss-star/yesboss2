# Notification System — What I Added & How It Works

---

## Backend

### 1. `backend/app/api/notifications.py` — New File (6 APIs)

This file gives the frontend 6 ways to talk to notifications in the database.

| API | What It Does |
|---|---|
| `POST /notifications` | Create a new notification (saves to MongoDB + pushes via WebSocket) |
| `GET /notifications` | Get list of notifications for a user (newest first) |
| `PATCH /notifications/{id}/read` | Mark one notification as read |
| `POST /notifications/mark-all-read` | Mark ALL notifications as read for a user |
| `DELETE /notifications/{id}` | Delete one notification |
| `GET /notifications/unread-count` | Return just the number of unread notifications (for the badge) |

### 2. `backend/app/api/tasks.py` — Added Auto-Triggers

When you do something with a task, code runs automatically to create notifications and send WebSocket messages.

| Action | Notification Goes To | WebSocket Event Sent To Org |
|---|---|---|
| Task created | The person assigned to it | `task_created` (so everyone sees the new task) |
| Task assigned | The person it was assigned to | `task_assigned` (personal message to that person) |
| Task status changed (e.g. In Progress) | The person who created the task | `task_updated` (everyone sees the change) |
| Task completed/approved | The person who created the task | `task_updated` (everyone sees the change) |

### 3. `backend/app/api/goals.py` — Added Auto-Triggers

Same idea — when something happens with a goal, notifications and WebSocket messages fire automatically.

| Action | Notification Goes To | WebSocket Event Sent To Org |
|---|---|---|
| Goal created | Both the creator AND the assignee | `goal_created` (everyone sees the new goal) |
| Goal status changed | Both the assignee AND the creator | `goal_updated` (everyone sees the change) |

### 4. `backend/app/core/database.py` — Added Collection

Added a `notifications` collection with indexes on `user_id`, `organization_id`, and `created_at`. This makes notification queries fast.

### 5. `backend/app/dependencies/auth.py` — Fixed Auth

Made the auth system accept `X-User-ID` header as a fallback. The frontend doesn't send Bearer tokens — it sends the Firebase UID in a header instead. This fix lets the notification APIs know who the user is.

---

## Frontend

### 6. `frontend/src/stores/notificationStore.ts` — New Store

This is a Zustand store (like a global state box) that holds notifications in memory. Functions:

| Function | What It Does |
|---|---|
| `fetchNotifications()` | Calls `GET /notifications` to load from backend |
| `markAsRead(id)` | Calls `PATCH /notifications/{id}/read` then updates the local list |
| `markAllAsRead()` | Calls `POST /notifications/mark-all-read` then updates the local list |
| `deleteNotification(id)` | Calls `DELETE /notifications/{id}` then removes it locally |
| `addNotification(notif)` | Adds a notification to local state (used when WebSocket pushes one) |
| `refreshUnreadCount()` | Calls the unread-count endpoint and updates the badge number |
| `unreadCount` | A simple number — the bell icon reads this to show the red badge |

### 7. `frontend/src/components/NotificationDropdown.tsx` — New Component

A bell icon in the header bar. When you click it:
- Shows the 10 latest notifications in a dropdown
- Each notification has a blue dot that disappears when you click "Mark read"
- At the bottom, a "See all notifications" link takes you to the full history page

### 8. `frontend/src/components/NotificationWatcher.tsx` — New Component

This is a hidden component that wraps the whole app. It does two things:

**Connects to WebSocket** — It opens a connection to `ws://backend/ws/{org_id}?user_id={uid}`. This one connection receives both personal messages AND org-wide broadcasts.

**Handles 6 types of WebSocket events:**

| Event | What The Watcher Does |
|---|---|
| `notification` | Adds it to the notification store (bell badge updates) + shows a small toast popup |
| `task_created` | Adds the new task to the task store (it appears in task lists immediately) |
| `task_assigned` | Adds the new task to the task store (same as above) |
| `task_updated` | Updates the existing task in the store (status changes show up live) |
| `goal_created` | Adds the new goal to the goal store (appears in goal lists immediately) |
| `goal_updated` | Updates the existing goal in the store (status changes show up live) |

**Fallback polling** — Every 30 seconds it also calls `refreshUnreadCount()` just in case the WebSocket disconnects.

**Auto-reconnect** — If the WebSocket drops, it waits 1 second, then 2, 4, 8... up to 15 seconds, then tries again.

### 9. `frontend/src/app/dashboard/notifications/page.tsx` — New Page

A full notification history page at `/dashboard/notifications`. Features:
- **Tabs**: All / Unread / Tasks / Goals / Alerts (filters by type)
- **Date groups**: Today, Yesterday, This Week, Older
- Each notification shows: title, message, time, a "Mark read" button, and a delete button
- Clicking the title/link takes you to the related task or goal detail page

### 10. `frontend/src/stores/taskStore.ts` & `goalStore.ts` — Modified Stores

Added 4 new functions to support real-time updates:

| Store | Function | What It Does |
|---|---|---|
| taskStore | `addTaskFromWs(task)` | Adds a task to the front of the task list (used when WebSocket says a task was created) |
| taskStore | `updateTaskFromWs(task)` | Finds the task by ID and updates it in place (used when WebSocket says a task was updated) |
| goalStore | `addGoalFromWs(goal)` | Adds a goal to the front of the goal list |
| goalStore | `updateGoalFromWs(goal)` | Finds the goal by ID and updates it in place |

These functions are what make the dashboard and task/goal pages update **instantly** without needing to refresh the page.

---

## Simple Real-Life Examples

### When does a user get a notification?

**User creates a goal**
- User A creates a goal → User A gets notified: "Goal created: [title]"
- If User B is assigned to that goal → User B gets notified: "New Goal Assigned: [title]"

**User changes a goal status**
- User A changes goal status → User B (assignee) gets notified: "Goal Status: [status]"
- If creator is different from assignee → creator also gets notified: "Goal [title] updated to [status]"

**User creates a task and assigns it**
- User A creates a task → User B (assignee) gets notified: "New task assigned: [title]"

**User changes a task status**
- User A changes task status to "In Progress" → User B (creator) gets notified: "Task status: In Progress"
- User A marks task as "Completed" → User B (creator) gets notified: "Task completed: [title]"

**User approves a task**
- User A approves a completed task → User B (creator) gets notified: "Task approved: [title]"

### Where do these notifications appear?

1. **Bell icon** (top of every page) — Shows a red badge with the unread count. Click it to see the latest 10 notifications.
2. **Toast popup** (top-right) — A small popup slides in for 3-4 seconds so you don't miss important updates.
3. **Notification history page** (`/dashboard/notifications`) — Shows ALL notifications with tabs and date grouping. You can mark as read or delete from here.

### Example Flow — Step by Step

1. User A creates a task and assigns it to User B
2. User B sees a **toast popup**: "New task assigned: [title]"
3. User B's **bell badge** shows +1
4. User B's **task list** updates instantly with the new task
5. User B clicks the bell → sees the notification in the dropdown
6. Later, User B clicks "See all" → full history page with that notification
7. User B marks it as read → blue dot disappears, badge number goes down
