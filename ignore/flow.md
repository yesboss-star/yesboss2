# YesBoss — Complete Feature Flows

## 1) Authentication

**Signup:**
User fills the signup form with email or phone, password, full name, and role → User clicks "Create Account" → The browser calls Firebase to create the account → Firebase creates the user and returns a unique ID → The browser sends that ID plus the user details to the backend → The backend checks if this user already exists in the database → If yes, it updates the existing record → If no, it creates a new record → The backend returns success → The browser stores the user data locally and sets a cookie → The browser redirects to the onboarding page

**Login:**
User enters email and password → Clicks "Login" → The browser calls Firebase to verify the credentials → Firebase confirms the user and returns the unique ID → The browser sends the ID and email to the backend → The backend syncs the user data in the database → The browser stores user data locally → Redirect to Dashboard

**Forgot Password:**
User enters email → Clicks "Reset Password" → The browser sends a request to the backend → The backend asks Firebase to generate a special password reset link → Firebase returns the link → The backend sends an email containing this link using the email server → User opens the email, clicks the link → Firebase shows a page to enter a new password → Done

---

## 2) Organization Onboarding

User enters work email → The backend extracts the company domain from the email address (e.g., "company.com" from "john@company.com") → The backend uses a scraper to fetch the company's website content → It also scans the website HTML to find social media links like LinkedIn, Twitter, Instagram, Facebook → The backend then calls the **SocialVerifier** agent → It asks MasterPromptEngine for this agent's instruction → MasterPromptEngine looks up "SocialVerifier" and finds: "You are a strict social media verifier. Examine the candidate social media URLs and determine which are genuine company pages. Never guess or invent URLs." → This instruction plus the found links are sent to Grok AI → AI returns only the verified genuine links

Now the backend decides: "I need to figure out what industry this company is in" → It asks MasterPromptEngine for the **CompanyAnalyst** agent's instruction → MasterPromptEngine looks up "CompanyAnalyst" in its dictionary and finds: "Identify the company name, primary industry, and micro-verticals from the website content" → The backend also calls **CompanyResearcher** agent to get additional verified company information → MasterPromptEngine looks up "CompanyResearcher" and finds: "Given a company name, find and return verified information including description, industry, size, location, and website" → Both instructions plus the scraped website text and social links are sent to Grok AI → Grok AI analyzes and returns the company name, industry, micro-verticals, and verified company info

The backend also asks the **GoalSuggester** agent to suggest what documents the owner should upload next → MasterPromptEngine looks up "GoalSuggester" and finds: "You are a business consultant. Given an industry, suggest relevant strategic business goals and documents to upload" → This is sent to Grok AI → AI returns document recommendations

All results are sent to the browser → The owner sees the suggested industry, fills in the company name, size, and other details → Clicks "Save" → The backend saves everything to the database → Redirect to Dashboard

---

## 3) Employee Onboarding

Employee signs up → Redirected to the onboarding chatbot → The **OnboardingChatbot** (a Python class that manages the question flow) starts the conversation → It has a pre-built list of 8 topics to cover: company description, industry, company size, goals, challenges, workflows, decision making, and growth

For each topic, the OnboardingChatbot asks a question → But the actual wording of each question is personalized by Grok AI using the **EmployeePersonaBuilder** agent → The backend asks MasterPromptEngine for this agent's instruction → MasterPromptEngine looks up "EmployeePersonaBuilder" and finds: "You are YesBoss, an AI teammate helping a new employee set up their workspace. Ask thoughtful, friendly questions about their work style, communication preferences, tools they use, challenges, and how they collaborate best. Each question builds on previous answers." → This instruction plus the employee's previous answers and their department/role are sent to Grok AI → Grok AI generates the next personalized question → The employee answers → The answer is saved to the database → The answer is also converted into a vector fingerprint (a list of numbers that represents its meaning) using an AI embedding service and stored in the vector database

For **owner onboarding**, a different process runs: The **PersonaBuilder** agent (which gets org, docs, website, and patterns data) asks questions about leadership style, vision, challenges, and team → Additionally, the **OnboardingAssistant** agent explains capabilities and guides the owner through setting up their first goals → A **MasterAgent** (a step-by-step guided flow using LangGraph) tracks the conversation state: it knows what step we're on, how well the company is understood (0 to 100%), what information is still missing, and how confident it is in the answers → It analyzes each response, updates its understanding, and generates the next question → This continues until the company profile is complete

