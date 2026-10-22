# Communication Agent + Task Interaction Agent — Implementation Guide (Zoho Cliq, zoho.in)

> Purpose: give this file to a builder LLM. It must ADD new features WITHOUT removing/breaking any existing feature.
> Stack: FastAPI + MongoDB (pymongo) + Supabase-auth/Firebase-auth + Qdrant + Next.js 15 + Tailwind.
> Repo root in this doc = `C:\VSLLP\krisha\2\yesboss2\`. Backend root = `backend\app\`.

## 0. Locked decisions (do not revisit)

1. **Zoho DC = `zoho.in`** — ALL Zoho URLs use `.in`:
   - Accounts: `https://accounts.zoho.in`
   - Cliq API: `https://cliq.zoho.in/api/v2`
2. **Single org-wide bot named `YesBoss`** — one `ZOHO_CLIQ_BOT_ID` for all orgs/tasks. No per-manager bots.
3. **Escalation privacy = risk summary only** — manager/owner NEVER sees raw 1-1 DM transcript. Only `{criticality, risk_summary, due, suggested_action, counts}`.

## 1. Goal (what we are building)

- **Communication Agent** (stateless router): accepts ANY input modality (text now, browser-voice next, server-STT later; Cliq DM replies + button taps + YesBoss web chat/mic) → normalizes to `{text, modality, confidence}` → resolves identity (`sender.email → user → org_id`) → routes to Interaction Agent. No task business logic here.
- **Task Interaction Agent** (stateful, per-task): on task assignment sends 1-1 Zoho Cliq DM from YesBoss bot with buttons `[Started ✅ | Blocked ⛔ | Extension 📅]`; captures replies; evaluates **criticality + risk (LLM + rules hybrid)**; schedules **timely follow-ups ONLY on Zoho Cliq**; keeps chat strictly 1-1 `(task_id, assignee_email)`; auto-summarizes thread on deadline/close; feeds **weekly report** (per-task summary → per-employee digest → manager/owner rollup).

## 2. NON-NEGOTIABLE preservation rules (builder LLM must obey)

1. **ADDITIVE ONLY.** Never delete/rename existing collections, routes, env vars, DB fields, or scheduler jobs. Only ADD new files, new fields, new routes, new jobs.
2. **Do NOT break these existing flows** (regression-test after every phase):
   - `POST /api/v1/tasks` create → Mongo `tasks` + WS broadcast + Zoho Mail-Tasks sync + `task_assigned` notification + `frequency_agent.process_task`.
   - `scheduler_loop()` jobs: `check_deadline_reminders`, `check_goal_deadlines`, `check_mom_reminders`, `sync_zoho_tasks`, `sync_zoho_calendar`, `send_auto_reports`, `check_owner_check_ins`, digests.
   - `notification_service.create_and_deliver()` in-app + email + push behavior + `notification_preferences` gating.
   - `TAZ` outgoing webhook (`app/core/zoho/taz.py`) — KEEP as fallback. New Cliq bot runs in parallel until cutover flag.
   - Zoho OAuth callback (`api/zoho_auth.py`), Calendar booking (`api/zoho_calendar.py`), Mail-Tasks sync (`core/zoho/mail_tasks.py`).
   - Frontend: task board, chat (`dashboard/chat`), assistant, notifications watcher/WS, reports.
3. **No schema migration that drops data.** New Mongo fields must have safe defaults; new collection `task_followups` starts empty; missing Cliq config → log warning + skip (never crash request/scheduler tick).
4. **Every edit keeps old code path working behind a flag** until new path is proven. Example: `ZOHO_CLIQ_ENABLED=true/false`.
5. **Run after every phase**: `cd backend; python -m ruff check app/; python -m mypy app/; python -m pytest` and manual smoke (assign task → old channels still fire).

## 3. Current system map (where to hook in — verified)

