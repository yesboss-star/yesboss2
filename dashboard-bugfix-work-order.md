# YesBoss — Dashboard Bug Fix Work Order (Corrected & Verified)

| | |
|---|---|
| **Project** | YesBoss — AI Business Operating System |
| **Scope** | Dashboard real-time pipeline, task completion flow, notifications, KPIs |
| **Audited by** | Rocky (Senior Software Engineering Agent) |
| **Reviewed by** | opencode (verified every bug + fix against source, 2026-08-04) |
| **Status** | Open — fixes not yet applied |

> This document is a **living work order**. It supersedes the earlier draft: every bug card has been
> **re-verified against the actual source**, the fixes have been **corrected where the draft was wrong**,
> and the implementation has been re-sequenced into deploy units. Apply fixes in the order of the
> **Implementation Plan (Section 5)**. Tick the **Master Checklist (Section 7)** as work lands.

---

## 1. How to use this document

1. Read a **bug card (Section 4)** — location, root cause, corrected fix.
2. Apply the fix in the codebase exactly as described.
3. Run the **Completion Check** for that bug.
4. Run the **AI Verification** command and record the output.
5. Tick the **Master Checklist (Section 7)** row and write a one-line evidence note.

### 🤖 Instructions for AI agents working from this file

- **Actually implement** the fixes and **actually run** the verification commands — not just acknowledge them.
- Work in the order of the **Implementation Plan (Section 5)**, not the bug ID order.
- Do **not** change the structure or IDs of this file (other agents may work from the same copy).
- After each fix, update the checklist row: `[x]`, **Fixed by**, **Verified by**, **Evidence**.
- If a fix is blocked, leave `[ ]`, mark `BLOCKED` in Notes, and explain why.
- **Golden rule applied throughout:** the report's original fixes contained 3 verified defects — they are
  already corrected inline in the bug cards below (marked **CORRECTION**).

---

## 2. Project quick map (needed by every agent)

| Area | Path | Notes |
|---|---|---|
| Backend app | `backend/app/` | FastAPI (Python 3.11). Routers in `app/api/`, core infra in `app/core/` |
| API wiring | `backend/app/main.py` | Routers manually registered; new endpoints must be added there |
| DB | MongoDB via `pymongo` (`app/core/database.py`) — synchronous calls from async routes | Collections + indexes declared centrally in `database.py` |
| Real-time | `backend/app/api/websocket.py` + `frontend/src/components/NotificationWatcher.tsx` + `frontend/src/hooks/useWebSocket.ts` | 2 sockets per page is normal (Watcher + page hook) |
| Notifications | `backend/app/core/notification_service.py` → `create_and_deliver()` | WS + email + push + prefs + rate-limit |
| Frontend | `frontend/src/` | Next.js 16 (App Router), React 19, Zustand stores in `src/stores/` |
| Route guard | `frontend/src/proxy.ts` | **Next.js 16 renamed `middleware.ts` → `proxy.ts` — never recreate `middleware.ts`** |
| Styling | Tailwind v4, CSS-first config in `frontend/src/app/globals.css` | No `tailwind.config.*` |
| Tests | `backend/tests/` (pytest, conftest at `backend/conftest.py`) | `testpaths=["tests"]`, `asyncio_mode=auto` |
| Deployment | `.github/workflows/deploy.yml` → VPS docker compose | Single image, ports 3000 + 8000 |

**Golden rules from the repo:**
- `app/core/zoho/base.py` **raises at import** if Zoho credentials are missing — env vars must be present to import anything touching it (tests import `app.main` → `.env` must be present).
- Do not reintroduce `middleware.ts` (Next.js 16 breaking change).
- MongoDB indexes belong in `database.py::_ensure_indexes`, not in route handlers.

---

## 3. Bug inventory (verified)

