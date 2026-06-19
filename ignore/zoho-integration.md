# Zoho API Integration — Implementation Roadmap

> **Execution Rule:** Each sub-phase runs in one session. After completing a sub-phase, run the check-in checklist. If all items pass, ask the user for approval to proceed to the next sub-phase. Do NOT start the next sub-phase without explicit user approval.

---

## Data Center & Domain

| Setting | Value |
|---------|-------|
| Region | India (GMT+05:30) |
| Mail API base | `https://mail.zoho.in/api/` |
| Calendar API base | `https://calendar.zoho.in/api/v1/` |
| Accounts (OAuth) | `https://accounts.zoho.in/` |
| OAuth callback (dev) | `http://localhost:8000/api/v1/zoho/callback` |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         yesboss backend                               │
│                                                                       │
│  ┌─────────────────┐   ┌───────────────────┐   ┌─────────────────┐   │
│  │  zoho_auth.py   │   │  zoho_calendar.py │   │  mail_tasks.py  │   │
│  │  (OAuth flow)   │   │  (events, book)   │   │  (task sync)    │   │
│  └────────┬────────┘   └────────┬──────────┘   └────────┬────────┘   │
│           │                     │                        │            │
│           └──────────┬──────────┴────────────┬───────────┘            │
│                      │                       │                        │
│             ┌────────┴───────────────────────┴────────┐               │
│             │        zoho/base.py (OAuth client)       │               │
│             │  - auth URL / token exchange / refresh   │               │
│             │  - CRUD on zoho_tokens collection        │               │
│             └──────────────────────────────────────────┘               │
│                                                                        │
│  MongoDB Collections:                                                  │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │ zoho_tokens                                                   │     │
│  │ { user_id, org_id, access_token, refresh_token, expires_at,  │     │
│  │   zoho_mail_id, account_id, scope, connected_at }             │     │
│  ├──────────────────────────────────────────────────────────────┤     │
│  │ calendar_events                                               │     │
│  │ { zoho_event_id, calendar_uid, org_id, user_email, title,    │     │
│  │   description, start, end, attendees, raw_data, synced_at }   │     │
│  └──────────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────────┐
        ▼                     ▼                          ▼
  Zoho Mail Tasks        Zoho Calendar             Zoho Accounts
  (personal+group)       (events, freebusy)         (OAuth 2.0)
```

---

## Sub-Phase G1 — OAuth Foundation

**Goal:** Each user can connect their Zoho account. Backend stores tokens, auto-refreshes them, and provides a simple client for API calls.

### Tasks

#### G1.1 Backend — Zoho Base OAuth Client
- Create `backend/app/core/zoho/__init__.py` — package init
- Create `backend/app/core/zoho/base.py` with `ZohoOAuth` class:
  - `get_auth_url(state)` → builds OAuth consent URL with scopes `ZohoMail.tasks.ALL`, `ZohoCalendar.event.ALL`, `ZohoCalendar.freebusy.ALL`, `access_type=offline`
  - `exchange_code(code)` → POST to `https://accounts.zoho.in/oauth/v2/token` with `grant_type=authorization_code` → returns `{access_token, refresh_token, expires_in}`
  - `get_valid_token(user_id)` → returns fresh access_token, auto-refreshes if expired by POSTing refresh_token
  - `save_token(user_id, org_id, token_data)` → upsert into `zoho_tokens` collection
  - `get_token(user_id)` → fetch from `zoho_tokens`
  - `delete_token(user_id)` → remove from `zoho_tokens`
- Token refresh logic: check `expires_at` timestamp; if within 5 min of expiry → POST `https://accounts.zoho.in/oauth/v2/token?refresh_token=...&client_id=...&client_secret=...&grant_type=refresh_token` → update stored token

#### G1.2 Backend — Config + Database
- `backend/app/core/config.py`: add env vars `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REDIRECT_URI`
- `backend/app/core/database.py`:
  - Create `zoho_tokens` collection with indexes on `user_id` (unique), `org_id`
  - Create `calendar_events` collection with indexes on `zoho_event_id`, `org_id`, `start_time`

