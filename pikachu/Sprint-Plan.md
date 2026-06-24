# Sprint Plan

## YesBoss — An AI-Powered Enterprise Intelligent System and Digital CEO Layer for Modern Organizations

| Field | Detail |
|-------|--------|
| **Document Owner** | Engineering / Project Management |
| **Version** | 1.0 |
| **Status** | Draft |
| **Date** | June 2026 |
| **Confidentiality** | Internal |
| **Sprint Duration** | 2 weeks per sprint |
| **Team Size** | 2-3 developers + 1 PM/designer |

---

## 1. Release Roadmap Overview

```
Sprint 1-2     Sprint 3-4     Sprint 5-6     Sprint 7-8      Sprint 9-10      Sprint 11-12    Sprint 13-14
──────────     ──────────     ──────────     ──────────      ───────────      ────────────    ────────────
Foundation     Onboarding     Goals &        AI Features     Intelligence     Integrations    Polish &
               Wizard         Tasks           & Chat         & Reports        & Notifications  Deploy
                                                                                              
Phase 1        Phase 2        Phase 3        Phase 4         Phase 5          Phase 6         Phase 7
```

### 1.1 Sprint Allocation Summary

| Sprint | Focus Area | Key Deliverables | Story Points |
|--------|------------|------------------|--------------|
| Sprint 1 | Project Setup & Architecture | Repo setup, DB, Auth, AI client, deployment | 35 |
| Sprint 2 | Frontend Foundation & Landing | Landing page, Login/Signup, routing, state management | 30 |
| Sprint 3 | Owner Onboarding (Part 1) | Onboarding wizard steps 1-7 (domain, scrape, industry, social, persona) | 40 |
| Sprint 4 | Owner Onboarding (Part 2) + Employee | Steps 8-10 + Employee onboarding, master agent | 35 |
| Sprint 5 | Goal & Task Management | Goal CRUD, AI suggestions, strategies, task generation | 38 |
| Sprint 6 | Task Pipeline & Dashboard | Task board view, filters, status updates, owner dashboard | 35 |
| Sprint 7 | Executive AI Chat | Multi-agent chat, expert agents (6), synthesis, action items | 40 |
| Sprint 8 | AI Assistant & Employee Dashboard | Employee AI assistant, intent classification, employee dashboard | 32 |
| Sprint 9 | Reports & Org Health | Employee reports, org health scoring, PDF generation | 30 |
| Sprint 10 | Market Intelligence & Learning | Market trends, impact analysis, continuous learning engine | 28 |
| Sprint 11 | Zoho Integration | OAuth flow, calendar booking, task sync | 25 |
| Sprint 12 | Notifications & Real-time | In-app, email, push notifications, WebSocket improvements | 25 |
| Sprint 13 | Testing & QA | E2E tests, integration tests, AI quality evaluation | 30 |
| Sprint 14 | Deployment & Launch | Production deployment, monitoring, documentation | 20 |
| **Total** | | | **~443** |

---

## 2. Sprint 1: Project Setup & Architecture (14 days)

**Goal:** Establish project foundations — repository structure, development environment, database connections, authentication, AI client, and deployment pipeline.

### 2.1 User Stories

| ID | Story | Story Points | Priority | Dependencies |
|----|-------|:------------:|:--------:|:------------:|
| S1-01 | As a developer, I want to set up the project repository structure so that all code is organized and consistent | 3 | P0 | None |
| S1-02 | As a developer, I want to configure environment variables for all services so that the application can connect to external dependencies | 2 | P0 | S1-01 |
| S1-03 | As a developer, I want to establish MongoDB Atlas connection so that data can be persisted and queried | 5 | P0 | S1-02 |
| S1-04 | As a developer, I want to create all MongoDB collections with indexes so that the data layer is ready | 3 | P0 | S1-03 |
| S1-05 | As a developer, I want to set up Qdrant vector DB connection so that semantic search is available | 3 | P0 | S1-02 |
| S1-06 | As a developer, I want to implement the multi-provider AI client (xAI, OpenAI, Anthropic, Gemini, Qwen) so that AI features can be built on top | 8 | P0 | S1-02 |
| S1-07 | As a developer, I want to configure Firebase Admin SDK for server-side auth so that token verification works | 5 | P0 | S1-02 |
| S1-08 | As a developer, I want to set up FastAPI with CORS, security headers, and middleware so that the API is secure and accessible | 3 | P0 | S1-01 |
| S1-09 | As a developer, I want to configure Vercel and Railway deployment targets so that the app can be deployed | 3 | P1 | S1-01 |
| S1-10 | As a developer, I want to initialize Next.js with TypeScript, TailwindCSS, and Radix UI so that the frontend stack is ready | 5 | P0 | S1-01 |

### 2.2 Task Breakdown

| Task ID | Description | Assigned To | Estimate (hrs) | Status |
|---------|-------------|:-----------:|:--------------:|:------:|
| S1-T01 | Create backend folder structure (app/, api/, core/, agents/, schemas/) | Dev 1 | 2 | ✅ Done |
| S1-T02 | Create frontend folder structure (app/, components/, contexts/, stores/, lib/) | Dev 2 | 2 | ✅ Done |
| S1-T03 | Configure .env files for backend and frontend | Dev 1 | 1 | ✅ Done |
| S1-T04 | Implement MongoDB connection with Motor async driver + DNS resolver patch | Dev 1 | 4 | ✅ Done |
| S1-T05 | Create _ensure_collections() with 22 collections and 40+ indexes | Dev 1 | 3 | ✅ Done |
| S1-T06 | Implement Qdrant client connection and collection creation | Dev 1 | 3 | ✅ Done |
| S1-T07 | Implement AIClient with all 5 providers, fallback logic, timeout, circuit breaker | Dev 1 | 6 | ✅ Done |
| S1-T08 | Configure Firebase Admin SDK initialization and token verification | Dev 2 | 4 | ✅ Done |
| S1-T09 | Set up FastAPI main.py with CORS, security headers, request timing middleware | Dev 1 | 3 | ✅ Done |
| S1-T10 | Configure Vercel project for frontend deployment | Dev 2 | 2 | ❌ Pending |
| S1-T11 | Initialize Next.js 16 with App Router, TypeScript, TailwindCSS v4 | Dev 2 | 4 | ✅ Done |
| S1-T12 | Install and configure Radix UI primitives (Checkbox, Dialog, Dropdown, Select, Switch, Tabs) | Dev 2 | 3 | ✅ Done |
| S1-T13 | Set up Zustand with persist middleware, create base store template | Dev 2 | 3 | ✅ Done |
| S1-T14 | Set up ESLint and code quality tools | Dev 2 | 1 | ✅ Done |

### 2.3 Definition of Done

