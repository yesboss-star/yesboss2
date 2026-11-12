# YesBoss (YesB) — Project Analysis, Bug Report & Recommendations

| | |
|---|---|
| **Repo** | `C:\VSLLP\krisha\YesB` (github.com/yesboss-star/yesboss2), branch `main` |
| **Audit date** | 2026-10-31 |
| **Method** | Read-only. Three review passes (backend routes, backend core/agents, frontend) + manual checks of deploy config, CI, tests, git history |
| **Verified by running** | `pytest` → 119 passed · `npx tsc --noEmit` → clean |
| **Caveat** | "Checked myself" items (Section 7) were re-verified against the code. Everything else comes from the review passes' reading of the code and was not individually re-verified. `assistant.py` (3.8k lines), `DashboardView.tsx`, `AISummaryChat.tsx`, `OrchestrationView.tsx` and `report_generator.py` were only partly read, so more findings are likely. |

---

## 1. What the project does

YesBoss is an "AI Business Operating System" / "Digital CEO layer" — a multi-tenant SaaS.

- **Owners** onboard their company (profile, website scrape, uploaded documents, industry) and get an AI executive chat, goals, KPIs, reports and market intelligence.
- **Goals → tasks:** the AI breaks goals into tasks and delegates them. Tasks flow through assign → complete → approve, with overdue detection, escalation and reminders.
- **Employees** get their own tasks, an AI assistant, a journal/ideas feature and check-ins.
- **Integrations:** Zoho Mail / Calendar / Cliq (including a Cliq bot that nudges people about tasks), Google Calendar / Tasks, Firebase auth, email OTP, web push, WebSocket live updates.
- **Documents:** uploads are parsed, embedded into Qdrant and used as AI context.

**Stack**

- Backend: FastAPI (Python 3.11), MongoDB (sync `pymongo`) as source of truth, Qdrant, Supabase (barely used), DeepSeek/xAI LLMs, LangGraph agents.
- Frontend: Next.js 16, React 19, TypeScript, Zustand, Radix, Tailwind v4.
- Deploy: one Docker image (Next standalone + uvicorn `--workers 2`), nginx at vsllp.live, GitHub Actions SSH deploy on push to `main`.
- Size: ~35k LOC backend, ~34k LOC frontend, 396 tracked files.

## 2. Health snapshot

- 119 backend tests pass; frontend type-check is clean.
- Backend CI runs only ruff + mypy (both `continue-on-error`) and **never runs pytest**. Deploy is not gated on CI.
- `next.config.ts` sets `typescript.ignoreBuildErrors: true`.
- Status of older bugs in `BUGS_AND_FIXES.md`:
  - **Fixed:** B2, B4 (token + membership check present), B5, B7, B10, B11 (mostly), C1–C4.
  - **Still present:** B1 (guard only runs when a user is present, so unauthenticated callers skip it), C5 (notification badge counts all orgs), B6 (partial: still a string compare).
  - B3, B8, B9 were not fully verified.

## 3. Critical bugs

### 3.1 Secrets
1. **Supabase `service_role` key committed and shipped to browsers.** `docker-compose.yml:23` sets `NEXT_PUBLIC_SUPABASE_ANON_KEY` to a JWT whose decoded payload is `"role":"service_role"`. That role bypasses row-level security. The value is in git and baked into the public JS bundle. **Rotate.**
2. **Firebase admin service-account private key is in git history.** Added in commit `9f06655`, deleted in `1aa4f1e`; still readable by anyone with repo access. **Rotate and purge** (`git filter-repo` / BFG).

### 3.2 Unauthenticated account / org takeover
| # | Location | Problem |
|---|---|---|
| 3 | `auth.py:1021` | `POST /auth/forgot-password/send-otp` returns the OTP in the response (`debug_otp`). send-otp → verify-otp → reset = takeover of any account without email access. |
| 4 | `auth.py:707` | `PUT /auth/user/{uid}/role?role=owner` has no auth — anyone can set any user's role (Firebase claim + DB). |
| 5 | `auth.py:738` | `DELETE /auth/user/by-email/{email}` has no auth — deletes the Firebase user, `users` doc and `organizations` they own. |
| 6 | `auth.py:828`, `:591` | `/auth/update-phone` and `/auth/sync-user` have no auth — overwrite any user's phone/email/name, set `phone_verified`, rewrite claims. |
| 7 | `auth.py:249` | `/auth/login` never checks a password; returns uid, role, org id for any registered email. |
| 8 | `owner_requests.py:77, 155, 278` | `request-owner` is unauthenticated and returns the approve/reject links in the response; `GET /owner-requests` lists tokens. Anyone can become co-owner of any org. Approval is a GET and tokens never expire. |