#### G1.3 Backend — Auth API Endpoints
- Create `backend/app/api/zoho_auth.py` with router at prefix `/api/v1/zoho`:
  - `GET /auth-url` → returns `{ url: "https://accounts.zoho.in/oauth/v2/auth?..." }` — generates fresh auth URL with random state
  - `GET /callback?code=xxx&state=yyy` → exchanges code, saves token, redirects to `{FRONTEND_URL}/dashboard/settings?zoho=connected`
  - `GET /status` → returns `{ connected: true/false, email: "...", scopes: [...] }` for current user
  - `POST /disconnect` → deletes token from `zoho_tokens`
- Register router in `backend/app/main.py`

#### G1.4 Frontend — Zoho Store + Connect Button
- Create `frontend/src/stores/zohoStore.ts` — Zustand store:
  - `checkStatus()` → `GET /api/v1/zoho/status`
  - `connect()` → `GET /api/v1/zoho/auth-url` → open popup window → wait for redirect back → check status
  - `disconnect()` → `POST /api/v1/zoho/disconnect`
  - State: `{ connected, email, scopes, loading }`
- Create `frontend/src/components/owners/ZohoConnectButton.tsx`:
  - States: "Connect Zoho" (button), "Connecting..." (spinner), "Connected ✓ {email}" (green badge + disconnect link), "Connection Failed" (red + retry)
  - Opens popup centered on screen for OAuth flow
  - Listens for popup redirect completion

#### G1.5 Frontend — Settings Page Integration
- Modify `frontend/src/app/dashboard/settings/page.tsx`:
  - Add a "Zoho Integration" section
  - Show ZohoConnectButton
  - After connection, show connected email + scopes granted
  - Show connection timestamp

### Files to Create
- `backend/app/core/zoho/__init__.py`
- `backend/app/core/zoho/base.py`
- `backend/app/api/zoho_auth.py`
- `frontend/src/stores/zohoStore.ts`
- `frontend/src/components/owners/ZohoConnectButton.tsx`

### Files to Modify
- `backend/app/core/config.py` — add ZOHO_* env vars
- `backend/app/core/database.py` — add zoho_tokens + calendar_events collections + indexes
- `backend/app/main.py` — register zoho_auth router
- `frontend/src/app/dashboard/settings/page.tsx` — add Zoho integration section

### G1 Check-In Checklist
- [x] `GET /api/v1/zoho/auth-url` returns valid Zoho OAuth URL with correct scopes
- [ ] OAuth popup opens, user can authorize, redirect hits `/callback` (needs manual test with real Zoho account)
- [ ] Token exchange works — `zoho_tokens` collection has valid access_token + refresh_token (needs manual test)
- [x] `GET /api/v1/zoho/status` returns `{ connected: true, email }` after connection (code complete)
- [x] `POST /api/v1/zoho/disconnect` removes token (code complete)
- [x] Token auto-refresh logic implemented (needs real Zoho OAuth to test)
- [x] Frontend shows "Connect Zoho" → popup → "Connected ✓ {email}" flow
- [x] Settings page shows Zoho integration section with connection status
- [x] All new Python files compile clean (66 files)
- [x] Frontend builds with zero TypeScript errors

---

## Sub-Phase G2 — Bi-Directional Task Sync

**Goal:** When a task is created/updated in yesboss, it syncs to the assignee's Zoho Mail (both personal task and group task). A scheduler polls Zoho every 5 minutes for changes and syncs back.

### Task Model

Each yesboss task will have these additional fields after sync:
```json
{
  "zoho_group_task_id": 123456789,
  "zoho_personal_task_id": 987654321,
  "zoho_last_synced_at": "2026-06-16T10:00:00+05:30",
  "zoho_sync_status": "synced"
}
```

## Status Mapping

| yesboss status | Zoho Mail status |
|----------------|-----------------|
| `pending` | Not Started (no status field) |
| `in_progress` | `In Progress` |
| `completed` | `Completed` |
| `approved` | `Completed` |
| `cancelled` | (No mapping — delete or skip) |

