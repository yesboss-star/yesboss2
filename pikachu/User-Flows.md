# User Flows

## YesBoss — AI-Powered Enterprise Intelligent System and Digital CEO Layer

| Field | Value |
|-------|-------|
| **Document ID** | UX-YB-001 |
| **Document Owner** | Product / UX Design |
| **Version** | 1.0 |
| **Status** | Final Draft |
| **Date** | June 2026 |
| **Classification** | Internal — Confidential |
| **Related Docs** | BRD-YB-001 (`pikachu/BRD.md`), PRD-YB-001 (`pikachu/PRD.md`), DS-YB-001 (`pikachu/Design-System.md`) |

---

## Table of Contents

1. Flow Conventions
2. Authentication Flows
3. Owner Onboarding Flow (10-Step Wizard)
4. Employee Onboarding Flow (4-Step)
5. Core Feature Flows
6. Notification Flows
7. Report Generation Flow
8. Market Intelligence Flow
9. File Processing Flow
10. Zoho Integration Flow
11. Error Handling & Edge Cases
12. Flow Summary Table
13. Codebase File Map

---

## 1. Flow Conventions

### 1.1 Notation Key

| Symbol | Meaning |
|--------|---------|
| `→` | User action leads to next step |
| `○` | Decision point (user choice) |
| `◇` | System process (automated) |
| `⊕` | Parallel action |
| `[Screen]` | Page or modal name — maps to `frontend/src/app/` |
| `{API}` | Backend API call — maps to `backend/app/api/` |
| `[Store]` | Zustand store update — maps to `frontend/src/stores/` |
| `!` | Error/edge case path |
| `[BRD: REQ-XXX]` | Traceable business requirement ID |

### 1.2 State Rules Applied to Every Flow

| Rule | Specification | Implementation File |
|------|---------------|---------------------|
| **Loading** | Skeleton (not spinner) for content areas within 200ms. Button spinner for actions after 200ms. | All page components |
| **Empty** | Illustration + CTA button. Never "No data" without action. | All store-dependent components |
| **Error** | Inline red for form fields. Section-level error + retry for data fetches. Toast for background actions. | `frontend/src/components/ui/` |
| **Success** | Checkmark animation (1s) for completions. Toast (5s auto-dismiss) for background actions. | `frontend/src/components/NotificationToast.tsx` |
| **Navigation** | Back button preserves state. Breadcrumbs on multi-step (onboarding, forgot password). | `frontend/src/app/` layout system |
| **Timing** | All async ops show progress within 200ms. Non-blocking ops show toast. | `frontend/src/hooks/useWebSocket.ts` |

---

## 2. Authentication Flows

### 2.1 User Signup Flow

**BRD Refs:** REQ-AUTH-001, REQ-AUTH-002, REQ-AUTH-003
**Files:** `frontend/src/app/signup/page.tsx`, `backend/app/api/auth.py`, `frontend/src/stores/userStore.ts`

```
[Landing Page — /]
    │
    ├→ Click "Get Started" or "Sign Up"  [60% of traffic enters via Get Started CTA]
    │
    ▼
[Signup Screen — /signup]
    │
    ├→ Tab A: Phone OTP (default)
    │   ├→ Enter Full Name (min 2 chars, max 100)
    │   ├→ Country Code dropdown (searchable, default +91)
    │   ├→ Phone Number (E.164 format validated client-side)
    │   ├→ Click "Send OTP"
    │   │
    │   ◇ Firebase `signInWithPhoneNumber()` — reCAPTCHA invisible
    │   ◇ OTP sent within 3 seconds (P95)
    │   │   ! Invalid phone → "Please enter a valid phone number with country code"
    │   │   ! SMS delivery failure → "Unable to send SMS" + "Resend" button enabled after 30s
    │   │   ! Network timeout >10s → retry button with 5s countdown
    │   │
    │   ├→ Enter 6-digit OTP (6 individual boxes, auto-advance, paste support)
    │   │   ! Wrong OTP → "Incorrect OTP. X attempts remaining." (max 3 → 60s lockout)
    │   │   ! OTP expired after 60s → "Resend OTP" link enabled
    │   │
    │   ◇ OTP verified → Firebase account created
    │   │
    │   ▼
    │
    ├→ Tab B: Email + Password (alternative)
    │   ├→ Email (RFC 5322 regex, max 254 chars)
    │   ├→ Password (real-time strength bar: 8+ chars, 1 uppercase, 1 digit)
    │   ├→ Confirm Password
    │   ├→ Click "Create Account"
    │   │
    │   ◇ Firebase `createUserWithEmailAndPassword()`
    │   │   ! Email already registered → "An account with this email already exists. [Login]"
    │   │   ! Weak password → "Password must have at least 8 characters, 1 uppercase letter, and 1 number"
    │   │   ! Firebase creation failure → "Unable to create account. Please try again."
    │   │
    │   ▼
    │
    ├→ Both paths converge at Role Selection
    │   ├→ "I'm a Business Owner / Founder" — icon: 👑 — description: "I want to manage my organization"
    │   ├→ "I'm an Employee" — icon: 👤 — description: "My company uses YesBoss"
    │   │   ! No selection → "Please select a role to continue"
    │   │
    │   ◇ Role stored: userStore.role, Firebase custom claims, MongoDB users.role
    │   │
    │   ○ Owner → redirect to /onboarding/owner
    │   ○ Employee → redirect to /onboarding/employee
    │   │
    │   ▼
    [Redirect to appropriate onboarding]
```

