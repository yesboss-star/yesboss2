# Notification System — Full Documentation

## Phase 1 — Core Infrastructure

---

### Backend — What I Added & How It Works

#### 1. `backend/app/api/notifications.py` — New File (6 APIs)

This file gives the frontend 6 ways to talk to notifications in the database.

| API | What It Does |
|---|---|
| `POST /notifications` | Create a new notification (saves to MongoDB + pushes via WebSocket) |
| `GET /notifications` | Get list of notifications for a user (newest first) |
| `PATCH /notifications/{id}/read` | Mark one notification as read |
| `POST /notifications/mark-all-read` | Mark ALL notifications as read for a user |
| `DELETE /notifications/{id}` | Delete one notification |
| `GET /notifications/unread-count` | Return just the number of unread notifications (for the badge) |

#### 2. `backend/app/api/tasks.py` — Added Auto-Triggers

When you do something with a task, code runs automatically to create notifications and send WebSocket messages.

| Action | Notification Goes To | WebSocket Event Sent To Org |
|---|---|---|
| Task created | The person assigned to it | `task_created` (so everyone sees the new task) |
| Task assigned | The person it was assigned to | `task_assigned` (personal message to that person) |
| Task status changed (e.g. In Progress) | The person who created the task | `task_updated` (everyone sees the change) |
| Task completed/approved | The person who created the task | `task_updated` (everyone sees the change) |
| Task deleted | The person assigned to it | — |

#### 3. `backend/app/api/goals.py` — Added Auto-Triggers

Same idea — when something happens with a goal, notifications and WebSocket messages fire automatically.

| Action | Notification Goes To | WebSocket Event Sent To Org |
|---|---|---|
| Goal created | Both the creator AND the assignee | `goal_created` (everyone sees the new goal) |
| Goal status changed | Both the assignee AND the creator | `goal_updated` (everyone sees the change) |
| Goal deleted | Both the assignee AND the creator | — |

#### 4. `backend/app/core/database.py` — Added Collection

Added a `notifications` collection with indexes on `user_id`, `organization_id`, and `created_at`. This makes notification queries fast.

#### 5. `backend/app/dependencies/auth.py` — Fixed Auth

Made the auth system accept `X-User-ID` header as a fallback. The frontend doesn't send Bearer tokens — it sends the Firebase UID in a header instead. This fix lets the notification APIs know who the user is.

---

### Frontend — What I Added & How It Works

#### 6. `frontend/src/stores/notificationStore.ts` — New Store

This is a Zustand store (like a global state box) that holds notifications in memory.

| Function | What It Does |
|---|---|
| `fetchNotifications()` | Calls `GET /notifications` to load from backend |
| `markAsRead(id)` | Calls `PATCH /notifications/{id}/read` then updates the local list |
| `markAllAsRead()` | Calls `POST /notifications/mark-all-read` then updates the local list |
| `deleteNotification(id)` | Calls `DELETE /notifications/{id}` then removes it locally |
| `addNotification(notif)` | Adds a notification to local state (used when WebSocket pushes one) |
| `refreshUnreadCount()` | Calls the unread-count endpoint and updates the badge number |
| `unreadCount` | A simple number — the bell icon reads this to show the red badge |

#### 7. `frontend/src/components/NotificationDropdown.tsx` — New Component

A bell icon in the header bar. When you click it:
- Shows the 10 latest notifications in a dropdown
- Each notification has a blue dot that disappears when you click "Mark read"
- At the bottom, a "See all notifications" link takes you to the full history page

#### 8. `frontend/src/components/NotificationWatcher.tsx` — New Component

This is a hidden component that wraps the whole app. It does three things:

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

#### 9. `frontend/src/app/dashboard/notifications/page.tsx` — New Page

A full notification history page at `/dashboard/notifications`.

Features:
- **Tabs**: All / Unread / Tasks / Goals / Alerts (filters by type)
- **Date groups**: Today, Yesterday, This Week, Older
- Each notification shows: title, message, time, a "Mark read" button, and a delete button
- Clicking the title/link takes you to the related task or goal detail page

#### 10. `frontend/src/stores/taskStore.ts` & `goalStore.ts` — Modified Stores

Added 4 new functions to support real-time updates:

