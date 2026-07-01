# YesBoss — Complete Feature Flows (v4)

*Throughout this document, whenever an "agent asks the AI", it means the request goes to **MasterPromptEngine** — MasterPromptEngine looks up which agent is needed, gathers the required company data (org profile, goals, tasks, team, documents, website, past workflow patterns, employee work patterns) from the database and vector database, combines it with the agent's instruction prompt, and sends it to a Large Language Model (LLM). The system uses Grok by default, and also supports GPT-4o, Claude, Gemini, or Qwen as alternatives. The backend also uses a vector database (a special database that stores meaning fingerprints) and an AI embedding service (which converts text into those fingerprints) for search and pattern matching.*

---

## 1) Authentication
User fills signup form → System creates the account → User is taken to onboarding

User enters email + password → System logs them in → Taken to Dashboard

**Phone OTP flow:** Country code dropdown (default +91) + phone number → Firebase phone auth with invisible reCAPTCHA → 6-digit OTP input (individual boxes, auto-advance, paste support) → 60s timer, resend after 30s → On verify, user synced to backend

**Email + Password flow:** Email (RFC 5322 regex, max 254 chars) → Password with real-time strength bar (min 8 chars, 1 uppercase, 1 digit) → Firebase email/password auth → Role selection

**Forgot Password:** 4-step wizard: Send OTP → Verify 6-digit OTP (10-min expiry) → New password + confirm → Success with redirect to login

**Route protection (middleware):** Reads session cookies → Unauthenticated users redirected to login → Authenticated users on auth pages redirected to dashboard → Role mismatch shows 403 → Onboarding redirect when already complete

**Rate limiting:** 5 failed login attempts → 15-minute IP lockout. Warning at 3 attempts.

## 2) Organization Onboarding
User enters work email → System extracts the company domain (e.g., "company.com" from "john@company.com")

System tries to scrape the company website using multiple methods in order: first a paid scraping service, then a backup paid API, then direct web scraping, and finally uses default data if all fail. It also searches the web for the company's social media profiles (LinkedIn, Twitter, etc.) and tries to guess their social URLs.

**Personal domain detection:** Flags gmail.com, yahoo.com, outlook.com, etc. → prompts for company URL

**Scraping targets:** Home page, /about, /services, /team, /contact pages

**Social URL verification:** The scraped social URLs go to MasterPromptEngine → MasterPromptEngine calls the **SocialVerifier** agent → The agent asks the AI: "You are a strict social media verifier. Examine the candidate social media URLs and determine which are genuine company pages. Never guess or invent URLs." → AI returns only genuine links

**Industry detection:** The scraped website content goes to MasterPromptEngine → MasterPromptEngine calls the **CompanyAnalyst** agent → The agent asks the AI: "Identify the company name, primary industry, and micro-verticals from the website content" → AI returns the company's industry

**Company research:** The company name goes to MasterPromptEngine → MasterPromptEngine calls the **CompanyResearcher** agent → The agent asks the AI: "Given a company name, find and return verified information including description, industry, size, location, and website" → AI returns company details

**Goal suggestions for onboarding:** The industry info goes to MasterPromptEngine → MasterPromptEngine calls the **GoalSuggester** agent → The agent asks the AI: "You are a business consultant. Given an industry, suggest relevant strategic business goals and documents to upload" → AI suggests goals and documents

**Growth document suggestions:** The company's stage, industry, and existing documents go to MasterPromptEngine → MasterPromptEngine calls the **GrowthAdvisor** agent → The agent asks the AI: "You are an AI Growth Advisor. Based on the company's stage, industry, and existing documents, suggest what documents the owner should upload next to fill critical knowledge gaps" → AI suggests stage-specific documents

As the owner types during onboarding, the system suggests matching industries, micro-verticals, and company names using the AI

If the owner types a custom industry that wasn't suggested, the system saves it so future users will see it too. Custom industries are stored with usage count tracking.

**Industry taxonomy:** 60+ industries, each with 5-15 micro-verticals. Confidence thresholds: ≥0.8 auto-select, 0.6-0.79 highlight suggestion, <0.6 full manual selection.

**Social presence detection:** 6 platform cards (LinkedIn, Twitter, Instagram, Facebook, YouTube, and more) with status badges: Verified (✅ green), Suggested (⚠️ yellow), Not Found (✗ grey). User can confirm, edit, or add manually.

Owner fills in company name, size, and details → Clicks Save → Redirect to Dashboard

**Duplicate detection:** Checks for existing organizations by domain → If exists: "This company domain may already be on YesBoss. Would you like to join that organization?"

## 3) Employee Onboarding
Employee signs up → Chatbot starts with 8 topics: company description, industry, size, goals, challenges, workflows, decision making, growth

