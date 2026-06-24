# Technical Architecture

## YesBoss — An AI-Powered Enterprise Intelligent System and Digital CEO Layer for Modern Organizations

| Field | Detail |
|-------|--------|
| **Document Owner** | Engineering / Architecture |
| **Version** | 2.0 |
| **Status** | Final |
| **Date** | June 2026 |
| **Confidentiality** | Internal |
| **Codebase** | `backend/app/` (Python FastAPI) + `frontend/src/` (Next.js 16) |
| **Traceability** | BRD: REQ-13–REQ-28, PRD: TA-01–TA-20 |

---

## 1. System Architecture Overview

### 1.1 High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                                  CLIENT LAYER                                              │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐   │
│  │                    NEXT.JS 16 APPLICATION (Vercel - app.yesboss.ai)                │   │
│  │                                                                                     │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐              │   │
│  │  │ Landing      │ │ Auth         │ │ Onboarding   │ │ Dashboard    │              │   │
│  │  │ app/page.tsx │ │ app/login/   │ │ onboarding/  │ │ dashboard/   │              │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘              │   │
│  │                                                                                     │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐              │   │
│  │  │ Executive    │ │ Tasks/       │ │ Goals/       │ │ Reports/    │              │   │
│  │  │ Chat         │ │ Pipeline     │ │ Detail       │ │ Market      │              │   │
│  │  │ dashboard/   │ │ dashboard/   │ │ goals/[id]/  │ │ dashboard/  │              │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘              │   │
│  │                                                                                     │   │
│  │  [16 Zustand Stores] [14 UI Primitives] [TailwindCSS v4] [Firebase SDK] [Recharts]  │   │
│  └────────────────────────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────┬───────────────────────────────────────────────────┘
                                        │ HTTPS (api.yesboss.ai) / WebSocket (/ws)
                                        ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                                API GATEWAY LAYER                                           │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐   │
│  │                    FASTAPI APPLICATION (Railway/Render)                             │   │
│  │  backend/app/main.py → Uvicorn ASGI server                                         │   │
│  │                                                                                     │   │
│  │  ┌──────────────────────────────────────────────────────────────────────────────┐  │   │
│  │  │  Middleware Stack (backend/app/main.py):                                      │  │   │
│  │  │  ├─ CORS (backend/app/core/config.py → origins list)                         │  │   │
│  │  │  ├─ Security Headers (HSTS, XSS, nosniff — backend/app/main.py)              │  │   │
│  │  │  ├─ Request Timing (per-request latency tracking)                             │  │   │
│  │  │  ├─ Auth Verification (backend/app/dependencies/auth.py)                      │  │   │
│  │  │  └─ Error Handler (global exception handlers in main.py)                      │  │   │
│  │  └──────────────────────────────────────────────────────────────────────────────┘  │   │
│  │                                                                                     │   │
│  │  ┌──────────────────────────────────────────────────────────────────────────────┐  │   │
│  │  │                    28 API ROUTE MODULES (backend/app/api/)                    │  │   │
│  │  │                                                                               │  │   │
│  │  │  auth.py │ organizations.py │ employees.py │ goals.py │ tasks.py              │  │   │
│  │  │  dashboard.py │ executive_chat.py │ assistant.py │ chatbot.py                │  │   │
│  │  │  master_agent.py │ expert_agents.py │ intelligence.py │ scrape.py            │  │   │
│  │  │  social.py │ upload.py │ file_processing.py │ reports.py │ market_trends.py   │  │   │
│  │  │  meetings.py │ notifications.py │ notification_preferences.py                 │  │   │
│  │  │  push_subscriptions.py │ learning.py │ org_chart.py │ prompt.py              │  │   │
│  │  │  zoho_auth.py │ zoho_calendar.py │ websocket.py │ health.py                  │  │   │
│  │  └──────────────────────────────────────────────────────────────────────────────┘  │   │
│  └────────────────────────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────┬───────────────────────────────────────────────────┘
                                        │
          ┌─────────────────────────────┼─────────────────────────────┐
          ▼                             ▼                             ▼
┌─────────────────────┐  ┌─────────────────────────┐  ┌─────────────────────────┐
│    SERVICE LAYER     │  │  AI ORCHESTRATION LAYER  │  │   EXTERNAL INTEGRATIONS  │
│ backend/app/core/    │  │  backend/app/agents/     │  │                         │
│                      │  │                          │  │  Firebase Auth          │
│  database.py ────────┤  │  master_agent.py         │  │  (backend/app/core/      │
│  (Motor async)       │  │  (LangGraph state graph) │  │   firebase_admin.py)    │
│                      │  │                          │  │                         │
│  ai_client.py ───────┤  │  expert_agents.py        │  │  Zoho API               │
│  (5 provider         │  │  (6 expert agents,       │  │  (backend/app/core/     │
│   abstraction)       │  │   parallel via Send())   │  │   zoho/)                │
│                      │  │                          │  │                         │
│  prompt_engine.py ───┤  │  Executive Chat flow:    │  │  Firecrawl              │
│  (20+ persona       │  │  POST /executive-chat/    │  │  (backend/app/core/     │
│   templates)        │  │  → classify intent        │  │   scraper.py)           │
│                      │  │  → invoke experts (6x)  │  │                         │
│  cache.py ──────────┤  │  → synthesize response   │  │  SMTP (email_service)  │
│  (SimpleCache +     │  │  → extract action items   │  │                         │
│   Redis-ready)       │  │  → return to client      │  │  Web Push API           │
│                      │  │                          │  │  (notification_service) │
│  file_processor.py   │  │  Master Agent flow:      │  │                         │
│  (PDF/DOCX/XLSX/IMG) │  │  analyze → question →    │  │  Supabase (supabase_    │
│                      │  │  update → loop or exit   │  │   client.py — unused)  │
│  scraper.py ────────┤  │                          │  │                         │
│  (BS4 + Firecrawl)   │  │  Onboarding AI:           │  │                         │
│                      │  │  POST /agent/chat        │  │                         │
│  scheduler.py ──────┤  │  → iterative questioning │  │                         │
│  (asyncio loop,     │  │  → understanding_level    │  │                         │
│   5-min interval)    │  │  → persona building      │  │                         │
│                      │  │                          │  │                         │
│  report_generator.py │  │                          │  │                         │
│  (ReportLab PDF)     │  │                          │  │                         │
│                      │  │                          │  │                         │
│  socket_manager.py   │  │                          │  │                         │
│  (WebSocket mgmt)    │  │                          │  │                         │
└──────────┬───────────┘  └────────────┬──────────────┘  └──────────┬──────────────┘
           │                           │                            │
           └───────────────────────────┼────────────────────────────┘
                                       │
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                                   DATA LAYER                                               │
│                                                                                            │
│  ┌────────────────────────┐  ┌────────────────────────┐  ┌───────────────────────────┐   │
│  │ MongoDB Atlas (M10+)   │  │ Qdrant Cloud           │  │ SimpleCache (In-Memory)    │   │
│  │ backend/app/core/      │  │ backend/app/core/      │  │ backend/app/core/cache.py │   │
│  │ database.py            │  │ qdrant.py               │  │                           │   │
│  │                        │  │                        │  │ LRU eviction, max 1000     │   │
│  │ 22 collections         │  │ 3 collections:         │  │ TTL: 60s default           │   │
│  │ 40+ indexes            │  │ - documents (1536-dim) │  │ Key format: f"{route}:     │   │
│  │ Async via Motor        │  │ - conversations        │  │   {args}"                  │   │
│  │ _ensure_collections()   │  │ - workflows            │  │                           │   │
│  │ at startup             │  │ Cosine distance        │  │ Redis migration path:      │   │
│  │                        │  │ OpenAI embeddings      │  │ import redis; RedisCache() │   │
│  └────────────────────────┘  └────────────────────────┘  └───────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Architecture Principles