- [ ] All PRs merged to main branch
- [ ] Backend starts with `python run.py` without errors
- [ ] Frontend starts with `npm run dev` without errors
- [ ] MongoDB connection verified (can read/write)
- [ ] Qdrant connection verified (can upsert/search vectors)
- [ ] Firebase token verification works
- [ ] AI client returns responses from at least 1 provider
- [ ] CORS and security headers verified via curl/Postman

---

## 3. Sprint 2: Frontend Foundation & Landing Page (14 days)

**Goal:** Build the landing page, authentication flow, routing, and core state management.

### 3.1 User Stories

| ID | Story | Points | Priority |
|----|-------|:------:|:--------:|
| S2-01 | As a visitor, I want to see a professional landing page so that I understand what YesBoss offers | 8 | P0 |
| S2-02 | As a user, I want to sign up with my phone number (OTP) or email so that I can create an account | 8 | P0 |
| S2-03 | As a user, I want to log in with email/password or phone OTP so that I can access my account | 5 | P0 |
| S2-04 | As a user, I want to reset my password via email OTP so that I can recover my account | 3 | P0 |
| S2-05 | As a developer, I want route protection middleware based on auth + role so that unauthenticated users are redirected | 3 | P0 |
| S2-06 | As a user, I want role-based routing (owner → onboarding, employee → dashboard) after login | 3 | P0 |

### 3.2 Task Breakdown

| Task ID | Description | Estimate (hrs) |
|---------|-------------|:--------------:|
| S2-T01 | Build Navbar component with Logo, navigation links, Login/Get Started buttons | 4 |
| S2-T02 | Build HeroSection with headline, subtext, CTA buttons, social proof badges | 6 |
| S2-T03 | Build Features section with 4 feature cards (AI COO, Tasks, Org Health, Exec Chat) | 5 |
| S2-T04 | Build AIInsights preview section | 4 |
| S2-T05 | Build DashboardPreview section with mockup/screenshot | 3 |
| S2-T06 | Build Testimonials, FAQ, CTASection, Footer components | 6 |
| S2-T07 | Implement signup page (Step 1: Name & Phone → Step 2: OTP → Step 3: Email & Password → Step 4: Role) | 8 |
| S2-T08 | Implement login page (email/password tab + phone OTP tab) | 5 |
| S2-T09 | Implement forgot password flow (4-step: Send OTP → Verify → Reset → Done) | 4 |
| S2-T10 | Implement AuthContext with Firebase auth state listener | 4 |
| S2-T11 | Implement middleware.ts with route protection and role-based redirects | 3 |
| S2-T12 | Create ProtectedRoute wrapper component | 2 |
| S2-T13 | Set up Firebase client SDK in lib/firebase.ts | 2 |

### 3.3 Definition of Done

- [ ] Landing page fully responsive (mobile + desktop)
- [ ] Signup flow complete with OTP verification
- [ ] Login flow works (both email and phone)
- [ ] Forgot password flow complete
- [ ] Route protection: unauthenticated → redirect to login
- [ ] Role-based routing: owner → onboarding, employee → dashboard
- [ ] Auth state persists across browser refresh (30-day cookie)

---

## 4. Sprint 3: Owner Onboarding Part 1 (14 days)

**Goal:** Build steps 1-7 of the owner onboarding wizard — domain analysis through AI persona chat.

### 4.1 User Stories

| ID | Story | Points | Priority |
|----|-------|:------:|:--------:|
| S3-01 | As a new owner, I want the system to analyze my email domain so that company info is auto-detected | 5 | P0 |
| S3-02 | As a new owner, I want the system to scrape my website so that it understands my business | 5 | P0 |
| S3-03 | As a new owner, I want the system to determine my industry and micro-vertical automatically | 3 | P0 |
| S3-04 | As a new owner, I want to upload business documents so that the AI can learn from my files | 5 | P1 |
| S3-05 | As a new owner, I want the system to find my company's social media profiles automatically | 5 | P0 |
| S3-06 | As a new owner, I want to have an AI conversation that builds understanding of my business | 8 | P0 |
| S3-07 | As a developer, I want the LangGraph master agent to manage onboarding conversation state | 8 | P0 |

### 4.2 Task Breakdown

| Task ID | Description | Estimate (hrs) |
|---------|-------------|:--------------:|
| S3-T01 | Build Step 1 UI: Email analysis screen with domain detection and manual override | 5 |
| S3-T02 | Implement POST /api/v1/intelligence/analyze-domain with AI enrichment | 6 |
| S3-T03 | Implement POST /api/v1/scrape/url with BeautifulSoup + Firecrawl fallback | 6 |
| S3-T04 | Build Step 2-3 UI: Company details form + AI scan progress animation | 5 |
| S3-T05 | Implement POST /api/v1/intelligence/analyze-industry with taxonomy matching | 4 |
| S3-T06 | Build Step 4 UI: File upload with drag-drop, progress, type validation | 6 |
| S3-T07 | Implement file upload endpoint with processing pipeline (PDF/DOCX/XLSX/Image → text → chunks → embeddings → Qdrant) | 8 |
| S3-T08 | Build Step 5 UI: Industry selection dropdown with AI-suggested option | 3 |
| S3-T09 | Build Step 6 UI: Social detection results with verified/suggested/not-found | 5 |
| S3-T10 | Implement POST /api/v1/social/detect with multi-strategy social search | 6 |
| S3-T11 | Build Step 7 UI: AI persona chat interface with dynamic follow-ups | 8 |
| S3-T12 | Implement LangGraph master agent (analyze → question → update state graph) | 10 |
| S3-T13 | Implement POST /api/v1/agent/init, /chat, /state endpoints | 6 |
| S3-T14 | Implement MasterPromptEngine with persona builder template | 5 |

### 4.3 Definition of Done

- [ ] Owner can complete steps 1-7 of onboarding
- [ ] Domain analysis returns accurate company info with AI enrichment
- [ ] Website scraping works with fallback
- [ ] File upload processes 4 file types (PDF, DOCX, XLSX, images)
- [ ] Social detection finds LinkedIn, Twitter minimum
- [ ] AI persona chat completes minimum 8 question topics with follow-ups
- [ ] Master Agent state persists across conversation turns

---

## 5. Sprint 4: Owner Onboarding Part 2 & Employee Onboarding (14 days)

**Goal:** Complete owner onboarding (goals, tasks, welcome) and build employee self-onboarding flow.

### 5.1 User Stories

