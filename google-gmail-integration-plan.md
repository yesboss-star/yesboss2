# Google (Gmail + Google Tasks + Google Calendar) Integration Plan

> **Status:** ✅ **Implemented — P1–P8 complete** (not yet deployed to live).
> **Goal:** Give every client a choice of calendar/task provider. Clients who don't use Zoho can connect their **Google (Gmail) account** and get the same features: task sync, calendar availability, AI meeting booking, and automatic task assignment.
> **Model:** Each client picks **one** provider — Zoho **OR** Google ("either/or"). No auto-fallback complexity. The **owner's** provider choice applies to the whole org (per-org dispatch).
> ✅ = shipped; ⬜ = not yet done.

---

## Table of Contents

1. [Overview & Goals](#1-overview--goals)
2. [User Experience — How Clients Use It](#2-user-experience--how-clients-use-it)
3. [Feature Parity: Zoho vs Google](#3-feature-parity-zoho-vs-google)
4. [Google Cloud Setup (One-Time, Manual)](#4-google-cloud-setup-one-time-manual)
5. [High-Level Architecture](#5-high-level-architecture)
6. [Data Model Changes](#6-data-model-changes)
7. [Backend Implementation](#7-backend-implementation)
8. [Frontend Implementation](#8-frontend-implementation)
9. [Automatic Task Assignment (Google Path)](#9-automatic-task-assignment-google-path)
10. [Scheduler / Background Sync](#10-scheduler--background-sync)
11. [Deployment to vsllp.live](#11-deployment-to-vsllplive)
12. [Testing & Verification](#12-testing--verification)
13. [Phased Implementation Order](#13-phased-implementation-order)
14. [Risks & Trade-offs](#14-risks--trade-offs)

---

## 1. Overview & Goals

The existing product connects to **Zoho Mail + Zoho Calendar** (see `backend/app/core/zoho/`). Many clients, especially small/new businesses, don't have Zoho — but almost everyone has **Gmail**. This plan adds a **Google (Gmail) provider** so those clients can:

- **Connect their Gmail account** in one click (OAuth).
- **Auto-assign tasks** that appear in their **Google Tasks** (via the Google Tasks API — Gmail itself has no To-Do, so Google Tasks is the natural equivalent of "Zoho Mail To-Do").
- **Read their Google Calendar** so the AI can check availability, recommend slots, and **auto-book meetings**.
- **Sync status back** — complete a task in Google Tasks and it flips to done in yesboss, and vice-versa.
- Keep using every existing feature (dashboard, goals, meetings, MoM, escalations, reminders) — the provider is just the transport.

**Non-goals:** Gmail email reading/sending, Google Drive, Google Meet recording. (Can be added later.)

---

## 2. User Experience — How Clients Use It

### 2.1 Choosing a provider (Settings → Integrations)

1. Client logs in and goes to **Dashboard → Settings → Integrations**.
2. They see two cards:

   | Card | Action |
   |------|--------|
   | **Zoho Mail & Calendar** | "Connect Zoho" button (existing) |
   | **Google (Gmail) & Calendar** | "Connect Gmail" button (new) |

3. Client clicks **"Connect Gmail"** → a Google consent popup opens:
   - They pick their Google account.
   - Google asks permission for: *See your email address*, *View your Gmail messages*, *Manage your tasks*, *View and manage events on your Google Calendar*.
   - They click **Allow**.
4. The popup closes and the card shows **"Connected — {email} (Gmail)"** with a **Disconnect** link.
5. **Either/or enforcement:** connecting Google automatically disconnects Zoho for that user, and connecting Zoho disconnects Google. Only one provider is ever active per user.

### 2.2 Daily use with Gmail (what the client gets)

- **Tasks appear in Google Tasks.** When the AI (from meetings, MoM, goals/strategy, chat) creates/assigns a task in yesboss, it is pushed into the assignee's **Google Tasks** under a "YesBoss" list automatically.
- **Complete a task in Google Tasks** → status syncs back to yesboss (green check in dashboard).
- **Complete a task in yesboss** → status syncs to Google Tasks.
- **AI schedules using your Google Calendar.** The AI checks free/busy of all attendees (their Google Calendars) before recommending a meeting time.
- **Auto-booked meetings appear in Google Calendar.** When the AI (or the booking modal) books a meeting, a Google Calendar event with attendees + invites is created.
- **No deadline set?** The system notifies the task creator ("please set a deadline") exactly like the Zoho path.
- **Overdue?** The same escalation chain (manager → owner) and reminder notifications fire, regardless of provider.

### 2.3 What the client does NOT need

- No Zoho account, no Zoho credentials, no separate sign-up.
- No manual task entry in two places — yesboss is the source of truth and pushes to Google.

---

## 3. Feature Parity: Zoho vs Google

| Feature | Zoho | Google | Notes |
|---------|------|--------|-------|
| OAuth connect | `ZohoOAuth` | `GoogleOAuth` | Google uses `accounts.google.com` + `oauth2.googleapis.com` |
| Task push | Zoho Mail To-Do (personal + org group) | Google Tasks personal list ("YesBoss") | **Google has no org "group"** — no group-task push; per-user list only |
| Task status sync back | Poll `ZohoMailTasks` | Poll Google Tasks | `needsAction` / `completed` → yesboss status |
| Calendar read | `ZohoCalendar.get_events` | Google Calendar `events.list` | RFC3339 vs Zoho `YYYYMMDDThhmmss` |
| Free/busy | Zoho `freebusy` | Google `freebusy.query` (batch) | Google can batch all attendees in one call |
| Book meeting | `ZohoCalendar.create_event` | Google `events.insert` | Google sends invite emails automatically |
| Default calendar | pick `isdefault` | pick `primary` | |
| AI chat booking | Zoho path in `assistant.py` | Same, provider-aware | Dispatch through `core/providers.py` |
| Meeting upload "From Calendar" | `/zoho/calendar/events` | `/google/calendar/events` | Frontend chooses base by provider |

---

## 4. Google Cloud Setup (One-Time, Manual)

> You (the developer) do this once. Credentials go on the **server's** `.env.live` (gitignored — never committed).

### Step 1 — Create a Google Cloud project
1. Go to [https://console.cloud.google.com](https://console.cloud.google.com).
2. Click project selector → **New Project** → name it `yesboss` → Create.

### Step 2 — Enable the APIs
3. **APIs & Services → Library** → enable each:
   - **Gmail API**
   - **Google Tasks API**
   - **Google Calendar API**

### Step 3 — Configure the OAuth consent screen
4. **APIs & Services → OAuth consent screen**:
   - User type: **External** (you may restrict testing to test users while unverified).
   - App name: `YesBoss`.
   - **Authorized domain:** `vsllp.live`.
   - Scopes: `email`, `profile`, `https://www.googleapis.com/auth/gmail.readonly`, `https://www.googleapis.com/auth/tasks`, `https://www.googleapis.com/auth/calendar`.
   - Test users: add the email addresses you'll test with.
5. Publish the app (until verified, Google shows a **"Google hasn't verified this app"** warning — users click "Continue". This is fine for launching; submit for verification later to remove the warning).

### Step 4 — Create OAuth 2.0 Client credentials
6. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → Application type: **Web application**.
7. **Authorized redirect URIs** (both):
   - `https://vsllp.live/api/v1/google/callback`  (production)
   - `http://localhost:8000/api/v1/google/callback` (local dev)
8. Copy the **Client ID** and **Client Secret**.

### Step 5 — Add to server env
9. On the VPS, edit `backend/.env.live` (this file is NOT in git — the deploy workflow pulls code only):

   ```bash
   GOOGLE_CLIENT_ID=xxxxxxxxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxx
   GOOGLE_REDIRECT_URI=https://vsllp.live/api/v1/google/callback
   ```

10. Restart the container: `docker compose up -d --force-recreate` (or the existing deploy flow).

---

## 5. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            frontend (Next.js)                             │
│  googleStore.ts ── GoogleConnectButton ── Settings/Integrations           │
│  ZohoCalendarBooking / MeetingUploadModal  ── uses getCalendarBase()      │
│      (points at /zoho/calendar/*  OR  /google/calendar/* by provider)     │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │  HTTPS
┌───────────────────────────────▼──────────────────────────────────────────┐
│                            backend (FastAPI)                              │
│                                                                            │
│  /api/v1/google/auth-url | /callback | /status | /disconnect  (google_auth) ✅│
│  /api/v1/google/calendar/events | /freebusy | /book       (google_calendar) ✅│
│                                                                            │
│  core/providers.py  ── get_connected_provider() / get_org_provider()        │
│        │  get_provider_token() / resolve_token_for_email()     ✅            │
│        │  (single dispatch: "zoho" | "google" | None — per-ORG, owner's)    │
│        │                                                                   │
│  ┌─────┴───────────────┐                 ┌──────────────────────────┐    │
│  │  core/zoho/*        │                 │  core/google/* (NEW) ✅  │    │
│  │  ZohoOAuth          │                 │  GoogleOAuth (base.py) ✅│    │
│  │  ZohoMailTasks      │                 │  GoogleTasks(gmail_tasks)✅│   │
│  │  ZohoCalendar       │                 │  GoogleCalendar (gcal.py)✅│   │
│  └─────────────────────┘                 └──────────────────────────┘    │
│                                                                            │
│  MongoDB: zoho_tokens (existing)   google_tokens (NEW) ✅   calendar_events│
│           tasks (add google_* ids) ✅  meetings             org_chart_members│
│                                                                            │
│  scheduler.py: sync_zoho_tasks/calendar + sync_google_tasks/calendar (NEW) ✅│
└──────────────────────────────────────────────────────────────────────────┘
```

**Key principle:** the Google stack **mirrors** the Zoho stack. Existing call sites (`tasks.py`, `goals.py`, `meetings.py`, `assistant.py`, `scheduler.py`) keep working — they branch once through `core/providers.py` to decide which provider to call.

---

## 6. Data Model Changes

### New collection: `google_tokens` ✅ (in `backend/app/core/database.py`)
Mirror of `zoho_tokens` (declared in `backend/app/core/database.py` `_ensure_collections` + `_ensure_indexes`):

```python
{
  "user_id": "<firebase-uid>",       # unique index ✅
  "org_id": "<org-ObjectId-string>", # index ✅
  "email": "user@gmail.com",
  "access_token": "...",
  "refresh_token": "...",
  "expires_at": "2026-08-01T...ISO",
  "google_id": "<google-account-id>",
  "scope": "openid email profile ...",
  "connected_at": "2026-08-01T...ISO",
  "provider": "google",
}
```

Indexes to add in `_ensure_indexes` (✅ done):
```python
db.google_tokens.create_index("user_id", unique=True)
db.google_tokens.create_index("org_id")
```

### Modified collection: `calendar_events` ✅
Add a **generic** event-id field so Google events don't collide with the existing unique `zoho_event_id` index:

```python
db.calendar_events.create_index("google_event_id", unique=True, sparse=True)  # ✅
# existing zoho_event_id index stays
```

Google-synced docs set `google_event_id` (Google's `id`); Zoho docs keep `zoho_event_id`.

### Modified collection: `tasks` ✅
Tasks pushed to Google get (analogous to the Zoho fields):
```json
{
  "google_task_list_id": "…",     // YesBoss Google Tasks list id ✅
  "google_task_id": "…",          // task id inside the list ✅
  "google_last_synced_at": "…",   // ✅
  "google_sync_status": "synced"  // or "pending" ✅
}
```

### Modified collection: `meetings` ✅
Meetings booked via Google set `google_event_id` instead of `zoho_event_id`. ✅ (in `google_calendar.py` book route)

---

## 7. Backend Implementation

### 7.1 Config (`backend/app/core/config.py`) + `.env.example` ✅
Add:
```python
GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI: str = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/v1/google/callback")
```
Add the same three vars to `backend/.env.example` under a "Google Integration" section. ✅ (also added to `backend/.env` dev + server `backend/.env.live`)

### 7.2 New core module `backend/app/core/google/` ✅

**`base.py` — `GoogleOAuth`** ✅ (mirrors `core/zoho/base.py`):
- `AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"`
- `TOKEN_URL = "https://oauth2.googleapis.com/token"`
- `get_auth_url(state)`:
  ```
  https://accounts.google.com/o/oauth2/v2/auth?client_id=…
    &redirect_uri={GOOGLE_REDIRECT_URI}
    &scope={FULL_SCOPE}
    &response_type=code
    &access_type=offline
    &prompt=consent
    &state={user_id}
  ```
- `exchange_code(code)` → POST to `TOKEN_URL` (same shape as Zoho).
- `refresh_access_token(refresh_token)` → POST to `TOKEN_URL`.
- `save_token(user_id, org_id, token_data, email)` → upsert into `google_tokens`.
- `get_token(user_id)`, `get_valid_token(user_id)` (auto-refresh within 5 min of expiry), `disconnect(user_id)`, `get_connected_users(org_id)`.
- `get_user_email(access_token)` → `GET https://oauth2.googleapis.com/userinfo?alt=json` → returns the account email.
- **Headers:** `Authorization: Bearer {access_token}` (Google) — NOT `Zoho-oauthtoken`.

**`gmail_tasks.py` — `GoogleTasks`** ✅ (Google Tasks API `https://tasks.googleapis.com/tasks/v1`):
- `ensure_list(access_token)` → `GET /users/@me/lists` → find or create list `"YesBoss"` → return list id.
- `create_task(access_token, list_id, task_data)` → `POST /lists/{list_id}/tasks`.
- `update_task(access_token, list_id, task_id, updates)` → `PATCH /lists/{list_id}/tasks/{task_id}` (status, title, due).
- `delete_task(access_token, list_id, task_id)` → `DELETE /lists/{list_id}/tasks/{task_id}`.
- `list_tasks(access_token, list_id, since)` → `GET /lists/{list_id}/tasks?completedMax=…` paginated.
- Status mapping:

  | yesboss status | Google Tasks |
  |---|---|
  | `pending` | `needsAction` |
  | `in_progress` | `needsAction` |
  | `completed` / `approved` | `completed` |
  | `cancelled` | delete task |
- Due date mapping: yesboss ISO → Google RFC3339 (`"due": "2026-08-01T00:00:00.000Z"`).

**`gcal.py` — `GoogleCalendar`** ✅ (Google Calendar API `https://www.googleapis.com/calendar/v3`):
- `get_primary_calendar_id(access_token)` → `GET /users/me/calendarList` → `primary` entry.
- `list_events(access_token, calendar_id, time_min, time_max)` → `GET /calendars/{id}/events?timeMin=…&timeMax=…&singleEvents=true&orderBy=startTime`.
- `get_freebusy(access_token, emails, time_min, time_max)` → `POST /freeBusy` with all attendees in **one batch request**.
- `create_event(access_token, calendar_id, event_data)` → `POST /calendars/{id}/events` with `{summary, description, start:{dateTime, timeZone}, end:{...}, attendees:[{email}], reminders}`.

**`__init__.py`** exports `GoogleOAuth`, `GoogleTasks`, `GoogleCalendar`. ✅

**Scopes (`FULL_SCOPE`):**
```
openid email profile
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/tasks
https://www.googleapis.com/auth/calendar
```

### 7.3 New API router `backend/app/api/google_auth.py` (prefix `/api/v1/google`) ✅
Mirror of `zoho_auth.py`:

| Endpoint | Behavior |
|---|---|
| `GET /auth-url` | `{"url": GoogleOAuth.get_auth_url(state=user_id)}` |
| `GET /callback?code=&state=&error=` | exchange code → resolve user/org → `save_token` → **disconnect any Zoho token for this user (either/or)** → 302 to `{FRONTEND_URL}/dashboard/settings?google=connected` |
| `GET /status` | `{connected, email, scopes, connected_at}` from `google_tokens` |
| `POST /disconnect` | delete `google_tokens` doc for user |

Also update `zoho_auth.py` callback to **disconnect the user's Google token** (either/or) after saving Zoho. ✅

### 7.4 New API router `backend/app/api/google_calendar.py` (prefix `/api/v1/google/calendar`) ✅
Mirror of `zoho_calendar.py`:

| Endpoint | Behavior |
|---|---|
| `GET /events` | valid Google token → primary calendar → `list_events` → upsert into `calendar_events` (with `google_event_id`) → return events |
| `GET /freebusy` | `emails, date, from_time, to_time` → resolve a Google token per attendee → `GoogleCalendar.get_freebusy` (batch) → `{available, busy, conflict, date, unchecked}` |
| `POST /book` | `{attendees, title, description, start, end, timezone}` → create event on owner's Google Calendar **and** each connected attendee's calendar → insert `calendar_events` + `meetings` (with `google_event_id`) → notifications + WS broadcast |

### 7.5 New provider dispatch module `backend/app/core/providers.py` ✅
```python
def get_connected_provider(db, user_id) -> str | None:   # ✅ "google" | "zoho" | None for a user
def get_org_provider(db, org_id) -> str | None:          # ✅ PER-ORG: owner's provider decides for the whole org
async def get_provider_token(db, user_id) -> tuple[str, str] | None:   # ✅ (provider, valid_token)
async def resolve_token_for_email(db, email, org_id=None) -> tuple[str, str] | None:   # ✅ (provider, token) for an attendee
```
> **Model note (implemented):** dispatch is **per-org** — the org **owner's** connected provider decides which provider every assignee uses. `get_org_provider()` falls back to a token doc stored with `org_id`. Callers (`tasks.py`, `goals.py`, `meetings.py`) each call `get_org_provider()` once and route the whole push through the matching provider path. ✅

### 7.6 Make existing call sites provider-aware ✅

| File | Change |
|---|---|
| `backend/app/api/tasks.py` | `sync_task_to_provider` dispatches via `get_org_provider()` → `sync_task_to_google` or `sync_task_to_zoho` (create/update/delete). Sets `google_*` ids when provider is Google. `delete_google_task` for deletes. |
| `backend/app/api/goals.py` | `sync_goal_to_provider` dispatches via `get_org_provider()` → `_sync_goal_to_google` or `sync_goal_to_zoho`. |
| `backend/app/api/meetings.py` | `_push_to_provider_todo` dispatches via `get_org_provider()` → `_push_google_todo` or `_push_to_zoho_todo`. (`_resolve_token_for_email` remains Zoho-only — dispatch happens at push level.) |
| `backend/app/api/assistant.py` | `handle_meeting_booking` resolves organizer via `get_provider_token()` and branches freebusy/booking between Google and Zoho. `sync_task_to_zoho` call sites → `sync_task_to_provider`. |
| `backend/app/core/scheduler.py` | `sync_google_tasks()` + `sync_google_calendar()` added and called in `scheduler_loop`. |
| `backend/app/main.py` | `google_auth_router` + `google_calendar_router` registered (prefixes `/api/v1/google`, `/api/v1/google/calendar`). |

---

## 8. Frontend Implementation

### 8.1 New store `frontend/src/stores/googleStore.ts` ✅
Clone of `zohoStore.ts` but hitting `/google/status`, `/google/auth-url`, `/google/disconnect`.

### 8.2 New component `frontend/src/components/owners/GoogleConnectButton.tsx` ✅
Clone of `ZohoConnectButton.tsx` → "Connect Gmail" / "Connected ✓ (email)" / "Disconnect".

### 8.3 Settings page `frontend/src/app/dashboard/settings/page.tsx` ✅
- **Integrations tab:** add a "Google (Gmail) & Calendar" card below the Zoho card, rendering `GoogleConnectButton`.
- Show which provider is currently active (Zoho or Google) as a badge; if both are somehow connected, show Zoho as active (or last-connected).
- In the existing query-param detection block (currently handles `?zoho=connected`), add `?google=connected` → call `googleStore.checkStatus()`, close the OAuth popup, toast "Google Connected". ✅

### 8.4 Calendar booking / meeting upload (provider-aware) ✅
Add a helper (e.g. in `frontend/src/lib/calendar.ts`) ✅:
```ts
function getCalendarBase(): string {
  const g = useGoogleStore.getState();
  if (g.connected) return `${API_URL}/google/calendar`;
  return `${API_URL}/zoho/calendar`;
}
```
Use it in:
- `frontend/src/components/owners/ZohoCalendarBooking.tsx` → `/events`, `/freebusy`, `/book` via `getCalendarBase()`. ✅
- `frontend/src/components/owners/MeetingUploadModal.tsx` → "From Calendar" tab via `getCalendarBase()`. ✅

### 8.5 Optional polish
- ⬜ Update marketing `frontend/src/components/Integrations.tsx` Gmail/Google tiles to link to Settings → Integrations.
- ⬜ Add a small "Sync to Google Tasks" indicator on task cards (like the planned Zoho badge).

---

## 9. Automatic Task Assignment (Google Path)

This is the heart of "how tasks get automatically assigned" — it works identically for Google and Zoho, differing only in the transport.

### 9.1 Sources that create/assign tasks automatically

| # | Trigger | How the assignee is chosen |
|---|---------|-----------------------------|
| 1 | **Meeting / MoM upload** (`POST /api/v1/meetings/process`) | AI extracts tasks from MoM → `suggested_assignee` (matched to `org_chart_members`/employees by name) → `suggested_deadline`. |
| 2 | **Goals / strategy selection** (`goals.py::select_strategy`) | AI generates per-department/owner action tasks; assignee derived from strategy + org chart. |
| 3 | **AI chat / assistant** | Natural-language commands ("assign X to @John by Friday") → AI emits task JSON with assignee email. |
| 4 | **Direct task creation** | Owner/manager picks assignee in the UI. |
| 5 | **Zoho/Google → yesboss sync** (reverse) | A task created directly in the user's provider is pulled into yesboss and assigned to that user. |

### 9.2 Assignment flow (Google provider) ✅ implemented (per-org dispatch)

```
[Task created / assigned in yesboss]
      │
      ├── 1. Resolve assignee email  →  org_chart_members.email (or owner email)
      │
      ├── 2. Pick org provider once  →  providers.get_org_provider(org_id)
      │         (owner's connected provider decides for the whole org)
      │
      ├── 3. Dispatch the whole push to that provider:
      │         provider = "google"
      │            ├── per assignee: GoogleTasks.ensure_list("YesBoss")
      │            ├── GoogleTasks.create_task(list_id, {title, notes, due})
      │            └── save google_task_list_id + google_task_id on the task doc
      │         provider = "zoho"   (existing ZohoMailTasks path)
      │
      ├── 4. If no deadline → notify task creator: "set a deadline"
      │
      ├── 5. Notify assignee (in-app + email/push)
      │
      └── 6. Scheduler watches:
              ├── Google task completed → yesboss status = completed
              ├── Google task edited title → yesboss title updated (conflict rules apply)
              └── New Google task created → yesboss task created + notification
```

### 9.3 Conflict resolution (mirrors Zoho rules)

| Field | Source of truth |
|---|---|
| title / description / priority / due_date / assignee | **yesboss wins** |
| status | **Provider wins** (checking it off in Google Tasks syncs back) |
| modifiedTime | used for change detection only |

### 9.4 Escalation & reminders (unchanged, provider-agnostic)
- Deadline reminders, overdue escalation (`escalation_level` 1 → manager, 2 → owner), and check-in metrics all read from the `tasks` collection — they don't care which provider the task lives in.

---

## 10. Scheduler / Background Sync

In `backend/app/core/scheduler.py`, add and wire: ✅

```python
async def sync_google_tasks():   # ✅ implemented
    """Every 5 min: pull Google Tasks changes for all google_tokens users."""
    users = db.google_tokens.find({"scope": {"$regex": "tasks"}})
    for doc in users:
        token = await GoogleOAuth(db).get_valid_token(doc["user_id"])
        if not token: continue
        list_id = (await GoogleTasks(db).ensure_list(token))
        tasks = await GoogleTasks(db).list_tasks(token, list_id, since=last_sync)
        # upsert new / update status+title in db.tasks (google_task_id match)
        # update doc.last_task_sync_at

async def sync_google_calendar():   # ✅ implemented
    """Every 15 min: pull Google Calendar events for all google_tokens users."""
    users = db.google_tokens.find({"scope": {"$regex": "calendar"}})
    for doc in users:
        token = await GoogleOAuth(db).get_valid_token(doc["user_id"])
        if not token: continue
        events = await GoogleCalendar(db).list_events(token, primary, now, now+30d)
        # upsert into calendar_events keyed by google_event_id
```

In `scheduler_loop()` ✅ (currently lines ~1151–1154):
```python
await sync_zoho_tasks()
await sync_google_tasks()      # ✅
if cal_sync_counter % 3 == 0:
    await sync_zoho_calendar()
    await sync_google_calendar()  # ✅
```

---

## 11. Deployment to vsllp.live

1. **Code:** push to `main` → `.github/workflows/deploy.yml` runs `git reset --hard && git pull` then `docker compose build --no-cache && docker compose up -d`.
2. **Env:** `.env.live` is gitignored and lives on the VPS only. Add the three `GOOGLE_*` vars to `backend/.env.live` on the server **before/at deploy**, then restart the container.
3. **Google Cloud:** ensure redirect URI `https://vsllp.live/api/v1/google/callback` is registered on the OAuth client (Section 4).
4. **Verify:** `curl https://vsllp.live/api/v1/google/auth-url` returns a Google authorize URL; complete a test connect from the live Settings page.

---

## 12. Testing & Verification

### Backend
```bash
cd backend
ruff check app/
mypy app/
pytest
```

### Frontend
```bash
cd frontend
npx tsc --noEmit
npm run lint
```

### Manual end-to-end (local, then live)
1. Google Cloud test users → connect with `localhost` redirect.
2. Create a task assigned to the Gmail user → verify it appears in **Google Tasks → YesBoss list** with correct due date.
3. Complete it in Google Tasks → verify yesboss task flips to `completed` within ~5 min.
4. Check AI free/busy → book a meeting → verify a **Google Calendar** event + invites for all attendees.
5. Create a task in Google Tasks directly → verify it syncs into yesboss with a notification.
6. Switch provider: connect Zoho while Google connected → confirm Google gets disconnected (and vice-versa).

---

## 13. Phased Implementation Order

| Phase | What | Files | Status |
|-------|------|-------|--------|
| **P1** | Google Cloud setup + env vars | `.env.live`, `.env.example`, `config.py` | ✅ done |
| **P2** | `core/google/` OAuth + token storage | `base.py`, `database.py` | ✅ done |
| **P3** | `google_auth.py` router + wiring | `google_auth.py`, `main.py` | ✅ done |
| **P4** | Frontend connect (store + button + settings) | `googleStore.ts`, `GoogleConnectButton.tsx`, `settings/page.tsx` | ✅ done |
| **P5** | `core/google/gcal.py` + `google_calendar.py` | `gcal.py`, `google_calendar.py`, `main.py` | ✅ done |
| **P6** | `core/google/gmail_tasks.py` + task push/sync | `gmail_tasks.py`, `tasks.py`, `goals.py`, `providers.py` | ✅ done |
| **P7** | Scheduler google sync | `scheduler.py` | ✅ done |
| **P8** | Provider-aware meetings/assistant + frontend calendar base | `meetings.py`, `assistant.py`, `ZohoCalendarBooking.tsx`, `MeetingUploadModal.tsx` | ✅ done |
| **P9** | Deploy to vsllp.live + live verification | — | ⬜ pending (needs commit+push to `main`) |

---

## 14. Risks & Trade-offs

- **Google Tasks has no "group" concept** (Zoho To-Do has shared groups). Google tasks go to each assignee's personal "YesBoss" list only; the org-level group push is skipped.
- **Per-org dispatch (decision):** the owner's provider decides for the whole org. Mixed Google+Zoho orgs are not supported — everyone should connect the same provider the owner picked. Simpler to reason about and matches the either/or client story.
- **Google "not verified" screen** until the app is submitted for verification — works with a one-click "Continue" for your users. Sensitive scopes trigger verification review; start with test users.
- **Refresh tokens:** Google only returns a refresh token the **first time** a user authorizes (with `prompt=consent`). If a user disconnects/reconnects, they must re-authorize — mirror the Zoho `prompt=consent` behavior to be safe.
- **OAuth popup blockers:** same popup+poll pattern as Zoho; if blocked, instruct user to allow popups.
- **Gmail scope is read-only (`gmail.readonly`)** — used only for identity/email display today. Sending emails is out of scope (can be added later with `gmail.send`).
- **Existing data is untouched:** `zoho_tokens` and `zoho_event_id` fields remain; Google data uses separate `google_tokens` / `google_event_id` fields, so no migration or index conflicts.
