# YESBOSS — Phased Implementation Roadmap

> **Execution Rule:** Each phase runs in one session. After completing a phase, run the check-in checklist. If all items pass, ask the user for approval to proceed to the next phase. Do NOT start the next phase without explicit user approval.

---

## Phase A — Zoho Mail Integration + Smart Follow-up & Escalation Loop

**Goal:** Replace generic SMTP with Zoho Mail, upgrade the scheduler to handle a full escalation chain (Assignee → Manager → Owner), and enable professional automated follow-ups.

### Tasks

#### A1. Configure Zoho SMTP
- Set the following in `backend/.env`:
  - `SMTP_HOST=smtp.zoho.com`
  - `SMTP_PORT=587`
  - `SMTP_USER=<your-zoho-email>`
  - `SMTP_PASS=<your-zoho-app-password>`
  - `SMTP_FROM=<your-zoho-email>`
  - `SMTP_USE_TLS=true`
- Verify that `backend/app/core/email_service.py` works with these values (it already supports SMTP with TLS).
- Test by calling `send_email()` manually or via a health-check endpoint.

#### A2. Upgrade Notification Templates for Professional Emails
- In `backend/app/core/email_service.py`, enhance `send_notification_email()` to use Zoho-branded HTML templates (clean, professional).
- Add template variants:
  - "task_deadline_reminder" — polite reminder with task name, due date, link
  - "task_overdue" — urgent tone, escalation warning
  - "escalation_owner" — alert to owner about unresolved overdue task
  - "weekly_digest" — summary of pending, completed, overdue tasks
  - "monthly_report" — performance report with feedback

#### A3. Upgrade Scheduler — Full Escalation Chain
- In `backend/app/core/scheduler.py`, modify `check_deadline_reminders()`:
  - **Due in 3 days:** Reminder to assignee + manager (already exists — keep)
  - **Due tomorrow:** Reminder to assignee + manager (already exists — keep)
  - **Overdue 1 day:** Reminder to assignee + manager notified (already exists — keep)
  - **Overdue 3 days:** **Escalate to owner** — create notification + send email to org owner
  - **Overdue 7 days:** **Owner alert + auto-generated summary report** — send detailed email to owner with all overdue tasks, assignees, durations
- Add a new helper `get_org_owner_email(org_id)` that fetches the owner's email from the `organizations` collection.
- Flag tasks with `escalation_level` (0=none, 1=manager, 2=owner) to prevent duplicate escalations.

#### A4. Frontend — Escalation Dashboard Widget
- In `frontend/src/app/dashboard/page.tsx` (owner view), add an "Escalations" section that shows:
  - Count of overdue tasks escalated to owner
  - List with: task name, assignee, days overdue, action button
- API: `GET /api/v1/tasks?status=overdue&escalated=true&org_id=...`

#### A5. Task Schema Update
- In `backend/app/api/tasks.py`, ensure the task schema includes:
  - `escalation_level` (int, default 0)
  - `overdue_notified` (bool, already exists)
  - `deadline_reminded_3day` (bool, already exists)
  - `owner_escalated` (bool, new)
  - `owner_escalated_at` (datetime, new)

### Files to Modify
- `backend/.env` — Zoho config
- `backend/app/core/email_service.py` — templates
- `backend/app/core/scheduler.py` — escalation chain
- `backend/app/core/notification_service.py` — new notification types
- `backend/app/api/tasks.py` — schema updates + escalation filter
- `frontend/src/app/dashboard/page.tsx` — escalation widget

### ✅ Phase A Check-In
- [ ] Zoho SMTP sends email successfully
- [ ] Each email template renders correctly
- [ ] Scheduler sends 3-day reminder
- [ ] Scheduler sends 1-day reminder
- [ ] Scheduler sends overdue notification to assignee + manager
- [ ] Scheduler escalates to owner at 3 days overdue
- [ ] Scheduler sends owner alert at 7 days overdue
- [ ] Frontend escalation widget shows data
- [ ] No duplicate notifications for same task

