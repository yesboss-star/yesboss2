# YesBoss Goals v2 — Implementation Plan

## Overview

Redesign goals with type system (short/long-term, one-time/continuous), linked hierarchy, AI-generated default goals per industry, cross-company anonymized learning, goal completion review flow, real-time frequency tracking, a dedicated Frequency Agent, and multi-owner architecture with per-owner private workspaces.

---

## Phase 0: Multi-Owner Architecture & Private Workspaces

### Problem

Currently one company has one primary owner. If another person wants to be an owner of the same company, they can join as a co-owner — but all owners see ALL the same goals/tasks/data (no isolation). We need multiple owners per company where each owner has their **own private workspace** and cannot see each other's goals or data.

### What stays shared (org-level)

- Organization settings (name, industry, micro_vertical, integrations)
- Org chart members (employees, managers, hierarchy)
- Zoho / Google integrations (connected once per org)
- Market intelligence (industry-level data)

### What becomes private per owner

- Goals (created_by filter)
- Tasks (created_by filter — derived from goal owner)
- Documents / uploaded files
- Reports
- Check-in notes & review history
- Assistant / Strategy Chat sessions

### Schema changes

**`organizations` collection** — already has `owner_id` + `co_owners[]`, no change needed.

**Owner-scoped collections** — add `created_by` (Firebase UID string) field:

| Collection | New field | Purpose |
|------------|-----------|---------|
| `goals` | `created_by: str` | Which owner created this goal |
| `tasks` | `created_by: str` | Which owner's context this task belongs to |
| `documents` (files) | `created_by: str` | Which owner uploaded this |
| `reports` | `created_by: str` | Which owner's report |
| `assistant_sessions` | Already has `user_id` | Already per-user |
| `check_ins` | `owner_id: str` | Already per-owner |

### Query logic change

Every owner-scoped endpoint adds a `created_by` filter:

```python
# Before:
goals = db.goals.find({"organization_id": org_id})

# After:
goals = db.goals.find({
    "organization_id": org_id,
    "created_by": current_user.id      # ← owners only see their own
})
```

### Onboarding flow for second owner

1. Person signs up as "owner", enters `person2@company.com`
2. Onboarding detects `company.com` domain → `GET /organizations/by-domain/company.com` finds existing org
3. Shows: *"Company X already exists. Do you want to join as an owner?"*
4. If yes → `POST /organizations/{id}/add-owner` with their UID
5. They land on a **fresh dashboard** with AI-generated default goals
6. They see only their own goals/tasks/data — Owner A's data is completely invisible

### Owner list in UI

Settings page shows all owners of the org (primary + co-owners). Primary owner can remove co-owners.

### Check-ins

- [x] Add `created_by` field to goals, tasks, documents, reports collections
- [x] Update all owner-scoped GET endpoints to filter by `created_by`
- [x] Add `created_by` to create endpoints (auto-set from current_user)
- [x] Update frontend API calls to pass created_by implicitly via auth
- [x] Verify existing org detection in onboarding still works for second owner
- [ ] Second owner gets fresh AI-generated default goals (Phase 2)
- [ ] Add "Manage Owners" section in Settings (view, remove co-owners)
- [x] Ensure Zoho/Google integrations remain org-level (shared, not per-owner)

---

---

## Phase 1: Goal Model Redesign

### Backend — New fields on `goals` collection

```
goal_type:      "short_term" | "long_term"
duration:       "one_time" | "continuous"
end_date:       Optional[str]           # for continuous goals with optional end
parent_goal_id: Optional[str]           # if sub-goal, points to parent
sub_goal_ids:   List[str]               # reverse lookup — child goal IDs
is_default:     bool = False
industry:       str
micro_vertical: str
review_feedback: Optional[str]          # rejection reason from owner
reviewed_by:    Optional[str]           # owner user ID
reviewed_at:    Optional[str]
```

### Frontend — Updated `Goal` interface in `goalStore.ts`

Add all new fields above.

### Files to modify

- `backend/app/api/goals.py` — GoalCreate, GoalUpdate, create_goal
- `frontend/src/stores/goalStore.ts` — Goal interface
- `frontend/src/components/owners/GoalModal.tsx` — type/duration selectors, parent goal picker

### Check-ins