| ID | Story | Points | Priority |
|----|-------|:------:|:--------:|
| S4-01 | As an owner, I want AI to suggest strategic goals based on our conversation so that I don't start from scratch | 5 | P0 |
| S4-02 | As an owner, I want to select strategies and auto-generate tasks so that goals become actionable | 5 | P0 |
| S4-03 | As an owner, I want a welcome screen with summary so that I know what was set up | 2 | P0 |
| S4-04 | As a new employee, I want to join my organization via email domain detection so that onboarding is seamless | 5 | P0 |
| S4-05 | As a new employee, I want to select my department and manager so that I'm placed in the org structure | 3 | P0 |
| S4-06 | As a new employee, I want a quick AI persona chat so that my workspace is personalized | 3 | P0 |

### 5.2 Task Breakdown

| Task ID | Description | Estimate (hrs) |
|---------|-------------|:--------------:|
| S4-T01 | Build Step 8 UI: Goal suggestions display with Accept/Edit/Reject per goal | 6 |
| S4-T02 | Implement GET /api/v1/goals/suggest with AI generation based on persona data | 5 |
| S4-T03 | Build Step 8b UI: Strategy selection per goal | 4 |
| S4-T04 | Implement POST /api/v1/goals/{id}/generate-strategies | 5 |
| S4-T05 | Build Step 9 UI: Task review list with per-task Edit/Remove | 5 |
| S4-T06 | Implement POST /api/v1/goals/{id}/generate-tasks | 6 |
| S4-T07 | Build Step 10 UI: Welcome screen with summary cards + confetti | 3 |
| S4-T08 | Implement organization create/update with onboardingComplete flag | 2 |
| S4-T09 | Build employee Step 1 UI: Email detection with org auto-assign | 4 |
| S4-T10 | Build employee Step 2 UI: Department and manager selection | 4 |
| S4-T11 | Implement POST /api/v1/employees create endpoint | 3 |
| S4-T12 | Build employee Step 3 UI: Simplified persona chat (4 topics) | 5 |
| S4-T13 | Implement POST /api/v1/chatbot/employee-persona | 3 |
| S4-T14 | Build employee Step 4 UI: Welcome screen with personalized summary | 2 |

### 5.3 Definition of Done

- [ ] Owner completes full 10-step onboarding → redirected to dashboard
- [ ] AI suggests 3-5 goals with valid rationale
- [ ] AI generates 2-3 strategies per goal
- [ ] AI generates 3-7 tasks per strategy
- [ ] Employee completes 4-step onboarding → redirected to dashboard
- [ ] Employee's org auto-detected from email domain
- [ ] Employee department and manager saved correctly

---

## 6. Sprint 5: Goal & Task Management (14 days)

**Goal:** Build full goal CRUD with AI features and complete task management system.

### 6.1 User Stories

| ID | Story | Points | Priority |
|----|-------|:------:|:--------:|
| S5-01 | As a user, I want full CRUD operations on goals so that I can manage my business objectives | 5 | P0 |
| S5-02 | As a user, I want to chat with AI about a specific goal so that I can refine it | 5 | P1 |
| S5-03 | As a user, I want full CRUD operations on tasks so that I can manage work items | 5 | P0 |
| S5-04 | As a user, I want to add comments to tasks so that I can discuss work | 3 | P1 |
| S5-05 | As a manager, I want task approval workflow so that quality is maintained | 3 | P1 |
| S5-06 | As a user, I want to see task dependencies so that I know what blocks what | 3 | P1 |

### 6.2 Task Breakdown

| Task ID | Description | Estimate (hrs) |
|---------|-------------|:--------------:|
| S5-T01 | Implement goal CRUD endpoints (GET/POST/PUT/DELETE /api/v1/goals) | 5 |
| S5-T02 | Build goal list view with filtering by department/status | 5 |
| S5-T03 | Build goal creation/edit modal | 5 |
| S5-T04 | Build goal detail page with strategies, tasks, chat | 6 |
| S5-T05 | Implement goal refinement chat endpoint | 4 |
| S5-T06 | Implement task CRUD endpoints (GET/POST/PUT/DELETE /api/v1/tasks) | 6 |
| S5-T07 | Build task list view with filters (status, priority, assignee, search) | 6 |
| S5-T08 | Build task creation/edit modal with all fields | 5 |
| S5-T09 | Build task detail view with comments, activity log | 5 |
| S5-T10 | Implement task comments endpoint | 3 |
| S5-T11 | Implement task approval workflow endpoint | 3 |
| S5-T12 | Implement task dependencies in task schema and UI | 4 |
| S5-T13 | Implement real-time task updates via WebSocket (task:created, task:updated) | 4 |

### 6.3 Definition of Done

- [ ] Goals can be created, read, updated, deleted
- [ ] AI suggests goals from any screen (not just onboarding)
- [ ] Goal chat works with full context
- [ ] Tasks can be created (manually and AI-generated), read, updated, deleted
- [ ] Task comments work
- [ ] Task approval workflow works (mark pending → approve → done)
- [ ] Task dependencies block status changes
- [ ] WebSocket pushes task updates in real-time

---

## 7. Sprint 6: Task Pipeline & Owner Dashboard (14 days)

**Goal:** Build Kanban-style task board and fully functional owner dashboard with KPIs and AI insights.

### 7.1 User Stories

| ID | Story | Points | Priority |
|----|-------|:------:|:--------:|
| S6-01 | As a user, I want a Kanban board view of tasks so that I can drag-and-drop status updates | 8 | P0 |
| S6-02 | As an owner, I want a dashboard with KPI cards so that I see business metrics at a glance | 5 | P0 |
| S6-03 | As an owner, I want to see AI-generated insights and recommendations | 5 | P0 |
| S6-04 | As an owner, I want role-specific dashboard modules (Founder, Finance, Ops, Productivity, Workflow) | 5 | P0 |
| S6-05 | As an owner, I want to see the organization health score | 3 | P0 |

### 7.2 Task Breakdown

| Task ID | Description | Estimate (hrs) |
|---------|-------------|:--------------:|
| S6-T01 | Build Kanban board component with 5 columns (Todo, In Progress, Review, Done, Blocked) | 8 |
| S6-T02 | Implement drag-and-drop status updates with WebSocket broadcast | 6 |
| S6-T03 | Build task card component with priority color, assignee avatar, deadline badge | 4 |
| S6-T04 | Implement list/board view toggle | 2 |
| S6-T05 | Implement dashboard insights endpoint (GET /api/v1/dashboard/insights) with real KPI data | 8 |
| S6-T06 | Build KPI card components (active goals, completion rate, team size, tasks pipeline) | 4 |
| S6-T07 | Build AI insight cards with type-based styling (achievement, alert, suggestion) | 5 |
| S6-T08 | Build 5 dashboard modules with per-module score + insights | 8 |
| S6-T09 | Build org health gauge component | 3 |
| S6-T10 | Build AI Summary chat at bottom of dashboard | 4 |

### 7.3 Definition of Done

