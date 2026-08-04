# YesBoss — Dashboard Bug Report, Fix Plan & AI-Verified Completion Checklist

| | |
|---|---|
| **Project** | YesBoss — AI Business Operating System |
| **Scope** | Dashboard real-time pipeline, task completion flow, notifications, KPIs |
| **Audited by** | Rocky (Senior Software Engineering Agent) |
| **Audit date** | 2026-08-04 |
| **Status** | Open — fixes not yet applied |

---

## 1. How to use this document

This file is a **living work order**. It is written so that **any human or any AI coding agent** can:

1. **Read a bug card** (Section 4) — location, root cause, exact fix.
2. **Apply the fix** in the codebase exactly as described.
3. **Run the Completion Check** to prove the fix works.
4. **Run the AI Verification** (command + expected output) and record the result.
5. **Tick the checkbox** in the Master Checklist (Section 6) and write a short note.

### 🤖 Instructions for AI agents working from this file

- You are expected to **actually implement** the fixes and **actually run** the verification commands — not just acknowledge them.
- Work in the order of the **Priority** column (P0 → P1 → P2).
- Do **not** change the structure or IDs of this file (other agents may be working from the same copy).
- After each fix, update the checklist row: mark `[x]`, fill **Fixed by**, **Verified by**, and one-line **Evidence** (e.g. output of the verification command).
- If a fix cannot be completed (blocked, dependency missing), leave it `[ ]`, mark it `BLOCKED` in Notes, and explain why.
- At the end of the session, print the summary table (Section 6) so the humans can see exactly what is done.

### 🧑‍💻 Instructions for humans / reviewers

- If you share this file with a teammate, you both work on the same bug IDs — the IDs are the contract.
- Never merge a PR that contains an un-ticked P0 bug.

---

## 2. Project quick map (needed by every agent)

| Area | Path | Notes |
|---|---|---|
| Backend app | `backend/app/` | FastAPI (Python 3.11). Routers in `app/api/`, core infra in `app/core/` |
| API wiring | `backend/app/main.py` | Routers are manually registered in the list at `main.py:332` — new endpoints must be added there |
| DB | MongoDB via `pymongo` (`app/core/database.py`) — synchronous calls from async routes | Collections + indexes declared centrally in `database.py` |
| Real-time | `backend/app/api/websocket.py` + `frontend/src/components/NotificationWatcher.tsx` + `frontend/src/hooks/useWebSocket.ts` | 2 sockets per page is normal here (Watcher + page hook) |
| Notifications | `backend/app/core/notification_service.py` → `create_and_deliver()` | WS + email + push + prefs + rate-limit |
| Frontend | `frontend/src/` | Next.js 16 (App Router), React 19, Zustand stores in `src/stores/` |
| Route guard | `frontend/src/proxy.ts` | **Next.js 16 renamed `middleware.ts` → `proxy.ts` — never recreate `middleware.ts`** |
| Styling | Tailwind v4, CSS-first config in `frontend/src/app/globals.css` | No `tailwind.config.*` |
| Tests | `backend/tests/` (pytest) | Config in `backend/pyproject.toml` |
| Deployment | `.github/workflows/deploy.yml` → VPS docker compose | Single image, ports 3000 + 8000 |

**Golden rules from the repo:**
- `app/core/zoho/base.py` **raises at import** if Zoho credentials are missing — env vars must be present to import anything touching it.
- Do not reintroduce `middleware.ts` (Next.js 16 breaking change).
- MongoDB indexes belong in `database.py::_ensure_indexes`, not in route handlers.

---

## 3. Bug inventory (quick reference)