**Department selection:** Dropdown from org settings (default: Engineering, Product, Design, Marketing, Sales, HR, Finance, Operations)

**Manager selection:** Dropdown filtered by department. "Reports directly to founder" option if no manager in dept.

**Employee persona building:** The employee's answers go to MasterPromptEngine → MasterPromptEngine calls the **EmployeePersonaBuilder** agent → The agent asks the AI: "You are YesBoss, an AI teammate helping a new employee set up their workspace. Ask thoughtful, friendly questions about their work style, communication preferences, tools they use, challenges, and how they collaborate best. Each question builds on previous answers." → AI generates a personalized question → Employee answers → System saves the answer and also sends it to an AI embedding service which converts the meaning into a vector fingerprint → The fingerprint is stored in a vector database alongside fingerprints from other answers for future similarity search

For **owner onboarding**: The owner's responses go to MasterPromptEngine → MasterPromptEngine calls the **PersonaBuilder** agent (asks about leadership style, vision, challenges) and the **OnboardingAssistant** agent (explains features and guides through first goals). **MasterAgent** tracks the conversation state (what step we're on, how much we understand, what's missing) and generates the next question → Continues until complete. State machine: analyze → question → update → loop. Terminal condition: understanding >= 80%.

**8 base topics for owner:** 1. Top 3 business goals 2. Biggest challenge 3. Team structure 4. Decision-making 5. Growth priorities 6. Operational bottlenecks 7. Tech stack 8. Competitive landscape. Each topic = 10%, dynamic follow-ups add up to 2.5% each. Cap at 100%.

**4 employee persona questions:** 1. "What does a typical workday look like?" 2. "What tools do you use most?" 3. "What's your preferred communication style?" 4. "What's the biggest bottleneck in your work?" Skip option available.

## 4) Goals
**Create Goal:** Owner fills title, description, priority, timeline, assignees, reviewers → System checks if a department was given → If not, the goal details go to MasterPromptEngine → MasterPromptEngine calls the **DepartmentClassifier** agent → The agent asks the AI: "Classify this goal into one department from this list: Engineering, Marketing, Sales, Operations, Finance, Human Resources, Product, Design, Customer Support, R&D, Supply Chain, Legal. Reply with just one word." → AI picks the department → Goal is saved → Team is notified

**Goal Type:** Owner picks **short-term** (weeks) or **long-term** (quarters/years). Then picks **one-time** (has an end date) or **continuous** (ongoing). One-time goals get an optional end date.

**Goal Hierarchy:** Goals can link to a **parent goal** — creates a tree (e.g., "Increase Q3 Revenue" is parent of "Hire 2 Sales Reps"). Sub-goals show nested status.

**Default Goals:** When a new organization is created, the industry info goes to MasterPromptEngine → MasterPromptEngine calls the **DefaultGoalsAgent** → The agent asks the AI: "Generate 5 default goals for a company in this industry. Make them realistic and actionable." → AI returns goals → They appear with a "Default" badge. If AI fails, falls back to pre-written templates by industry. Owner can delete all default goals at once with a "Delete Defaults" button or manually re-generate anytime.

**AI Strategies:** Owner clicks "Generate Strategies" → System gathers company data (profile, goals, tasks, team, documents, website) plus past workflow patterns from the vector database → Everything goes to MasterPromptEngine → MasterPromptEngine calls the **GoalArchitect** agent → The agent asks the AI: "Generate 2-3 distinct strategic approaches for this business goal with name, description, timeline, risks, impact" → AI returns strategies → Owner sees them. Strategies include: key risks, expected impact, resources needed.

**Generate Tasks:** Owner picks a strategy → Clicks "Generate Tasks" → The strategy goes to MasterPromptEngine → MasterPromptEngine calls the **GoalArchitect** agent → The agent asks the AI: "Convert this strategy into 3 to 7 actionable tasks with title, description, and priority" → AI returns tasks → System resolves @mentions to real people → Tasks saved + broadcast to team + synced to Zoho if connected

**Goal Chat:** Owner types a question → System gathers goal context and sends to MasterPromptEngine → MasterPromptEngine calls the appropriate chat agent → AI responds with suggestions, success criteria, KPIs, probing questions, structured updates, task suggestions, and suggestion chips → Chat history is logged for learning

**Goal Breakdown:** Owner updates success criteria, KPIs, timeline, dependencies, and a breakdown history log (role/content/timestamp entries)

**Create Tasks From Suggestions:** Owner can bulk-create tasks from pre-made suggestions (title, description, priority) without AI

**Goal Review:** Assignee marks goal as complete → System changes status to pending review → Owner sees pulsing amber badge → Owner can **Approve** (status → completed, saves outcome for learning, records who approved/reviewed and when) or **Reject** with feedback (status → back to active, feedback saved, assignee is notified)