| ID | Severity | Priority | Bug (one line) | Area | Verified |
|---|---|---|---|---|---|
| B1 | 🔴 Critical | P0 | Any user can complete/approve any task — no permission check | `backend/app/api/tasks.py` | ✅ |
| B2 | 🔴 High | P0 | Scheduler sends WS messages on the wrong event loop → live connections die | `scheduler.py` / `notification_service.py` | ✅ |
| B3 | 🟡 Medium | P1 | Personal "task assigned" WS message is dead (email vs UID mismatch + **no `task_assigned` case in `useWebSocket.ts`**) | `tasks.py` + `useWebSocket.ts` + `TaskView.tsx` / `dashboard/page.tsx` | ✅ |
| B4 | 🔴 High | P0 | WebSocket accepts anyone into any org's live feed (no auth) | `backend/app/api/websocket.py` | ✅ |
| B5 | 🔴 High | P0 | Notification inbox replaced every 30 s → older items vanish | `NotificationWatcher.tsx` / `notificationStore.ts` | ✅ |
| B6 | 🔴 High | P0 | "Overdue" logic broken: string dates vs `datetime` bounds (tasks + scheduler) | `backend/app/api/tasks.py` + `backend/app/core/scheduler.py` | ✅ |
| B7 | 🔴 High | P0 | KPI cache key ignores employee email → cross-employee data leak | `backend/app/api/dashboard.py` | ✅ |
| B8 | 🔴 High | P0 | Accepted-KPI AI values never surface ("Data pending" forever) | `backend/app/api/dashboard.py` | ✅ |
| B9 | 🟡 Medium | P1 | Multi-assignee tasks invisible to everyone except the first assignee | `tasks.py` / `dashboard.py` / `TaskModal.tsx` | ✅ |
| B10 | 🟡 Medium | P1 | TaskView wires task-update events to the goal handler (dead handler) | `frontend/src/components/owners/TaskView.tsx` | ✅ |
| B11 | 🟡 Medium | P1 | `fetchDeduped` ignores headers/body — responses shared across callers | `frontend/src/lib/utils.ts` | ✅ |
| C1 | 🟢 Low | P2 | Garbled characters render in UI ("Â·", "â€"…) | `dashboard/page.tsx`, `DashboardView.tsx` | ✅ |
| C2 | 🟢 Low | P2 | Dead "Approve"/"Details" buttons on employee Pending Reviews | `frontend/src/app/dashboard/page.tsx` | ✅ |
| C3 | 🟢 Low | P2 | Dashboard fetches without auth headers (goals detail, escalations, meetings) | `frontend/src/components/owners/DashboardView.tsx` | ✅ |
| C4 | 🟢 Low | P2 | Persisted task store is not org-scoped — cross-org contamination | `frontend/src/stores/taskStore.ts` | ✅ |
| C5 | 🟢 Low | P2 | Unread notification badge counts across ALL orgs | `backend/app/api/notifications.py` | ✅ |

---

## 4. Bug cards (corrected)

> Legend: 🔴 Critical/High · 🟡 Medium · 🟢 Low. `…` = existing code, unchanged.
> **CORRECTION** = a fix in the original draft that was wrong and is now corrected here (verified against source).

---

### B1 🔴 — No permission check on `complete_task` / `approve_task`

- **Where:** `backend/app/api/tasks.py` — `approve_task` (line 617) and `complete_task` (line 729)
- **Verified root cause:** `update_task` (450–454) and `delete_task` (547–552) have the authz guard; `approve_task` / `complete_task` have **none** — confirmed by reading the file.
- **Fix — add the same guard to both endpoints**, immediately after `task = db.tasks.find_one(...)` and before the status update:

```python
if current_user and getattr(current_user, "id", None):
    t_org_id = task.get("organization_id", "")
    if not await _is_org_owner(db, t_org_id, current_user.id):
        user_email = (getattr(current_user, "email", "") or "").lower().strip()
        assignee_ids = [str(a).lower().strip() for a in (task.get("assignee_id") or [])]
        if (
            task.get("created_by") != current_user.id
            and (task.get("assignee_email") or "").lower().strip() != user_email
            and (task.get("assigned_to") or "").lower().strip() != user_email
            and user_email not in assignee_ids
        ):
            raise HTTPException(status_code=403, detail="Access denied")
```

- **✅ Completion Check:**
  1. Task created as owner (note `task_id`).
  2. A **different** employee: `POST /api/v1/tasks/{task_id}/complete` → **403**; same for `/approve` → **403**.
  3. Owner (or assignee): same calls → **200** + status change.
- **🤖 AI Verification:** `rg -n "Access denied" backend/app/api/tasks.py` → **4** hits (update, delete, approve, complete).

---

### B2 🔴 — Scheduler sends WS messages on the wrong event loop → live connections silently die

- **Where:** `backend/app/core/scheduler.py:27-45` (own event loop in daemon thread) → `backend/app/core/notification_service.py:135`
- **Verified root cause:** scheduler runs its own loop; `create_and_deliver` fires `asyncio.create_task(ws_manager.send_personal_message(...))` on the scheduler loop; send fails → `except Exception: stale.add(connection)` (websocket.py:44, 54) prunes the live socket.

**The fix:**

1. **New file `backend/app/core/ws_bridge.py`:**

```python
import asyncio
from typing import Awaitable, Callable

_main_loop: asyncio.AbstractEventLoop | None = None


def bind_main_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _main_loop
    _main_loop = loop


def safe_ws(coro_factory: Callable[[], Awaitable[None]]) -> None:
    """Run a websocket coroutine on the uvicorn loop from any thread/loop."""
    global _main_loop
    loop = _main_loop or asyncio.get_event_loop()
    current = asyncio.get_running_loop()
    if current is loop:
        loop.create_task(coro_factory())
    else:
        asyncio.run_coroutine_threadsafe(coro_factory(), loop)
```

2. **`backend/app/main.py` lifespan** — after the loop is running (inside `lifespan`, before `yield`):

```python
    from .core.ws_bridge import bind_main_loop
    import asyncio
    bind_main_loop(asyncio.get_running_loop())
```