---

## Phase B — Meeting Upload → AI Analysis → Automatic Task Creation

**Goal:** Allow owner to upload meeting notes/audio, AI extracts tasks/assignees/deadlines, tasks are auto-created and assigned.

### Tasks

#### B1. Backend — Meeting Processing Endpoint
- Create new file: `backend/app/api/meetings.py`
- New router: `POST /api/v1/meetings/process`
  - Accept: `file` (audio or text), `meeting_title` (string), `participants` (optional list)
  - If audio file → transcribe using Groq's Whisper API (via `groq` Python client, since Groq is already in requirements.txt) or use the existing AI client with a transcription provider
  - If text file → extract text using existing `file_processor.py`
  - Send extracted text + meeting context to AI client with prompt:
    > "Extract actionable tasks from these meeting notes. For each task return: title, description, suggested assignee, suggested priority, suggested deadline. Return as JSON array."
  - Parse AI response → create tasks via existing `POST /api/v1/tasks` logic (call `create_notification` for each)
  - Return: `{ meeting_id, tasks_created: [...], unparsed_text: "..." }`
- Register router in `backend/app/main.py`

#### B2. Frontend — Meeting Upload UI
- In `frontend/src/app/dashboard/page.tsx` (owner view), add a "Upload Meeting Notes" card/button
- Opens a modal (`frontend/src/components/owners/` — new component `MeetingUploadModal.tsx`):
  - Fields: Meeting title, file upload (drag & drop + click), participants list (optional)
  - On submit: POST to `/api/v1/meetings/process`
  - On success: Show summary of created tasks with links to each task
  - On error: Show error message
- Use existing `Modal.tsx`, `Input.tsx`, `Button.tsx` components

#### B3. Notifications on Task Creation
- In `backend/app/api/meetings.py`, after creating tasks, trigger notifications:
  - To each assignee: "New task '[task title]' created from meeting '[meeting_title]'"
  - To owner: "X tasks created from your meeting '[meeting_title]'"

#### B4. Meeting History
- Add `GET /api/v1/meetings/history` — returns list of past meetings with: title, date, tasks created count
- Store meeting records in MongoDB in a new `meetings` collection
- Schema: `{ _id, organization_id, title, file_url, participants[], tasks_created[], raw_text, created_at, created_by }`
- Frontend: Show recent meetings in the owner dashboard

### Files to Create
- `backend/app/api/meetings.py` — new router
- `backend/app/schemas/meeting.py` — Pydantic schemas if needed
- `frontend/src/components/owners/MeetingUploadModal.tsx` — new component

### Files to Modify
- `backend/app/main.py` — register meetings router
- `backend/app/core/database.py` — add `meetings` collection index
- `frontend/src/app/dashboard/page.tsx` — add meeting upload button + history section

### ✅ Phase B Check-In
- [ ] `POST /api/v1/meetings/process` accepts text files and creates tasks
- [ ] Audio transcription works (if applicable)
- [ ] AI accurately extracts tasks from meeting notes
- [ ] Tasks are created with correct assignees, deadlines, priorities
- [ ] Notification sent to each assignee
- [ ] Notification sent to owner with summary
- [ ] Frontend upload modal works (file select, submit, loading, success/error)
- [ ] Meeting history is stored and retrievable
- [ ] Frontend shows recent meetings

---

## Phase C — Employee Performance Reports + Org Health Engine

**Goal:** Generate weekly/monthly performance reports with AI feedback for each employee, derive org health score from aggregated metrics.

### Tasks

#### C1. Backend — Report Generator
- Create new file: `backend/app/core/report_generator.py`
- Function `generate_employee_report(org_id, employee_id, period="weekly")`:
  - Query `task_outcomes` collection for this employee in the period
  - Calculate: tasks completed, tasks overdue, avg completion time, quality score
  - Query `learning_patterns` for patterns involving this employee
  - Send data to AI client with prompt:
    > "Generate a performance report for [employee_name] for [period]. Include: summary, strengths, areas for improvement, specific feedback, and recommendations. Tone: constructive and professional."
  - Return structured report