| ID | Severity | Priority | Bug (one line) | Area |
|---|---|---|---|---|
| B1 | 🔴 Critical | P0 | Any user can complete/approve any task — no permission check | `backend/app/api/tasks.py` |
| B2 | 🔴 High | P0 | Scheduler sends WS messages on the wrong event loop → live connections die | `scheduler.py` / `notification_service.py` |
| B3 | 🟡 Medium | P1 | Personal "task assigned" WS message is effectively dead (email vs UID mismatch + no frontend handler) | `tasks.py` + `useWebSocket.ts` + `TaskView.tsx` / `dashboard/page.tsx` |
| B4 | 🔴 High | P0 | WebSocket accepts anyone into any org's live feed (no auth) | `backend/app/api/websocket.py` |
| B5 | 🔴 High | P0 | Notification inbox is replaced every 30 s → older items vanish | `NotificationWatcher.tsx` / `notificationStore.ts` |
| B6 | 🔴 High | P0 | "Overdue" logic broken: inconsistent date formats compared as strings | `backend/app/api/tasks.py` |
| B7 | 🔴 High | P0 | KPI cache key ignores employee email → one employee sees another's numbers | `backend/app/api/dashboard.py` |
| B8 | 🔴 High | P0 | Accepted-KPI AI values never surface ("Data pending" forever) | `backend/app/api/dashboard.py` |
| B9 | 🟡 Medium | P1 | Multi-assignee tasks invisible to everyone except the first assignee | `tasks.py` / `dashboard.py` / `TaskModal.tsx` |
| B10 | 🟡 Medium | P1 | TaskView wires task-update events to the goal handler (dead handler) | `frontend/src/components/owners/TaskView.tsx` |
| B11 | 🟡 Medium | P1 | `fetchDeduped` ignores headers/body — responses shared across callers | `frontend/src/lib/utils.ts` |
| C1 | 🟢 Low | P2 | Garbled characters render in UI ("Â·", "â€"…) | `dashboard/page.tsx`, `DashboardView.tsx` |
| C2 | 🟢 Low | P2 | Dead "Approve"/"Details" buttons on employee Pending Reviews | `frontend/src/app/dashboard/page.tsx` |
| C3 | 🟢 Low | P2 | Dashboard fetches without auth headers (goals detail, escalations, meetings) | `frontend/src/components/owners/DashboardView.tsx` |
| C4 | 🟢 Low | P2 | Persisted task store is not org-scoped — cross-org contamination | `frontend/src/stores/taskStore.ts` |
| C5 | 🟢 Low | P2 | Unread notification badge counts across ALL orgs | `backend/app/api/notifications.py` |

---

## 4. Bug cards

> Severity legend: 🔴 Critical/High · 🟡 Medium · 🟢 Low
> In fix code blocks: `…` means "existing code, unchanged — leave it".

---

### B1 🔴 — No permission check on `complete_task` / `approve_task`

- **Where:** `backend/app/api/tasks.py` — `approve_task` (≈line 617) and `complete_task` (≈line 729)
- **Problem (simple words):** Deleting and editing a task checks "are you the owner / assignee / creator?" — but marking a task **complete** or **approved** checks nothing. Any logged-in user who knows a task ID can complete or approve it — even in another company.
- **Root cause:** The authz guard present in `update_task` (lines ~450–454) and `delete_task` (lines ~547–552) was not copied into `approve_task` / `complete_task`.

**The fix** — add the same guard to both endpoints, immediately after `task = db.tasks.find_one(...)` and before the status update:

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

Apply the identical block inside **both** `approve_task` and `complete_task`.

- **✅ Completion Check:**
  1. Create a task as the owner (note `task_id`).
  2. As a **different** employee: `POST /api/v1/tasks/{task_id}/complete` → expect **403**.
  3. Same for `POST /api/v1/tasks/{task_id}/approve` → expect **403**.
  4. As owner (or the assignee): same calls → expect **200** and status change.
- **🤖 AI Verification:**
  - `rg -n "Access denied" backend/app/api/tasks.py` → must appear in **4** places (update, delete, approve, complete).
  - Write/extend a pytest in `backend/tests/` asserting 403 for a non-owner and run `pytest backend/tests/ -m "not slow"`.

---

### B2 🔴 — Scheduler sends WS messages on the wrong event loop → live connections silently die

- **Where:** `backend/app/core/scheduler.py:27-45` (own event loop in daemon thread) → `backend/app/core/notification_service.py:135` (`asyncio.create_task(ws_manager.send_personal_message(...))`)
- **Problem (simple words):** Background jobs (deadline reminders, digests, check-ins) run on a **different event loop** than the live WebSocket connections. When a background job tries to send a message to a socket, the send fails, and the connection is **removed from the registry** — so real-time updates stop until the user reloads the page.
- **Root cause:** `create_and_deliver` fires `asyncio.create_task` on whatever loop is current. Inside the scheduler thread that is the scheduler's loop; the websocket transport belongs to the uvicorn loop → `RuntimeError` → `except Exception: stale.add(connection)` in `websocket.py:43,53`.

**The fix** — bridge sends to the main uvicorn loop:

1. New file `backend/app/core/ws_bridge.py`:

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

2. In `backend/app/main.py` lifespan (inside `async with` / startup, after the loop is running):

```python
from ..core.ws_bridge import bind_main_loop  # adjust import path as needed
bind_main_loop(asyncio.get_running_loop())
```

3. Replace every cross-loop send in `backend/app/core/notification_service.py:135-138`:

```python
        safe_ws(lambda: ws_manager.send_personal_message(
            {"type": "notification", "data": notif_doc},
            resolved_uid,
        ))
```

4. Also harden `backend/app/api/websocket.py` `broadcast_to_organization` / `send_personal_message` so a failed send **does not remove** the connection (log the error instead of `stale.discard`):

```python
                except Exception as e:
                    logger.warning("WS send failed (kept alive): %s", e)
```

- **✅ Completion Check:**
  1. Start backend, open the dashboard, note "Live" indicator.
  2. Force a scheduler notification (e.g. trigger a deadline reminder or check-in).
  3. Confirm the connection is **still live** afterwards (indicator stays green; next broadcast arrives).
  4. Confirm the notification still arrives in-app (poll fallback).
- **🤖 AI Verification:**
  - `rg -n "safe_ws|run_coroutine_threadsafe" backend/app` → must exist.
  - `rg -n "stale.add|stale.discard" backend/app/api/websocket.py` → must be gone (or only removal on `WebSocketDisconnect`).
  - Unit test (optional): call `safe_ws` from a spawned thread and assert the target coroutine completes on the main loop.

---

### B3 🟡 — Personal "task assigned" WS message is effectively dead (email vs UID mismatch + no frontend handler)

> **Review note (2026-08-04):** Original report said task assignments "never arrive" — that was overstated. **Delivery still works** via the org-wide `task_created` broadcast (`tasks.py:313`) and via `create_and_deliver` (which resolves UIDs and persists a notification). The **real, confirmed defect** is narrower: the *personal* `task_assigned` WS message is effectively dead, and if B4 lands without this fix, it becomes 100% dead (see coupling note below).

- **Where:** backend `tasks.py:319-323, 499-504` (sends personal WS message to raw assignee id — an email) · frontend `NotificationWatcher.tsx:47` (connects with `user.uid`) vs `dashboard/page.tsx:108` & `TaskView.tsx:111` (connect with `user.email`) · `frontend/src/hooks/useWebSocket.ts:92-96` (**no `task_assigned` case — the switch silently drops it**)
- **Problem (simple words):** Two independent breaks. (1) The browser listens on one ID, the server sends on another: `send_personal_message` is called with the raw `assignee_id` (an email), while `create_and_deliver` correctly resolves emails→UIDs via `resolve_uid()` (`notification_service.py:28-41`). (2) Even when email-keyed sockets *do* exist (TaskView/dashboard pages pass `user.email`, so the keys match), `useWebSocket.ts` has **no `task_assigned` case** — the message matches nothing and is dropped. The assignment is still visible via `task_created` broadcast + notification, which is why the symptom is "slow/partial", not "missing".
- **Root cause:** Direct WS sends skip `resolve_uid()` **and** the frontend message switch was never taught the `task_assigned` type.

**The fix** — must be applied together with **B4** (single unit):

1. Frontend — add the missing handler, `frontend/src/hooks/useWebSocket.ts`, in the message switch (next to `task_created`, ~line 95):

```ts
            case "task_assigned": onTaskCreatedRef.current?.(msg.data); break;
```

   (Reuse the `task_created` handler — `addTaskFromWs` already inserts into the store and marks it visible.)

2. Backend — resolve before sending, in `backend/app/api/tasks.py` (both `create_task` loop ~319 and `update_task` new-assignees loop ~499):

```python
        from ..core.notification_service import resolve_uid

        for aid in assignee_ids:
            target = resolve_uid(aid)
            asyncio.create_task(ws_manager.send_personal_message(
                {"type": "task_assigned", "data": task_doc},
                target,
            ))
```