- [ ] Kanban board renders tasks in correct columns
- [ ] Drag-and-drop changes task status with WebSocket update
- [ ] All 5 KPI cards show real data (not mock)
- [ ] AI insights refresh on page load
- [ ] 5 dashboard modules show data specific to org's industry
- [ ] Org health score calculated and displayed

---

## 8. Sprint 7: Executive AI Chat (14 days)

**Goal:** Build the multi-expert executive chat with 6 parallel AI agents and response synthesis.

### 8.1 User Stories

| ID | Story | Points | Priority |
|----|-------|:------:|:--------:|
| S7-01 | As an owner, I want to ask business questions and get answers from relevant AI experts | 8 | P0 |
| S7-02 | As an owner, I want all 6 experts to respond in parallel so that I get comprehensive answers fast | 8 | P0 |
| S7-03 | As an owner, I want responses synthesized into a single coherent answer | 5 | P0 |
| S7-04 | As an owner, I want action items extracted from conversations so that I can act on them | 3 | P1 |
| S7-05 | As an owner, I want conversation history so that I can refer back | 3 | P1 |

### 8.2 Task Breakdown

| Task ID | Description | Estimate (hrs) |
|---------|-------------|:--------------:|
| S7-T01 | Implement 6 expert agent classes (Finance, Operations, Strategy, HR, Sales, Product) | 10 |
| S7-T02 | Implement expert agent prompt templates in MasterPromptEngine | 6 |
| S7-T03 | Implement parallel agent execution via LangGraph Send() API | 8 |
| S7-T04 | Implement response synthesis logic (collect all → context → AI summarize) | 6 |
| S7-T05 | Implement executive chat endpoint (POST /api/v1/executive-chat/) | 6 |
| S7-T06 | Build chat UI with expert sidebar, quick question chips, synthesizing animation | 8 |
| S7-T07 | Build AI response rendering with per-expert breakdown (collapsible) | 5 |
| S7-T08 | Build action items extraction and display with "Add as Task" button | 5 |
| S7-T09 | Implement conversation history storage in MongoDB + Qdrant | 4 |
| S7-T10 | Build conversation history sidebar | 3 |
| S7-T11 | Implement follow-up question context handling | 4 |

### 8.3 Definition of Done

- [ ] All 6 expert agents respond to queries
- [ ] Agents run in parallel → response time <3s total
- [ ] Synthesis merges all responses into coherent answer
- [ ] Action items extracted and displayed
- [ ] Click "Add as Task" creates task from action item
- [ ] Follow-up questions maintain context
- [ ] Conversation history persists and is retrievable

---

## 9. Sprint 8: AI Assistant & Employee Dashboard (14 days)

**Goal:** Build the employee-facing AI assistant with intent classification and the employee dashboard.

### 9.1 User Stories

| ID | Story | Points | Priority |
|----|-------|:------:|:--------:|
| S8-01 | As an employee, I want an AI assistant that can understand my intent (chat, create task, delegate) | 8 | P0 |
| S8-02 | As an employee, I want the AI to ask clarifying questions before acting | 5 | P0 |
| S8-03 | As an employee, I want a personalized dashboard showing my tasks, reviews, and team updates | 5 | P0 |
| S8-04 | As an employee, I want AI productivity insights tailored to my work patterns | 3 | P1 |

### 9.2 Task Breakdown

| Task ID | Description | Estimate (hrs) |
|---------|-------------|:--------------:|
| S8-T01 | Implement intent classification endpoint (chat vs action vs delegate) | 6 |
| S8-T02 | Implement counter-question generation for ambiguous requests | 5 |
| S8-T03 | Implement action execution (create task from assistant, assign, set deadline) | 6 |
| S8-T04 | Implement delegation flow ("Tell John to review proposal") | 5 |
| S8-T05 | Build assistant chat UI with confirmation cards | 6 |
| S8-T06 | Build employee dashboard with task list, pending reviews, team updates | 6 |
| S8-T07 | Implement team updates feed (from activity log) | 3 |
| S8-T08 | Implement AI productivity insights for employees | 4 |
| S8-T09 | Implement quick actions on employee dashboard | 3 |

### 9.3 Definition of Done

- [ ] Employee can type "Create a task to..." → AI creates task with confirmation
- [ ] Employee can type "Tell John to..." → AI creates delegated task
- [ ] AI asks clarifying questions when intent is ambiguous
- [ ] Employee dashboard shows real tasks, reviews, updates
- [ ] AI insights are personalized to employee's work patterns

---

## 10. Sprint 9: Reports & Org Health (14 days)

**Goal:** Build employee performance reports and organization health scoring with PDF export.

### 10.1 User Stories

| ID | Story | Points | Priority |
|----|-------|:------:|:--------:|
| S9-01 | As a manager, I want AI-generated employee performance reports so that reviews are data-driven | 5 | P1 |
| S9-02 | As a manager, I want to download reports as PDF so that I can share them | 3 | P1 |
| S9-03 | As an owner, I want organization health score with breakdown so that I know where to focus | 5 | P0 |
| S9-04 | As an owner, I want AI recommendations for improving org health | 3 | P1 |

### 10.2 Task Breakdown

| Task ID | Description | Estimate (hrs) |
|---------|-------------|:--------------:|
| S9-T01 | Implement employee report generation with task data aggregation | 6 |
| S9-T02 | Implement AI analysis for strengths, improvements, recommendations | 5 |
| S9-T03 | Implement PDF report generation with ReportLab | 5 |
| S9-T04 | Build employee reports UI with employee selector and period picker | 5 |
| S9-T05 | Implement org health scoring engine (5 weighted dimensions) | 6 |
| S9-T06 | Build org health UI with gauge chart and dimension breakdown | 4 |
| S9-T07 | Build report summary tab | 3 |

### 10.3 Definition of Done

- [ ] Employee report generates with real task data
- [ ] AI analysis includes strengths, improvements, recommendations
- [ ] PDF download works
- [ ] Org health score is calculated from real org data
- [ ] 5 dimensions shown with individual scores and weights
- [ ] Trend comparison (month-over-month) when history exists

---

## 11. Sprint 10: Market Intelligence & Learning (14 days)

**Goal:** Build market trends analysis and continuous learning engine.

### 11.1 User Stories

| ID | Story | Points | Priority |
|----|-------|:------:|:--------:|
| S10-01 | As an owner, I want AI-generated news about my industry so that I stay informed | 5 | P1 |
| S10-02 | As an owner, I want market impact analysis relevant to my business | 5 | P1 |
| S10-03 | As an owner, I want investment recommendations with ROI estimates | 4 | P1 |
| S10-04 | As a developer, I want the continuous learning engine to record patterns so that AI improves | 5 | P1 |

### 11.2 Task Breakdown