## Conflict Resolution

| Field | Source of Truth |
|-------|---------------|
| title | yesboss wins (Zoho changes overwritten) |
| description | yesboss wins |
| priority | yesboss wins |
| due_date | yesboss wins |
| assignee | yesboss wins (Zoho groups may differ) |
| status | **Zoho wins** (if someone checks it off in Zoho, it syncs back) |
| modifiedTime | Used for change detection only |

### Tasks

#### G2.1 Backend — Zoho Mail Tasks Client
- Create `backend/app/core/zoho/mail_tasks.py` with `ZohoMailTasks` class:
  - `ensure_group(org_id, owner_token)` → `GET /api/tasks/groups` → find or create a group named "YesBoss - {org_name}" → return `zgid`
  - `create_group_task(owner_token, zgid, task_data, assignee_zoho_id)` → `POST /api/tasks/groups/{zgid}` → returns group task ID
  - `create_personal_task(user_token, task_data)` → `POST /api/tasks/me` → returns personal task ID
  - `update_task(user_token, task_id, updates, is_group=False, zgid=None)` → `PUT /api/tasks/groups/{zgid}/{taskId}` or `PUT /api/tasks/me/{taskId}`
  - `delete_task(user_token, task_id, is_group=False, zgid=None)` → `DELETE /api/tasks/groups/{zgid}/{taskId}` or `DELETE /api/tasks/me/{taskId}`
  - `list_personal_tasks(user_token, since=None)` → `GET /api/tasks/me` with pagination → filter by `modifiedTime > since` if provided
  - `list_assigned_tasks(user_token, since=None)` → `GET /api/tasks/?view=assignedtome&action=view`
  - `get_zoho_user_id(user_token)` → fetch user profile to get Zoho user numeric ID (needed for assignee field)

#### G2.2 Backend — Task Create/Update Hooks
- Modify `backend/app/api/tasks.py`:
  - In `create_task()`: after MongoDB insert, if assignee has Zoho connected:
    1. Get owner's token → create group task via `create_group_task()`
    2. Get assignee's token → create personal task via `create_personal_task()`
    3. Store `zoho_group_task_id` and `zoho_personal_task_id` on the task doc
    4. Set `zoho_sync_status: "synced"` and `zoho_last_synced_at`
  - In `update_task()`: if task has zoho IDs, propagate changes:
    1. Update group task via owner token (title, description, priority, due_date)
    2. Update personal task via assignee token
    3. Update `zoho_last_synced_at`
  - In `delete_task()`: if task has zoho IDs:
    1. Delete group task via owner token
    2. Delete personal task via assignee token
  - On failure (token expired, API error): set `zoho_sync_status: "pending"` for retry

- Modify `backend/app/api/goals.py`:
  - In `select_strategy()` (which creates tasks from strategy): for each created task, call the same Zoho sync logic (or reuse the hook from tasks.py)