3. **`backend/app/core/notification_service.py:135-138`** — replace `asyncio.create_task(ws_manager.send_personal_message(...))` with:

```python
        safe_ws(lambda: ws_manager.send_personal_message(
            {"type": "notification", "data": notif_doc},
            resolved_uid,
        ))
```

   (import: `from ..core.ws_bridge import safe_ws`)

4. **Harden `backend/app/api/websocket.py`** — a failed send must **not** remove the connection. In both `send_personal_message` and `broadcast_to_organization`:

```python
                except Exception as e:
                    logger.warning("WS send failed (kept alive): %s", e)
```

   (removes the `stale` sets / `-=` pruning from both methods)

- **✅ Completion Check:**
  1. Open dashboard, note "Live" indicator.
  2. Force a scheduler notification (deadline reminder / check-in).
  3. Connection **still live** afterwards; next broadcast arrives.
  4. Notification still arrives in-app (poll fallback).
- **🤖 AI Verification:**
  - `rg -n "safe_ws|run_coroutine_threadsafe" backend/app` → present.
  - `rg -n "stale\.(add|discard)|-=" backend/app/api/websocket.py` → gone (removal only on `WebSocketDisconnect`).

---

### B3 🟡 — Personal "task assigned" WS message is dead (email vs UID mismatch + missing frontend handler)

> **Review note (2026-08-04, verified):** Delivery **does** work via the org-wide `task_created` broadcast (`tasks.py:313`) and via `create_and_deliver` (UID-resolved). The **confirmed defect** is narrower: (a) the personal `task_assigned` send goes to the raw email while sockets register under UID, and (b) **`useWebSocket.ts:92-96` has no `task_assigned` case — the message is silently dropped**. If B4 lands without this fix, personal delivery becomes 100% dead.
> **Verified note (2026-08-04):** `resolve_uid` (`notification_service.py:28-41`) **already exists** and performs email→UID resolution (looks up `users` by uid, then email→uid, then `employees` email→uid). So **no new resolver is needed** — B3 only requires: the frontend `task_assigned` case (step 1) + wiring the personal send through the existing `resolve_uid` (step 2).

- **Where:** backend `tasks.py:319-323, 499-504` · `useWebSocket.ts:92-96` · `NotificationWatcher.tsx:47` (`user.uid`) vs `dashboard/page.tsx:108` & `TaskView.tsx:111` (`user.email`)
- **Fix — must be applied together with B4 (one unit):**

1. **`frontend/src/hooks/useWebSocket.ts`** — add the missing case (next to `task_created`, ~line 95):

```ts
            case "task_assigned": onTaskCreatedRef.current?.(msg.data); break;
```

2. **`backend/app/api/tasks.py`** — resolve before sending (both `create_task` loop ~319 and `update_task` new-assignees loop ~499):

```python
        from ..core.notification_service import resolve_uid

        for aid in assignee_ids:
            target = resolve_uid(aid)
            asyncio.create_task(ws_manager.send_personal_message(
                {"type": "task_assigned", "data": task_doc},
                target,
            ))
```