| Task ID | Description | Estimate (hrs) |
|---------|-------------|:--------------:|
| S10-T01 | Implement market news endpoint with AI-generated industry news | 5 |
| S10-T02 | Implement market impact analysis (cross-reference news with org data) | 5 |
| S10-T03 | Implement investment recommendations with ROI/timeline/risk | 4 |
| S10-T04 | Build market trends UI with news cards, impact analysis, recommendations | 6 |
| S10-T05 | Implement learning pattern recording (workflows, task outcomes, bottlenecks) | 6 |
| S10-T06 | Implement bottleneck detection from task/employee data | 4 |
| S10-T07 | Build learning analytics display (optional — for admin) | 3 |

### 11.3 Definition of Done

- [ ] Market news shows relevant industry articles
- [ ] Impact analysis references org's specific data
- [ ] Investment recommendations are actionable with ROI estimates
- [ ] Learning patterns are recorded in MongoDB
- [ ] Bottlenecks detected from overdue tasks, blocked tasks

---

## 12. Sprint 11: Zoho Integration (14 days)

**Goal:** Connect YesBoss with Zoho ecosystem — OAuth, calendar, tasks.

### 12.1 User Stories

| ID | Story | Points | Priority |
|----|-------|:------:|:--------:|
| S11-01 | As an owner, I want to connect my Zoho account via OAuth so that I can sync data | 5 | P1 |
| S11-02 | As an owner, I want to check Zoho calendar availability so that I can schedule meetings | 5 | P1 |
| S11-03 | As an owner, I want to book meetings in Zoho calendar from YesBoss | 5 | P1 |
| S11-04 | As an owner, I want to sync tasks between YesBoss and Zoho | 5 | P2 |

### 12.2 Task Breakdown

| Task ID | Description | Estimate (hrs) |
|---------|-------------|:--------------:|
| S11-T01 | Implement Zoho OAuth flow (redirect, callback, token storage, refresh) | 6 |
| S11-T02 | Implement Zoho calendar check availability endpoint | 5 |
| S11-T03 | Implement Zoho calendar book meeting endpoint | 5 |
| S11-T04 | Implement Zoho task sync (bidirectional) | 6 |
| S11-T05 | Build Zoho connect button and status display | 3 |
| S11-T06 | Build calendar booking UI with slot selector | 5 |
| S11-T07 | Build settings page with Zoho integration section | 3 |

### 12.3 Definition of Done

- [ ] Zoho OAuth flow completes with token refresh
- [ ] Calendar availability returns real slots from Zoho
- [ ] Meeting booked in Zoho calendar
- [ ] Tasks sync between YesBoss and Zoho
- [ ] Connection status displayed in settings
- [ ] Disconnect works (clears tokens)

---

## 13. Sprint 12: Notifications & Real-time (14 days)

**Goal:** Build comprehensive notification system — in-app, email, browser push — with user preferences.

### 13.1 User Stories

| ID | Story | Points | Priority |
|----|-------|:------:|:--------:|
| S12-01 | As a user, I want in-app notifications for task updates so that I stay informed | 5 | P0 |
| S12-02 | As a user, I want email notifications for important events so that I don't miss anything | 5 | P1 |
| S12-03 | As a user, I want browser push notifications so that I receive updates even when tab is inactive | 5 | P1 |
| S12-04 | As a user, I want to configure which notifications I receive | 3 | P1 |
| S12-05 | As a developer, I want the background scheduler to handle escalations and reminders | 5 | P0 |

### 12.2 Task Breakdown

| Task ID | Description | Estimate (hrs) |
|---------|-------------|:--------------:|
| S12-T01 | Implement notification creation service (in-app) | 4 |
| S12-T02 | Implement notification CRUD endpoints | 3 |
| S12-T03 | Build notification bell component with unread badge | 3 |
| S12-T04 | Build notification dropdown (recent 5) | 3 |
| S12-T05 | Build notifications page with filters and mark-all-read | 4 |
| S12-T06 | Implement email notification service (SMTP) | 5 |
| S12-T07 | Implement browser push service (Web Push API with VAPID) | 5 |
| S12-T08 | Build notification preferences page | 3 |
| S12-T09 | Implement background scheduler (5-min loop: reminders, escalations) | 6 |
| S12-T10 | Implement toast notification component | 2 |

### 12.3 Definition of Done

- [ ] In-app notifications for all event types
- [ ] Email sent for critical notifications (task overdue, escalation)
- [ ] Browser push works when tab is inactive
- [ ] User can toggle notification types per channel
- [ ] Scheduler sends deadline reminders 1 day before
- [ ] Escalation at 3 days (manager) and 7 days (owner)

---

## 14. Sprint 13: Testing & QA (14 days)

**Goal:** Comprehensive testing — unit, integration, E2E, AI quality evaluation.

### 14.1 User Stories

| ID | Story | Points | Priority |
|----|-------|:------:|:--------:|
| S13-01 | As a developer, I want unit tests for critical backend logic so that regressions are caught | 8 | P1 |
| S13-02 | As a developer, I want integration tests for API endpoints so that contracts are validated | 8 | P1 |
| S13-03 | As a developer, I want E2E tests for critical user flows so that the product works end-to-end | 8 | P1 |
| S13-04 | As a PM, I want AI response quality evaluated so that users get good answers | 5 | P1 |
| S13-05 | As a developer, I want performance benchmarks so that we meet SLAs | 3 | P2 |

### 14.2 Task Breakdown

| Task ID | Description | Estimate (hrs) |
|---------|-------------|:--------------:|
| S13-T01 | Write unit tests for AIClient (mock providers, test fallback) | 5 |
| S13-T02 | Write unit tests for PromptEngine (all personas) | 4 |
| S13-T03 | Write unit tests for Master Agent (state transitions) | 5 |
| S13-T04 | Write unit tests for Expert Agents (all 6) | 6 |
| S13-T05 | Write unit tests for scheduler logic | 4 |
| S13-T06 | Write API integration tests (pytest + httpx) for all endpoints | 10 |
| S13-T07 | Write E2E tests (Playwright) for owner onboarding flow | 8 |
| S13-T08 | Write E2E tests for employee onboarding flow | 5 |
| S13-T09 | Write E2E tests for goal → strategy → task pipeline | 6 |
| S13-T10 | Write E2E tests for executive chat flow | 5 |
| S13-T11 | Run AI response quality evaluation with sample query set | 5 |
| S13-T12 | Performance testing with k6/locust (100 concurrent users) | 4 |
| S13-T13 | Bug fixes from testing | 8 |

### 14.3 Definition of Done

- [ ] Backend unit tests pass (coverage >60%)
- [ ] API integration tests pass (all 30+ endpoints)
- [ ] E2E tests pass for 4 critical flows
- [ ] AI quality score >80% satisfactory
- [ ] Performance: API <500ms (P95 non-AI), page load <2s

---