| # | Principle | Rationale | File/Implementation |
|---|-----------|-----------|-------------------|
| APR-01 | **API-First Design** | All functionality through REST APIs; frontend is one consumer, enabling future clients | `backend/app/api/v1/__init__.py` — all routes under `/api/v1/` |
| APR-02 | **AI Provider Abstraction** | All LLM providers behind unified interface; switching providers requires no code changes | `backend/app/core/ai_client.py` — `AIClient` class |
| APR-03 | **Stateless Backend** | API servers are stateless; session in Firebase/cookies; horizontal scaling possible | JWT in httpOnly cookie, no server-side session |
| APR-04 | **Lazy Connections** | DB clients connect on first use, not at startup | `backend/app/core/database.py` — `get_db()` dependency |
| APR-05 | **Single Agent Orchestrator** | Master Agent (LangGraph) is single AI entry point; prevents agent sprawl | `backend/app/agents/master_agent.py` |
| APR-06 | **Parallel Agent Execution** | Expert agents run in parallel via LangGraph Send() | `backend/app/agents/expert_agents.py` |
| APR-07 | **Caching with Fallback** | SimpleCache → Redis-ready; cache misses degrade to DB | `backend/app/core/cache.py` |
| APR-08 | **Embedding with Fallback** | Primary OpenAI; deterministic fallback if API unavailable | `backend/app/core/ai_client.py` — `get_embeddings()` |
| APR-09 | **Progressive Enhancement** | Core features work without AI; AI is additive | Graceful degradation table (Section 8) |

---

## 2. Technology Stack

### 2.1 Backend (Python FastAPI)

| Component | Technology | Version | File Reference | Purpose |
|-----------|------------|---------|----------------|---------|
| **Runtime** | Python | 3.11+ | `backend/requirements.txt` | Application runtime |
| **Web Framework** | FastAPI | Latest | `backend/app/main.py` | REST API framework |
| **ASGI Server** | Uvicorn | Latest | `backend/run.py` | Production server |
| **Database Driver** | Motor | Latest | `backend/app/core/database.py` | MongoDB async access |
| **Vector DB** | Qdrant Client | Latest | `backend/app/core/qdrant.py` | Semantic search |
| **Auth** | Firebase Admin SDK | Latest | `backend/app/core/firebase_admin.py` | Server-side auth verification |
| **AI Client** | Custom (httpx) | — | `backend/app/core/ai_client.py` | Multi-provider AI abstraction |
| **Agent Framework** | LangGraph | Latest | `backend/app/agents/master_agent.py` | State graph for agent workflows |
| **Web Scraping** | BeautifulSoup4 + Requests | Latest | `backend/app/core/scraper.py` | Website content extraction |
| **File Processing** | PyMuPDF, Pandas, python-docx, Pillow + pytesseract | Latest | `backend/app/core/file_processor.py` | Document text extraction |
| **PDF Generation** | ReportLab | Latest | `backend/app/core/report_generator.py` | Report PDF generation |
| **Real-time** | WebSockets (Starlette) | — | `backend/app/api/websocket.py`, `core/socket_manager.py` | Live updates |
| **Background Tasks** | asyncio | — | `backend/app/core/scheduler.py` | Scheduler, reminders, sync |
| **Email** | smtplib | — | `backend/app/core/email_service.py` | Email notifications |
| **Push Notifications** | pywebpush | Latest | `backend/app/core/notification_service.py` | Browser push |
| **Validation** | Pydantic v2 | Latest | `backend/app/schemas/` | Data validation |
| **Caching** | SimpleCache + redis-py | Latest | `backend/app/core/cache.py` | Response caching |

### 2.2 Frontend (Next.js + TypeScript)

| Component | Technology | Version | File Reference | Purpose |
|-----------|------------|---------|----------------|---------|
| **Framework** | Next.js | 16.2.6 | `frontend/package.json` | App Router, SSR/SSG |
| **Language** | TypeScript | 5.x | `frontend/tsconfig.json` | Type safety |
| **Styling** | TailwindCSS | v4 | `frontend/src/app/globals.css` | Utility-first CSS |
| **UI Primitives** | Radix UI | Latest | `frontend/src/components/ui/` | Accessible, unstyled components |
| **State Management** | Zustand | v5 | `frontend/src/stores/` (16 stores) | Lightweight state with persist |
| **Charts** | Recharts | Latest | `frontend/src/components/owners/DashboardView.tsx` | Data viz |
| **Auth Client** | Firebase Auth SDK | Latest | `frontend/src/lib/firebase.ts`, `frontend/src/contexts/AuthContext.tsx` | Client-side auth |
| **Font** | Geist | — | `frontend/src/app/layout.tsx` | Primary typeface |
| **CSS Utils** | clsx, tailwind-merge, cva | Latest | `frontend/src/components/ui/Button.tsx` | Class management |
| **Icons** | Lucide React | Latest | `frontend/src/components/` | Icon library |

### 2.3 Infrastructure

| Component | Platform | Config File | Purpose |
|-----------|----------|-------------|---------|
| **Frontend Hosting** | Vercel | `frontend/next.config.ts`, Vercel project | Next.js deployment |
| **Backend Hosting** | Railway / Render | `backend/Procfile` (if exists), Railway project | Python FastAPI |
| **Database** | MongoDB Atlas (M10+) | `backend/.env` → `MONGODB_URL` | Primary data store |
| **Vector Database** | Qdrant Cloud | `backend/.env` → Qdrant URL+API key | Vector search |
| **Authentication** | Firebase | `firebase-credentials.json`, `frontend/.env.local` | Auth, OTP, sessions |
| **Monitoring** | Sentry + BetterUptime | `frontend/next.config.ts` (Sentry), API health checks | Errors + uptime |
| **CI/CD** | GitHub Actions | `.github/workflows/` | Build/test/deploy |
| **DNS** | Vercel DNS | Custom domain: app.yesboss.ai | Production URL |

### 2.4 Environment Configuration

| Env | Frontend URL | Backend URL | DB Instance | Config Source |
|-----|-------------|-------------|-------------|---------------|
| **Development** | `localhost:3000` | `localhost:8000` | Local/Dev Atlas | `backend/.env`, `frontend/.env.local` |
| **Staging** | `staging.yesboss.ai` | `staging-api.yesboss.ai` | Staging Atlas | Vercel/Railway env vars |
| **Production** | `app.yesboss.ai` | `api.yesboss.ai` | Production Atlas (M10+) | Vercel/Railway env vars |

---

## 3. Request Lifecycle

