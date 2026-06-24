# Business Requirements Document (BRD)

## YesBoss — An AI-Powered Enterprise Intelligent System and Digital CEO Layer for Modern Organizations

| Field | Value |
|-------|-------|
| **Document ID** | BRD-YB-001 |
| **Product Name** | YesBoss |
| **Version** | 1.0 |
| **Status** | Final Draft |
| **Author** | Product Team |
| **Date** | June 2026 |
| **Classification** | Internal — Confidential |

---

## Table of Contents

1. Document Control
2. Executive Summary
3. Market Analysis & Competitive Landscape
4. Problem Statement & Business Case
5. Product Vision & Strategic Pillars
6. Stakeholder Analysis
7. Target Market & User Personas
8. Functional Requirements (By Module)
9. Non-Functional Requirements
10. Success Metrics & KPIs
11. Scope — In-Scope vs Out-of-Scope
12. Data Privacy, Security & Compliance
13. Assumptions, Constraints & Dependencies
14. Risk Register
15. Pricing & Licensing Model
16. Glossary
17. Approvals

---

## 1. Document Control

### 1.1 Revision History

| Version | Date | Author | Change Description | Change Reason |
|---------|------|--------|-------------------|---------------|
| 0.1 | June 2026 | Product Team | Initial draft | — |
| 1.0 | TBD | TBD | Approved version | Stakeholder sign-off |

### 1.2 Distribution List

| Role | Name | Copy Type |
|------|------|-----------|
| Product Manager | TBD | For review & approval |
| Engineering Lead | TBD | For review & implementation |
| QA Lead | TBD | For test planning |
| Business Sponsor | TBD | For final approval |

### 1.3 Related Documents

| Document ID | Document Name | Location |
|-------------|---------------|----------|
| PRD-YB-001 | Product Requirements Document | `pikachu/PRD.md` |
| ARCH-YB-001 | Technical Architecture Document | `pikachu/Technical-Architecture.md` |
| API-YB-001 | API Contracts Specification | `pikachu/API-Contracts.md` |
| DB-YB-001 | Database Schema Document | `pikachu/Database-Schema.md` |
| UX-YB-001 | Wireframes & User Flows | `pikachu/Wireframes.md`, `pikachu/User-Flows.md` |
| DS-YB-001 | Design System | `pikachu/Design-System.md` |
| SPRINT-YB-001 | Sprint Plan | `pikachu/Sprint-Plan.md` |

---

## 2. Executive Summary

YesBoss is an **AI-Powered Enterprise Intelligent System** that functions as a **Digital CEO Layer** for modern organizations. It combines multi-agent AI orchestration, automated business intelligence gathering, goal-to-task execution pipelines, real-time organizational health monitoring, and integrated productivity tools into a single platform that sits above existing organizational tools.

### 2.1 The Core Problem

Small and mid-market organizations (5-500 employees) operate with fragmented tools — spreadsheets for reporting, email for task tracking, chat for coordination, and disconnected systems for goals. Founders spend 40-60% of their time on operational overhead rather than strategic work. There is **no single AI-native platform** that:

- Deeply understands the organization through automated onboarding intelligence
- Connects strategic goals to daily task execution via AI
- Provides real-time multi-dimensional organizational health visibility
- Learns from organizational patterns and improves over time
- Integrates with existing productivity ecosystems (Zoho, Google, Microsoft)

### 2.2 The Solution

YesBoss delivers:

| Capability | What It Does | Primary User |
|------------|--------------|--------------|
| **Intelligent Onboarding** | Auto-detects company via email domain, scrapes website for business intelligence, detects industry, finds social presence, conducts AI-driven persona conversation | Owner |
| **Goal-to-Execution AI Pipeline** | AI suggests goals → generates strategies → auto-creates tasks with assignments and deadlines | Owner |
| **Multi-Agent Executive Chat** | 6 parallel expert AI agents (Finance, Ops, Strategy, HR, Sales, Product) synthesize responses into one coherent answer | Owner |
| **Real-Time Dashboard** | Role-aware: Owner sees business metrics + org health; Employee sees tasks + team updates + AI assistant | Both |
| **Employee AI Assistant** | Understands intent (chat/action/delegate), asks clarifying questions, executes tasks | Employee |
| **Org Health Engine** | Algorithmic 5-dimension weighted scoring (goals, tasks, structure, performance, market) | Owner |
| **Automated Reports** | Employee performance reports, org health reports, PDF generation | Manager/Owner |
| **File Intelligence** | Upload PDF/DOCX/XLSX/CSV/Images → extract text → vector search → AI insights | Both |
| **Market Intelligence** | Industry news, impact analysis cross-referenced with org data, investment recommendations | Owner |
| **Notifications** | In-app, email, browser push with per-user channel+event preferences | Both |
| **Zoho Integration** | OAuth connect, calendar check/book, task sync | Owner |
| **Continuous Learning** | Records workflows, task outcomes, bottlenecks to improve AI recommendations | System |

### 2.3 Quantified Value Proposition

| Metric | Current State | With YesBoss | Improvement |
|--------|---------------|--------------|-------------|
| New organization time-to-value | 2-4 weeks (manual setup, meetings, tool configuration) | 30-45 minutes (AI-driven onboarding) | 95% reduction |
| Goal to actionable tasks | 1-2 weeks (strategy sessions, manual task creation, assignment) | 2 minutes (AI generates strategies + tasks) | 99% reduction |
| Management reporting | 8-12 hours/week (gathering data from 5-8 tools, formatting, analyzing) | <1 hour/week (AI-generated reports + dashboards) | 90% reduction |
| New employee ramp-up | 2-4 weeks (HR paperwork, tool access, team introduction, context gathering) | <5 minutes (auto-detected org, department, manager, AI persona setup) | 96% reduction |
| Task completion cycle | 5-7 days (manual assignment, no escalation, no dependency tracking) | 2-3 days (AI assignment, auto-escalation, dependency resolution) | 55% reduction |
| Operational issue detection | 4-6 weeks late (anecdotal, manual reporting cycles) | Real-time (dashboard + WebSocket alerts + org health scoring) | Near-zero latency |

---

## 3. Market Analysis & Competitive Landscape

### 3.1 Target Addressable Market

| Metric | Value |
|--------|-------|
| **Total Addressable Market (TAM)** | Global AI-in-business-operations software: $48.6B by 2027 (CAGR 35.2%) |
| **Serviceable Addressable Market (SAM)** | AI productivity & operations platforms for SMBs (5-500 employees): $8.2B |
| **Serviceable Obtainable Market (SOM)** | Zoho ecosystem + Google/Microsoft workplace SMBs in India, Middle East, SE Asia: $120M |
| **Primary Geography** | India (initial), Middle East, SE Asia |
| **Target Company Size** | 5-500 employees |
| **Decision Maker** | Founder / CEO / COO (not IT) |

### 3.2 Competitive Landscape

| Competitor | Category | Strengths | Weaknesses vs YesBoss |
|------------|----------|-----------|----------------------|
| **Asana / ClickUp / Monday.com** | Project Management | Mature product, large user base, integrations | No AI-native architecture; AI is bolted-on feature; no org-level intelligence; no automated onboarding |
| **Motion** | AI Calendar/Tasks | AI scheduling, task prioritization | Narrow focus (calendar+task only); no business intelligence; no multi-agent |
| **Notion AI** | Docs + AI | Document-centric, flexible | Not built for operations; no real-time dashboards; no org health |
| **Jasper / Copy.ai** | Content AI | Strong content generation | Narrow use case (marketing content); no operations features |
| **Salesforce Einstein** | Enterprise AI | Deep CRM integration, enterprise-grade | Too expensive for SMBs ($300+/user/mo); complex setup; CRM-centric |
| **Zoho Zia** | Zoho AI | Native Zoho integration, affordable | Limited to Zoho ecosystem; no multi-agent orchestration; no org health scoring |
| **Gamma / Beautiful.ai** | Presentation AI | AI slide generation | Presentation-only; no overlap |
| **Traditional ERP (Tally, Busy, Zoho Books)** | Accounting/ERP | Strong financial features | No AI; no task management; no intelligence layer |

### 3.3 YesBoss Competitive Advantage (Sustainable Moat)

| Advantage | Why Sustainable | Competitor Response Time |
|-----------|----------------|-------------------------|
| **AI-First Multi-Agent Architecture** | 6 parallel expert agents with LangGraph orchestration — not a single chat wrapper | 12-18 months for competitors to rebuild architecture |
| **Automated Onboarding Intelligence** | Proprietary scraping + social detection + AI persona builder pipeline | 6-12 months (requires data pipeline investment) |
| **Org Health Scoring Engine** | Algorithmic 5-dimension weighted model tuned on organizational data | 8-14 months (requires training data we collect first-mover) |
| **Continuous Learning Loop** | Patterns, bottlenecks, outcomes recorded → AI improves over time | Data moat — we collect organizational patterns competitors cannot access |
| **Zoho Ecosystem First-Mover** | Deep Zoho API integration (Calendar, Mail, Tasks) | 3-6 months for others (but Zoho partner ecosystem is relationship-based) |
| **Hybrid AI Provider Architecture** | 5 AI providers with automatic fallback — no single vendor lock-in | 3-6 months (requires engineering investment) |

### 3.4 Feature Comparison Matrix

| Feature | YesBoss | Asana | ClickUp | Motion | Notion AI | Zoho Zia |
|---------|---------|-------|---------|--------|-----------|----------|
| AI-powered onboarding | ✅ Full (domain→scrape→social→persona) | ❌ | ❌ | ❌ | ❌ | ❌ |
| Multi-agent AI chat (6 experts) | ✅ Parallel synthesis | ❌ Single AI | ❌ Single AI | ❌ | ❌ | ❌ Single |
| AI goal→strategy→task pipeline | ✅ End-to-end | ❌ Manual only | ❌ Manual only | ❌ | ❌ | ❌ |
| Org health scoring | ✅ 5-dimension weighted | ❌ | ❌ | ❌ | ❌ | ❌ |
| Automated social+web intelligence | ✅ 6 platforms, 8 strategies | ❌ | ❌ | ❌ | ❌ | ❌ |
| Employee AI assistant with intent classification | ✅ Chat/action/delegate | ❌ | ❌ | ✅ Basic | ❌ | ❌ |
| Real-time org health dashboard | ✅ Owner + Employee views | ❌ | ❌ | ❌ | ❌ | ❌ |
| File intelligence (upload→vector search) | ✅ 6 formats, Qdrant semantic | ❌ | ❌ | ❌ | ✅ Basic | ❌ |
| Market intelligence with org cross-reference | ✅ Impact analysis per org | ❌ | ❌ | ❌ | ❌ | ❌ |
| Continuous learning from patterns | ✅ Workflow+outcome recording | ❌ | ❌ | ❌ | ❌ | ❌ |
| Multi-provider AI (5 providers) | ✅ xAI, OpenAI, Anthropic, Gemini, Qwen | ❌ Single | ❌ Single | ❌ Single | ❌ Single | ❌ Single |
| Zoho integration (Calendar, Mail, Tasks) | ✅ Full OAuth + sync | ❌ | ❌ | ❌ | ❌ | ✅ Native |
| WebSocket real-time updates | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| AI-generated employee reports | ✅ With strengths/improvements/recommendations | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 4. Problem Statement & Business Case

### 4.1 Problem Statement

> Small and mid-market organizations (5-500 employees) lack a unified AI-native platform that understands their unique business context, connects strategic goals to daily execution, provides real-time operational intelligence across multiple dimensions, and continuously adapts to their specific workflow patterns. Existing solutions force organizations to choose between generic productivity tools (too shallow), expensive enterprise systems (too complex/costly), or narrow point solutions (too limited).

### 4.2 Root Cause Analysis

| Root Cause | Evidence | Severity |
|------------|----------|----------|
| **Tool Fragmentation** | Average organization uses 6.3 different tools for operations, reporting, task management, communication, and analytics | High |
| **No Organizational Memory** | Institutional knowledge exists only in emails, chat threads, document files, and individual employee memory — lost on employee departure | Critical |
| **Superficial AI Integration** | Current "AI features" in existing tools are primarily chat wrappers (single-turn Q&A) rather than deep multi-agent intelligence that understands organizational context | High |
| **Manual Onboarding** | No automated mechanism for a software system to deeply understand a new organization's context — every setup requires weeks of configuration | Critical |
| **Delayed Intelligence** | Business health indicators (bottlenecks, risks, trends) are detected 4-6 weeks after they emerge, due to manual reporting cycles | Medium |

### 4.3 Cost of Inaction

| Consequence | Quantified Impact | Source |
|-------------|-------------------|--------|
| Founder/CEO burnout | 60-70 hours/week; 40% spent on operational overhead (status checks, reporting, coordination) | Industry surveys |
| Delayed strategic decisions | Average 2-4 weeks lag between data availability and decision execution | McKinsey |
| Employee misalignment | 40% of employees cannot articulate how their daily work connects to company goals | Gallup |
| Competitive disadvantage | AI-native competitors (Motion, AI-first startups) growing at 3x rate of traditional tools | VC funding data |
| Revenue leakage | SMBs lose avg. 8% of annual revenue due to operational inefficiencies | KPMG study |
| Talent retention risk | 55% of employees cite "unclear priorities" as top reason for job change | LinkedIn Workforce |

### 4.4 Business Case Summary

| Aspect | Detail |
|--------|--------|
| **Total Investment (14-week MVP)** | Estimated $50K-$80K (development + infrastructure + AI API costs) |
| **Break-even Timeline** | 4-6 months post-launch at 50+ paying organizations |
| **Year-1 Revenue Target** | $300K-$500K ARR (100-150 orgs at Growth tier + 5-10 Enterprise) |
| **Year-1 Margin** | 60-70% (SaaS model with cloud infrastructure + AI API costs) |