- [x] Add new fields to GoalCreate/GoalUpdate pydantic models
- [x] Add new fields to Goal interface in goalStore.ts
- [x] Create MongoDB index on `parent_goal_id`
- [x] Update create_goal endpoint to handle parent_goal_id → auto-link hierarchy
- [x] Add sub-goal tree view + parent goal picker in GoalModal
- [x] Add type/duration/end_date UI controls in GoalModal
- [x] Show parent goal breadcrumb on child goal detail

---

## Phase 2: Default Goals via AI Agent on Org Creation

### Flow

1. Owner creates organization (onboarding complete)
2. System calls AI agent with: "Generate 5 default goals for a [industry]/[micro_vertical] company"
3. AI returns goals with: title, description, goal_type, duration, priority, department, suggested timeline
4. Goals inserted with `is_default: true`
5. Owner sees them pre-loaded on Dashboard → can edit or delete

### Files to create/modify

- `backend/app/api/orgs.py` — new endpoint `POST /api/v1/orgs/{org_id}/generate-default-goals`
- `backend/app/agents/default_goals_agent.py` — prompt + logic for goal generation
- `frontend/src/components/owners/DashboardView.tsx` — show default goals badge

### Prompt for AI agent

```
You are a business strategy expert. Generate 5 default goals for a
{industry} / {micro_vertical} company. Return JSON array with each
goal having: title, description, goal_type ("short_term"|"long_term"),
duration ("one_time"|"continuous"), priority ("high"|"medium"|"low"),
department, and suggested_timeline. Make them realistic and actionable
for this specific vertical.
```

### Check-ins

- [x] Create `POST /api/v1/organizations/{org_id}/generate-default-goals` endpoint
- [x] Create DefaultGoalsAgent with industry-specific prompt + fallback templates
- [x] Wire agent call into org creation flow (fire-and-forget background task)
- [x] Add `is_default` badge UI on goal detail + goal card list
- [x] Allow owner to bulk-delete default goals with `POST /api/v1/goals/delete-defaults`

---

## Phase 3: Goal Completion Review Flow

### Flow

1. Assignee marks goal as `"pending_review"`
2. Owner gets notification: "[Employee] marked goal '[title]' as complete"
3. Owner can **Approve** → status = `"completed"`, records `goal_outcome`
4. Owner can **Reject** with feedback → status = `"active"`, stores `review_feedback`

### Status state machine

```
active → pending_review → completed  (approved)
active → pending_review → active     (rejected + feedback)
active → cancelled                    (owner cancels)
```

### Files to modify

- `backend/app/api/goals.py` — add review endpoint + status transitions
- `backend/app/core/notification_service.py` — trigger on pending_review
- `frontend/src/components/owners/GoalDetailChat.tsx` — Approve/Reject buttons for owner

### Check-ins

- [x] Add `pending_review` to allowed status values
- [x] Add `POST /api/v1/goals/{goal_id}/review` endpoint (approve/reject + optional feedback)
- [x] Send notification to owner when goal enters pending_review
- [x] Add review_feedback, reviewed_by, reviewed_at fields on approval
- [x] Show "Waiting for owner review" badge + "Request Review" button on employee/assignee side
- [x] Show Approve/Reject buttons with feedback textarea on owner side
- [x] On approve → trigger record_goal_outcome() stub in ContinuousLearning

---

## Phase 4: Periodic Owner Check-Ins (Scheduled Review Prompts)

### What it does

On a configurable schedule (default: weekly), the system proactively asks the owner to review all ongoing goals and tasks:

**Notification to owner:**
> "Your weekly check-in: You have 8 active goals and 23 ongoing tasks. 2 goals are behind schedule, 5 tasks have no updates in 7+ days. Review now?"

### Check-in content

When owner opens the check-in, they see:

| Goal | Progress | Last Update | Status | Owner Action |
|------|----------|-------------|--------|-------------|
| Increase Q3 revenue | 65% | 3 days ago | On track | — |
| Hire senior engineer | 30% | 12 days ago | Behind | ⚠️ Flagged |
| Launch mobile app | 80% | 2 days ago | On track | — |
| Reduce churn to 5% | 20% | 8 days ago | Stale | 📝 Add note |

### Owner actions per check-in

- Add progress note / comment on any goal
- Flag a goal as blocked (triggers notification to assignee)
- Adjust deadline
- Reassign owner
- Dismiss (mark as reviewed — resets "days since last update" counter)