**State machine:** Active → Pending Review → Completed (approved) or Active → Pending Review → Active (rejected) or Active → Cancelled

**Goal Strategy Status tracking:** A field tracks whether strategies are "generated", "tasks_created", or "pending".

## 5) Tasks
**Create Task:** User fills title, description, assignees, reviewers, dependencies, priority, due date → System saves and does three things: notifies team, notifies assignee, syncs to Zoho

**Task Comments:** Team members can add comments → Comments are saved with the task → Deleted when task is deleted → Own comment deletable within 5 minutes of posting

**Task Approval:** Authorized person clicks "Approve" → Status changes to "approved" → Creator and assignees are notified

**Task Complete:** Assignee clicks "Complete" → Status changes to "completed" → Creator is notified

**Overdue Escalation:** Every 5 minutes, system checks for overdue tasks → If overdue: notify assignee → If overdue more than 3 days: notify manager → If overdue more than 7 days: notify owner with detailed email

**Deadline Reminders:** 1 day before due: remind assignee → 3 days before due: remind again

**Work Pattern Tracking (Frequency Agent):** Every task create/update, the task description goes to MasterPromptEngine → MasterPromptEngine calls the **FrequencyAgent** → The agent asks the AI: "You are a work-pattern analyst. Given this description, extract the work category (development, design, research, meeting, sales, support, etc.), complexity level (beginner/intermediate/advanced), and estimated hours (0.5-80)." → AI returns analysis → System saves a weighted-average record keyed by employee + work category, building a history of each person's proven skills.

**Smart Assignee Suggestions:** When typing a task title (≥3 characters), the system classifies the work category → Finds employees who have done similar work most often → Scores them on: experience in that category (40%), current workload (30%), completion speed (20%), department match (10%) → Shows top 5 in an AI Suggestions panel with match %, frequency, avg hours, and current active task count

**Auto Deadline Suggestion:** System computes a realistic deadline from the estimated hours (~4h → 1 day, ~8h → 2 days, ~40h → 1 week). A clickable "Auto-fill" button appears below the deadline field.

**Workload Conflict Warning:** System checks if the selected assignee already has >2 active tasks → system warns: "John already has 3 active tasks at 2x/week — this adds ~6h more"

**Task dependencies:** Circular dependency detection via graph traversal on save → reject. Self-dependency → reject. Max 10 dependencies per task. Auto-unblock when dependency transitions to done.

**Task status transitions:** todo → in_progress → review → done. Blocked can go from/to any state. Approval required if needsApproval=true.

## 6) Strategy Chat
**Two separate chat systems exist:**
1. **Strategy Chat** — Owner-only, multi-expert AI with session management
2. **AI Assistant** — Employee-facing with intent classification, counter-questions, and delegation

### Strategy Chat (Owner)

**When it runs:** Every time a CEO or owner types a question — because the system doesn't know which area the question covers, it runs all experts simultaneously so no perspective is missed.