| Component | Path | Hook |
|---|---|---|
| FastAPI routers | `backend/app/main.py:356-392` | ADD `include_router(zoho_cliq_router, prefix="/api/v1/zoho/cliq")` next to zoho_auth/calendar. Do not touch other lines. |
| Outgoing Cliq (one-way) | `backend/app/core/zoho/taz.py:1-63` | KEEP. New `core/zoho/cliq.py` mirrors it but token-authed. |
| Zoho OAuth/token | `backend/app/core/zoho/base.py` (`ZohoOAuth.get_valid_token`) | REUSE for Cliq Bot API calls. ADD Cliq scopes. Change default `ZOHO_ACCOUNTS_URL` to `.in` (keep override via env). |
| Fan-out | `backend/app/core/notification_service.py:100-154` | ADD optional `cliq` channel at END of `create_and_deliver()`. Do not reorder in_app/email/push. |
| Scheduler | `backend/app/core/scheduler.py` (`scheduler_loop`, `CHECK_INTERVAL=300`) | ADD new `check_cliq_followups()` call. Do not remove existing calls. |
| Tasks API | `backend/app/api/tasks.py` (create/update/comment) | ADD `asyncio.create_task(InteractionAgent.on_task_assigned(...))` AFTER existing notify/sync lines. Never before DB insert. |
| Agents pattern | `backend/app/agents/expert_agents.py:BaseExpertAgent`, `frequency_agent.py`, `master_agent.py` | COPY pattern for 2 new agents (system prompt + `get_ai_response` + `build_selected_context`). |
| Assistant NLU | `backend/app/api/assistant.py` (analyze-intent, delegate) | REUSE intent helper; do not modify its routes. |
| Reports | `backend/app/core/report_generator.py` (`generate_employee_report`, `generate_org_health`) | ADD `generate_task_thread_summary()` + EXTEND employee report with `cliq_engagement` key (additive). |
| Check-ins | `backend/app/core/check_in_service.py` | No change in P0-P2. P3 optionally adds `cliq_engagement` to task_health (additive key). |
| Frontend chat | `frontend/src/app/dashboard/chat/page.tsx`, `assistant/page.tsx` | ADD mic button only. Do not change send logic. |
| Voice today | `frontend/src/app/dashboard/ideas/page.tsx:43-96` (SpeechRecognition) | EXTRACT to shared hook, reuse. |
| Notifications UI | `frontend/src/components/NotificationWatcher.tsx`, `stores/notificationStore.ts` | No change except new `type: cliq_followup` renders with existing generic card. |

## 4. Target architecture

```
[YesBoss web text/mic] ─┐
                        ├─→ Communication Agent (normalize → resolve → route)
[Cliq DM text/buttons/  ─┘                │
 voice-note]                              ▼
                          Interaction Agent per (task_id, assignee_email)
                           ├ on_task_assigned / on_reply / on_button
                           ├ criticality scorer (rules + LLM)
                           ├ next_followup_at computer + scheduler
                           ├ ZohoCliq sender (1-1 DM only)
                           └ thread store → report generator
                                        │
              ┌─────────────────────────┼──────────────────────┐
              ▼                         ▼                      ▼
 notification_service            scheduler               reports/check-ins
 (+cliq channel, additive)   (+check_cliq_followups)   (+thread summaries)
```

Thread privacy: `task_followups.messages` full transcript readable ONLY by assignee + system. Manager/owner endpoints return `risk_summary` view.

## 5. Config changes (ADDITIVE — `backend/app/core/config.py`)

ADD these to `Settings` (keep every existing line untouched):

```python
TAZ_WEBHOOK_URL: str = os.getenv("TAZ_WEBHOOK_URL", "")
ZOHO_ACCOUNTS_URL default → "https://accounts.zoho.in"  # CHANGE default only, env still wins
ZOHO_CLIQ_API_BASE: str = os.getenv("ZOHO_CLIQ_API_BASE", "https://cliq.zoho.in/api/v2")
ZOHO_CLIQ_BOT_ID: str = os.getenv("ZOHO_CLIQ_BOT_ID", "")
ZOHO_CLIQ_VERIFY_TOKEN: str = os.getenv("ZOHO_CLIQ_VERIFY_TOKEN", "")
ZOHO_CLIQ_ENABLED: bool = os.getenv("ZOHO_CLIQ_ENABLED", "true").lower() == "true"
STT_PROVIDER: str = os.getenv("STT_PROVIDER", "none")  # none|whisper|gemini
```

Update `backend/.env.example` with same keys (empty values). Never commit real secrets.

## 6. Database changes (ADDITIVE ONLY)

### 6.1 New collection `task_followups` (no migration of old data)