### 3.1 Standard API Request

```
Client (Browser)                          Files Involved
    │
    ├─ 1. HTTPS → api.yesboss.ai/api/v1/...
    │      Headers: Cookie (JWT), Content-Type
    │
    ▼
FastAPI Middleware Stack                  backend/app/main.py
    │
    ├─ 2. CORS Middleware                 config.py → origins
    ├─ 3. Security Headers                main.py → add_security_headers()
    ├─ 4. Request Timer                   main.py → timing_middleware()
    │
    ▼
Route Handler                            backend/app/api/{module}.py
    │
    ├─ 5. Dependency Injection            backend/app/dependencies/auth.py
    │   ├─ Auth: Verify JWT → Firebase Admin → user_id, org_id
    │   │   ├─ Valid → continue
    │   │   └─ Invalid → HTTP 401
    │   ├─ DB: get_db() → Motor client    backend/app/core/database.py
    │
    ▼
Business Logic                           Route handler function
    │
    ├─ 6. Execute handler
    │   ├─ Query MongoDB → Process
    │   ├─ Cache check (GET: SimpleCache)  backend/app/core/cache.py
    │   └─ AI call if needed               backend/app/core/ai_client.py
    │
    ▼
Response
    │
    ├─ 7. Pydantic validate response
    ├─ 8. Cache response (if GET)
    ├─ 9. Return { "ok": true, "data": {...} }
    │
    ▼
Client receives JSON
```

### 3.2 AI Chat Request Lifecycle

Detailed flow for Executive Chat (`POST /api/v1/executive-chat/` → `backend/app/api/executive_chat.py`):

```
Client: User sends message in Executive Chat (frontend/src/app/dashboard/chat/page.tsx)
    │
    ├─ chatStore → POST /api/v1/executive-chat/    (frontend/src/stores/chatStore.ts)
    │
    ▼
1. Route Handler → executive_chat.py                (backend/app/api/executive_chat.py)
    │
    ├─ 2. Get conversation history from MongoDB      (conversations collection)
    ├─ 3. Get org context (goals, tasks, metrics)    (goals, tasks collections)
    │
    ▼
4. MasterPromptEngine.build_chat_context()           (backend/app/core/prompt_engine.py)
    │
    ├─ Combines: system_prompt + history + org_context + user_message
    ├─ Uses business_analyst persona template
    │
    ▼
5. AIClient.chat_complete()                          (backend/app/core/ai_client.py)
    │
    ├─ Primary: xAI Grok (grok-3)      30s timeout
    │   └─ Fail → Fallback: OpenAI GPT-4o   30s
    │       └─ Fail → Fallback: Anthropic Claude  30s
    │           └─ Fail → Fallback: Gemini Pro  30s
    │               └─ All fail → return 503 AI_PROVIDER_DOWN
    │
    ▼
6. Intent Classification (from AI response)
    │
    ├─ Determine which expert agents to invoke
    ├─ Map: finance keywords → Finance agent, ops keywords → Operations agent, etc.
    │
    ▼
7. Parallel Execution via LangGraph Send()           (backend/app/agents/expert_agents.py)
    │
    ├─ ⊕ Finance:   FinanceExpert.analyze() → MongoDB financial data → AI
    ├─ ⊕ Operations: OperationsExpert.analyze() → MongoDB operational metrics → AI
    ├─ ⊕ Strategy:  StrategyExpert.analyze() → goals + market data → AI
    ├─ ⊕ HR:        HrExpert.analyze() → employee data → AI
    ├─ ⊕ Sales:     SalesExpert.analyze() → sales data → AI
    ├─ ⊕ Product:   ProductExpert.analyze() → product metrics → AI
    │
    ▼
8. Result Synthesis                                 (backend/app/api/executive_chat.py)
    │
    ├─ Collect all 6 agent responses
    ├─ AIClient.chat_complete() with synthesis prompt
    ├─ Extract action items from response
    │
    ▼
9. Store conversation: MongoDB (messages[]) + Qdrant (vector embedding)
    │
    ▼
10. Return: { "response": "...", "action_items": [...], "agentsInvoked": [...] }
```

### 3.3 File Upload → Vector Search Lifecycle

```
POST /api/v1/upload/process                         (backend/app/api/upload.py)
    │
    ▼
1. File Processing Pipeline                         (backend/app/core/file_processor.py)
    │
    ├─ 1a. Validate file type (accept: PDF, DOCX, XLSX, CSV, PNG, JPG)
    ├─ 1b. Validate file size (max 25MB)
    ├─ 1c. Save to /uploads/{org_id}/ directory
    │
    ├─ 2. Extract text:
    │   ├─ PDF → PyMuPDF (fitz)
    │   ├─ DOCX → python-docx
    │   ├─ XLSX/CSV → pandas
    │   └─ Image → Pillow + pytesseract OCR
    │
    ├─ 3. Text chunking: 1000 chars, 200 overlap
    │
    ├─ 4. Embedding:                              (backend/app/core/ai_client.py)
    │   ├─ Primary: OpenAI text-embedding-3-small (1536-dim)
    │   └─ Fallback: deterministic hash
    │
    ├─ 5. Store in Qdrant: documents collection    (backend/app/core/qdrant.py)
    │   └─ Payload: { text, org_id, filename, chunk_index }
    │
    ├─ 6. Store metadata in MongoDB: documents collection
    │
    └─ 7. Response: { chunks_count, file_id, aiInsights? }
```

### 3.4 WebSocket Connection Lifecycle

```
Client connects: ws://localhost:8000/ws?token={jwt}&org_id={orgId}
    │
    ▼
WebSocket Route                                     (backend/app/api/websocket.py)
    │
    ├─ 1. Auth: Verify JWT, extract user_id + org_id
    ├─ 2. Socket Manager: register connection      (backend/app/core/socket_manager.py)
    │   ├─ Key: f"{org_id}:{user_id}"
    │   ├─ Store: { websocket, connected_at }
    │
    ├─ 3. Listen for incoming events:
    │   ├─ task:status:change → update task status
    │   ├─ notification:read → mark notification read
    │   └─ ping → send pong
    │
    ├─ 4. Push events to connected clients:
    │   ├─ task:created / task:updated / task:deleted
    │   ├─ notification:new
    │   ├─ goal:updated
    │   └─ team:update
    │
    ▼
Client receives event → Zustand store update → UI re-render
```

---

## 4. Component Architecture (Frontend)

### 4.1 Directory Structure with File Paths