### 3.3 Missing auth / tenant isolation (cross-tenant data access)
Many routers use `get_current_user_optional`, take `organization_id` from the body/query, and only check membership inside `if current_user:`. `dependencies/scope.py` has correct `is_org_member` / `is_org_owner` helpers, but they are not called in these files.

- `strategy_chat.py` (`/chat`, `/ask`, `/history`, `/people/search`, `/delegate`, `/sessions*` — lines ~150, 1017, 1041, 1091, 1164, 1208, 1309–1382): dump org context, create goals/tasks and notify people in any org; session GET/DELETE have no ownership check at all.
- `assistant.py` (lines ~439, 592, 2097, 2227, 2789, 3176, 3441, 3545, 3575, 3835): `/people/search`, `/delegate`, `/bulk-create-tasks`, `/generate-insights`, `/re-analyze`, `/diagnose-data`, `/chat`, `/ask`, `/ask-stream`, `/transcribe`.
- `assistant.py:1237-1259`: meeting booking trusts a client-supplied `user_email`, and falls back to `db.zoho_tokens.find_one({}, sort=connected_at desc)` — the most recent Zoho token of *any* tenant.
- `prompt.py:28, 56`: `/prompt/build` returns the full master prompt (profile, 20 goals, 30 tasks, team, documents) for any org.
- `finance.py:15, 81`: metrics and `extract` by `file_id` alone, any org.
- `goals.py:824, 1088, 1140` and `tasks.py:831, 910, 1035`: update/delete/approve/complete guards skipped for unauthenticated callers (B1 pattern). `POST /goals/delete-defaults` deletes defaults for any org. `tasks.py:883` `add_comment` has no check.
- Unauthenticated creates/writes: `goals.py:312`, `tasks.py:521, 1147, 1320`, `meetings.py:495, 657, 838`, `market_trends.py:267`. They also fan out WebSocket, email, notification and Cliq messages, so they work as spam/phishing relays.
- `employees.py:336-345`: any authenticated user can join any org as a member via `/employees/persona` (no org check when `organization_id` is omitted; writes an `org_chart_members` row that `is_org_member` then trusts).
- `organizations.py:43`: `POST /organizations` trusts body `owner_id`/`co_owners` (domain squatting). `:203, :225`: unauthenticated org list/search and `by-domain/{domain}` with an unescaped regex (`.*` returns any org plus owner name/email).
- `reports.py:697, 755, 782`: template upload/get/delete unauthenticated; stored raw bytes also break `upload.py` file listing (JSON encode → 500).
- `sessions.py:77-126`: insight confirm/dismiss fall back to `{"_id": oid}` with no user filter.

### 3.4 Injection / SSRF / file handling
- **SSRF, unauthenticated, with response read-back:** `/scrape/scrape` (`scrape.py:24-34`), `/social/*` (`social.py:30-74`), `/intelligence/*`, `/chatbot/persona/generate-question`, `/strategy-chat/upload-url` (`strategy_chat.py:431-470`, stores and re-serves the fetched content). `core/scraper.py` and `core/social_detector.py` have no host/IP allow-list, no redirect cap, no body-size cap. Trigger: `{"domain":"169.254.169.254"}` or `localhost:8000`.
- Further SSRF paths: `core/intelligence.py:599, 649-653` (LLM-returned domain fetched), `core/prompt_engine.py:443-476` (`website_url` fetched on every prompt build), `core/zoho/cliq.py:269-282` (`download_file` sends the Zoho OAuth bearer to a webhook-supplied URL), `push_subscriptions.py:35-49` (push endpoint stored unvalidated, later POSTed to).
- **Path traversal:** `upload.py:62-65` builds `uploads/{org}/{file.filename}` from the raw multipart filename; `strategy_chat.py:302, 335, 505, 577` use an unsanitised `organization_id` Form field for unauthenticated uploads. No extension allow-list or size limit.
- **Mongo TLS verification disabled:** `core/database.py:55-57` (`tlsAllowInvalidCertificates` / `tlsAllowInvalidHostnames`), including in production.
- **Regex injection / ReDoS:** unescaped user input in `$regex` at `organizations.py:50, 203, 225`, `employees.py` search, `strategy_chat` people search, `scheduler.py:79, 88`, `agents/journal_agent.py:63`.