**How the unified chat works:**
User types a question → System first tries the **Smart Ask** flow:
- Builds a snapshot of the organization (profile, goals, tasks, team, uploaded files, plus employee work patterns — so the AI knows who's good at what)
- Sends to MasterPromptEngine → MasterPromptEngine calls **IntentClassifier** → The agent asks the AI: "Classify this message as 'chat' if it's a general question, 'action' if they want to do something but need more details, or 'delegate' if they want to assign a task to someone" → AI returns the intent
- If **chat**: AI answers using company data, or asks for a specific file if data is missing
- If **action**: AI asks one question at a time to collect details (title, assignee, deadline, priority)
- If **delegate**: All gathered info goes to MasterPromptEngine → MasterPromptEngine calls **TaskPlanner** → The agent asks the AI: "Combine company data (org, goals, tasks, team, docs, patterns) with employee work patterns — create a goal and subtasks from this information" → System creates goal + tasks, assigns to the right person (using work pattern data to suggest who), notifies them
- If Smart Ask fails, falls back to full multi-expert mode

**Multi-Expert Mode (fallback):**
System gathers all company data (profile, goals, tasks, team, documents, website, past patterns, employee work patterns) from the database and vector database

The request goes to MasterPromptEngine → MasterPromptEngine calls the **StrategyAdvisor** agent first → The agent asks the AI: "You are an AI Strategy Advisor who helps CEOs think long-term. Identify strategic opportunities, risks, and market positioning." → AI provides strategic context

Then 6 expert agents are called simultaneously via MasterPromptEngine:
1. **FinanceAgent** → "You are a Finance Expert. Analyze financial health, costs, and revenue."
2. **OperationsAgent** → "You are an Operations Expert. Analyze operations and bottlenecks."
3. **WorkflowAgent** → "You are a Workflow Expert. Find automation opportunities."
4. **ForecastingAgent** → "You are a Forecasting Expert. Predict outcomes and forecast growth."
5. **IndustryIntelligenceAgent** → "You are an Industry Expert. Analyze market trends and competitors."
6. **OrgUnderstandingAgent** → "You are an Org Expert. Analyze team structure."

All 6 expert responses go back to MasterPromptEngine → MasterPromptEngine calls the **BusinessAnalyst** agent → The agent asks the AI: "Synthesize these expert analyses into one clear answer" → AI returns unified response → User sees main answer plus all 6 expert panels

**Cross-company benchmarks** are also injected into the context so the AI can reference industry averages.

**Session management:** Sidebar with all sessions (sorted by most recent), "New Chat" button, click to load history. Sessions can be fetched, created, and deleted.

**File features:** Upload and analyze a document in chat, or import from a URL.

**Experts list:** Fetchable list of each expert's id, name, description, and example questions.

### AI Assistant (Employee)

**Intended for employees.** Uses separate backend endpoints from Strategy Chat.

**Step 1 — Classify Intent:** User types a message → Goes to MasterPromptEngine → MasterPromptEngine calls the **IntentClassifier** agent → The agent asks the AI: "Classify this message as 'chat' if it's a general question, 'action' if they want to do something but need more details, or 'delegate' if they want to assign a task to someone" → AI returns the intent

**Step 2 — Chat Response:** If intent is "chat" → MasterPromptEngine sends the question with company context to the chat AI → AI checks data sufficiency (complete/partial/missing) → Answers directly, or asks for a specific document to fill the gap, or returns with upload requests

**Step 3 — Action or Delegate:** If intent is "action" or "delegate" → MasterPromptEngine calls the counter-question flow → AI asks counter-questions one at a time → Fields collected: title, description, assignee, priority, timeline, due_date, department → Each question has a type (text/person/select department/select priority/done), options, emoji, progress → Fields gathered until all done → User's input is smart-parsed ("urgent" = high priority, "Friday" = next Friday's date)

**Step 4 — Delegate execution:** All gathered info goes to MasterPromptEngine → MasterPromptEngine calls **TaskPlanner** → The agent asks the AI: "Combine company data (org, goals, tasks, team, docs, patterns) with employee work patterns — create a goal and subtasks from this information" → Backend creates goal + tasks in one shot → Returns goal, task, sub-tasks, and assignee info → User sees confirmation with delegation results

**Step 5 — People search:** Search team members by name, email, role, or department — useful when delegating

**Session management (Assistant):** Separate from Strategy Chat. Sessions can be created, fetched, deleted, renamed, and messages added. Clarifying questions and booking parameters tracked per session.

**Assistant context:** Includes user_email, organization_id, organization_name, document summary, role, analyzed documents count, employee count, goal count, task count.

**Assistant states:** idle → analyze intent → chat/action/delegate questioning → gathering → creating → done

## 7) Meetings
Owner clicks "Upload Meeting" → Two options:

**Tab 1 — Upload File:** Owner selects a recording file or types notes → System extracts text from the file

**Tab 2 — Import from Zoho Calendar:** Owner picks a meeting already synced from Zoho → No file upload needed

**Title autocomplete:** As the owner types the meeting title, the system suggests their own previously used titles (filtered by that owner only)

**Participant multi-select:** Owner types in the participants field → System searches the org chart by name → Shows matching team members with name, department, and role → Owner selects one or more → They appear as chips with a remove button → Their email addresses are stored as the participant list

Both cases: The meeting transcript + participant list go to MasterPromptEngine → MasterPromptEngine calls the **MeetingTaskExtractor** agent → The agent asks the AI: "Extract actionable tasks from this meeting. For each task give: title, description, who should do it (exact full name from notes, matching participants list), priority, and deadline." → AI returns tasks → System resolves assignees through three attempts: 1) exact match by name/email, 2) first + last name match, 3) first name only match → If none match, participant fallback by email → Tasks saved, broadcast, synced to Zoho → Owner notified: "N tasks created from your meeting 'Meeting Title'"

**MoM auto-reminder:** When a meeting ends, the scheduler checks if MoM was uploaded. If not, sends a push notification to attendees.

## 8) File Processing
User uploads a file → The backend extracts the raw text using different methods depending on type

**Step 1 — Chunk:** Text is split into smaller overlapping pieces (1000 char chunks with 200 char overlap)

**Step 2 — Embed:** Each piece is sent to an AI embedding service to create a vector fingerprint

**Step 3 — Store:** All fingerprints stored in vector database alongside original text

**Step 4 — Deep Analysis:** The extracted text goes to MasterPromptEngine → MasterPromptEngine calls the **DocumentAnalyst** agent → The agent asks the AI: "Extract document category, key entities, metrics, decisions, action items, and question-answer pairs." → AI returns structured analysis → Saved