After all questions are answered for employee or owner, the profile is created → Go to Dashboard

---

## 4) Goals

**Create Goal:**
Owner opens the "Create Goal" modal → Fills in title, description, priority, timeline, assignees → Clicks "Save" → The browser sends the goal data to the backend → The backend checks: "Was a department provided?" → If no department was given, the backend decides to classify the goal → It asks MasterPromptEngine for the DepartmentClassifier agent's instructions → MasterPromptEngine looks up "DepartmentClassifier" and finds: "Classify this goal into one department from this list: Engineering, Marketing, Sales, Operations, Finance, Human Resources, Product, Design, Customer Support, R&D, Supply Chain, Legal. Reply with just one word." → This instruction plus the goal title is sent to Grok AI → Grok AI returns the department → The backend saves the goal to the database → The backend then sends a real-time notification to all team members via WebSocket → It also creates notification records for the assigned people

**AI Strategies:**
Owner opens a saved goal → Clicks "Generate Strategies" → The browser sends a request to the backend → The backend first fetches the goal details from the database → Then it asks MasterPromptEngine for the GoalArchitect agent's instructions and context → MasterPromptEngine looks up "GoalArchitect" in its dictionary to see what data this agent needs → It finds: organization profile, goals, tasks, team, documents, website, and past patterns → MasterPromptEngine fetches each of these from the database and vector database → It also looks up the GoalArchitect persona instruction: "You are an AI Goal Architect. Generate 2-3 distinct strategic approaches for this business goal with name, description, timeline, risks, impact" → It combines all the fetched data plus this instruction into one block of text → Returns this to the backend → The backend sends this block plus the goal details to Grok AI → Grok AI returns 2-3 strategies as a structured response → The backend saves the strategies into the goal record in the database → Returns them to the browser → Owner sees the strategies

**Select Strategy to Generate Tasks:**
Owner picks one strategy → Clicks "Generate Tasks" → The browser sends the selection to the backend → The backend sends the strategy details to Grok AI with the GoalArchitect agent's instructions, now saying: "Convert this strategy into 3 to 7 actionable tasks with title, description, and priority" → Grok AI returns a list of tasks → For each task, the backend saves it to the database → It also broadcasts the new tasks to all team members via WebSocket → If Zoho is connected, it syncs each task to Zoho (see Zoho section)

**Goal Chat:**
Owner types a question in the goal chat panel → The browser sends the question to the backend → The backend asks MasterPromptEngine for the GoalArchitect agent's context (same data fetch as above) → The question plus the context plus the conversation history are sent to Grok AI → Grok AI responds with suggestions, probing questions, success criteria, and KPIs → The backend updates the goal record with any new structured information from the response → The backend also logs this interaction for future learning → Returns the AI response to the browser

---

## 5) Tasks

**Create Task:**
User fills the task form with title, description, assignee, priority, due date → Clicks "Save" → The browser sends the task to the backend → The backend saves it to the database → Then it does three things at the same time:
1. Sends a real-time notification to all team members via WebSocket
2. Creates a notification for the assignee and sends it via WebSocket, email, and/or browser push depending on their preferences
3. Syncs the task to Zoho: gets the owner's Zoho token from the database → creates the task in Zoho's group task list → gets the assignee's Zoho token → creates the task in Zoho's personal to-do list → saves the Zoho task IDs back to the database

**Update or Delete Task:**
Same process: update or delete in the database → update or delete in Zoho via API → broadcast via WebSocket

**Overdue Escalation (runs via background Scheduler):**
When the backend starts, a background checker runs forever in a loop:
- Every 5 seconds: It checks the database for tasks past their due date that are not completed → For each task found:
  - If not yet escalated: notify the assignee that the task is overdue
  - If overdue by more than 48 hours: notify the assignee's manager
  - If overdue by more than 72 hours: notify the organization owner
  - All notifications go through WebSocket, email, and browser push
- Every 5 minutes: It also does a deeper Zoho sync and checks goal progress
- Every 28 hours: It generates scheduled daily reports

---

## 6) Executive Chat

User types a question in the Executive Chat page → Clicks Send → The browser sends the question plus the organization ID to the backend

The backend first asks MasterPromptEngine to gather all company data (organization profile, goals, tasks, team, documents, website, past patterns) from the database and vector database