3. Frontend — standardize all WS connections on the Firebase UID (matches B4's backend registration under `auth_user.id`):
   - `frontend/src/components/owners/TaskView.tsx:111` → `const userId = (user as any)?.uid || (user as any)?.id;`
   - `frontend/src/app/dashboard/page.tsx:108` → same change.
- **✅ Completion Check:**
  1. Open the employee dashboard (Watcher connects with UID).
  2. Owner creates a task assigned to that employee.
  3. The task must appear on the employee screen **instantly** (no refresh, no 30 s poll).
  4. DevTools → Network → WS frame shows a `task_assigned` message received **and** a `task_created` message (the latter proves the fallback path).
- **🤖 AI Verification:**
  - `rg -n "task_assigned" frontend/src/hooks/useWebSocket.ts` → case present.
  - `rg -n "user\?\.uid|user\.uid" frontend/src` → every `useWebSocket`/Watcher call site uses `.uid`.
  - `rg -n "send_personal_message" backend/app/api/tasks.py` → every call is wrapped in `resolve_uid(...)`.
  - ⚠️ **Coupling check:** after B4 is deployed, a `task_assigned` WS frame must still arrive at the assignee — B3 step 1 is required for that; B4 without B3 breaks personal task delivery entirely.

---

### B4 🔴 — WebSocket endpoint is unauthenticated (anyone can join any org's live feed)

- **Where:** `backend/app/api/websocket.py:59-61` (`/ws/{organization_id}`)
- **Problem (simple words):** The socket URL takes `organization_id` + `user_id` from the URL with **no login check**. Anyone who knows a company's org ID can connect and receive every task/goal broadcast for that company.
- **Root cause:** No token verification and no org-membership check on connect.
- **⚠️ Must be applied together with B3:** this fix registers sockets under `auth_user.id` (the Firebase UID). Until B3 step 3 standardizes the frontend connections on the UID, email-keyed sockets (TaskView/dashboard pages) will be orphaned — and without B3 step 1 (the `task_assigned` handler), personal assignment messages never surface at all. B4 + B3 = one unit; deploy together.

**The fix:**

1. Frontend passes the Firebase ID token — `NotificationWatcher.tsx:59` and `useWebSocket.ts:66-72`:

```ts
const token = typeof window !== "undefined" ? localStorage.getItem("yesboss_id_token") : "";
const wsUrl = `${baseWsUrl}/ws/${encodeURIComponent(orgId)}?user_id=${encodeURIComponent(userId)}&token=${encodeURIComponent(token || "")}`;
```

2. Backend verifies it — `backend/app/api/websocket.py`:

```python
@router.websocket("/ws/{organization_id}")
async def websocket_endpoint(websocket: WebSocket, organization_id: str, user_id: str = None, token: str = None):
    from ..core.firebase_admin import verify_id_token
    from ..core.database import get_database
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return
    try:
        auth_user = verify_id_token(token)
    except Exception:
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
        emp = db.employees.find_one({"organization_id": organization_id, "uid": uid})
        is_employee = emp is not None
    if org is None or not (is_owner or is_employee):
        await websocket.close(code=4003, reason="Not a member")
        return

    await manager.connect(websocket, organization_id, auth_user.id)
    ...
```

- **✅ Completion Check:**
  1. Without `token`: connection must be refused (close code 4001).
  2. With a valid token of a user **not** in the org: refused (4003).
  3. With a valid org member token: connects normally.
- **🤖 AI Verification:**
  - `rg -n "verify_id_token" backend/app/api/websocket.py` → present.
  - Manual test via `websocat`/Postman or a tiny pytest using `TestClient.websocket_connect` with and without token.

---

### B5 🔴 — Notification inbox replaced every 30 s (older notifications vanish)

- **Where:** `frontend/src/components/NotificationWatcher.tsx:127-132` (poll `limit: 10`) + `frontend/src/stores/notificationStore.ts:66` (`set({ notifications })` — full replace)
- **Problem (simple words):** The watcher polls every 30 s, and each poll **replaces the whole list** with the 10 newest. On the notifications page, everything older than the newest 10 disappears every 30 seconds — including notifications that just arrived via WebSocket.
- **Root cause:** `fetchNotifications` replaces state instead of merging by id.

**The fix** — `frontend/src/stores/notificationStore.ts`, inside `fetchNotifications`, replace `set({ notifications, loading: false })` with a merge (dedupe by id, keep newest-first):

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

- **✅ Completion Check:**
  1. Open the notifications page (has > 10 items).
  2. Wait 30–40 s (one poll cycle).
  3. All previously visible items must still be listed (order may change).
  4. No duplicate entries after a WS notification + poll.
- **🤖 AI Verification:**
  - `rg -n "set\(\(state\)" frontend/src/stores/notificationStore.ts` → `fetchNotifications` contains the merge block (no bare `set({ notifications, ... })`).
  - Manual: keep 12+ notifications, wait 1 minute, count stays ≥ 12.

---

### B6 🔴 — "Overdue" logic broken (date formats compared as strings)

> **Review note (2026-08-04):** Original fix only covered `tasks.py`. **The scheduler is the bigger offender** — it compares BSON `datetime` bounds against *string* `due_date` fields in ~12 queries. With MongoDB type ordering (**String < Date**), `$gte`/`$lte` never match string dates (due-soon reminders never fire) and `$lt` matches **all** string dates (everything is flagged overdue → wrong escalations). Fix both layers together.

- **Where:** `backend/app/api/tasks.py:368-371` (`due_date < now.isoformat()`) and write paths `create_task`/`update_task` · **`backend/app/core/scheduler.py` query sites: `144, 185, 225, 265, 313, 330` (tasks) and `410, 444, 483, 522, 569, 586` (goals) — bounds built as `datetime` objects** · `fromisoformat` crash sites: `scheduler.py:278, 338, 535, 594`
- **Problem (simple words):** Due dates are stored in mixed formats — some `2026-08-05`, some `2026-08-05T10:00:00Z`, some without `Z` — and the overdue query compares them like text. Lexicographic comparison of inconsistent formats misjudges deadlines → wrong overdue flags, wrong escalations, wrong deadline reminders. In the scheduler the mismatch is worse: it queries with real `datetime` objects, and MongoDB sorts types — all strings sort *before* all dates — so `due_date: {"$gte": now, "$lte": tomorrow}` never matches string dates (**due-soon reminders never fire**) while `due_date: {"$lt": now}` matches every string date (**everything counts as overdue → escalations fire wrongly**). Separately, `datetime.fromisoformat` at `scheduler.py:278, 338, 535, 594` crashes on legacy `Z`/`+00:00` formats — the crash is swallowed by broad `except`, so days-overdue / escalation branches are silently skipped.
- **Root cause:** No normalization of `due_date` on write; `datetime.utcnow().isoformat()` produces a different shape than stored values; scheduler compares `datetime` bounds to string fields and parses strings with a non-defensive parser.

**The fix:**

1. Add a normalizer in `backend/app/api/tasks.py` (near `_normalize_assignee_ids`):

```python
def _normalize_due_date(value):
    if not value:
        return value
    v = str(value).strip().replace("Z", "").replace("+00:00", "").replace("T00:00:00.000", "")
    if re.match(r"^\d{4}-\d{2}-\d{2}$", v):
        v = v + "T00:00:00"
    return v
```

2. Apply it on write: in `create_task` (`task_doc["due_date"] = _normalize_due_date(task.due_date)`) and in `update_task` (inside the `for k, v` loop, add `if k == "due_date": v = _normalize_due_date(v)`).

3. Fix the overdue query (line ~370):

```python
    if overdue:
        now = datetime.utcnow().replace(microsecond=0).isoformat()
        query["due_date"] = {"$lt": now}
        query["status"] = {"$nin": ["completed", "approved"]}
```

4. **Fix the scheduler queries** — `backend/app/core/scheduler.py`, all 12 sites (`144, 185, 225, 265, 313, 330` tasks + `410, 444, 483, 522, 569, 586` goals). Convert bounds to the same isoformat strings the normalizer produces (the `due_date` field is stored as a string everywhere):

```python
    now = datetime.utcnow().replace(microsecond=0).isoformat()
    tomorrow = (datetime.utcnow() + timedelta(days=1)).replace(microsecond=0).isoformat()
    days_3_ago = (datetime.utcnow() - timedelta(days=3)).replace(microsecond=0).isoformat()
    days_7_ago = (datetime.utcnow() - timedelta(days=7)).replace(microsecond=0).isoformat()
```

   Replace each `datetime`-typed bound in the `due_date` queries above with the matching isoformat string (keep `escalation_level` numeric comparisons unchanged).

5. **Add a defensive parser** for the days-overdue calculations at `scheduler.py:278, 338, 535, 594` (crashes on legacy `Z` / `+00:00` formats are swallowed and skip the escalation branch):

```python
def _days_overdue(due_date):
    """Parse a due_date string safely; returns days overdue (float) or None."""
    if not due_date:
        return 0
    try:
        v = str(due_date).strip().replace("Z", "").replace("+00:00", "")
        return (datetime.utcnow() - datetime.fromisoformat(v)).days
    except Exception:
        return None
```

   Replace the `datetime.fromisoformat(...)` expressions at all 4 sites with `_days_overdue(...)`; skip the overdue/escalation branch when it returns `None`.

6. One-time backfill (run once, in `backend/`):

```bash
python -c "
import re
from app.core.database import get_database
db = get_database()
for t in db.tasks.find({'due_date': {'$exists': True}}):
    v = str(t.get('due_date')).strip().replace('Z','').replace('+00:00','')
    if re.match(r'^\d{4}-\d{2}-\d{2}$', v):
        v += 'T00:00:00'
    if v != t.get('due_date'):
        db.tasks.update_one({'_id': t['_id']}, {'$set': {'due_date': v}})
print('backfill done')
"
```

- **✅ Completion Check:**
  1. Create a task with `due_date = yesterday` → appears in `GET /tasks?overdue=true`.
  2. Create a task with `due_date = tomorrow` → **not** overdue.
  3. Re-run the check with date-only (`2026-08-03`) and full ISO values.
  4. Force one scheduler cycle: a task due within 24 h must produce a **due-soon reminder** (previously never fired), and a task 2 days overdue must appear in escalations with a real overdue count (previously every task was "overdue" or the branch silently crashed).
- **🤖 AI Verification:**
  - `rg -n "_normalize_due_date" backend/app/api/tasks.py` → defined and used in both create + update.
  - `rg -n 'due_date.*isoformat|isoformat.*due_date|_days_overdue' backend/app/core/scheduler.py` → bounds are isoformat strings and all 4 fromisoformat sites are replaced with `_days_overdue`.
  - `rg -n '"\$lt"|"\$gte"|"\$lte"' backend/app/core/scheduler.py` → no remaining `datetime`-typed bounds in `due_date` queries (12 sites converted).
  - `pytest backend/tests/` — a test asserting overdue filtering correctness (add one).

---

### B7 🔴 — KPI cache key ignores the employee email → cross-user data leak

- **Where:** `backend/app/api/dashboard.py` — `cache_key_data = {"org_id": org_id}` (+ `accepted_kpis`) at the top of `get_dashboard_kpi`; SimpleCache TTL 300 s (`app/core/cache.py`)
- **Problem (simple words):** The KPI endpoint now caches its response for 5 minutes, but the cache key only contains the **org** — not the **employee email**. Employee A's completion rate/statistics get served to Employee B in the same company for up to 5 minutes.
- **Root cause:** `email` query param (used for employee scoping, `user_filter`) is omitted from `cache_key_data`.

**The fix** — `backend/app/api/dashboard.py`, in `get_dashboard_kpi`:

```python
    cache_key_data = {"org_id": org_id}
    if email:
        cache_key_data["email"] = email.lower().strip()
    if accepted_kpis:
        cache_key_data["accepted_kpis"] = accepted_kpis
```

- **✅ Completion Check:**
  1. Log in as Employee A, open dashboard, note completion rate.
  2. Log in as Employee B (same org), open dashboard.
  3. B must see **B's own** numbers, not A's.
- **🤖 AI Verification:**
  - `rg -n 'cache_key_data' backend/app/api/dashboard.py` → `email` appears in the dict.
  - Two parallel requests with different `email` params → different bodies.

---

### B8 🔴 — Accepted-KPI AI values never surface ("Data pending" forever)

- **Where:** `backend/app/api/dashboard.py` — new background `_fetch_missing_kpis_async` (writes `_ai_kpi_cache`) vs the top-of-function `cache.get("kpi", ...)` early return and the final `cache.set(...)` (which saves the response **without** AI values)
- **Problem (simple words):** The AI now computes accepted-KPI values in the background — but every request hits the 5-minute response cache **before** the AI results are consulted, and the cached copy was saved **before** the AI finished. Result: the tiles show "Data pending — upload more data" even though the AI completed the work; values appear only after the cache expires *and* only if the AI cache is still warm.
- **Root cause:** Response caching and AI-value caching are not reconciled.

**The fix** — `backend/app/api/dashboard.py`:

1. Bypass the response cache whenever the request depends on AI extraction:

```python
    use_response_cache = not accepted_kpis
    cached = cache.get("kpi", cache_key_data) if use_response_cache else None
    if cached is not None:
        return cached
```

2. At the end of the handler, only cache when safe:

```python
    if use_response_cache:
        cache.set("kpi", cache_key_data, kpi_response)
```

3. (Optional, better UX) When the background task completes, warm the response cache with the AI values merged — or simply let the frontend re-fetch once `_ai_kpi_cache` is warm (the `AcceptedKPIBanner` already polls every 30 s, so it will pick the values up on the next poll once the endpoint returns them).

- **✅ Completion Check:**
  1. Owner accepts a KPI suggestion.
  2. Upload a document containing the metric, then refresh the dashboard.
  3. The accepted-KPI tile must show a real value (not "Data pending") within ~1 minute (AI run time).
- **🤖 AI Verification:**
  - `rg -n "use_response_cache|accepted_kpis" backend/app/api/dashboard.py` → cache path is skipped when `accepted_kpis` is set.
  - Log line `logger.warning("AI accepted KPI value extraction failed...")` must not repeat on every request (only on genuine AI failures).

---

### B9 🟡 — Multi-assignee tasks invisible to everyone except the first assignee

- **Where:** `frontend/src/components/TaskModal.tsx:245` (`assignee_email: formData.assignee_id[0]`) · backend `tasks.py:384-389` (list filter) and `dashboard.py:356` (KPI filter)
- **Problem (simple words):** Only the first assignee's email is stored in the `assignee_email` field. The backend filters employee visibility by that single field — so the 2nd, 3rd… assignees get the notification but never see the task in their list or KPI.
- **Root cause:** Employee-scoping `$or` clauses check `assignee_email` / `assigned_to` only; the `assignee_id` array is ignored.

**The fix:**

1. `backend/app/api/tasks.py` `list_tasks` — add the array to the employee `$or`:

```python
            query["$or"] = [
                {"created_by": current_user.id},
                {"assignee_email": user_email},
                {"assigned_to": user_email},
                {"assignee_id": user_email},
            ]
```

2. `backend/app/api/dashboard.py` `get_dashboard_kpi` — same addition:

```python
        user_filter = {"organization_id": org_id, "$or": [
            {"assignee_email": user_email},
            {"assigned_to": user_email},
            {"assignee_id": user_email},
        ]}
```

- **✅ Completion Check:**
  1. Create a task with 2 assignees (A and B).
  2. A sees the task, B sees the task, B's KPI counts it.
- **🤖 AI Verification:**
  - `rg -n '"assignee_id": user_email' backend/app/api/tasks.py backend/app/api/dashboard.py` → 2 hits.
  - pytest: list tasks as each assignee → both return the task.

---

### B10 🟡 — TaskView wires task-update events to the goal handler (dead handler)

- **Where:** `frontend/src/components/owners/TaskView.tsx:184-189`
- **Problem (simple words):** `onTaskUpdated` is wired to `handleWsGoalUpdate` — a function that updates the **goals** store. Task objects are checked against goal IDs, never match, and are silently dropped. Real-time task status changes never update the goals/tasks screen.
- **Root cause:** Wrong handler for the `task_updated` message type.
- **⚠️ Impact note (2026-08-04):** Impact is **muted**, not catastrophic — `NotificationWatcher.tsx:87-90` already handles `task_updated` → `updateTaskFromWs`, so the global store stays live-updated and TaskView re-renders from the store. This fix still matters: it makes the update path direct and keeps the page working if the Watcher is removed/changed.

**The fix** — `frontend/src/components/owners/TaskView.tsx`:

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

- **✅ Completion Check:**
  1. Two tabs open on the org dashboard (TaskView on one).
  2. In the other tab, mark a task complete.
  3. The first tab's task list/status updates **without refresh**.
- **🤖 AI Verification:**
  - `rg -n "onTaskUpdated" frontend/src/components/owners/TaskView.tsx` → bound to `handleWsTaskUpdated` (not `handleWsGoalUpdate`).

---

### B11 🟡 — `fetchDeduped` ignores headers/body → responses shared across callers

- **Where:** `frontend/src/lib/utils.ts` (`inflightFetches` keyed by `method|url` only)
- **Problem (simple words):** Two callers using the same URL but different auth headers (the KPI banner calls without headers; the dashboard calls with headers) share one in-flight response. Today it works only because backend auth is optional — it will break the moment auth is enforced, and it would also collapse POSTs with different bodies.
- **Root cause:** Dedupe key omits auth + body.

**The fix** — `frontend/src/lib/utils.ts`:

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

> Security note: never put the raw token into the map key — use a boolean (`auth`/`noauth`), as above.

- **✅ Completion Check:**
  1. KPI banner (no headers) and dashboard (with headers) both call the same URL concurrently.
  2. Both still receive valid responses.
  3. Two POSTs with different bodies to the same URL are **not** merged.
- **🤖 AI Verification:**
  - `rg -n "fetchDeduped" frontend/src/lib/utils.ts` → key includes method, url, body, auth flag.

---

## 5. Minor / cosmetic fixes (P2)

### C1 🟢 — Garbled characters in UI text
- **Where:** `frontend/src/app/dashboard/page.tsx:511`, `frontend/src/components/owners/DashboardView.tsx:3525, 3573, 3596`, `frontend/src/app/dashboard/page.tsx:548-549`
- **Fix:** Replace mojibake with correct UTF-8 characters:
  - `Â·` → `·`
  - `â€”` / `â€"` → `—`
- **✅ Check:** `rg -n "Â|â€" frontend/src` → 0 matches. Rebuild frontend.

### C2 🟢 — Dead "Approve" / "Details" buttons
- **Where:** `frontend/src/app/dashboard/page.tsx:393-394`
- **Fix:** Wire them or remove them. If wiring: Approve → call the store's `approveTask`/backend `POST /tasks/{id}/approve` (respecting B1's new permission rule); Details → `router.push('/tasks/{id}')`.
- **✅ Check:** Clicking each button performs its action (or buttons no longer exist).