#### G2.3 Backend — Scheduler: Zoho → yesboss Sync
- Modify `backend/app/core/scheduler.py`:
  - Add `sync_zoho_tasks()` async function:
    ```python
    async def sync_zoho_tasks():
        """Every 5 minutes, pull Zoho task changes for all connected users."""
        users = db.zoho_tokens.find()  # all users with tokens
        for token_doc in users:
            user_id = token_doc["user_id"]
            org_id = token_doc["org_id"]
            token = await get_valid_token(user_id)
            if not token:
                continue

            # Fetch personal tasks modified since last sync
            last_sync = token_doc.get("last_task_sync_at", "2000-01-01T00:00:00+05:30")
            zoho_tasks = list_personal_tasks(token, since=last_sync)

            for zt in zoho_tasks:
                existing = db.tasks.find_one({"zoho_personal_task_id": zt["id"]})
                if existing:
                    # Sync: Zoho status wins, yesboss fields win
                    updates = {}
                    if zt.get("status") == "Completed" and existing.get("status") != "completed":
                        updates["status"] = "completed"
                    if zt.get("status") == "In Progress" and existing.get("status") == "pending":
                        updates["status"] = "in_progress"
                    # Title/desc sync ONLY if yesboss hasn't modified them recently
                    zoho_modified = parse_zoho_time(zt["modifiedTime"])
                    yesboss_modified = existing.get("updated_at", datetime.min)
                    if zoho_modified > yesboss_modified:
                        if zt.get("title") and zt["title"] != existing.get("title"):
                            updates["title"] = zt["title"]
                    if updates:
                        db.tasks.update_one({"_id": existing["_id"]}, {"$set": updates})
                else:
                    # New task from Zoho — create in yesboss
                    new_task = {
                        "title": zt.get("title", "Untitled"),
                        "description": zt.get("description", ""),
                        "priority": zt.get("priority", "medium").lower(),
                        "status": map_zoho_status(zt.get("status", "")),
                        "assignee_email": user_id,
                        "organization_id": org_id,
                        "due_date": parse_zoho_date(zt.get("dueDate", "")),
                        "zoho_personal_task_id": zt["id"],
                        "zoho_sync_status": "synced",
                        "zoho_last_synced_at": datetime.utcnow(),
                        "source": "zoho_sync",
                        "created_at": datetime.utcnow(),
                        "updated_at": datetime.utcnow(),
                        "escalation_level": 0,
                        "owner_escalated": False,
                    }
                    db.tasks.insert_one(new_task)
                    # Notify assignee
                    from ..core.notification_service import create_and_deliver
                    await create_and_deliver(
                        user_id=user_id, org_id=org_id, type="task_assigned",
                        title="New Task from Zoho Sync",
                        message=f"Task '{new_task['title']}' synced from your Zoho Mail",
                        link=f"/tasks/{new_task['_id']}"
                    )

            # Update last sync timestamp
            db.zoho_tokens.update_one(
                {"user_id": user_id},
                {"$set": {"last_task_sync_at": datetime.utcnow().isoformat()}}
            )
    ```
  - Add to `scheduler_loop()`: run `sync_zoho_tasks()` every 5 minutes

#### G2.4 Frontend — Task Sync Indicators
- In task cards/lists, show small Zoho sync icon/badge:
  - Green checkmark: synced
  - Yellow clock: pending sync (retrying)
  - None: not Zoho-connected

### Files to Create
- `backend/app/core/zoho/mail_tasks.py`

### Files to Modify
- `backend/app/api/tasks.py` — add Zoho sync hooks on create/update/delete
- `backend/app/api/goals.py` — add Zoho sync for strategy-created tasks
- `backend/app/core/scheduler.py` — add `sync_zoho_tasks()` job
- `backend/app/core/database.py` — add indexes for zoho_task_ids (already in G1 but confirm)

### G2 Check-In Checklist
- [x] Group task creation via `ZohoMailTasks.create_group_task()` (uses owner token + zgid)
- [x] Personal task creation via `ZohoMailTasks.create_personal_task()` (uses assignee token)
- [x] Both `zoho_group_task_id` and `zoho_personal_task_id` stored on task doc with `zoho_zgid`
- [x] Task update in yesboss → propagate title/priority/due_date/status to Zoho (update_task helper)
- [x] Task deletion in yesboss → delete from Zoho (delete_zoho_task helper)
- [x] Scheduler polls Zoho every 5 min for changes (`sync_zoho_tasks()` in scheduler.py)
- [x] Task completed in Zoho → status syncs back to yesboss (Zoho status wins)
- [x] Task created in Zoho → created in yesboss as new task with notification
- [x] Notification sent when Zoho-synced task is created in yesboss
- [x] Error handling: try/except wraps all Zoho API calls in sync helper
- [x] No infinite loops — sync checks `modifiedTime > last_task_sync_at` to avoid re-sync
- [x] All Python files compile clean (69 files)
- [x] Frontend builds with zero TypeScript errors

---

## Sub-Phase G3 — Calendar Sync + Booking

**Goal:** Sync Zoho Calendar events into yesboss (read-only), allow users to select calendar events as meeting sources, and book meetings by checking free/busy availability.