| Store | Function | What It Does |
|---|---|---|
| taskStore | `addTaskFromWs(task)` | Adds a task to the front of the task list (used when WebSocket says a task was created) |
| taskStore | `updateTaskFromWs(task)` | Finds the task by ID and updates it in place (used when WebSocket says a task was updated) |
| goalStore | `addGoalFromWs(goal)` | Adds a goal to the front of the goal list |
| goalStore | `updateGoalFromWs(goal)` | Finds the goal by ID and updates it in place |

These functions are what make the dashboard and task/goal pages update **instantly** without needing to refresh the page.

---

### Simple Real-Life Examples — When Notifications Happen

**User creates a goal**
- User A creates a goal → User A gets notified: "Goal created: [title]"
- If User B is assigned to that goal → User B gets notified: "New Goal Assigned: [title]"

**User changes a goal status**
- User A changes goal status → User B (assignee) gets notified: "Goal Status: [status]"
- If creator is different from assignee → creator also gets notified

**User creates a task and assigns it**
- User A creates a task → User B (assignee) gets notified: "New task assigned: [title]"

**User changes a task status**
- User A changes task status to "In Progress" → User B (creator) gets notified
- User A marks task as "Completed" → User B (creator) gets notified

**User approves a task**
- User A approves a completed task → User B (creator) gets notified

**User deletes a task or goal**
- The person assigned to it gets notified: "Task/Goal was deleted"

**Where do these notifications appear?**
1. **Bell icon** (top of every page) — Shows a red badge with the unread count
2. **Toast popup** (top-right) — A small popup slides in for 3-4 seconds
3. **Notification history page** (`/dashboard/notifications`) — Shows ALL notifications

---

## Phase 2 — Advanced Features

---

### 1. Notification Preferences (Settings Page)

**What it does:**
- Users can turn ON/OFF each notification type for each channel (In-App, Email, Push)
- Users can enable/disable sound alerts
- Users can enable daily or weekly email digest

**Backend file:** `backend/app/api/notification_preferences.py`

| API | What It Does |
|---|---|
| `GET /notification-preferences` | Get current preferences for the logged-in user |
| `PUT /notification-preferences` | Update preferences (send only what changed) |

**How it works:**
- When a notification is created, the system checks the user's preferences
- If `in_app` is OFF for that type → no notification saved to MongoDB, no WebSocket sent
- If `email` is OFF → no email sent
- If `push` is OFF → no push notification sent
- Preferences are stored in the `notification_preferences` collection in MongoDB

**Where to see it:** Settings page → Notifications tab (`/dashboard/settings`)

---

### 2. Email Notifications

**What it does:**
- When a notification is created, an email is also sent to the user (if they have it enabled and SMTP is configured)
- Email includes the notification title, message, and a "View Details" link

**Backend file:** `backend/app/core/email_service.py`

**How it works:**
- Uses standard SMTP (works with Gmail, SendGrid, Mailgun, any SMTP provider)
- If SMTP is not configured, emails are skipped (no errors)
- Email is sent in the background (non-blocking)
- The notification service checks if the user has email enabled for that type before sending