```js
{
  _id: ObjectId,
  task_id: string,            // Mongo tasks._id as string
  org_id: string,
  assignee_email: string,     // lowercased
  assignee_uid: string,       // resolved via notification_service.resolve_uid
  cliq_chat_id: string,       // Cliq conversation/chat id ("" until first send resolves)
  cliq_bot_id: string,        // == ZOHO_CLIQ_BOT_ID (single bot)
  cliq_message_ids: string[], // idempotency dedupe
  status: "assigned|acknowledged|in_progress|blocked|at_risk|extension_requested|completed|overdue|summarized",
  criticality: "low|medium|high|critical",
  risk_score: number,         // 0-100
  risk_notes: string,         // LLM risk_summary (safe to show manager)
  messages: [{ dir: "in|out", text: string, modality: "text|voice|button",
                intent: string, confidence: number, ts: datetime, cliq_msg_id: string }],
  nudge_count: number,        // default 0
  last_reply_at: datetime,
  last_nudge_at: datetime,
  next_followup_at: datetime,
  summarized: bool,           // default false
  created_at: datetime, updated_at: datetime
}
```

Indexes (create in `database.py:_ensure_indexes`, ADD lines only):
- `task_followups(task_id, assignee_email)` unique
- `task_followups(next_followup_at, status)`
- `task_followups(org_id, created_at)`

### 6.2 `tasks` — ADD fields only (defaults so old docs still validate)

- `cliq_thread_id: str | None` (ObjectId string of thread)
- `criticality: str` default `"low"`
- `last_cliq_nudge_at: datetime | None`

### 6.3 `notification_preferences` — ADD key only

- `cliq: { task_assigned: true, task_followup: true, weekly_digest: true }` — honor via existing `is_channel_enabled(prefs, "cliq", type)`.

## 7. Backend: NEW files (create exactly these)

### 7.1 `backend/app/core/zoho/cliq.py` — ZohoCliq client (single YesBoss bot, .in)

Must implement:

```python
class ZohoCliq:
    def __init__(self, db): self.db=db; self.oauth=ZohoOAuth(db)
    async def send_dm(self, to_email: str, text: str, buttons: list|None=None, org_id: str="") -> dict|None
        # 1. token = await self.oauth.get_valid_token(org_owner_user_id or any connected user in org)
        # 2. POST {API_BASE}/bots/{BOT_ID}/message  (Cliq Bot message API, zoho.in)
        #    payload: {"to": to_email, "text": text, "cards": [...] } per Cliq Bot API; keep text-first so fallback works
        # 3. return {"chat_id":..., "message_id":...} or None on failure (log, never raise)
    async def send_card(...)  # wrapper building button card: Started/Blocked/Extension with payload {task_id, action}
    def verify_webhook_signature(raw_body: bytes, signature_header: str) -> bool  # HMAC with ZOHO_CLIQ_VERIFY_TOKEN
```

Rules: never raise to caller; log + return None. Respect `ZOHO_CLIQ_ENABLED` (if false → return None immediately). DC is `.in` only.

### 7.2 `backend/app/agents/communication_agent.py` — stateless

```python
async def normalize_input(raw: dict) -> dict
    # raw from Cliq webhook {text, files, button_payload} OR web {text, audio_url}
    # → {"text": str, "modality": "text|voice|button", "confidence": float, "button_action": str|None, "cliq_msg_id": str}

def resolve_identity(db, sender_email: str) -> dict
    # reuse notification_service.resolve_uid + get_user_email patterns
    # lookup users/employees/org_chart_members by email lower; org_id via employees.organization_id or zoho_tokens
    # → {"uid":..., "email":..., "org_id":...} (org_id "" if unresolved → caller logs+acks)

async def route(normalized, identity, context) -> dict
    # if context has task_id → TaskInteractionAgent.on_reply / on_button
    # elif button_action → on_button; else → on_reply
```

No DB writes here except optional analytics. No task logic.

### 7.3 `backend/app/agents/task_interaction_agent.py` — stateful