### 2.2 User Login Flow

**BRD Refs:** REQ-AUTH-004
**Files:** `frontend/src/app/login/page.tsx`, `backend/app/api/auth.py`, `frontend/src/stores/sessionStore.ts`

```
[Landing Page — /]
    │
    ├→ Click "Login"
    │
    ▼
[Login Screen — /login]
    │
    ├→ Tab A: Email + Password
    │   ├→ Email input
    │   ├→ Password input (show/hide toggle)
    │   ├→ Click "Login"
    │   │
    │   ◇ Firebase `signInWithEmailAndPassword()`
    │   │   ! Invalid → "Invalid email or password" (no field-specific)
    │   │   ! 5 failed attempts → 15-minute IP lockout (warning at 3: "X failed attempts remaining")
    │   │
    │   ├→ "Forgot Password?" link → /forgot-password (see 2.3)
    │   │
    │   ◇ On success: set httpOnly cookie `yesboss_token` (30-day expiry)
    │                 set readable cookie `yesboss_user` { uid, role, onboardingComplete }
    │
    ├→ Tab B: Phone OTP
    │   ├→ Phone + Country Code → "Send OTP" → Enter OTP
    │   ◇ Same OTP flow as signup
    │
    ├→ Both tabs:
    │   ◇ Check `onboardingComplete` in cookie
    │   ○ onboardingComplete=true → redirect to /dashboard
    │   ○ onboardingComplete=false → redirect to /onboarding/owner or /onboarding/employee
    │   ○ No previous redirect param → use role-based default
    │
    ▼
[Dashboard — /dashboard] or [Onboarding — /onboarding/*]
```

### 2.3 Forgot Password Flow

**BRD Refs:** REQ-AUTH-005
**Files:** `frontend/src/app/forgot-password/page.tsx`, `backend/app/api/auth.py`

```
[Login Screen] → Click "Forgot Password?"
    │
    ▼
[Step 1: /forgot-password — Send OTP]
    ├→ Enter registered email
    ├→ Click "Send OTP"
    ◇ Firebase sends password reset OTP (lifetime: 10 minutes)
    │   ! Email not found → "No account with this email address"
    │   ! SMTP failure → "Unable to send email. Please try again."
    │
    ▼
[Step 2: Verify OTP]
    ├→ Enter 6-digit OTP
    ◇ Auto-verify on 6 digits
    │   ! Wrong OTP → "Incorrect OTP" + remaining attempts
    │   ! OTP expired → "OTP expired. Request a new one."
    │
    ▼
[Step 3: New Password]
    ├→ New password (same strength rules as signup)
    ├→ Confirm new password
    ├→ Click "Reset Password"
    ◇ Firebase `confirmPasswordReset()`
    │   ! Weak password → specific requirements message
    │   ! Passwords don't match → "Passwords do not match"
    │
    ▼
[Step 4: Success]
    ├→ "Password reset successfully"
    ├→ "Go to Login" button → /login
```

---

## 3. Owner Onboarding Flow (10-Step Wizard)

**BRD Refs:** REQ-ONB-001 through REQ-ONB-010
**Files:** `frontend/src/app/onboarding/owner/page.tsx`, `frontend/src/stores/organizationStore.ts`

### 3.1 Flow Map

```
[Signup → Role = Owner]
    │
    ▼
[Step 1/10: Domain Analysis & Company Detection]
    ├─ ORG-001: Analyze email domain → scrape website → AI enrichment
    ├─ Files: backend/app/api/organizations.py, backend/app/api/intelligence.py
    ├─ Files: backend/app/core/scraper.py, backend/app/core/intelligence.py
    │
    ▼
[Step 2/10: Company Details (review/edit AI-detected info)]
    ├─ ORG-002: Confirm company name, website, size, description
    │
    ▼
[Step 3/10: Industry Selection]
    ├─ ORG-003: AI-suggested industry → confirm or select from 60+ taxonomy
    ├─ File: backend/app/core/taxonomy_store.py, data/custom_taxonomies.json
    │
    ▼
[Step 4/10: File Upload (Optional)]
    ├─ ORG-005: Drag-drop files → text extraction → embeddings → Qdrant
    ├─ Files: backend/app/api/upload.py, backend/app/core/file_processor.py
    │
    ▼
[Step 5/10: Social Presence Detection]
    ├─ ORG-004: 6 platforms, 8 detection strategies
    ├─ File: backend/app/core/social_detector.py
    │
    ▼
[Step 6/10: AI Persona Conversation]
    ├─ ORG-006: LangGraph master agent — 8+ topics, dynamic follow-ups
    ├─ Files: backend/app/agents/master_agent.py, backend/app/api/master_agent.py
    │
    ▼
[Step 7/10: AI Goal Suggestions]
    ├─ ORG-007: 3-5 AI-suggested goals → Accept/Edit/Reject
    ├─ File: backend/app/api/goals.py (GET /goals/suggest)
    │
    ▼
[Step 8/10: Strategy Selection]
    ├─ ORG-008: 2-3 strategies per goal → Select one
    ├─ File: backend/app/api/goals.py (POST /goals/{id}/generate-strategies)
    │
    ▼
[Step 9/10: Task Generation]
    ├─ ORG-009: 3-7 tasks per strategy → Review → Edit → Activate
    ├─ File: backend/app/api/goals.py (POST /goals/{id}/generate-tasks)
    │
    ▼
[Step 10/10: Welcome Summary]
    ├─ ORG-010: Summary cards → "Go to Dashboard"
    ├─ Store: organizationStore.onboardingComplete = true
    │
    ▼
[Dashboard — /dashboard]
```