The backend then calls the **StrategyAdvisor** agent to get high-level strategic context — MasterPromptEngine gives it the persona: "You are an AI Strategy Advisor who helps CEOs think long-term. You identify strategic opportunities, risks, and market positioning."

Then the backend creates 6 expert agents and runs them all at the same time:

1. **FinanceAgent** — Asks MasterPromptEngine for its persona instruction → Gets: "You are a Finance Expert. Analyze financial health, costs, and revenue." → Sends the question plus company data plus this instruction to Grok AI → Gets back financial analysis

2. **OperationsAgent** — Gets persona: "You are an Operations Expert. Analyze operations and bottlenecks." → Calls Grok AI → Gets operations analysis

3. **WorkflowAgent** — Gets persona: "You are a Workflow Expert. Find automation opportunities." → Calls Grok AI → Gets workflow suggestions

4. **ForecastingAgent** — Gets persona: "You are a Forecasting Expert. Predict outcomes and forecast growth." → Calls Grok AI → Gets predictions

5. **IndustryIntelligenceAgent** — Gets persona: "You are an Industry Expert. Analyze market trends and competitors." → Calls Grok AI → Gets market analysis

6. **OrgUnderstandingAgent** — Gets persona: "You are an Org Expert. Analyze team structure." → Calls Grok AI → Gets team analysis

All 6 agents return their analysis and recommendations → The backend then sends all 6 responses plus the original question to Grok AI again, this time with the BusinessAnalyst persona: "Synthesize these expert analyses into one clear answer" → Grok AI returns a unified response → The backend saves the conversation to the database → Returns the main answer plus all 6 expert panels to the browser → The browser displays everything

---

## 7) Assistant

**Step 1 — Classify Intent:**
User types a message in the Assistant page → The browser sends it to the backend → The backend first tries using Grok AI with an IntentClassifier instruction: "Classify this message as 'chat' if it's a general question, 'action' if they want to do something but need more details, or 'delegate' if they want to assign a task to someone" → Grok AI returns the intent → If the AI call fails, the backend falls back to checking the message against a list of keywords (like "assign", "allocate", "start", "create") to guess the intent → Returns the result to the browser

**Step 2 — Chat Response (if intent is chat):**
The browser sends a follow-up request to the backend → The backend first calls Grok AI with a data-check instruction: "Is this a general question that doesn't need company data, or does it need our specific company data? If it needs company data, do we have complete data, partial data, or is data missing?" → Based on the answer:

- If general or data is complete: The backend calls Grok AI with a ChatAssistant instruction: "You are a business analyst. Answer using company data if available." → AI answers directly → Returns to user

- If data is partial: The AI answers with what it knows and also asks the user to upload a specific document that would help fill the gap

- If data is missing: The AI asks the user to upload a specific document (see the Document Uploads table at the end) → The user uploads a file → The file goes through the File Processing flow (text extraction → chunking → embedding → vector database) → Then the AI re-answers with the new data