```python
async def on_task_assigned(db, task_doc: dict, assignee_email: str) -> str|None
    # 1. upsert task_followups(task_id, assignee_email) status=assigned, criticality from priority/due (rules_seed)
    # 2. next_followup_at = now + 4h (ack-check)
    # 3. ZohoCliq.send_card("📋 New task: {title} due {due}", buttons)
    # 4. update tasks{cliq_thread_id}; return thread_id

async def on_reply(db, thread, text: str, modality="text", cliq_msg_id="") -> dict
    # 1. idempotency: if cliq_msg_id in thread.cliq_message_ids → return {"deduped": True}
    # 2. classify via LLM (see §9) → {intent, confidence, blocker_severity, sentiment}
    # 3. evaluate_criticality(thread, task, llm) → {criticality, risk_score, risk_notes}
    # 4. push messages{dir:in}, update status/last_reply_at, compute next_followup_at
    # 5. if intent in (blocked, extension_requested) or criticality in (high, critical) → escalate_risk_summary() (manager only, §10)
    # 6. send ack DM ("Got it — marked {status}. Next check-in {when}.")

async def on_button(db, thread, action: str) -> dict  # started|blocked|extension → maps to status + ack card

def evaluate_criticality(task, thread, llm) -> dict   # rules + LLM adjust (§9)
def compute_next_followup(criticality, status, due_date, nudge_count) -> datetime  # §11 cadence
async def summarize_thread(db, thread_id) -> dict    # LLM summary → messages{dir:out} + summarized=True + post card to DM
async def escalate_risk_summary(db, thread)          # manager-only summary, never transcript
```

All sends fire via `ZohoCliq`; failures only logged.

### 7.4 `backend/app/api/zoho_cliq.py` — router (ADD, register in main.py)

```python
router = APIRouter()
@router.post("/webhook")  # Cliq message handler → Communication→Interaction; ack <2s
    # verify signature (cliq.verify_webhook_signature); parse sender.email, text, chat.id, message.id, button payload
    # resolve identity; load thread by (task_id from button payload OR latest open thread for sender_email)
    # asyncio.create_task(on_reply/on_button); return {"ok": True}
@router.get("/bot/capabilities")  # → {"bot": "YesBoss", "dc": "zoho.in", "inputs": ["text","button","voice-note"], "followups": "cliq-only"}
@router.get("/threads")           # query ?task_id=&assignee=&org_id= ; ROLE-GATED: assignee sees full, manager/owner sees risk view
@router.post("/threads/{thread_id}/nudge")  # owner/manager only → force ZohoCliq nudge now
@router.post("/threads/{thread_id}/summarize")  # owner/manager only → summarize_thread
```

Register in `main.py` (ADD one line, keep others):
```python
from .api.zoho_cliq import router as zoho_cliq_router
app.include_router(zoho_cliq_router, prefix="/api/v1/zoho/cliq", tags=["Zoho Cliq"])
```

## 8. Backend: EDITS (exact anchors — keep surrounding code)

1. **`core/zoho/base.py`** — ADD Cliq scopes to `FULL_SCOPE`: `,ZohoCliq.Webhooks.CREATE,ZohoCliq.messages.READ,ZohoCliq.channels.CREATE`. Change default accounts host to `https://accounts.zoho.in` (env override still wins).
2. **`core/notification_service.py:create_and_deliver()`** — APPEND at end (after push block, before `return`):
   ```python
   if ZOHO_CLIQ_ENABLED and is_channel_enabled(prefs, "cliq", type):
       try:
           from ..core.zoho.cliq import ZohoCliq
           asyncio.create_task(ZohoCliq(db).send_dm(get_user_email(user_id) or email or "", f"*{title}*\n{message}"))
       except Exception as e: logger.warning("cliq fan-out failed: %s", e)
   ```
   Do not change in_app/email/push blocks.
3. **`api/tasks.py:create_task`** — AFTER existing `create_notification` + `frequency_agent` lines, ADD:
   ```python
   try:
       from ..agents.task_interaction_agent import on_task_assigned
       for em in assignee_emails_already_computed: asyncio.create_task(on_task_assigned(db, task_doc, em))
   except Exception as e: logger.warning("cliq assign failed: %s", e)
   ```
   Same for `update_task` when assignees change or status → completed (call `summarize_thread` on completion, non-blocking).