### 3.2 Step Detail: Domain Analysis

```
[Step 1]
    │
    ├→ Display: "Your email domain: company.com"
    ├→ Click "Analyze My Company" OR enter URL manually
    │
    ◇ POST /api/v1/organizations/by-domain — check if domain exists
    │   → If exists: "This company may already be on YesBoss. Would you like to join?"
    │
    ◇ [Parallel] Firecrawl scrape (10s timeout) → BeautifulSoup fallback (15s)
    ◇ [Parallel] DuckDuckGo search for company info
    │
    ◇ POST /api/v1/intelligence/analyze-domain — xAI Grok enrichment
    │   Input: scraped text + URL → Output: company_name, industry_hints, services, size
    │
    ├→ Progress bar: "🔍 Scanning website" → "🤖 AI analyzing" → "✅ Complete"
    │   ! No website: "We couldn't find a website for this domain" + manual form
    │   ! Scrape blocked (403): DuckDuckGo search fallback
    │   ! AI enrichment fails: present raw scraped data (editable)
    │   ! Personal domain (gmail.com, etc.): prompt for company URL
    │
    ▼
[Results — editable form]
    ├→ Company Name (prefilled from AI)
    ├→ Website URL (editable)
    ├→ Industry (AI-suggested, dropdown)
    ├→ Size (AI-suggested, dropdown)
    ├→ Description (AI-generated, editable textarea)
    │
    ├→ Click "Looks Good — Continue →"
    │
    ▼
[Step 2]
```

### 3.3 Step Detail: AI Persona Conversation

```
[Step 6]
    │
    ├→ Chat interface opens
    ├→ Progress: "Building business profile... 0%"
    │
    ◇ POST /api/v1/agent/init — LangGraph master agent initializes
    │   State: { understanding_level: 0, current_phase: "goals", conversation_history: [] }
    │
    ├→ AI: "Hi! I'm your AI co-founder. Let me understand your business."
    │
    ├→ Phase 1: Goals — "What are your top 3 business goals for this quarter?"
    │   ├→ User responds
    │   ├→ AI generates 2-5 follow-ups (based on response content)
    │   ├→ Progress: understanding_level += 10
    │
    ├→ Phase 2: Challenges — "What's the biggest challenge you're facing?"
    │   ├→ Same pattern: response → follow-ups → progress
    │
    ├→ Phase 3-8: Team Structure, Decision Style, Growth, Bottlenecks, Tech Stack, Competitors
    │
    ├→ Each topic: 10% base + 2.5% per follow-up answer (cap 100%)
    │
    ├→ Terminal: understanding_level >= 80%
    │   ! User gives irrelevant answers: AI rephrases "Let me ask differently..."
    │   ! User tries to skip: "Almost there! Just a few more..."
    │   ! Network interrupt: state preserved in localStorage + organizationStore
    │   ! AI timeout: "Let me think about that..." with retry
    │
    ├→ AI: "Great, I have a solid understanding of your business!"
    ├→ Click "Continue to Goals"
    │
    ▼
[Step 7]
```

### 3.4 Step Detail: Goal → Strategy → Task Generation