```
frontend/src/
├── app/                                    # 24 page routes (Next.js App Router)
│   ├── layout.tsx                          # Root layout: ThemeProvider, Navbar, Sidebar
│   ├── page.tsx                            # Landing page
│   ├── globals.css                         # TailwindCSS v4 + design tokens
│   ├── middleware.ts                       # Route protection + role-based redirects
│   ├── login/page.tsx                      # Login (email + phone OTP tabs)
│   ├── signup/page.tsx                     # Multi-step signup
│   ├── forgot-password/page.tsx            # 4-step password reset
│   ├── onboarding/
│   │   ├── owner/page.tsx                  # 10-step owner wizard
│   │   └── employee/page.tsx               # 4-step employee wizard
│   ├── goals/[id]/page.tsx                 # Goal detail with strategies + chat
│   ├── tasks/page.tsx                      # Task list view
│   ├── tasks/[id]/page.tsx                 # Task detail with comments
│   └── dashboard/
│       ├── page.tsx                        # Main dashboard (role-aware)
│       ├── chat/page.tsx                   # Executive Chat (owner only)
│       ├── assistant/page.tsx              # AI Assistant (employee)
│       ├── task/page.tsx                   # Task pipeline (Kanban + list)
│       ├── reports/page.tsx                # Employee reports + org health
│       ├── market/page.tsx                 # Market trends + recommendations
│       ├── notifications/page.tsx          # Notifications list
│       ├── settings/page.tsx              # User/organization settings
│       ├── team/page.tsx                   # Team management
│       ├── orchestration/page.tsx          # Org chart
│       ├── ai/page.tsx                     # AI features hub
│       ├── data/page.tsx                   # Data management
│       └── profile/page.tsx                # User profile
├── components/
│   ├── ui/                                 # 14 base primitives (Radix UI wrappers)
│   │   ├── Button.tsx                      # cva-based variant: primary/secondary/ghost
│   │   ├── Input.tsx                       # Label + input + error/helper text
│   │   ├── Select.tsx                      # Radix Select wrapper
│   │   ├── Card.tsx                        # Configurable card with header/content/footer
│   │   ├── Modal.tsx                       # Radix Dialog wrapper
│   │   ├── Badge.tsx                       # Status/priority badges
│   │   ├── Avatar.tsx                      # Image + initials fallback
│   │   ├── Checkbox.tsx                    # Radix Checkbox wrapper
│   │   ├── Tabs.tsx                        # Radix Tabs wrapper
│   │   ├── Textarea.tsx                    # Resizable textarea
│   │   ├── Tooltip.tsx                     # Radix Tooltip wrapper
│   │   ├── DropdownMenu.tsx                # Radix Dropdown Menu wrapper
│   │   ├── Label.tsx                       # Form label component
│   │   └── index.ts                        # Barrel exports
│   ├── owners/                             # 13 owner-specific composites
│   │   ├── DashboardView.tsx               # Owner KPI grid + insights
│   │   ├── TaskView.tsx                    # Kanban board + list toggle
│   │   ├── GoalDetailChat.tsx              # Goal-refinement AI chat
│   │   ├── OrgHealthWidget.tsx             # Org health gauge
│   │   ├── KPISuggestionsCard.tsx          # AI-suggested KPIs
│   │   ├── EmployeeReportCard.tsx          # Employee performance summary
│   │   ├── MarketImpactCard.tsx            # Market news with impact analysis
│   │   ├── MeetingUploadModal.tsx          # Meeting transcript upload
│   │   ├── OrchestrationView.tsx           # Org hierarchy view
│   │   ├── SuggestedDocumentsCard.tsx      # Document recommendations
│   │   ├── YourFilesCard.tsx               # Uploaded files list
│   │   ├── ZohoCalendarBooking.tsx         # Zoho calendar booking UI
│   │   └── ZohoConnectButton.tsx           # Zoho OAuth connection button
│   └── (22 top-level shared composites)
│       ├── Navbar.tsx                      # Top navigation bar
│       ├── DashboardLayout.tsx             # Sidebar + main content wrapper
│       ├── AIInsights.tsx                  # AI insight cards with type variants
│       ├── AISummaryChat.tsx               # Contextual AI chat summary
│       ├── ThemeProvider.tsx               # Dark/light mode context
│       ├── ThemeToggle.tsx                 # Theme switch button
│       ├── ThemeToggleInline.tsx           # In-page theme toggle
│       ├── NotificationDropdown.tsx        # Bell icon + dropdown
│       ├── NotificationToast.tsx           # Toast notification component
│       ├── NotificationWatcher.tsx         # WebSocket → Zustand bridge
│       ├── ProtectedRoute.tsx              # Auth guard wrapper
│       ├── TaskCard.tsx                    # Task card (used in Kanban/list)
│       ├── TaskModal.tsx                   # Task create/edit modal
│       ├── GoalModal.tsx                   # Goal create/edit modal
│       ├── HeroSection.tsx                 # Landing page hero
│       ├── Features.tsx                    # Landing features section
│       ├── Testimonials.tsx                # Landing testimonials
│       ├── FAQ.tsx                         # Landing FAQ section
│       ├── CTASection.tsx                  # Landing CTA section
│       ├── Footer.tsx                      # Landing page footer
│       ├── DashboardPreview.tsx            # Landing dashboard preview
│       └── Integrations.tsx                # Integration logos section
├── contexts/
│   └── AuthContext.tsx                     # Firebase auth state provider
├── hooks/
│   ├── useWebSocket.ts                     # WebSocket connection hook
│   └── useAIDashboardAdaptation.ts         # AI-driven dashboard adaptation
├── lib/
│   ├── firebase.ts                         # Firebase client SDK init
│   ├── supabase-client.ts                  # Supabase init (unused legacy)
│   ├── supabase.ts                         # Supabase client (unused legacy)
│   ├── utils.ts                            # General utilities
│   ├── pushNotifications.ts                # Push notification service worker
│   ├── onboarding-data.ts                  # Onboarding step definitions
│   └── documentTemplates.ts                # Document templates
├── stores/                                 # 16 Zustand stores
│   ├── index.ts                            # Barrel re-exports
│   ├── organizationStore.ts                # Org data + persist
│   ├── taskStore.ts                        # Task CRUD + persist
│   ├── goalStore.ts                        # Goal CRUD + persist
│   ├── chatStore.ts                        # Chat messages + persist
│   ├── userStore.ts                        # User profile + persist
│   ├── uiStore.ts                          # UI state (sidebar, modals)
│   ├── sessionStore.ts                     # Session state + persist
│   ├── kpiStore.ts                         # KPI data + persist
│   ├── notificationStore.ts                # Notifications list
│   ├── marketTrendsStore.ts               # Market data
│   ├── assistantStore.ts                   # AI assistant state
│   ├── documentStore.ts                    # Documents/files
│   ├── reportStore.ts                      # Reports data
│   ├── orgChartStore.ts                    # Org chart state
│   ├── dashboardStore.ts                   # Dashboard configuration
│   └── zohoStore.ts                        # Zoho integration state
```