## 15. Sprint 14: Deployment & Launch (14 days)

**Goal:** Production deployment, monitoring setup, security hardening, launch readiness.

### 15.1 User Stories

| ID | Story | Points | Priority |
|----|-------|:------:|:--------:|
| S14-01 | As a developer, I want production deployment on Vercel + Railway so that the app is live | 5 | P0 |
| S14-02 | As a developer, I want monitoring and alerting so that we know when things break | 4 | P0 |
| S14-03 | As a developer, I want CI/CD pipeline so that deployments are automated | 3 | P0 |
| S14-04 | As a security officer, I want security hardening so that user data is protected | 5 | P0 |
| S14-05 | As a PM, I want launch documentation so that users can get started | 3 | P1 |

### 15.2 Task Breakdown

| Task ID | Description | Estimate (hrs) |
|---------|-------------|:--------------:|
| S14-T01 | Configure Vercel production deployment for frontend | 3 |
| S14-T02 | Configure Railway/Render production deployment for backend | 4 |
| S14-T03 | Set up custom domain (app.yesboss.ai) with SSL | 2 |
| S14-T04 | Set up MongoDB Atlas production cluster (M10+) | 2 |
| S14-T05 | Configure Sentry for error tracking | 3 |
| S14-T06 | Configure BetterUptime or equivalent for monitoring | 2 |
| S14-T07 | Set up GitHub Actions CI/CD pipeline | 4 |
| S14-T08 | Security audit: API keys, environment variables, CORS, rate limiting | 4 |
| S14-T09 | Database backup strategy (automated snapshots) | 2 |
| S14-T10 | Write deployment runbook | 3 |
| S14-T11 | Write user onboarding guide / FAQ | 4 |
| S14-T12 | Final launch checklist review | 2 |
| S14-T13 | Launch! 🚀 | 1 |

### 15.3 Definition of Done

- [ ] app.yesboss.ai is live with SSL
- [ ] API at api.yesboss.ai responds to health check
- [ ] Sentry captures errors with source maps
- [ ] Uptime monitoring active
- [ ] CI/CD pipeline: push to main → auto-deploy
- [ ] Security headers verified
- [ ] Database backups configured (daily)
- [ ] Deployment runbook documented
- [ ] User guide published

---

## 16. Backlog (Future Sprints)

| ID | Story | Points | Priority | Target Sprint |
|----|-------|:------:|:--------:|:-------------:|
| B-01 | As a user, I want to invite team members via email so that they can join my organization | 3 | P1 | Sprint 15 |
| B-02 | As a user, I want file search with Qdrant so that I can find relevant documents | 5 | P1 | Sprint 15 |
| B-03 | As an owner, I want industry-specific document templates so that I don't start from scratch | 5 | P2 | Sprint 16 |
| B-04 | As a user, I want dark mode toggle that persists across sessions | 2 | P1 | Sprint 15 |
| B-05 | As a developer, I want Redis caching so that API performance improves | 5 | P2 | Sprint 16 |
| B-06 | As a user, I want mobile-responsive bottom navigation so that the app works on phones | 3 | P1 | Sprint 15 |
| B-07 | As a developer, I want to implement audio transcription (Whisper/Groq) for meeting notes | 5 | P2 | Sprint 17 |
| B-08 | As an owner, I want Slack integration so that notifications work where I already work | 5 | P2 | Sprint 17 |
| B-09 | As a developer, I want to implement real AI training (LoRA) from learning patterns | 8 | P3 | Sprint 20+ |
| B-10 | As a user, I want native mobile apps (iOS/Android) so that I can use YesBoss on the go | 13 | P3 | Sprint 20+ |

---

## 17. Sprint Velocity & Tracking

### 17.1 Velocity Assumptions

| Metric | Value |
|--------|-------|
| Sprint duration | 14 days (10 working days) |
| Team size | 3 developers |
| Available hours per dev | 40 hours/sprint (after meetings, ceremonies) |
| Total capacity | 120 hours/sprint |
| Average point velocity | 30-35 points/sprint |
| Buffer (bugs, unplanned) | 15% |

### 17.2 Ceremony Schedule

| Ceremony | Day | Duration |
|----------|:---:|:--------:|
| Sprint Planning | Day 1 | 2 hours |
| Daily Standup | Daily | 15 minutes |
| Sprint Review | Day 10 | 1 hour |
| Sprint Retrospective | Day 10 | 1 hour |
| Backlog Refinement | Day 5 | 1 hour |

### 17.3 Tracking Tools

| Item | Tool |
|------|------|
| Sprint board | GitHub Projects / Linear |
| Backlog | GitHub Issues |
| Documentation | GitHub Wiki / Notion |
| Communication | Slack / Discord |
| Code reviews | GitHub Pull Requests |

---

## 18. Risk Register for Sprint Execution

| Risk | Likelihood | Impact | Mitigation |
|------|:----------:|:------:|------------|
| AI API provider outage during development | Medium | High | Multi-provider fallback from Sprint 1; local Ollama for basic testing |
| Scope creep on onboarding wizard | High | Medium | Strictly enforce Step 1-10 scope; defer polish features to backlog |
| Team member absence | Medium | Medium | Cross-train on critical components; document decisions |
| MongoDB performance with 22 collections | Low | Medium | Index strategy from Sprint 1; monitor query times |
| Zoho API breaking changes | Low | High | Version-lock API calls; monitor Zoho changelog |
| Third-party scraping blocked | Medium | Medium | Multiple detection strategies; manual input fallback |
| Frontend build failures on Next.js 16 | Medium | Medium | Lock Next.js version; test builds frequently |
| AI response quality below threshold | Medium | High | Continuous evaluation during Sprints 5-10; prompt iteration |

---

## 19. Dependencies Between Sprints

```
Sprint 1 ─► Sprint 2 ─► Sprint 3 ─► Sprint 4 ─► Sprint 5 ─► Sprint 6
  │            │            │            │            │
  │            │            │            │            └──────────┐
  │            │            │            │                       │
  │            │            │            ▼                       ▼
  │            │            │         Sprint 7 ─► Sprint 8    Sprint 9
  │            │            │            │
  │            │            │            ▼
  │            │            └─────► Sprint 10
  │            │
  │            ▼
  │         Sprint 11 ◄───────────────────── (needs auth from Sprint 1)
  │
  ▼
Sprint 12 ◄───── (needs task/goal from Sprint 5-6)

Sprint 13 ◄───── (needs everything)
  │
  ▼
Sprint 14 ◄───── (needs Sprint 13)
```

---

## 20. Story Point Estimation Methodology

### 20.1 Point Scale