3. **Frontend — standardize WS connections on the Firebase UID** (matches B4's registration under `auth_user.id`):
   - `TaskView.tsx:111` → `const userId = (user as any)?.uid || (user as any)?.id;`
   - `dashboard/page.tsx:108` → same.

- **✅ Completion Check:**
  1. Employee dashboard open (Watcher connects with UID).
  2. Owner creates a task assigned to that employee.
  3. Task appears **instantly** (no refresh, no 30 s poll).
  4. DevTools → Network → WS frame shows **both** `task_assigned` and `task_created`.
- **🤖 AI Verification:**
  - `rg -n "task_assigned" frontend/src/hooks/useWebSocket.ts` → case present.
  - `rg -n "user\?\.uid|user\.uid" frontend/src` → every useWebSocket/Watcher call site uses `.uid`.
  - `rg -n "send_personal_message" backend/app/api/tasks.py` → every call wrapped in `resolve_uid(...)`.

---

### B4 🔴 — WebSocket endpoint is unauthenticated (anyone can join any org's live feed)

- **Where:** `backend/app/api/websocket.py:59-61`
- **Verified root cause:** no token verification, no org-membership check on connect.
- **⚠️ Must ship together with B3.** B4 registers sockets under `auth_user.id` (UID); B3 step 3 keeps frontend sockets in sync.

**CORRECTION 1 (critical):** The draft's membership check `db.employees.find_one({"organization_id": organization_id, "uid": uid})` **can never match** — the `employees` collection is keyed by `email` and **never stores `uid`** (verified: employees.py:152-162, 254-271). Query the **`users`** collection instead, which stores `uid` + `organization_id` (verified: auth.py:483).

**CORRECTION 2:** `verify_id_token` returns `None` on failure (firebase_admin.py:91-98) rather than raising — the draft's `try/except` never fires. Guard on the **result**, not the exception.

**The fix — `backend/app/api/websocket.py`:**

```python
@router.websocket("/ws/{organization_id}")
async def websocket_endpoint(websocket: WebSocket, organization_id: str, user_id: str = None, token: str = None):
    from ..core.firebase_admin import verify_id_token
    from ..core.database import get_database
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return
    auth_user = verify_id_token(token)          # CORRECTION 2: returns None, does not raise
    if not auth_user:
        await websocket.close(code=4001, reason="Invalid token")
        return

    db = get_database()
    org = None
    if db is not None:
        from bson import ObjectId
        org = db.organizations.find_one(
            {"_id": ObjectId(organization_id) if ObjectId.is_valid(organization_id) else organization_id},
            {"owner_id": 1, "co_owners": 1},
        )
    owners = set(org.get("co_owners") or []) | {org.get("owner_id")} if org else set()
    uid = auth_user.id
    is_owner = uid in owners
    is_employee = False
    if db is not None and not is_owner:
        # CORRECTION 1: employees collection has no `uid`; use `users`
        emp = db.users.find_one({"uid": uid, "organization_id": organization_id})
        is_employee = emp is not None
    if org is None or not (is_owner or is_employee):
        await websocket.close(code=4003, reason="Not a member")
        return

    await manager.connect(websocket, organization_id, auth_user.id)
    ...
```

Frontend token pass-through — `NotificationWatcher.tsx:59` and `useWebSocket.ts:66-72`:

```ts
const token = typeof window !== "undefined" ? localStorage.getItem("yesboss_id_token") : "";
const wsUrl = `${baseWsUrl}/ws/${encodeURIComponent(orgId)}?user_id=${encodeURIComponent(userId)}&token=${encodeURIComponent(token || "")}`;
```

(`yesboss_id_token` is already written by AuthContext.tsx:107.)

- **✅ Completion Check:**
  1. Without `token` → refused (4001).
  2. Valid token, user **not** in org → refused (4003).
  3. Valid org-member token → connects.
- **🤖 AI Verification:**
  - `rg -n "verify_id_token" backend/app/api/websocket.py` → present.
  - Manual/pytest via `TestClient.websocket_connect` with and without token.

---

### B5 🔴 — Notification inbox replaced every 30 s (older notifications vanish)

- **Where:** `NotificationWatcher.tsx:127-132` (poll `limit: 10`) + `notificationStore.ts:66` (`set({ notifications })` — full replace)
- **Verified:** yes — fetchNotifications replaces state wholesale.
- **Fix — `frontend/src/stores/notificationStore.ts`, in `fetchNotifications`, replace `set({ notifications, loading: false })` with a merge:**

```ts
set((state) => {
  const byId = new Map<string, Notification>();
  for (const n of state.notifications) byId.set(n.id, n);
  for (const n of notifications) byId.set(n.id, n);
  const merged = Array.from(byId.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  return { notifications: merged, loading: false };
});
```

- **✅ Completion Check:** Notifications page with >10 items; wait 30–40 s; all previous items still listed; no duplicates after WS + poll.
- **🤖 AI Verification:** `rg -n "set\(\(state\)" frontend/src/stores/notificationStore.ts` → merge block present (no bare `set({ notifications, ... })`).

---

### B6 🔴 — "Overdue" logic broken (string dates vs datetime bounds)

> **Review note (2026-08-04, verified):** The scheduler is the bigger offender — it compares BSON `datetime` bounds against *string* `due_date` fields in **12 query sites** (`scheduler.py:144,185,225,265,313,330` tasks; `410,444,483,522,569,586` goals). MongoDB type-ordering (**String < Date**): `$gte`/`$lte` never match strings (due-soon reminders never fire) and `$lt` matches **all** strings (everything flagged overdue → wrong escalations). Also `datetime.fromisoformat` crashes on legacy `Z`/`+00:00` formats at `scheduler.py:278,338,535,594` (swallowed → escalation branches silently skipped).

**The fix:**

1. **`backend/app/api/tasks.py`** — normalizer (near `_normalize_assignee_ids`):

```python
def _normalize_due_date(value):
    if not value:
        return value
    v = str(value).strip().replace("Z", "").replace("+00:00", "").replace("T00:00:00.000", "")
    if re.match(r"^\d{4}-\d{2}-\d{2}$", v):
        v = v + "T00:00:00"
    return v
```

2. Apply on write: `create_task` → `task_doc["due_date"] = _normalize_due_date(task.due_date)` (line 298); `update_task` → inside the `for k, v` loop add `if k == "due_date": v = _normalize_due_date(v)` (~line 465).

3. Fix overdue query (line ~370):

```python
    if overdue:
        now = datetime.utcnow().replace(microsecond=0).isoformat()
        query["due_date"] = {"$lt": now}
        query["status"] = {"$nin": ["completed", "approved"]}
```

4. **Fix all 12 scheduler query sites** — convert bounds to isoformat strings (stored `due_date` is a string everywhere):

```python
    now = datetime.utcnow().replace(microsecond=0).isoformat()
    tomorrow = (datetime.utcnow() + timedelta(days=1)).replace(microsecond=0).isoformat()
    in_3_days = (datetime.utcnow() + timedelta(days=3)).replace(microsecond=0).isoformat()
    days_3_ago = (datetime.utcnow() - timedelta(days=3)).replace(microsecond=0).isoformat()
    days_7_ago = (datetime.utcnow() - timedelta(days=7)).replace(microsecond=0).isoformat()
```

   Replace each `datetime`-typed bound in `due_date` queries with the matching isoformat string (keep `escalation_level` numeric comparisons unchanged).

5. **Defensive parser** for days-overdue at `scheduler.py:278,338,535,594`:

```python
def _days_overdue(due_date):
    """Parse a due_date string safely; returns days overdue or None."""
    if not due_date:
        return 0
    try:
        v = str(due_date).strip().replace("Z", "").replace("+00:00", "")
        return (datetime.utcnow() - datetime.fromisoformat(v)).days
    except Exception:
        return None
```

   Replace the 4 `datetime.fromisoformat(...)` sites with `_days_overdue(...)`; skip the overdue/escalation branch when it returns `None`.

6. **One-time backfill** (from `backend/`) — **runs against BOTH `tasks` and `goals`** (decision: yes — goals use `due_date` strings in the same scheduler queries):

```bash
python -c "
import re
from app.core.database import get_database
db = get_database()
for coll in ('tasks', 'goals'):
    for t in db[coll].find({'due_date': {'$exists': True}}):
        v = str(t.get('due_date')).strip().replace('Z','').replace('+00:00','')
        if re.match(r'^\d{4}-\d{2}-\d{2}$', v):
            v += 'T00:00:00'
        if v != t.get('due_date'):
            db[coll].update_one({'_id': t['_id']}, {'$set': {'due_date': v}})
    print(f'backfill done: {coll}')
"
```

- **✅ Completion Check:**
  1. `due_date = yesterday` → appears in `GET /tasks?overdue=true`.
  2. `due_date = tomorrow` → not overdue.
  3. Re-check with date-only (`2026-08-03`) and full ISO values.
  4. Force one scheduler cycle: due-within-24h task → due-soon reminder fires (previously never); 2-day-overdue task → escalations with a real count (previously all overdue or silently crashed).
- **🤖 AI Verification:**
  - `rg -n "_normalize_due_date" backend/app/api/tasks.py` → defined + used in create and update.
  - `rg -n "due_date.*isoformat|isoformat.*due_date|_days_overdue" backend/app/core/scheduler.py` → bounds are isoformat strings; 4 crash sites replaced.
  - `rg -n '"\$lt"|"\$gte"|"\$lte"' backend/app/core/scheduler.py` → no remaining `datetime`-typed bounds in `due_date` queries.

---

### B7 🔴 — KPI cache key ignores the employee email → cross-user data leak

- **Where:** `backend/app/api/dashboard.py:420-422` (cache key) · cache TTL 300 s (`app/core/cache.py`)
- **Verified:** `cache_key_data = {"org_id": org_id}` — `email` omitted while `user_filter` (line 433) uses it.
- **Fix — `get_dashboard_kpi`:**

```python
    cache_key_data = {"org_id": org_id}
    if email:
        cache_key_data["email"] = email.lower().strip()
    if accepted_kpis:
        cache_key_data["accepted_kpis"] = accepted_kpis
```

- **✅ Completion Check:** Employee A and B (same org) open dashboard → each sees their own numbers.
- **🤖 AI Verification:** `rg -n 'cache_key_data' backend/app/api/dashboard.py` → `email` in the dict; two parallel requests with different `email` → different bodies.

---

### B8 🔴 — Accepted-KPI AI values never surface ("Data pending" forever)

- **Where:** `backend/app/api/dashboard.py` — response cache early-return (line 423) + final `cache.set` (line 607) save the response **without** AI values; AI writes `_ai_kpi_cache` in the background (`_fetch_missing_kpis_async`).
- **Verified:** yes — cache path precedes/ignores AI values.
- **Fix — `backend/app/api/dashboard.py`:**

```python
    use_response_cache = not accepted_kpis
    cached = cache.get("kpi", cache_key_data) if use_response_cache else None
    if cached is not None:
        return cached
```

   and at the end:

```python
    if use_response_cache:
        cache.set("kpi", cache_key_data, kpi_response)
```

- **✅ Completion Check:** Owner accepts a KPI suggestion → upload doc containing the metric → refresh → tile shows a real value within ~1 min (the `AcceptedKPIBanner` polls every 30 s).
- **🤖 AI Verification:** `rg -n "use_response_cache|accepted_kpis" backend/app/api/dashboard.py` → cache path skipped when `accepted_kpis` set; AI-failure log line only on genuine failures.

---

### B9 🟡 — Multi-assignee tasks invisible to everyone except the first assignee

- **Where:** `TaskModal.tsx:245` (stores only `assignee_id[0]` into `assignee_email`) · `tasks.py:384-389` (list filter) · `dashboard.py:433` (KPI filter)
- **Verified:** yes — employee-scoping `$or` ignores the `assignee_id` array.
- **Fix:**
  - `backend/app/api/tasks.py` `list_tasks`:
    ```python
            query["$or"] = [
                {"created_by": current_user.id},
                {"assignee_email": user_email},
                {"assigned_to": user_email},
                {"assignee_id": user_email},
            ]
    ```
  - `backend/app/api/dashboard.py` `get_dashboard_kpi`:
    ```python
        user_filter = {"organization_id": org_id, "$or": [
            {"assignee_email": user_email},
            {"assigned_to": user_email},
            {"assignee_id": user_email},
        ]}
    ```
  - No frontend change required — the `assignee_id` array is the source of truth; `assignee_email` remains the notification fallback.
- **✅ Completion Check:** Task with 2 assignees (A and B) → both see it; B's KPI counts it.
- **🤖 AI Verification:** `rg -n '"assignee_id": user_email' backend/app/api/tasks.py backend/app/api/dashboard.py` → 2 hits.

---

### B10 🟡 — TaskView wires task-update events to the goal handler (dead handler)

- **Where:** `frontend/src/components/owners/TaskView.tsx:184-189`
- **Verified:** `onTaskUpdated` → `handleWsGoalUpdate` (updates the **goals** store; task objects never match goal ids).
- **Impact note (2026-08-04):** muted — `NotificationWatcher.tsx:87-90` already handles `task_updated` → `updateTaskFromWs`. Still worth fixing so the update path is direct.
- **Fix — `frontend/src/components/owners/TaskView.tsx`:**

```tsx
  const handleWsTaskUpdated = useCallback((data: any) => {
    if (!data) return;
    useTaskStore.getState().updateTaskFromWs(data);
  }, []);

  const { isConnected } = useWebSocket({
    organizationId: orgId,
    userId,
    onGoalCreated: handleWsGoalCreated,
    onTaskCreated: handleWsTaskCreated,
    onTaskUpdated: handleWsTaskUpdated,
  });
```

- **✅ Completion Check:** Two tabs; mark task complete in one → other tab's list updates without refresh.
- **🤖 AI Verification:** `rg -n "onTaskUpdated" frontend/src/components/owners/TaskView.tsx` → bound to `handleWsTaskUpdated`.

---

### B11 🟡 — `fetchDeduped` ignores headers/body → responses shared across callers

- **Where:** `frontend/src/lib/utils.ts:22-31` — key is `method|url` only
- **Verified:** yes.
- **Fix — `frontend/src/lib/utils.ts`:**

```ts
export function fetchDeduped(url: string, init?: RequestInit): Promise<Response> {
  const headers = init?.headers;
  const auth =
    headers instanceof Headers
      ? headers.get("Authorization")
      : (headers as Record<string, string> | undefined)?.["Authorization"] || "";
  const body = init?.body ? JSON.stringify(init.body) : "";
  const key = `${init?.method || "GET"}|${url}|${body}|${auth ? "auth" : "noauth"}`;
  const existing = inflightFetches.get(key);
  if (existing) return existing;
  const promise = fetch(url, init).finally(() => {
    inflightFetches.delete(key);
  });
  inflightFetches.set(key, promise);
  return promise;
}
```

> Security: never put the raw token in the key — use a boolean (`auth`/`noauth`) as above.

- **✅ Completion Check:** KPI banner (no headers) + dashboard (with headers) both call same URL concurrently → both valid; two POSTs with different bodies to same URL are **not** merged.
- **🤖 AI Verification:** `rg -n "fetchDeduped" frontend/src/lib/utils.ts` → key includes method, url, body, auth flag.

---

## 5. Minor / cosmetic fixes (P2)

### C1 🟢 — Garbled characters in UI text
- **Where:** `dashboard/page.tsx:511, 548-549`; `DashboardView.tsx:89, 110, 148, 444, 935, 1055, 1297, 3356, 3525, 3573, 3596`
- **Fix:** `Â·` → `·` ; `â€”` / `â€"` → `—`
- **✅ Check:** `rg -n "Â|â€" frontend/src` → 0 matches. Rebuild frontend.

### C2 🟢 — Dead "Approve" / "Details" buttons
- **Where:** `dashboard/page.tsx:393-394`
- **Fix:** Wire them: Approve → `POST /tasks/{id}/approve` (respecting B1's new permission rule); Details → `router.push('/tasks/{id}')`.
- **✅ Check:** Clicking each performs its action.

### C3 🟢 — Dashboard fetches without auth headers
- **Where:** `DashboardView.tsx:307` (`/goals/{id}`), `:3200` (escalations), `:3233` (meeting history)
- **Fix:** add `{ headers: getAuthHeaders() }` to each `fetch`.
- **✅ Check:** Network tab shows `Authorization: Bearer …` on those calls.

### C4 🟢 — Persisted task store not org-scoped
- **Where:** `taskStore.ts:353-356` (persist `yesboss-tasks`)
- **Decision (made — no hardcoding):** **clear-on-org-switch via store subscription** — no per-org persist key, no hardcoded naming scheme. In `frontend/src/stores/taskStore.ts`, after the store is created, subscribe to the organization store and clear task state when the org id changes:

```ts
import { useOrganizationStore } from "./organizationStore";

let lastOrgId: string | undefined;
useOrganizationStore.subscribe((state) => {
  const orgId = state.organization?.id;
  if (orgId !== lastOrgId) {
    lastOrgId = orgId;
    if (orgId) useTaskStore.setState({ tasks: [], currentTask: null, comments: [] });
  }
});
```

  (The org id is derived dynamically from the store — nothing hardcoded. `organizationStore.ts` does not import `taskStore.ts`, so there is no circular import.)
- **✅ Check:** Switch org → no tasks from previous org visible, even before refetch completes.

### C5 🟢 — Unread badge counts across all orgs
- **Where:** `backend/app/api/notifications.py:104-115` (`unread_notification_count`)
- **Fix:** accept optional `organization_id` query param, include in the count query (mirror `mark_all_notifications_read`); frontend `refreshUnreadCount` (notificationStore.ts:85) passes the current org id.
- **✅ Check:** User in 2 orgs with unread in only one → badge reflects the current org.

---

## 6. Implementation plan (do these in this order)

| Unit | Bugs | Deploy | Why |
|---|---|---|---|
| **1** | **B4 + B3** (+ B2 step 4, same file) | **One deploy — never split** | B4 registers sockets under UID; B3 step 3 is required or email-keyed sockets orphan. B3 step 1 is required for personal messages to surface. B2 hardening touches the same `websocket.py` methods. |
| **2** | **B1** | independent | Self-contained authz guard. |
| **3** | **B7 + B8** | one deploy | Same file, both trivial. |
| **4** | **B6** | one deploy | tasks + scheduler + backfill. |
| **5** | **B5, B9, B10, B11** | one deploy | Medium; frontend + small backend. |
| **6** | **C1–C5** | bundled with unit 5 | Low risk. |

**Unit 1 expanded task list (B4+B3+B2-harden):**
1. Create `backend/app/core/ws_bridge.py`.
2. `main.py` lifespan → `bind_main_loop(asyncio.get_running_loop())`.
3. `notification_service.py` → `safe_ws(...)` for the WS send.
4. `websocket.py` → token verification + corrected membership check + register under `auth_user.id` + keeps-alive hardening.
5. `tasks.py` → `resolve_uid(aid)` in both personal-send loops.
6. Frontend `useWebSocket.ts` → add `task_assigned` case + token in URL.
7. Frontend `NotificationWatcher.tsx` → token in URL.
8. Frontend `TaskView.tsx:111` + `dashboard/page.tsx:108` → `.uid`.

**Order within a unit:** backend → frontend → typecheck → local boot → manual smoke → tick checklist.

---

## 7. Master completion checklist

| ID | Severity | Status | Fixed by | Verified by | Evidence (command/output) |
|---|---|---|---|---|---|
| B4 | 🔴 | [x] | Claude Code | Claude Code | ws endpoints now require `token` via `verify_id_token`; auth + membership check + ping/pong in `app/api/websocket.py` |
| B3 | 🟡 | [x] | Claude Code | Claude Code | `resolve_uid` before `task_assigned` sends in `tasks.py`; frontend passes uid + `task_assigned` routed to `onTaskCreatedRef` in `useWebSocket.ts` |
| B2 | 🔴 | [x] | Claude Code | Claude Code | `safe_ws`/`bind_main_loop` in `app/core/ws_bridge.py`, wired in `main.py` lifespan + `notification_service.py` |
| B1 | 🔴 | [x] | Claude Code | Claude Code | permission guard (owner / creator / assignee) on `complete_task` and `approve_task` in `app/api/tasks.py` |
| B7 | 🔴 | [x] | Claude Code | Claude Code | `email` added to KPI cache key in `app/api/dashboard.py` |
| B8 | 🔴 | [x] | Claude Code | Claude Code | KPI cache bypass when `accepted_kpis` present (`use_response_cache = not accepted_kpis`) |
| B6 | 🔴 | [x] | Claude Code | Claude Code | `_normalize_due_date` at create/update; scheduler bounds as isoformat strings; `_days_overdue` safe parse; backfill ran — 0 tasks/0 goals |
| B5 | 🔴 | [x] | Claude Code | Claude Code | `fetchNotifications` merges by id (Map) + desc sort in `notificationStore.ts` |
| B9 | 🟡 | [x] | Claude Code | Claude Code | tasks list `$or` + KPI `user_filter` include `assignee_id` |
| B10 | 🟡 | [x] | Claude Code | Claude Code | `TaskView` `onTaskUpdated: handleWsTaskUpdated`; dead `handleWsGoalUpdate` removed |
| B11 | 🟡 | [x] | Claude Code | Claude Code | `fetchDeduped` key = method+url+body+auth in `lib/utils.ts` |
| C1 | 🟢 | [x] | Claude Code | Claude Code | mojibake sweep scripts; `rg "Â|â€|ðŸ|âœ"` → zero matches in frontend/src |
| C2 | 🟢 | [x] | Claude Code | Claude Code | Approve/Details wired in `app/dashboard/page.tsx` (`handleApproveReview`, `handleReviewDetails`) |
| C3 | 🟢 | [x] | Claude Code | Claude Code | 4 unauthenticated fetches in `DashboardView.tsx` now send `getAuthHeaders()` |
| C4 | 🟢 | [x] | Claude Code | Claude Code | `taskStore.ts` clears tasks/currentTask/comments on org change (subscribed to org store) |
| C5 | 🟢 | [x] | Claude Code | Claude Code | `/notifications/unread-count` accepts `organization_id`; frontend passes org id; `npm run lint`/`tsc` clean on touched files |

---

## 8. Verification commands (run before marking anything done)

### Backend (`backend/`)
```bash
python -m venv venv && .\venv\Scripts\activate        # Windows
source venv/bin/activate                              # Linux/macOS
pip install -r requirements.txt

pytest -m "not slow"           # fast suite (tests import app.main → needs .env present)
ruff check app/                # lint (CI: non-blocking)
python -c "import app.main"    # import check (catches Zoho/Google/route wiring)
```

### Frontend (`frontend/`)
```bash
npm install
npm run dev        # dev server, port 3000
npx tsc --noEmit   # type check
npm run lint       # eslint
npm run build      # production build (standalone output)
```

### Real-time smoke test (after Unit 1)
1. Start backend + frontend.
2. Two browsers: Owner + Employee of the same org.
3. Owner creates a task assigned to Employee → Employee sees it **instantly** (B3).
4. Employee marks it complete → Owner sees the update **instantly**; an Employee who is neither owner/assignee/creator cannot complete/approve it (B1).
5. Wait 6+ minutes for one scheduler cycle → connections stay green (B2).
6. WS without token → 4001; valid token, non-member → 4003; member → connects (B4).

### Local boot test (Mongo now allowlisted for local IP)
Boot on a free port (8000 is taken by Docker's prod container):
```powershell
Start-Process -FilePath "C:\VSLLP\krisha\3\backend\venv\Scripts\python.exe" `
  -ArgumentList "-m","uvicorn","app.main:app","--host","127.0.0.1","--port","8001" `
  -WorkingDirectory "C:\VSLLP\krisha\3\backend" `
  -RedirectStandardOutput "$env:TEMP\boot.out.log" -RedirectStandardError "$env:TEMP\boot.err.log" `
  -PassThru -WindowStyle Hidden
```
Poll `http://127.0.0.1:8001/api/v1/health` until `{"status":"ok",...}`.

---

## 9. Decisions recorded

| # | Question | Decision |
|---|---|---|
| D1 | B1/B6 test strategy | **Add mocked pytest unit tests** (monkeypatch `get_database` + `get_current_user_optional`), plus the live local-boot checks. |
| D2 | B6 backfill scope | **Include both `tasks` and `goals`** collections (goals use `due_date` strings in the same scheduler queries). |
| D3 | C4 approach | **Clear-on-org-switch via `useOrganizationStore.subscribe`** in `taskStore.ts` — no hardcoded per-org key, no naming helper. |
| D4 | B4 membership source | **`db.users`** (stores `uid`+`organization_id`); NOT `employees` (no `uid` field). |

---

## 10. Change log

| Date | Who | What |
|---|---|---|
| 2026-08-04 | Rocky | Initial audit (11 functional + 5 minor). |
| 2026-08-04 | opencode | Re-verified all bugs against source. Corrected 3 fix defects (B4 membership → `users`; B4 `verify_id_token` returns None; B3 missing `task_assigned` case called out). Expanded B6 to scheduler (12 sites). B3 downgraded 🔴→🟡, B10 impact noted muted. Re-sequenced into deploy units. Decisions D1–D4 recorded. |
| 2026-08-04 | opencode | Noted `resolve_uid` (`notification_service.py:28-41`) already handles email→UID — B3 needs no new resolver, just the frontend `task_assigned` case + existing `resolve_uid` wiring (B3 card + change log). |
| 2026-08-04 | opencode | All fixes landed per Section 5 plan: Unit 1 (B4+B3+B2 via `ws_bridge.py`, token-auth ws, `task_assigned`), Unit 2 (B1 guards), Unit 3 (B7+B8 cache), Unit 4 (B6 iso-string bounds + backfill, 0 rows), Unit 5 (B5, B9, B10, B11, C1–C5). Verified: `pytest -m "not slow"` 10 passed; `ruff` only 2 pre-existing UP017; `tsc --noEmit` clean; eslint only pre-existing issues; `rg "Â|â€|ðŸ|âœ"` zero matches. Master checklist (Section 7) fully ticked. |

---

*End of document — fix, verify, tick, repeat.*
