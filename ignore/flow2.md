# YesBoss — Simple Feature Flows

*Throughout this document, whenever an "agent asks the AI", it means the backend calls a Large Language Model (LLM) — the system uses Grok by default, and also supports GPT-4o, Claude, Gemini, or Qwen as alternatives. The AI reads the agent's instruction plus any relevant company data and returns a response. The backend also uses a vector database (a special database that stores meaning fingerprints) and an AI embedding service (which converts text into those fingerprints) for search and pattern matching.*

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

**AI Strategies:** Owner clicks "Generate Strategies" → System fetches company data from the database (profile, goals, tasks, team, documents, website) plus past workflow patterns from the vector database → **GoalArchitect** agent asks the AI: "You are an AI Goal Architect. Generate 2-3 distinct strategic approaches for this business goal with name, description, timeline, risks, impact" → AI returns strategies → Owner sees them

**Generate Tasks:** Owner picks a strategy → Clicks "Generate Tasks" → **GoalArchitect** asks the AI: "Convert this strategy into 3 to 7 actionable tasks with title, description, and priority" → AI returns tasks → System resolves @mentions to real people → Tasks saved + broadcast to team + synced to Zoho if connected

**Goal Chat:** Owner types a question → System gathers goal context → AI responds with suggestions, success criteria, KPIs → If user says "delete this goal", system auto-deletes it → Chat history is logged for learning

**Goal Breakdown:** System has a dedicated tool to update success criteria, KPIs, timeline, and dependencies for a goal

**Create Tasks From Suggestions:** Owner can also bulk-create tasks from pre-made suggestions without AI

**How agents are called:** When a feature needs AI help, it tells **MasterPromptEngine** which agent it needs (e.g., "I need the FinanceAgent"). MasterPromptEngine has two dictionaries — one that maps each agent to the company data it requires, and another that stores the agent's instruction (prompt). It fetches the required data from the database + vector database, combines it with the agent's instruction, and returns everything so the AI can generate a response. This is why every agent call below follows the pattern: *Feature → MasterPromptEngine → Agent asks the AI.*

