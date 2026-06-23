# YesBoss — Goals v2 Feature Flows

*Whenever an "agent asks the AI", the backend calls a Large Language Model — Grok by default, with support for GPT-4o, Claude, Gemini, or Qwen. The AI reads the agent's instruction plus company data and returns a response.*

---

## 1) Multi-Owner Private Workspaces

**Problem:** One company can have multiple owners, but each owner needs their own private workspace. Owner A should not see Owner B's goals, tasks, or reports.

**What stays shared:** Company name, industry, integrations, team member list, market intelligence

**What becomes private per owner:** Goals, tasks, documents, reports, check-in notes, chat sessions

**Flow:**
- Owner signs up → System checks if the company domain already exists → If yes, shows "Company X already exists. Do you want to join as an owner?" → Owner joins as co-owner → They land on a fresh dashboard with AI-generated default goals → They see only their own goals, tasks, and data — the other owner's data is completely invisible
- Every goal, task, and report is automatically tagged with the owner who created it
- When listing goals, tasks, or reports, the system filters by the current owner — each owner only sees what they created
- Owners can be managed from Settings (primary owner can remove co-owners)

---

## 2) Goal Model Redesign

Goals now have a richer model with types, hierarchy, and tracking.

**Flow:**
- Owner creates a goal → Picks type: **short-term** (weeks) or **long-term** (quarters/years)
- Picks duration: **one-time** (has an end date) or **continuous** (ongoing, no fixed end)
- If one-time, sets an optional end date
- Can link to a **parent goal** — creates a hierarchy (example: "Increase Q3 Revenue" is parent, "Hire 2 Sales Reps" is a sub-goal)
- System stores the parent-child link and shows a trail on the child goal detail page
- New tracking fields: notes on why a goal was sent back, who approved or rejected it, and when

---

## 3) Default Goals via AI Agent

When a new organization is created, the system generates default goals so the owner has a head start.

**Flow:**
- Owner completes organization creation → System fires a background task that calls an AI agent
- The agent asks the AI: "You are a business strategy expert. Generate 5 default goals for a company in this industry. Make them realistic and actionable." → AI returns 5 goals
- Goals are saved as defaults — they appear on the dashboard with a "Default" badge
- If the AI fails (network error, API down), the system falls back to pre-written templates for common industries: SaaS, Fintech, Healthcare, E-commerce
- Owner can delete all default goals at once with a "Delete Defaults" button
- Owner can also manually re-generate default goals anytime

---

## 4) Goal Completion Review Flow

When an assignee finishes a goal, they request review, and the owner approves or sends it back.

**State machine (in plain terms):**
- Active → Pending Review → Completed (owner approved)
- Active → Pending Review → Active (owner rejected with feedback)
- Active → Cancelled (owner cancels)

**Flow:**
- Assignee finishes work → Clicks "Mark as Complete — Request Review"
- System changes status to pending review → Sends notification to the goal's owner
- Owner sees a pulsing amber "Waiting for Review" badge
- Owner can **Approve** → Status becomes completed, system records who approved and when, saves the outcome for cross-company learning
- Owner can **Reject** with feedback → Status goes back to active, owner's feedback is saved, assignee sees the reason
- Both actions notify the assignee

---

## 5) Periodic Owner Check-Ins

The system proactively asks owners to review their ongoing goals on a regular schedule.

**Flow:**
- On a configurable schedule (default: every 7 days), the background scheduler checks every organization
- For each owner, it gathers all active goals → Calculates how many are behind schedule, how many haven't been updated recently
- Sends a notification: "Your weekly check-in: You have N active goals. M behind schedule, P with no updates recently. Review now?"
- Notification opens a Check-In modal
- **Check-In Modal** shows all active goals with:
  - Progress bar
  - Days since last update
  - Status badge: "On Track" (green), "Behind" (red, past due date), "Stale" (amber, no recent updates)
  - Priority indicators
- Owner can take action on each goal:
  - **Flag as Blocked** — writes a reason → Saved as a pattern for learning
  - **Mark Reviewed** — dismisses the alert, resets the timer