### System actions on check-in

- Stores check-in record in `check_ins` MongoDB collection
- Feeds owner's notes/flag reasons into ContinuousLearning (bottlenecks, delay patterns)
- Resets `last_check_in` timestamp on each goal
- Updates `industry_intelligence` if new delay patterns detected

### Schema — `check_ins` collection

```
{
  org_id:           str
  owner_id:         str
  check_in_date:    datetime
  goals_reviewed:   int
  goals_flagged:    int
  goals_adjusted:   int
  notes: [{
    goal_id:        str
    note:           str
    action_taken:   "flag" | "adjust_deadline" | "reassign" | "dismiss" | "none"
    previous_deadline: Optional[str]
    new_deadline:      Optional[str]
  }]
}
```

### Scheduler

- Uses existing background scheduler (5-minute cycle in scheduler.py)
- Runs a check on every org once per week (configurable per org)
- Checks: `days_since_last_check_in >= 7` AND `org has active goals`
- Sends notification only if there are active goals to review

### Files to create/modify

- `backend/app/core/check_in_service.py` — check-in logic + notification
- `backend/app/scheduler.py` — add weekly check-in task
- `frontend/src/components/owners/CheckInModal.tsx` — check-in UI
- `frontend/src/app/dashboard/check-in/page.tsx` — dedicated check-in page (optional, could be modal)
- `backend/app/api/check_ins.py` — CRUD for check-in records

### Check-ins

- [x] Create check_ins collection schema
- [x] Create check_in_service.py with check-in generation logic
- [x] Add scheduler task: weekly check for orgs due for check-in
- [x] Send notification to owner with active goals summary
- [x] Build CheckInModal UI: goal list with progress, last update, status badges
- [x] Add owner actions: add note, flag blocked, adjust deadline, reassign, dismiss
- [x] Feed owner's flags/notes back into ContinuousLearning (bottlenecks, delay patterns)
- [x] Add goals_reviewed field to track last_check_in per goal
- [x] Make check-in frequency configurable per org (default: 7 days)

---

## Phase 5: Frequency Agent (Real-Time, Content-Aware)

### What it does

Triggered in real-time on every task/goal create/update. Uses AI to:
1. Extract work_category and complexity_level from the description
2. Update `employee_frequencies` collection (upsert by org_hash + role + category)
3. If significant frequency delta → trigger industry_intelligence update

### Agent location

`backend/app/agents/frequency_agent.py`

### Schema — `employee_frequencies` collection

```
{
  org_ref:              str           # anonymized hash (not org_id)
  employee_role:        str           # role title, not name
  industry:             str
  micro_vertical:       str
  work_type:            "task" | "goal"
  work_category:        str           # derived from description via AI
  frequency_per_week:   float
  avg_completion_hours: float
  typical_delay_hours:  float
  samples:              List[str]     # anonymized description snippets
  level:                str           # "beginner"|"intermediate"|"advanced"
  last_updated:         datetime
}
```

### Integration points

- `backend/app/api/goals.py` — create_goal, update_goal → fire-and-forget `frequency_agent.process()`
- Task endpoints (orchestration) — same fire-and-forget pattern
- `backend/app/core/learning.py` — `record_employee_frequency()` method

### Check-ins

- [x] Create frequency_agent.py with AI-based content analysis
- [x] Create record_employee_frequency() in ContinuousLearning
- [x] Wire frequency_agent.process() into goal create/update (background asyncio task)
- [x] Wire frequency_agent.process() into task create/update endpoints
- [x] Test that work_category extraction from descriptions works accurately

---

## Phase 6: Save Frequency ASAP in Continuous Learning

### What changes

Every task/goal mutation triggers `record_employee_frequency()` as a background task — no batching, no polling, no delay.

### Files to modify

- `backend/app/core/learning.py` — ensure all record methods accept async background calls
- Integration already covered by Phase 5 wiring

### Check-ins

- [x] Verify all goal/task mutations trigger frequency recording
- [x] Add async background task pattern (asyncio.create_task) consistently
- [x] Add error handling + logging for background frequency saves

---

## Phase 7: Cross-Company Learning System (Anonymized)

### New MongoDB collections

#### `industry_intelligence`

Cross-org aggregated patterns — no company identifiers.

