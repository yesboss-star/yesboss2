# Product Requirements Document (PRD)

## YesBoss — AI-Powered Enterprise Intelligent System and Digital CEO Layer

| Field | Value |
|-------|-------|
| **Document ID** | PRD-YB-001 |
| **Product Name** | YesBoss |
| **Version** | 1.0 |
| **Status** | Final Draft |
| **Author** | Product Team |
| **Date** | June 2026 |
| **Classification** | Internal — Confidential |
| **Related BRD** | BRD-YB-001 (`pikachu/BRD.md`) |
| **Product Type** | SaaS Web Application (Responsive) |

---

## Table of Contents

1. Document Control
2. Purpose & Scope
3. Feature Specifications (By Module)
   - 3.1 Authentication & User Management
   - 3.2 Owner Onboarding
   - 3.3 Employee Onboarding
   - 3.4 Goal Management
   - 3.5 Task Management
   - 3.6 Executive AI Chat
   - 3.7 Dashboard (Owner + Employee)
   - 3.8 AI Assistant (Employee)
   - 3.9 Reports
   - 3.10 File Processing
   - 3.11 Notifications
   - 3.12 Zoho Integration
   - 3.13 Market Intelligence
   - 3.14 Continuous Learning
   - 3.15 Landing Page
4. UI/UX Specifications
   - 4.1 Design System Reference
   - 4.2 Responsive Breakpoints
   - 4.3 Component States
   - 4.4 Page Transitions & Animations
   - 4.5 Accessibility Requirements
5. Data Specifications
   - 5.1 Entity Reference
   - 5.2 Validation Rules
   - 5.3 Data Retention (Reference)
6. Integration Specifications
   - 6.1 AI Provider Integration
   - 6.2 External Service Integration
7. Error Handling Strategy
8. Performance Benchmarks
9. Environments & Deployment
10. Glossary

---

## 1. Document Control

### 1.1 Revision History

| Version | Date | Author | Change Description | Change Reason |
|---------|------|--------|--------------------|---------------|
| 0.1 | June 2026 | Product Team | Initial draft | — |
| 1.0 | TBD | TBD | Approved version | Stakeholder sign-off |

### 1.2 Related Documents

| Document ID | Document Name | Location |
|-------------|---------------|----------|
| BRD-YB-001 | Business Requirements Document | `pikachu/BRD.md` |
| ARCH-YB-001 | Technical Architecture Document | `pikachu/Technical-Architecture.md` |
| API-YB-001 | API Contracts Specification | `pikachu/API-Contracts.md` |
| DB-YB-001 | Database Schema Document | `pikachu/Database-Schema.md` |
| UX-YB-001 | Wireframes & User Flows | `pikachu/Wireframes.md`, `pikachu/User-Flows.md` |
| DS-YB-001 | Design System | `pikachu/Design-System.md` |
| SPRINT-YB-001 | Sprint Plan | `pikachu/Sprint-Plan.md` |

---

## 2. Purpose & Scope

### 2.1 Document Purpose

This PRD translates the business requirements (BRD-YB-001) into precise, implementation-ready product specifications. Every feature specification in this document is designed for zero-ambiguity consumption by an AI coding agent (Cursor/Claude). Every acceptance criterion is measurable, every error state is documented, and every reference maps to an actual file path in the codebase.

### 2.2 Scope

This document covers the full v1.0 scope as defined in BRD-YB-001 Section 11.1. Out-of-scope items are listed in BRD-YB-001 Section 11.2 and are not addressed here.

### 2.3 Reading This Document

Each feature specification references:
- **BRD Req**: The atomic requirement ID from BRD-YB-001 for traceability
- **API Routes**: The backend route files that implement the feature
- **Frontend Components**: The React components that render the feature
- **Zustand Stores**: The state management stores used
- **Page Routes**: The Next.js App Router page files

---

## 3. Feature Specifications

### 3.1 Authentication & User Management

---

#### F-SPEC-AUTH-001: Signup — Phone OTP

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-AUTH-001 |
| **Page Route** | `frontend/src/app/signup/page.tsx` |
| **API Routes** | `backend/app/api/auth.py` |
| **Auth SDK** | `frontend/src/lib/firebase.ts` |
| **Component** | Uses `frontend/src/components/ui/Input.tsx`, `frontend/src/components/ui/Button.tsx` |
| **Flow** | Step 1: Phone number input → Step 2: OTP input → Step 3: Email+Password → Step 4: Role selection |
| **Phone Input** | Country code dropdown (default: +91) + phone number field. Combined value validated as E.164 format via regex `^\+[1-9]\d{1,14}$` |
| **OTP Input** | 6 individual digit boxes (auto-advance on input). Backspace moves to previous box. Paste support (6 digits). Timer countdown (60s) displayed. Resend enabled after 30s. |
| **Firebase Integration** | `signInWithPhoneNumber(phoneAuthProvider, phoneNumber, recaptcha)` — reCAPTCHA invisible widget |
| **Error Display** | Inline error text below relevant field, red (`var(--color-error)`), size 12px/0.75rem |
| **Lockout UI** | Countdown timer (60s) with greyed-out inputs |
| **States** | **Default**: Phone input + country code. **Sending**: Button shows spinner + "Sending OTP...". **OTP**: 6 boxes, timer. **Verifying**: Button spinner + "Verifying...". **Success**: Animated checkmark → auto-advance to Step 3. **Error**: Inline message + field highlight. **Locked**: Full-screen overlay with countdown. |
| **Edge Cases** | User on slow network — 10s timeout on SMS send. User changes number during OTP step — back button returns to phone input (state preserved). Copy-paste OTP from SMS app. |
| **Validation Rules** | Phone: required, E.164, max 15 digits. OTP: required, exactly 6 digits, numeric only. |

---