### 3.5 OAuth and session
- `zoho_auth.py:62`, `google_auth.py:55`: OAuth `state` is the raw user uid (no nonce/signature) and the callback is unauthenticated — an attacker can bind their own Zoho/Google account to a victim, and the callback deletes the victim's other-provider token. A missing `state` saves the token under `user_id=""`. Error paths log/return raw `token_data`.
- `zoho_calendar.py:265`, `google_calendar.py:258`: `/book` and `/freebusy` look up any attendee's token across tenants.
- `zoho_calendar.py:116`, `google_calendar.py:121`: `users/search` unscoped for employees/co-owners (token doc `org_id` is empty), searches all tenants.
- `zoho_cliq.py:213-224, 279-340`: `role == "owner"` is treated as a global admin (role is self-selectable at signup). `bot/test-dm` open to any authenticated user.
- `websocket.py:60-110`: any org member can send `{"type":"notification","user_id":"<anyone>"}` (cross-tenant) and broadcast arbitrary `task_update` data. Token is passed in the query string (appears in logs).

### 3.6 Frontend
- **Stored XSS** in the AI chat markdown renderer: `components/AISummaryChat.tsx:37-124`, injected at `:1796` and `:1812`. Only fenced code is escaped; headers, tables, lists and paragraphs are not. AI output or a prompt-injected document can run script; messages persist in localStorage/server so it re-fires. Combined with the token in localStorage this is full session theft.
- Firebase ID token in localStorage (`contexts/AuthContext.tsx:179` and several stores) and in WebSocket URLs.
- `components/owners/YourFilesCard.tsx:119`: `window.open(URL.createObjectURL(blob))` — an uploaded HTML/SVG would run in the app origin.
- Open-redirect bypass: `app/login/page.tsx:74-78, :124, :253` (`/login?redirect=/\evil.com`); same weak check in `signup/page.tsx:162`, `onboarding/employee/page.tsx:269, 882`, `onboarding/owner/page.tsx:1913`.

## 4. High-severity functional bugs