```
{
  industry:         str
  micro_vertical:   str
  patterns: [{
    pattern_type:     "common_problem" | "goal_completion_time" | "delay_pattern"
    description:      str
    frequency:        int           # how many orgs exhibited this
    confidence:       float
    avg_duration_days: float
    goal_type:        str
    department:       str
    first_seen:       datetime
    last_seen:        datetime
  }]
}
```

#### `goal_outcomes`

Per-goal completion tracking — org referenced by anonymized hash only.

```
{
  goal_id:              str
  org_ref:              str           # deterministic hash
  industry:             str
  micro_vertical:       str
  goal_type:            str
  duration:             str
  department:           str
  priority:             str
  status:               str
  actual_duration_days: float
  estimated_duration_days: float
  was_delayed:          bool
  delay_reason:         str
  completion_reviewed:  bool
  created_at:           datetime
  completed_at:         datetime
}
```

### Aggregation logic

- `ContinuousLearning.aggregate_industry_patterns()` — scheduled or on-demand
- Groups goal_outcomes by industry + micro_vertical
- Computes: avg duration per goal_type, common delay reasons, completion rates
- Stores/updates in `industry_intelligence`

### Consumption

- `get_industry_recommendations(industry, micro_vertical)` → returns:
  - Common problems faced by this vertical
  - Benchmark goal completion times
  - Most effective goal types for this vertical
  - Typical delay patterns

### Check-ins

- [x] Create industry_intelligence collection schema + TTL index
- [x] Create goal_outcomes collection schema
- [x] Add record_goal_outcome() in ContinuousLearning
- [x] Build aggregate_industry_patterns() aggregation logic
- [x] Build get_industry_recommendations() query method
- [x] Add anonymized org hash function (deterministic, non-reversible)
- [x] Wire record_goal_outcome() into goal completion review approval
- [x] Test cross-company aggregation with sample data
- [x] Surface recommendations in Strategy Chat / Dashboard insights

---

## Phase 8: Rename Executive Chat → Strategy Chat

### What changes

- Rename backend file: `executive_chat.py` → `strategy_chat.py`
- Update router prefix
- Rename frontend route: `/dashboard/chat` → `/dashboard/strategy-chat`
- Update all imports and references

### Check-ins

- [x] Rename backend file and update router prefix
- [x] Update all backend imports referencing executive_chat
- [x] Rename frontend API calls /executive-chat/ → /strategy-chat/
- [x] Update sidebar label to "Strategy Chat"
- [x] Add sidebar link (user opted to NOT add for now — skip unless revisited)

---

## Dependencies Between Phases

```
Phase 0 (Multi-Owner) ──────┬──> Phase 1 (Goal Model)
                            ├──> Phase 3 (Review Flow)
                            ├──> Phase 4 (Periodic Check-Ins)
                            └──> Phase 5 (Frequency Agent)
                                     │
                                     └──> Phase 6 (Save ASAP)
                                               │
                                               └──> Phase 7 (Cross-Company Learning)
                                                                       │
                                                                       └──> Phase 8 (Rename)
```

Phase 0 must come first — it changes the data isolation model that all other phases depend on. Phase 1 builds on Phase 0's `created_by` field. Phases 3-8 all assume per-owner isolation is in place.

---

## Key Design Decisions

| Decision | Choice |
|----------|--------|
| Default goals source | AI agent generates on org creation, not hardcoded |
| Goal linking | Hierarchy (parent→sub), not dependency |
| Frequency Agent trigger | Real-time on every task/goal mutation |
| Frequency detail | Includes content/description analysis for work_category |
| Cross-company data | Anonymized — no company names, only industry+vertical+patterns |
| Review flow | Two-step: pending_review → owner approves/rejects |
| Status states | active → pending_review → completed/cancelled |
| Strategy Chat sidebar | Not added for now (URL-only like Assistant) |
| Check-in frequency | Default weekly, configurable per org |
| Check-in trigger | Background scheduler (5-min cycle) checks if 7+ days since last check-in |
| Check-in data fed to learning | Flags, delay notes, deadline adjustments → ContinuousLearning bottlenecks |
| Multi-owner isolation | Per-owner `created_by` field on goals/tasks/docs; org settings/integrations shared |
| Second owner onboarding | Detects existing org by domain → joins as co-owner → gets fresh private workspace |
| Owner visibility | Owners see only their own goals/tasks/docs; cannot see each other's data |