### C3 🟢 — Dashboard fetches without auth headers
- **Where:** `frontend/src/components/owners/DashboardView.tsx:307` (`/goals/{id}`), `:3200` (escalations), `:3233` (meeting history)
- **Fix:** Add `{ headers: getAuthHeaders() }` to each `fetch`.
- **✅ Check:** Network tab shows `Authorization: Bearer …` on those calls.

### C4 🟢 — Persisted task store not org-scoped
- **Where:** `frontend/src/stores/taskStore.ts:353-356` (persist `yesboss-tasks`)
- **Fix:** On org switch, clear the store. In `frontend/src/contexts/AuthContext.tsx` (or `organizationStore.setOrganization`), after a new org is set: `useTaskStore.setState({ tasks: [] })`. Better: persist key scoped per org (`name: \`yesboss-tasks-${orgId}\`` — requires a storage-name helper).
- **✅ Check:** Switch org → no tasks from the previous org visible, even before refetch completes.

### C5 🟢 — Unread badge counts across all orgs
- **Where:** `backend/app/api/notifications.py:114` (`unread_notification_count`)
- **Fix:** Accept optional `organization_id` query param and include it in the count query (mirror `mark_all_notifications_read`); frontend `refreshUnreadCount` passes the current org id.
- **✅ Check:** User in 2 orgs with unread in only one → badge reflects the current org only.