| # | Where | Problem |
|---|---|---|
| 1 | `core/file_processor.py:35, 44` | `fitz.open(..., doc_type="pdf")` is the wrong kwarg (`filetype`) → TypeError; fallback imports `PyPDF2`, which isn't installed (only `pypdf`). **Every PDF yields empty text.** |
| 2 | `core/scheduler.py:161, 185-186` | Compares aware `remind_at` with naive `utcnow()` → TypeError swallowed by `except: continue`. **Meeting reminders never send.** |
| 3 | `core/scheduler.py:117-121` | MoM reminder queries `end_dt` with datetimes, but meetings store ISO strings → never matches. Shares the `reminder_sent` flag with pre-meeting reminders. |
| 4 | `core/notification_service.py:157-160` | `notif_doc` contains a `datetime` → `send_json` raises TypeError, swallowed in `websocket.py`. **Real-time notifications never deliver.** |
| 5 | `start-standalone.sh:36-39` + `main.py:162` | `uvicorn --workers 2`, each worker starts its own scheduler thread → **duplicate** deadline/escalation/digest emails, notifications, Zoho/Google imports (no unique index on `zoho_personal_task_id`/`google_task_id`), Cliq DMs, `owner_briefings` rows. |
| 6 | `scheduler.py:497-529` | `goals_due_soon` never sets/filters a "reminded" flag → the "due tomorrow" notification repeats every hour. |
| 7 | `contexts/AuthContext.tsx:178-179` | ID token written once; no `onIdTokenChanged`. **App returns 401 after ~1 hour**, sockets reconnect forever with the expired token. |
| 8 | many frontend files | Mutating calls send no `Authorization` header (`AISummaryChat`, `GoalModal`, `MeetingUploadModal`, `onboarding/owner`, `dashboard/profile`, `dashboard/ideas`, `organizationStore`, `assistantStore`, …). Either endpoints are open or calls fail silently. |
| 9 | `core/zoho/base.py:29-32` | Raises at import if Zoho creds are missing; `main.py` imports `zoho_auth` at top level → **app won't boot Google-only**. Also a leftover `print("*** ZOHO BASE LOADED ***")` (line 27). |
| 10 | `scheduler.py:220-231, 308`, `tasks.py:480-485, 1285, 1320`, `strategy_chat.py:1228/1256`, `meetings.py:657` | Due dates stored in mixed formats and compared as strings. Date-only tasks go "overdue" at 00:00 UTC (05:30 IST) on the due day; "31/10/2026"-style values are never overdue. |
| 11 | `core/check_in_service.py:55, 77` | `$lt: ["$due_date", now]` compares string to datetime → every task with a due date counts as overdue in the Weekly Check-In. `:18, :103` raise TypeError (naive − aware). |
| 12 | `core/prompt_engine.py:423-441` | `_build_documents_section` ignores `user_id` — 20 org documents × 4000 chars (including private uploads) go into every member's assistant system prompt, as untrusted instructions. `file_processing.py:19-24`: `org_id=temp` bypasses membership; `user_id` is client-supplied. |
| 13 | `core/email_service.py:52-53` | `set_debuglevel(1)` prints SMTP credentials and OTP/reset email bodies to logs; no timeout; `starttls()` without a verifying context. |
| 14 | `qdrant.py:41-62`, `ai_client.py:170, 191-193`, `file_processor.py:240-271` | API keys leak into logs through exception text (key in URL). |
| 15 | `core/ai_client.py:19-38, 57, 255` | New `AsyncOpenAI` per call with default 600 s timeout and no backoff or provider fallback; Gemini path gets `model=None` → `models/None:generateContent` 404; Anthropic path `IndexError` on empty content. |
| 16 | `core/file_processor.py:306-366` | Unbounded chunks/embeddings (serial paid call per chunk); `chunks` can exceed Mongo's 16 MB; `insert_one` failure swallowed yet `status: "completed"` returned; zero-vector embeddings stored on failure; CPU-bound extraction blocks the event loop; zip-bomb exposure. |
| 17 | `core/database.py:51-73, 188-191` | When Mongo is down, every `get_database()` call retries with a 15 s `serverSelectionTimeoutMS` stall and creates a new `MongoClient` (threads/sockets leak). Cluster hostname hardcoded at line 63. |
| 18 | `core/scheduler.py:1661-1684` | Time-of-day jobs gated by a ~61-65 min loop (can skip a whole hour → no weekly report), no "sent today" record (restart re-sends), and "weekly" jobs have no weekday check so they run daily (performance trends cover 8 days, not 8 weeks). |
| 19 | `core/notification_service.py:192-243` | Sync `pywebpush.webpush()` with no timeout on the event loop; any exception deletes the subscription. |
| 20 | `dependencies/auth.py:21-45`, `core/firebase_admin.py:88-98` | `verify_id_token` makes a synchronous Firebase `get_user` network call on every request/WebSocket connect; no revocation or `disabled` check. |
| 21 | `proxy.ts:17` | `JSON.parse(userStr)` with no try/catch; several writers set `yesboss_user` unencoded → a `;` in a name breaks the cookie and every matched route (including `/login`) returns 500 until the cookie expires. |

## 5. Medium / low findings (grouped)