## 5) Tasks
**Create Task:** User fills title, description, assignees, reviewers, dependencies, priority, due date → System saves and does three things: notifies team, notifies assignee, syncs to Zoho (creates in group task list + each assignee's personal list)

**Task Comments:** Team members can add comments → Comments are saved with the task → Deleted when task is deleted

**Task Approval:** Authorized person clicks "Approve" → Status changes to "approved" → Creator and assignees are notified

**Task Complete:** Assignee clicks "Complete" → Status changes to "completed" → Creator is notified

**Overdue Escalation:** Every 5 minutes, system checks for overdue tasks → If overdue: notify assignee → If overdue more than 3 days: notify manager → If overdue more than 7 days: notify owner with detailed email

**Deadline Reminders:** 1 day before due: remind assignee → 3 days before due: remind again

## 6) Executive Chat
**When it runs:** Every time a CEO or owner types a question — because the system doesn't know which area the question covers, it runs all experts simultaneously so no perspective is missed.

**Why it runs:** The owner's question could be about money, operations, team, competitors, growth, or anything — so the system covers every angle to give a complete picture.

**Flow:**
User types a question → System tells MasterPromptEngine it needs data for Executive Chat → MasterPromptEngine gathers all company data (profile, goals, tasks, team, documents, website, past patterns) from the database and vector database

System asks MasterPromptEngine for the **StrategyAdvisor** agent first (to get high-level strategic framing before diving into details) → MasterPromptEngine looks up its instruction → **StrategyAdvisor** asks the AI: "You are an AI Strategy Advisor who helps CEOs think long-term. You identify strategic opportunities, risks, and market positioning." → AI provides strategic context

Then 6 expert agents run simultaneously (each through MasterPromptEngine) because the question could be about any of these areas:

1. **FinanceAgent** (in case the question involves money) → asks the AI: "You are a Finance Expert. Analyze financial health, costs, and revenue." → AI returns financial analysis
2. **OperationsAgent** (in case the question involves processes or bottlenecks) → asks the AI: "You are an Operations Expert. Analyze operations and bottlenecks." → AI returns operations analysis
3. **WorkflowAgent** (in case the question involves efficiency or automation) → asks the AI: "You are a Workflow Expert. Find automation opportunities." → AI returns workflow suggestions
4. **ForecastingAgent** (in case the question involves future trends or growth) → asks the AI: "You are a Forecasting Expert. Predict outcomes and forecast growth." → AI returns predictions
5. **IndustryIntelligenceAgent** (in case the question involves competitors or market) → asks the AI: "You are an Industry Expert. Analyze market trends and competitors." → AI returns market analysis
6. **OrgUnderstandingAgent** (in case the question involves people or team structure) → asks the AI: "You are an Org Expert. Analyze team structure." → AI returns team analysis

System asks MasterPromptEngine for the **BusinessAnalyst** agent (to weave all perspectives into one clear answer) → **BusinessAnalyst** asks the AI: "Synthesize these expert analyses into one clear answer" → AI returns a unified response → User sees the main answer plus all 6 expert panels

By default, all AI calls use Grok (xAI). The system also supports GPT-4o, Claude, Gemini, or Qwen as alternatives.

## 7) Assistant
**Step 1 — Classify Intent:** User types a message → System asks MasterPromptEngine for the **IntentClassifier** agent → MasterPromptEngine looks up its instruction → **IntentClassifier** asks the AI: "Classify this message as 'chat' if it's a general question, 'action' if they want to do something but need more details, or 'delegate' if they want to assign a task to someone" → AI returns the intent (falls back to keyword matching if AI fails)

**Step 2 — Chat Response:** If intent is "chat" → System asks AI: "Is this a general question that doesn't need company data, or does it need our specific company data? If it needs company data, do we have complete data, partial data, or is data missing?" → Based on answer: AI answers directly, or answers with what it knows and asks for a document, or asks for a specific document to fill the gap

**Step 3 — Action or Delegate:** If intent is "action" or "delegate" → AI asks one question at a time to collect details (title, who, deadline, priority) → System smart-parses answers like "urgent" = high priority, "Friday" = next Friday → System asks MasterPromptEngine for the **TaskPlanner** agent → MasterPromptEngine looks up its instruction and fetches company data (org, goals, tasks, team, docs, past patterns) → **TaskPlanner** asks the AI with combined data: "You are an AI Task Planner. You break down goals into actionable tasks. Think about dependencies, resource allocation, and timelines. Suggest task assignments based on team structure. Create a goal and subtasks from this information" → AI returns goal + tasks → Saved, broadcast, synced to Zoho

## 8) Meetings
Owner clicks "Upload Meeting" → Two options:

**Tab 1 — Upload File:** Owner selects a recording file or types notes → System extracts text from the file (speech-to-text for audio, OCR for images, reader for PDFs/docs)

**Tab 2 — Import from Zoho Calendar:** Owner picks a meeting already synced from Zoho → No file upload needed

Both cases: System asks MasterPromptEngine for the **MeetingTaskExtractor** agent → MasterPromptEngine looks up its instruction → **MeetingTaskExtractor** asks the AI: "Extract actionable tasks from this meeting. For each task give: title, description, who should do it, priority, and deadline." → AI returns tasks → System resolves @mentions, saves tasks, broadcasts, syncs to Zoho → Returns summary

## 9) File Processing
User uploads a file → The backend extracts the raw text from the file (using different methods depending on the type: PDF, Word, image, spreadsheet, etc.)

**Step 1 — Chunk:** The text is split into smaller overlapping pieces (e.g., first 1000 characters, then next piece starts at character 800 and goes to 1800, and so on — the 200-character overlap ensures no meaning is lost at boundaries)

**Step 2 — Embed:** Each piece is sent to an AI embedding service which converts the meaning into a vector fingerprint (a list of 1536 numbers) → If the embedding service is unavailable, the system creates a temporary random fingerprint instead

**Step 3 — Store:** All fingerprints are stored in a vector database alongside the original text, creating a searchable library of document content

**Step 4 — Deep Analysis:** System asks MasterPromptEngine for the **DocumentAnalyst** agent → MasterPromptEngine looks up its instruction → **DocumentAnalyst** asks the AI: "Extract from this document: document category (financial, strategic, operational, etc.), key entities (people, companies, products, amounts), key metrics, decisions made, action items, and question-answer pairs." → AI returns a structured analysis → Saved alongside the file in the database

**Searching later:** User types a search query → The backend converts the query into the same kind of vector fingerprint using the AI embedding service → Searches the vector database for the closest matching fingerprints (meaning the most similar content) → Returns the matching text pieces ranked by relevance

## 10) Dashboard
User lands on Dashboard → System fetches KPIs (active goals, completion rate, team size, task counts by status), goals with progress, tasks, meetings → Displays in cards, charts, and lists

When user scrolls to AI Insights → System asks MasterPromptEngine for the **KpiAnalyst** agent → MasterPromptEngine fetches organization data (profile, goals, tasks, team) and looks up its instruction → **KpiAnalyst** asks the AI: "You are a business analytics expert. Given goals, tasks, and team data, suggest the most relevant KPIs to track" → AI suggests KPIs → Displayed

## 11) Market Trends
Owner clicks "Generate Trends" → System fetches company's industry → System asks MasterPromptEngine for the **MarketAnalyst** agent → MasterPromptEngine looks up its instruction → **MarketAnalyst** asks the AI: "You are a market research analyst. Generate 3 to 5 realistic recent market news articles for this industry. Each article needs a title, source, date, summary, and sentiment score." → AI returns articles

For each article, system asks MasterPromptEngine for the **MarketAnalyst** agent again → **MarketAnalyst** asks the AI: "How does this trend affect a company in this industry? What are the opportunities, threats, and actions to take?" → AI returns impact analysis

**Deep Market Impact Analysis:** System compares each trend against the company's actual goals and tasks → Calculates an alignment score showing which trends need immediate attention

All results displayed as news cards with impact chart

## 12) Reports
**On-Demand Reports:** Owner selects period (weekly/monthly/quarterly) and sections → System gathers data → AI writes a summary → System creates a PDF → User downloads it

**Auto-Generated Reports:**
- **Weekly Employee Reports (every Monday):** For each employee, system calculates task completion rate → AI writes personalized feedback → PDF sent via email
- **Monthly Org Health Report (1st of month):** System calculates health score (0-100) across departments → AI analyzes trends and writes recommendations → PDF sent to owner

## 13) Notifications
When something happens (task created, goal assigned, etc.) → System saves a notification, checks user's preferences, checks email rate limit (max 50/hour per organization)

**Preferences:** Each user can turn on/off for each channel (Email, Browser popup, In-app popup, Sound) and each type (task assigned, completed, goal created, etc.)

**Digest:** User can get a daily or weekly summary email instead of individual notifications

**Email Templates (6 types):** Default, Task Deadline Reminder, Task Overdue, Escalation to Owner, Weekly Digest, Monthly Report — each personalized with user's name and company branding

## 14) Zoho Integration
**Connect:** User clicks "Connect Zoho" → System creates a login URL → User logs into Zoho and approves permissions → Zoho sends a code → System exchanges it for tokens → Saves tokens and Zoho email → Shows "Connected"

**Automatic Token Refresh:** Before every Zoho call, system checks if the token is still valid → If expired, uses the refresh token to get a new one

**Task Sync (YesBoss to Zoho):** When a task is created/updated/deleted → System creates/updates/deletes it in Zoho's group task list and each assignee's personal to-do list

**Task Sync (Zoho to YesBoss):** Every 5 minutes, system checks Zoho for changes → Updates the local copy if status changed

**Calendar Sync:** Every 15 minutes, system syncs Zoho Calendar events → Powers the "Import from Zoho Calendar" option in Meetings

**Check Availability:** User @mentions people, picks date + time → System checks each person's Zoho Calendar for conflicts → Shows free or busy

**Book Meeting:** User fills title + description → System creates the event on the user's Zoho Calendar and each attendee's calendar (skips those not connected) → Returns confirmation

## 15) Continuous Learning
The system learns three ways:

**Way 1 — Recording:** When a task is completed or goal finishes → System saves a record to the database with details like what happened, how long it took, who did it, which department, whether it was delayed, why, and an efficiency score → It also sends this event to the AI embedding service to create a vector fingerprint → The fingerprint is stored in the vector database alongside all past similar events, building a searchable history of how work gets done

**Way 2 — Pattern Matching:** Periodically, system collects recent records → System asks MasterPromptEngine for the **ContinuousLearning** agent → MasterPromptEngine looks up its instruction → **ContinuousLearning** asks the AI: "Analyze these workflow patterns and identify bottlenecks. What is causing delays? Which departments are struggling? Suggest specific improvements." → AI returns bottleneck analysis → Saved

**Way 3 — Aggregated Trends:** System calculates averages (time by department, delay frequency, common reasons) → **ContinuousLearning** asks the AI: "Based on this data, what patterns do you see? How can the company improve?" → AI returns improvement suggestions → Saved

**How learning is used:** Past patterns are included when the AI answers questions, so it knows things like "this company tends to have delays in Engineering" → Owner can also view bottleneck records

## 16) Org Chart
Owner goes to Team page → Adds members one by one (name, email, role, department – supports multiple people per department, manager) or uploads a CSV → Saved

Later, when anyone types @name in any task, goal, or meeting → System finds that person's email and assigns the task to them

---

## Summary: All Agents and What They Say

| Agent | What It Asks the AI |
|---|---|
| **SocialVerifier** | "You are a strict social media verifier. Examine the candidate social media URLs and determine which are genuine company pages. Never guess or invent URLs." |
| **CompanyAnalyst** | "Identify the company name, primary industry, and micro-verticals from the website content" |
| **CompanyResearcher** | "Given a company name, find and return verified information including description, industry, size, location, and website" |
| **GoalSuggester** | "You are a business consultant. Given an industry, suggest relevant strategic business goals and documents to upload" |
| **GrowthAdvisor** | "You are an AI Growth Advisor. Based on the company's stage, industry, and existing documents, suggest what documents the owner should upload next to fill critical knowledge gaps" |
| **EmployeePersonaBuilder** | "You are YesBoss, an AI teammate helping a new employee set up their workspace. Ask thoughtful, friendly questions about their work style, communication preferences, tools they use, challenges, and how they collaborate best. Each question builds on previous answers." |
| **DepartmentClassifier** | "Classify this goal into one department from this list: Engineering, Marketing, Sales, Operations, Finance, Human Resources, Product, Design, Customer Support, R&D, Supply Chain, Legal. Reply with just one word." |
| **GoalArchitect** (strategies) | "You are an AI Goal Architect. Generate 2-3 distinct strategic approaches for this business goal with name, description, timeline, risks, impact" |
| **GoalArchitect** (tasks) | "Convert this strategy into 3 to 7 actionable tasks with title, description, and priority" |
| **StrategyAdvisor** | "You are an AI Strategy Advisor who helps CEOs think long-term. You identify strategic opportunities, risks, and market positioning." |
| **FinanceAgent** | "You are a Finance Expert. Analyze financial health, costs, and revenue." |
| **OperationsAgent** | "You are an Operations Expert. Analyze operations and bottlenecks." |
| **WorkflowAgent** | "You are a Workflow Expert. Find automation opportunities." |
| **ForecastingAgent** | "You are a Forecasting Expert. Predict outcomes and forecast growth." |
| **IndustryIntelligenceAgent** | "You are an Industry Expert. Analyze market trends and competitors." |
| **OrgUnderstandingAgent** | "You are an Org Expert. Analyze team structure." |
| **BusinessAnalyst** | "Synthesize these expert analyses into one clear answer" |
| **IntentClassifier** | "Classify this message as 'chat' if it's a general question, 'action' if they want to do something but need more details, or 'delegate' if they want to assign a task to someone" |
| **TaskPlanner** | "You are an AI Task Planner. You break down goals into actionable tasks. Think about dependencies, resource allocation, and timelines. Suggest task assignments based on team structure." → Then combined with company data: "Create a goal and subtasks from this information" |
| **MeetingTaskExtractor** | "Extract actionable tasks from this meeting. For each task give: title, description, who should do it, priority, and deadline." |
| **DocumentAnalyst** | "Extract from this document: document category (financial, strategic, operational, etc.), key entities (people, companies, products, amounts), key metrics, decisions made, action items, and question-answer pairs." |
| **KpiAnalyst** | "You are a business analytics expert. Given goals, tasks, and team data, suggest the most relevant KPIs to track" |
| **MarketAnalyst** | "You are a market research analyst. Generate 3 to 5 realistic recent market news articles for this industry. Each article needs a title, source, date, summary, and sentiment score." |
| **ContinuousLearning** (bottlenecks) | "Analyze these workflow patterns and identify bottlenecks. What is causing delays? Which departments are struggling? Suggest specific improvements." |
| **ContinuousLearning** (trends) | "Based on this data, what patterns do you see? How can the company improve?" |