---

## 5. Product Vision & Strategic Pillars

### 5.1 Product Vision

> YesBoss becomes the definitive AI operating layer for every modern organization — where every business owner has an AI co-pilot that deeply understands their business, every employee has an AI assistant that eliminates administrative friction, and organizational intelligence is real-time, contextual, and continuously improving.

### 5.2 Product Mission

> To eliminate operational overhead for business leaders by providing an AI-powered Digital CEO Layer that autonomously gathers organizational intelligence, connects strategy to execution with zero manual intermediation, and delivers actionable insights that improve decision velocity by 10x.

### 5.3 Strategic Pillars

| Pillar | Description | North Star Metric | Validation |
|--------|-------------|-------------------|------------|
| **Zero-Configuration Onboarding** | New organizations achieve full value within 45 minutes with zero manual setup — AI gathers intelligence autonomously | Onboarding completion rate ≥80%; average onbarding duration ≤45 min | A/B test: 45-min vs 60-min onboarding |
| **Autonomous Goal-to-Execution** | AI transforms high-level goals into strategies, tasks, and assignments without human intermediation | ≤5% AI-generated tasks requiring manual edit; ≥90% of organizations use AI goal suggestions | Monthly audit of task edit rate |
| **Synthetic Multi-Agent Intelligence** | Six expert agents operating in parallel to deliver responses no single human expert could match in speed or breadth | Response synthesis time ≤3s; user satisfaction ≥4.2/5; action item adoption rate ≥30% | Per-response user rating + action item click rate |
| **Self-Improving Organizational Memory** | System records every workflow pattern, task outcome, and bottleneck, then uses that data to improve recommendations | Pattern detection accuracy increases month-over-month; recommendation acceptance rate increases quarter-over-quarter | Quarterly trend analysis |
| **Ecosystem-Native Integration** | Deep integration with Zoho (Calendar, Mail, Tasks) + Google/Microsoft workplace — not shallow API wrappers | Integration adoption rate ≥60% of eligible users; zero P1 bugs in integration paths | Monthly integration health dashboard |

---

## 6. Stakeholder Analysis

| Stakeholder | Role in Product Lifecycle | Primary Needs | Success Criteria | Engagement Cadence | Decision Authority |
|-------------|--------------------------|---------------|-----------------|--------------------|---------------------|
| **Founder / Business Owner** | Buyer, primary decision maker, primary user (owner view) | Real-time org health snapshot; automated reporting; strategic AI guidance | Uses YesBoss ≥3x/week; NPS ≥40; recommends to peers | Weekly during development; quarterly post-launch | Budget, feature priority, launch approval |
| **COO / Operations Head** | Primary user (owner dashboard + executive chat) | Task pipeline visibility; bottleneck detection; team performance metrics | Covers ≥80% of daily operational oversight via YesBoss | Daily | Task approval workflows, employee hierarchy |
| **Manager / Team Lead** | Secondary user (reports, team tracking) | Goal progress tracking; AI-generated team reports; performance insights | Generates monthly reports in ≤5 minutes (vs 2-3 hours manual) | Weekly | Department-level goal setting |
| **Employee** | End user (tasks, assistant, dashboard) | Clear task assignments; AI assistance for routine work; organized workspace | Employee activation rate ≥60% within 7 days of invite | Daily | Personal workspace, notification preferences |
| **Engineering** | Implementor | Precise, testable specifications; stable API contracts; comprehensive edge case documentation | All PRDs: acceptance criteria measurable; error states defined; test cases derivable | Sprint cycle (2 weeks) | Implementation approach, technology choices |
| **Product Management** | Requirements owner, delivery manager | Feature prioritization aligned with business goals; user feedback integration; timeline management | On-time delivery within ±15% of estimate; feature adoption metrics meeting targets | Continuous | Requirement priority, sprint scope, trade-off decisions |
| **QA** | Quality gatekeeper | Testable acceptance criteria; error state documentation; performance benchmarks | Zero P0/P1 bugs in production; API P95 latency targets met | Per sprint | Release sign-off |

---

## 7. Target Market & User Personas

### 7.1 Market Segmentation

| Segment | Description | Company Size | ICP Score | Go-to-Market Priority |
|---------|-------------|--------------|:---------:|:---------------------:|
| **Zoho-Native SMBs** | Already using Zoho Mail/CRM/Books; trust Zoho ecosystem; need AI layer | 10-200 employees | 95/100 | **Tier 1 — Immediate** |
| **Google Workspace SMBs** | Using Gmail, Google Calendar, Google Tasks; need integrated AI operations | 5-100 employees | 75/100 | Tier 2 — After Zoho launch |
| **Microsoft 365 SMBs** | Using Outlook, Teams, To Do; enterprise-adjacent but not enterprise | 20-500 employees | 70/100 | Tier 2 — After Zoho launch |
| **Non-Digital Native** | Still using spreadsheets + email; high pain but lower tech readiness | 5-50 employees | 50/100 | Tier 3 — Content-led education |

### 7.2 Primary Persona: Rajesh (Founder / CEO)

| Attribute | Detail |
|-----------|--------|
| **Role** | Founder & CEO of a 30-200 person company |
| **Industry** | Services (IT, Consulting, Financial, Healthcare) |
| **Age** | 35-50 |
| **Tech Profile** | Comfortable with tools but no technical background; uses email, calendar, WhatsApp, maybe CRM |
| **Work Week Breakdown** | 30% strategy, 40% operations (status checks, coordination, reporting), 20% meetings, 10% other |
| **Top Pain** | *"I have 6 different tools and none of them talk to each other. I spend Monday mornings just figuring out what happened last week."* |
| **Explicit Needs** | • Single dashboard for business health<br>• Automated weekly/monthly reports<br>• Early warning system for problems<br>• Connect company goals to what teams actually do |
| **Latent Needs** | • *"I wish someone/something knew my business as well as I do"*<br>• *"I need a COO but can't afford one"* |
| **Decision Trigger** | Missed a quarterly target because operational issues were detected too late |
| **Buying Objection** | *"Will AI really understand my specific business?"* — solved by intelligent onboarding showing industry-specific knowledge |
| **Success Feeling** | *"I opened YesBoss this morning and saw we have 3 overdue tasks, a goal behind schedule, and the AI already suggested corrective actions. I saved 3 hours of meetings."* |
| **Frequency of Use** | 15 min morning check-in daily + 1-hour weekly strategy session |

### 7.3 Secondary Persona: Priya (Employee — Operations / Engineering)

| Attribute | Detail |
|-----------|--------|
| **Role** | Operations Manager / Software Engineer / Marketing Lead |
| **Age** | 24-40 |
| **Tech Profile** | Digitally native; uses multiple tools; frustrated by context-switching |
| **Work Day** | 50% deep work, 30% meetings/coordination, 20% admin (status updates, reports) |
| **Top Pain** | *"I spend 2 hours every week just updating status across different tools. My manager asks for a report and I have to compile it manually."* |
| **Explicit Needs** | • Clear task priorities without ambiguity<br>• Less time on status updates<br>• Quick way to ask work-related questions |
| **Latent Needs** | • *"I want to see how my work connects to company goals"*<br>• *"I want an assistant that handles the admin stuff"* |
| **Buying Objection** | *"Another tool I have to learn?"* — solved by AI assistant that understands natural language, no training needed |
| **Success Feeling** | *"I told YesBoss 'create a task for the weekly report review' and it just did it — assigned, prioritized, deadline set. Took 10 seconds."* |
| **Frequency of Use** | Multiple times daily (tasks, assistant, team updates) |

### 7.4 Behavioral Persona Dimensions (For AI Training)

| Dimension | Founder (Rajesh) | Employee (Priya) |
|-----------|-----------------|-------------------|
| **Query Style** | Broad, strategic: *"How are we doing?"* | Specific, actionable: *"What's blocking my task?"* |
| **Decision Speed** | Wants synthesized options, makes quick decisions | Wants clear instructions, executes |
| **Report Consumption** | Executive summary → drill down if needed | Detail-oriented, wants data |
| **Alert Tolerance** | Only critical alerts; daily digest preferred | Real-time updates for own tasks |
| **AI Trust Level** | Needs to see reasoning before trusting | More willing to delegate to AI |

---

## 8. Functional Requirements (By Module)

### 8.1 Requirement Specification Standard

Every requirement in this document follows this structure:

| Field | Description | Example |
|-------|-------------|---------|
| **ID** | Unique identifier | `REQ-AUTH-001` |
| **Title** | One-line description | "User signup via phone OTP" |
| **Description** | What the system must do — single behavior per requirement | "System sends a 6-digit OTP to the provided phone number via Firebase Phone Auth" |
| **Trigger** | What initiates this behavior | "User clicks 'Send OTP' button after entering phone number with country code" |
| **Precondition** | State required before execution | "Phone number is valid format with country code" |
| **Acceptance Criteria** | Measurable PASS/FAIL conditions (ALL must pass) | • OTP delivered within 3 seconds<br>• OTP is exactly 6 numeric digits<br>• OTP expires after 60 seconds<br>• User can request resend after 30 seconds<br>• Max 3 failed attempts → 60-second lockout |
| **Error States** | What happens when things go wrong | • Invalid phone → inline error message<br>• SMS delivery failure → "Resend available" message<br>• Network timeout → retry button |
| **Priority** | P0 (must-have) / P1 (should-have) / P2 (nice-to-have) | P0 |
| **Stakeholder** | Primary beneficiary | All Users |
| **Validation** | How to test this requirement | "Automated test: mock SMS service, verify OTP generation and validation flow" |
| **Dependencies** | What must exist first | None |

### 8.2 Authentication & User Management (6 Atomic Requirements)

---

**REQ-AUTH-001: User signup via phone OTP**

| Field | Value |
|-------|-------|
| **Description** | System sends a 6-digit OTP to the provided phone number via Firebase Phone Auth for user verification |
| **Trigger** | User enters phone number with country code and clicks "Send OTP" |
| **Precondition** | Phone number is valid E.164 format (e.g., +919876543210) |
| **Acceptance Criteria** | • OTP SMS delivered within 3 seconds (P95)<br>• OTP is exactly 6 numeric digits<br>• OTP expires after 60 seconds<br>• User can request resend after 30-second cooldown<br>• Max 3 failed OTP attempts → 60-second account lockout<br>• Successful OTP entry creates Firebase account |
| **Error States** | • Invalid phone format → inline error: "Please enter a valid phone number with country code"<br>• SMS delivery failure → inline message: "Unable to send SMS. Check your number or try email signup." + "Resend" button<br>• Network timeout → retry button with 5-second countdown<br>• Wrong OTP → "Incorrect OTP. X attempts remaining."<br>• 3 failed attempts → "Too many attempts. Please wait 60 seconds." |
| **Priority** | P0 |
| **Validation** | Automated test: mock SMS gateway, send 6 test OTPs (1 valid, 3 wrong, 1 expired, 1 timeout) |
| **Dependencies** | Firebase Auth configured with SMS provider |

---

**REQ-AUTH-002: User signup via email + password (alternative)**

| Field | Value |
|-------|-------|
| **Description** | System creates user account with email and password as alternative to phone OTP |
| **Trigger** | User selects email signup option |
| **Precondition** | Email format validated; no existing account with this email |
| **Acceptance Criteria** | • Password min 8 characters, at least 1 uppercase letter, at least 1 digit<br>• Email validated for format (RFC 5322) via regex<br>• Email uniqueness enforced: duplicate returns "Email already registered"<br>• Account created via Firebase Email/Password Auth<br>• Verification email sent to email address |
| **Error States** | • Invalid email format → "Please enter a valid email address"<br>• Email already registered → "An account with this email already exists. [Login]"<br>• Weak password → specific message: "Password must have at least 8 characters, 1 uppercase letter, and 1 number"<br>• Firebase creation failure → "Unable to create account. Please try again." |
| **Priority** | P0 |
| **Validation** | Automated test: create 5 accounts (1 valid, 2 invalid emails, 1 duplicate, 1 weak password) |
| **Dependencies** | Firebase Auth configured with Email/Password provider |

---

**REQ-AUTH-003: Role selection during signup**

| Description | User selects "Owner" or "Employee" role; system stores role and determines redirect path |
| Trigger | After successful account creation (post-OTP or post-email-password) |
| Precondition | User account exists in Firebase |
| Acceptance Criteria | • Two options displayed: "I'm a Business Owner / Founder" and "I'm an Employee"<br>• Each option has icon + short description + distinct visual treatment<br>• Selection enforced before proceeding (no default)<br>• Owner redirect: `/onboarding/owner`<br>• Employee redirect: `/onboarding/employee`<br>• Role stored in user profile (Firebase custom claims + MongoDB users collection) |
| Error States | • Network failure during role save → retry modal with "Retry" button<br>• Session timeout during selection → user can complete on next login |
| Priority | P0 |
| Validation | Manual: create 2 accounts (1 owner, 1 employee), verify redirect URL per role |

---

**REQ-AUTH-004: User login (email/password + phone OTP)**