**Document insights:** Status (pending/completed/failed), summary, document category, key metrics (name, value, context), key entities (people, companies, products, amounts), decisions, action items, QA pairs

**Document context aggregation:** All documents for an org aggregated into: summary, metrics, category breakdown, total/analyzed/pending document counts

**Document question answering:** User asks a question about uploaded documents → Goes to MasterPromptEngine → Searches vector database for relevant document chunks → AI generates answer with sources (filename, excerpt, score)

**AI document suggestions:** Company details (domain, name, industry, micro-vertical, size, existing documents) go to MasterPromptEngine → MasterPromptEngine calls the document suggestion agent → AI returns suggestions with title, category, why it helps, example contents, priority

**Business context extraction:** Uploaded documents go to MasterPromptEngine → AI extracts: stage, business model, primary growth lever, key risks

**Industry-specific document suggestions:** 60+ industries each have tailored document suggestions (e.g., Fintech → "Transaction flow diagrams", Healthcare → "Patient flow diagrams"). Also 50+ micro-verticals with specific suggestions.

**DOCX document template generator:** Generates editable .docx templates with: overview section, key details section (AI category prompts: financial/products/customers/operations/strategy/team/marketing/legal/technology/general), metrics table, sign-off checklist.

**Searching later:** User types a query → System converts to vector fingerprint → Searches vector database for closest matches → Returns ranked results

**Fallback chain:** PDF → DOCX → XLSX/CSV → Images (OCR) → Embedding service → deterministic hash fallback.

## 9) Dashboard
User lands on Dashboard → System fetches KPIs, goals, tasks, meetings → Displays in cards, charts, and lists

**Owner Dashboard:**
- 5 KPI cards in a row: Active Goals, Completion Rate %, Team Size, Tasks Due This Week, Overdue Tasks (each with trend arrow)
- Module selector tabs: Founder, Finance, Operations, Productivity, Workflow. Each module shows score (0-100), trend, 3-5 insight cards.
- Right sidebar: Org health gauge (semicircular, 0-100, red <40/yellow 40-69/green 70-100) + 5 dimension bars with scores + top recommendation
- Bottom: AI summary chat — "Ask anything about your business..."
- AI Insight cards: 3 types — Achievement (green border), Alert (red), Suggestion (blue)

**Employee Dashboard:**
- Task summary: assigned tasks sorted by deadline (nearest first, max 10)
- Pending reviews: count + list of tasks awaiting approval
- Team updates: recent activity feed
- AI insight: personalized tip card from work patterns

**KPI Suggestions:** Goals, tasks, and team data go to MasterPromptEngine → MasterPromptEngine calls the **KpiAnalyst** agent → The agent asks the AI: "You are a business analytics expert. Given goals, tasks, and team data, suggest the most relevant KPIs to track" → AI suggests KPIs → Displayed

**KPI Store (client-side):** KPI suggestions are cached per org with accept/dismiss/add/remove operations. Suggestions show at intervals (default 5 min). Sources: "ai", "document", "goal", "progress". Each accepted KPI has id, key, title, category, trigger source, accepted timestamp.

**Industry Benchmarks Card:** Shows cross-company benchmarks: completion rate, avg goal duration, delay rate, common delay reasons (compared against anonymized data from similar companies)

**Dashboard insights & modules:** Fetched per module. Module metrics include score, trend, and insight cards.

## 10) Market Trends
Owner clicks "Generate Trends" → Industry info goes to MasterPromptEngine → MasterPromptEngine calls the **MarketAnalyst** agent → The agent asks the AI: "You are a market research analyst. Generate realistic market news articles for this industry." → AI returns articles with title, source, url, published date, category, image url, growth impact

For each article, the trend data goes back to MasterPromptEngine → MasterPromptEngine calls the **MarketAnalyst** agent → The agent asks the AI: "How does this trend affect a company in this industry? What are the opportunities, threats, and actions?" → AI returns impact analysis

**Deep Market Impact Analysis:** System compares each trend against the company's actual goals and tasks → Calculates alignment score

## 11) Reports
**On-Demand Reports:** Owner selects period (weekly/monthly/quarterly) and sections → System gathers data → Everything goes to MasterPromptEngine → AI writes a summary → PDF created → User downloads

**Report formats:** PDF (default) and DOCX supported

**Auto-Generated Reports:**
- **Weekly Employee Reports (every Monday):** For each employee, calculates task completion rate → Employee's frequency data (categories worked, avg completion hours, complexity level) goes to MasterPromptEngine → AI compares with org averages (faster/slower) → AI writes personalized feedback referencing these patterns → PDF sent via email
- **Monthly Org Health Report (1st of month):** System calculates health score (0-100) across departments → Team-wide pattern analysis (top performers per category, overloaded employees, multi-category workers, active tasks per employee) goes to MasterPromptEngine → AI writes strategic recommendations → PDF sent to owner