```
[Step 7 — Goal Suggestions]
    │
    ◇ POST /api/v1/goals/suggest — AI generates 3-5 goals
    ├→ Each goal card: title, description, rationale (quotes persona answer)
    │   - [Accept] green border → selected
    │   - [Edit] opens inline editor
    │   - [Reject] greyed out
    │   - [+ Add Custom] manual creation
    ├→ Min 1 goal must be accepted → next button disabled otherwise
    │   ! AI returns <3 goals: pad with industry defaults
    │   ! AI fails entirely: manual creation mode
    │
    ▼
[Step 8 — Strategy Selection]
    │
    ◇ POST /api/v1/goals/{id}/generate-strategies — per selected goal
    ├→ Each goal shows 2-3 strategy cards
    ├→ Select exactly 1 strategy per goal
    │   ! Strategies not distinct: AI re-generates
    │   ! AI fails: retry with simpler prompt
    │
    ▼
[Step 9 — Task Review]
    │
    ◇ POST /api/v1/goals/{id}/generate-tasks — per selected strategy
    ├→ All tasks listed grouped by goal
    ├→ Per task: title (editable), department (dropdown), priority, deadline
    ├→ Actions: [Edit], [Remove]
    ├→ [+ Add Task] — manual creation within flow
    ├→ Click "Looks Good, Let's Go!"
    │   ! <3 tasks generated: pad with template defaults
    │   ! Duplicate titles: flagged for review
    │   ! AI fails: manual task creation mode
    │
    ▼
[Step 10 — Welcome]
```

---

## 4. Employee Onboarding Flow (4-Step)

**BRD Refs:** REQ-EMP-001 through REQ-EMP-004
**Files:** `frontend/src/app/onboarding/employee/page.tsx`, `backend/app/api/employees.py`

```
[Signup → Role = Employee]
    │
    ▼
[Step 1/4: Organization Detection]
    │
    ├→ "Your work email: employee@company.com"
    ├→ Click "Detect Organization"
    │
    ◇ POST /api/v1/organizations/by-domain — match domain
    │   → Found: "You're joining {OrgName}" + confirm button
    │   → Not found: "Your company isn't on YesBoss yet"
    │       └→ "Notify My Admin" button sends notification
    │   → Multi-match: show list, user selects
    │   → License full: "Your organization has reached its user limit"
    │
    ▼
[Step 2/4: Department & Manager]
    │
    ├→ Department dropdown (from org settings, default: Engineering, Product, etc.)
    ├→ Manager dropdown (filtered by department)
    │   ! No managers in dept: "Reports directly to founder" option
    │   ! No departments configured: "General" default
    │
    ◇ POST /api/v1/employees — create employee record
    │
    ▼
[Step 3/4: Persona Chat]
    │
    ◇ POST /api/v1/chatbot/employee-persona — 4 questions
    ├→ "What does a typical workday look like for you?"
    ├→ "What tools do you use most?"
    ├→ "What's your preferred communication style?"
    ├→ "What's the biggest bottleneck in your work right now?"
    ├→ AI stores answers — no follow-ups (simplified vs owner)
    ├→ "Skip" option available
    │   ! AI fails: skip option, continue without persona
    │
    ▼
[Step 4/4: Welcome]
    │
    ├→ Summary: assigned tasks, team hierarchy, AI tip
    ├→ "Go to Dashboard" → /dashboard
```

---

## 5. Core Feature Flows

### 5.1 Goal CRUD Flow

**BRD Refs:** REQ-GOL-001 through REQ-GOL-006
**Files:** `frontend/src/app/goals/[id]/page.tsx`, `frontend/src/app/dashboard/page.tsx`, `frontend/src/stores/goalStore.ts`
**Component:** `frontend/src/components/GoalModal.tsx`

```
[Goal List — /goals/[id] or Dashboard Goals section]
    │
    ├→ Filters: status (active/completed/archived), department (dropdown), search (text)
    ├→ Sort: created desc (default), deadline asc/desc
    ├→ Pagination: 20 per page
    │
    ├→ Click "Create Goal" or "Generate Goals" (AI)
    │   │
    │   ◇ GET /api/v1/goals/suggest — AI returns 3-5 suggestions
    │   ├→ Select AI suggestion → pre-fills GoalModal form
    │   └→ OR manual: fill GoalModal
    │
    ├→ [GoalModal] — Title (req, max 200), Description (opt, max 2000),
    │                 Department (req, dropdown), Timeline (start+end, end>start),
    │                 Success Criteria (opt, max 1000)
    │   ◇ POST /api/v1/goals — validates → creates → updates goal list via WebSocket
    │   ! Title empty: "Goal title is required"
    │   ! End date < start: "End date must be after start date"
    │
    ├→ Click goal → Goal Detail page
    │   ├→ Strategies section (expandable, add/edit/select)
    │   ├→ Tasks section (linked tasks with status)
    │   ├→ AI Chat tab (POST /api/v1/goals/{id}/chat — refinement chat)
    │   ├→ Edit: PUT /api/v1/goals/{id}
    │   ├→ Delete: confirmation dialog → soft delete (status=archived)
    │   │   ! Archived goal edit: 403
    │   │   ! Invalid status transition: 400 with allowed list
    │   │   ! Goal with active tasks: warning "{N} tasks will be unlinked"
```

### 5.2 Task Management Flow

**BRD Refs:** REQ-TSK-001 through REQ-TSK-008
**Files:** `frontend/src/app/tasks/page.tsx`, `frontend/src/app/tasks/[id]/page.tsx`, `frontend/src/app/dashboard/task/page.tsx`
**Store:** `frontend/src/stores/taskStore.ts`
**Components:** `frontend/src/components/TaskCard.tsx`, `frontend/src/components/TaskModal.tsx`