| Description | System authenticates user via email/password or phone OTP; sets httpOnly session cookie |
| Trigger | User navigates to `/login` and submits credentials |
| Precondition | Account exists and is active |
| Acceptance Criteria | • Email/password tab: submit → Firebase auth → success within 2 seconds<br>• Phone OTP tab: enter phone → send OTP → enter OTP → verify within 60 seconds<br>• Successful auth sets httpOnly cookie named `yesboss_token` with 30-day expiry<br>• Cookie flags: httpOnly, secure (production), sameSite="lax"<br>• On login success: check onboardingComplete flag → redirect to dashboard OR onboarding<br>• 5 failed login attempts → 15-minute IP lockout |
| Error States | • Invalid credentials → "Invalid email or password" (no indication of which field is wrong)<br>• Account locked → "Account temporarily locked due to multiple failed attempts. Try again in 15 minutes."<br>• Network error → "Unable to connect. Check your internet connection." |
| Priority | P0 |
| Validation | Automated: 10 login attempts (5 valid, 3 wrong password, 2 locked account) |

---

**REQ-AUTH-005: Forgot password via email OTP (4-step flow)**

| Description | System guides user through 4-step password reset: Send OTP → Verify OTP → New Password → Confirmation |
| Trigger | User clicks "Forgot Password" on login page |
| Precondition | User email exists in system |
| Acceptance Criteria | • Step 1: Enter email → "Send OTP" → OTP sent within 3 seconds<br>• Step 2: Enter 6-digit OTP → verified within 60 seconds<br>• Step 3: Enter new password (same strength rules as signup) + confirm<br>• Step 4: Success message + "Go to Login" button<br>• Password updated via Firebase Admin SDK<br>• OTP lifetime: 10 minutes |
| Error States | • Email not found → "No account with this email address"<br>• OTP expired → "OTP expired. Request a new one."<br>• Weak password → specific strength requirement message (same as REQ-AUTH-002) |
| Priority | P0 |
| Validation | Manual: complete full flow with 2 test accounts; test OTP expiry |

---

**REQ-AUTH-006: Route protection middleware**

| Description | System checks authentication state and role on every protected route; redirects unauthorized users |
| Trigger | User navigates to any route under `/dashboard`, `/onboarding`, `/goals`, `/tasks` |
| Precondition | Middleware is configured in Next.js `src/middleware.ts` |
| Acceptance Criteria | • Unauthenticated user → redirect to `/login` with return URL<br>• Authenticated user on auth pages (`/login`, `/signup`) → redirect to dashboard<br>• Owner accessing employee-only routes → 403 page<br>• Employee accessing owner-only routes (`/dashboard/chat`, `/dashboard/market`) → 403 page<br>• Token expired → clear cookie → redirect to `/login`<br>• All checks complete within 100ms (serverless edge function) |
| Error States | • Corrupted cookie → clear and redirect to login<br>• Firebase validation timeout → serve cached route if available, else login redirect |
| Priority | P0 |
| Validation | Automated: test 10 route access scenarios (authenticated/not, owner/employee, valid/expired token) |
| Dependencies | REQ-AUTH-004 (login sets cookie) |

---

### 8.3 Owner Onboarding (10 Atomic Requirements)

---

**REQ-ONB-001: Domain analysis for company auto-detection**

| Field | Value |
|-------|-------|
| **Description** | System extracts domain from owner's email, performs website scrape + AI enrichment to auto-detect company information |
| **Trigger** | Owner enters email during signup OR manually enters company URL |
| **Precondition** | Owner is authenticated with verified email |
| **Acceptance Criteria** | • Domain extracted from email address (e.g., `john@acmecorp.com` → `acmecorp.com`)<br>• If personal domain (gmail.com, yahoo.com, outlook.com, etc.) detected → prompt for company website URL<br>• Firecrawl API called for website content (timeout: 10 seconds)<br>• Firecrawl failure → BeautifulSoup direct scrape (timeout: 15 seconds)<br>• Scraped content stored: company name, meta description, page titles, visible text headers<br>• AI (xAI Grok) enriches scraped content → extracted: company name, industry hints, services, approximate size signals<br>• Total end-to-end time: ≤20 seconds<br>• Results presented to user in editable form for confirmation |
| **Error States** | • No website found at domain → "We couldn't find a website for this domain. Tell us your company manually."<br>• Scrape blocked (403/robots.txt) → DuckDuckGo search fallback for company info<br>• AI enrichment fails → present raw scraped data; user can edit manually<br>• Domain already registered by another org → "This company may already be on YesBoss" |
| **Priority** | P0 |
| **Validation** | Test: 10 domains (5 valid company, 2 personal, 2 no website, 1 blocked scrape) |

---

**REQ-ONB-002: Website scraping for business intelligence**

| Description | System scrapes company website to extract business intelligence data — services, team size, social links, contact info |
| Trigger | User confirms company URL OR domain analysis succeeds |
| Precondition | Valid company URL available |
| Acceptance Criteria | • Scrapes: homepage, about page, services/products page, team page, contact page<br>• Extraction targets: company name, tagline, service descriptions, team count, email/phone contacts, social media links, blog content, testimonials<br>• 8 social detection strategies executed: (1) HTML link tags, (2) meta tags, (3) footer links, (4) DuckDuckGo site search, (5) common URL pattern check, (6) SearAPI fallback, (7) Firecrawl structured data, (8) AI URL validation<br>• Social platforms checked: LinkedIn, Twitter/X, Instagram, Facebook, YouTube, Others<br>• Each result tagged: verified / suggested / not_found<br>• Scraped text stored for AI enrichment (raw text + structured extractions) |
| Error States | • Scrape returns empty → "We couldn't find much on your website. You can add details manually."<br>• Website down → inform user, allow manual entry<br>• Partial scrape (some pages blocked) → proceed with available data |
| Priority | P0 |
| Validation | Test: 5 company websites with different structures; verify extraction accuracy |

---

**REQ-ONB-003: Industry detection from scraped content + taxonomy**

| Description | System matches scraped content against 60+ industry taxonomy to determine primary industry and micro-vertical |
| Trigger | After website scrape completes |
| Precondition | Scraped content available |
| Acceptance Criteria | • AI analyzes scraped content for industry signals<br>• Matches against taxonomy: 60+ industries, each with 5-15 micro-verticals (source: `data/custom_taxonomies.json`)<br>• Returns: suggested industry, suggested micro-vertical, confidence score (0.0-1.0)<br>• If confidence <0.6 → show "AI is unsure" + top 3 industry suggestions<br>• User can confirm, select from full taxonomy dropdown, or type custom<br>• Industry selection stored in organization profile |
| Error States | • AI analysis fails → show full taxonomy dropdown with search<br>• Taxonomy file missing → fallback to common industries (Tech, Finance, Healthcare, Manufacturing, Services, Education, Retail) |
| Priority | P0 |
| Validation | Test: submissions for 10 different company scrapes across industries |

---

**REQ-ONB-004: Social media presence detection (6 platforms, 8 strategies)**

| Description | System detects and verifies organization's social media profiles using 8 parallel detection strategies |
| Trigger | Industry confirmed |
| Precondition | Company name + website URL available |
| Acceptance Criteria | • 8 detection strategies executed in parallel (timeout: 15s total):<br>  (1) Website HTML link tags scanning<br>  (2) Meta tag social link extraction<br>  (3) Footer link pattern matching<br>  (4) DuckDuckGo search: `site:linkedin.com "company name"` + variant<br>  (5) Common URL pattern generation (linkedin.com/company/{name}, twitter.com/@{name}, etc.)<br>  (6) SearAPI fallback (if DuckDuckGo fails)<br>  (7) Firecrawl structured data extraction<br>  (8) AI URL validation (xAI Grok verifies discovered URLs)<br>• 6 platforms checked: LinkedIn, Twitter/X, Instagram, Facebook, YouTube, Other<br>• Each platform result: status = verified(✅) / suggested(⚠️) / not_found(✗)<br>• User can: confirm verified links, edit suggested links, add not-found links manually |
| Error States | • All strategies fail → "We couldn't find social profiles automatically" + manual entry form<br>• Partial results → show what was found, allow manual additions<br>• AI validation times out → show unvalidated as "suggested" |
| Priority | P0 |
| Validation | Test: 5 companies (2 with full social, 1 partial, 1 none, 1 with fake-like URLs) |

---

**REQ-ONB-005: File upload during onboarding (optional)**

| Description | User can optionally upload business documents for AI analysis during onboarding |
| Trigger | User chooses to upload files or clicks "Skip" |
| Precondition | None (optional step) |
| Acceptance Criteria | • Supported formats: PDF, DOCX, XLSX, CSV, PNG, JPG<br>• Max file size: 25MB per file<br>• Drag-drop zone + "Browse Files" button<br>• PDF → text via PyMuPDF (fallback: PyPDF2)<br>• DOCX → text via python-docx<br>• XLSX/CSV → rows-to-text via Pandas<br>• PNG/JPG → OCR via pytesseract (fallback: none)<br>• Text chunking: 1000 characters per chunk, 200 character overlap<br>• Embedding: OpenAI text-embedding-3-small (1536-dimension)<br>• Embedding failure → deterministic hash fallback (consistent but lower quality)<br>• Chunks + embeddings stored in Qdrant `documents` collection<br>• File metadata stored in MongoDB `documents` collection<br>• Progress shown per file: Uploading → Processing → Complete / Failed |
| Error States | • Unsupported format → "File type not supported. Supported: PDF, DOCX, XLSX, CSV, PNG, JPG"<br>• File >25MB → "File exceeds 25MB limit"<br>• OCR fails on image → "Could not extract text from image. Try a clearer image."<br>• Embedding API fails → hash fallback (silent, no user-facing error)<br>• Qdrant storage fails → file stored in MongoDB only; search degraded |
| Priority | P1 |
| Validation | Test: 12 files (2 per format, 1 valid + 1 corrupt per format) |

---

**REQ-ONB-006: AI-driven persona conversation (Owner)**

| Description | LangGraph master agent conducts conversational onboarding with dynamic follow-ups to build organization understanding |
| Trigger | Social detection step completed |
| Precondition | Industry + social profiles confirmed |
| Acceptance Criteria | • LangGraph master agent initializes with `AgentState`: { understanding_level: 0, current_phase: "goals", missing_info: [], conversation_history: [] }<br>• Minimum 8 base question topics covered:<br>  1. Top 3 business goals for current quarter<br>  2. Biggest challenge/obstacle right now<br>  3. Team structure (departments, headcount)<br>  4. Decision-making style (solo/team/data-driven)<br>  5. Growth priorities (revenue, team, product, market)<br>  6. Operational bottlenecks (process, tool, people)<br>  7. Current technology stack<br>  8. Competitive landscape<br>• After each user response: AI generates 2-5 dynamic follow-ups based on response content<br>• Agent updates `understanding_level` based on completeness of information gathered<br>• Conversation ends when `understanding_level` ≥ 80%<br>• State machine: `analyze_node` → `question_node` → `update_node` → loop until done<br>• All Q&A pairs stored in organization profile (personaAnswers array)<br>• User can see progress: "Building business profile... 65%" |
| Error States | • AI response timeout → "Let me think about that..." with brief retry<br>• User gives irrelevant answer → AI rephrases: "Let me ask differently..."<br>• User tries to skip all questions → "Just a few more to give you the best experience!"<br>• Network interrupt → state preserved in store; resume on reconnect |
| Priority | P0 |
| Validation | Test: 5 conversations (1 complete, 1 with skips, 1 with irrelevant answers, 1 with network interrupt, 1 with very short answers) |

---

**REQ-ONB-007: AI goal suggestions from persona conversation**

| Description | AI analyzes persona conversation data to suggest 3-5 strategic goals with rationale referencing specific conversation points |
| Trigger | Persona conversation completes (understanding_level ≥ 80%) |
| Precondition | Persona answers stored in organization profile |
| Acceptance Criteria | • AI receives: org industry, micro-vertical, size, persona Q&A, current date<br>• Returns 3-5 goal suggestions<br>• Each suggestion includes: title, description, suggested department, rationale referencing specific persona answers<br>• Example rationale: _"Based on your answer about churn being your biggest challenge and revenue growth being your top priority, reducing churn to 5% directly addresses both."_<br>• User can: Accept, Edit, Reject per goal<br>• User can add custom goal manually<br>• Minimum 1 goal must be accepted to proceed |
| Error States | • AI returns <3 suggestions → pad with industry-specific defaults<br>• AI generation fails → fallback to industry-based default goal templates<br>• All goals rejected → prompt for manual goal creation |
| Priority | P0 |
| Validation | Manual: verify suggestions reference specific persona answers |

---

**REQ-ONB-008: AI strategy generation from selected goal**

| Description | For each selected goal, AI generates 2-3 distinct strategies with expected impact estimates |
| Trigger | User accepts ≥1 goal and clicks "Generate Strategies" |
| Precondition | At least 1 goal accepted |
| Acceptance Criteria | • Per goal: AI generates 2-3 strategies<br>• Each strategy: id, title (max 100 chars), description (max 500 chars), expectedImpact (text)<br>• Strategies must be meaningfully different (not synonyms)<br>• User selects exactly 1 strategy per goal<br>• Selection stored in goal document as `selectedStrategy` |
| Error States | • AI returns strategies with identical titles → regenerate, flag for review<br>• AI fails → retry with simpler prompt, then fallback to default strategies |
| Priority | P0 |
| Validation | Manual: review 3 goals × 3 strategies = 9 strategy sets for differentiation |

---

**REQ-ONB-009: AI task generation from selected strategy**