**Backend**
- **Rate limiter** (`main.py:14-36`): in-memory per process, keyed on `request.client.host`. In Docker, nginx hits the app from the bridge IP, so `X-Forwarded-For` isn't trusted and all users likely share one 300/min bucket. The dict is never evicted. No OTP attempt limit on `/auth/verify-otp` and `/forgot-password/verify-otp`.
- **Blocking calls in async routes:** sync pymongo, `requests`, `pd.read_excel`, `extract_text`, SMTP, `notify_cliq_assignments`. Only `dashboard.py:/kpi` uses `asyncio.to_thread` consistently.
- **Indexes/TTL** (`database.py:87-185`): none on `users` (`uid`, `email`, `organization_id`); none on `org_chart_members.email/manager_email`, `meetings.reminder_sent/start_dt/end_dt`, `goals.due_date/status`, `tasks` sync ids and `assignee_id`, `push_subscriptions.user_id`, `documents`. No TTL for `notifications`, `calendar_events`, `check_ins`, `task_followups.messages`. `_ensure_collections` races with 2 workers.
- **Sync bugs:**
  - One user's exception aborts the loop for everyone (`scheduler.py:931-1292`).
  - Non-200 from Zoho returns `[]`, then `last_task_sync_at` is advanced (data loss).
  - Zoho updates overwrite local statuses.
  - Deleted calendar events are never removed.
  - No pagination for Google Tasks/Calendar (`gcal.py:60-74`, `gmail_tasks.py:62-70, 125-134`).
  - `gmail_tasks.py:20` appends `Z` to values that already have an offset.
- **Escalation** (`scheduler.py:21, 392`): `+05:30` strings make `_days_overdue` return None but `escalation_level=2` is still set (escalation lost). `escalation_level: {"$lt": 2}` never matches tasks without the field. Tasks >7 days overdue escalate twice in one run. The 50 emails/hour per-org limit drops emails while one-shot flags are already set.
- **Co-owners:** `goals.py:300` and `tasks.py:29` `_is_org_owner` ignore co-owners (403 on update/delete/approve/complete), unlike `scope.is_org_owner`. `approve_task` lets assignee/creator approve their own task.
- **Cliq agent:** `scheduler.py:1565-1635` / `task_interaction_agent.py:382-389` — read-modify-write of whole thread dicts clobbers replies; `cliq_msg_id` dedupe is check-then-write. Classifier (`:61-108`) treats "not completed"/"incomplete" as completed. `next_followup_at` bumped even when send failed.
- **OAuth tokens** stored in plaintext (`zoho_tokens`, `google_tokens`); no refresh lock; `save_token` can overwrite a refresh token with `""`; `invalid_grant` retried every 5 min forever; `get_auth_url` logs the full URL with `state`; unused `gmail.readonly` scope; Zoho `expires_in` unit unverified. `cliq._resolve_token` and `providers.resolve_token_for_email` pick an arbitrary org token.
- **HTML not escaped** in emails (`email_service.py:93-175`, `scheduler.py:441-461, 701-716`, `owner_requests.py`).
- **journal_agent:** no code-fence stripping before `json.loads`; reads `urgency_create_tasks` while the prompt emits `should_create_tasks` (always False).
- **Other:**
  - `org_chart.py:54, 68-122`: Excel NaN becomes `"nan"` email; emails not lower-cased vs Firebase email.
  - `employees.py:92-117` mixes tenants in `get_employee_tasks`; `dashboard.py:442-541` employees can request org-wide KPIs; `dashboard.py:681`, `market_trends.py:114`, `reports.py:~815` look up orgs by string id (never matches ObjectId).
  - `journal.py:73-145`: no org membership check; `PUT` can flip a private `journal` entry to owner-visible `idea`.
  - `notifications.py:82, 111` (C5) and the dead `get_user_org_id` helper.
  - `chatbot.py` conversation hijack by id.
  - `employees.py` avatar GET builds a path from the raw email.
  - `strategy_chat.py:~960` `Content-Disposition` header injection.
  - Many `ObjectId(param)` calls without validation → 500 instead of 400.
  - `smart_suggestions.py:174-205` serial LLM call per goal/task; unauthenticated cost-bearing LLM endpoints where the caller chooses `provider`.
  - `core/learning.py:335` workload math makes everyone "overloaded" after ~10 tasks.
  - `core/cache.py` not thread-safe; `_ZUID_CACHE` unbounded.
  - Qdrant: ObjectId hex ids rejected, randomised fallback embeddings mixed with real ones.
  - Scraper domain matching uses substrings (`t.co` matches `microsoft.com`).
  - `config.py`: `load_dotenv(override=True)` and `DEBUG` defaults to `true`.
  - `ws_bridge` ignores task results; `websocket.py` leaves empty sets.
  - `agents/master_agent.py:98-117` `update_company_profile` tool has an LLM-controlled `$set` field and `user_id` (hazard if ever wired in).