- Function `generate_org_health(org_id)`:
  - Aggregate across all employees:
    - Goal completion rate (goals collection)
    - Task on-time % (task_outcomes)
    - Employee performance avg (reports)
    - Bottleneck frequency (bottlenecks collection)
    - Market trends alignment (market_trends)
  - Compute weighted score (0-100)
  - AI generates: health status, key risks, top 3 recommendations

#### C2. Backend — Report API Endpoints
- Add to `backend/app/api/reports.py`:
  - `POST /api/v1/reports/generate/employee` — generate report for one employee
  - `POST /api/v1/reports/generate/all-employees` — generate for all
  - `GET /api/v1/organizations/{id}/health` — get current org health
- Store generated reports in MongoDB `reports` collection

#### C3. Auto-Send via Scheduler
- In `backend/app/core/scheduler.py`, add:
  - Weekly: Every Monday 8 AM → generate reports for all employees → send via Zoho email
  - Monthly: 1st of month 8 AM → generate monthly reports + org health → send to owner
- Use `send_notification_email()` with report HTML template

#### C4. Frontend — Reports Dashboard
- In `frontend/src/app/dashboard/reports/page.tsx`:
  - Tab: "Employee Reports" — list of employees with report status (generated/pending)
  - Click employee → view full report (summary, strengths, improvements, feedback)
  - Button: "Generate Report Now"
  - Tab: "Org Health" — health gauge (0-100), risk list, recommendations
- In `frontend/src/app/dashboard/page.tsx`:
  - Add Org Health widget showing score + trend arrow
  - Add "Pending Reports" count badge

### Files to Create
- `backend/app/core/report_generator.py` — new module
- `frontend/src/components/owners/OrgHealthWidget.tsx`
- `frontend/src/components/owners/EmployeeReportCard.tsx`

### Files to Modify
- `backend/app/api/reports.py` — new endpoints
- `backend/app/core/scheduler.py` — auto-send weekly/monthly
- `backend/app/core/email_service.py` — report email template
- `frontend/src/app/dashboard/reports/page.tsx` — full reports UI
- `frontend/src/app/dashboard/page.tsx` — health widget + reports badge

### ✅ Phase C Check-In
- [ ] Employee report generates with accurate data
- [ ] AI feedback is relevant and constructive
- [ ] Org health score calculates correctly
- [ ] Org health recommendations make sense
- [ ] Weekly reports auto-send on Monday
- [ ] Monthly reports auto-send on 1st
- [ ] Frontend reports page shows all employees
- [ ] Frontend org health widget renders correctly
- [ ] Reports stored in MongoDB

---

## Phase D — Goal → Strategy AI Agent → Auto-Task Pipeline

**Goal:** After goal creation, AI generates strategic approaches → owner selects one → system auto-creates tasks with deadlines and assignees.

### Tasks

#### D1. Backend — Strategy Generation Endpoint
- Add to `backend/app/api/goals.py`:
  - `POST /api/v1/goals/{id}/generate-strategies`
  - Takes: goal data + org context (employees, dept, past goals, market trends)
  - Sends to AI client with prompt:
    > "Given this goal '[goal_title]' for a [industry] company with [size] employees, generate 2-3 strategic approaches. For each strategy: name, description, estimated timeline, resources needed, key risks, expected impact."
  - Returns: `{ strategies: [...] }`
  - Store strategies in goal document in MongoDB

#### D2. Backend — Strategy Selection + Task Generation
- `POST /api/v1/goals/{id}/select-strategy`:
  - Accept: `strategy_index` (which strategy was chosen)
  - AI generates tasks from the selected strategy:
    > "Convert this strategy into actionable tasks. For each task: title, description, suggested department, suggested priority, estimated duration. Return as JSON array."
  - For each task, use AI to suggest best assignee based on employee roles + past performance
  - Auto-create tasks via existing task creation logic
  - Return: `{ tasks_created: [...] }`