**What you need to configure (in `.env`):**
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@yesboss.app
```

---

### 3. Push Notifications (Browser)

**What it does:**
- Sends browser push notifications even when the YESBOSS tab is closed
- Uses the Web Push API (works on Chrome, Firefox, Edge, Safari)
- Requires user permission (browser asks once)

**Backend files:**
- `backend/app/api/push_subscriptions.py` — API to save/remove push subscriptions
- Uses `pywebpush` library to send push messages

**Frontend files:**
- `frontend/public/sw.js` — Service worker that receives push events and shows system notifications
- `frontend/src/lib/pushNotifications.ts` — Utility to register/unregister push
- `NotificationWatcher.tsx` — Auto-registers push on app load

**How it works:**
1. When app loads, it registers a service worker (`sw.js`)
2. Gets the VAPID public key from the backend
3. Browser creates a push subscription (encrypted endpoint)
4. Subscription is saved to MongoDB via `POST /push/subscribe`
5. When a notification is created, the service sends a push via `pywebpush`
6. Service worker receives it and shows a system notification
7. Clicking the notification opens the YESBOSS app

**What you need to configure (in `.env`):**
```
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_CLAIMS_EMAIL=admin@yesboss.app
```

**How to generate VAPID keys:**
Run this in terminal:
```bash
npx web-push generate-vapid-keys
```
Or install pywebpush and generate:
```bash
python -c "from pywebpush import _Vapid; key = _Vapid(); print('Public:', key.public_key); print('Private:', key.private_key)"
```

---

### 4. Sound Alerts

**What it does:**
- Plays a short beep sound when a new notification arrives via WebSocket
- Users can turn it ON/OFF in Settings

**How it works:**
- Uses Web Audio API (no audio file needed)
- Generates a short 800Hz sine wave beep (0.3 seconds)
- Plays only when `sound` preference is enabled
- Added in `NotificationWatcher.tsx`

**Where to control it:** Settings → Notifications → Sound Alerts toggle

---

### 5. Deletion Notifications

**What it does:**
- When a task is deleted → the assignee gets a notification: "Task '[title]' was deleted"
- When a goal is deleted → both the assignee AND the creator get notified

**How it works:**
- Modified `delete_task` route in `tasks.py` to look up the task first, then notify the assignee before deleting
- Modified `delete_goal` route in `goals.py` to look up the goal first, then notify both assignee and creator before deleting

---

### 6. Task Deadline Reminders

**What it does:**
- Automatically checks for tasks with approaching due dates every hour
- Sends a notification when a task is due tomorrow
- Sends a notification when a task is due in 3 days (only once)

**Backend file:** `backend/app/core/scheduler.py`

**How it works:**
- Runs as a background asyncio task inside the FastAPI app (started during app startup)
- Every hour it queries MongoDB for:
  - Tasks with `due_date` between now and tomorrow, not completed → sends "Due Tomorrow" notification
  - Tasks with `due_date` between tomorrow and 3 days, not completed, not yet reminded → sends "Due in 3 Days" notification + marks `deadline_reminded_3day: true`
- Checks preferences before sending (if user has this type disabled, no notification)

---

### 7. Daily / Weekly Email Digest

**What it does:**
- Sends a summary email of all notifications from the past day (or week)
- Users can enable/disable and choose frequency in Settings

**Backend file:** `backend/app/core/scheduler.py` (part of the same scheduler)

**How it works:**
- Every hour the scheduler checks if it's 8:00 AM UTC
- If yes, it queries all users who have `digest.enabled: true` and `digest.frequency: "daily"`
- Collects notifications from the past 24 hours
- Sends a nicely formatted HTML email with all notifications listed
- Same for weekly (past 7 days) — checked once a week
- Uses the `send_digest_email` function in `email_service.py`

**Where to control it:** Settings → Notifications → Daily/Weekly Digest section

---

### Central Notification Service

**File:** `backend/app/core/notification_service.py`

This is the brain that connects everything. Whenever any code creates a notification, it goes through this service:

```text
create_and_deliver(user_id, org_id, type, title, message, ...)
  ├── Check "in_app" preference → YES? → Save to MongoDB + Send via WebSocket
  ├── Check "email" preference → YES? → Send email via SMTP
  ├── Check "push" preference → YES? → Send push notification via Web Push API
  └── Return the notification document
```

The old notification code in `tasks.py` and `goals.py` was replaced to use this central service instead of duplicating the same logic.

---

## Configuration Guide

You need to set these in `backend/.env`:

```
# ── Email (SMTP) ──────────────────────────────────
SMTP_HOST=smtp.gmail.com          # Your SMTP server
SMTP_PORT=587                     # Usually 587 (TLS) or 465 (SSL)
SMTP_USER=you@gmail.com           # Your email username
SMTP_PASS=your-app-password       # Your email password / app password
SMTP_FROM=noreply@yesboss.app     # "From" address for emails

# ── Push Notifications (VAPID) ────────────────────
VAPID_PUBLIC_KEY=your-public-key  # Generate with: npx web-push generate-vapid-keys
VAPID_PRIVATE_KEY=your-private-key
VAPID_CLAIMS_EMAIL=admin@yesboss.app
```

**Notes:**
- Email is optional. If you don't configure SMTP, emails are skipped (no errors).
- Push notifications are optional. If you don't configure VAPID, push is skipped.
- All other features work without any configuration.