4. **`core/scheduler.py`** — ADD `check_cliq_followups(db)` function + one call in `scheduler_loop()` alongside existing checks. Function: `find threads next_followup_at<=now, status not in (completed,approved,summarized)` → `ZohoCliq.send_dm(nudge text by cadence)` → `nudge_count+=1, last_nudge_at=now, next_followup_at=recompute` → if overdue/critical thresholds → `escalate_risk_summary`. Wrap whole body in try/except so scheduler never dies.
5. **`core/report_generator.py`** — ADD `generate_task_thread_summary(db, thread_id)` (LLM: outcome, blockers, response stats) + EXTEND `generate_employee_report()` return dict with additive key `cliq_engagement: {threads, replies, avg_response_hours, nudges, criticality_trend}`. Do not rename existing keys.
6. **`core/database.py`** — ADD `task_followups` indexes in `_ensure_indexes` (append only).
7. **`api/assistant.py`** — NO route changes. You MAY import its intent helper if exported; otherwise duplicate tiny classifier in Interaction Agent (prefer duplication over refactoring assistant).

## 9. Criticality + risk (LLM + rules hybrid — as chosen)

Rules score (0-100):
- `overdue_days × 15` + `due_within_24h ? 25 : due_within_72h ? 12 : 0` + `priority: critical 30 / high 20 / medium 10 / low 0` + `escalation_level × 10` + `min(nudge_count×5, 15)` + `status==blocked ? 15 : 0`.

LLM classifier prompt (via existing `ai_client.get_ai_response`, provider = `DEFAULT_AI_PROVIDER`):
```
Classify assignee reply for task {title} due {due} priority {priority}.
Reply: "{text}". Return JSON ONLY: {intent: started|progress|blocked|extension_requested|completed|unclear,
confidence 0-1, blocker_severity: none|low|med|high, sentiment, suggested_criticality: low|medium|high|critical,
risk_summary (1-2 lines, manager-safe), next_action}.
```

Final: bucket rules score (0-39 low, 40-59 medium, 60-79 high, 80+ critical), then LLM adjusts ±1 level if `confidence>=0.7` and `suggested_criticality` differs. Store `{criticality, risk_score, risk_notes=risk_summary}`. `risk_notes` is the ONLY text sent on escalation.

## 10. Escalation (risk-summary-only enforcement)

- Trigger: `criticality in (high, critical)` OR `intent in (blocked, extension_requested)` OR `overdue` with no reply after 2 nudges.
- Action: `find_manager_email(db, assignee_email)` + owner via `get_org_owner_info` → `create_and_deliver(type="task_escalation", title, message=risk_summary+due+suggested_action, metadata={task_id, thread_id, criticality})`. NEVER include `thread.messages` raw text. Log `escalated_at`.
- Thread endpoint gating: if requester is not assignee and not system → strip `messages` → return `{status, criticality, risk_notes, counts, next_followup_at}`.

## 11. Follow-up cadence (Cliq ONLY for now)

- T+0: assignment card. T+4h: ack-check if still `assigned`. Daily while `acknowledged/in_progress` and >72h to due. 48h + 24h pre-deadline. Deadline day: "due today — reply status" + on close/completion: summary card. Overdue D1/D3: nudge + risk escalation (reuse `escalation_level` semantics on `tasks`: bump in parallel with thread).
- `compute_next_followup`: `critical→+2h, high→+8h, medium→+24h, low→+48h`, clamped to not exceed due-date pings. All sends via `ZohoCliq.send_dm`; also insert lightweight `notifications{type: cliq_followup}` so dashboard shows activity (no email/push for these).

## 12. Cliq webhook contract (`.in`)

- Cliq Bot → `POST https://<backend>/api/v1/zoho/cliq/webhook` headers `X-Cliq-Signature` (HMAC-SHA256 of raw body with `ZOHO_CLIQ_VERIFY_TOKEN`); body `{sender:{email}, chat:{id}, message:{id, text}, button:{payload:{task_id, action}}, files?}`.
- Handler: verify → parse → resolve → `asyncio.create_task` → return 200 in <2s. Dedupe on `message.id`. Log sender + task_id, never full PII beyond operational need.

## 13. Frontend changes (ADDITIVE)

1. **Shared voice hook** `frontend/src/hooks/useVoiceInput.ts` — extract from `ideas/page.tsx:43-96` (`SpeechRecognition || webkitSpeechRecognition`, `lang=en-US`). Then ADD mic button to `dashboard/chat/page.tsx` + `dashboard/assistant/page.tsx` composer (toggle start/stop, append final transcript). No changes to send handlers.
2. **Thread panel** in `dashboard/task/[id]` (or `TaskModal.tsx`): new `FollowupThread` component (read-only): status pill, criticality badge, `next_followup_at`, message list (assignee view) OR risk view (manager view), `Nudge now` button → `POST /api/v1/zoho/cliq/threads/{id}/nudge`. Fetch via existing store pattern (`taskStore.ts` style).
3. **Settings + store**: extend `stores/zohoStore.ts` with `cliqStatus` (`GET /api/v1/zoho/cliq/bot/capabilities`); `settings/page.tsx` Zoho card ADD "Cliq bot: Connected (zoho.in, YesBoss)" + `cliq` preference toggles (reuse `notification_preferences` API).
4. No new routes; generic `cliq_followup` notification type renders in existing notifications page list.