#### D3. Backend — Enhance Goal Schema
- Add fields to `TaskCreate`/goal schema:
  - `strategies` (list of strategy objects)
  - `selected_strategy` (index + name)
  - `strategy_status` (pending_review, strategy_selected, tasks_created)

#### D4. Frontend — Strategy Selection UI
- In `frontend/src/app/dashboard/goal/page.tsx` or after goal creation:
  - After goal is created, if strategies not yet generated, show "Generating Strategies..." loading state
  - Show 2-3 strategy cards side by side with: name, description, timeline, risks, impact
  - Owner clicks "Select" on one strategy
  - Show confirmation: "This will create X tasks. Proceed?"
  - On confirm → call select-strategy endpoint → redirect to task list for that goal
  - Show success toast with count of tasks created

#### D5. Integration with Market Trends (Phase E data)
- When generating strategies, include relevant market trend data if available (call market trends API internally)
- Tag strategies with "market-aligned" badge if they match detected trends

### Files to Modify
- `backend/app/api/goals.py` — strategy gen + selection + task gen
- `backend/app/schemas/` — goal strategy schemas
- `backend/app/core/ai_client.py` — may need structured output helper for JSON parsing
- `frontend/src/app/dashboard/goal/[id]/page.tsx` — strategy UI
- `frontend/src/components/GoalModal.tsx` — integrate strategy step after goal creation

### ✅ Phase D Check-In
- [ ] AI generates 2-3 relevant strategies for a goal
- [ ] Strategies include timeline, risks, impact
- [ ] Owner can select a strategy
- [ ] Tasks are auto-generated from selected strategy
- [ ] Tasks have suggested assignees based on role + performance
- [ ] Tasks are created and notifications sent
- [ ] Frontend shows strategy cards with select button
- [ ] Confirmation modal works before task creation
- [ ] Market-aligned badge shows where applicable

---

## Phase E — Market Trends → Investment & Growth Insights

**Goal:** Cross-reference market trend data with org-specific data to generate actionable growth/investment recommendations.

### Tasks

#### E1. Backend — Trend-Org Cross-Reference Engine
- Create new file: `backend/app/core/market_impact.py`
- Function `analyze_market_impact(org_id)`:
  - Fetch org data: industry, size, revenue, goals, current performance
  - Fetch latest market trends from existing market_trends module
  - For each trend, compute relevance score based on org industry + data
  - Send top 5 relevant trends + org context to AI:
    > "For this [industry] company with [size] employees and [revenue] revenue, analyze these market trends. For each trend: impact level (high/medium/low), growth opportunity, investment recommendation, risk if ignored. Return as JSON."
  - Store results in `market_impact` collection
  - Return structured impact analysis

#### E2. Backend — API Endpoints
- `GET /api/v1/market-trends/impact/{org_id}` — get current impact analysis
- `POST /api/v1/market-trends/refresh-impact/{org_id}` — force refresh
- `GET /api/v1/market-trends/investment-recommendations/{org_id}` — get investment advice based on trends + org data

#### E3. Frontend — Market Impact Dashboard
- In `frontend/src/app/dashboard/page.tsx` (owner view), add "Market Impact" section:
  - Show top 3 trends with impact level (color-coded: green=positive, yellow=neutral, red=negative)
  - For each: trend name, impact, growth opportunity summary
  - "View Full Analysis" button → opens full page
- In `frontend/src/app/dashboard/data/` or new route `frontend/src/app/dashboard/market/`:
  - Full market impact page with:
    - Impact score per trend
    - Investment recommendations
    - Growth opportunity details
    - Risk alerts
    - "Refresh Analysis" button