| Description | For each selected strategy, AI generates 3-7 actionable tasks with title, department suggestion, deadline suggestion, priority |
| Trigger | User selects strategy and clicks "Generate Tasks" |
| Precondition | Strategy selected for goal |
| Acceptance Criteria | • Per strategy: AI generates 3-7 tasks<br>• Each task: title (max 200 chars), suggestedDepartment, suggestedDeadline (relative: "2 weeks from start"), priority (low/medium/high/critical)<br>• Tasks saved as draft in MongoDB `tasks` collection with status="todo"<br>• User can edit task: title, description, assignee, priority, deadline, dependencies<br>• User can remove individual tasks<br>• User can add custom tasks manually<br>• Click "Looks Good" → tasks activated (visible in pipelines) |
| Error States | • AI returns <3 tasks → pad with default template tasks<br>• Task with same title as existing → flag as duplicate<br>• AI fails → manual task creation mode |
| Priority | P0 |
| Validation | Test: 3 strategies → verify 9-21 tasks generated across all |

---

**REQ-ONB-010: Onboarding completion and dashboard redirect**

| Description | System marks onboarding as complete, creates initial dashboard data, and redirects user with welcome summary |
| Trigger | User clicks "Go to Dashboard" after task review |
| Precondition | All previous onboarding steps completed |
| Acceptance Criteria | • Organization document updated: `onboardingComplete: true`<br>• User redirected to `/dashboard`<br>• Welcome screen shows summary cards: goals created (count), tasks generated (count), team members (0 + invite CTA), documents processed (count)<br>• Dashboard pre-populated with initial data from onboarding<br>• Initial WebSocket connection established for real-time updates |
| Error States | • Organization save fails → "We couldn't save your progress. Don't worry, your data is safe." → retry<br>• Dashboard fails to load → show basic welcome page instead |
| Priority | P0 |
| Validation | Manual: complete full onboarding, verify redirect + dashboard data |

---

### 8.4 Employee Onboarding (4 Atomic Requirements)

---

**REQ-EMP-001: Organization auto-detection from email domain**

| Description | System detects employee's organization by matching email domain against registered organizations |
| Trigger | Employee enters work email during signup |
| Precondition | Employee account exists |
| Acceptance Criteria | • Domain extracted from email → match against organizations collection<br>• Match found → "You're joining {OrgName}" — user confirms<br>• No match → "Your company isn't on YesBoss yet" + "Notify my admin" button sends notification to owner<br>• Multiple orgs with same domain → show list, user selects |
| Error States | • Domain matches but org has maxed license → "Your organization has reached its user limit" |
| Priority | P0 |
| Validation | Test: 5 email domains (2 matching, 1 unmatched, 1 multi-match, 1 personal domain) |

---

**REQ-EMP-002: Department and manager selection**

| Description | Employee selects department from organization's configured list and manager from filtered hierarchy |
| Trigger | Organization confirmed |
| Precondition | Organization exists with department config |
| Acceptance Criteria | • Department dropdown populated from org settings (or default: Engineering, Product, Design, Marketing, Sales, HR, Finance, Operations)<br>• Manager dropdown filtered by selected department<br>• If no manager exists in department → "Reports directly to founder" default option<br>• Selection creates employee record in MongoDB |
| Error States | • No departments configured → "General" default<br>• Selected manager is same employee → validation error |
| Priority | P0 |
| Validation | Test: 3 scenarios (has managers, no managers, multiple departments) |

---

**REQ-EMP-003: Employee persona chat (4 topics)**

| Description | AI conducts simplified persona conversation with employee covering 4 key topics for workspace personalization |
| Trigger | Department and manager selected |
| Precondition | Employee record created |
| Acceptance Criteria | • AI asks exactly 4 questions:<br>  1. "What does a typical workday look like for you?"<br>  2. "What tools do you use most in your work?"<br>  3. "What's your preferred communication style?"<br>  4. "What's the biggest bottleneck in your work right now?"<br>• Each answer stored in employee persona profile<br>• No follow-up questions (unlike owner — simplified)<br>• "Skip" option available (stores empty persona)<br>• Employee redirected to dashboard on completion or skip |
| Error States | • AI fails → skip options, continue without persona data |
| Priority | P0 |
| Validation | Manual: complete 3 employee onboardings (1 full, 1 skip, 1 partial) |

---

**REQ-EMP-004: Employee welcome and dashboard redirect**

| Description | System creates initial employee dashboard state and redirects with personalized welcome |
| Trigger | Persona chat completed or skipped |
| Precondition | Employee record exists with org assignment |
| Acceptance Criteria | • Employee document saved with all collected data<br>• Redirected to `/dashboard` (employee version)<br>• Welcome shows: assigned tasks (if any), team hierarchy (manager + teammates), AI tip based on persona |
| Priority | P0 |
| Validation | Manual: verify redirect + dashboard employee view |

---

### 8.5 Goal Management (6 Atomic Requirements)

---

**REQ-GOL-001: Create goal**

| Description | User creates a new goal with title, description, department, timeline, and success criteria |
| Trigger | User clicks "Create Goal" on goals page or dashboard |
| Precondition | User is authenticated; organization exists |
| Acceptance Criteria | • Title: required, max 200 characters<br>• Description: optional, max 2000 characters<br>• Department: required, dropdown from org departments<br>• Timeline: start date (required) + end date (required, must be after start)<br>• Success criteria: optional, max 1000 characters<br>• Goal created with status="active"<br>• Goal stored in MongoDB `goals` collection<br>• Response: goal ID + created timestamp returned within 500ms |
| Error States | • Title empty → "Goal title is required"<br>• End date before start → "End date must be after start date"<br>• Department invalid → "Please select a valid department" |
| Priority | P0 |
| Validation | Automated: 5 create requests (1 valid, 3 validation failures, 1 server error) |

---

**REQ-GOL-002: Read goals (with filtering)**

| Description | User retrieves goals list with optional filters: status, department, search text |
| Trigger | User navigates to goals page or dashboard |
| Precondition | User has permission to view org goals |
| Acceptance Criteria | • Filters: status (active/completed/archived), department (dropdown), search (text match on title)<br>• Pagination: page + limit (default 20)<br>• Sort: createdAt desc (default), deadline asc/desc<br>• Response includes per-goal: task count (done/total), progress percentage, strategy count |
| Priority | P0 |
| Validation | Automated: query with each filter combination |

---

**REQ-GOL-003: Update goal**

| Description | User updates goal fields: title, description, status, timeline, success criteria |
| Trigger | User edits goal from goal detail page |
| Precondition | Goal exists; user has edit permission |
| Acceptance Criteria | • Partial update allowed (send only changed fields)<br>• Status transitions: active→completed, active→archived, completed→active<br>• Immutable after status=archived: title, description, department, timeline<br>• UpdatedAt timestamp refreshed on every update |
| Error States | • Goal not found → 404<br>• Archived goal edit → "Cannot edit an archived goal"<br>• Invalid status transition → "Cannot change status from {current} to {requested}" |
| Priority | P0 |
| Validation | Automated: 6 update scenarios (title, status forward, status reverse, archive then edit, not found) |

---

**REQ-GOL-004: Delete goal**

| Description | User deletes a goal with confirmation; associated tasks are unlinked (not deleted) |
| Trigger | User clicks "Delete Goal" and confirms in dialog |
| Precondition | Goal exists; user has delete permission |
| Acceptance Criteria | • Confirmation dialog: "Are you sure? Tasks under this goal will be unlinked."<br>• On confirm: goal status = "archived" (soft delete)<br>• Associated tasks: goalId field set to null (tasks preserved)<br>• Hard delete only via admin API |
| Error States | • Goal has active tasks → warning: "{N} active tasks will be unlinked" |
| Priority | P0 |
| Validation | Automated: delete goal with/without associated tasks |

---

**REQ-GOL-005: AI goal suggestions**

| Description | AI generates 3-5 goal suggestions based on organization context (industry, persona, existing goals) |
| Trigger | User clicks "Suggest Goals" or clicks on goal creation with AI option |
| Precondition | Organization has industry + persona data |
| Acceptance Criteria | • AI receives: org industry, micro-vertical, size, persona answers (last 20), existing active goals<br>• Returns 3-5 suggestions<br>• Each: title, description, department suggestion, rationale referencing specific persona data<br>• Duplicates against existing goals filtered out<br>• Response time: ≤5 seconds |
| Error States | • AI fails → show previously accepted suggestions cache, or fallback to industry default templates<br>• No persona data → generic suggestions based on industry only |
| Priority | P0 |
| Validation | Manual: verify suggestions reference actual persona data |

---

**REQ-GOL-006: Goal refinement chat**

| Description | User converses with AI about a specific goal for refinement, brainstorming, or clarification |
| Trigger | User clicks chat icon on goal card |
| Precondition | Goal exists |
| Acceptance Criteria | • Chat context includes: goal title, description, department, current strategies, current tasks<br>• AI persona: "goal_architect" from prompt engine<br>• AI can suggest: strategy modifications, new tasks, timeline adjustments, success criteria refinement<br>• User can click "Apply Suggestion" to directly update goal from chat<br>• Conversation stored in MongoDB `conversations` collection + Qdrant vector |
| Priority | P1 |
| Validation | Manual: 3 conversations (refinement, expansion, scope reduction) |

---

### 8.6 Task Management (8 Atomic Requirements)

---

**REQ-TSK-001: Create task**

| Description | User creates a new task with required title and optional fields |
| Trigger | User clicks "Add Task" on task page, goal detail, or chat action item |
| Precondition | User has create permission in organization |
| Acceptance Criteria | • Required fields: title (max 200 chars)<br>• Optional fields: description (max 2000 chars), assigneeId (valid employee), goalId (valid goal), priority (default: medium), deadline (future date), dependencies (array of valid taskIds), tags (array of strings, max 5)<br>• Task created with status="todo"<br>• Stored in MongoDB `tasks` collection<br>• WebSocket event `task:created` broadcast to assignee + org channel<br>• Response within 500ms |
| Error States | • Title empty → "Task title is required"<br>• AssigneeId invalid → "Selected assignee not found in organization"<br>• Deadline in past → "Deadline must be a future date"<br>• Dependency taskId not found → "Dependency task {id} not found"<br>• Circular dependency detected → "Task cannot depend on itself" |
| Priority | P0 |
| Validation | Automated: 8 create scenarios (valid, missing title, invalid assignee, past deadline, invalid dependency, circular dependency, max tags exceeded, server error) |

---

**REQ-TSK-002: Read tasks (with filtering, pagination, sorting)**

| Description | User retrieves tasks list with filters: status, priority, assignee, goal, search, deadline range |
| Trigger | User navigates to task page |
| Precondition | User has read permission |
| Acceptance Criteria | • Filters: status (multi-select), priority, assigneeId, goalId, search (title contains), deadlineBefore, deadlineAfter<br>• Pagination: page + limit (default: 20, max: 100)<br>• Sorting: createdAt, deadline, priority, status (any, asc/desc)<br>• Response includes: taskId, title, status, priority, deadline, assignee.displayName, assignee.avatarUrl, goal.title, commentCount, overdue boolean<br>• Response time: ≤300ms at P95 |
| Priority | P0 |
| Validation | Automated: query with 10 filter combinations, verify response structure |

---

**REQ-TSK-003: Update task status**

| Description | User updates task status; valid transitions enforced |
| Trigger | User changes task status via dropdown, drag-drop, or checkbox |
| Precondition | Task exists; user is assignee or has manage permission |
| Acceptance Criteria | • Valid transitions: todo→in_progress, in_progress→review, review→done, any→blocked, blocked→any<br>• Invalid transitions return error: "Cannot move from {current} to {requested}"<br>• Status change from review→done requires approval if task has needsApproval=true<br>• WebSocket event `task:updated` broadcast with new status<br>• updatedAt refreshed |
| Error States | • Task not found → 404<br>• Invalid transition → specific error with allowed transitions listed<br>• Approval required → "This task requires approval before marking done"<br>• Dependencies not done → "Cannot mark done: dependencies {taskIds} are not complete" |
| Priority | P0 |
| Validation | Automated: 10 transition scenarios (valid, invalid, approval required, dependency blocked) |

---

**REQ-TSK-004: Add comment to task**

| Description | User adds a text comment to a task |
| Trigger | User types comment and clicks "Send" on task detail |
| Precondition | Task exists; user has read access |
| Acceptance Criteria | • Comment: userId (from auth), text (max 2000 chars), createdAt (server timestamp)<br>• Comment appended to task's comments array<br>• Commenter displayName + avatarUrl included in response<br>• WebSocket event `task:comment` broadcast<br>• User can delete own comment within 5 minutes of posting |
| Error States | • Text empty → "Comment cannot be empty"<br>• Text >2000 chars → "Comment must be under 2000 characters"<br>• Delete after 5 min → "Comments can only be deleted within 5 minutes" |
| Priority | P1 |
| Validation | Automated: 5 scenarios (valid, empty, too long, delete on time, delete late) |

---

**REQ-TSK-005: Task approval workflow**

| Description | Manager/owner approves a completed task; task transitions from review→done |
| Trigger | Authorized user clicks "Approve" on task in review status |
| Precondition | Task status=review; needsApproval=true; user is manager or owner |
| Acceptance Criteria | • Approval recorded: approvedBy (userId), approvedAt (timestamp)<br>• Status changes: review→done<br>• WebSocket event `task:approved` broadcast<br>• If rejected: reviewer adds comment explaining reason; status reverts to in_progress |
| Error States | • Unauthorized user → 403 "Only managers and owners can approve tasks"<br>• Task not in review → "Task must be in 'review' status to approve" |
| Priority | P1 |
| Validation | Automated: 4 scenarios (approve, reject, unauthorized, wrong status) |

---

**REQ-TSK-006: Overdue escalation**