| Points | Effort | Complexity | Risk | Example |
|:------:|--------|:----------:|:----:|---------|
| **1** | <2 hours | Trivial | None | Config change, env variable, UI text |
| **2** | 2-4 hours | Low | Low | Simple component, single endpoint |
| **3** | 4-8 hours | Medium | Low | CRUD endpoint + basic UI |
| **5** | 8-16 hours | Medium | Medium | Feature with AI integration, multiple components |
| **8** | 16-32 hours | High | Medium | Complex feature, multiple endpoints + UI + states |
| **13** | 32-60 hours | High | High | Major feature, new system, integration risk |

### 20.2 Estimation Process

1. **Sprint Planning**: Team estimates together using Planning Poker
2. **Baseline**: First 2 sprits establish team velocity (observed: ~30-35 pts/sprint)
3. **Re-estimation**: Any task taking >60 hours is split into smaller tasks
4. **Buffer**: 15% of sprint capacity reserved for unplanned work (bugs, hotfixes)
5. **Velocity Tracking**: Running average of last 3 sprits for capacity planning

### 20.3 Velocity Tracking

| Sprint | Planned Points | Completed Points | Velocity | Notes |
|:------:|:--------------:|:----------------:|:--------:|-------|
| Sprint 1 | 35 | 35 | 35 pts | Foundation, all tasks done |
| Sprint 2 | 30 | 28 | 28 pts | Landing page polish deferred |
| Sprint 3 | 40 | 35 | 35 pts | AI persona chat took longer |
| Sprint 4 | 35 | 30 | 30 pts | Employee onboarding needed rework |
| Sprint 5 | 38 | 35 | 35 pts | Task CRUD completed |
| Sprint 6 | 35 | 32 | 32 pts | Kanban drag-drop complex |
| Sprint 7 | 40 | 35 | 35 pts | Expert agents parallel execution |
| Sprint 8 | 32 | 30 | 30 pts | Employee dashboard |
| Sprint 9 | 30 | 30 | 30 pts | Reports on track |
| Sprint 10 | 28 | 25 | 25 pts | Learning engine prototype |
| Sprint 11 | 25 | 25 | 25 pts | Zoho OAuth done |
| Sprint 12 | 25 | 22 | 22 pts | Push notifications deferred |
| Sprint 13 | 30 | — | — | Testing in progress |
| Sprint 14 | 20 | — | — | Deployment |

**Average Velocity (Sprints 1-12):** ~30 pts/sprint

---

## 21. Team Composition & Roles

### 21.1 Team Structure

| Role | Count | Responsibilities | Key Skills |
|------|:-----:|-----------------|------------|
| **Product Manager** | 1 | Backlog prioritization, stakeholder communication, requirements | Domain knowledge, agile |
| **Frontend Developer** | 1 | Next.js, React, TailwindCSS, Zustand, Radix UI | TypeScript, React, UI/UX |
| **Backend Developer** | 1 | FastAPI, MongoDB, Qdrant, AI integration, auth | Python, databases, AI/ML |
| **Full-Stack Developer** | 1 | Spans both FE + BE, deep on AI features | Python + TypeScript, LangGraph |
| **Designer (part-time)** | 0.5 | UI/UX design, design system maintenance | Figma, TailwindCSS, a11y |
| **QA (Sprint 13)** | 1 | Testing, E2E, performance | Playwright, pytest, k6 |

### 21.2 Skills Matrix

| Developer | Python | TypeScript | React | FastAPI | Mongo | Qdrant | LangGraph | AI/LLM |
|-----------|:------:|:----------:|:-----:|:-------:|:-----:|:------:|:---------:|:------:|
| Dev 1 (BE lead) | Expert | Intermediate | Basic | Expert | Expert | Expert | Expert | Expert |
| Dev 2 (FE lead) | Basic | Expert | Expert | Basic | Basic | None | None | Basic |
| Dev 3 (Full-stack) | Advanced | Advanced | Intermediate | Advanced | Advanced | Intermediate | Intermediate | Advanced |

### 21.3 Communication Plan

| Channel | Purpose | Frequency | Participants |
|---------|---------|:---------:|-------------|
| Daily Standup | Progress, blockers, next steps | Daily (15min) | All team |
| Sprint Planning | Sprint goal, story assignment | Day 1 of sprint (2hr) | All team |
| Sprint Review | Demo completed work | Last day of sprint (1hr) | All + stakeholders |
| Sprint Retro | Process improvement | Last day of sprint (1hr) | All team |
| Backlog Refinement | Story preparation, estimation | Mid-sprint (1hr) | PM + Dev leads |
| Slack / Discord | Async communication, decisions | Daily | All team |
| GitHub PRs | Code review | Per PR | At least 1 reviewer |

---

## 22. QA Strategy

### 22.1 Testing Pyramid

```
         ╱  ╲
        ╱ E2E ╲
       ╱  (10%)  ╲
      ╱─────────────╲
     ╱ Integration    ╲
    ╱    Tests        ╲
   ╱    (30%)          ╲
  ╱──────────────────────╲
 ╱    Unit Tests           ╲
╱       (60%)               ╲
╱────────────────────────────╲
```

### 22.2 Test Categories

**Unit Tests (60% of test effort):**
| Scope | Tool | Coverage Target | Key Files |
|-------|------|:---------------:|-----------|
| Backend logic | `pytest` | 70%+ line coverage | `backend/app/core/ai_client.py`, `prompt_engine.py`, `master_agent.py`, `scheduler.py` |
| Frontend utils | `vitest` / `jest` | 60%+ | `frontend/src/lib/utils.ts`, `stores/` (store logic) |
| Pydantic schemas | `pytest` | 100% validation rules | `backend/app/schemas/` |

**Integration Tests (30% of test effort):**
| Scope | Tool | Approach | Key Files |
|-------|------|----------|-----------|
| API endpoints | `pytest` + `httpx` | Test all 30+ endpoints with mocked auth | `backend/app/api/*.py` — one test file per route module |
| Database | `pytest` + Motor test client | CRUD operations on all collections | `backend/app/core/database.py` |
| AI client | `pytest` + mock responses | Provider fallback, timeout, circuit breaker | `backend/app/core/ai_client.py` |
| WebSocket | `pytest` + WebSocket test client | Connection, auth, events | `backend/app/api/websocket.py` |

**E2E Tests (10% of test effort):**
| Scope | Tool | Flows |
|-------|------|-------|
| Owner onboarding | Playwright | Full 10-step wizard (not headless for AI steps) |
| Employee onboarding | Playwright | 4-step flow + dashboard redirect |
| Goal → Strategy → Task | Playwright | Create goal, generate strategies, select, generate tasks |
| Executive Chat | Playwright | Send message, receive AI response, view action items |
| Login/Auth | Playwright | Login, signup, forgot password, logout |
| Task Pipeline | Playwright | Create, edit, status change, Kanban drag-drop |

### 22.3 AI Quality Evaluation