#### E4. Integration with Goal Strategy (Phase D)
- In Phase D's strategy generation, include market impact data as context
- When generating org health (Phase C), include market alignment as a factor

### Files to Create
- `backend/app/core/market_impact.py` — new module
- `frontend/src/app/dashboard/market/page.tsx` — new route
- `frontend/src/components/owners/MarketImpactCard.tsx`

### Files to Modify
- `backend/app/api/market_trends.py` — new impact endpoints
- `backend/app/api/goals.py` — pass market data to strategy gen
- `backend/app/core/report_generator.py` — include market alignment in health score
- `frontend/src/app/dashboard/page.tsx` — market impact section

### ✅ Phase E Check-In
- [ ] Market impact analysis computes relevance scores correctly
- [ ] AI generates meaningful impact assessments per trend
- [ ] Investment recommendations are specific and actionable
- [ ] API endpoints return correct data
- [ ] Frontend shows impact cards with color coding
- [ ] Full analysis page renders all sections
- [ ] Refresh button works and updates data
- [ ] Market data integrates into strategy generation (Phase D)
- [ ] Market alignment factor included in org health

---

## Final Phase — End-to-End Testing + Quality + Deployment

**Goal:** Ensure everything works together, fix any issues, and deploy to production.

### Tasks

#### F1. End-to-End Flow Testing
- Test owner signup → org onboarding → goal creation → strategy selection → task creation → employee assignment
- Test meeting upload → task creation → notification → follow-up → escalation → org health update
- Test employee flow: login → view tasks → complete → report generated
- Test all notification types (email, in-app)
- Test scheduler: deadline reminders, escalation, auto-reports

#### F2. AI Response Quality Check
- Review AI outputs for: strategy generation, task extraction from meetings, performance feedback, market impact analysis
- Adjust prompts where responses are generic or inaccurate
- Add fallback responses for AI failures

#### F3. Performance Optimization
- Add MongoDB indexes for frequently queried fields (org_id, status, assignee_id, due_date)
- Optimize Qdrant queries if used in new features
- Frontend: lazy-load heavy components, memoize where needed

#### F4. Security Audit
- Verify all new endpoints have auth checks (get_current_user_optional / get_current_user)
- Ensure file uploads are validated for type and size
- Check no secrets/keys are exposed in frontend code
- Rate-limit email sending to prevent spam

#### F5. Deployment
- Backend: Prepare Railway/Render config (Procfile, start command)
- Frontend: Deploy to Vercel (ensure env vars set)
- Database: Ensure MongoDB Atlas + Qdrant Cloud are production-tier or adequately scaled
- Domains: Configure custom domain if needed
- Zoho: Verify SPF, DKIM, DMARC records for email deliverability

### Files to Create/Modify
- `Procfile` (backend root) — `web: uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- `frontend/next.config.ts` — production config if needed
- Various files for perf/security fixes

### ✅ Final Phase Check-In
- [ ] All 5 phases working end-to-end
- [ ] AI responses are high quality and relevant
- [ ] No performance bottlenecks
- [ ] All endpoints are authenticated
- [ ] File uploads validated
- [ ] No secrets in frontend code
- [ ] Backend deploys successfully
- [ ] Frontend deploys successfully
- [ ] Zoho emails deliverable (SPF/DKIM set up)
- [ ] All env vars configured in production

---

## Summary

| Phase | Focus | Parallelizable | Est. Sessions |
|-------|-------|---------------|---------------|
| **A** | Zoho + Escalation | No (foundation) | 1 session |
| **B** | Meeting → Tasks | Yes (after A) | 1 session |
| **C** | Reports + Health | Yes (with B) | 1 session |
| **D** | Goal → Strategy → Tasks | Yes (with B/C) | 1 session |
| **E** | Market Trends + Insights | Yes (with B/C/D) | 1 session |
| **Final** | Testing + Deploy | No (last) | 1 session |

**Total: ~6 sessions** (5 build + 1 final), can run B/C/D/E in parallel with different agents.