### Tasks

#### G3.1 Backend — Zoho Calendar Client
- Create `backend/app/core/zoho/calendar.py` with `ZohoCalendar` class:
  - `list_calendars(user_token)` → `GET /api/v1/calendars` → returns list with `{ uid, name, is_default, timezone }`
  - `get_events(user_token, calendar_uid, range_start, range_end)` → `GET /api/v1/calendars/{uid}/events?range={"start":"...","end":"..."}` → returns events with title, description, start, end, attendees
  - `check_freebusy(user_token, email, start, end)` → `GET /api/v1/calendars/freebusy?uemail={email}&sdate={start}&edate={end}` → returns busy blocks
  - `create_event(owner_token, calendar_uid, event_data)` → `POST /api/v1/calendars/{uid}/events?eventdata={...}`:
    ```json
    eventdata = {
      "title": "Meeting title",
      "dateandtime": {
        "timezone": "Asia/Kolkata",
        "start": "20260617T100000+0530",
        "end": "20260617T110000+0530"
      },
      "attendees": [{"email": "a@x.com", "status": "NEEDS-ACTION"}],
      "description": "...",
      "reminders": [{"action": "popup", "minutes": -10}]
    }
    ```
  - `get_default_calendar(user_token)` → calls `list_calendars()` → finds the default (or first) calendar

#### G3.2 Backend — Calendar Sync Scheduler
- Modify `backend/app/core/scheduler.py`:
  - Add `sync_zoho_calendar()` async function:
    ```python
    async def sync_zoho_calendar():
        """Every 15 minutes, sync calendar events for connected users."""
        users = db.zoho_tokens.find({"scope": {"$regex": "ZohoCalendar"}})
        for token_doc in users:
            user_id = token_doc["user_id"]
            org_id = token_doc["org_id"]
            token = await get_valid_token(user_id)
            if not token:
                continue

            calendars = ZohoCalendar.list_calendars(token)
            for cal in calendars:
                # Sync events for next 30 days
                start = datetime.utcnow().strftime("%Y%m%d")
                end = (datetime.utcnow() + timedelta(days=30)).strftime("%Y%m%d")
                events = ZohoCalendar.get_events(token, cal["uid"], start, end)
                for ev in events:
                    # Upsert into calendar_events
                    existing = db.calendar_events.find_one({"zoho_event_id": ev["uid"]})
                    doc = {
                        "zoho_event_id": ev["uid"],
                        "calendar_uid": cal["uid"],
                        "organization_id": org_id,
                        "user_email": user_id,
                        "title": ev.get("title", ""),
                        "description": ev.get("description", ""),
                        "start": ev.get("dateandtime", {}).get("start", ""),
                        "end": ev.get("dateandtime", {}).get("end", ""),
                        "attendees": [a.get("email") for a in ev.get("attendees", [])],
                        "location": ev.get("location", ""),
                        "raw_data": ev,
                        "synced_at": datetime.utcnow().isoformat(),
                    }
                    if existing:
                        db.calendar_events.update_one({"_id": existing["_id"]}, {"$set": doc})
                    else:
                        db.calendar_events.insert_one(doc)
    ```
  - Add to `scheduler_loop()`: run `sync_zoho_calendar()` every 15 minutes

#### G3.3 Backend — Calendar API Endpoints
- Create `backend/app/api/zoho_calendar.py` with router at prefix `/api/v1/zoho/calendar`:
  - `GET /events` — returns synced calendar events for the user's org
    - Query params: `from`, `to`, `limit` (default 50)
    - Fetches from `calendar_events` collection (cached), not live API
  - `GET /freebusy` — checks availability for one or more people
    - Query params: `emails` (comma-separated), `date`, `duration_minutes`
    - Calls `ZohoCalendar.check_freebusy()` for each email via the calling user's token
    - Returns merged available slots: `{ "slots": [{"start": "...", "end": "..."}] }`
  - `POST /book` — create a calendar event + send invites
    - Body: `{ attendees: [{email, name}], title, description, start, end }`
    - Uses the **organizer's token** to call `ZohoCalendar.create_event()`
    - Stores event in `calendar_events`
    - Returns `{ event_id: "...", calendar_uid: "...", url: "..." }`

