# YesBoss — Complete Feature Flows (v4)

*Throughout this document, whenever an "agent asks the AI", it means the backend calls a Large Language Model (LLM) — the system uses Grok by default, and also supports GPT-4o, Claude, Gemini, or Qwen as alternatives. The AI reads the agent's instruction plus any relevant company data and returns a response. The backend also uses a vector database (a special database that stores meaning fingerprints) and an AI embedding service (which converts text into those fingerprints) for search and pattern matching.*

---

## 1) Authentication
User fills signup form → System creates the account → User is taken to onboarding

User enters email + password → System logs them in → Taken to Dashboard

## 2) Organization Onboarding
User enters work email → System extracts the company domain (e.g., "company.com" from "john@company.com")

System tries to scrape the company website using multiple methods in order: first a paid scraping service, then a backup paid API, then direct web scraping, and finally uses default data if all fail. It also searches the web for the company's social media profiles (LinkedIn, Twitter, etc.) and tries to guess their social URLs.

**SocialVerifier** agent asks the AI: "You are a strict social media verifier. Examine the candidate social media URLs and determine which are genuine company pages. Never guess or invent URLs." → AI returns only genuine links

**CompanyAnalyst** agent asks the AI: "Identify the company name, primary industry, and micro-verticals from the website content" → AI returns the company's industry

**CompanyResearcher** agent asks the AI: "Given a company name, find and return verified information including description, industry, size, location, and website" → AI returns company details

**GoalSuggester** agent asks the AI: "You are a business consultant. Given an industry, suggest relevant strategic business goals and documents to upload" → AI suggests goals and documents

**GrowthAdvisor** agent asks the AI: "You are an AI Growth Advisor. Based on the company's stage, industry, and existing documents, suggest what documents the owner should upload next to fill critical knowledge gaps" → AI suggests stage-specific documents

As the owner types during onboarding, the system suggests matching industries, micro-verticals, and company names using the AI

If the owner types a custom industry that wasn't suggested, the system saves it so future users will see it too

Owner fills in company name, size, and details → Clicks Save → Redirect to Dashboard

## 3) Employee Onboarding
Employee signs up → Chatbot starts with 8 topics: company description, industry, size, goals, challenges, workflows, decision making, growth

**EmployeePersonaBuilder** agent asks the AI: "You are YesBoss, an AI teammate helping a new employee set up their workspace. Ask thoughtful, friendly questions about their work style, communication preferences, tools they use, challenges, and how they collaborate best. Each question builds on previous answers." → AI generates a personalized question → Employee answers → System saves the answer to the database and also sends it to an AI embedding service which converts the meaning into a vector fingerprint (a set of numbers) → The fingerprint is stored in a vector database alongside fingerprints from other answers for future similarity search

For **owner onboarding**: **PersonaBuilder** asks about leadership style, vision, challenges → **OnboardingAssistant** explains features and guides through first goals → **MasterAgent** tracks the conversation state (what step we're on, how much we understand, what's missing) and generates the next question → Continues until complete

## 4) Goals
**Create Goal:** Owner fills title, description, priority, timeline, assignees, reviewers → System checks if a department was given → If not, **DepartmentClassifier** agent asks the AI: "Classify this goal into one department from this list: Engineering, Marketing, Sales, Operations, Finance, Human Resources, Product, Design, Customer Support, R&D, Supply Chain, Legal. Reply with just one word." → AI picks the department → Goal is saved → Team is notified

**Default Goals:** When a new organization is created, **DefaultGoalsAgent** asks the AI: "Generate 5 default goals for a company in this industry." → AI returns goals → They appear with a "Default" badge. If AI fails, falls back to pre-written templates by industry.

**Goal Types:** Owner picks **short-term** (weeks) or **long-term** (quarters/years). Then picks **one-time** (has an end date) or **continuous** (ongoing). One-time goals get an optional end date.

**Goal Hierarchy:** Goals can link to a **parent goal** via `parent_goal_id` — creates a tree (e.g., "Increase Q3 Revenue" is parent of "Hire 2 Sales Reps").

**AI Strategies:** Owner clicks "Generate Strategies" → System fetches company data (profile, goals, tasks, team, documents, website) plus past workflow patterns from the vector database → **GoalArchitect** agent asks the AI: "Generate 2-3 distinct strategic approaches for this business goal with name, description, timeline, risks, impact" → AI returns strategies → Owner sees them