```
[Task Pipeline — /tasks]
    │
    ├→ View toggle: [List View] / [Board View]
    │
    ├── List View:
    │   ├→ Filters: status (multi), priority, assignee, goal, search, deadline range
    │   ├→ Sort: createdAt, deadline, priority
    │   ├→ Pagination: 20 per page (max 100)
    │
    ├── Board View: 5 columns — Todo | In Progress | Review | Done | Blocked
    │   ├→ Each column shows count + task cards
    │   ├→ Drag card between columns → PUT /api/v1/tasks/{id} (status update)
    │   │   ! Invalid transition → toast with allowed transitions
    │   │   ! Dependencies not done → "Cannot mark done: dependencies X are not complete"
    │   │   ! Approval required → "This task requires approval"
    │   │   → WebSocket broadcast task:updated
    │
    ├→ Create Task: [TaskModal]
    │   ├→ Title (req, max 200), Description (opt, max 2000)
    │   ├→ Assignee (org employee dropdown), Goal (active goals dropdown)
    │   ├→ Priority (low/medium/high/critical), Deadline (date picker, future)
    │   ├→ Dependencies (multi-select existing tasks)
    │   ├→ Tags (text input, max 5)
    │   ◇ POST /api/v1/tasks → WebSocket task:created
    │   ! Circular dependency: "Task cannot depend on itself"
    │   ! Invalid assignee: "Selected assignee not found in organization"
    │
    ├→ Click task → Task Detail [/tasks/[id]]
    │   ├→ Status update buttons (valid transitions enforced)
    │   ├→ Dependencies section (status of each dependency)
    │   ├→ Comments: POST /api/v1/tasks/{id}/comments
    │   │       ! Delete own comment only within 5 min
    │   ├→ Activity log (status changes with timestamps)
    │   ├→ Approve/Reject (if needsApproval=true) → POST /api/v1/tasks/{id}/approve
    │   │   ! Unauthorized: 403
```

### 5.3 Executive AI Chat Flow

**BRD Refs:** REQ-CHT-001 through REQ-CHT-005
**Files:** `frontend/src/app/dashboard/chat/page.tsx`, `frontend/src/stores/chatStore.ts`
**Backend:** `backend/app/api/executive_chat.py`, `backend/app/agents/master_agent.py`, `backend/app/agents/expert_agents.py`

```
[Executive Chat — /dashboard/chat]
    │
    ├→ Sidebar: conversation history (last 20 sessions)
    ├→ Quick question chips: "How is cash flow?", "Any bottlenecks?", "Team performance?"
    │
    ├→ User sends message
    │
    ◇ POST /api/v1/executive-chat/
    │
    ◇ Backend (3s total target):
    │   1. Intent classification → which expert agents to invoke
    │   2. LangGraph Send() → ⊕ parallel execution to selected agents
    │      ├→ [Finance Agent] — queries financial data → AI analysis
    │      ├→ [Operations Agent] — queries ops metrics → AI analysis
    │      ├→ [Strategy Agent] — queries goals + market → AI analysis
    │      ├→ [HR Agent] — queries employee data → AI analysis
    │      ├→ [Sales Agent] — queries pipeline → AI analysis
    │      ├→ [Product Agent] — queries roadmap → AI analysis
    │      └→ [General] — all 6 if query is broad
    │      ! Agent timeout (10s): "Expert unavailable" placeholder
    │   3. Synthesis: all responses → AI summarizes into coherent answer
    │   4. Action items extracted
    │
    ├→ UI shows: "Consulting Finance, Operations experts..."
    ├→ Response: main answer + per-expert breakdown (collapsible) + action items
    │
    ├→ Action items: type (review/create/schedule/research), title, desc
    │   ├→ "Add as Task" → pre-fills TaskModal
    │   └→ "Dismiss" → hidden
    │
    ├→ Follow-up: context maintained (last 20 messages + Qdrant top-5)
    │
    └→ History persists in MongoDB conversations collection
```

### 5.4 Employee AI Assistant Flow

**BRD Refs:** REQ-ASSIST-001 through REQ-ASSIST-003
**Files:** `frontend/src/app/dashboard/assistant/page.tsx`, `frontend/src/stores/assistantStore.ts`
**Backend:** `backend/app/api/assistant.py`

```
[AI Assistant — /dashboard/assistant]
    │
    ├→ User types: "Create a task to update the homepage for project X"
    │
    ◇ POST /api/v1/assistant/
    │
    ◇ Intent Classification (confidence threshold 0.7):
    │
    ├── Intent=create_task (confidence ≥0.7):
    │   ├→ Extract entities: { title, priority, assignee, deadline, goal }
    │   ├→ If all params present → confirmation card → [Confirm] → POST /api/v1/tasks
    │   └→ If missing params → counter-questions (max 3) → confirmation
    │
    ├── Intent=ask_chat (confidence ≥0.7):
    │   └→ Direct AI response (Q&A, information retrieval)
    │
    ├── Intent=delegate (confidence ≥0.7):
    │   ├→ "Tell John to review the proposal"
    │   ├→ AI: "I'll create a task for John: Review the proposal. Confirm?"
    │   └→ [Confirm] → POST /api/v1/tasks assigned to John
    │
    └── All intents confidence <0.7:
        └→ "I'm not sure what you'd like me to do. Could you clarify?"
          → "Create a task, find information, or delegate to someone?"
```