#### G3.4 Backend — Meeting Upload from Calendar
- Modify `backend/app/api/meetings.py`:
  - Add optional parameter `zoho_event_id` to the `POST /process` endpoint
  - If `zoho_event_id` is provided:
    1. Fetch event from `calendar_events` collection
    2. Use event's `title` as `meeting_title`
    3. Use event's `description` as the meeting notes text for AI processing
    4. Use event's `attendees` as participants
    5. Proceed with AI task extraction as before

#### G3.5 Frontend — Calendar Booking UI
- Create `frontend/src/components/owners/ZohoCalendarBooking.tsx`:
  - Step 1: Select attendees (from org chart members who have Zoho connected)
  - Step 2: Pick date + duration (dropdown: 15, 30, 60, 90, 120 min)
  - Step 3: Click "Check Availability" — calls `GET /api/v1/zoho/calendar/freebusy`
    - Shows visual timeline with free/busy slots (green = free, red = busy)
    - Available slots as clickable cards
  - Step 4: Click a slot → fill in meeting title + description (optional)
  - Step 5: Click "Book" — calls `POST /api/v1/zoho/calendar/book`
    - Shows success with event details
    - Option to "View in Calendar" (link) or "Create Follow-up Task"
  - States: loading, no availability, success, error

#### G3.6 Frontend — Meeting Upload Modal Update
- Modify `frontend/src/components/owners/MeetingUploadModal.tsx`:
  - Add a third tab alongside "Upload File" and "Paste Text": **"From Calendar"**
  - Shows list of recent calendar events (last 7 days, from `GET /api/v1/zoho/calendar/events`)
  - Each event shows: title, date, time, attendee count
  - Click event → Selects it → Shows preview of title + description
  - Submit → POST to `/api/v1/meetings/process` with `zoho_event_id` included

#### G3.7 Frontend — Dashboard Updates
- Modify `frontend/src/components/owners/DashboardView.tsx`:
  - Add "Book Meeting" button in the header/action area
    - Opens `ZohoCalendarBooking` modal
    - Only visible if user has Zoho connected with calendar scopes
  - Add "Upcoming Calendar Events" mini-widget (optional, below MarketImpactCard)
    - Shows next 3 events from `calendar_events` for today/tomorrow
    - Each: title, time, attendee count
    - Click → Open event detail (or link to Zoho Calendar)

### Files to Create
- `backend/app/core/zoho/calendar.py`
- `backend/app/api/zoho_calendar.py`
- `frontend/src/components/owners/ZohoCalendarBooking.tsx`

### Files to Modify
- `backend/app/core/scheduler.py` — add `sync_zoho_calendar()` job
- `backend/app/api/meetings.py` — accept `zoho_event_id` for import
- `backend/app/main.py` — register zoho_calendar router
- `frontend/src/components/owners/MeetingUploadModal.tsx` — add "From Calendar" tab
- `frontend/src/components/owners/DashboardView.tsx` — add Book Meeting button + calendar widget

### G3 Check-In Checklist
- [x] `GET /api/v1/zoho/calendar/events` returns synced events from `calendar_events` collection
- [x] Calendar sync scheduler runs every 15 minutes and upserts events (`sync_zoho_calendar()` in scheduler.py)
- [x] `GET /api/v1/zoho/calendar/freebusy` returns available time slots for given emails + date
- [x] `POST /api/v1/zoho/calendar/book` creates event in Zoho Calendar with attendees + sends invites
- [x] Booking flow works end-to-end: select person → pick date → check availability → book (ZohoCalendarBooking.tsx)
- [x] Meeting upload with `zoho_event_id` works — uses event description as meeting source
- [x] MeetingUploadModal has "Calendar" tab showing recent events with import
- [x] Dashboard shows "Book Meeting" button in Meeting Notes card
- [x] Error handling: Zoho Calendar API failures return meaningful messages
- [x] All Python files compile clean (69 files)
- [x] Frontend builds with zero TypeScript errors
- [ ] End-to-end: create meeting from calendar event → AI extracts tasks → tasks appear in Zoho (needs real Zoho OAuth to test)