**Generate Tasks:** Owner picks a strategy → Clicks "Generate Tasks" → **GoalArchitect** asks the AI: "Convert this strategy into 3 to 7 actionable tasks with title, description, and priority" → AI returns tasks → System resolves @mentions to real people → Tasks saved + broadcast to team + synced to Zoho if connected

**Goal Review:** Assignee marks goal as complete → System changes status to pending review → Owner sees pulsing amber badge → Owner can **Approve** (status → completed, saves outcome for learning) or **Reject** with feedback (status → back to active, assignee is notified)

**Goal Breakdown:** Dedicated tool to update success criteria, KPIs, timeline, and dependencies for a goal

## 5) Tasks
**Create Task:** User fills title, description, assignees, reviewers, dependencies, priority, due date → System saves and does three things: notifies team, notifies assignee, syncs to Zoho

**Frequency Agent (background):** On every task create/update, **FrequencyAgent** fires in the background — asks the AI: "You are a work-pattern analyst. Given this description, extract the work category (development, design, research, meeting, sales, support, etc.), complexity level (beginner/intermediate/advanced), and estimated hours (0.5-80)." → AI returns analysis → System saves a weighted-average record keyed by employee + work category, building a history of each person's proven skills.

**Smart Assignee Suggestions:** When typing a task title (≥3 characters), the system calls the AI to classify the work category → Finds employees who have done similar work most often → Scores them on: experience in that category (40%), current workload (30%), completion speed (20%), department match (10%) → Shows top 5 in an AI Suggestions panel with match %, frequency, avg hours, and current active task count

**Auto Deadline Suggestion:** The system computes a realistic deadline from the estimated hours (~4h → 1 day, ~8h → 2 days, ~40h → 1 week). A clickable "Auto-fill" button appears below the deadline field.

**Workload Conflict Warning:** If the selected assignee already has >2 active tasks, the system warns: "John already has 3 active tasks at 2x/week — this adds ~6h more"

**Task Comments:** Team members can add comments → Comments are saved with the task → Deleted when task is deleted

**Task Approval:** Authorized person clicks "Approve" → Status changes to "approved" → Creator and assignees are notified

**Task Complete:** Assignee clicks "Complete" → Status changes to "completed" → Creator is notified

**Overdue Escalation:** Every 5 minutes, system checks for overdue tasks → If overdue: notify assignee → If overdue more than 3 days: notify manager → If overdue more than 7 days: notify owner with detailed email

**Deadline Reminders:** 1 day before due: remind assignee → 3 days before due: remind again

## 6) Strategy Chat
**When it runs:** Every time a CEO or owner types a question — because the system doesn't know which area the question covers, it runs all experts simultaneously so no perspective is missed.