---

## 6. Notification Flows

**BRD Refs:** REQ-NOT-001 through REQ-NOT-005
**Files:** `backend/app/core/notification_service.py`, `backend/app/core/socket_manager.py`, `backend/app/api/notifications.py`
**Components:** `frontend/src/components/NotificationDropdown.tsx`, `NotificationToast.tsx`, `NotificationWatcher.tsx`

```
[Event → Notification Pipeline]
    │
    Event fires (task assigned, overdue, mentioned, etc.)
    │
    ▼
◇ Notification Service — creates notification document in MongoDB
    │
    ├→ WebSocket: notification:new → user's active connection
    │   ├→ NotificationDropdown: unread count +1 (bell badge max 99+)
    │   ├→ NotificationToast: slides in top-right, auto-dismiss 5s
    │   │   ├→ Click → navigate to deep-link + mark read
    │   │   └→ Max 3 toasts stacked
    │   └→ NotificationWatcher: persists across page navigations
    │
    ├→ Email (critical events only: 3d overdue, escalation, goal_status_change):
    │   → SMTP via backend/app/core/email_service.py
    │   → HTML template: logo, title, message, action button
    │   → Retry 3× at 60s on failure
    │
    └→ Browser Push (if tab inactive):
        → Web Push API with VAPID keys
        → Permissions: granted on first notification (browser prompt)
        → Click notification → opens YesBoss at linked page
```

---

## 7. Report Generation Flow

**BRD Refs:** REQ-RPT-001, REQ-RPT-002, REQ-RPT-003
**Files:** `frontend/src/app/dashboard/reports/page.tsx`, `backend/app/api/reports.py`, `backend/app/core/report_generator.py`
**Store:** `frontend/src/stores/reportStore.ts`

```
[Reports — /dashboard/reports]
    │
    ├→ Tab: Employee Report
    │   ├→ Select employee (dropdown, searchable)
    │   ├→ Select period (7/30/90 days, custom range)
    │   ├→ Click "Generate Report"
    │   │
    │   ◇ POST /api/v1/reports/generate
    │   │   Backend: gather tasks → AI analyze → format
    │   │
    │   ├→ Report: Rating (0-10 + label), Metrics (12/14 tasks, 87% on-time)
    │   │          Strengths (3), Improvements (3), AI Recommendation
    │   │
    │   ├→ "Download PDF" → ReportLab generation → file-saver
    │   │   Filename: employee_report_{name}_{date}.pdf
    │   │
    │   ! No task data: "No task data for this period"
    │   ! AI fails: metric-only report without AI analysis
    │
    ├→ Tab: Org Health
    │   ◇ GET /api/v1/reports/org-health
    │   ├→ Overall score (0-100) + gauge
    │   ├→ 5 dimension bars with scores + weights
    │   ├→ Trend arrow + top recommendation
    │   ! Insufficient data: "Create more goals and tasks to calculate org health"
```

---

## 8. Market Intelligence Flow

**BRD Refs:** REQ-MKT-001, REQ-MKT-002, REQ-MKT-003
**Files:** `frontend/src/app/dashboard/market/page.tsx`, `backend/app/api/market_trends.py`

```
[Market Intelligence — /dashboard/market]
    │
    ├→ Tab: News
    │   ◇ GET /api/v1/trends/news?industry={org.industry}
    │   ├→ Cards: title, source, timestamp, impact level (high/medium/low), summary
    │   ! No industry configured: "Set your industry in settings"
    │   ! Stale >1hr: refresh on page navigation
    │
    ├→ Tab: Impact Analysis
    │   ◇ GET /api/v1/trends/impact
    │   ├→ Each article: relevance 0-100 vs org goals
    │   ├→ Suggested action for relevance ≥60
    │
    ├→ Tab: Recommendations
    │   ◇ GET /api/v1/trends/recommendations
    │   ├→ Cards: title, ROI %, timeline, risk level, rationale
    │   └→ Max 5 recommendations
```

---

## 9. File Processing Flow

**BRD Refs:** REQ-FLE-001, REQ-FLE-002
**Files:** `frontend/src/app/dashboard/data/page.tsx`, `backend/app/api/upload.py`, `backend/app/core/file_processor.py`
**Store:** `frontend/src/stores/documentStore.ts`