---

## 6. Master completion checklist

| ID | Severity | Status | Fixed by | Verified by | Evidence (command/output) |
|---|---|---|---|---|---|
| B1 | 🔴 | [ ] | | | |
| B2 | 🔴 | [ ] | | | |
| B3 | 🟡 | [ ] | | | |
| B4 | 🔴 | [ ] | | | |
| B5 | 🔴 | [ ] | | | |
| B6 | 🔴 | [ ] | | | |
| B7 | 🔴 | [ ] | | | |
| B8 | 🔴 | [ ] | | | |
| B9 | 🟡 | [ ] | | | |
| B10 | 🟡 | [ ] | | | |
| B11 | 🟡 | [ ] | | | |
| C1 | 🟢 | [ ] | | | |
| C2 | 🟢 | [ ] | | | |
| C3 | 🟢 | [ ] | | | |
| C4 | 🟢 | [ ] | | | |
| C5 | 🟢 | [ ] | | | |

---

## 7. Verification commands (run before marking anything done)

### Backend (`backend/`)
```bash
python -m venv venv && .\venv\Scripts\activate        # Windows
source venv/bin/activate                              # Linux/macOS
pip install -r requirements.txt

pytest                         # all tests
pytest -m "not slow"           # fast suite (default in CI)
ruff check app/                # lint (CI: non-blocking)
mypy app/                      # type check (CI: non-blocking)
```