**Frontend**
- Role fallback is always "employee" (`AuthContext.tsx:172, 190`: `clearUserScopedStorage()` removes `yesboss_role` right before it is read), so an owner can be sent to `/onboarding/employee` when `set-session` times out.
- `taskStore.ts:~246-275` `completeTask`/`approveTask` drop `id` (`_id` not mapped). `goalStore.ts:~137` `addGoalFromWs` doesn't dedupe → duplicate goals.
- `proxy.ts` trusts forgeable cookies (`yesboss_token=true` is set via `document.cookie`); stale httpOnly cookie can cause a `/login` ↔ `/dashboard` loop if `/auth/clear-session` fails.
- `NotificationWatcher.tsx:117-146` effect re-runs on object identity (refetch, socket reopen, new interval, push unsubscribe/resubscribe, including for anonymous visitors); `AudioContext` per notification never closed.
- Unchecked `res.ok` in `notificationStore`, `organizationStore`, `googleStore`, `assistantStore`; `DashboardView.tsx:2295-2299` caches `[]` forever on a failed `loadGoalChildren`.
- `organizationStore` falls back to unauthenticated `/organizations/by-domain/{domain}`; employee onboarding loads `/organizations?limit=200` unauthenticated and uses `Math.random()` as an org id (`onboarding/employee/page.tsx:256, 396, 424`).
- `sessionStore` races (wholesale replace, messages lost during `createSession`), plaintext persisted chat/journal in localStorage; in-memory stores not cleared on user change.
- Unencoded `email` in query/path (`dashboard/page.tsx:145`, `taskStore.ts:344`) breaks `+` addresses. `CalendarBooking.tsx:52` uses UTC date (wrong before 05:30 IST). `NotificationDropdown.tsx:38` `timeAgo` mishandles `+05:30`.
- `next.config.ts`: `ignoreBuildErrors`, blanket `no-store` on all paths, no CSP/X-Frame-Options/HSTS/Referrer-Policy.
- `app/components-demo/page.tsx` ships to production (public).
- Console leaks: `DashboardView.tsx:2415` (every render), `MeetingUploadModal.tsx:76-102, 296, 373-374`, `goalStore.ts:124`, `taskStore.ts:210, 224`.
- Polling pile-up: three components poll `/dashboard/kpi` every 30 s, also in background tabs. `useWebSocket` retries forever with no auth-vs-network distinction. `Math.random()` keys/ids at `TaskView.tsx:362`, `ai/page.tsx:573`, `dashboard/page.tsx:113`.
- `useVoiceInput` no unmount cleanup; `AISummaryChat` streaming has no abort and an uncleared 60 s timer.
- `lib/supabase*.ts` are dead code.

**Repo / DevOps**
- ~40 stray tracked files: `backend/*.json`, `uvicorn.err/.out/.pid`, `.mypy_cache`, `test_report.pdf`, a file named `h origin main --force`, a file named `null`, Office lock files (`~$K1.docx`), `Untitled-1.png`. `.git` is 112 MB.
- Deploy: `git reset --hard && docker compose build --no-cache` on every push, no tests, no rollback, container runs as root.
- `ruff`, `mypy` and `pytest-cov` are in production `requirements.txt`.
- Next.js + docs mismatch: `yesboss_complete_Architecture.md` says Next.js 15; code is Next.js 16.

## 6. What else should be done