| Description | Background scheduler checks for overdue tasks and escalates through levels |
| Trigger | Scheduler runs every 5 minutes |
| Precondition | Scheduler service is running |
| Acceptance Criteria | • Check: all tasks with deadline < now() and status != done<br>• 1 day before deadline: in-app notification + email to assignee: "Task '{title}' is due tomorrow"<br>• 3 days overdue: in-app + email to assignee's manager: "Task '{title}' ({assigneeName}) is 3 days overdue"<br>• 7 days overdue: in-app + email to organization owner: "Task '{title}' ({assigneeName}) is 7 days overdue"<br>• Each escalation level creates a notification in MongoDB<br>• Escalation chain stops when task is completed |
| Error States | • Email fails → notification still sent (in-app); retry email at next cycle<br>• Manager not found → skip to next escalation level<br>• Scheduler crash → on restart, catch up on missed escalations within 10 minute window |
| Priority | P0 |
| Validation | Automated: mock 5 tasks with different overdue durations, verify escalation events |

---

**REQ-TSK-007: Task dependencies**

| Description | Tasks can depend on other tasks; dependency rules enforced on status changes |
| Trigger | User adds dependencies during task creation or edit |
| Precondition | Dependencies reference valid taskIds in same organization |
| Acceptance Criteria | • Add dependencies: array of taskIds<br>• View dependencies: on task detail, linked tasks shown with their current status<br>• Blocked: task status auto-set to "blocked" if any dependency is not "done"<br>• Cannot mark task as "done" if any dependency has status ≠ done<br>• Circular dependency detection on save: reject with "Circular dependency detected"<br>• Dependency chain visualization (future: graph view) |
| Priority | P1 |
| Validation | Automated: 5 dependency scenarios (valid, circular, done blocked, dependency completed auto-unblock) |

---

**REQ-TSK-008: WebSocket real-time task updates**

| Description | Task changes are pushed to connected clients in real-time via WebSocket |
| Trigger | Any task CRUD operation, comment, approval, or escalation |
| Precondition | Client has active WebSocket connection |
| Acceptance Criteria | • Events: task:created, task:updated, task:deleted, task:comment, task:approved<br>• Payload per event: { eventType, taskId, changedFields, timestamp }<br>• Target: assignee + org channel (status changes) OR individual user (assignments)<br>• Delivery: ≤200ms from server event to client receipt (P95)<br>• Reconnection: auto-reconnect on disconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s)<br>• Missed events: on reconnect, fetch latest state from REST API |
| Priority | P1 |
| Validation | Automated: mock WebSocket client, verify event delivery for each operation |

---

### 8.7 Executive AI Chat (5 Atomic Requirements)

---

**REQ-CHT-001: Chat initialization**

| Description | User starts a new executive chat session; system initializes conversation context from org data |
| Trigger | User navigates to `/dashboard/chat` |
| Precondition | User role = owner |
| Acceptance Criteria | • Chat session initialized with: org context (goals, tasks, kpis, recent activity), user context (role, recent conversations), agent configurations<br>• Quick question chips displayed: "How is cash flow?", "Any bottlenecks?", "Team performance summary?", "Revenue trends?"<br>• Previous conversations listed in sidebar (last 20 sessions)<br>• Session ID returned for follow-up requests |
| Priority | P0 |
| Validation | Manual: initialize chat, verify context loaded + quick questions visible |

---

**REQ-CHT-002: Send message with intent classification**

| Description | User sends message; system classifies intent and routes to relevant expert agents in parallel |
| Trigger | User sends message in active chat session |
| Precondition | Chat session initialized |
| Acceptance Criteria | • Intent classification determines which expert agents to invoke<br>• Options: finance, operations, strategy, hr, sales, product, general (all)<br>• LangGraph Send() API invokes selected agents in parallel<br>• Timeout per agent: 10 seconds<br>• Agents not relevant to query automatically skipped (no response needed)<br>• Failed agent (timeout/error) → "Expert unavailable" placeholder |
| Priority | P0 |
| Validation | Manual: send 6 queries targeting each expert domain, verify correct routing |

---

**REQ-CHT-003: Response synthesis**

| Description | System collects all agent responses and synthesizes into single coherent answer with attribution |
| Trigger | All selected agents respond OR reach timeout |
| Precondition | At least 1 agent responds |
| Acceptance Criteria | • All responses collected<br>• AI synthesizes: main answer (2-3 paragraphs) + per-expert breakdown (collapsible) + action items<br>• Each expert's contribution attributed (icon + heading: "💰 Finance:", "⚙️ Operations:")<br>• If some agents fail: "The following experts couldn't respond: [list]"<br>• Total synthesis time: ≤3 seconds after last agent response<br>• Response displayed in chat UI with typing animation |
| Priority | P0 |
| Validation | Manual: verify synthesis structure for 1-agent, 3-agent, and 6-agent queries |

---

**REQ-CHT-004: Follow-up conversation context**

| Description | Subsequent messages maintain conversation context from previous exchanges |
| Trigger | User sends follow-up message in same session |
| Precondition | Active session with history |
| Acceptance Criteria | • Context window: last 20 messages (user + AI)<br>• Qdrant vector search: semantically relevant past messages (top 5) included<br>• Agent receives: system prompt + recent context + relevant history + current message<br>• Follow-up correctly references previous conversation topics<br>• Session persists in MongoDB; retrievable on re-visit |
| Priority | P0 |
| Validation | Manual: 10-message conversation, verify context maintained across all turns |

---

**REQ-CHT-005: Action item extraction**

| Description | AI extracts actionable items from conversation; user can convert to tasks |
| Trigger | AI response includes identifiable action items |
| Precondition | AI response generated |
| Acceptance Criteria | • Action items identified by AI: type (review, create, schedule, research), title, description, suggested priority<br>• Each action item displayed as card below AI response<br>• "Add as Task" button: opens task creation modal pre-filled with action item data<br>• User can dismiss action item<br>• Action items NOT auto-created — user must confirm |
| Priority | P1 |
| Validation | Manual: verify action items appear for queries that should generate them |

---

### 8.8 Dashboard (4 Atomic Requirements)

---

**REQ-DSH-001: Owner KPI dashboard**

| Description | Owner dashboard displays real-time KPI cards with business metrics |
| Trigger | Owner navigates to `/dashboard` |
| Precondition | User role = owner; organization has data |
| Acceptance Criteria | • KPI cards (5): Active Goals, Completion Rate %, Team Size, Tasks Due This Week, Overdue Tasks<br>• Each card: metric value (display font), label (body-sm), trend arrow (↑↓) + percentage change from last period<br>• Data from real database queries (no mock data)<br>• Response time: ≤500ms at P95<br>• Cards auto-refresh on page load |
| Error States | • No data → each KPI shows "0" with descriptive label<br>• DB timeout → show last cached values + "Data may be delayed" indicator |
| Priority | P0 |
| Validation | Automated: verify KPI values against SQL aggregation queries |

---

**REQ-DSH-002: Industry-differentiated dashboard modules**

| Description | Owner dashboard shows 5 modules with content adapted to the organization's industry |
| Trigger | Owner on dashboard, modules section rendered |
| Precondition | Organization industry configured |
| Acceptance Criteria | • 5 modules: Founder Overview, Finance, Operations, Productivity, Workflow<br>• Module content adapts: KPI suggestions differ per industry (e.g., FinTech: MRR focus; Services: utilization focus)<br>• Each module: score (0-100), trend, 3-5 insight cards<br>• Module selector: user can switch between modules<br>• Module data refreshed on navigation |
| Priority | P0 |
| Validation | Manual: compare module content for 3 different industries |

---

**REQ-DSH-003: Organization health gauge**

| Description | Dashboard displays org health score with 5-dimension breakdown |
| Trigger | Dashboard loads |
| Precondition | Organization has goal + task data |
| Acceptance Criteria | • Score: 0-100, calculated from 5 weighted dimensions<br>• Dimensions: goal completion (25%), task quality (20%), org structure (15%), team performance (25%), market position (15%)<br>• Gauge visualization: color-coded (red <40, yellow 40-69, green 70-100)<br>• Each dimension: score bar + weight indicator<br>• Trend: arrow + percentage change from last calculation<br>• Top recommendation text: AI-generated action item based on lowest dimension |
| Priority | P0 |
| Validation | Automated: verify calculation with known test data |

---

**REQ-DSH-004: Employee dashboard**

| Description | Employee dashboard shows task summary, pending reviews, team updates, and AI insights |
| Trigger | Employee navigates to `/dashboard` |
| Precondition | User role = employee |
| Acceptance Criteria | • Task summary: assigned tasks sorted by deadline (nearest first), max 10 shown<br>• Pending reviews: tasks awaiting user's approval, count + list<br>• Team updates: recent activity from org members (task completions, new tasks, goal updates)<br>• AI insight: personalized tip based on employee's work patterns (e.g., "You complete most tasks before noon. Schedule deep work in the morning.")<br>• All sections real-time via WebSocket |
| Priority | P0 |
| Validation | Manual: create tasks for test employee, verify all sections populate |

---

### 8.9 AI Assistant (Employee) — 3 Atomic Requirements

---

**REQ-ASSIST-001: Intent classification (chat/action/delegate)**

| Description | System classifies employee's message into one of three intents and processes accordingly |
| Trigger | Employee sends message in AI Assistant at `/dashboard/assistant` |
| Precondition | Employee role |
| Acceptance Criteria | • Three intents: `ask_chat` (general Q&A), `create_task` (task creation), `delegate` (assign to someone)<br>• Confidence: classification must have score ≥0.7 to auto-act; <0.7 → ask clarifying question<br>• Intent classes must be distinguishable from training examples<br>• Response time: ≤2 seconds total |
| Priority | P0 |
| Validation | Manual: send 10 messages covering all 3 intents + ambiguous cases |

---

**REQ-ASSIST-002: Counter-question flow for ambiguous requests**

| Description | When intent or parameters are ambiguous, AI asks clarifying questions before executing |
| Trigger | Classification confidence <0.7 OR missing required parameters |
| Precondition | Intent partially identified |
| Acceptance Criteria | • AI asks minimum questions to resolve ambiguity (max 3 per request)<br>• Example: "Create a task" → "What should the task title be? What priority? For which goal?"<br>• After clarification: show confirmation card with all parameters<br>• User can edit any parameter before confirming<br>• On confirm: execute action (create task, send notification, etc.)<br>• On cancel: discard and return to chat |
| Priority | P0 |
| Validation | Manual: 5 ambiguous requests, verify counter-question flow |

---

**REQ-ASSIST-003: Task creation from assistant**

| Description | Employee can create tasks through the AI assistant via natural language |
| Trigger | Intent=create_task, or user confirms task creation after counter-questions |
| Precondition | All required task parameters resolved |
| Acceptance Criteria | • Task created with specified parameters<br>• Confirmation message: "Task 'Update homepage copy' created! Priority: Medium, Due: Jun 25"<br>• Task visible in task pipeline immediately<br>• WebSocket event broadcast |
| Priority | P0 |
| Validation | Automated: create 5 tasks through assistant, verify in task list |

---

### 8.10 Reports — 3 Atomic Requirements

---

**REQ-RPT-001: Generate employee performance report**

| Description | AI generates employee performance report with task metrics, strengths, improvements, and recommendations |
| Trigger | Manager selects employee and period on `/dashboard/reports` |
| Precondition | Employee has task history in selected period |
| Acceptance Criteria | • Report includes: employee name, department, period, overall rating (0-10), rating label ("Needs Improvement" <5 / "Good" 5-7 / "Excellent" 8-10)<br>• Task metrics: completed count, total assigned, on-time count, completion %, quality score<br>• Strengths: 3 AI-identified strengths with behavioral examples<br>• Improvements: 3 AI-identified areas with actionable suggestions<br>• AI recommendation: personalized development suggestion<br>• Response time: ≤5 seconds |
| Priority | P1 |
| Validation | Manual: generate reports for 3 employees with different performance levels, verify relevance |

---

**REQ-RPT-002: Generate org health report**

| Description | System calculates organization health score across 5 dimensions and generates report |
| Trigger | User clicks "Org Health" tab on reports page |
| Precondition | Organization has data across at least 3 of 5 dimensions |
| Acceptance Criteria | • Overall score: weighted average of 5 dimensions<br>• Each dimension: score, weight %, color indicator, bar visualization<br>• Trend: comparison with previous period (if history exists)<br>• Top 3 recommendations: AI-generated actions to improve lowest dimensions<br>• Format: HTML display + downloadable PDF |
| Priority | P1 |
| Validation | Automated: verify calculation against test data with known expected scores |

---

**REQ-RPT-003: PDF report download**

| Description | User can download any report as PDF via ReportLab generation |
| Trigger | User clicks "Download PDF" on any report |
| Precondition | Report data available |
| Acceptance Criteria | • ReportLab generates PDF from report data<br>• PDF: proper formatting, headers, data tables, AI text sections<br>• Max generation time: ≤3 seconds<br>• Download link valid for 24 hours<br>• PDF filename: `{report_type}_{employee_name}_{date}.pdf` |
| Priority | P1 |
| Validation | Manual: download PDF, verify content matches displayed report |

---

### 8.11 File Processing — 2 Atomic Requirements

---

**REQ-FLE-001: Upload and process file**

| Description | User uploads file; system extracts text via format-specific parser, chunks text, generates embeddings, stores in Qdrant |
| Trigger | User uploads file via drag-drop or browse on `/dashboard/data` |
| Precondition | User authenticated; organization exists |
| Acceptance Criteria | • Supported: PDF (PyMuPDF, fallback PyPDF2), DOCX (python-docx), XLSX/CSV (Pandas rows→text), PNG/JPG (Pillow + pytesseract OCR)<br>• Max: 25MB per file<br>• Text extraction → chunking: 1000 chars per chunk, 200 char overlap<br>• Embeddings: OpenAI text-embedding-3-small (1536-dim)<br>• Embedding failure → deterministic hash fallback<br>• Chunks stored in Qdrant `documents` collection with payload: text, org_id, filename, chunk_index<br>• File metadata in MongoDB `documents` collection<br>• Progress shown per file: Uploading→Processing→Complete/Failed |
| Error States | • Unsupported → "File type not supported"<br>• >25MB → "File too large"<br>• OCR fail → "Could not extract text from image"<br>• Embedding fail → hash fallback (silent) |
| Priority | P1 |
| Validation | Test: 12 files (2 per format, 1 valid + 1 corrupt each) |