### Frontend (`frontend/`)
```bash
npm install
npm run dev        # dev server, port 3000
npx tsc --noEmit   # type check
npm run lint       # eslint
npm run build      # production build (standalone output)
```

### Real-time smoke test
1. Start backend + frontend.
2. Two browsers: Owner + Employee of the same org.
3. Owner creates a task assigned to Employee → Employee sees it **instantly** (B3).
4. Employee marks it complete → Owner sees the update **instantly**, Employee cannot complete a task assigned to someone else (B1).
5. Wait 6+ minutes for one scheduler cycle → connections stay green (B2).

---

## 8. Change log

| Date | Who | What |
|---|---|---|
| 2026-08-04 | Rocky | Initial audit: 11 functional bugs (8 P0, 3 P1) + 5 minor issues. Document created. |
| 2026-08-04 | Reviewer + Rocky | Corrections applied after review, all verified against source: B3 downgraded 🔴 P0 → 🟡 P1 (real defect = missing `task_assigned` case in `useWebSocket.ts` + email/UID key mismatch; delivery fallback via `task_created` broadcast still works); B6 expanded to cover the scheduler (12 datetime-vs-string query sites at `scheduler.py:144,185,225,265,313,330,410,444,483,522,569,586` + MongoDB type-ordering note + `_days_overdue()` parser for crash sites `278,338,535,594`); B10 impact noted as muted (NotificationWatcher `task_updated` handler covers it); B4 marked must-ship-together-with-B3 (B4 registers sockets under UID; B3 frontend UID change required to avoid orphaning email-keyed sockets). |
| | | *(add rows here as fixes land)* |

---

*End of document — fix, verify, tick, repeat.*