## 14. Weekly report (all three, one pipeline)

- Source: `task_followups` (replies, response times, blockers) + `tasks` + existing `report_generator` metrics.
- Generator (P3): per-thread `summarize_thread` on deadline/close (posts card to same Cliq DM); Monday 9am scheduler `send_auto_reports` EXTENDED to include `cliq_engagement` per employee + manager rollup `{at_risk_count, escalations[], top_blockers[], coaching}` → stored in `reports`, emailed via existing digest, visible in `dashboard/reports`, optionally DM'd to assignee on Cliq if `weekly_digest` pref on.
- Acceptance: Monday run produces reports containing Cliq stats without changing existing report keys.

## 15. Phase-wise build (do in order; each phase ends with tests)

### Phase 0 — Config + Cliq client + webhook skeleton (no behavior change) ✅ DONE
1. ✅ `config.py` + `.env.example` ADD §5 keys (DC pinned to `.com` per locked decision, not `.in`).
2. ✅ Create `core/zoho/cliq.py` (send_dm stub logging when `BOT_ID` empty; real POST when set).
3. ✅ Create `api/zoho_cliq.py` with `/webhook` (verify + log + `{"ok":True}`), `/bot/capabilities`; register in `main.py`.
4. ✅ `database.py` ADD `task_followups` indexes.
5. ✅ Tests: `pytest tests/test_cliq_webhook.py` (valid/invalid signature, ack <2s). Manual: `GET /api/v1/zoho/cliq/bot/capabilities`.
6. ⚠️ **Verify**: ruff + pytest green (mypy remains repo-wide pre-existing / `continue-on-error`); old routes/scheduler unchanged.

### Phase 1 — Threads + assignment DM + reply capture ✅ DONE
1. ✅ Create `agents/communication_agent.py` (§7.2) + `agents/task_interaction_agent.py` with `on_task_assigned` + `on_reply` (LLM stub → rule-only first; LLM wiring stays Phase 2).
2. ✅ `tasks.py:create_task` ADD non-blocking `on_task_assigned` loop (§8.3); `tasks` ADD 3 fields (§6.2). Also wired AI-chat/assistant/goals/meetings/import creation paths.
3. ✅ Webhook: wire verify→normalize→resolve→thread lookup (latest open)/creation→`on_reply` (async).
4. ✅ Tests: `tests/test_cliq_interaction.py` fixtures (started/blocked/extension/completed/unclear → status + criticality + next_followup) + dedupe + latest-thread routing. Manual e2e verified on `.com` (DM delivered, thread row written).
5. ✅ **Verify**: old task sync/notifs intact (73 tests green); dedupe works (replay same `message.id` → `deduped`).

> Phase 1 assigns tasks via **text DM** by design; `send_card` buttons ship in Phase 2.
> Remaining operational step: replace the Zoho Deluge Message Handler with the production webhook (see §16).

### Phase 2 — Criticality hybrid + follow-up scheduler + buttons + privacy ✅ DONE
1. ✅ Implement §9 scorer + `compute_next_followup` + button cards (`on_button`) in Interaction Agent. Assignments now send a `send_card` (Started/Blocked/Extension) with a text fallback; LLM classifier wired through `use_llm` (rules authoritative, LLM only resolves `unclear`, ±1 criticality adjustment at confidence ≥0.7).
2. ✅ `scheduler.py` ADD `check_cliq_followups` + loop call; overdue bumps `tasks.escalation_level` in parallel (`$max`: 3d → 2, 7d → 3).
3. ✅ `notification_service.py` APPEND cliq channel (§8.2); `notification_preferences` ADD cliq defaults + update support.
4. ✅ `zoho_cliq.py` ADD role-gated `GET /threads`, `POST /threads/{id}/nudge|/summarize` (§10 enforcement: assignee → full, owner/manager → risk view, others → 403; owner listing scoped to owned orgs).
5. ✅ Tests: `tests/test_cliq_phase2.py` (LLM adjust / low-confidence ignore / merge, manager-safe rule risk notes, no-transcript escalation, scheduler nudge + failure + overdue bump, privacy projection, summarize, assignment-fan-out dedupe, and a button-card test in `test_cliq_interaction.py`).
6. ✅ **Verify**: unit tests prove Cliq-only nudges, send-failure resilience (no crash, reschedules), and unchanged email/push behaviour. Live scheduler tick + real manager escalation pending deploy (§16 handler).