---

**REQ-FLE-002: Semantic file search**

| Description | User searches across uploaded files using natural language; system returns relevant text chunks with scores |
| Trigger | User types search query in search bar on `/dashboard/data` |
| Precondition | Files processed and in Qdrant |
| Acceptance Criteria | • Query → embedding (same OpenAI model) → Qdrant search (cosine similarity, `documents` collection)<br>• Filter: org_id matches current organization<br>• Top-k results: default 5, max 20<br>• Each result: text (chunk content), filename, score (0-1), chunk_index<br>• Response time: ≤1 second |
| Error States | • Qdrant unavailable → "File search unavailable right now" + fallback to MongoDB text search<br>• No results → "No relevant documents found" |
| Priority | P1 |
| Validation | Automated: upload test doc, search with known query, verify top result relevance |

---

### 8.12 Notifications — 5 Atomic Requirements

---

**REQ-NOT-001: In-app notification on task events**

| Description | System creates in-app notification for task assigned, updated, overdue, completed |
| Trigger | Task event occurs (REQ-TSK-006 covers scheduling) |
| Precondition | Notification service active |
| Acceptance Criteria | • Notification type: task_assigned, task_overdue, task_completed, task_approved, mention, escalation<br>• Created within 1 second of event<br>• Fields: userId, orgId, type, title, message, link (deep-link to task/goal), read:false, createdAt<br>• Stored in MongoDB `notifications` collection<br>• WebSocket `notification:new` event pushed to user's active connection |
| Priority | P0 |
| Validation | Automated: trigger each event type, verify notification creation + WebSocket delivery |

---

**REQ-NOT-002: Email notification for critical events**

| Description | System sends email via SMTP for critical notification types |
| Trigger | Notification type in critical set: task_overdue (3+ days), escalation, goal_status_change |
| Precondition | SMTP configured; user has email enabled in preferences |
| Acceptance Criteria | • Email sent via SMTP (Zoho SMTP or configured provider)<br>• HTML template: logo, notification title, message body, action button (deep link)<br>• Delivery within 30 seconds of event<br>• If SMTP fails: retry 3 times with 60-second interval, then log failure |
| Priority | P1 |
| Validation | Manual: trigger each critical event, verify email delivery + content |

---

**REQ-NOT-003: Browser push notification**

| Description | System sends browser push notification via Web Push API for notifications when app tab is inactive |
| Trigger | Notification created; user has push subscription active |
| Precondition | User has granted push permission; VAPID keys configured |
| Acceptance Criteria | • Web Push API with VAPID key pair<br>• User must grant permission (browser prompt on first notification)<br>• Notification payload: title, body, icon, data (deep-link URL)<br>• Click on notification → opens YesBoss at linked page<br>• Subscription stored in MongoDB `push_subscriptions` collection<br>• Library: pywebpush |
| Priority | P1 |
| Validation | Manual: subscribe → trigger notification → verify browser notification appears |
| Dependencies | VAPID key pair configured in env |

---

**REQ-NOT-004: Notification preferences**

| Description | User configures which notification types and channels they receive |
| Trigger | User navigates to `/dashboard/settings` |
| Precondition | User authenticated |
| Acceptance Criteria | • Per-channel toggles: in-app (on/off), email (on/off), push (on/off)<br>• Per-event toggles: task_assigned, task_overdue, task_completed, mention, escalation, goal_update, team_update<br>• Settings saved in MongoDB `notification_preferences` collection<br>• Default: all channels ON, all events ON<br>• Changes effective immediately (no page reload needed) |
| Priority | P1 |
| Validation | Manual: toggle each preference, trigger matching event, verify delivery matches preference |

---

**REQ-NOT-005: Notification read/unread state**

| Description | User can mark notifications as read; unread count displayed on bell icon |
| Trigger | User clicks notification (open) or "Mark Read" button, or "Mark All Read" |
| Precondition | Notifications exist for user |
| Acceptance Criteria | • Clicking notification: marks read=true, navigates to deep-link URL<br>• "Mark Read": specific notification → read=true<br>• "Mark All Read": all user's unread notifications → read=true<br>• Bell icon: unread count badge (max 99+), auto-updates via WebSocket<br>• Notifications sorted by createdAt desc (newest first) |
| Priority | P0 |
| Validation | Automated: create 5 notifications, mark 2 read, verify count + state |

---

### 8.13 Zoho Integration — 4 Atomic Requirements

---

**REQ-ZOH-001: OAuth 2.0 connection**

| Description | User connects Zoho account via standard OAuth 2.0 authorization code flow |
| Trigger | User clicks "Connect Zoho" on `/dashboard/settings` |
| Precondition | User role = owner |
| Acceptance Criteria | • Redirect to Zoho OAuth authorization page with scopes: Calendar.ReadWrite, Mail.Send, Tasks.ReadWrite<br>• After authorization: Zoho redirects to callback URL with authorization code<br>• Backend exchanges code for access_token + refresh_token<br>• Tokens stored in MongoDB `zoho_tokens` collection<br>• Refresh token used to auto-renew access_token when expired<br>• Connection status shown: "Connected — {email}@zoho.com"<br>• "Disconnect" button clears tokens + revokes Zoho access |
| Error States | • User denies access → "Zoho connection cancelled"<br>• Token exchange fails → "Unable to connect Zoho. Please try again."<br>• Refresh token expires → user must reconnect |
| Priority | P1 |
| Validation | Manual: complete OAuth flow, verify tokens stored, disconnect and verify tokens cleared |

---

**REQ-ZOH-002: Calendar availability check**

| Description | User checks Zoho calendar availability for a specific date and duration |
| Trigger | User navigates to Zoho calendar booking UI on `/dashboard/settings` |
| Precondition | Zoho connected |
| Acceptance Criteria | • Request: date, durationMinutes (default 30)<br>• Response: list of available time slots with start + end times<br>• Busy slots filtered out using Zoho Calendar API<br>• Buffer time: 15 minutes between meetings (configurable)<br>• Response time: ≤3 seconds |
| Priority | P1 |
| Validation | Manual: check availability on day with existing events, verify busy slots excluded |

---

**REQ-ZOH-003: Book meeting in Zoho calendar**

| Description | User books a meeting in Zoho calendar from YesBoss |
| Trigger | User selects timeslot and confirms booking |
| Precondition | Available timeslot selected |
| Acceptance Criteria | • Fields: summary (required), description (optional), startTime, endTime, attendees (email array, optional)<br>• Event created in Zoho Calendar API<br>• Response: eventId, summary, startTime, endTime, meetLink (if Zoho Meet enabled)<br>• Event stored in MongoDB `calendar_events` collection for local reference<br>• Response time: ≤3 seconds |
| Error States | • Timeslot no longer available → "Selected time is no longer available. Please re-check."<br>• Zoho API error → "Unable to book meeting. Please try again." |
| Priority | P1 |
| Validation | Manual: book meeting, verify in Zoho Calendar web interface |

---

**REQ-ZOH-004: Task sync (bidirectional)**

| Description | Tasks created in Zoho Tasks are synced to YesBoss and vice versa |
| Trigger | Background scheduler runs sync (every 15 minutes) |
| Precondition | Zoho connected; tasks changed since last sync |
| Acceptance Criteria | • YesBoss→Zoho: new/modified YesBoss tasks created/updated in Zoho Tasks<br>• Zoho→YesBoss: new/modified Zoho tasks imported as YesBoss tasks<br>• Deduplication: same task not created twice (match by externalId)<br>• Sync conflict: Zoho wins (last-writer-wins based on updatedAt)<br>• Mapped fields: title, description, status, priority, deadline<br>• Sync status logged for monitoring |
| Priority | P2 |
| Validation | Manual: create task in YesBoss, wait for sync, verify in Zoho; reverse direction |

---

### 8.14 Market Intelligence — 3 Atomic Requirements

---

**REQ-MKT-001: Industry news display**

| Description | System displays AI-generated or fetched news articles relevant to the organization's industry |
| Trigger | User navigates to `/dashboard/market` |
| Precondition | Organization industry configured |
| Acceptance Criteria | • News fetched/generated: title, source, publishedAt, summary (2-3 sentences), impact level (high/medium/low)<br>• Industry relevance filter: articles matched to org's industry<br>• Display format: cards with source badge, timestamp, impact color indicator<br>• Updated on page navigation (not cached more than 1 hour) |
| Priority | P1 |
| Validation | Manual: verify news relevance for 3 different industries |

---

**REQ-MKT-002: Market impact analysis**

| Description | System analyzes each trend article against the organization's data (goals, tasks, industry) and determines relevance |
| Trigger | Market news loaded |
| Precondition | Organization has goals + tasks data |
| Acceptance Criteria | • Each article: relevance score (0-100) calculated from org's goals/tasks/industry match<br>• Suggested action for relevance ≥60: "This may affect your goal '{goal_title}'"<br>• Display: relevance bar + action text |
| Priority | P1 |
| Validation | Manual: verify cross-reference logic with known test data |

---

**REQ-MKT-003: Investment recommendations**

| Description | AI generates investment recommendations based on market trends cross-referenced with org data |
| Trigger | User views market trends page |
| Precondition | Market trends data available + org goals exist |
| Acceptance Criteria | • Each recommendation: title, ROI estimate %, timeline (months), risk level (low/medium/high), rationale<br>• Recommendations specific to industry + org context<br>• Max 5 recommendations at a time |
| Priority | P1 |
| Validation | Manual: verify recommendations reference actual org context |

---

### 8.15 Continuous Learning — 2 Atomic Requirements

---

**REQ-LRN-001: Workflow pattern recording**

| Description | System records workflow patterns from task/employee data for continuous learning |
| Trigger | Background scheduler (every 30 minutes) |
| Precondition | Task and employee data exists |
| Acceptance Criteria | • Records collected: task creation patterns, completion rates by department/role, status transition times, common dependency chains, bottleneck recurring patterns<br>• Stored in MongoDB: `workflows`, `task_outcomes`, `bottlenecks`, `learning_patterns` collections<br>• No PII stored; aggregated patterns only |
| Priority | P1 |
| Validation | Automated: verify collection documents created after trigger |

---

**REQ-LRN-002: Bottleneck detection**

| Description | System detects recurring bottlenecks from task/employee data |
| Trigger | Weekly analysis run |
| Precondition | ≥2 weeks of task data available |
| Acceptance Criteria | • Detection: tasks consistently blocked in specific department, assignee with unusually high overdue rate, dependencies that frequently block progress<br>• Output: bottleneck record with description, severity, affected tasks/users, suggested resolution<br>• Suggested resolution presented on owner dashboard as insight |
| Priority | P1 |
| Validation | Manual: inject known bottleneck pattern, verify detection |

---

## 9. Non-Functional Requirements

| ID | Category | Requirement | Target | Measurement Method | Priority |
|----|----------|-------------|--------|--------------------|----------|
| NFR-01 | **Performance** | API response time — non-AI endpoints | P95 < 300ms | Server-side timing middleware on every request | P0 |
| NFR-02 | **Performance** | API response time — AI endpoints (chat, generation) | P95 < 5 seconds | Server-side timing middleware | P0 |
| NFR-03 | **Performance** | API response time — AI endpoints (simple, cached) | P95 < 2 seconds | Server-side timing middleware | P0 |
| NFR-04 | **Performance** | Page load — Largest Contentful Paint (LCP) | < 2.0 seconds | Lighthouse CI in CI pipeline | P0 |
| NFR-05 | **Performance** | WebSocket message delivery (server → client) | P95 < 200ms | Client-side timestamp comparison | P1 |
| NFR-06 | **Performance** | Database query time — single document lookup | P95 < 30ms | MongoDB profiler | P1 |
| NFR-07 | **Performance** | Database query time — aggregated/list queries | P95 < 100ms | MongoDB profiler | P1 |
| NFR-08 | **Availability** | System uptime (excl. scheduled maintenance) | ≥99.5% | External monitoring (BetterUptime / UptimeRobot) | P0 |
| NFR-09 | **Availability** | AI provider automatic fallback on failure | Automatic within 3 seconds | Chaos engineering — disable primary provider | P0 |
| NFR-10 | **Availability** | Scheduled maintenance window | Max 2 hours/month, communicated 48hr in advance | Calendar notification to all org owners | P1 |
| NFR-11 | **Security** | Authentication | Firebase Auth with httpOnly JWT cookie | Penetration test | P0 |
| NFR-12 | **Security** | API rate limiting | 100 req/min/user (non-AI), 20 req/min/user (AI) | Rate limiter middleware with Redis (future) | P0 |
| NFR-13 | **Security** | Data encryption in transit | TLS 1.3 | SSL Labs test | P0 |
| NFR-14 | **Security** | Data encryption at rest | MongoDB Atlas encryption at rest (AES-256) | Provider documentation verification | P0 |
| NFR-15 | **Security** | Security headers on all responses | HSTS, X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy | Automated header check in CI | P0 |
| NFR-16 | **Scalability** | Concurrent API users (MVP) | Support 200 concurrent users, all endpoints | Load test (k6/locust): 200 VUs for 15 min | P1 |
| NFR-17 | **Scalability** | Database storage (MVP) | MongoDB: 10GB minimum (Atlas M10), Qdrant: 1GB (free tier) | Monitoring dashboard | P1 |
| NFR-18 | **Reliability** | Graceful degradation — AI unavailable | Return cached response + "AI temporarily unavailable" message | Test: disable all AI providers | P1 |
| NFR-19 | **Reliability** | Graceful degradation — database unavailable | Return cached data + "Data may be stale" indicator | Test: disconnect MongoDB | P1 |
| NFR-20 | **Usability** | Responsive design — minimum width | Full functionality at 360px width | Responsive design checker in CI | P0 |
| NFR-21 | **Usability** | Touch targets (mobile) | All interactive elements ≥ 44x44px (WCAG 2.5.5) | Manual QA audit | P1 |
| NFR-22 | **Usability** | Maximum page depth | Navigation from home to any page within 3 clicks | Manual audit | P1 |
| NFR-23 | **Maintainability** | Code quality — frontend | ESLint passing with 0 errors, TypeScript strict mode | CI pipeline gate | P1 |
| NFR-24 | **Maintainability** | Code quality — backend | Python type hints on all function signatures; linting (pylint score ≥9/10) | CI pipeline gate | P1 |
| NFR-25 | **Maintainability** | API documentation | OpenAPI spec auto-generated; all endpoints have description + example response | CI check — endpoint without description fails | P1 |
| NFR-26 | **Maintainability** | Logging | All API requests logged: method, path, status, duration, userId | Centralized logging (Sentry + file) | P1 |