**Step 3 — Action or Delegate (if intent is action or delegate):**
Grok AI asks the user one question at a time to collect all needed details: title, who should do it, deadline, priority → Each question is generated by simple logic in the backend (it checks what's still missing and asks for it) → When the user answers, the backend smart-parses things like "urgent" meaning high priority or "Friday" meaning the next Friday's date → After all details are collected, the backend calls the **TaskPlanner** agent → It asks MasterPromptEngine for this agent's instruction → MasterPromptEngine looks up "TaskPlanner" and finds: "You are an AI Task Planner. You break down goals into actionable tasks. Think about dependencies, resource allocation, and timelines. Suggest task assignments based on team structure." → MasterPromptEngine also fetches the needed data (org, goals, tasks, team, docs, patterns) from the database and vector database → This combined instruction plus data is sent to Grok AI: "Create a goal and subtasks from this information" → Grok AI returns a goal and task list → The backend saves them to the database → Broadcasts via WebSocket → Syncs to Zoho if connected

---

## 8) Meetings

Owner clicks "Upload Meeting" → A modal opens → Owner selects a recording file or types notes → The browser sends the file to the backend → The backend extracts the text from the file: if it's a PDF it uses a PDF reader library, if it's a Word document it uses a Word reader library, if it's audio it uses speech-to-text, if it's an image it uses OCR text recognition, if it's a CSV or Excel it uses a spreadsheet reader → The backend then sends the extracted text to Grok AI with a MeetingTaskExtractor instruction: "Extract actionable tasks from this meeting. For each task give: title, description, who should do it, priority, and deadline." → Grok AI returns a list of tasks → For each task, the backend saves it to the database, broadcasts it via WebSocket, and syncs it to Zoho if connected → The backend also saves the meeting record to the database → Returns a summary with the extracted tasks to the browser

---

## 9) File Processing

User uploads a file (PDF, Excel, Image, Word, CSV, or text) → The browser sends it to the backend → The backend extracts the raw text using the appropriate library depending on the file type → Then the backend splits this text into smaller overlapping pieces: it takes the first 1000 characters, then the next piece starts at character 800 and goes to character 1800, then the next starts at 1600 and goes to 2600, and so on — the 200-character overlap ensures no meaning is lost at the boundaries between pieces → This splitting is done by a simple custom function in the backend that just cuts the text at specific positions (no external library needed)

For each piece, the backend generates a vector fingerprint: it sends the piece to an AI Embedding service (OpenAI's embedding model) which returns a list of 1536 numbers that represent the meaning of that text → If the embedding service is unavailable, the backend falls back to generating random numbers as a temporary fingerprint using a math library

All these fingerprints are stored in the vector database (Qdrant) along with the original text and the file name

Then the backend sends the full document text to Grok AI with a summary instruction: "Extract key metrics, people, companies, amounts, decisions, and action items from this document" → Grok AI returns a structured summary → The backend saves the document metadata (file name, type, length, summary, key findings) to the regular database

**Searching later:** When a user types a search query, the backend converts that query into the same kind of vector fingerprint → It searches the vector database for the most similar fingerprints → Returns the matching text pieces with their relevance scores

---

## 10) Dashboard

User lands on the Dashboard page → The browser fires multiple requests at the same time: fetch KPIs from the database (active goals, completion rate, team size, task counts), fetch goals, fetch tasks, fetch meetings → All the data comes back and the browser displays it in cards, charts, and lists

When the user scrolls down to the AI Insights section, the browser sends a request for insights → The backend asks MasterPromptEngine for the KpiAnalyst agent's data and instruction → MasterPromptEngine fetches the organization profile, goals, tasks, and team from the database → It looks up the KpiAnalyst persona instruction: "You are a business analytics expert. Given goals, tasks, and team data, suggest the most relevant KPIs to track" → Sends everything to Grok AI → AI returns KPI suggestions → The browser displays them

---

## 11) Market Trends

Owner clicks "Generate Trends" on the Market page → The browser sends a request to the backend → The backend fetches the company's industry from the database → It asks MasterPromptEngine for the MarketAnalyst agent's instruction → MasterPromptEngine finds: "You are a market research analyst. Generate 3 to 5 realistic recent market news articles for this industry. Each article needs a title, source, date, summary, and sentiment score." → This instruction plus the industry details are sent to Grok AI → Grok AI returns 3 to 5 news articles → The backend saves them to the database

Then for each article, the backend sends another request to Grok AI: "How does this trend affect a company in this industry? What are the opportunities, threats, and actions to take?" → Grok AI returns an impact analysis for each article → The backend saves these too

All the news articles and impact analyses are returned to the browser → The browser displays them as news cards with an impact chart

---

## 12) Reports

Owner goes to the Reports page → Selects a period (weekly, monthly, or quarterly) and which sections to include (goals, tasks, team, trends) → Clicks "Generate" → The browser sends the request to the backend → The backend gathers all the requested data from the database → It sends this data to Grok AI with an instruction: "Generate a business report summary based on this data" → Grok AI returns a narrative summary → The backend then uses a PDF generation library (ReportLab) to build a PDF document with a title page, tables for each section, and the AI-generated summary → The PDF file is sent back to the browser → The browser downloads it

---

## 13) Notifications

When any event happens in the system (task created, goal assigned, meeting uploaded, task overdue) → The code that handles that event calls the notification service → This service:
1. Saves a notification record in the database with the user's ID, type, title, and message
2. Checks the user's notification preferences from the database
3. Checks the email rate limit (maximum 50 emails per hour per organization)

Then it sends the notification through the enabled channels:
- **In-app:** Sends the notification to the user's browser in real-time via WebSocket
- **Email:** Sends an email using the email server (SMTP)
- **Push:** Sends a browser push notification using the Web Push service

---

## 14) Zoho Integration

**Connect:**
User goes to Settings → Sees the "Connect Zoho" button → Clicks it → The browser asks the backend for a Zoho login URL → The backend builds a special URL that includes the user's YesBoss ID and the permissions Zoho needs (access to mail tasks and calendar) → The browser opens a popup window with this URL → The user logs into their Zoho account and approves the permissions → Zoho sends a code back to the backend → The backend exchanges this code for an access token and a refresh token by calling Zoho's token exchange service → The backend also fetches the user's Zoho email address → The backend saves all this information (tokens, email, expiry time) to the database → The popup closes → The browser checks the connection status → Shows "Connected" with the user's Zoho email

**Automatic Token Refresh:**
Before every Zoho API call, the backend checks if the saved token is still valid → If it's expired or about to expire, the backend uses the refresh token to get a new access token from Zoho → Saves the new token to the database → Uses the new token for the API call

**Task Sync (YesBoss to Zoho):**
When a task is created, updated, or deleted in YesBoss → The backend gets the owner's Zoho token from the database → Creates or updates the task in Zoho's group task list → Gets the assignee's Zoho token from the database → Creates or updates the task in Zoho's personal to-do list → Stores the Zoho task IDs in the YesBoss database

**Task Sync (Zoho to YesBoss):**
The background scheduler runs every 5 seconds → For every user who has Zoho connected, it fetches their tasks from Zoho's API → It compares each Zoho task with the corresponding task in the YesBoss database → If the status is different, it updates the YesBoss database and sends a real-time notification via WebSocket

**Calendar — Check Availability:**
User adds people to a meeting by typing @ followed by their name → The backend searches the database for matching names and emails → User picks a date and start/end times → Clicks "Check Availability" → The backend gets the user's Zoho token from the database → For each person invited, the backend calls Zoho's Calendar API to check if they're busy during that time → Zoho returns busy blocks → The backend checks if any busy block overlaps with the requested time → Returns whether the time slot is free or has conflicts → The browser shows the result

**Calendar — Book Meeting:**
User fills the meeting title and description → Clicks "Book" → The backend gets the user's Zoho token and finds their default calendar → Calls Zoho's Calendar API to create the event on the user's calendar → Then for each attendee who has Zoho connected, the backend gets their token and creates the same event on their calendar too → If an attendee doesn't have Zoho connected, it skips them silently → Returns a confirmation with results for each attendee

---

## 15) Continuous Learning

Every time a task is completed or a goal finishes → A background service records the event in the database (what happened, how long it took, who did it, which department) → It also generates a vector fingerprint of the event and stores it in the vector database for future pattern matching

Periodically, the backend sends a request to Grok AI: "Analyze these patterns and identify bottlenecks in the workflow. Suggest specific improvements." → Grok AI returns bottleneck analysis and suggestions → The backend saves these suggestions to the database

---

## 16) Org Chart

Owner goes to the Team page → Can add team members one by one by filling a form (name, email, role, department, manager) → Or upload a CSV file with all team members at once → Each member is saved to the database

Later, when anyone types @ followed by a name in any task, goal, or meeting → The backend searches the org chart data in the database to find that person's email and assigns the task to them

---

## 17) Scheduler (Background)

When the backend starts, it begins a loop that runs forever:
- Every 5 seconds: Check Zoho for any task changes and check if any tasks are overdue
- Every 5 minutes: Do a deeper Zoho sync and check goal progress
- Every 28 hours: Generate scheduled daily reports

---

## 18) WebSocket (Real-Time)

When a user opens any page in the app, the browser opens a permanent connection to the backend using WebSocket technology → The backend remembers this connection and maps it to the user and their organization

Whenever something changes (a task is created, a goal is updated, a notification is sent) → The backend looks up all connections for that organization and pushes the update to every connected browser → The browser updates instantly without needing to refresh the page

---

## 19) Prompt Engine (Context Builder)

This is the central brain that provides the right instructions and data to every Grok AI call.

When any feature needs AI help, it calls MasterPromptEngine with the name of the agent it needs (like "GoalArchitect", "MarketAnalyst", or "FinanceExpert")

MasterPromptEngine has two internal dictionaries that control everything:

**First dictionary — Agent Section Map:**
This maps each agent to the data it needs. For example:
- GoalArchitect needs: organization profile, goals, tasks, team, documents, website, and past patterns
- MarketAnalyst needs: organization profile and website only
- KpiAnalyst needs: organization profile, goals, tasks, and team
- CompanyAnalyst needs: no data from the database (it works with whatever it's given)
- DepartmentClassifier needs: no data from the database

If the requested agent is not found in this map, MasterPromptEngine uses the **Default** agent which needs: organization profile, goals, tasks, team, and documents.

MasterPromptEngine looks up the requested agent in this map and fetches only the needed data sections from the database and vector database.

**Second dictionary — Persona Instructions:**
This contains the actual instruction text for each agent. For example:
- GoalArchitect: "You are an AI Goal Architect who helps define and refine business goals..."
- MarketAnalyst: "You are a market research analyst who generates realistic market news..."
- FinanceExpert: "You are a Finance Expert AI Agent who analyzes financial health..."
- And 20+ more personas

MasterPromptEngine looks up the requested agent in this dictionary and gets the persona instruction.

**Putting it all together:**
MasterPromptEngine takes all the fetched data sections, adds the persona instruction, adds a timestamp, and returns one complete block of text to the feature that requested it → The feature adds the user's specific question to this block → Sends everything to Grok AI → Grok AI processes it and returns a response → The feature extracts what it needs from the response

This way, every AI call gets exactly the right data and the right instructions without any feature having to know how to gather data or write prompts.

---

## 20) Expert Agents

When a user asks a question in the Executive Chat, the backend creates 6 expert agent objects and runs them all simultaneously:

1. **FinanceAgent** — Asks MasterPromptEngine for its persona instruction ("You are a Finance Expert") → Gets company data from MasterPromptEngine → Sends the question plus data to Grok AI → Gets back financial analysis

2. **OperationsAgent** — Gets persona "You are an Operations Expert" → Calls Grok AI → Gets operations analysis

3. **WorkflowAgent** — Gets persona "You are a Workflow Expert" → Calls Grok AI → Gets workflow automation suggestions

4. **ForecastingAgent** — Gets persona "You are a Forecasting Expert" → Calls Grok AI → Gets predictions

5. **IndustryIntelligenceAgent** — Gets persona "You are an Industry Expert" → Calls Grok AI → Gets market and competitor analysis

6. **OrgUnderstandingAgent** — Gets persona "You are an Org Expert" → Calls Grok AI → Gets team structure analysis

Each agent returns: its analysis, recommendations, confidence level, and a timestamp

After all 6 return, the backend sends all their responses plus the original question to Grok AI one more time with the BusinessAnalyst persona: "Synthesize these expert analyses into one clear answer" → Grok AI returns a unified response → The backend saves it to the conversation history → Returns the main answer plus all 6 expert panels to the browser

---

## Summary: When AI Asks for Document Uploads

| Situation | What AI asks you to upload | Why |
|---|---|---|
| No financial data | Financial statements or P&L | To check revenue, costs, and profits |
| No strategy docs | Business plan or strategy document | To understand the company direction |
| No team info | Team roster or org chart | To know who does what |
| No process docs | SOPs or workflow documents | To find bottlenecks in processes |
| No market data | Market research or competitor analysis | To check market position |
| No past reports | Previous reports or dashboards | To track progress over time |
| General gap | Any relevant document | To fill what's missing |

After upload: The file is processed (text extracted → split into overlapping pieces → each piece converted to a vector fingerprint → stored in vector database) → AI re-analyzes with the new data → Better answer

---

## Summary: All Agents (25 Total)

| Agent | Used In | What It Does |
|---|---|---|
| **MasterPromptEngine** | All AI features | The brain — provides the right instructions and fetches the right data for every AI call |
| **StrategyAdvisor** | Executive Chat, Strategy | Long-term strategic thinking, competitive analysis, market positioning |
| **TaskPlanner** | Assistant (delegate) | Breaks down goals into actionable tasks with dependencies and timelines |
| **GoalArchitect** | Goals | Generates strategies, creates tasks, chats about goal details with probing questions |
| **PersonaBuilder** | Owner onboarding | Asks personalized questions about leadership style, vision, challenges |
| **EmployeePersonaBuilder** | Employee onboarding | Asks personalized onboarding questions about work style and tools |
| **OnboardingAssistant** | Owner onboarding | Explains capabilities and guides the owner through first goals |
| **CompanyAnalyst** | Organization onboarding | Figures out the company's industry from its website content |
| **CompanyResearcher** | Organization onboarding | Finds verified company info like description, size, location |
| **GoalSuggester** | Organization onboarding | Suggests relevant goals and documents to upload |
| **SocialVerifier** | Organization onboarding | Verifies which social media links found on website are genuine |
| **DepartmentClassifier** | Goals | Picks which department a goal belongs to |
| **IntentClassifier** | Assistant | Figures out if a message is chat, action, or delegate |
| **DataDiagnoseSystem** | Assistant | Checks if the AI has enough data to answer a question |
| **ChatAssistant** | Assistant | Answers general questions using company data if available |
| **BusinessAnalyst** | Executive Chat | Combines all expert responses into one clear answer |
| **FinanceAgent** | Executive Chat | Analyzes financial health, costs, and revenue |
| **OperationsAgent** | Executive Chat | Analyzes how work flows and finds bottlenecks |
| **WorkflowAgent** | Executive Chat | Finds automation opportunities |
| **ForecastingAgent** | Executive Chat | Predicts future trends and growth |
| **IndustryIntelligenceAgent** | Executive Chat | Analyzes market trends and competitors |
| **OrgUnderstandingAgent** | Executive Chat | Analyzes team structure and roles |
| **MarketAnalyst** | Market Trends | Generates market news articles and impact analysis |
| **KpiAnalyst** | Dashboard | Suggests relevant KPIs based on company data |
| **MeetingTaskExtractor** | Meetings | Reads meeting notes and creates action tasks |
| **ContinuousLearning** | Learning | Records patterns and finds bottlenecks over time |
| **ZohoOAuth** | Zoho Connect | Handles Zoho login and automatic token refresh |
| **ZohoMailTasks** | Zoho Tasks | Syncs tasks between YesBoss and Zoho |
| **ZohoCalendar** | Zoho Calendar | Checks availability and books meetings in Zoho |
| **ConnectionManager** | WebSocket | Manages real-time connections to browsers |
| **OnboardingChatbot** | Employee onboarding | Python class that manages the question flow (8 topics to cover) |
| **MasterAgent** | Owner onboarding | LangGraph step-by-step guided flow that tracks conversation state and understanding level |

---

## Summary: Technology Used

| Technology | Used In | What For |
|---|---|---|
| Firebase Auth | Signup/Login | Creating and verifying user accounts |
| Firebase Admin | Forgot Password | Generating password reset links |
| Supabase | Login | Backup method for verifying user identity |
| MongoDB (Database) | All features | Stores all business data: users, companies, goals, tasks, meetings, files, notifications, Zoho tokens, team members, patterns, reports |
| Qdrant (Vector Database) | File Processing, Learning | Stores text fingerprints for smart similarity search |
| Grok AI (xAI) | All AI features | Powers chat, analysis, strategy generation, task creation, summaries, classifications |
| OpenAI Embedding API | File Processing | Generates vector fingerprints from text chunks |
| WebSocket | Real-time updates | Pushes updates instantly to browsers without page refresh |
| SMTP Email Server | Notifications | Sends email notifications |
| Web Push Service | Notifications | Sends browser push notification popups |
| httpx (Python library) | Zoho, External APIs | Makes HTTP calls to Zoho and other external APIs |
| requests + BeautifulSoup (Python libraries) | Onboarding | Scrapes company website content |
| pandas (Python library) | File Processing, Org Chart | Reads Excel and CSV files |
| PyMuPDF (Python library) | File Processing | Reads text from PDF files |
| python-docx (Python library) | File Processing | Reads text from Word documents |
| pytesseract (Python library) | File Processing | Reads text from images using OCR |
| ReportLab (Python library) | Reports | Creates downloadable PDF documents |
| numpy (Python library) | File Processing | Generates fallback random vectors when embedding service is unavailable |
| Custom chunking function | File Processing | A simple Python function that splits long text into smaller overlapping pieces (no external library needed — just cuts at character positions) |
| Background asyncio loop | Scheduler | Runs scheduled tasks every few seconds |
| Regex (Python pattern matching) | Assistant | Falls back to keyword rules when AI classification fails |