#### F-SPEC-AUTH-002: Signup — Email + Password

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-AUTH-002 |
| **Page Route** | `frontend/src/app/signup/page.tsx` |
| **API Routes** | `backend/app/api/auth.py` |
| **Component** | Tab toggle between Phone OTP and Email on signup page |
| **Flow** | Tab: "Email Signup" → Email input → Password input → Confirm Password → Submit → Role selection |
| **Password Strength** | Real-time indicator bar (red < meets criteria / yellow > 50% / green> all met). Criteria: min 8 chars (✓), 1 uppercase (✓), 1 digit (✓). Tooltip on hover: password requirements. |
| **Email Validation** | Regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` + DNS MX check on backend (async, non-blocking) |
| **States** | **Default**: Email + password fields. **Validating**: inline checkmarks appear as criteria met. **Submitting**: Button spinner + "Creating Account...". **Success**: Animated checkmark → auto-advance to role selection. **Error**: Inline message with field highlight. **Duplicate**: "An account with this email already exists. [Login]" — link to `/login`. |
| **Edge Cases** | Accidental form double-submit — button disabled after first click. Very long email (>254 chars RFC limit) — reject at input level. Spaces in email — auto-trim on blur. Caps lock detected (warning message near password field). |

---

#### F-SPEC-AUTH-003: Role Selection

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-AUTH-003 |
| **Page Route** | `frontend/src/app/signup/page.tsx` |
| **API Routes** | `backend/app/api/auth.py` |
| **Store** | `frontend/src/stores/userStore.ts` |
| **UI** | Two cards side-by-side (stack on mobile). Owner card: icon (crown/building), title "Business Owner / Founder", description "I want to manage my organization". Employee card: icon (user/badge), title "Employee", description "I'm joining an organization". Selected card: blue border (2px) + checkmark overlay. |
| **Roles** | `owner`, `employee`. Stored in Firebase custom claims + MongoDB `users` collection |
| **Redirect** | Owner → `/onboarding/owner`. Employee → `/onboarding/employee`. |
| **States** | **Default**: Two cards, unselected. **Selected**: Blue border + checkmark. **Confirming**: Button spinner + "Setting up...". **Error**: Modal with retry option. |
| **Edge Cases** | Back navigation from onboarding should not require re-selection. API fails after selection — retry modal. User can't access onboarding URL of opposite role (middleware blocks). |

---

#### F-SPEC-AUTH-004: Login

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-AUTH-004 |
| **Page Route** | `frontend/src/app/login/page.tsx` |
| **API Routes** | `backend/app/api/auth.py` |
| **Store** | `frontend/src/stores/sessionStore.ts` |
| **UI** | Two tabs: "Email & Password" and "Phone OTP". Email tab: email input, password input, "Forgot Password?" link, "Login" button. Phone tab: country code + phone, "Send OTP" button, then OTP input. Both tabs: "Don't have an account? [Sign Up]" link. |
| **Cookie** | `yesboss_token`: httpOnly, secure (production), sameSite="lax", 30-day expiry. `yesboss_user`: non-httpOnly cookie with `{ uid, role, onboardingComplete }` for client-side read. |
| **Redirect Logic** | After login: check `onboardingComplete` in user's org → if complete: `/dashboard`, else role-based onboarding redirect. Previous failed redirect attempt stored in localStorage `redirectAfterLogin` |
| **Rate Limiting** | 5 failed attempts → 15-minute IP lockout (stored in SimpleCache with IP key). Increment on failed. Reset on success. Warning at 3 attempts: "3 failed attempts remaining before temporary lockout." |
| **Sessions** | Session persisted across browser restart via Firebase Auth `setPersistence(browserLocal)` |
| **States** | **Default**: Tab view with email/password OR phone fields. **Loading**: Spinner on submit button. **Success**: Redirect to appropriate page. **Error**: "Invalid email or password" (no field-specific). **Locked**: "Account locked. Try again in 15 minutes." with countdown. **Network error**: "Unable to connect. Check your internet." |
| **Edge Cases** | User has both email and phone auth — login with either works. User deleted from Firebase but still has local cookie — on request, return 401 → clear cookie → redirect to login. Session expires mid-session — middleware redirects with toast "Session expired. Please login again." |

---

#### F-SPEC-AUTH-005: Forgot Password

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-AUTH-005 |
| **Page Route** | `frontend/src/app/forgot-password/page.tsx` |
| **API Routes** | `backend/app/api/auth.py` |
| **UI** | 4-step wizard. Step indicator at top with numbered circles + labels: "Email" → "Verify" → "New Password" → "Done". Current step highlighted. |
| **Step 1** | Email input + "Send OTP" button. Validation: email format + exists in system. |
| **Step 2** | 6-digit OTP input (same as signup OTP). Timer: 10 minutes. Resend after 30s. |
| **Step 3** | New password + confirm password. Same strength requirements as signup. Show/hide toggle on password fields. |
| **Step 4** | Success checkmark + "Your password has been reset." + "Go to Login" button → navigates to `/login`. |
| **States** | Each step has loading/error/success substates. Step transitions verified server-side (401 on invalid OTP → stay on step 2). |
| **Edge Cases** | User closes browser mid-flow — no state to resume (start over). OTP expires → auto-return to step 2 with message "OTP expired. Request a new one." |

---

#### F-SPEC-AUTH-006: Route Protection Middleware

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-AUTH-006 |
| **File** | `frontend/src/middleware.ts` |
| **Matcher** | `["/dashboard/:path*", "/onboarding/:path*", "/login", "/signup"]` |
| **Cookie Check** | Reads `yesboss_token` (presence check — full validation happens on backend). Reads `yesboss_user` for role + onboardingComplete. |
| **Unauthenticated** | No `yesboss_token` → redirect to `/login?redirect=${encodeURIComponent(requestedPath)}` |
| **Authenticated on Auth Pages** | Has token on `/login` or `/signup` → redirect to `/dashboard` |
| **Role Mismatch** | Owner on employee-only routes → 403 page. Employee on owner-only routes (`/dashboard/chat`, `/dashboard/market`) → 403 page |
| **Onboarding Redirect** | `onboardingComplete=true` on `/onboarding/*` → redirect to `/dashboard` |
| **Edge Cases** | Corrupted cookie → clear both cookies → redirect to `/login`. Token valid but user deleted from Firebase → backend returns 401 → middleware receives 401 on first API call → clears cookies → redirects. Multiple rapid redirects — ignore, let final state resolve. |

---

### 3.2 Owner Onboarding

---

#### F-SPEC-ONB-001: Domain Analysis & Company Detection

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-ONB-001, REQ-ONB-002 |
| **Page Route** | `frontend/src/app/onboarding/owner/page.tsx` |
| **API Routes** | `backend/app/api/organizations.py`, `backend/app/api/intelligence.py` |
| **Backend Modules** | `backend/app/core/scraper.py` (Firecrawl + BeautifulSoup), `backend/app/core/intelligence.py` |
| **Store** | `frontend/src/stores/organizationStore.ts` |
| **Onboarding Data** | `frontend/src/lib/onboarding-data.ts` |
| **Flow** | Owner enters email → domain extracted → `POST /api/v1/organizations/by-domain` → Firecrawl scrape (10s timeout) → BeautifulSoup fallback (15s timeout) → AI enrichment via xAI Grok → results displayed |
| **Personal Domain Detection** | Domains flagged: gmail.com, yahoo.com, outlook.com, hotmail.com, icloud.com, protonmail.com, aol.com, mail.com, zoho.com + any domain with common free email patterns. On detection: prompt for company URL. |
| **Scraping Targets** | Home page, /about, /services, /team, /contact. Extraction: company name, meta description, title tags, h1/h2 headers, visible text (top 5000 chars). |
| **AI Enrichment** | xAI Grok receives: raw scraped text, URL, detected page structure. Output: company_name, industry_hints (array), services (array), approximate_size (1-10/11-50/51-200/201-1000/1000+), confidence (0-1). |
| **Duplicate Detection** | Query domain in organizations collection. If found: "This company domain may already be on YesBoss. Would you like to join that organization?" |
| **UI** | Step card: "Analyzing your business..." with live progress: "🔍 Detecting domain" → "🌐 Scraping website" → "🤖 AI analyzing data" → "✅ Complete!". Editable fields appear: Company Name (prefilled), Website (prefilled), Industry (AI suggestion), Description (AI generated). Edit confirmation before proceeding. |
| **States** | **Loading**: Animated progress bar with step labels. **Success**: Editable form with AI suggestions. **No website**: "We couldn't find a website" + manual form. **Partial scrape**: Proceed with available data + "Some data couldn't be retrieved" note. **Already exists**: Warning card + option to join or continue. **Error**: Retry button + manual form option. |
| **Timeout Behavior** | Each scrape attempt has timeout. If all fail: "We couldn't scan your website automatically" + manual form. Background retry option. |

---

#### F-SPEC-ONB-002: Industry Selection

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-ONB-003 |
| **Page Route** | `frontend/src/app/onboarding/owner/page.tsx` |
| **API Routes** | `backend/app/api/intelligence.py` |
| **Backend Module** | `backend/app/core/taxonomy_store.py` |
| **Data Source** | `data/custom_taxonomies.json` — 60+ industries, each with 5-15 micro-verticals |
| **UI** | AI suggestion card: "We think you're in **{Industry}** — {Micro-vertical}" with confidence badge (High/Medium/Low). Below: full dropdown with search. Industry group → expand to micro-vertical. Search autocomplete across both levels. |
| **Confidence Thresholds** | ≥0.8: Auto-select with "Confirm" button. 0.6-0.79: Highlight suggestion + show "Is this correct?" prompt. <0.6: "We're not sure about your industry" + full selection UI. |
| **States** | **Loading**: Skeleton dropdown. **AI ready**: Suggestion card + editable dropdown. **Manual**: Full taxonomy browser if AI unavailable. |
| **Edge Cases** | Custom industry (not in taxonomy) — user types free text → stored as-is, flagged for taxonomy review. Industry taxonomy updates — existing orgs keep their selected industry; new orgs get updated taxonomy. |

---

#### F-SPEC-ONB-003: Social Presence Detection

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-ONB-004 |
| **Page Route** | `frontend/src/app/onboarding/owner/page.tsx` |
| **API Routes** | `backend/app/api/social.py` |
| **Backend Module** | `backend/app/core/social_detector.py` |
| **Detection UI** | 6 platform cards, each showing: platform icon, found status, URL (if found), action buttons. Progress bar: "Detecting social presence... 3/6 platforms checked". |
| **Result Icons** | Verified (✅ green badge), Suggested (⚠️ yellow badge), Not Found (✗ grey badge) |
| **User Actions** | Verified: confirm (pre-checked). Suggested: confirm or edit. Not Found: add manually. |
| **States** | **Detecting**: Animated scanning per platform. **Complete**: All 6 cards with results. **Partial**: Some platforms found. **Failed**: "Could not detect social profiles" + manual entry form. |

---

#### F-SPEC-ONB-004: AI Persona Conversation

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-ONB-006 |
| **Page Route** | `frontend/src/app/onboarding/owner/page.tsx` |
| **API Routes** | `backend/app/api/master_agent.py` |
| **Store** | `frontend/src/stores/organizationStore.ts` |
| **Agent** | `backend/app/agents/master_agent.py` — LangGraph StateGraph |
| **UI** | Chat interface: message bubble (user right, AI left). Progress indicator: "Building business profile... 65%". AI typing animation. Pre-written chips for user to click (or type freely). Knowledge base sidebar showing what's been collected. |
| **State Machine** | `analyze_node` → `question_node` → `update_node` → loop. Terminal condition: `understanding_level >= 80%`. |
| **8 Base Topics** | 1. Top 3 business goals (quarter). 2. Biggest challenge. 3. Team structure (depts, headcount). 4. Decision-making style. 5. Growth priorities. 6. Operational bottlenecks. 7. Tech stack. 8. Competitive landscape. |
| **Dynamic Follow-ups** | 2-5 per base response. Example: User: "Churn is our biggest challenge" → Follow-ups: "What's your current churn rate?", "What triggers churn most?", "What retention strategies have you tried?" |
| **Progress Calculation** | Each base topic = 10%. Dynamic follow-up answers add up to 2.5% each. Cap at 100%. `understanding_level` = min(100, 10 × topics_covered + 2.5 × followups_answered). |
| **States** | **Initializing**: "Setting up...". **Active**: Chat interface with progress. **Completed**: Progress 100% + transition animation. **Interrupted**: Banner "Your progress is saved. Continue when ready." |
| **Edge Cases** | User gives one-word answers → AI rephrases. User types irrelevant — AI gently redirects. Network drop — state preserved in organizationStore + localStorage, resume on reconnect. User tries to skip — "Almost there! Just a few more questions to personalize your experience." |

---

#### F-SPEC-ONB-005: AI Goal Suggestions & Task Generation

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-ONB-007, REQ-ONB-008, REQ-ONB-009 |
| **Page Route** | `frontend/src/app/onboarding/owner/page.tsx` |
| **API Routes** | `backend/app/api/goals.py` |
| **Store** | `frontend/src/stores/goalStore.ts` |
| **Goal Suggestion UI** | 3-5 cards. Each: title, description, rationale (quote from persona), Accept/Edit/Reject buttons. Accepted: green border. Rejected: greyed out. Min 1 required → next button disabled until ≥1 accepted. |
| **Strategy UI** | Per accepted goal: expand to show 2-3 strategy cards. Select exactly one. Selected: blue border. |
| **Task UI** | Per selected strategy: 3-7 task rows. Each: checkbox (keep/remove), title (editable inline), department dropdown, priority select, deadline picker. "Add Custom Task" button. "Looks Good" button to activate. |
| **States** | **Loading suggestions**: Skeleton cards (3). **Goal review**: Cards with accept/reject. **Strategy review**: Per-goal expansion. **Task review**: Full task list. **Complete**: Progress checkmark. |
| **Edge Cases** | AI returns <3 goals → pad with defaults. All goals rejected → manual creation prompt. AI fails entirely → manual mode. Task with duplicate title → flagged. |

---

#### F-SPEC-ONB-006: Onboarding Completion

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-ONB-010 |
| **Page Route** | `frontend/src/app/onboarding/owner/page.tsx` |
| **Store** | `frontend/src/stores/organizationStore.ts`, `frontend/src/stores/sessionStore.ts` |
| **UI** | Success screen with 4 summary cards: Goals Created (count), Tasks Generated (count), Team Members (0 + "Invite Teammates" CTA), Documents Processed (count). "Welcome to YesBoss!" heading. "Go to Dashboard" CTA button. |
| **Post-Completion** | `organizationStore.onboardingComplete = true` → cookie updated → middleware allows dashboard access. Initial WebSocket connection established (socketManager in `backend/app/core/socket_manager.py`). |
| **Edge Cases** | Save fails → retry with exponential backoff. Dashboard load fails → basic welcome page fallback with links. |

---

### 3.3 Employee Onboarding

---

#### F-SPEC-EMP-001: Employee Self-Onboarding

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-EMP-001, REQ-EMP-002 |
| **Page Route** | `frontend/src/app/onboarding/employee/page.tsx` |
| **API Routes** | `backend/app/api/employees.py`, `backend/app/api/chatbot.py` (persona chat) |
| **Store** | `frontend/src/stores/organizationStore.ts`, `frontend/src/stores/userStore.ts` |
| **Flow** | Signup → role=employee → `/onboarding/employee` → Work email → Domain match → "You're joining {OrgName}" → Confirm → Department dropdown → Manager dropdown → Persona chat (4 topics) → Welcome |
| **Domain Match** | `POST /api/v1/organizations/by-domain` checks organizations collection. No match: "Your company isn't on YesBoss yet" + "Notify My Admin" button sends notification to org owner (if owner email can be derived) or shows "Contact your admin to add your organization." |
| **Department UI** | Dropdown sourced from org settings. Default fallback: Engineering, Product, Design, Marketing, Sales, HR, Finance, Operations. |
| **Manager UI** | Dropdown filtered by department. "Reports directly to founder" option if no manager in dept. |
| **States** | **Email entry**: Input + submit. **Detecting**: Spinner + "Finding your organization...". **Found**: Org name + confirm. **Not found**: Message + notify button. **Department**: Dropdown + continue. **Manager**: Dropdown + continue. |

---

#### F-SPEC-EMP-002: Employee Persona Chat

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-EMP-003, REQ-EMP-004 |
| **Page Route** | `frontend/src/app/onboarding/employee/page.tsx` |
| **API Routes** | `backend/app/api/chatbot.py` — endpoint `/api/v1/chatbot/employee-persona` |
| **UI** | Simplified chat. 4 questions displayed one at a time. AI bubble with question, user types answer (or uses pre-written chips). "Skip this question" link. Progress: "Question 2 of 4". |
| **4 Questions** | 1. "What does a typical workday look like for you?" 2. "What tools do you use most?" 3. "What's your preferred communication style?" 4. "What's the biggest bottleneck in your work right now?" |
| **States** | **Active**: Chat interface. **Skipped**: All persona fields empty. **Complete**: Welcome screen. |

---

### 3.4 Goal Management

---

#### F-SPEC-GOL-001: Goal CRUD

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-GOL-001, REQ-GOL-002, REQ-GOL-003, REQ-GOL-004 |
| **Page Routes** | `frontend/src/app/goals/[id]/page.tsx`, `frontend/src/app/dashboard/page.tsx` (goals section) |
| **API Routes** | `backend/app/api/goals.py` — all CRUD endpoints |
| **Store** | `frontend/src/stores/goalStore.ts` — exports `useGoalStore`, `Goal`, `GoalTask` |
| **Component** | `frontend/src/components/GoalModal.tsx` — create/edit modal |
| **Goal List UI** | Table/card view at `/goals/[id]`. Filters: status (active/completed/archived), department (dropdown), search (text). Sort: created (desc default), deadline (asc/desc). Each row: title link, status badge, department, deadline (red if overdue), progress bar (tasks done / total). |
| **Goal Detail UI** | Header: title, status, department, timeline dates. Body: description, success criteria. Strategies section: list with expandable tasks. Task section: linked tasks with status. Chat tab: goal refinement chat (REQ-GOL-005). |
| **Create/Edit Modal** | `GoalModal.tsx`. Fields: title (required, max 200), description (optional, max 2000), department (required, dropdown), start date (required, date picker), end date (required, must be after start), success criteria (optional, max 1000). On edit: pre-filled. |
| **Delete Confirmation** | Modal: "Are you sure? Tasks under this goal will be unlinked (not deleted)." Shows warning if active tasks exist: "{N} active tasks will be unlinked." On confirm: soft delete (status=archived). |
| **Status Transitions** | active→completed, active→archived, completed→active. Immutable after archived: title, description, department, timeline. |
| **States** | **Loading**: Skeleton list (5 rows). **Empty**: "No goals yet. Create your first goal to get started." + CTA. **Error**: "Could not load goals" + retry button. **Success**: Data displayed. |
| **Edge Cases** | End date before start → validation error "End date must be after start date". Duplicate title → allowed (no unique constraint). Archived goal edit → 403 "Cannot edit archived goal". Invalid status transition → 400 with allowed transitions listed. |

---

#### F-SPEC-GOL-002: AI Goal Suggestions

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-GOL-005 |
| **Component** | `frontend/src/components/owners/KPISuggestionsCard.tsx` |
| **API Route** | `backend/app/api/goals.py` — `GET /api/v1/goals/suggest` |
| **Store** | `frontend/src/stores/goalStore.ts` |
| **UI** | "Suggest Goals" button on goal list page. Click → spinner → 3-5 suggestion cards appear. Each: title, description, department, rationale (bold text referencing persona), Accept/Edit/Reject. Accepted goals added to goal list. |
| **Duplicate Filtering** | AI response filtered against existing active goals. Matching titles (>80% similarity via difflib) excluded from suggestions. |
| **States** | **Idle**: Button shown. **Loading**: Skeleton cards. **Complete**: Cards displayed. **Empty**: "No suggestions available. Try manual creation." **Error**: "AI unavailable. Try again or create manually." |

---

#### F-SPEC-GOL-003: Goal Refinement Chat

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-GOL-006 |
| **Component** | `frontend/src/components/owners/GoalDetailChat.tsx` |
| **API Route** | `backend/app/api/goals.py` — `POST /api/v1/goals/{id}/chat` |
| **UI** | Chat panel in goal detail. Context banner at top: "Goal: {title} | Dept: {dept} | Status: {status}". AI persona indicator: "Goal Architect" avatar + name. Input field + send. Message bubbles. |
| **AI Capabilities** | Can suggest: strategy modifications, new tasks, timeline adjustments, success criteria refinement. Each suggestion has "Apply" button. On apply: update goal directly. |
| **States** | **Default**: Chat panel with context. **AI thinking**: Typing animation. **Suggestion**: Card with apply button. **Applied**: Success toast. **Error**: Retry. |

---

### 3.5 Task Management

---

#### F-SPEC-TSK-001: Task CRUD

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-TSK-001, REQ-TSK-002, REQ-TSK-003 |
| **Page Routes** | `frontend/src/app/tasks/page.tsx` (list/board), `frontend/src/app/tasks/[id]/page.tsx` (detail), `frontend/src/app/dashboard/task/page.tsx` |
| **API Routes** | `backend/app/api/tasks.py` |
| **Store** | `frontend/src/stores/taskStore.ts` — exports `useTaskStore`, `Task`, `TaskComment` |
| **Components** | `frontend/src/components/TaskCard.tsx`, `frontend/src/components/TaskModal.tsx`, `frontend/src/components/owners/TaskView.tsx` |
| **List View** | Table: checkbox (select), title (link to detail), assignee avatar, status badge, priority badge, deadline (days remaining or OVERDUE), goal (tag). Filters bar above: status (multi-select checkboxes), priority, assignee dropdown, search input, date range. Pagination bottom. |
| **Board View (Kanban)** | 5 columns: Todo, In Progress, Review, Done, Blocked. Each column shows count + task cards. `TaskCard.tsx`: title, priority dot, assignee avatar small, deadline. Draggable between columns. Drag → `PUT /api/v1/tasks/{id}` with new status. |
| **Create/Edit Modal** | `TaskModal.tsx`. Fields: title (req, max 200), description (opt, max 2000), assignee (dropdown of org employees), goal (dropdown of active goals), priority (select: low/medium/high/critical), deadline (date picker, future date), dependencies (multi-select of existing tasks), tags (text input, max 5). |
| **Task Detail** | `/tasks/[id]`. Header: title, status (dropdown to change), priority badge, deadline. Body: description, assignee info, goal link. Dependencies section: list with statuses. Comments section: `TaskComment[]`, input + send, delete own within 5min. Activity log: status changes with timestamps. |
| **Status Transitions** | Valid: todo→in_progress, in_progress→review, review→done, any→blocked, blocked→any. Invalid → 400 with allowed list. Approval required if `needsApproval=true`: review→done blocked → "This task requires approval". Dependencies check: all deps done before done. |
| **States** | **Loading**: Skeleton table/board. **Empty**: "No tasks yet" + "Create Task" button. **Error**: "Could not load tasks" + retry. **Success**: Data displayed. |
| **Edge Cases** | Self-assignment allowed. Unassign task — set assigneeId to null. Task with past deadline — show OVERDUE badge red. Task with blocked status — show dependency chain. |

---

#### F-SPEC-TSK-002: Comments

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-TSK-004 |
| **API Route** | `backend/app/api/tasks.py` — `POST /api/v1/tasks/{id}/comments` |
| **UI** | Comment section at bottom of task detail. Textarea + Send button. Each comment: avatar, name, timestamp, text, delete button (if within 5min of own comment). Real-time via WebSocket `task:comment` event. |
| **Validation** | Max 2000 chars. Empty → error "Comment cannot be empty". |
| **Edge Cases** | Delete after 5 minutes → "Comment can only be deleted within 5 minutes of posting". Comment while offline → queued and sent on reconnect. |

---

#### F-SPEC-TSK-003: Approval Workflow

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-TSK-005 |
| **API Route** | `backend/app/api/tasks.py` — `POST /api/v1/tasks/{id}/approve` |
| **UI** | Task in "review" status shows "Approve" and "Request Changes" buttons (to manager/owner). "Request Changes" opens comment input for reason; task reverts to in_progress. |
| **States** | **Pending**: Review badge + approve/reject buttons. **Approved**: Done badge + approvedBy info. **Rejected**: In_progress badge + rejection reason comment. **Unauthorized**: 403. |

---

#### F-SPEC-TSK-004: Overdue Escalation

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-TSK-006 |
| **Backend** | `backend/app/core/scheduler.py` — runs every 5 min |
| **Escalation Chain** | 1 day before due: assignee notified (in-app + email). 3 days overdue: assignee's manager notified. 7 days overdue: organization owner notified. |
| **Edge Cases** | No manager → skip to owner. Email fails → retry 3× at 60s interval. Scheduler crash → on restart, process missed escalations within 10-min window. |

---

#### F-SPEC-TSK-005: Task Dependencies

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-TSK-007 |
| **UI** | Dependencies section on task detail. Add dependency: search/select from existing tasks. Each dependency shown as linked card with status. Auto-blocked icon if dependency not done. |
| **Validation** | Circular dependency detected via graph traversal (DFS) on save → reject. Self-dependency → reject. Max 10 dependencies per task. |
| **Auto-Unblock** | When dependency transitions to done → check if all dependencies met → if yes, task status changes blocked→previous_status. WebSocket event broadcast. |

---

#### F-SPEC-TSK-006: WebSocket Real-Time Updates

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-TSK-008 |
| **Backend** | `backend/app/core/socket_manager.py` |
| **Events** | `task:created`, `task:updated`, `task:deleted`, `task:comment`, `task:approved`, `task:escalated` |
| **Client** | `frontend/src/hooks/useWebSocket.ts` — auto-connect on dashboard mount, reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s) |
| **Reconnection** | On reconnect: fetch current task state from REST API to catch missed events |

---

### 3.6 Executive AI Chat

---

#### F-SPEC-CHT-001: Multi-Expert Executive Chat

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-CHT-001, REQ-CHT-002, REQ-CHT-003, REQ-CHT-004, REQ-CHT-005 |
| **Page Route** | `frontend/src/app/dashboard/chat/page.tsx` |
| **API Routes** | `backend/app/api/executive_chat.py` — `POST /api/v1/executive-chat/`, `GET /api/v1/executive-chat/history` |
| **Store** | `frontend/src/stores/chatStore.ts` |
| **Agent** | `backend/app/agents/master_agent.py` (LangGraph master) + `backend/app/agents/expert_agents.py` (6 expert agents) |
| **UI** | Full chat interface. Left sidebar: conversation history list (last 20 sessions, each with title from first message). Main: messages (user left, AI right with typing animation). Right contextual panel: org context summary (goals, tasks, KPIs). Input with quick question chips below: "How is cash flow?", "Any bottlenecks?", "Team performance?", "Revenue trends?". |
| **Intent Classification** | LangGraph determines which expert agents to invoke (finance, operations, strategy, hr, sales, product, general/all). Irrelevant agents skipped. Timeout per agent: 10s. Failed agent → "Expert unavailable" placeholder. |
| **Response Synthesis** | All agent responses collected → AI synthesizes into: main answer (2-3 paragraphs) + per-expert breakdown (collapsible sections with icon + heading: "💰 Finance:", "⚙️ Operations:") + action items. Total synthesis time: ≤3s after last agent response. |
| **Action Items** | Extracted by AI. Displayed as cards below response. Each: type (review/create/schedule/research), title, description, suggested priority. "Add as Task" button → pre-fills TaskModal. "Dismiss" button. NOT auto-created. |
| **Context Window** | Last 20 messages in session + Qdrant vector search for semantically relevant past messages (top 5). Agent receives: system prompt + recent context + relevant history + current message. |
| **Session Management** | Sessions stored in MongoDB `conversations` collection. Retrievable on re-visit. Sidebar: search by first message text. |
| **States** | **Initializing**: Session setup + context loading + quick chips. **Sending**: User message bubble visible, typing indicator for AI. **Agent Processing**: Sub-indicators showing which agents are responding (e.g., "Finance analyzing... ✓ Operations analyzing..."). **Complete**: Full response with sections + action items. **Error**: "Some experts couldn't respond: [list]. Others responded successfully." **Idle**: Quick chips visible. |
| **Edge Cases** | All agents fail → "I apologize, but I'm unable to respond right now. Please try again." + retry button. Very long response (>5000 chars) — collapsed with "Show more". User sends empty message — ignored. Rapid sending — debounce 500ms. |

---

### 3.7 Dashboard

---

#### F-SPEC-DSH-001: Owner Dashboard

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-DSH-001, REQ-DSH-002, REQ-DSH-003 |
| **Page Route** | `frontend/src/app/dashboard/page.tsx` |
| **API Routes** | `backend/app/api/dashboard.py` — `GET /api/v1/dashboard/insights` |
| **Store** | `frontend/src/stores/dashboardStore.ts`, `frontend/src/stores/kpiStore.ts` |
| **Components** | `frontend/src/components/owners/DashboardView.tsx`, `frontend/src/components/owners/OrgHealthWidget.tsx`, `frontend/src/components/AISummaryChat.tsx`, `frontend/src/components/AIInsights.tsx` |
| **Layout** | Top: 5 KPI cards in a row (stack to 2-3 on tablet, 1 on mobile). Below: Module selector tabs (Founder, Finance, Operations, Productivity, Workflow). Main area: active module content. Right sidebar: Org health gauge + top recommendation. Bottom: AI summary chat. |
| **KPI Cards** | 5 cards: Active Goals, Completion Rate %, Team Size, Tasks Due This Week, Overdue Tasks. Each: value (large font 32px/2rem), label (14px/0.875rem body), trend arrow (↑/↓ green/red) + percentage change. |
| **5 Modules** | Content adapts per industry. Each module shows: score (0-100), trend, 3-5 insight cards (title, description, impact). Module data from `backend/app/api/dashboard.py`. |
| **Org Health Gauge** | Semicircular gauge. Score 0-100. Color: red <40, yellow 40-69, green 70-100. Below: 5 dimension bars with labels + scores. Top recommendation text beneath. Data from `backend/app/core/intelligence.py`. |
| **AI Insight Cards** | 3 types: Achievement (green border), Alert (red), Suggestion (blue). Each: icon, title, description, timestamp. |
| **AI Summary Chat** | `AISummaryChat.tsx`: "Ask anything about your business..." input. Quick prompts: "Summarize this week", "What needs attention?", "Overall health?". |
| **States** | **Loading**: Skeleton KPI cards (5), skeleton module area, skeleton gauge. **Empty**: All KPIs show "0" with labels. **Error**: "Could not load dashboard" + retry. **Success**: Full data. |

---

#### F-SPEC-DSH-002: Employee Dashboard

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-DSH-004 |
| **Page Route** | `frontend/src/app/dashboard/page.tsx` |
| **Components** | Task summary, pending reviews, team updates feed, AI insight |
| **Task Summary** | Assigned tasks sorted by deadline (nearest first). Max 10 shown. Each: title, deadline (overdue highlighted), status badge. "View All" → `/tasks`. |
| **Pending Reviews** | Count + list of tasks awaiting user's approval. Each: title, requestor, deadline. "Review" → `/tasks/[id]`. |
| **Team Updates** | Recent activity feed: "[Name] completed task [Title]", "[Name] created goal [Title]", "[Name] joined the team". Timestamps. |
| **AI Insight** | Personalized tip card: e.g., "You complete most tasks before noon. Schedule deep work in the morning." Generated from work patterns. |
| **States** | **Loading**: Skeleton sections. **Empty**: "No tasks assigned" + CTA. **Error**: Section-level error with retry. |

---

### 3.8 AI Assistant (Employee)

---

#### F-SPEC-ASSIST-001: Employee AI Assistant

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-ASSIST-001, REQ-ASSIST-002, REQ-ASSIST-003 |
| **Page Route** | `frontend/src/app/dashboard/assistant/page.tsx` |
| **API Routes** | `backend/app/api/assistant.py` — `POST /api/v1/assistant/` |
| **Store** | `frontend/src/stores/assistantStore.ts` |
| **UI** | Chat interface similar to executive chat but simpler. No agent breakdown. Input with hint: "Ask me anything — create a task, find information, or just chat...". |
| **Intent Classification** | 3 intents: `ask_chat` (general Q&A), `create_task` (task creation), `delegate` (assign to someone). Confidence ≥0.7 → auto-act. <0.7 → ask clarifying question. |
| **Counter-Question Flow** | AI asks min questions (max 3). Example: "Create a task" → "What title? Priority? For which goal?". After clarification → confirmation card with all parameters + Edit/Cancel/Confirm. On confirm → execute. On cancel → return to chat. |
| **Task Creation from Assistant** | Direct: "Create a task titled 'Update homepage' for project X priority high" → confirms → creates. Full flow: intent detected → parameters extracted → confirmation card → create. |
| **States** | **Idle**: Input with hint text. **Typing**: User input visible. **Processing**: Typing indicator (1-2s). **Clarifying**: AI question + user response cycle. **Confirming**: Confirmation card with Edit/Confirm/Cancel. **Executing**: Spinner + "Creating task...". **Success**: Confirmation message with task link. **Error**: "I couldn't do that. Try rephrasing." |
| **Edge Cases** | No parameters extracted → ask all from scratch. User cancels mid-flow → "Cancelled. Let me know if you need anything else." User asks something outside assistant scope → "I can help with tasks, questions, and delegation. Could you rephrase?" |

---

### 3.9 Reports

---

#### F-SPEC-RPT-001: Employee Performance Report

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-RPT-001 |
| **Page Route** | `frontend/src/app/dashboard/reports/page.tsx` |
| **API Routes** | `backend/app/api/reports.py` — `POST /api/v1/reports/generate` |
| **Store** | `frontend/src/stores/reportStore.ts` |
| **UI** | Employee selector dropdown → Period selector (last 7/30/90 days, custom range) → "Generate Report" button. Result: report card with sections (rating, metrics, strengths, improvements, recommendation). "Download PDF" button. |
| **Report Sections** | Header: employee name, department, period. Rating: score 0-10 + label (<5 "Needs Improvement", 5-7 "Good", 8-10 "Excellent"). Metrics: completed, total, on-time, completion %, quality score. Strengths: 3 AI-identified with behavioral examples. Improvements: 3 AI-identified with actionable suggestions. Recommendation: 1 personalized development suggestion. |
| **States** | **Idle**: Selector + button. **Generating**: Skeleton report + progress. **Complete**: Report displayed. **Empty**: "No task data for this period". **Error**: "Could not generate report" + retry. |

---

#### F-SPEC-RPT-002: Org Health Report

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-RPT-002 |
| **Same page** | `/dashboard/reports` — tab toggle between Employee Report and Org Health |
| **API Route** | `backend/app/api/reports.py` — `GET /api/v1/reports/org-health` |
| **UI** | Overall score large + gauge. Below: 5 dimension bars. Trend arrow + percentage. Top 3 recommendations list. Download PDF. |
| **States** | **No data**: "Not enough data to calculate org health. Create more goals and tasks." **Ready**: Full display. |

---

#### F-SPEC-RPT-003: PDF Download

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-RPT-003 |
| **Backend** | `backend/app/core/report_generator.py` — uses ReportLab |
| **UI** | "Download PDF" button on any report. Click → request → PDF downloaded via `file-saver`. Filename: `{report_type}_{employee_name}_{date}.pdf` |
| **States** | **Idle**: Button enabled. **Downloading**: Spinner on button. **Complete**: File downloaded. **Error**: "Could not generate PDF" + retry. |
| **Edge Cases** | Report data changed between view and download → download uses current data (latest data). PDF >10MB → compressed. |

---

### 3.10 File Processing

---

#### F-SPEC-FLE-001: File Upload & Analysis

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-FLE-001 |
| **Page Route** | `frontend/src/app/dashboard/data/page.tsx` |
| **API Routes** | `backend/app/api/upload.py` — `POST /api/v1/upload/process`, `backend/app/api/file_processing.py` |
| **Backend** | `backend/app/core/file_processor.py`, `backend/app/core/qdrant.py` |
| **Store** | `frontend/src/stores/documentStore.ts` |
| **Components** | `frontend/src/components/owners/YourFilesCard.tsx`, `frontend/src/components/owners/SuggestedDocumentsCard.tsx` |
| **UI** | Drag-drop zone (dashed border, full-width) + "Browse Files" button. Below: file list with status per file (Uploading/Processing/Complete/Failed). Supported formats listed as badges: PDF, DOCX, XLSX, CSV, PNG, JPG. Max 25MB per file. |
| **Processing Pipeline** | Upload → Format validation → Text extraction (format-specific parser) → Chunking (1000 chars, 200 overlap) → Embedding (OpenAI text-embedding-3-small, 1536-dim) → Qdrant storage (`documents` collection, payload: org_id, filename, chunk_index) → MongoDB metadata storage |
| **Fallback Chain** | PDF: PyMuPDF → PyPDF2. DOCX: python-docx. XLSX/CSV: Pandas → rows-to-text. PNG/JPG: Pillow → pytesseract OCR. Embedding: OpenAI → deterministic hash (md5 of text truncated to 1536). Qdrant fail: MongoDB only (search degraded). |
| **States** | **Empty**: Drop zone + "Upload your first file" message. **Dragging**: Dashed border highlighted + "Drop files here". **Uploading**: Progress per file (percentage). **Processing**: Per-file spinner + step label. **Complete**: Green checkmark + file card. **Failed**: Red X + error tooltip. **Multiple files**: Queue processed sequentially (max 5 at a time). |
| **Edge Cases** | File >25MB → immediate rejection "File exceeds 25MB limit". Corrupt file → "Could not extract text". OCR on image with no text → "No text found in image". Same filename uploaded twice → second gets filename_1 suffix. Upload during network drop → "Upload interrupted. Resume when connected." |

---

#### F-SPEC-FLE-002: Semantic File Search

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-FLE-002 |
| **Page Route** | `/dashboard/data` |
| **API Route** | `backend/app/api/file_processing.py` — `POST /api/v1/files/search` |
| **UI** | Search bar with magnifying glass icon. Results: list of text chunks with filename badge, relevance score (%), extract preview. Click → expand full text. Click filename → open file detail. |
| **States** | **Idle**: Search bar with placeholder "Search your files...". **Searching**: Spinner. **Results**: List with scores. **Empty**: "No relevant documents found". **Error**: "Search unavailable" + retry. |

---

### 3.11 Notifications

---

#### F-SPEC-NOT-001: Multi-Channel Notifications

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-NOT-001, REQ-NOT-002, REQ-NOT-003, REQ-NOT-004, REQ-NOT-005 |
| **Page Route** | `frontend/src/app/dashboard/notifications/page.tsx` |
| **API Routes** | `backend/app/api/notifications.py`, `backend/app/api/notification_preferences.py`, `backend/app/api/push_subscriptions.py` |
| **Store** | `frontend/src/stores/notificationStore.ts` |
| **Components** | `frontend/src/components/NotificationDropdown.tsx`, `frontend/src/components/NotificationToast.tsx`, `frontend/src/components/NotificationWatcher.tsx` |
| **Backend** | `backend/app/core/notification_service.py`, `backend/app/core/email_service.py`, `backend/app/core/socket_manager.py` |
| **In-App UI** | Bell icon in header with unread count badge (max 99+). Click → dropdown (10 most recent). "View All" → `/dashboard/notifications`. Notification list page: table with type icon, message, timestamp, read/unread dot. "Mark All Read" button. |
| **Toast** | `NotificationToast.tsx`: slides in from top-right, auto-dismiss 5s. Type-colored border. Click → navigate to related page + mark read. |
| **Email** | `backend/app/core/email_service.py` — SMTP. HTML template with logo, title, message, action button (deep-link URL). Sent for critical events: task_overdue (3d+), escalation, goal_status_change. Retry 3× at 60s. |
| **Push** | Web Push API with VAPID keys. `pywebpush` library. User grants permission (first notification → browser prompt). Click push → opens YesBoss at deep-link. |
| **Preferences** | `/dashboard/settings`. Per-channel toggles (in-app, email, push) + per-event toggles (task_assigned, task_overdue, task_completed, mention, escalation, goal_update, team_update). Default: all ON. Changes effective immediately via `PUT /api/v1/notification-preferences`. |
| **States** | **Empty bell**: No unread. **Has unread**: Badge count. **Dropdown**: 10 items max with scroll. **Page**: All notifications paginated (20 per page). **Toast**: Animated slide-in. |

---

### 3.12 Zoho Integration

---

#### F-SPEC-ZOH-001: Zoho OAuth & Calendar

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-ZOH-001, REQ-ZOH-002, REQ-ZOH-003 |
| **Page Route** | Settings section on `/dashboard/settings` |
| **API Routes** | `backend/app/api/zoho_auth.py`, `backend/app/api/zoho_calendar.py` |
| **Store** | `frontend/src/stores/zohoStore.ts` |
| **Components** | `frontend/src/components/owners/ZohoConnectButton.tsx`, `frontend/src/components/owners/ZohoCalendarBooking.tsx` |
| **Backend** | `backend/app/core/zoho/base.py`, `backend/app/core/zoho/calendar.py`, `backend/app/core/zoho/mail_tasks.py` |
| **OAuth Flow** | Click "Connect Zoho" → redirect to Zoho OAuth (scopes: Calendar.ReadWrite, Mail.Send, Tasks.ReadWrite) → authorize → redirect back to YesBoss callback → backend exchanges code for tokens → tokens stored in MongoDB `zoho_tokens` (encrypted) → UI shows "Connected: {email}" |
| **Disconnect** | "Disconnect" button → confirmation → clear tokens → revoke Zoho access |
| **Calendar UI** | Date picker + duration selector (15/30/45/60 min) → "Check Availability" → time slot list (each: start-end, "Book" button). Booking modal: summary, description, attendees (email input, comma-separated), "Confirm Booking". |
| **States** | **Disconnected**: "Connect Zoho" button. **Connecting**: OAuth redirect. **Connected**: "Connected: email@zoho.com" + calendar UI. **Error**: "Unable to connect" + retry. **Token Expired**: Auto-refresh (backend handles silently). Refresh fails → "Reconnect Zoho" prompt. |
| **Edge Cases** | Zoho API down → "Zoho is temporarily unavailable. Try again later." User revokes access from Zoho side → next API call returns 401 → prompt reconnection. |

---

#### F-SPEC-ZOH-002: Task Sync (Bidirectional)

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-ZOH-004 |
| **Backend** | `backend/app/core/scheduler.py` — sync every 15 minutes |
| **Backend Module** | `backend/app/core/zoho/mail_tasks.py` |
| **Deduplication** | Tasks matched by `externalId` field (stores Zoho task ID). New tasks in either direction → create with externalId. Modified → last-writer-wins (check updatedAt). |
| **Mapped Fields** | title ↔ Task Title, description ↔ Description, status ↔ Task Status (mapped: YesBoss todo/in_progress/review/done ↔ Zoho Not Started/In Progress/Completed), priority ↔ Priority (mapped), deadline ↔ End Date |
| **Conflict Resolution** | If both sides modified since last sync → Zoho wins (last-writer-wins). Logged for monitoring. |

---

### 3.13 Market Intelligence

---

#### F-SPEC-MKT-001: Market Trends

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-MKT-001, REQ-MKT-002, REQ-MKT-003 |
| **Page Route** | `frontend/src/app/dashboard/market/page.tsx` |
| **API Routes** | `backend/app/api/market_trends.py` — `GET /api/v1/trends/news`, `GET /api/v1/trends/impact`, `GET /api/v1/trends/recommendations` |
| **Store** | `frontend/src/stores/marketTrendsStore.ts` |
| **Backend** | `backend/app/core/market_impact.py` |
| **UI** | Three sections in tabs: "News", "Impact Analysis", "Recommendations". News tab: article cards (title, source badge, timestamp, impact level color dot, summary, relevance bar). Impact tab: per-article cross-reference with org goals. Recommendations: cards with ROI, timeline, risk level. |
| **States** | **Loading**: Skeleton cards (5). **Empty**: "No news for your industry right now." **Error**: "Market intelligence unavailable" + retry. **Success**: Cards displayed. |
| **Edge Cases** | No industry configured → "Set your industry to get relevant news" + link to settings. Stale data >1 hour → refresh on page navigation. |

---

### 3.14 Continuous Learning

---

#### F-SPEC-LRN-001: Workflow Recording & Bottleneck Detection

| Field | Specification |
|-------|---------------|
| **BRD Req** | REQ-LRN-001, REQ-LRN-002 |
| **Backend** | `backend/app/core/learning.py`, `backend/app/core/scheduler.py` |
| **API Routes** | `backend/app/api/learning.py` |
| **Collections** | MongoDB: `workflows`, `task_outcomes`, `bottlenecks`, `learning_patterns` |
| **Recording** | Every 30 min: collect task creation patterns, completion rates by department/role, status transition times, common dependency chains, recurring block patterns. No PII stored. |
| **Bottleneck Detection** | Weekly analysis: tasks consistently blocked in specific department, assignee with unusually high overdue rate (2σ above mean), dependencies that frequently block progress. Output: bottleneck record + severity + affected tasks/users. Presented on owner dashboard as insight. |

---

### 3.15 Landing Page

---

#### F-SPEC-LND-001: Public Landing Page

| Field | Specification |
|-------|---------------|
| **Page Route** | `frontend/src/app/page.tsx` |
| **Components** | `HeroSection.tsx`, `Features.tsx`, `AIInsights.tsx`, `DashboardPreview.tsx`, `Integrations.tsx`, `Testimonials.tsx`, `FAQ.tsx`, `CTASection.tsx`, `Navbar.tsx`, `Footer.tsx` |
| **Layout** | Single-page scroll. Sections in order: Navbar (sticky, transparent → solid on scroll), Hero, Features (4 cards: Intelligent Onboarding, Org Health, AI Executive Chat, Smart Tasks), AI Insights preview, Dashboard preview (screenshot/mockup), Integrations (Zoho, etc. logos), Testimonials (3 cards, carousel on mobile), FAQ (5+ items, accordion), CTA section, Footer. |
| **States** | **Loading**: Skeleton layout. **Scrolled**: Sticky nav with shadow. **Mobile**: Hamburger menu for nav links. **CTA**: "Get Started Free" → `/signup`. |

---

## 4. UI/UX Specifications

### 4.1 Design System Reference

| Element | Specification | Source File |
|---------|---------------|-------------|
| **Color Palette** | Ref: DS-YB-001 Design System | `pikachu/Design-System.md` |
| **Typography** | Geist (Vercel), system fallback | `pikachu/Design-System.md` |
| **UI Primitives** | Radix UI (no ShadCN) | `frontend/src/components/ui/index.ts` — Button, Input, Select, Modal, Tabs, Badge, Card, Checkbox, DropdownMenu, Label, Textarea, Tooltip, Avatar |
| **Icons** | Lucide React (`lucide-react` ^1.16.0) | |
| **Charts** | Recharts (`recharts` ^3.8.1) | |
| **Styling** | TailwindCSS v4 | `frontend/src/app/globals.css` |
| **Theme** | Light default, dark toggle via `ThemeToggle.tsx` / `ThemeToggleInline.tsx`, `ThemeProvider.tsx` | |

### 4.2 Responsive Breakpoints

| Breakpoint | Width | Nav | Dashboard Layout |
|------------|-------|-----|------------------|
| Mobile | <640px | Bottom tab bar (5 tabs) | Single column stack |
| Tablet | 640-1024px | Sidebar collapsed (icons only) | 2-column grid |
| Desktop | >1024px | Full sidebar | Multi-column, sidebar + main + right panel |

**Touch targets**: All interactive elements ≥44×44px on mobile (WCAG 2.5.5).

### 4.3 Component States

Every interactive component must implement these 5 states:

| State | Implementation | Example |
|-------|----------------|---------|
| **Default** | Normal display | Input: empty field with placeholder |
| **Loading** | Skeleton (not spinner) for content areas. Spinner (16px) for buttons. | Card: animated grey rectangle matching card dimensions |
| **Empty** | Illustration + message + CTA button. Never "No data" without action. | "No tasks yet. Create your first task." |
| **Error** | Inline red text + field highlight for forms. Toast for actions. Section-level error + retry button for data fetches. | "Could not load tasks. [Retry]" |
| **Success** | Checkmark animation (1s). Toast for background actions. Confirmation message for form submissions. | "Task created!" with checkmark + auto-dismiss |

**Edge Cases**: Long text truncated with ellipsis (max 1 line for labels, 3 lines for descriptions). Missing images show initials avatar. Network failures show toast "You're offline" + reconnect indicator.

### 4.4 Page Transitions & Animations

| Element | Animation | Duration | Timing |
|---------|-----------|----------|--------|
| Page route change | Fade in/out | 200ms | ease-in-out |
| Modal open | Scale up + fade | 200ms | ease-out |
| Modal close | Fade out | 150ms | ease-in |
| Toast | Slide from right | 300ms | ease-out |
| Dropdown | Scale from top | 150ms | ease-out |
| Skeleton | Pulse opacity | 1.5s loop | ease-in-out |
| Alert badge (bell) | Scale bounce | 300ms | spring |

### 4.5 Accessibility Requirements

| Requirement | Standard | Verification |
|-------------|----------|--------------|
| Color contrast | WCAG AA (4.5:1 normal, 3:1 large) | Automated check in CI |
| Keyboard navigation | All interactive elements focusable + activatable via keyboard | Manual tab-through test |
| Focus indicators | Visible focus ring (2px blue, offset 2px) on all interactive elements | Visual inspection |
| ARIA labels | All icons have `aria-label`, form fields have associated labels | Lint rule |
| Screen reader | Semantic HTML: `<nav>`, `<main>`, `<section>`, `<h1>-<h6>` hierarchy | Manual screen reader test |
| Reduced motion | Respect `prefers-reduced-motion` — disable all animations | CSS media query |

---

## 5. Data Specifications

### 5.1 Entity Reference

| Entity | MongoDB Collection | Key Fields | Reference |
|--------|-------------------|------------|-----------|
| User | `users` | uid, email, phone, role, displayName, photoURL | DB-YB-001 |
| Organization | `organizations` | name, domain, industry, microVertical, size, socialLinks, personaAnswers, onboardingComplete | DB-YB-001 |
| Employee | `employees` | userId, orgId, department, managerId, role, persona | DB-YB-001 |
| Goal | `goals` | orgId, title, description, department, strategies[], status, timeline | DB-YB-001 |
| Task | `tasks` | goalId, orgId, assigneeId, title, status, priority, deadline, dependencies[] | DB-YB-001 |
| Conversation | `conversations` | userId, orgId, messages[], context, agentType, sessionId | DB-YB-001 |
| Document | `documents` | orgId, filename, type, text, embedding | Qdrant (vectors) + MongoDB (metadata) |
| Notification | `notifications` | userId, orgId, type, title, message, link, read | DB-YB-001 |
| Report | `reports` | orgId, type, data, generatedAt | DB-YB-001 |

### 5.2 Validation Rules

| Field | Rule | Error Message |
|-------|------|---------------|
| Email | RFC 5322 pattern + DNS MX check (async) | "Please enter a valid email address" |
| Phone | E.164: `^\+[1-9]\d{1,14}$` | "Please enter a valid phone number with country code" |
| Password | Min 8 chars, ≥1 uppercase, ≥1 digit | "Password must have at least 8 characters, 1 uppercase letter, and 1 number" |
| Task Title | Required, max 200 chars | "Task title is required" / "Title must be under 200 characters" |
| Goal Title | Required, max 200 chars | "Goal title is required" |
| File Size | Max 25MB per file | "File exceeds 25MB limit" |
| Deadline | Must be future date | "Deadline must be a future date" |
| OTP | Exactly 6 digits | "OTP must be 6 digits" |

### 5.3 Data Retention

Refer to BRD-YB-001 Section 12.2 for full data retention policies. Key numbers:

| Data Type | Retention | Deletion Policy |
|-----------|-----------|-----------------|
| Chat history | 12 months | Auto-archived |
| Notifications | 90 days | Auto-purged |
| Logs | 30 days | Rotated |
| Uploaded files | Active subscription | Deleted with org or manually |
| Deleted user data | 30 days soft-delete | Permanent deletion |

---

## 6. Integration Specifications

### 6.1 AI Provider Integration

| Provider | SDK/Library | Purpose | Timeout | Fallback Order |
|----------|-------------|---------|---------|----------------|
| xAI Grok (`groq` SDK) | `groq` Python package | Primary AI: chat, analysis, generation, enrichment | 15s | Primary |
| OpenAI | `openai` Python package | Text embeddings (`text-embedding-3-small`), AI backup | 10s | 1st fallback |
| Anthropic Claude | `anthropic` Python package | Complex reasoning tasks | 20s | 2nd fallback |
| Google Gemini | `google-generativeai` | Simple analysis tasks | 10s | 3rd fallback |
| Qwen (Ollama) | Local HTTP | Local development + offline fallback | 30s | 4th fallback |

**Client abstraction**: `backend/app/core/ai_client.py` — unified interface, automatic fallback on timeout/error (3s detection window). All providers authenticated via environment variables (see `backend/app/core/config.py`).

### 6.2 External Service Integration

| Service | Integration Type | Auth Method | Purpose | Files |
|---------|-----------------|-------------|---------|-------|
| Firebase Auth | Admin SDK + Client SDK | Service account (env) | Authentication, user management | `frontend/src/lib/firebase.ts`, `backend/app/core/firebase_admin.py` |
| MongoDB Atlas | Motor async driver | Connection string (env) | Primary database | `backend/app/core/database.py` |
| Qdrant Cloud | `qdrant-client` | API key (env) | Vector storage | `backend/app/core/qdrant.py` |
| Zoho | REST API | OAuth 2.0 (tokens stored in MongoDB) | Calendar, Mail, Tasks | `backend/app/core/zoho/` |
| Firecrawl | REST API | API key (env) | Web scraping | `backend/app/core/scraper.py` |
| SMTP | Protocol | Server config (env) | Email notifications | `backend/app/core/email_service.py` |
| Web Push API | Browser API + `pywebpush` | VAPID keys (env) | Push notifications | `backend/app/core/notification_service.py` |
| Supabase | Client SDK | URL + key (env) | Secondary auth (unused MVP) | `frontend/src/lib/supabase.ts`, `backend/app/core/supabase_client.py` |
| DuckDuckGo | HTTP (no API key) | Public | Search fallback for social detection | `backend/app/core/social_detector.py` |
| SearAPI | REST API | API key (env) | Search fallback for social detection | `backend/app/core/social_detector.py` |

---

## 7. Error Handling Strategy

### 7.1 Error Response Format

All API errors follow this structure:

```json
{
  "ok": false,
  "detail": "Human-readable error message",
  "error_code": "TASK_NOT_FOUND",
  "field": "taskId",
  "allowed_values": null
}
```

- `error_code`: Machine-readable string for client-side error mapping
- `field`: Optional — identifies which input field caused the error (for form validation)
- `allowed_values`: Optional — for invalid transitions, lists valid options

### 7.2 Error Code Catalog

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| `AUTH_INVALID_CREDENTIALS` | 401 | Invalid email/password or OTP |
| `AUTH_ACCOUNT_LOCKED` | 429 | Too many failed attempts |
| `AUTH_TOKEN_EXPIRED` | 401 | Session expired |
| `AUTH_UNAUTHORIZED` | 403 | Role mismatch |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid input |
| `INVALID_STATUS_TRANSITION` | 400 | Task/goal status change not allowed |
| `DEPENDENCY_NOT_MET` | 400 | Task dependencies not complete |
| `CIRCULAR_DEPENDENCY` | 400 | Circular task dependency detected |
| `FILE_TOO_LARGE` | 400 | File exceeds 25MB |
| `FILE_UNSUPPORTED` | 400 | Unsupported file format |
| `ZOHO_CONNECTION_ERROR` | 502 | Zoho API unavailable |
| `AI_PROVIDER_ERROR` | 503 | All AI providers failed |
| `RATE_LIMITED` | 429 | Rate limit exceeded |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

### 7.3 Client-Side Error Display

| Error Location | Display Method | Dismiss | Retry |
|----------------|---------------|---------|-------|
| Form field | Inline red text below field + red border | Auto on valid input | No |
| Form submit | Toast top-right + field errors | 5s auto + manual close | No |
| Page data load | Section-level error banner with retry button | Manual | Yes — retries fetch |
| Global error | Full-page error state (illustration + message + CTA) | Navigation away | Yes — "Try Again" |
| Network offline | Persistent top banner "You're offline. Some features may not work." | Auto on reconnect | Auto on reconnect |
| WebSocket disconnect | Subtle indicator "Reconnecting..." → hidden on reconnect | Auto | Auto |

### 7.4 Graceful Degradation

| Failure Scenario | Degraded Behavior | User-Facing Message |
|-----------------|-------------------|---------------------|
| All AI providers down | Return cached AI responses or fallback templates | "AI is temporarily unavailable. Basic features still work." |
| MongoDB unavailable | Return cached data from Redis/SimpleCache | "Data may be delayed. Showing last available data." |
| Qdrant unavailable | Text search falls back to MongoDB `$text` index | "Semantic search unavailable. Using basic search." |
| Zoho API down | Disable Zoho features, show connection status | "Zoho is temporarily unavailable. Try again later." |
| Firecrawl down | Use BeautifulSoup fallback | Silent (no user message) |
| Email service down | Skip email delivery, log failure. In-app + push still work. | Silent (notifications show in-app banner: "Email notifications are delayed") |
| Websocket disconnected | Fall back to polling every 30s | "Reconnecting for real-time updates..." |

---

## 8. Performance Benchmarks

### 8.1 API Response Time (P95)

| Endpoint Category | Target (P95) | Warning (>P95 for 5 min) | Critical (>P95 for 3 min) |
|-------------------|:------------:|:------------------------:|:-------------------------:|
| CRUD (non-AI): create, read, update, delete | 300ms | 500ms | 1s |
| List queries with filters | 500ms | 1s | 2s |
| AI: chat messages (executive + assistant) | 5s | 8s | 12s |
| AI: goal suggestion generation | 5s | 8s | 12s |
| AI: report generation | 5s | 8s | 12s |
| WebSocket delivery (event → client) | 200ms | 500ms | 1s |
| File upload + text extraction (per MB) | 2s/MB | 5s/MB | 10s/MB |
| Vector search (Qdrant) | 500ms | 1s | 2s |

### 8.2 Frontend Performance (Lighthouse)

| Metric | Target | Tool |
|--------|:------:|------|
| First Contentful Paint (FCP) | <1.5s | Lighthouse CI |
| Largest Contentful Paint (LCP) | <2.0s | Lighthouse CI |
| Time to Interactive (TTI) | <3.0s | Lighthouse CI |
| Cumulative Layout Shift (CLS) | <0.1 | Lighthouse CI |
| First Input Delay (FID) | <100ms | Lighthouse CI |
| Lighthouse Performance Score | ≥85 | Lighthouse CI |

### 8.3 Database Performance

| Operation | Target (P95) | Warning |
|-----------|:------------:|---------|
| Single document lookup by _id | 30ms | 100ms |
| Query with filter + sort + limit 20 | 100ms | 200ms |
| Aggregation pipeline (dashboard KPIs) | 200ms | 500ms |
| Write (insert single document) | 50ms | 150ms |
| Update (single document by _id) | 50ms | 150ms |

---

## 9. Environments & Deployment

### 9.1 Environment Matrix

| Environment | Frontend URL | Backend URL | Database | AI Providers | Purpose |
|-------------|-------------|-------------|----------|--------------|---------|
| **Development** | `localhost:3000` | `localhost:8000` | Local MongoDB (or Atlas dev) | All (low rate limits) | Local development |
| **Staging** | `staging.yesboss.ai` | `staging-api.yesboss.ai` | Atlas M10 (staging) | All (production keys) | Pre-release testing |
| **Production** | `app.yesboss.ai` | `api.yesboss.ai` | Atlas M10 (prod) + Qdrant Cloud | All (production keys) | Live |

### 9.2 Deployment Configuration

| Component | Platform | Config Method |
|-----------|----------|---------------|
| Frontend | Vercel | Environment variables via Vercel dashboard. Build: `npm run build` |
| Backend | Railway / Render | Environment variables via platform. Start: `uvicorn app.main:app` |
| MongoDB | Atlas M10 | IP whitelist, connection string in env |
| Qdrant | Qdrant Cloud | API key + URL in env |
| Firebase | Spark (→ Blaze) | Service account JSON in env (base64 encoded) |
| Monitoring | Sentry + BetterUptime | DSN + API key in env |

### 9.3 CI/CD

| Stage | Check | Gate |
|-------|-------|------|
| Pre-commit (local) | TypeScript: type check. Python: type check (mypy) | Developer discipline |
| PR | ESLint (0 errors). Build succeeds (`npm run build`). Unit tests pass. | PR cannot merge |
| Staging deploy | All of PR + Integration tests. Lighthouse CI (score ≥80). | Deploy blocked if fails |
| Production deploy | Manual approval + staging green. Smoke tests (5 min). | Rollback script ready |

---

## 10. Glossary

| Term | Definition |
|------|------------|
| **Master Agent** | LangGraph-based supervisor orchestrating conversation flow, intent classification, and agent routing. File: `backend/app/agents/master_agent.py` |
| **Expert Agent** | Domain-specific AI agent (Finance, Ops, Strategy, HR, Sales, Product) with specialized system prompts. File: `backend/app/agents/expert_agents.py` |
| **LangGraph** | Framework for building stateful, multi-actor AI agent workflows using StateGraph with `Send()` API for parallel execution |
| **Org Health Score** | Algorithmic 0-100 score across 5 weighted dimensions. Calculated in `backend/app/core/intelligence.py` |
| **Qdrant** | Vector database for semantic similarity search. Collections: `documents` (1536-dim), `conversations`, `workflows` |
| **SimpleCache** | In-memory cache in `backend/app/core/cache.py`. Redis-ready for future scaling |
| **Intent Classification** | NLP classification of user message into `ask_chat`, `create_task`, or `delegate` intents for employee assistant |
| **WebSocket Manager** | `backend/app/core/socket_manager.py` — manages WebSocket connections, room-based broadcasting |
| **Scheduler** | `backend/app/core/scheduler.py` — asyncio-based background loop for escalations, learning, sync tasks |
| **Zoho OAuth** | OAuth 2.0 authorization code flow for Zoho API access. Token management in `backend/app/core/zoho/base.py` |

---

*End of PRD — YesBoss v1.0*

---

## Appendix A — Codebase File Map

| Purpose | Path |
|---------|------|
| Frontend pages | `frontend/src/app/` (21 page routes) |
| Frontend components | `frontend/src/components/` (51 component files) |
| Frontend stores | `frontend/src/stores/` (17 Zustand store files) |
| Frontend middleware | `frontend/src/middleware.ts` |
| API routes | `backend/app/api/` (29 route files) |
| Backend core modules | `backend/app/core/` (22 files including zoho/) |
| Backend agents | `backend/app/agents/` (2 files: master + expert) |
| Backend schemas | `backend/app/schemas/` (2 files) |
| Backend dependencies | `backend/app/dependencies/` (2 files: auth + pagination) |
| Frontend hooks | `frontend/src/hooks/` (2 files: useWebSocket, useAIDashboardAdaptation) |
| Frontend context | `frontend/src/contexts/AuthContext.tsx` |
| Frontend lib | `frontend/src/lib/` (7 files: firebase, supabase, utils, etc.) |