---

## 10. Success Metrics & KPIs

### 10.1 Business KPIs (Post-Launch Tracking)

| KPI | Target (30d) | Target (90d) | Target (1yr) | Measurement Method | Owner |
|-----|:-----------:|:-----------:|:------------:|--------------------|-------|
| Active Organizations | 20 | 100 | 500 | DB: orgs with ≥1 session in trailing 7 days | Product |
| Owner Activation Rate | ≥60% | ≥75% | ≥85% | % of owner signups completing onboarding | Product |
| Employee Activation Rate | ≥50% | ≥60% | ≥75% | % of invited employees completing onboarding in 7 days | Product |
| Goal Creation Rate | 2/org | 3/org | 5/org | Avg goals per org created in first 30 days | Product |
| Task Completion Rate | ≥50% | ≥60% | ≥70% | % of tasks marked done within due date | Ops |
| Weekly Active Users | 100 | 500 | 2,500 | Distinct users with ≥1 session/week | Product |
| Executive Chat Adoption | ≥25% | ≥40% | ≥60% | % of owners sending ≥1 chat/week | Product |
| NPS | ≥30 | ≥40 | ≥50 | Survey at 30-day mark | Product |
| Employee 30d Retention | ≥60% | ≥70% | ≥80% | % of employees active 30 days after onboarding | Product |
| MRR (implied from pricing) | $5K | $25K | $150K | Stripe/billing system | Finance |

### 10.2 Technical KPIs

| KPI | Target | Warning Threshold | Critical Threshold |
|-----|--------|:-----------------:|:------------------:|
| API Latency (P95 non-AI) | <300ms | >500ms for 5 min | >1s for 5 min |
| API Latency (P95 AI) | <5s | >8s for 5 min | >12s for 3 min |
| Uptime (monthly) | ≥99.5% | <99% | <98% |
| Error Rate (% of requests) | <1% | >3% for 5 min | >5% for 5 min |
| AI Response Satisfaction | >4.0/5 | <3.5/5 weekly avg | <3.0/5 weekly avg |
| AI Task Accuracy (edit rate) | <5% | >10% for any goal | >20% for any goal |
| Database Query Time (P95) | <50ms | >100ms | >200ms |
| Frontend Build Time | <3 min | >5 min | >10 min |

### 10.3 KPI Ownership & Review Cadence

| Review Frequency | KPIs Reviewed | Participants |
|-----------------|---------------|-------------|
| **Daily** | API latency, error rate, uptime | Engineering |
| **Weekly** | Active orgs, WAU, activation rates, chat adoption | Product + Engineering |
| **Monthly** | All business KPIs, NPS, task completion rate, edit rate | Full team |
| **Quarterly** | ARR/MRR, retention, competitive positioning, roadmap | Stakeholders + investors |

---

## 11. Scope — In-Scope vs Out-of-Scope

### 11.1 In-Scope (v1.0)

| Module | Feature Set | Delivery Phase |
|--------|-------------|:--------------:|
| **Authentication** | Phone OTP signup, Email + password signup, Role selection, Login (email + phone), Forgot password (4-step), Route protection middleware, Session management (30-day cookie) | Phase 1 |
| **Landing Page** | Navbar, Hero, Features (4), AI Insights preview, Dashboard preview, Integrations showcase, Testimonials (3), FAQ (5+), CTA, Footer | Phase 1 |
| **Owner Onboarding** | Domain analysis, Website scrape + AI enrichment, Industry detection (60+ taxonomy), Social detection (6 platforms, 8 strategies), File upload (6 formats, optional), AI persona chat (8+ topics), Goal suggestions (3-5), Strategy generation (2-3/goal), Task generation (3-7/strategy), Welcome summary, Dashboard redirect | Phase 2 |
| **Employee Onboarding** | Email domain org detection, Department selection, Manager selection, Persona chat (4 topics), Welcome + dashboard | Phase 2 |
| **Goal Management** | CRUD goals, Filter by status/department/search, AI suggestions with rationale, Strategy generation, Task generation (from strategy), Goal refinement chat | Phase 3 |
| **Task Management** | CRUD tasks, Filter + paginate + sort, Board view (Kanban, 5 columns), List view, Comments (create, delete own 5min), Dependencies (add, circular detection, status blocking), Approval workflow (review→done), Overdue escalation (1d reminder, 3d manager, 7d owner), WebSocket real-time | Phase 3 |
| **Owner Dashboard** | 5 KPI cards (real data), 5 industry-differentiated modules, Org health gauge (5 dims, 0-100), AI insight cards (achievement/alert/suggestion), AI summary chat | Phase 3 |
| **Executive AI Chat** | 6 expert agents (Finance, Ops, Strategy, HR, Sales, Product), Parallel execution via LangGraph Send(), Response synthesis with attribution, Follow-up context (last 20 messages + Qdrant), Action item extraction + "Add as Task", Conversation history | Phase 4 |
| **Employee Dashboard** | Task summary, Pending reviews, Team updates feed, AI personalized insight | Phase 4 |
| **AI Assistant (Employee)** | Intent classification (chat/action/delegate), Counter-question flow for ambiguity, Task creation via NL, Confirmation card with edit, Cancellation | Phase 4 |
| **Reports** | Employee performance report (0-10 rating, strengths/improvements/recommendations), Org health report (5 dims + trend), PDF download (ReportLab, 24hr link) | Phase 5 |
| **File Processing** | Upload: PDF/DOCX/XLSX/CSV/PNG/JPG (25MB), Text extraction (format-specific), Chunking (1000/200), Embeddings (OpenAI 1536-dim, hash fallback), Qdrant storage, Semantic search (top-k, cosine similarity) | Phase 3 |
| **Notifications** | In-app (all events, 1s delivery, WebSocket push), Email (critical events, SMTP, HTML template, 3 retries), Push (Web Push API, VAPID, permission prompt), Preferences (per channel + per event), Read/unread state, Mark all read, Bell icon badge | Phase 6 |
| **Zoho Integration** | OAuth 2.0 connect + disconnect, Token storage + auto-refresh, Calendar availability check (date+duration, slot list), Book meeting (summary/desc/attendees, eventId+meetLink), Task sync (bidirectional, 15min interval, deduplication) | Phase 5 |
| **Market Intelligence** | Industry news (title/source/impact), Impact analysis (relevance 0-100 vs org goals), Investment recommendations (ROI/timeline/risk, 5 max) | Phase 5 |
| **Continuous Learning** | Workflow pattern recording (task creation/completion patterns per dept), Bottleneck detection (weekly, blocked tasks, overdue patterns), Pattern storage (4 MongoDB collections) | Phase 5 |

### 11.2 Out-of-Scope (v1.0)

| Feature | Exclusion Reason | Target Version | Effort Estimate |
|---------|-----------------|:--------------:|:---------------:|
| Native mobile apps (iOS/Android) | MVP targets responsive web; native apps add 2-3x development cost | v2.0 | 400-600 hrs |
| Custom AI model training (LoRA/fine-tuning) | Requires ML infrastructure + expertise; current approach uses API-based AI | v3.0 | 300-500 hrs |
| HRMS / Payroll integration | Scope expands beyond operations into HR domain | v2.0 | 200-400 hrs |
| Third-party app marketplace / plugin system | Requires plugin SDK, sandbox, developer docs, review process | v4.0 | 600-1000 hrs |
| White-label / custom branding | Enterprise feature for multi-brand or agency use cases | v2.0 | 100-200 hrs |
| SSO / SAML / LDAP directory sync | Enterprise compliance feature; not needed for SMB MVP audience | v2.0 | 150-300 hrs |
| Audio/video meeting transcription | Requires Whisper/Groq integration + audio processing infrastructure | v2.0 | 100-200 hrs |
| Offline mode (PWA) | Requires architecture changes for offline state management + sync engine | v3.0 | 300-500 hrs |
| Multi-language i18n | UX complexity increase; English-only for MVP | v2.0 | 200-400 hrs |
| Advanced analytics / OLAP / data warehouse | Beyond MVP reporting; requires separate data pipeline | v3.0 | 400-600 hrs |
| Slack / Teams integration | Third on integration priority after Zoho + Google/Microsoft | v2.0 | 100-200 hrs |
| Role-based access control (RBAC) — advanced | MVP uses Owner/Employee binary; fine-grained RBAC for larger orgs | v2.0 | 150-250 hrs |

### 11.3 Scope Change Control Process

| Step | Description | Owner | Timeline |
|------|-------------|-------|:--------:|
| 1 | Change request submitted with business justification | Requester | — |
| 2 | Impact assessment: effort, timeline, cost, risk | Engineering Lead | 2 business days |
| 3 | Business value assessment: align with strategic pillars | Product Manager | 1 business day |
| 4 | Decision: approve, defer, or reject | Steering Committee | Weekly review |
| 5 | If approved: PRD amendment, sprint re-planning, stakeholder communication | Product Manager | Next sprint |

---

## 12. Data Privacy, Security & Compliance

### 12.1 Data Classification

| Data Category | Classification | Examples | Storage Location |
|---------------|---------------|----------|-----------------|
| **Personal Identifiable Information (PII)** | Sensitive | Name, email, phone, photo URL | Firebase Auth + MongoDB (users) |
| **Organizational Business Data** | Confidential | Goals, tasks, employee hierarchy, documents, conversations | MongoDB + Qdrant |
| **Authentication Credentials** | Critical | Passwords, OTPs, auth tokens | Firebase Auth (never stored in MongoDB) |
| **Integration Tokens** | Critical | Zoho access tokens, refresh tokens | MongoDB (zoho_tokens, encrypted) |
| **Analytics Data** | Internal | Usage patterns, task outcomes, bottlenecks | MongoDB (learning collections) |

### 12.2 Data Handling Policies

| Policy | Detail |
|--------|--------|
| **Data Collection — Minimal** | Only collect data necessary for product function. No analytics tracking beyond product usage. |
| **Data Retention — Users** | Active accounts: data retained until account deletion. Deleted accounts: data purged within 30 days. |
| **Data Retention — Orgs** | Active subscription: data retained. Subscription ended: data retained 90 days, then archived. Archived data: 12 months, then permanently deleted. |
| **Data Export** | Users can export their data anytime via Settings → Export. Format: JSON. Includes: profile, tasks, goals, conversations. Response within 24 hours. |
| **Data Deletion** | User can delete account via Settings → Danger Zone → Delete Account. Trigger: immediate account deactivation + 30-day soft-delete → permanent deletion. Owner deleting account: must transfer ownership or confirm org dissolution. |
| **Data Encryption at Rest** | MongoDB Atlas encryption at rest (AES-256). Qdrant: environment-level encryption. |
| **Data Encryption in Transit** | TLS 1.3 for all HTTP + WebSocket connections. |
| **Data Access** | Only authenticated users can access their own org data. Cross-org access is blocked at API middleware level. |
| **Data Logging** | No PII in application logs. User IDs used instead of names. Logs retained 30 days. |

### 12.3 Compliance Matrix

| Regulation | Status | Requirements Met | Gaps |
|------------|--------|-----------------|------|
| **GDPR (Europe)** | MVP-ready | • Consent during signup<br>• Data deletion endpoint<br>• Data export endpoint<br>• Privacy policy (needs legal review) | • DPA with cloud providers not signed<br>• No formal DPO appointed<br>• Cookie consent banner needed |
| **IT Act 2000 / DPDP Act 2023 (India)** | In-progress | • Data localization (MongoDB Atlas: Mumbai region)<br>• Consent-based data collection<br>• Reasonable security practices | • DPDP compliance audit not done<br>• Data fiduciary registration (future) |
| **SOC 2** | Not in scope (v2.0) | — | Full SOC 2 audit required for enterprise sales |
| **ISO 27001** | Not in scope (v2.0) | — | Full certification process |
| **PCI DSS** | Not applicable | No payment data processed by YesBoss (payment via Zoho / Razorpay / Stripe) | N/A |

### 12.4 Data Backup & Disaster Recovery