### Today
1. **Rotate** the Supabase service-role key, the Firebase service-account key, and any SMTP/API keys that may have been logged. Purge the Firebase key from git history. Remove the Supabase key from `docker-compose.yml` (the frontend doesn't import the Supabase client; drop the build arg or use the real anon key).
2. **Lock down `auth.py` and `owner_requests.py`:**
   - Remove `debug_otp`, including the OTP in the SMTP-failure `detail`.
   - Require `get_current_user` on role/delete/update-phone/sync-user; verify the Firebase token in `/login`.
   - Make owner approval a POST with an expiring one-time token, and stop returning the links.
3. **Require auth everywhere.** Replace `get_current_user_optional` with `get_current_user` on all data routers, add one `require_org_member(org_id)` / `require_org_owner(org_id)` dependency from `dependencies/scope.py`, and stop reading `user_email`/`uid` from request bodies.
4. **Turn Mongo TLS verification back on.**

### This week
- Add an SSRF guard (resolve host, block private/link-local/loopback, cap redirects and body size, apply to every fetcher and webhook downloader). Require auth on `scrape`/`social`/`intelligence`.
- Sanitise upload filenames and org ids (`secure_filename` + resolved-path check); add extension allow-list and size limits; never serve user HTML/SVG inline.
- Escape the markdown renderer (or use a sanitiser such as DOMPurify), HTML-escape emails, add security headers and a CSP in `next.config.ts` / nginx.
- Sign the OAuth `state` (nonce bound to the session), validate callback ownership, scope `users/search`, `/book`, `/freebusy` to the caller's org.
- WebSockets: ignore client-originated `notification` / `task_update`; move the token out of the URL.
- Run the scheduler in one place (leader lock in Mongo/Redis, a separate worker process, or `--workers 1`); add "already sent" flags for digests, reminders, due-tomorrow goals.
- Fix the PDF `filetype` call (and use `pypdf` in the fallback), naive/aware datetime comparisons, WebSocket JSON serialisation (`default=str` or serialise first), MoM query types.
- Frontend: use `onIdTokenChanged` for refresh, send `getAuthHeaders()` on every call, wrap the `proxy.ts` cookie parse in try/catch and encode the cookie, fix the open-redirect check with `new URL(...)` origin comparison.

### Engineering hygiene
- CI: add `pytest` to backend CI; make ruff, mypy, `tsc` and lint blocking; gate the deploy on CI; remove `ignoreBuildErrors`.
- Dates: store real UTC `datetime`s (one normalisation helper for every writer), migrate existing string dates.
- Mongo: add the missing indexes and TTLs; unique indexes on sync ids; bound the retry in `get_database()`.
- Rate limiting: pass `--proxy-headers` with trusted proxy IPs (or use Redis), evict idle keys, add OTP attempt limits.
- Replace blocking calls in async routes with `asyncio.to_thread` or async clients; cache Firebase token verification.
- LLM client: shared clients, explicit timeouts/retries/backoff and provider fallback; fix Gemini `model=None`.
- Tests: add negative tests (unauthenticated → 401, cross-tenant → 403, co-owner behaviour) for every router.
- Store OAuth tokens encrypted; add a refresh lock; mark users disconnected on `invalid_grant`.
- Cleanup: untrack the stray files, add them to `.gitignore`, shrink history, default `DEBUG=false`, remove `print` and noisy `console.log`s, delete or gate `/components-demo`.
- Refactor `assistant.py` (3.8k lines), `DashboardView.tsx` (3.9k) and `AISummaryChat.tsx` (2.5k) into smaller units.

## 7. Items re-verified by hand

- `docker-compose.yml` Supabase JWT decodes to `role: service_role`.
- `backend/firebase-credentials.json` (type `service_account`) exists in commit `9f06655`.
- `auth.py`: `debug_otp` (lines 941, 1021); `PUT /user/{uid}/role`, `DELETE /user/by-email/{email}`, `/update-phone`, `/login`, `/sync-user` have no auth dependency; `/login` does not take a password check.
- `owner_requests.py:77-156`: `request-owner` is unauthenticated and returns `approve_link` / `reject_link`.
- `core/database.py:56-57` TLS flags; `core/file_processor.py:35, 44` PDF call; `core/email_service.py:52` debug level; `core/zoho/base.py:27` print.
- `scrape.py`, `social.py`, `intelligence.py` contain no `get_current_user`.
- `notification_service.py:150-160`: `notif_doc` contains `created_at: datetime.now(UTC)` and is sent via `send_json`.
- `scheduler.py:183-190`: aware `remind_at` compared with the naive `now`.
- 119 backend tests pass; `tsc --noEmit` exits 0.