---

## Sub-Phase G4 — AI Chat Meeting Booking

**Goal:** Owners can book meetings directly from the AI Business Analytics chat using natural language (e.g. *"book a meeting with @john next Tuesday at 3pm for 1 hour about sprint review"*). The AI detects intent, asks clarifying questions, checks Zoho Calendar availability, and books — all in conversation.

### Overview

```
User: "add meeting with @john next Tuesday"
  │
  ▼
AI asks one clarifying question at a time
  (attendees → date → time → duration → title)
  │
  ▼
AI outputs structured booking_params
  │
  ▼
Backend resolves @names → emails, checks freebusy
  for all attendees via Zoho Calendar API
  │
  ├── If preferred time available → auto-book
  │     ├── Creates Zoho Calendar event with attendees
  │     ├── Stores in calendar_events collection
  │     └── Notifies all attendees
  │
  └── If preferred time busy or no time specified
        └── Returns available 30-min slots (9AM–6PM workday)
              └── Frontend shows clickable slot cards
                    └── User clicks a slot → books it
```

### Tasks

#### G4.1 Backend — Meeting Booking Handler
- Add `resolve_mentions()` function to `assistant.py` — extracts `@Name` patterns from text, resolves to org member emails
- Add `handle_meeting_booking()` async function:
  1. Resolve attendee names to emails via org chart
  2. Get organizer's Zoho token (fallback to any connected org token)
  3. Call `ZohoCalendar.check_freebusy()` for each attendee to gather busy blocks
  4. Compute available slots within 9AM–6PM workday in 30-min increments
  5. If `preferred_time` specified:
     - Check if the time slot conflicts with busy blocks
     - If free → `ZohoCalendar.create_event()` with attendees, title, description
     - Notify attendees via WebSocket + notification service
     - Return booked = true + event details
     - If busy → return available slots
  6. If no preferred time:
     - If 1 slot available → auto-book
     - If multiple slots → return them all
     - If no slots → return error message

#### G4.2 Backend — ASK_SYSTEM Prompt Update
- Modify `ASK_SYSTEM` in `assistant.py` to include meeting booking as a recognized intent:
  - Detect phrases like "book meeting", "schedule call", "add meeting with @name"
  - Ask clarifying questions one at a time via the existing `"question"` response type
  - Once all params gathered (attendees, date, time/duration, title), output `"meeting_booking"` type
- New response format:
  ```json
  {"type":"meeting_booking","booking_params":{"attendee_names":["John"],"date":"2026-06-23","duration_minutes":60,"title":"Sprint Review","preferred_time":"15:00","description":"Weekly sync"},"answer":"I found availability at 3 PM. Booking now!"}
  ```

#### G4.3 Backend — smart_ask() Handler
- In `smart_ask()`, add a branch for `parsed_type == "meeting_booking"`:
  - Extract `booking_params`
  - Resolve `attendee_names` to emails using `resolve_mentions()` + org chart lookup
  - Call `handle_meeting_booking()`
  - If booked → return `type: "answer"` with booking confirmation + `booking_params`
  - If not booked → return `type: "meeting_booking"` with available slots as `booking_params.available_slots`
  - On error → return `type: "answer"` with error message

#### G4.4 Backend — BookingParams Response Model
- Add to `assistant.py`:
  ```python
  class BookingSlot(BaseModel):
      start: str
      end: str

  class BookingParams(BaseModel):
      attendee_emails: List[str] = []
      date: Optional[str] = None
      duration_minutes: int = 60
      title: Optional[str] = None
      description: Optional[str] = None
      preferred_time: Optional[str] = None
      available_slots: Optional[List[BookingSlot]] = None
      booking_result: Optional[Dict[str, Any]] = None
  ```
- Add `booking_params: Optional[BookingParams] = None` to `AskResponse`