```
[Data — /dashboard/data]
    │
    ├→ Drop zone (dashed border) + "Browse Files"
    ├→ Format badges: PDF, DOCX, XLSX, CSV, PNG, JPG (max 25MB each)
    │
    ├→ User drops/selects file(s)
    │
    ◇ POST /api/v1/upload/process (multipart/form-data)
    │   Backend Pipeline (sequential per file, max 5 at a time):
    │   1. Type detection → text extraction:
    │      ├ PDF → PyMuPDF → PyPDF2 fallback
    │      ├ DOCX → python-docx
    │      ├ XLSX → Pandas rows-to-text
    │      ├ CSV → Pandas rows-to-text
    │      └ PNG/JPG → Pillow + pytesseract OCR
    │      ! Unsupported format: immediate rejection
    │      ! >25MB: "File exceeds 25MB limit"
    │      ! Corrupt file: "Could not extract text"
    │      ! OCR no text: "No text found in image"
    │   2. Chunking: 1000 chars, 200 overlap
    │   3. Embedding: OpenAI text-embedding-3-small (1536-dim)
    │      ! API failure → deterministic hash fallback (silent)
    │   4. Store in Qdrant `documents` collection
    │   5. Store metadata in MongoDB `documents` collection
    │
    ├→ Progress per file: Uploading → Processing → Complete / Failed
    │
    ├→ Search bar: "Search your files..." (natural language)
    │   ◇ POST /api/v1/files/search → Qdrant semantic search
    │   ├→ Results: text chunks + filename + score + chunk_index
    │   └→ ! Qdrant unavailable: "File search unavailable" + MongoDB text fallback
```

---

## 10. Zoho Integration Flow

**BRD Refs:** REQ-ZOH-001, REQ-ZOH-002, REQ-ZOH-003, REQ-ZOH-004
**Files:** `backend/app/api/zoho_auth.py`, `backend/app/api/zoho_calendar.py`, `backend/app/core/zoho/`
**Store:** `frontend/src/stores/zohoStore.ts`
**Components:** `frontend/src/components/owners/ZohoConnectButton.tsx`, `ZohoCalendarBooking.tsx`

```
[Settings — /dashboard/settings → Integrations]
    │
    ├→ Zoho Card: [Connect Zoho] button
    │
    ├→ Click → GET /api/v1/zoho/auth → redirect to Zoho OAuth
    │   Scopes: Calendar.ReadWrite, Mail.Send, Tasks.ReadWrite
    │
    ├→ User authorizes → Zoho callback → tokens stored (encrypted in MongoDB)
    │   ! User denies: "Zoho connection cancelled"
    │   ! Token exchange fails: "Unable to connect Zoho. Please try again."
    │
    ├→ Status: "Connected — email@zoho.com"
    │
    ├── Calendar Section:
    │   ├→ Date picker + duration (15/30/45/60 min)
    │   ├→ POST /api/v1/zoho/calendar/check-availability
    │   │   → Available slots displayed
    │   ├→ Select slot → Booking modal → POST /api/v1/zoho/calendar/book
    │   │   ! Timeslot no longer available → "Please re-check availability"
    │   │   → Success: eventId + meetLink
    │
    ├── Task Sync (background, every 15 min):
    │   ├→ Bidirectional: YesBoss ↔ Zoho Tasks
    │   ├→ Deduplication by externalId field
    │   └→ Conflict: Zoho wins (last-writer-wins)
    │
    └→ [Disconnect] → clears tokens + revokes
        ! Zoho API error: "Zoho is temporarily unavailable"
```

---

## 11. Error Handling & Edge Cases

### 11.1 Common Error Flows

| Error | Flow Behavior | User-Facing Message | File Reference |
|-------|---------------|---------------------|----------------|
| Network offline | Retry 3× → fallback to cached state | "No internet connection. Changes will sync when back online." | `frontend/src/hooks/useWebSocket.ts` |
| API 500 | Show error state + retry button | "Something went wrong. Please try again." + [Retry] | All API handlers via `backend/app/main.py` exception handler |
| Rate limited (429) | Auto-retry after 30s | "You're moving too fast! Take a 30-second break." | `backend/app/main.py` rate limiter middleware |
| Auth token expired | Auto-refresh (sliding) → retry request | Silent redirect to refresh → continue | `frontend/src/middleware.ts` |
| AI all providers down | Return cached response or graceful message | "AI is temporarily unavailable. Basic features still work." | `backend/app/core/ai_client.py` |
| AI timeout | Return partial response from completed agents | "Some experts couldn't respond: [list]. Others responded successfully." | `backend/app/agents/master_agent.py` |
| MongoDB timeout | Return cached data from SimpleCache | "Data may be delayed. Showing last available data." | `backend/app/core/cache.py` |
| Qdrant unavailable | Fall to MongoDB text index search | "Semantic search unavailable. Using basic search." | `backend/app/core/qdrant.py` |
| WebSocket disconnect | Exponential backoff reconnection (1s, 2s, 4s, 8s, max 30s) | "Reconnecting..." indicator → hidden on reconnect | `frontend/src/hooks/useWebSocket.ts` |
| SMTP email failure | Retry 3× at 60s → log failure. In-app still works. | Silent (in-app notification works) | `backend/app/core/email_service.py` |
| Firecrawl down | BeautifulSoup fallback automatically | Silent fallback (no user message) | `backend/app/core/scraper.py` |