- Owner submits the review → System saves the check-in record, updates when the last check-in happened, feeds flagged reasons into learning
- Check-in frequency is configurable per organization (Settings → Check-In Frequency)

---

## 6) Frequency Agent (Real-Time Work Pattern Analysis)

Every time a goal or task is created or updated, an AI agent analyzes it in the background to understand the kind of work happening.

**Flow:**
- User creates or updates a goal or task → System fires a background task (doesn't block the response)
- The agent asks the AI: "You are a work-pattern analyst. Given this description, extract the work category, complexity level, and estimated hours." → AI returns the analysis
- System saves a record keyed by an anonymized company reference, the assignee's role, work type (task or goal), and work category
- Uses a weighted average so recent work counts more
- If AI fails, defaults to a general category with medium complexity and 4 hours estimated
- This powers cross-company benchmarks and helps the system understand what kind of work each role typically does

---

## 7) Cross-Company Anonymized Learning

The system aggregates goal completion data across all companies to provide industry benchmarks — without revealing which company is which.

**Flow:**
- When a goal is approved as complete, the system saves an anonymized record:
  - Company reference is a one-way hash (same company always produces the same hash, but the hash can't be reversed to find the company)
  - Goal type, duration, department, priority
  - Whether it was delayed and why
  - Actual duration in days
- Every night at a scheduled time, the system runs an aggregation job:
  - Groups all goal outcomes by industry
  - Calculates: completion rate, average duration per goal type, delay rate, top delay reasons
  - Saves the aggregated results
- When Strategy Chat answers questions, it can look up these benchmarks:
  - "Companies in your industry average 14 days for short-term goals"
  - "35% of goals in this industry face delays — top reason: resource constraints"
  - "72% goal completion rate across similar companies"

---

## 8) Strategy Chat (Unified AI Assistant)

The old app had two separate chat features — **Executive Chat** (multi-expert business Q&A) and **Assistant** (intent classification, delegation, meeting booking). These were merged into one unified **Strategy Chat**.

**What changed:**
- The backend and frontend were renamed from "Executive Chat" to "Strategy Chat"
- The old Assistant was merged into Strategy Chat — now one page handles everything
- The frontend stores were merged into a single store

**How the unified chat works:**
- User types a question → System tries the **Smart Ask** flow:
  - Builds a snapshot of the organization (profile, goals, tasks, team, uploaded files)
  - Classifies the intent: does the user want a chat answer, want to take an action, or want to delegate something?
  - If **chat**: AI answers using company data, or asks for a specific file if data is missing
  - If **action** needs more info: AI asks one question at a time to collect details (title, assignee, deadline, priority)
  - If **delegate**: System creates a goal plus a task in one shot, assigns to the named person, notifies them
  - If the Smart Ask flow fails, falls back to gathering the full organization profile and answering with expert perspectives

**Delegation** creates a goal and a task assigned to the named person, completes with in-app and email notification.

**Session management:** Each chat has a title and message history. The sidebar lists all sessions sorted by most recent. Users can create new sessions, switch between them, or delete old ones.

**People search:** Users can search team members by name, email, role, or department — useful when delegating a task.

**File features:** Upload and analyze a document, or upload from a URL.

**Merged chat UI features:**
- **Session sidebar** (toggle via hamburger icon) — lists sessions, "New Chat" button at top
- Clicking a session loads its history, clicking "New Chat" starts fresh
- **Quick action chips** below the input: "How are my finances?", "What's blocking growth?", "How is my team doing?", "What should I focus on?"
- **Example questions** — clickable suggestions for common business questions
- **Input box** — full-width text area with send button
- **Message types:**
  - User messages: right-aligned with avatar
  - Assistant messages: left-aligned with bot icon, formatted text
  - **Question cards**: response with option buttons (Yes/No or choices)
  - **Delegation results**: green card showing what was created and who was assigned
  - **Meeting booking**: confirmation card with time and date
  - **Expert responses**: collapsible panels by role (CFO, COO, CMO, etc.)
- **Copy button** on each assistant message
- **Loading state**: animated dots while AI responds
- **Empty state**: centered logo, tagline "Your Business Strategy Partner", plus quick action chips and example questions

---

## 9) Multi-Owner Private Workspace Data Model

Every owner-scoped document has an owner tag set automatically when created. This tag is used to filter all list queries.

**Collections that are private per owner:** Goals, tasks, reports — all filtered so each owner only sees their own

**Collections that stay shared at company level:** Company settings and integrations, team member list and hierarchy, connected accounts (Zoho, Google), industry news and analysis

**Owner detection:** The system checks if a user is the primary owner or in the co-owners list before allowing owner-level actions (like reviewing goals or changing settings).

---

## Summary: All Agents and What They Say

| Agent | What It Asks the AI |
|---|---|
| **Default Goals Agent** | "You are a business strategy expert. Generate 5 default goals for a company in this industry. Make them realistic and actionable." |
| **Frequency Agent** | "You are a work-pattern analyst. Given this description, extract the work category, complexity level, and estimated hours." |

## Summary: New Storage Areas

| Area | Purpose |
|---|---|
| Check-ins | Weekly owner check-in records — what was reviewed, flagged, and noted |
| Employee Frequencies | Per-assignee work frequency and patterns by category |
| Goal Outcomes | Anonymized goal completion data for cross-company learning |
| Industry Intelligence | Aggregated benchmarks per industry |
| Chat Sessions | Strategy Chat conversation history |

## Summary: Background Tasks

| Task | When | What It Does |
|---|---|---|
| Deadline Reminders | Every ~60 min | Checks for tasks due soon, overdue, or overdue for a while — escalates as needed |
| Daily Digests | Every morning | Sends daily email summary to opted-in users |
| Auto Reports | Weekly and monthly | Generates employee performance and org health reports |
| Owner Check-Ins | Every ~60 min | Finds organizations due for check-in, sends notification with goal summary |
| Cross-Company Aggregation | Every night | Aggregates goal outcomes into industry benchmarks |
| Zoho Sync | Throughout the day | Syncs tasks and calendar events from Zoho |

---

## 10) Meeting Upload → Task Creation

When an owner uploads meeting notes (a file or a past calendar event), the system extracts tasks and assigns them to the right people.

**Upload modal has two tabs:**

**File tab:** Owner drops or selects a meeting notes file (txt, md, pdf, docx, csv) → System reads the text → Sends to AI for task extraction

**Calendar tab:** Owner picks a past meeting from Zoho Calendar → System uses the event's title, description, and attendee list instead of a file

**Title autocomplete:** As the owner types the meeting title, the system suggests their own previously used titles (filtered by that owner only — no other owner sees them)

**Participant multi-select:** The owner types in the participants field → System searches the org chart by name → Shows matching team members with name, department, and role → Owner selects one or more → They appear as chips with a remove button → Their email addresses are stored as the participant list

**AI task extraction:**
- System sends the meeting title, participant list, and notes text to the AI
- The AI is told: "Extract actionable tasks. For each task, return the exact full name of the person responsible as written in the notes, preferably matching someone from the participants list. Do not make up names."
- AI returns a JSON array of tasks with title, description, suggested_assignee, priority, and deadline

**Assignee resolution (three attempts):**
1. **Exact match** — try to find the person by their exact name or email in the org chart
2. **First + last name** — if the name has first and last name, try matching first + last with any middle name
3. **First name only** — try matching by just the first name

**Participant fallback:** If none of the above finds a match, the system tries each participant name against the org chart. If a participant string contains an email, it looks up by email directly. If a match is found, the task is assigned to that person.

**Task creation:** Each task is saved with the assignee's email, the meeting title as source, status set to pending, and a notification is sent to the assigned person.

**Owner notification:** After all tasks are created, the owner gets a notification: "N tasks created from your meeting 'Meeting Title'"

**Results display:** The modal shows a success message with the count and a list of created tasks with their titles and priorities.

---

## 11) Complete User Flow — Screen by Screen

### Landing Page (`/`)
Marketing page with hero section, features showcase, AI insights preview, dashboard preview, integrations, testimonials, FAQ, and call-to-action to sign up.

### Signup (`/signup`)
Two roles: **Owner** (business owner) or **Employee** (team member). Form fields: Full name, contact (auto-detects email or phone), password, confirm password. On submit:
- If email: OTP sent via backend API → user enters 6-digit code → verified
- If phone: reCAPTCHA loads → OTP sent via Firebase SMS → user enters code → verified
- After OTP verified: Firebase auth user created → user synced to backend database → redirected to onboarding

### Owner Onboarding (`/onboarding/owner`)
Four-step progressive flow:

**Step 1 — Company Details:** Company name (with AI suggestions), website (auto-detects industry), industry (tag-based multi-select), micro-vertical, company size. Checks if company domain already exists — if so, offers to join as co-owner. Creates the organization.

**Step 2 — Document Upload:** Upload files (pdf, docx, xlsx, images, txt, csv) or paste business notes. System analyzes documents via AI. Shows AI-extracted business context (stage, model, growth lever, risks) and suggests documents to create.

**Step 3 — AI Persona Questions:** AI generates dynamic multiple-choice questions about the business. Questions continue until the AI decides it has enough information. User can skip this step.

**Step 4 — Goal Setting:** Add goals manually (title + description) or use AI-suggested goals based on industry. Each goal editable with department, priority, assignee. On complete, organization is marked as ready and user is redirected to dashboard.

### Employee Onboarding (`/onboarding/employee`)
Four steps: Department selection → Organization detection (auto from email domain or search) → Manager and reporting structure (search by name) → AI Persona questions in chat-like format. Redirects to dashboard on completion.

### Login (`/login`)
Two tabs — Email (email + password, "Forgot password?" link, "Keep me signed in" toggle) or Phone (country code + number, OTP via Firebase SMS, verify). On success: user synced to backend → redirected to dashboard.

### Forgot Password (`/forgot-password`)
Four stages: Send OTP (email or phone) → Verify OTP (6-digit code) → Reset password (new password + confirm) → Done (success message, link to login).

### Dashboard (`/dashboard`)
Shell with collapsible left sidebar (Dashboard, Orchestration, AI Task Cascade, Uploaded Data) and top header (search, theme toggle, notifications bell, user dropdown with Profile, Settings, Sign out).

**Owner view:** Goal creation, KPI widgets, team overview, goal pipeline grouped by department, recent tasks, pending reviews, check-in button, meeting upload button.

**Employee view:** Welcome header, KPI cards (active goals, completion rate, team size, in progress), stat cards (assigned tasks, in progress, pending review, team updates), task list, pending reviews, team activity feed, AI productivity insights.

### Dashboard Sub-Pages

| Page | Route | What It Does |
|---|---|---|
| **AI Task Cascade** | `/dashboard/task` | Task management with list/kanban views, filters, search, task creation modal |
| **Task Detail** | `/tasks/[id]` | Full task view with comments, status updates, approve/reject, dependencies |
| **Strategy Chat** | `/dashboard/chat` | Unified AI chat with session management, quick actions, delegation, document analysis |
| **AI Assistant** | `/dashboard/assistant` | Structured AI analytics with question cards, meeting booking, deeper session context |
| **Settings** | `/dashboard/settings` | Tabs: Notifications (per-type toggles), Profile, Security, Appearance, Integrations (Zoho) |
| **Market Impact** | `/dashboard/market` | AI-powered market intelligence, trend impact analysis, investment recommendations |
| **Reports** | `/dashboard/reports` | Tabbed analytics: overview, goals breakdown, tasks breakdown, employee reports, org health |
| **Profile** | `/dashboard/profile` | Account info, organization info, social presence (LinkedIn, Twitter, Instagram, etc.) |
| **Team** | `/dashboard/team` | Searchable team member directory with name, role, department |
| **Notifications** | `/dashboard/notifications` | Tabbed inbox (All, Unread, Tasks, Goals, Alerts), grouped by date, mark read/delete |
| **Uploaded Data** | `/dashboard/data` | AI-suggested documents and uploaded files list |
| **AI Dashboard** | `/dashboard/ai` | Document analysis status, module metrics, insights grouped by priority, delegate actions |
| **Orchestration** | `/dashboard/orchestration` | Workflow orchestration view |
| **Goal Detail** | `/goals/[id]` | Goal view with priority, status, assignee, department, timeline, linked tasks |