**Weekly Owner Briefing (every Monday):** System generates a one-paragraph executive briefing for the owner containing:
- Overloaded employees (doing >5x/week across categories)
- Performance trends (who's improving/slipping with % change)
- Top performers by work category
- Skill gaps detected (goals requiring categories no one has proven)
- Key numbers: active goals, completion rate, overdue/escalated counts
- AI-written sharp summary highlighting the most critical items
- Delivered as a notification with link to reports

## 12) Continuous Learning
The system learns five ways:

**Way 1 — Recording:** When a task is completed or goal finishes → System saves a record with details: what happened, how long it took, who did it, department, delay info, efficiency score → Also creates a vector fingerprint → Stored in vector database for similarity search

**Way 2 — Frequency Tracking (real-time):** Every task/goal create/update, the description goes to MasterPromptEngine → MasterPromptEngine calls the **FrequencyAgent** → The agent asks the AI: "You are a work-pattern analyst. Given this description, extract the work category (development, design, research, meeting, sales, support, etc.), complexity level (beginner/intermediate/advanced), and estimated hours (0.5-80)." → AI returns analysis → Saves per-employee running averages using a weighted formula (recent work counts more) → Builds a persistent profile of each person's work patterns: "John does development 3x/week at advanced level, avg 8h completion"

**Way 3 — Pattern Matching:** Periodically, system collects recent records → Goes to MasterPromptEngine → MasterPromptEngine calls the **ContinuousLearning** agent → The agent asks the AI: "Analyze these workflow patterns and identify bottlenecks. What is causing delays?" → AI returns bottleneck analysis → Saved

**Way 4 — Aggregated Trends (cross-company):** System calculates anonymized industry averages: completion rate, avg duration per goal type, delay rate, top delay reasons → Aggregated into industry benchmarks → Fed into Strategy Chat so AI can say "72% completion rate in your industry"

**Way 5 — Performance Trends (weekly):** Every Monday, system aggregates task outcomes by employee per week → Stores 8-week history of avg completion hours and tasks completed per employee → Computes trend direction: **improving** (>5% faster over 8 weeks), **slipping** (>5% slower), or **stable** → Powers the weekly owner briefing

## 13) Notifications
When something happens → System saves a notification, checks user's preferences, checks email rate limit (max 50/hour per org)

**Channels:** In-app (WebSocket), Email (SMTP with HTML template, retry 3× at 60s), Browser push (Web Push API with VAPID keys)

**Toast notifications:** Slides in from top-right, auto-dismiss 5s, type-colored border. Max 3 stacked. Click → navigate to related page + mark read.

**Preferences:** Each user can toggle per channel (Email, Browser popup, In-app popup, Sound) and per type (task_assigned, task_overdue, task_completed, mention, escalation, goal_update, team_update)

**Preferences UI:** Dashboard → Settings → Notification preferences tab with per-type toggles, quiet hours start/end

**Digest:** Daily or weekly summary email option

**Email Templates (6 types):** Default, Task Deadline Reminder, Task Overdue, Escalation to Owner, Weekly Digest, Monthly Report

**Push notification registration:** Registers service worker → fetches VAPID public key → subscribes via browser push API → sends subscription to backend → Unsubscribe also supported

**Notification store:** Fetch with filters (read, type, limit, organization), mark as read, mark all as read, delete, unread count

## 14) Zoho Integration
**Connect:** User clicks "Connect Zoho" → System creates a login URL → Popup opens → User logs in and approves → Zoho sends code → System exchanges for tokens → Saves → Shows "Connected" → Connection status polled via popup close detection

**Automatic Token Refresh:** Before every Zoho call, system checks token validity → Refreshes if expired

**Task Sync (YesBoss ↔ Zoho):** Bidirectional sync every 5 minutes → Tasks created/updated/deleted in either system reflected in the other. Deduplication by external ID. Conflict resolution: Zoho wins (last-writer-wins).

**Calendar Sync:** Every 15 minutes → Powers "Import from Zoho Calendar" in Meetings

**Check Availability:** User @mentions people, picks date/time → System checks each person's Zoho Calendar for conflicts

**Book Meeting:** Creates event on user's Zoho Calendar and each attendee's calendar

**Disconnect:** Clears tokens, revokes access

## 15) Org Chart
Owner goes to Team page → Adds members one by one (name, email, role, department, manager) or uploads a CSV → Saved. Members stored with tree structure (parent-child hierarchy).

**Org tree:** Returns hierarchical tree with children. Members list also available. CRUD operations: add, update, delete.

Later, when anyone types @name in any task, goal, or meeting → System finds that person's email and assigns to them

## 16) Skill Gap Detection
Owner can check for skill gaps via the learning system:

- System collects all active goals and their departments
- For each goal, analyzes its tasks to determine what work categories are needed
- Compares against each employee's proven work patterns (from frequency tracking)
- Returns:
  - **Goal-level gaps:** goals that require categories no one has pattern history for
  - **Department-level gaps:** departments with goals in categories their employees haven't demonstrated
  - **Overloaded employees:** people carrying too many distinct categories (>5x/week total)
- This data feeds into the weekly owner briefing and helps owners decide where to hire or upskill

## 17) Multi-Owner Private Workspaces
One company can have multiple owners, each with their own private workspace.

**What stays shared:** Company name, industry, integrations, team member list, market intelligence

**What becomes private per owner:** Goals, tasks, reports, check-in notes, chat sessions

**Flow:** Owner signs up → System checks if domain exists → If yes, joins as co-owner → Fresh dashboard with own goals/tasks → Other owner's data is completely invisible

**Owner detection:** System checks if a user is the primary owner or in the co-owners list before allowing owner-level actions. A rank field distinguishes primary from co-owners.

## 18) Periodic Owner Check-Ins
On a configurable schedule (default: every 7 days), the system asks owners to review their goals.

**Check-In Modal** shows all active goals with progress, staleness, and status badges (On Track / Behind / Stale). Owner can flag as blocked or mark reviewed. Saves to learning system.

---

## Summary: All Agents and What They Say

| Agent | What It Asks the AI |
|---|---|
| **SocialVerifier** | "You are a strict social media verifier. Examine the candidate social media URLs and determine which are genuine company pages. Never guess or invent URLs." |
| **CompanyAnalyst** | "Identify the company name, primary industry, and micro-verticals from the website content" |
| **CompanyResearcher** | "Given a company name, find and return verified information including description, industry, size, location, and website" |
| **GoalSuggester** | "You are a business consultant. Given an industry, suggest relevant strategic business goals and documents to upload" |
| **GrowthAdvisor** | "Based on the company's stage, industry, and existing documents, suggest what documents the owner should upload next to fill critical knowledge gaps" |
| **EmployeePersonaBuilder** | "Ask thoughtful, friendly questions about their work style, communication preferences, tools, challenges, and how they collaborate best. Each question builds on previous answers." |
| **DepartmentClassifier** | "Classify this goal into one department from this list. Reply with just one word." |
| **GoalArchitect** (strategies) | "Generate 2-3 distinct strategic approaches for this business goal with name, description, timeline, risks, impact" |
| **GoalArchitect** (tasks) | "Convert this strategy into 3 to 7 actionable tasks with title, description, and priority" |
| **FrequencyAgent** | "You are a work-pattern analyst. Given this description, extract the work category, complexity level, and estimated hours." |
| **DefaultGoalsAgent** | "Generate 5 default goals for a company in this industry. Make them realistic and actionable." |
| **StrategyAdvisor** | "You are an AI Strategy Advisor who helps CEOs think long-term. Identify strategic opportunities, risks, and market positioning." |
| **FinanceAgent** | "You are a Finance Expert. Analyze financial health, costs, and revenue." |
| **OperationsAgent** | "You are an Operations Expert. Analyze operations and bottlenecks." |
| **WorkflowAgent** | "You are a Workflow Expert. Find automation opportunities." |
| **ForecastingAgent** | "You are a Forecasting Expert. Predict outcomes and forecast growth." |
| **IndustryIntelligenceAgent** | "You are an Industry Expert. Analyze market trends and competitors." |
| **OrgUnderstandingAgent** | "You are an Org Expert. Analyze team structure." |
| **BusinessAnalyst** | "Synthesize these expert analyses into one clear answer" |
| **IntentClassifier** | "Classify this message as 'chat', 'action', or 'delegate'" |
| **TaskPlanner** | "Combine company data (org, goals, tasks, team, docs, patterns) with employee work patterns — create a goal and subtasks from this information" |
| **MeetingTaskExtractor** | "Extract actionable tasks from this meeting. For each task give: title, description, who should do it (exact full name from notes), priority, and deadline." |
| **DocumentAnalyst** | "Extract document category, key entities, metrics, decisions, action items, and question-answer pairs." |
| **KpiAnalyst** | "You are a business analytics expert. Given goals, tasks, and team data, suggest the most relevant KPIs to track" |
| **MarketAnalyst** | "You are a market research analyst. Generate realistic market news articles for this industry." |
| **ContinuousLearning** (bottlenecks) | "Analyze these workflow patterns and identify bottlenecks. What is causing delays?" |
| **ContinuousLearning** (trends) | "Based on this data, what patterns do you see? How can the company improve?" |

## Summary: Storage Areas

| Area | Purpose |
|---|---|
| Users / Organizations / Employees | Core identity and company structure with role-based access (owner/employee), Firebase UID, co-owners list |
| Goals / Tasks | Business objective and execution tracking with types (short-term/long-term), duration (one-time/continuous), hierarchy (parent/child), review state, default badge |
| Workflows / Task Outcomes / Bottlenecks | Process recording and bottleneck detection |
| Learning Patterns / User Patterns | Pattern learning per user and organization |
| Employee Frequencies | Per-assignee work frequency and patterns by category (running weighted average) |
| Goal Outcomes | Anonymized goal completion data for cross-company learning |
| Industry Intelligence | Aggregated benchmarks per industry |
| Performance History | Weekly snapshots of per-employee avg completion hours for trend tracking |
| Org Chart Members | Team hierarchy with department, role, manager (tree structure with parent-child) |
| Notifications / Notification Preferences / Push Subscriptions | Multi-channel notification system (in-app, email, push) with VAPID keys, per-type toggles, quiet hours |
| Documents / Uploads | File storage with vector embeddings, document insights (category, entities, metrics, decisions, QA pairs), document context aggregation, AI question answering |
| Meetings / Check-Ins | Meeting minutes, task extraction (with multi-attempt assignee resolution), periodic owner reviews |
| Chat Sessions (Strategy Chat) / Assistant Sessions (Assistant) | Conversation history for Strategy Chat (owner) and AI Assistant (employee), with separate session management, clarifying questions, booking params |
| Reports | Generated PDF report cache and metadata, both PDF and DOCX format support |
| Zoho Tokens / Calendar Events | Zoho integration tokens (with auto-refresh) and synced calendar data |
| Dashboard Modules / Insights | Per-module scores (founder/finance/operations/productivity/workflow), trend data, AI insights |
| KPI Suggestions | Client-side cache of AI-suggested KPIs per org with accept/dismiss/add/remove, interval-based showing |
| Taxonomies | Custom industry and micro-vertical taxonomies with usage tracking |
| User Preferences | Language, timezone, dateFormat, timeFormat, notification toggles, dashboardLayout, compactMode |

## Summary: Background Tasks

| Task | When | What It Does |
|---|---|---|
| Deadline Reminders | Every ~60 min | Checks for tasks due tomorrow, due in 3 days, overdue, overdue >3 days (escalate to manager), overdue >7 days (escalate to owner) |
| Daily Digests | Daily at 8 AM | Sends daily email summary to opted-in users |
| Auto Reports | Weekly (Mon 9 AM) and Monthly (1st 9 AM) | Generates employee performance reports + org health report + weekly owner briefing (overloaded employees, performance trends, top performers, skill gaps, key numbers) |
| Performance Aggregation | Weekly (Mon) | Aggregates task outcomes into performance history for 8-week trend tracking |
| Owner Check-Ins | Every ~60 min | Finds orgs due for check-in, sends notification with goal summary |
| Cross-Company Aggregation | Daily at 3 AM | Aggregates goal outcomes into industry benchmarks |
| Zoho Sync | Every 5 min (tasks), every 15 min (calendar) | Bidirectional sync of tasks and calendar events |
| MoM Reminders | Every ~60 min | Detects ended meetings without uploaded minutes, sends reminder to attendees |

---

## How MasterPromptEngine Works

When any feature needs AI help, the flow is always:

1. **Feature gathers data** (org profile, goals, tasks, team, documents, website, past patterns, employee work patterns)
2. **Data goes to MasterPromptEngine**
3. **MasterPromptEngine looks up which agent is needed**
4. **MasterPromptEngine has:**
   - A map of each agent → which company data it requires
   - A store of each agent's instruction (the persona prompt)
5. **MasterPromptEngine fetches the required data** from the database + vector database
6. **MasterPromptEngine combines data + agent instruction** and sends to the AI
7. **AI returns a response** → sent back to the feature

**Employee work patterns are always included** in the "team" context — every AI call that uses team data sees each person's proven categories, frequency, and complexity levels. This means the AI naturally suggests appropriate task assignments and goal breakdowns based on who's actually done similar work before.

**AI provider fallback chain:** xAI Grok (primary, 30s timeout) → OpenAI GPT-4o (30s) → Anthropic Claude (30s) → Gemini Pro (30s) → Qwen via Ollama (60s). Circuit breaker: 5 consecutive failures → skip 60s. Embedding fallback: deterministic hash if all providers fail.

**Caching:** In-memory cache with LRU eviction (max 1000 entries, 60s TTL default). Redis migration path ready.

**Error handling:** Every endpoint returns structured response with error code, field (for validation), timestamp, and trace ID. Error codes include auth failures, validation errors, resource not found, AI provider down, file too large, Zoho API error, and more.