### 11.2 Edge Case Flows

| Scenario | Handling | File |
|----------|----------|------|
| Empty state (first visit) | Illustration + "Let's get started" CTA | All page components |
| User has 0 tasks | "No tasks yet. Create one or ask AI." + CTA | `frontend/src/app/tasks/page.tsx` |
| Org has 0 employees | "Invite your team to unlock collaboration" | `frontend/src/app/dashboard/page.tsx` |
| Goal has 0 strategies | Auto-prompt: "Generate AI strategies?" | `frontend/src/app/goals/[id]/page.tsx` |
| File upload interrupted | Resume on retry (temp file stored on server) | `backend/app/api/upload.py` |
| Very long text | Truncate with "..." + tooltip on hover | `frontend/src/components/ui/Tooltip.tsx` |
| Browser back during onboarding | Confirm dialog: "Leave onboarding? Progress is saved." | `frontend/src/app/onboarding/owner/page.tsx` |
| Same file uploaded twice | Suffix `_1` added to second filename | `backend/app/core/file_processor.py` |
| Employee with no manager | "Reports directly to founder" default | `frontend/src/app/onboarding/employee/page.tsx` |
| Personal email domain | Prompt for company URL | `backend/app/api/intelligence.py` |
| All tasks rejected from AI | Manual task creation mode | `frontend/src/app/onboarding/owner/page.tsx` |

---

## 12. Flow Summary Table

| Flow ID | Flow Name | Steps | Entry Point | Primary User | BRD Refs | Files |
|---------|-----------|-------|-------------|--------------|----------|-------|
| F-01 | User Signup | 4 | Landing Page | All | REQ-AUTH-001/2/3 | `frontend/src/app/signup/page.tsx` |
| F-02 | User Login | 1-2 | Landing Page | All | REQ-AUTH-004 | `frontend/src/app/login/page.tsx` |
| F-03 | Forgot Password | 4 | Login Page | All | REQ-AUTH-005 | `frontend/src/app/forgot-password/page.tsx` |
| F-04 | Owner Onboarding | 10 | Signup → Owner | Owner | REQ-ONB-001→010 | `frontend/src/app/onboarding/owner/page.tsx` |
| F-05 | Employee Onboarding | 4 | Signup → Employee | Employee | REQ-EMP-001→004 | `frontend/src/app/onboarding/employee/page.tsx` |
| F-06 | Goal CRUD | 3 | Dashboard | Owner | REQ-GOL-001→006 | `frontend/src/app/goals/[id]/page.tsx` |
| F-07 | Task Management | 3 | Dashboard → Tasks | All | REQ-TSK-001→008 | `frontend/src/app/tasks/page.tsx` |
| F-08 | Executive Chat | 3 | Dashboard → Chat | Owner | REQ-CHT-001→005 | `frontend/src/app/dashboard/chat/page.tsx` |
| F-09 | AI Assistant | 2 | Dashboard → Assistant | Employee | REQ-ASSIST-001→003 | `frontend/src/app/dashboard/assistant/page.tsx` |
| F-10 | Notifications | Event | Anywhere | All | REQ-NOT-001→005 | `backend/app/core/notification_service.py` |
| F-11 | Reports | 2 | Dashboard → Reports | Owner/Manager | REQ-RPT-001→003 | `frontend/src/app/dashboard/reports/page.tsx` |
| F-12 | Market Intelligence | 1 | Dashboard → Market | Owner | REQ-MKT-001→003 | `frontend/src/app/dashboard/market/page.tsx` |
| F-13 | File Upload | 2 | Dashboard → Data | All | REQ-FLE-001/002 | `frontend/src/app/dashboard/data/page.tsx` |
| F-14 | Zoho Integration | 3 | Dashboard → Settings | Owner | REQ-ZOH-001→004 | `frontend/src/app/dashboard/settings/page.tsx` |

---

## 13. Codebase File Map

| Component | Path |
|-----------|------|
| All page routes (21) | `frontend/src/app/` |
| All API route files (29) | `backend/app/api/` |
| All Zustand stores (17) | `frontend/src/stores/` |
| UI components (14 Radix wrappers) | `frontend/src/components/ui/` |
| Owner-specific components (13) | `frontend/src/components/owners/` |
| Shared components (24) | `frontend/src/components/` |
| Backend core modules (22) | `backend/app/core/` |
| Agent modules (2) | `backend/app/agents/` |
| Middleware | `frontend/src/middleware.ts` |
| Auth context | `frontend/src/contexts/AuthContext.tsx` |
| Custom hooks | `frontend/src/hooks/` |
| Lib utilities | `frontend/src/lib/` |
| Firebase config | `frontend/src/lib/firebase.ts` |
| WebSocket hook | `frontend/src/hooks/useWebSocket.ts` |

---

*End of User Flows — YesBoss v1.0*