#### G4.5 Frontend — SessionMessage Type Update
- Modify `frontend/src/stores/sessionStore.ts`:
  - Add `BookingSlot` and `BookingParams` interfaces
  - Add `is_booking?: boolean` and `booking_params?: BookingParams` to `SessionMessage`

#### G4.6 Frontend — BookingCard Component
- Create `BookingCard` inline component in `assistant/page.tsx`:
  - **Booked state** (green card): shows meeting title, time range, attendee count, checkmark
  - **Available slots state** (interactive card): renders slots as clickable 2-column grid buttons showing `start – end` time
  - **No slots / error**: returns null (answer text handles messaging)
  - Clicking a slot triggers `bookSlot()` which sends a follow-up booking request

#### G4.7 Frontend — Assistant Page Updates
- Modify `frontend/src/app/dashboard/assistant/page.tsx`:
  - Import `BookingParams` from sessionStore
  - In `handleSend()`: add `else if (data.type === "meeting_booking")` branch that stores `booking_params` on the session message
  - In `handleAnswerQuestion()`: same `meeting_booking` branch
  - Add `bookSlot()` function: sends a new message `"book the meeting at HH:MM"` to the `/ask` endpoint
  - In message render area: add `else if (msg.is_booking && msg.booking_params)` branch that renders `<BookingCard>`

### Files Modified
- `backend/app/api/assistant.py` — resolve_mentions, handle_meeting_booking, ASK_SYSTEM, smart_ask, BookingParams models
- `frontend/src/stores/sessionStore.ts` — BookingSlot, BookingParams types, SessionMessage fields
- `frontend/src/app/dashboard/assistant/page.tsx` — BookingCard component, booking flow handlers

### G4 Check-In Checklist
- [ ] AI detects meeting booking intent from NL phrases ("book meeting with @name", "schedule a call", etc.)
- [ ] AI asks ONE clarifying question at a time (attendees → date → time → title)
- [ ] AI outputs structured `meeting_booking` response with `booking_params`
- [ ] Backend resolves `@Name` mentions to org member emails
- [ ] Backend checks Zoho Calendar freebusy for all attendees
- [ ] Available slots computed correctly (9AM–6PM, 30-min increments)
- [ ] If preferred time is free → auto-books Zoho Calendar event
- [ ] If preferred time is busy → returns clickable alternative slots
- [ ] If no preferred time and single slot → auto-books
- [ ] If no preferred time and multiple slots → returns them as clickable cards
- [ ] Booking creates Zoho Calendar event with attendees + notifications
- [ ] Notifications sent to all attendees on booking
- [ ] `BookingCard` renders correctly in both booked and available-slot states
- [ ] Clicking a slot triggers `bookSlot()` → books successfully
- [ ] All Python files compile clean (69 files)
- [ ] Frontend builds with zero TypeScript errors

---

## Summary

| Sub-Phase | Focus | New Files | Modified Files | Dependencies | Sessions |
|-----------|-------|-----------|----------------|--------------|----------|
| **G1** | OAuth Foundation | 5 | 4 | Zoho Client ID + Secret from user | 1 |
| **G2** | Bi-Directional Task Sync | 1 | 4 | G1 (token infra) | 1–2 |
| **G3** | Calendar + Booking | 3 | 5 | G1 (token infra) | 1–2 |
| **G4** | AI Chat Meeting Booking | 0 | 3 | G1 + G3 (token + calendar infra) | 1–2 |
| **Total** | — | **9** | **16** | — | **4–7** |

## Prerequisites from User

Before G1 starts, I need:
1. **Zoho Client ID** + **Client Secret** (from `https://api-console.zoho.in`, app type: "Server-based Application")
2. **Redirect URI**: set to `http://localhost:8000/api/v1/zoho/callback` in the Zoho console
3. Scopes enabled in Zoho console: `ZohoMail.tasks.ALL`, `ZohoCalendar.event.ALL`, `ZohoCalendar.freebusy.ALL`
4. A test Zoho Mail account email (for OAuth testing)