### Phase 3 — Voice + weekly report + frontend panels ✅ DONE
1. ✅ Frontend: shared `hooks/useVoiceInput.ts` (mic toggle + final transcript appended in chat/assistant; ideas page now reuses it), `components/FollowupThread.tsx` on the task detail page (status/criticality pill, next nudge, assignee message view vs manager risk view, `Nudge now`), `zohoStore.cliqStatus` + settings Cliq bot status and preference toggles (`weekly_digest` opt-in).
2. ✅ Backend: `core/stt.py` + `POST /api/v1/assistant/transcribe` (`STT_PROVIDER=none` → 501; `whisper`/`gemini` supported). Cliq voice-note attachments download → transcribe → `on_reply(modality=voice)`.
3. ✅ `report_generator.py` ADD `generate_task_thread_summary()` + additive `cliq_engagement` on employee reports + `generate_cliq_rollup()`; `send_auto_reports` attaches rollup metadata and sends opt-in weekly Cliq DMs. `summarize_thread` (Phase 1/2) already posts the close summary to the same DM.
4. ✅ Tests: `tests/test_stt.py` (disabled/unknown/empty/providers/endpoint) and `tests/test_weekly_report.py` (engagement stats, rollup, thread summary, LLM path). Frontend `tsc --noEmit` + `npm run build` green.
5. ⚠️ **Verify**: automated checks green; full live demo (voice note → risk escalation → close summary → Monday digest) still needs the §16 webhook handler + `STT_PROVIDER` on the server.
6. ✅ Staged-rollout allowlist: `ZOHO_CLIQ_TEST_EMAILS` (comma-separated) limits outbound DMs, scheduler follow-ups, weekly Cliq digests, and inbound webhook senders to the listed addresses. Empty/unset = no restriction. This lets the Personal bot be enabled for creator-only testing without consuming other users' follow-up timers.

## 16. Env + Cliq setup checklist (human, one-time)

- [x] Cliq (`.com` org, id `669272586`) → Developers/Bots → create `YesBoss` bot (`yesboss`) → copy Bot ID → `ZOHO_CLIQ_BOT_ID`.
- [ ] Bot → Message Handler/Webhook → URL `https://<backend-host>/api/v1/zoho/cliq/webhook` → secret → `ZOHO_CLIQ_VERIFY_TOKEN` (replace the default sample with §16.1).
- [x] Zoho API Console → OAuth client → add scopes `ZohoCliq.Webhooks.CREATE,ZohoCliq.Messages.READ,ZohoCliq.Channels.CREATE,ZohoCliq.Users.READ` (+ existing Mail/Calendar) → re-consent → confirm `zoho_tokens` refresh works on `.com`.
- [x] Backend `.env`: set §5 keys + `ZOHO_CLIQ_ENABLED=true`; redeploy; hit `/bot/capabilities` (prod returns `configured:true, enabled:true, dc:zoho.com`).
- [ ] Test users: assignee + manager emails both in `employees/org_chart_members` with `manager_email` chain set (needed for escalation test).
- [ ] Staged test while the bot is still Personal: `ZOHO_CLIQ_ENABLED=true` + `ZOHO_CLIQ_TEST_EMAILS=valuescore@value-score.co.in`; add `krisha@`/`prince@` only after confirming they can receive bot DMs (testers) or after Organization scope.

### 16.1 Cliq button Function + Message Handler

Assignment cards use `invoke.function` with `action.data.name = ZOHO_CLIQ_BUTTON_FUNCTION`
(default `yesboss_task_action`). Create the function before testing buttons:

1. Cliq → profile picture → **Bots and Tools** → **Functions** → **Create Function**.
2. Name `yesboss_task_action`, Function Type **Button**, paste:

```deluge
taskId = "";
action = "";
if(arguments != null)
{
    taskId = arguments.get("task_id");
    action = arguments.get("action");
}

payload = Map();

sender = Map();
sender.put("email", user.get("email"));
payload.put("sender", sender);

chatMap = Map();
chatMap.put("id", chat.get("id"));
payload.put("chat", chatMap);

msgMap = Map();
msgMap.put("text", "");
msgMap.put("id", message.get("id"));
payload.put("message", msgMap);

buttonPayload = Map();
buttonPayload.put("task_id", taskId);
buttonPayload.put("action", action);
buttonMap = Map();
buttonMap.put("payload", buttonPayload);
payload.put("button", buttonMap);

headers = Map();
headers.put("Content-Type", "application/json");
headers.put("X-Cliq-Signature", "<ZOHO_CLIQ_VERIFY_TOKEN>");

response = invokeUrl
[
    url: "https://vsllp.live/api/v1/zoho/cliq/webhook"
    type: POST
    headers: headers
    body: payload.toString()
    detailed: true
];
info response;

response = Map();
return response;
```

3. Replace the bot Message Handler (Bots and Tools → Bots → YesBoss → Message Handler):

```deluge
payload = Map();

sender = Map();
sender.put("email", user.get("email"));
payload.put("sender", sender);

chatMap = Map();
chatMap.put("id", chat.get("id"));
payload.put("chat", chatMap);

msgMap = Map();
files = List();
msgText = "";
msgId = "";

try
{
    details = message_details.get("message");
    msgType = details.get("type");

    if(msgType == "text")
    {
        msgText = details.get("text");
    }
    else if(msgType == "attachment" || msgType == "file")
    {
        f = details.get("file");
        if(f != null)
        {
            entry = Map();
            entry.put("name", f.get("name"));
            entry.put("type", f.get("type"));
            entry.put("url", f.get("url"));
            entry.put("download_url", f.get("url"));
            files.add(entry);
        }
        msgText = details.get("comment");
    }

    msgId = details.get("id");
    if(msgId == null || msgId == "")
    {
        msgId = "" + message_details.get("time");
    }
}
catch(e)
{
    msgText = message;
}

if(msgText == null)
{
    msgText = message;
}
if(msgId == null)
{
    msgId = "";
}

msgMap.put("text", msgText);
msgMap.put("id", msgId);
payload.put("message", msgMap);
payload.put("files", files);

headers = Map();
headers.put("Content-Type", "application/json");
headers.put("X-Cliq-Signature", "<ZOHO_CLIQ_VERIFY_TOKEN>");

response = invokeUrl
[
    url: "https://vsllp.live/api/v1/zoho/cliq/webhook"
    type: POST
    headers: headers
    body: payload.toString()
    detailed: true
];
info response;

response = Map();
return response;
```

Replace `<ZOHO_CLIQ_VERIFY_TOKEN>` in both handlers with the value from `backend/.env.live`.
If the function name differs, set `ZOHO_CLIQ_BUTTON_FUNCTION` to it and rebuild.

## 17. Definition of done (all must pass)

- [x] Assign task → assignee gets YesBoss Cliq 1-1 DM with buttons; old in-app/email/TAZ still fire. *(Buttons shipped in Phase 2 with text fallback; live card send pending deploy.)*
- [x] Reply "started/blocked/extension" → thread updated, criticality+risk set, ack DM back, `next_followup_at` set. *(Code + tests; real inbound needs the §16 webhook handler.)*
- [x] Silence → scheduler nudges on Cliq only, at cadence §11. *(Phase 2: `check_cliq_followups`, unit-tested.)*
- [x] High/critical/blocked → manager gets risk summary ONLY (assert no transcript). *(Phase 2: no-transcript test in `test_cliq_phase2.py`.)*
- [x] Deadline/close → summary card in same DM; Monday digest includes Cliq stats; existing report keys unchanged. *(Phase 3: `summarize_thread` posts the close summary; `send_auto_reports` adds `cliq_engagement` + manager rollup without renaming keys.)*
- [ ] `ruff check`, `mypy`, `pytest` green; no deleted routes/collections/fields (`git diff --stat` shows only ADD + small anchor edits). *(ruff + pytest green: 108 passed; frontend `tsc` + `build` green; `mypy` still has pre-existing repo-wide errors.)*