### 4.2 State Flow Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        COMPONENT LAYER                             │
│                                                                    │
│  Page Components ← → Feature Components ← → UI Components         │
│  (app/*/page.tsx)    (owners/*, shared/*)   (ui/*)                │
│         │                      │                   │              │
└─────────┼──────────────────────┼───────────────────┘              │
          │                      │                                   │
          ▼                      ▼                                   │
┌──────────────────────────────────────────────────────────────────┐
│                      ZUSTAND STORE LAYER                           │
│                                                                    │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  Data Stores (persisted):                                  │   │
│  │  taskStore │ goalStore │ chatStore │ orgStore │ userStore   │   │
│  │  sessionStore │ kpiStore                                   │   │
│  │                                                            │   │
│  │  State: { data, loading, error } × atomic                 │   │
│  │  Actions: fetch, create, update, delete → API calls        │   │
│  │  Middleware: persist (localStorage keys: "*-storage")      │   │
│  │  Hydration: on app mount, rehydrate from localStorage      │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  Live Stores (not persisted):                              │   │
│  │  uiStore │ notificationStore │ marketTrendsStore           │   │
│  │  assistantStore │ documentStore │ reportStore              │   │
│  │  orgChartStore │ dashboardStore │ zohoStore               │   │
│  └────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────┬────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│                      API LAYER (fetch/axios)                       │
│                                                                    │
│  Base URL: NEXT_PUBLIC_API_URL=http://localhost:8000 (dev)        │
│  Credentials: include (cookies for JWT auth)                      │
│  Error handling: per-store catch blocks + global toast            │
│  WebSocket: real-time updates bypass API (Zustand direct update)  │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

### 4.3 WebSocket Integration

```
┌──────────────────┐          WebSocket          ┌──────────────────┐
│  Frontend         │ ◄══════════════════════════►│  Backend          │
│  (Browser)        │                              │  (FastAPI)        │
│  hooks/           │                              │  api/websocket.py │
│  useWebSocket.ts  │                              │  core/            │
└───────┬───────────┘                              │  socket_manager.py│
        │                                          └───────┬──────────┘
        │                                                    │
        │  Events received:                                   │  Events sent:
        │  • task:created → taskStore.addTask()               │  • task:created
        │  • task:updated → taskStore.updateTask()            │  • task:updated
        │  • task:deleted → taskStore.removeTask()            │  • task:overdue
        │  • task:overdue → notificationStore.add() + toast   │  • goal:updated
        │  • goal:updated → goalStore.updateGoal()            │  • notification:new
        │  • notification:new → toast popup                   │  • team:update
        │  • team:update → dashboardStore.addActivity()       │  • system:alert
        │  • system:alert → global alert banner               │
        │                                                    │
        │  Connection: wss://api.yesboss.ai/ws               │
        │  ?token={jwt}&org_id={orgId}                       │
        │  Reconnect: exponential backoff (1s → 30s max)     │
        │                                                    │
        ▼                                                    ▼
   Zustand store state update                     Socket Manager
   → React re-render                               (app/core/socket_manager.py)
                                                  → connections: Dict[str, List[WebSocket]]
                                                  → broadcast_to_org(org_id, event, payload)
```

---

## 5. AI Architecture

### 5.1 AI Provider Abstraction

```
┌─────────────────────────────────────────────────────────────────────┐
│                  AIClient (backend/app/core/ai_client.py)            │
│                                                                      │
│  async def chat_complete(system_prompt, user_message, context)       │
│  async def get_embeddings(text) → List[float]                        │
│                                                                      │
│  ┌───────────────────┐  ┌───────────────────┐  ┌──────────────────┐ │
│  │ xAI Grok (PRIMARY)│  │ OpenAI (Fallback 1)│  │ Anthropic (F/2) │ │
│  │ model: grok-3     │  │ model: gpt-4o      │  │ model: claude-3 │ │
│  │ timeout: 30s       │  │ timeout: 30s       │  │ timeout: 30s    │ │
│  └───────────────────┘  └───────────────────┘  └──────────────────┘ │
│                                                                      │
│  ┌───────────────────┐  ┌───────────────────┐                       │
│  │ Gemini (Fallback 3)│  │ Qwen (Fallback 4) │                       │
│  │ model: gemini-pro │  │ via Ollama (local)│                       │
│  │ timeout: 30s       │  │ timeout: 60s       │                       │
│  └───────────────────┘  └───────────────────┘                       │
│                                                                      │
│  Features:                                                           │
│  • Per-provider timeout configurable per call                        │
│  • Exponential backoff: 1s → 2s → 4s (3 retries max)               │
│  • Circuit breaker: 5 consecutive failures → skip 60s               │
│  • Token usage tracking: { provider, prompt_tokens, completion_tokens, cost } │
│  • Embedding fallback: deterministic hash if all providers fail      │
│  • All providers configured via environment variables (.env)        │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Agent Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│              MASTER AGENT (backend/app/agents/master_agent.py)       │
│                                                                      │
│  Framework: LangGraph (StateGraph)                                   │
│                                                                      │
│  State: AgentState {                                                 │
│      user_id: str,                                                   │
│      org_id: str,                                                    │
│      conversation_id: str,                                           │
│      conversation_history: List[Message],                            │
│      understanding_level: int (0-100),                               │
│      missing_info: List[str],                                        │
│      persona_profile: Dict,                                          │
│      current_phase: str,                                             │
│      collected_data: Dict                                            │
│  }                                                                   │
│                                                                      │
│  Graph Nodes:                                                        │
│    analyze_node → classify intent, extract entities from message     │
│    question_node → generate follow-up questions for missing info     │
│    update_node → update AgentState with new information              │
│                                                                      │
│  Graph Edges:                                                        │
│    analyze → question → update → analyze (loop until done)           │
│    Condition: understanding_level >= 80 or all_topics_covered → exit │
│                                                                      │
│  Entry Point: POST /api/v1/agent/init → POST /api/v1/agent/chat     │
│  Used in: Onboarding wizard (POST /api/v1/agent/chat)               │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│              EXPERT AGENTS (backend/app/agents/expert_agents.py)     │
│                                                                      │
│  Base Class: BaseExpertAgent                                         │
│  Method: async def analyze(org_data: Dict, query: str) → Dict        │
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │
│  │ FinanceExpert    │  │ OperationsExpert │  │ StrategyExpert   │      │
│  │ Persona:         │  │ Persona:         │  │ Persona:         │      │
│  │ Financial analyst│  │ Operations cons. │  │ Strategic advisor│      │
│  │ Data: revenue,   │  │ Data: capacity,  │  │ Data: goals,     │      │
│  │ burn rate, P&L   │  │ bottlenecks, KPIs│  │ market position  │      │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘      │
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │
│  │ HrExpert         │  │ SalesExpert      │  │ ProductExpert    │      │
│  │ Persona:         │  │ Persona:         │  │ Persona:         │      │
│  │ HR specialist    │  │ Revenue strateg. │  │ Product manager  │      │
│  │ Data: headcount, │  │ Data: pipeline,  │  │ Data: roadmap,   │      │
│  │ satisfaction     │  │ conversion       │  │ feature usage    │      │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘      │
│                                                                      │
│  Execution: Via LangGraph Send() API                                 │
│  Parallel HTTP calls to AI provider for each agent                   │
│  Result: List[Dict] → synthesized into single response               │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.3 Prompt Engine Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│              MasterPromptEngine (backend/app/core/prompt_engine.py)  │
│                                                                      │
│  20+ Persona Templates:                                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │
│  │business_     │ │strategy_     │ │task_planner  │ │goal_       │ │
│  │analyst       │ │advisor       │ │              │ │architect   │ │
│  ├──────────────┤ ├──────────────┤ ├──────────────┤ ├────────────┤ │
│  │persona_      │ │employee_     │ │onboarding_   │ │kpi_analyst │ │
│  │builder       │ │persona       │ │assistant     │ │            │ │
│  ├──────────────┤ ├──────────────┤ ├──────────────┤ ├────────────┤ │
│  │expert_       │ │expert_       │ │expert_       │ │market_     │ │
│  │finance       │ │operations    │ │workflow      │ │analyst     │ │
│  ├──────────────┤ ├──────────────┤ ├──────────────┤ ├────────────┤ │
│  │expert_       │ │expert_       │ │expert_       │ │report_     │ │
│  │strategy      │ │hr            │ │sales         │ │generator   │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘ │
│                                                                      │
│  Context Builder method:                                             │
│  async def build_chat_context(org_id, user_id, conversation_id)      │
│      ├─ MongoDB: goals, tasks, employees, documents, metrics         │
│      ├─ Qdrant: semantic search on relevant docs/conversations       │
│      ├─ User: persona profile, preferences, history                  │
│      └─ Returns: str (combined prompt with system + context + query) │
│                                                                      │
│  Each template is a Jinja2-style string with {{ context }} vars      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. Data Flow Architecture

### 6.1 Core Data Flows

#### Goal → Strategy → Task Generation

```
Flow: frontend/src/app/onboarding/owner/page.tsx → backend/app/api/goals.py → AI
                                                                               
User creates goal (or accepts AI suggestion)                                   
    │                                                                          
    ▼                                                                          
POST /api/v1/goals (title, description, department, timeline)                  
    │                     File: backend/app/api/goals.py                       
    ▼                                                                          
MongoDB: goals collection → document created                                   
    │                                                                          
User clicks "Generate Strategies"                                              
    │                                                                          
POST /api/v1/goals/{id}/generate-strategies                                    
    │                                                                          
    ├─ PromptEngine.build("goal_architect") + goal context                      
    ├─ AIClient.chat_complete() → 2-3 strategies                               
    ├─ MongoDB update: goals.strategies[]                                      
    │                                                                          
User selects strategy → "Generate Tasks"                                       
    │                                                                          
POST /api/v1/goals/{id}/generate-tasks                                         
    │                                                                          
    ├─ PromptEngine.build("task_planner") + goal + strategy                    
    ├─ AIClient.chat_complete() → 3-7 tasks                                    
    ├─ MongoDB: tasks collection → documents created                           
    ├─ WebSocket push → Notify assignees                                       
    │                                                                          
Tasks visible in employee dashboards                                           
```

#### Report Generation

```
Flow: frontend/src/app/dashboard/reports/page.tsx → backend/app/api/reports.py
                                                                               
Owner selects employee + period                                                 
    │                                                                          
POST /api/v1/reports/generate                                                  
    │                     File: backend/app/api/reports.py                     
    ▼                                                                          
backend/app/core/report_generator.py:                                          
    ├─ 1. Query tasks collection: completed tasks in period for employee       
    ├─ 2. Calculate stats: completion rate, on-time %, overdue count           
    ├─ 3. AIClient.chat_complete() with report_analyst persona                
    │      → Generate strengths, improvements, recommendation                 
    ├─ 4. ReportLab: generate PDF with scorecard + AI analysis + charts       
    ├─ 5. Store in MongoDB: reports collection                                 
    └─ 6. Return: { data } + downloadUrl                                      
```

#### Org Health Scoring

```
Flow: frontend/src/components/owners/OrgHealthWidget.tsx → backend/app/api/reports.py
                                                                               
GET /api/v1/reports/org-health?orgId=...                                      
    │                     File: backend/app/api/reports.py                    
    ▼                                                                          
Score Engine (inline in reports.py):                                           
    ├─ 1. Goal Completion (weight: 25%): active vs completed goals            
    ├─ 2. Task Quality (weight: 20%): on-time %, approval rate                
    ├─ 3. Org Structure (weight: 15%): defined hierarchy, filled roles        
    ├─ 4. Team Performance (weight: 25%): tasks/employee, velocity            
    ├─ 5. Market Position (weight: 15%): market data freshness, engagement    
    │                                                                          
    ├─ Weighted calculation: Σ(dimension.score × dimension.weight)            
    ├─ Trend: compare with last month's score (from historical data)          
    ├─ Recommendation: AIClient with strategy_advisor persona                  
    │                                                                          
    └─ Return: { overallScore, dimensions[], trend, topRecommendation }       
```

---

## 7. Architecture Decision Records (ADRs)

| ADR | Decision | Rationale | Date |
|-----|----------|-----------|------|
| ADR-01 | **FastAPI over Django/Flask** | Async native, Pydantic validation, auto OpenAPI docs, perf | Sprint 1 |
| ADR-02 | **MongoDB Atlas over PostgreSQL** | Schema flexibility for evolving documents, JSON-native for AI output | Sprint 1 |
| ADR-03 | **Zustand over Redux/Context** | Minimal boilerplate, built-in persist middleware, TypeScript-native | Sprint 1 |
| ADR-04 | **Radix UI over MUI/Chakra** | Unstyled primitives → full design control, accessible by default, tree-shakeable | Sprint 1 |
| ADR-05 | **LangGraph over LangChain Agent** | State graph gives explicit control flow, better for multi-agent orchestration | Sprint 3 |
| ADR-06 | **Firebase Auth over Auth0/Clerk** | Phone OTP as primary auth (Indian market), integrated with existing stack | Sprint 1 |
| ADR-07 | **TailwindCSS v4 over CSS Modules** | Design tokens as CSS variables, JIT compilation, smaller bundle | Sprint 1 |
| ADR-08 | **Qdrant over Pinecone/Weaviate** | Self-hosted option, excellent Python SDK, free tier for MVP | Sprint 1 |
| ADR-09 | **WebSocket over SSE/Polling** | Bidirectional real-time needed for task updates + notifications | Sprint 5 |
| ADR-10 | **ReportLab over jsPDF/Puppeteer** | Server-side PDF generation, no client overhead, Python-native | Sprint 9 |
| ADR-11 | **xAI Grok as primary AI** | Cost-effective, long context, good for multi-agent synthesis | Sprint 1 |
| ADR-12 | **SimpleCache before Redis** | No external dependency for MVP; drop-in Redis upgrade path | Sprint 1 |

---

## 8. Error Handling Architecture

### 8.1 Global Exception Handlers

Defined in `backend/app/main.py`:

| Exception | HTTP Status | error_code | Handler |
|-----------|-------------|------------|---------|
| HTTPException (FastAPI) | As raised | `HTTP_XXX` | `http_exception_handler` |
| ValidationError (Pydantic) | 422 | `VALIDATION_ERROR` | `validation_exception_handler` |
| AuthError | 401 | `AUTH_*` | `auth_exception_handler` |
| ResourceNotFound | 404 | `RESOURCE_NOT_FOUND` | `not_found_handler` |
| AIProviderError | 503 | `AI_PROVIDER_DOWN` | `ai_exception_handler` |
| DatabaseError | 503 | `DB_TIMEOUT` | `db_exception_handler` |
| RateLimitError | 429 | `RATE_LIMITED` | `rate_limit_handler` |
| Any unhandled | 500 | `INTERNAL_ERROR` | `generic_exception_handler` |

### 8.2 Error Response Format

```json
{
    "ok": false,
    "detail": "Goal not found with ID: 665a...",
    "error_code": "RESOURCE_NOT_FOUND",
    "field": "goal_id",
    "timestamp": "2026-06-20T10:00:00Z",
    "trace_id": "req_abc123"
}
```

### 8.3 Error Code Catalog

| Code | HTTP | Description | Raised By |
|------|------|-------------|-----------|
| `AUTH_INVALID_TOKEN` | 401 | JWT missing/expired/invalid | `backend/app/dependencies/auth.py` |
| `AUTH_INSUFFICIENT_ROLE` | 403 | Role lacks permission | `backend/app/dependencies/auth.py` |
| `VALIDATION_ERROR` | 422 | Request body fails Pydantic | `backend/app/schemas/` |
| `RESOURCE_NOT_FOUND` | 404 | Resource not in DB | All route modules |
| `RESOURCE_CONFLICT` | 409 | Duplicate resource | `organizations.py`, `auth.py` |
| `RATE_LIMITED` | 429 | Too many requests | `backend/app/main.py` middleware |
| `AI_PROVIDER_DOWN` | 503 | All providers unavailable | `backend/app/core/ai_client.py` |
| `AI_TIMEOUT` | 504 | AI response timeout | `backend/app/core/ai_client.py` |
| `DB_TIMEOUT` | 503 | DB query timeout (>5s) | `backend/app/core/database.py` |
| `FILE_TOO_LARGE` | 400 | Upload exceeds 25MB | `backend/app/api/upload.py` |
| `UNSUPPORTED_FILE_TYPE` | 400 | File format not supported | `backend/app/core/file_processor.py` |
| `SCRAPE_BLOCKED` | 400 | Website blocked scraping | `backend/app/core/scraper.py` |
| `ZOHO_API_ERROR` | 502 | Zoho API returned error | `backend/app/core/zoho/base.py` |
| `ZOHO_TOKEN_EXPIRED` | 401 | Zoho re-auth needed | `backend/app/core/zoho/base.py` |
| `EXTERNAL_SERVICE_DOWN` | 503 | Third-party unavailable | Various |

### 8.4 Graceful Degradation Table

| Service Down | Degraded Behavior | Fallback Mechanism |
|-------------|-------------------|-------------------|
| AI Provider (xAI) | Auto-fallback to OpenAI → Anthropic → Gemini → Qwen | `backend/app/core/ai_client.py` — chain of fallbacks |
| All AI Providers | Return 503 AI_PROVIDER_DOWN, frontend shows "AI temporarily unavailable" | Frontend shows cached insights |
| MongoDB | Return cached response if available; else "Service temporarily unavailable" | `backend/app/core/cache.py` — SimpleCache fallback |
| Qdrant | Return empty vector search results | Skip semantic search, use keyword only |
| Firebase Auth | Read-only mode; cached JWT still valid until expiry | JWT sliding expiration carries through |
| Zoho API | Disconnect integration; show "Zoho sync paused" | `backend/app/core/zoho/base.py` token refresh + retry |
| WebSocket | Fallback to polling every 30s | `frontend/src/hooks/useWebSocket.ts` — auto reconnection + polling fallback |
| File Processor | Reject upload with file type error | Client-side validation first |
| Scraper | Return manual input fallback | `backend/app/core/scraper.py` — multiple detection strategies |

---

## 9. Security Architecture

### 9.1 Authentication Flow

```
Client (Browser)              FastAPI                    Firebase Admin SDK
                                                         
Firebase Auth SDK                                        
signInWithEmailAndPassword()                             
  │                                                        
  ├─ Firebase verifies credentials                        
  │                                                        
  ├─ Returns idToken (JWT)                                
  │                                                        
  ├─ POST /auth/login (idToken) → backend/app/api/auth.py
  │     │                                                  
  │     ├─ firebase_admin.py → verify_id_token(idToken)  
  │     │     File: backend/app/core/firebase_admin.py    
  │     │                                                  
  │     ├─ Extract uid, create custom JWT                 
  │     ├─ Set httpOnly cookie: token={custom_jwt}        
  │     │     secure=true, httponly=true, sameSite=lax    
  │     │     maxAge=30days                               
  │     │                                                  
  │     └─ Return user profile                            
  │                                                        
All subsequent requests:                                  
  ├─ Cookie: token={jwt}                                  
  ├─ Auth middleware: verify JWT → extract user_id, org_id
  └─ File: backend/app/dependencies/auth.py               
```

### 9.2 Authorization Matrix

Implemented in `backend/app/dependencies/auth.py` via `require_role(role)` and `require_org_access()`.

| Resource | Owner | Manager | Employee | Implementation |
|----------|-------|---------|----------|----------------|
| Organization Profile | CRUD | Read | Read | `organizations.py` — ownerId check |
| Goals (Org) | CRUD | CRUD | Read | `goals.py` — orgId + role check |
| Tasks (Assigned) | Read | Read | CRUD | `tasks.py` — assigneeId check |
| Tasks (Department) | Read | CRUD | Read | `tasks.py` — manager's dept check |
| Employees (All) | CRUD | Read | Read | `employees.py` — orgId check |
| Employees (Dept) | CRUD | CRUD | Read | `employees.py` — manager override |
| Reports | CRUD | Read | Read | `reports.py` — role-based |
| Executive Chat | Full | — | — | `executive_chat.py` — owner only |
| AI Assistant | — | Full | Full | `assistant.py` — employee role |
| Settings (Org) | CRUD | — | — | `organizations.py` — owner only |
| Settings (Personal) | CRUD | CRUD | CRUD | `users.py` — userId check |

### 9.3 Security Headers

Applied in `backend/app/main.py`:

| Header | Value | Purpose |
|--------|-------|---------|
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` | Enforce HTTPS |
| X-Content-Type-Options | `nosniff` | Prevent MIME sniffing |
| X-Frame-Options | `DENY` | Prevent clickjacking |
| X-XSS-Protection | `1; mode=block` | XSS filter |
| Referrer-Policy | `strict-origin-when-cross-origin` | Referrer control |
| Permissions-Policy | `camera=(), microphone=(), geolocation=()` | Feature restriction |

---

## 10. Monitoring & Observability

### 10.1 Logging

Configured in `backend/app/main.py`:

| Log Level | Events | Output |
|-----------|--------|--------|
| ERROR | Unhandled exceptions, AI provider failures, DB timeouts | stderr + Sentry |
| WARNING | Rate limit near, cache miss, slow query (>200ms) | stderr |
| INFO | Route access, auth events, task creation | stdout |
| DEBUG | AI prompts/responses, DB queries | stdout (dev only) |

### 10.2 Sentry Configuration

| Property | Value |
|----------|-------|
| Frontend DSN | Configured in `frontend/next.config.ts` |
| Backend DSN | Configured in `backend/.env` → `SENTRY_DSN` |
| Traces Sample Rate | 0.1 (10% of requests) |
| Profiling | Enabled for performance monitoring |
| Source Maps | Uploaded during frontend build |

### 10.3 Health Check Endpoint

```
GET /api/v1/health → backend/app/api/health.py

Response:
{
    "ok": true,
    "status": "healthy",
    "version": "1.0.0",
    "services": {
        "database": { "status": "connected", "latency_ms": 12 },
        "qdrant": { "status": "connected", "latency_ms": 45 },
        "ai": { "status": "available", "provider": "xAI" },
        "firebase": { "status": "connected" }
    },
    "uptime_seconds": 3600,
    "timestamp": "2026-06-20T10:00:00Z"
}
```

### 10.4 Performance Monitoring

| Metric | Target | Measurement | Tool |
|--------|--------|-------------|------|
| API response (non-AI) | <200ms P50, <500ms P95 | Request timing middleware | Sentry + custom |
| API response (AI) | <3s P50, <5s P95 | AI client timing | Sentry |
| Page load (LCP) | <2s | Lighthouse CI | Lighthouse |
| DB query time | <50ms P95 | MongoDB profiler | MongoDB Atlas |
| Embedding generation | <1s per 10 chunks | Manual timing | Logs |
| WebSocket latency | <100ms | Socket ping/pong | Custom |
| Concurrent users | 1,000 | Load test | k6/locust |

---

## 11. Deployment Architecture

### 11.1 CI/CD Pipeline

Configured in `.github/workflows/`:

```
Git Push → GitHub
    │
    ▼
GitHub Actions
    │
    ├─ 1. Lint
    │   ├─ Frontend: npx next lint (ESLint)
    │   └─ Backend: ruff check (Python lint)
    │
    ├─ 2. Test
    │   ├─ Frontend: npm test (unit + integration)
    │   └─ Backend: pytest (unit + API integration)
    │
    ├─ 3. Build
    │   ├─ Frontend: npm run build (Next.js)
    │   └─ Backend: python -m py_compile (syntax check)
    │
    ├─ 4. Deploy (on main branch)
    │   ├─ Frontend: Vercel Production (app.yesboss.ai)
    │   └─ Backend: Railway Production (api.yesboss.ai)
    │
    └─ 5. Health Check
        ├─ GET https://api.yesboss.ai/api/v1/health → 200
        └─ GET https://app.yesboss.ai → 200
```

### 11.2 Environment Variables

**Backend** (`backend/.env` or Railway env vars):
```
MONGODB_URL=mongodb+srv://<user>:<pass>@cluster.mongodb.net/yesboss_db?retryWrites=true
OPENAI_API_KEY=sk-...
XAI_API_KEY=...
ANTHROPIC_API_KEY=...
GEMINI_API_KEY=...
QWEN_API_BASE=http://localhost:11434
FIRECRAWL_API_KEY=...
FIREBASE_CREDENTIALS=path/to/firebase-credentials.json
SMTP_HOST=smtp.zoho.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
ZOHO_CLIENT_ID=...
ZOHO_CLIENT_SECRET=...
CORS_ORIGINS=http://localhost:3000,https://app.yesboss.ai
SENTRY_DSN=...
```

**Frontend** (`frontend/.env.local` or Vercel env vars):
```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
```

---

## 12. Scaling Strategy

| Concern | Current (MVP) | Scaling Target | Migration Path |
|---------|---------------|----------------|----------------|
| **API Throughput** | Single Uvicorn (4 workers) | Multi-instance behind nginx/ALB | Add Railway replicas, add load balancer |
| **Database** | MongoDB M10 (2GB RAM) | M30+ with sharding | Atlas scaling slider |
| **Vector DB** | Qdrant free (1GB, 1 node) | Qdrant paid (horizontal shards) | Upgrade plan in Qdrant Cloud |
| **Caching** | SimpleCache (in-memory, single process) | Redis Cluster (ElastiCache/Upstash) | Replace `SimpleCache` import with `RedisCache` — same interface |
| **AI Cost** | Per-token, all requests to xAI | Batch processing + local Ollama for simple | Add request classifier: simple → Ollama, complex → xAI |
| **Background Tasks** | asyncio loop (single process) | Celery + Redis (distributed workers) | Extract scheduler.py → Celery tasks |
| **File Storage** | Local `/uploads/` | AWS S3 / Google Cloud Storage | Replace file save/read with S3 SDK calls |
| **Monitoring** | Sentry + basic logging | Full OpenTelemetry + Grafana | Add OTel SDK, ship to Grafana Cloud |
| **CDN** | Vercel Edge Network | Custom CDN for Asia/Europe | Vercel already has global edge |

---

## 13. Performance Benchmarks

| Metric | P50 Target | P95 Target | Measurement Method |
|--------|-----------|-----------|-------------------|
| GET /api/v1/health | <50ms | <100ms | Request timing middleware |
| GET /api/v1/tasks (list, 20 items) | <100ms | <200ms | Request timing middleware |
| GET /api/v1/dashboard/insights | <300ms | <500ms | Request timing middleware |
| POST /api/v1/executive-chat/ | <3s | <5s | AI client timing |
| POST /api/v1/upload/process (1MB PDF) | <2s | <5s | File processor timing |
| POST /api/v1/goals/{id}/generate-tasks | <3s | <5s | AI client timing |
| WebSocket push to 100 clients | <50ms | <100ms | Socket manager timing |
| First Contentful Paint (FCP) | <1.5s | <2s | Lighthouse |
| Largest Contentful Paint (LCP) | <2s | <3s | Lighthouse |
| Cumulative Layout Shift (CLS) | <0.1 | <0.1 | Lighthouse |

---

## 14. Database Index Strategy

Maintained by `backend/app/core/database.py` → `_ensure_collections()`:

| Collection | Compound Indexes | Query Patterns |
|------------|-----------------|----------------|
| users | `{ uid: 1 }` (unique), `{ email: 1 }`, `{ orgId: 1 }` | Auth lookup, org membership |
| organizations | `{ domain: 1 }` (unique), `{ ownerId: 1 }`, `{ industry: 1 }` | Signup domain check, owner query |
| employees | `{ userId: 1 }` (unique), `{ orgId: 1 }`, `{ managerId: 1 }`, `{ orgId: 1, department: 1 }` | Org roster, department filter |
| goals | `{ orgId: 1, status: 1 }`, `{ orgId: 1, department: 1 }`, `{ timeline.end: 1 }` | Dashboard, department goals |
| tasks | `{ orgId: 1, assigneeId: 1, status: 1 }`, `{ orgId: 1, status: 1, deadline: 1 }`, `{ goalId: 1 }` | Pipeline, overdue, goal tasks |
| conversations | `{ userId: 1, type: 1, createdAt: -1 }`, `{ updatedAt: -1 }` | Chat history |
| notifications | `{ userId: 1, read: 1, createdAt: -1 }` | Notification list |
| documents | `{ orgId: 1, createdAt: -1 }`, `{ userId: 1 }` | File list |
| meetings | `{ orgId: 1, meetingDate: -1 }` | Meeting list |
| zoho_tokens | `{ orgId: 1 }` (unique) | Zoho token lookup |
| org_chart_members | `{ orgId: 1, level: 1 }`, `{ parentId: 1 }` | Org tree queries |
| push_subscriptions | `{ userId: 1 }` | Push notification target |
| reports | `{ orgId: 1, employeeId: 1, period: -1 }` | Report history |
| learning_patterns | `{ orgId: 1, type: 1 }` | Learning analytics |
| api_logs | `{ timestamp: -1 }` (TTL: 30 days) | Debug logging |

---

*End of Technical Architecture — YesBoss v2.0*