| Criterion | Evaluation Method | Target Score |
|-----------|------------------|:------------:|
| Response Relevance | Human rating (1-5) per response | >4.0 |
| Hallucination Rate | Fact-check against known org data | <5% |
| Action Item Accuracy | Match extracted items vs expected | >80% |
| Response Time | Measured end-to-end | <5s P95 |
| Conversation Flow | Follow-up context maintained | >90% |
| Expert Agent Quality | Per-agent accuracy rating | >3.5 each |

**Evaluation Dataset:** 50 sample queries per agent type (300 total), run before Sprint 13.

### 22.4 Performance Test Plan

| Scenario | Tool | Target | Success Criteria |
|----------|------|--------|-----------------|
| 100 concurrent users, mixed API calls | k6 / locust | P95 <500ms (non-AI) | All responses within target |
| 20 concurrent AI chat requests | k6 / locust | P95 <5s | No provider timeouts |
| File upload, 10 concurrent 5MB files | k6 / locust | P95 <10s | All files processed |
| WebSocket, 50 concurrent connections | Custom script | All receive events | <100ms delivery |
| Dashboard load, 50 concurrent | k6 | P95 <1s | All queries indexed |

---

## 23. Release Criteria & Definition of Done

### 23.1 Sprint-Level Definition of Done

- [ ] All user stories in sprint meet acceptance criteria
- [ ] All tasks in sprint are complete (status: Done)
- [ ] No P0 or P1 bugs open
- [ ] All new code has:
  - [ ] Unit tests (critical paths)
  - [ ] TypeScript/Python type annotations
  - [ ] Lint passed (ESLint, ruff)
- [ ] PRs merged to main branch
- [ ] Feature works in staging environment
- [ ] Documentation updated (if applicable)

### 23.2 Release (v1.0) Go/No-Go Criteria

**Must-pass:**
- [ ] Owner onboarding: 10-step flow complete without errors
- [ ] Employee onboarding: 4-step flow complete
- [ ] Goal CRUD + AI strategy/task generation works
- [ ] Task CRUD + Kanban board + status transitions
- [ ] Executive Chat: 6 expert agents respond in <5s
- [ ] Employee AI Assistant: intent classification + action execution
- [ ] Dashboard: KPI cards show real data, not mock
- [ ] Reports: Employee report generates with PDF download
- [ ] Org Health: Score calculated from real data
- [ ] Notifications: In-app + email + browser push
- [ ] Auth: Signup, login (email + phone OTP), forgot password
- [ ] Zoho: OAuth connection, calendar booking
- [ ] Security: All headers present, rate limiting active
- [ ] Performance: P95 <500ms (non-AI), <5s (AI)
- [ ] Tests: Unit (70%+ coverage), Integration (all passing), E2E (critical flows)
- [ ] Deployment: Auto-deploy CI/CD active, Sentry monitoring live

**Should-pass:**
- [ ] Market trends: News + impact analysis
- [ ] Org Chart: Tree visualization
- [ ] Learning engine: Bottleneck detection
- [ ] File search: Semantic search via Qdrant
- [ ] Dark mode: Working across all pages
- [ ] Mobile responsive: Dashboard + tasks

### 23.3 Post-Launch Support

| Phase | Duration | Focus |
|-------|:--------:|-------|
| **Hypercare** | 1 week after launch | Critical bug fixes, monitoring, performance tuning |
| **Stabilization** | 2 weeks after launch | Bug fixes, minor improvements, user feedback |
| **Normal operations** | After 3 weeks | Regular sprint cadence for backlog items |

---

## 24. Code Quality Standards

### 24.1 Backend (Python)

| Standard | Tool | Configuration |
|----------|------|---------------|
| Linting | ruff | `select = ["E", "F", "I", "N", "W"]` |
| Formatting | ruff format | Line length: 100 |
| Type checking | mypy (optional) | `strict = true` |
| Import sorting | isort via ruff | `force-single-line = false` |
| Security | bandit (optional) | Default rules |

### 24.2 Frontend (TypeScript/React)

| Standard | Tool | Configuration |
|----------|------|---------------|
| Linting | ESLint | `frontend/eslint.config.mjs` |
| Formatting | Prettier (optional) | `semi: true, singleQuote: true` |
| Type checking | TypeScript | `strict: true` in `tsconfig.json` |
| Component lint | eslint-plugin-react | Recommended rules |

### 24.3 Commit Convention

```
type(scope): description

Types: feat | fix | chore | docs | style | refactor | test
Scope: api | ui | agents | db | chat | goals | tasks | onboarding | auth | deploy | docs
```

Example: `feat(goals): add AI strategy generation endpoint`

---

## 25. Risk Register (Enhanced)

| Risk | Likelihood | Impact | Mitigation | Owner | Trigger |
|------|:----------:|:------:|------------|:-----:|---------|
| AI API provider outage during development | Medium | High | Multi-provider fallback from Sprint 1; local Ollama for basic testing | Dev 1 | API returns 5xx >3 consecutive calls |
| Scope creep on onboarding wizard | High | Medium | Strictly enforce Step 1-10 scope; defer polish features to backlog | PM | Stakeholder requests additional onboarding steps |
| Team member absence | Medium | Medium | Cross-train on critical components; document architecture decisions | All | Unplanned leave >2 days |
| MongoDB performance with 22 collections | Low | Medium | Index strategy from Sprint 1; monitor query times; Atlas M10 baseline | Dev 1 | Query time >200ms P95 |
| Zoho API breaking changes | Low | High | Version-lock API calls; monitor Zoho changelog; feature flag integration | Dev 1 | Zoho API returns unexpected errors |
| Third-party scraping blocked | Medium | Medium | Multiple detection strategies; manual input fallback for onboarding | Dev 1 | Scrape returns 403 consistently |
| Frontend build failures on Next.js 16 | Medium | Medium | Lock Next.js version in package.json; test builds on CI | Dev 2 | Build error on `npm run build` |
| AI response quality below threshold | Medium | High | Continuous evaluation during Sprints 5-10; prompt iteration; human review | Dev 1 | Quality score <3.5/5 |
| WebSocket connection instability | Medium | Low | Auto-reconnect with exponential backoff; polling fallback | Dev 2 | Connections drop >5% of sessions |
| Data migration issues | Low | Medium | Indexes created at startup; manual scripts for data backfill | Dev 1 | Schema change without migration plan |
| Firebase Auth quota exceeded | Low | Medium | Monitor Firebase usage dashboard; upgrade plan if needed | Dev 2 | >80% quota usage |
| OpenAI embedding cost overrun | Medium | Medium | Cache embeddings; batch processing; deterministic fallback for non-critical | Dev 1 | Monthly cost >$200 |

---

*End of Sprint Plan — YesBoss v2.0*