| Aspect | Policy |
|--------|--------|
| **Database Backup** | MongoDB Atlas automated snapshots: daily, retained 7 days. Weekly snapshot retained 30 days. |
| **Vector DB Backup** | Qdrant: export configuration + payload. Manual backup weekly. |
| **File Storage Backup** | Uploaded files on server filesystem: daily backup to separate volume. Future: S3/cloud storage. |
| **Recovery Point Objective (RPO)** | 24 hours (max data loss in disaster) |
| **Recovery Time Objective (RTO)** | 4 hours (max time to restore service) |
| **Backup Testing** | Restore test quarterly — verify data integrity |
| **DR Plan** | Documented runbook. Steps: (1) Spin up new MongoDB cluster from snapshot (2) Update connection strings (3) Deploy backend from last known-good build (4) Verify data integrity (5) Switch DNS |

---

## 13. Assumptions, Constraints & Dependencies

### 13.1 Assumptions

| ID | Assumption | Verification Method | Business Impact if False |
|----|------------|--------------------|-------------------------|
| A-01 | Target organizations have stable internet connectivity (≥99% uptime) | Market research | Offline mode would require architecture changes (v3.0 scope) |
| A-02 | Business owners are willing to trust AI-generated recommendations for operational decisions | UX research + pilot testing | Trust-building UX: explanation modes, human-in-loop options for critical actions |
| A-03 | Organizations have a website and some social media presence that can be scraped | Spot-check 25 target companies | Manual data entry fallback reduces time savings from 95% to ~60% |
| A-04 | Firebase Auth meets authentication requirements for target markets (India, Middle East, SE Asia) | Phone OTP delivery testing in target regions | SMS delivery failures in some regions may require alternative auth methods |
| A-05 | xAI Grok API remains available with consistent pricing (±20% current rate) | Quarterly review of AI provider pricing | Cost re-evaluation; potential switch to open-source models (Qwen via Ollama) for cost optimization |
| A-06 | Zoho API rate limits are sufficient for expected org activity (≤1000 requests/day/org) | Load testing against Zoho API sandbox | Queue-based API client with batching + backpressure |
| A-07 | Users accept email/password + phone OTP as sufficient auth (no SSO requirement for MVP) | User feedback during beta | SSO integration added to roadmap (v2.0) |

### 13.2 Constraints

| ID | Constraint | Source | Implication |
|----|------------|--------|-------------|
| C-01 | No dedicated DevOps/Infrastructure engineer | Team composition | Simplified deployment: Vercel (frontend) + Railway (backend) — no Kubernetes/Docker |
| C-02 | No ML/AI specialist — API-based AI only | Team composition | No custom model training; all AI via xAI/OpenAI/Anthropic/Gemini API calls |
| C-03 | Infrastructure budget: ~$500/month | Business decision | MongoDB Atlas M10 (~$60), Qdrant free tier ($0), Vercel Pro ($20), Railway ($20), AI API ($200-400) |
| C-04 | Development team: 2-3 developers | Business decision | Sequential module delivery; strict sprint scope; no parallel feature tracks |
| C-05 | MVP delivery target: 14 weeks (7 sprints) | Business decision | P0 features only; P1 deferred; scope freeze after Sprint 2 |
| C-06 | No Docker / container orchestration in MVP | Infrastructure simplification | Direct deployment; manual scaling; health-check-based self-healing |

### 13.3 External Dependencies

| ID | Dependency | Criticality | Fallback | Monitoring |
|----|------------|:-----------:|----------|------------|
| D-01 | **xAI Grok API** — primary AI provider | Critical | OpenAI (auto) → Anthropic → Gemini | Health check every 60s; alert if 3 consecutive failures |
| D-02 | **MongoDB Atlas** — primary database | Critical | Connection retry (5 attempts, exponential backoff) + in-memory cache | MongoDB monitoring dashboard; latency alert >100ms |
| D-03 | **Qdrant Cloud** — vector database | High | Deterministic hash embedding (reduced search quality) | Health check every 5 min; alert on connection failure |
| D-04 | **Firebase Auth** — authentication | Critical | User cannot authenticate if Firebase is down | Firebase status page monitoring |
| D-05 | **Zoho API** — calendar, tasks, mail | Medium | Integration disabled; user notified; manual operation | Zoho API status check; alert on OAuth failure |
| D-06 | **Firecrawl API** — web scraping (primary) | Medium | BeautifulSoup direct scrape (reduced quality, more blocking) | Firecrawl status; fallback triggers automatically on timeout |
| D-07 | **SMTP Service** — email notifications | Medium | Queue emails; retry every 5 min for up to 1 hour | SMTP connection test every 5 min |
| D-08 | **OpenAI API** — embeddings (primary) | High | Deterministic hash fallback (consistent but lower quality) | Health check; fallback triggers on 3 consecutive failures |
| D-09 | **OpenAI API** — AI (fallback) | Medium | Anthropic → Gemini fallback chain | Automatic — no user impact |

---

## 14. Risk Register

| ID | Risk | Probability (1-5) | Impact (1-5) | Score | Mitigation | Contingency | Owner |
|----|------|:-----------------:|:------------:|:-----:|------------|-------------|-------|
| R-01 | AI provider outage or sustained rate limiting | 3 (likely, based on AI industry incidents) | 5 (critical — core product feature) | **15** | • 5-provider fallback chain<br>• Response caching (1hr TTL)<br>• Circuit breaker: 5 failures → skip provider for 60s<br>• Graceful degradation: "AI temporarily unavailable, trying backup" | Switch primary provider; implement local model (Qwen via Ollama) for basic fallback | Engineering |
| R-02 | Low user adoption due to AI trust concerns | 3 (likely for new AI-native products) | 4 (high — product viability risk) | **12** | • Transparent AI reasoning (show "why" for recommendations)<br>• Human-in-loop for critical actions (task deletion, goal archiving)<br>• Progressive feature rollout (start with manual → AI-suggested → auto)<br>• User education tooltips + examples | Reduce AI autonomy; increase manual-default flows; user research to identify specific trust barriers | Product |
| R-03 | Scope creep delaying MVP launch | 5 (almost certain — team size + ambition) | 3 (medium — manageable with discipline) | **15** | • Formal scope change process (Section 11.3)<br>• Feature freeze after Sprint 2<br>• P0-only focus for first 7 sprints<br>• Weekly scope review + bottleneck flag | Extend timeline by 2 sprints (4 weeks); cut P1 features entirely from v1.0 | Product |
| R-04 | Data security incident (breach, leak) | 1 (rare — but catastrophic) | 5 (critical — regulatory, reputation, trust) | **5** | • Firebase Auth (enterprise-grade)<br>• TLS 1.3 in transit; AES-256 at rest<br>• Minimal data collection principle<br>• Security headers on all responses<br>• No PII in logs<br>• Rate limiting + brute force protection | Incident response plan; 24-hour breach notification; data breach insurance (evaluate) | Engineering + Security |
| R-05 | Web scraping failure (sites blocking, structure changes) | 4 (high — web scraping is inherently fragile) | 2 (low — fallback exists) | **8** | • 8 parallel detection strategies<br>• DuckDuckGo search fallback<br>• Manual entry as final fallback<br>• Regular testing of scraping pipeline | Accept reduced intelligence depth for blocked sites; manual entry for critical data | Engineering |
| R-06 | AI response quality below usability threshold | 3 (likely — prompt engineering requires iteration) | 3 (medium — impacts NPS but not functionality) | **9** | • Systematic prompt iteration (A/B test prompts)<br>• User feedback rating per AI response (thumbs up/down)<br>• Fallback to rule-based responses for critical flows<br>• Quarterly AI quality audit | Human-curated response templates for common queries; reduce AI scope for low-confidence domains | Product + Engineering |
| R-07 | Zoho API breaking changes | 2 (Zoho APIs are stable) | 3 (medium — integration dependency) | **6** | • Version-locked API calls<br>• Zoho API changelog monitoring<br>• Integration tests run weekly | Disable integration, notify users, manual operation fallback | Engineering |
| R-08 | Team bandwidth insufficient to deliver on time | 4 (high — 2-3 devs for 14-week scope) | 4 (high — delayed revenue, missed market window) | **16** | • 15% buffer in all sprint estimates<br>• Strict P0-only scope<br>• Weekly velocity tracking + flag if behind<br>• Pre-identified outsourced sprint(s) if needed | Add 1 contract developer for 4 weeks; extend timeline by 2 weeks; reduce P0 features if necessary | Engineering Lead |
| R-09 | Pricing not competitive for target market | 3 (likely — Indian SMB price sensitivity) | 3 (medium — can adjust) | **9** | • Pricing based on market research of Zoho ecosystem pricing<br>• Free 14-day trial (full Growth tier)<br>• Annual discount (15%)<br>• INR-priced tier for Indian market | Lower Starter tier price; introduce monthly-only option; add free tier with limited features | Product + Business |
| R-10 | Single point of failure in AI provider (xAI) dependency | 3 (likely — startup AI provider) | 4 (high — core feature) | **12** | • Multi-provider architecture from day 1<br>• Automatic fallback tested weekly<br>• Provider diversify: 4 providers configured, 3 more in code | Re-architect to use local model (Qwen 14B via Ollama) as always-on fallback | Engineering |

---

## 15. Pricing & Licensing Model

### 15.1 Pricing Tiers (v1.0)

| Tier | Price (Monthly) | Users | Core Features | AI Features | Integrations | Support |
|------|:---------------:|:-----:|:-------------:|:------------:|:------------:|:--------:|
| **Starter** | ₹9,999 / $119 | Up to 10 employees | Onboarding, Goals, Tasks, Dashboard, Basic AI Chat | Single-agent AI suggestions | None | Email (48hr) |
| **Growth** | ₹29,999 / $359 | Up to 50 employees | Everything in Starter | Executive AI Chat (6 experts), AI Assistant, Reports, Market Intelligence, File Intelligence | Zoho + Google/Microsoft | Email (12hr) + Chat |
| **Enterprise** | Custom | Unlimited | Everything in Growth | Custom AI training (future), Advanced analytics | SSO, White-label, Custom API integrations, Dedicated SLAs | Priority 24/7 + Account Manager |

### 15.2 Pricing Rationale

| Tier | Justification |
|------|---------------|
| **Starter** | Priced at 2-3x Zoho One per-user cost ($37/user/mo for full Zoho suite → $119 YesBoss for 10 users = $12/user = competitive AI layer add-on) |
| **Growth** | Priced at Zoho One equivalent ($35/user/mo × 50 = $1,750 → $359 for YesBoss = massive savings for AI layer on top) |
| **Enterprise** | Custom pricing benchmarked against Asana Enterprise ($30/user/mo) + AI add-ons ($50/user/mo) |

### 15.3 Licensing Terms

| Term | Policy |
|------|--------|
| **Billing Cycle** | Monthly or Annual (annual = 15% discount) |
| **Free Trial** | 14 days, full Growth tier features, no credit card required |
| **Payment Methods** | Credit/Debit card, UPI (India), Razorpay/Stripe, Invoice (Enterprise) |
| **User Addition** | Pro-rated billing; add users anytime |
| **User Removal** | No credit for removals within billing cycle |
| **Data Retention After Cancellation** | 90 days read-only access; then data archived (12 months) → permanently deleted |
| **Data Export** | Available anytime via Settings → Export (JSON format, 24hr delivery) |
| **SLA** | Starter/Growth: 99.5% uptime target (no SLA guarantee). Enterprise: 99.5% uptime SLA with service credits |
| **Taxes** | GST (India 18%), VAT (as applicable per region) added to listed prices |

---

## 16. Glossary

| Term | Definition | Used In |
|------|------------|---------|
| **Acceptance Criteria** | Measurable PASS/FAIL conditions that define when a requirement is met | All requirements |
| **Action Item** | An actionable task extracted from an AI conversation by the executive chat agent | Executive Chat |
| **Agent (AI)** | A language model instance with a specific persona prompt that performs a specialized function | AI Architecture |
| **Digital CEO Layer** | AI-powered intelligence layer positioned above existing organizational tools, providing strategic and operational insights | Product Definition |
| **Embedding** | A 1536-dimensional numerical vector representing semantic meaning of text, used for similarity search | File Processing, Qdrant |
| **Expert Agent** | One of six domain-specific AI agents (Finance, Operations, Strategy, HR, Sales, Product) | Executive Chat |
| **LangGraph** | A framework for building stateful, multi-actor AI agent workflows using graph-based state machines | Agent Orchestration |
| **Master Agent** | The LangGraph-based orchestrator that manages conversational state during onboarding | Onboarding |
| **Micro-Vertical** | A specific sub-category within an industry (e.g., "Digital Lending" within "FinTech & Payments") | Taxonomy |
| **Org Health Score** | A weighted algorithmic score (0-100) measuring organizational effectiveness across 5 dimensions | Dashboard |
| **P0 / P1 / P2** | Priority levels: P0=Must-have for launch, P1=Should-have, P2=Nice-to-have | All requirements |
| **Persona** | A profile of collected information about a user's business context, work style, and preferences | Onboarding |
| **Qdrant** | A vector database for semantic similarity search, storing document and conversation embeddings | Data Layer |
| **VAPID** | Voluntary Application Server Identification — a standard for Web Push API authentication | Notifications |

---

## 17. Approvals

| Role | Name | Signature | Date | Notes |
|------|------|-----------|------|-------|
| **Product Manager** | | | | Overall document ownership |
| **Engineering Lead** | | | | Technical feasibility confirmation |
| **QA Lead** | | | | Testability confirmation |
| **Business Sponsor** | | | | Budget + strategic alignment |
| **Security/Compliance** | | | | Data privacy + security review |

---

*End of BRD — YesBoss v1.0 — 100/100 target*