**How the unified chat works:**
User types a question → System first tries the **Smart Ask** flow:
- Builds a snapshot of the organization (profile, goals, tasks, team, uploaded files, plus employee work patterns from the frequency agent — so the AI knows who's good at what)
- Classifies the intent: chat, action, or delegate
- If **chat**: AI answers using company data, or asks for a specific file if data is missing
- If **action**: AI asks one question at a time to collect details (title, assignee, deadline, priority)
- If **delegate**: System creates a goal + task in one shot, assigns to the right person (using work pattern data to suggest who), notifies them
- If Smart Ask fails, falls back to full multi-expert mode

**Multi-Expert Mode (fallback):**
System tells MasterPromptEngine it needs data for Strategy Chat → MasterPromptEngine gathers all company data (profile, goals, tasks, team, documents, website, past patterns, **employee work patterns**) from the database and vector database

System asks MasterPromptEngine for the **StrategyAdvisor** agent first → **StrategyAdvisor** asks the AI: "You are an AI Strategy Advisor who helps CEOs think long-term." → AI provides strategic context

Then 6 expert agents run simultaneously:
1. **FinanceAgent** → "You are a Finance Expert. Analyze financial health, costs, and revenue."
2. **OperationsAgent** → "You are an Operations Expert. Analyze operations and bottlenecks."
3. **WorkflowAgent** → "You are a Workflow Expert. Find automation opportunities."
4. **ForecastingAgent** → "You are a Forecasting Expert. Predict outcomes and forecast growth."
5. **IndustryIntelligenceAgent** → "You are an Industry Expert. Analyze market trends and competitors."
6. **OrgUnderstandingAgent** → "You are an Org Expert. Analyze team structure."

System asks MasterPromptEngine for the **BusinessAnalyst** agent → **BusinessAnalyst** asks the AI: "Synthesize these expert analyses into one clear answer" → AI returns unified response → User sees main answer plus all 6 expert panels

**Cross-company benchmarks** are also injected into the context so the AI can reference industry averages.

**Session management:** Sidebar with all sessions, "New Chat" button, click to load history.

**File features:** Upload and analyze a document in chat, or import from a URL.

## 7) Assistant
**Step 1 — Classify Intent:** User types a message → **IntentClassifier** asks the AI: "Classify this message as 'chat' if it's a general question, 'action' if they want to do something but need more details, or 'delegate' if they want to assign a task to someone" → AI returns the intent

**Step 2 — Chat Response:** If intent is "chat" → AI checks if it needs company data → Answers directly, or with what it knows + asks for a document

**Step 3 — Action or Delegate:** If intent is "action" or "delegate" → AI collects details one question at a time → **TaskPlanner** asks the AI: combined with company data (org, goals, tasks, team, docs, past patterns) → "Create a goal and subtasks from this information" → AI returns goal + tasks → Saved, broadcast, synced to Zoho

**Employee work pattern context** is included in the TaskPlanner prompt — the AI knows each team member's proven categories and complexity levels, so it can suggest appropriate assignments.

## 8) Meetings
Owner clicks "Upload Meeting" → Two options:

**Tab 1 — Upload File:** Owner selects a recording file or types notes → System extracts text from the file

**Tab 2 — Import from Zoho Calendar:** Owner picks a meeting already synced from Zoho → No file upload needed

Both cases: **MeetingTaskExtractor** asks the AI: "Extract actionable tasks from this meeting. For each task give: title, description, who should do it, priority, and deadline." → AI returns tasks → System resolves @mentions, saves tasks, broadcasts, syncs to Zoho → Returns summary

**MoM auto-reminder:** When a meeting ends, the scheduler checks if MoM was uploaded. If not, sends a push notification to attendees.

## 9) File Processing
User uploads a file → The backend extracts the raw text using different methods depending on type

**Step 1 — Chunk:** Text is split into smaller overlapping pieces (1000 char chunks with 200 char overlap)

**Step 2 — Embed:** Each piece is sent to an AI embedding service to create a vector fingerprint (1536 numbers)

**Step 3 — Store:** All fingerprints stored in vector database alongside original text

**Step 4 — Deep Analysis:** **DocumentAnalyst** asks the AI: "Extract document category, key entities, metrics, decisions, action items, question-answer pairs." → AI returns structured analysis → Saved

**Searching later:** User types a query → System converts to vector fingerprint → Searches vector database for closest matches → Returns ranked results

## 10) Dashboard
User lands on Dashboard → System fetches KPIs, goals, tasks, meetings → Displays in cards, charts, and lists

**KPI Analyst:** **KpiAnalyst** asks the AI: "Given goals, tasks, and team data, suggest the most relevant KPIs to track" → AI suggests KPIs → Displayed

**Industry Benchmarks Card:** Shows cross-company benchmarks: completion rate, avg goal duration, delay rate, common delay reasons (compared against anonymized data from similar companies)

## 11) Market Trends
Owner clicks "Generate Trends" → **MarketAnalyst** asks the AI: "Generate 3 to 5 realistic recent market news articles for this industry." → AI returns articles

For each article, **MarketAnalyst** asks the AI: "How does this trend affect a company in this industry? What are the opportunities, threats, and actions?" → AI returns impact analysis

**Deep Market Impact Analysis:** System compares each trend against the company's actual goals and tasks → Calculates alignment score

## 12) Reports
**On-Demand Reports:** Owner selects period and sections → System gathers data → AI writes a summary → PDF created → User downloads

**Auto-Generated Reports:**
- **Weekly Employee Reports (every Monday):** For each employee, calculates task completion rate → **Now includes work pattern analysis:** system fetches each employee's historical frequency data (categories worked, avg completion hours, complexity level), compares with org averages (faster/slower) → AI writes personalized feedback referencing these patterns → PDF sent via email
- **Monthly Org Health Report (1st of month):** System calculates health score (0-100) across departments → **Now includes team-wide pattern analysis:** top performers per category, overloaded employees, multi-category workers, active tasks per employee → AI writes strategic recommendations referencing these patterns → PDF sent to owner

**Weekly Owner Briefing (every Monday):** System generates a one-paragraph executive briefing for the owner containing:
- Overloaded employees (doing >5x/week across categories)
- Performance trends (who's improving/slipping with % change)
- Top performers by work category
- Skill gaps detected (goals requiring categories no one has proven)
- Key numbers: active goals, completion rate, overdue/escalated counts
- AI-written sharp summary highlighting the most critical items
- Delivered as a notification with link to reports

## 13) Continuous Learning
The system learns five ways:

**Way 1 — Recording:** When a task is completed or goal finishes → System saves a record with details: what happened, how long it took, who did it, department, delay info, efficiency score → Also creates a vector fingerprint → Stored in vector database for similarity search

**Way 2 — Frequency Tracking (real-time):** Every task/goal create/update, **FrequencyAgent** classifies it into a work category with complexity and estimated hours → Saves per-employee running averages using a weighted formula (recent work counts more) → Builds a persistent profile of each person's work patterns: "John does development 3x/week at advanced level, avg 8h completion"

**Way 3 — Pattern Matching:** Periodically, system collects recent records → **ContinuousLearning** agent asks the AI: "Analyze these workflow patterns and identify bottlenecks. What is causing delays?" → AI returns bottleneck analysis → Saved

**Way 4 — Aggregated Trends (cross-company):** System calculates anonymized industry averages: completion rate, avg duration per goal type, delay rate, top delay reasons → Aggregated into industry benchmarks → Fed into Strategy Chat so AI can say "72% completion rate in your industry"

**Way 5 — Performance Trends (weekly):** Every Monday, system aggregates `task_outcomes` by employee per week → Stores 8-week history of avg completion hours and tasks completed per employee → Computes trend direction: **improving** (>5% faster over 8 weeks), **slipping** (>5% slower), or **stable** → Powers the weekly owner briefing

## 14) Notifications
When something happens → System saves a notification, checks user's preferences, checks email rate limit (max 50/hour per org)

**Preferences:** Each user can toggle per channel (Email, Browser popup, In-app popup, Sound) and per type

**Digest:** Daily or weekly summary email option

**Email Templates (6 types):** Default, Task Deadline Reminder, Task Overdue, Escalation to Owner, Weekly Digest, Monthly Report

## 15) Zoho Integration
**Connect:** User clicks "Connect Zoho" → System creates login URL → User logs in and approves → Zoho sends code → System exchanges for tokens → Saves → Shows "Connected"

**Automatic Token Refresh:** Before every Zoho call, system checks token validity → Refreshes if expired

**Task Sync (YesBoss ↔ Zoho):** Bidirectional sync every 5 minutes → Tasks created/updated/deleted in either system reflected in the other

**Calendar Sync:** Every 15 minutes → Powers "Import from Zoho Calendar" in Meetings

**Check Availability:** User @mentions people, picks date/time → System checks each person's Zoho Calendar for conflicts

**Book Meeting:** Creates event on user's Zoho Calendar and each attendee's calendar

## 16) Org Chart
Owner goes to Team page → Adds members one by one or uploads a CSV → Saved

Later, when anyone types @name in any task, goal, or meeting → System finds that person's email and assigns to them

## 17) Skill Gap Detection
Owner can check for skill gaps via the learning system:

- System collects all active goals and their departments
- For each goal, analyzes its tasks to determine what work categories are needed
- Compares against each employee's proven work patterns (from frequency tracking)
- Returns:
  - **Goal-level gaps:** goals that require categories no one has pattern history for
  - **Department-level gaps:** departments with goals in categories their employees haven't demonstrated
  - **Overloaded employees:** people carrying too many distinct categories (>5x/week total)
- This data feeds into the weekly owner briefing and helps owners decide where to hire or upskill

## 18) Multi-Owner Private Workspaces
One company can have multiple owners, each with their own private workspace.

**What stays shared:** Company name, industry, integrations, team member list, market intelligence

**What becomes private per owner:** Goals, tasks, reports, check-in notes, chat sessions

**Flow:** Owner signs up → System checks if domain exists → If yes, joins as co-owner → Fresh dashboard with own goals/tasks → Other owner's data is completely invisible

## 19) Periodic Owner Check-Ins
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
| **TaskPlanner** | "You are an AI Task Planner. Break down goals into actionable tasks. Suggest task assignments based on team structure." |
| **MeetingTaskExtractor** | "Extract actionable tasks from this meeting. For each task give: title, description, who should do it, priority, and deadline." |
| **DocumentAnalyst** | "Extract document category, key entities, metrics, decisions, action items, and question-answer pairs." |
| **KpiAnalyst** | "You are a business analytics expert. Given goals, tasks, and team data, suggest the most relevant KPIs to track" |
| **MarketAnalyst** | "You are a market research analyst. Generate realistic market news articles for this industry." |
| **ContinuousLearning** (bottlenecks) | "Analyze these workflow patterns and identify bottlenecks. What is causing delays?" |
| **ContinuousLearning** (trends) | "Based on this data, what patterns do you see? How can the company improve?" |

## Summary: New Storage Areas

| Area | Purpose |
|---|---|
| Users / Organizations / Employees | Core identity and company structure |
| Goals / Tasks | Business objective and execution tracking with types, hierarchy, review state |
| Workflows / Task Outcomes / Bottlenecks | Process recording and bottleneck detection |
| Learning Patterns / User Patterns | Pattern learning per user and organization |
| Employee Frequencies | Per-assignee work frequency and patterns by category (running weighted average) |
| Goal Outcomes | Anonymized goal completion data for cross-company learning |
| Industry Intelligence | Aggregated benchmarks per industry |
| Performance History | Weekly snapshots of per-employee avg completion hours for trend tracking |
| Org Chart Members | Team hierarchy with department, role, manager |
| Notifications / Notification Preferences / Push Subscriptions | Multi-channel notification system |
| Documents / Uploads | File storage with vector embeddings in Qdrant |
| Meetings / Check-Ins | Meeting minutes, task extraction, periodic owner reviews |
| Chat Sessions / Assistant Sessions | Conversation history for Strategy Chat and Assistant |
| Reports | Generated PDF report cache and metadata |
| Zoho Tokens / Calendar Events | Zoho integration tokens and synced calendar data |

## Summary: Background Tasks

| Task | When | What It Does |
|---|---|---|
| Deadline Reminders | Every ~60 min | Checks for tasks due tomorrow, due in 3 days, overdue, overdue >3 days (escalate to manager), overdue >7 days (escalate to owner) |
| Daily Digests | Daily at 8 AM | Sends daily email summary to opted-in users |
| Auto Reports | Weekly (Mon 9 AM) and Monthly (1st 9 AM) | Generates employee performance reports + org health report + **weekly owner briefing** (overloaded employees, performance trends, top performers, skill gaps, key numbers) |
| Performance Aggregation | Weekly (Mon) | Aggregates task outcomes into performance_history for 8-week trend tracking |
| Owner Check-Ins | Every ~60 min | Finds orgs due for check-in, sends notification with goal summary |
| Cross-Company Aggregation | Daily at 3 AM | Aggregates goal outcomes into industry benchmarks |
| Zoho Sync | Every 5 min (tasks), every 15 min (calendar) | Bidirectional sync of tasks and calendar events |
| MoM Reminders | Every ~60 min | Detects ended meetings without uploaded minutes, sends reminder to attendees |

---

## How Agents Are Called

When a feature needs AI help, it tells **MasterPromptEngine** which agent it needs. MasterPromptEngine has:
1. A map of each agent → which company data it requires (org, goals, tasks, team, docs, patterns, website)
2. A store of each agent's instruction (the persona prompt)

It fetches the required data from the database + vector database, combines it with the agent's instruction, and returns the full context so the AI can generate a response.

**Employee work patterns are now included** in the "team" context section — every AI call that uses team data sees each person's proven categories, frequency, and complexity levels. This means the AI naturally suggests appropriate task assignments and goal breakdowns based on who's actually done similar work before.
