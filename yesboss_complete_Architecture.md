# YESBOSS — COMPLETE SYSTEM ARCHITECTURE DIAGRAM

```plaintext
                                                  ┌──────────────────────────┐
                                                  │        USERS             │
                                                  │──────────────────────────│
                                                  │ • Owners                 │
                                                  │ • Employees              │
                                                  │ • Admins                 │
                                                  └────────────┬─────────────┘
                                                               │
                                                               │ HTTPS / WSS
                                                               ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                         FRONTEND LAYER                                                       │
├───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                               │
│  Next.js 15 + TypeScript + TailwindCSS + Radix UI + Zustand                                                   │
│                                                                                                               │
│  ┌────────────────────────────┐   ┌────────────────────────────┐   ┌────────────────────────────┐            │
│  │ Landing Page               │   │ Auth Pages                │   │ AI Chat Interface          │            │
│  │ - Hero                     │   │ - Signup                  │   │ - Owner COO Chat           │            │
│  │ - Dashboard Preview        │   │ - Login                   │   │ - Employee Assistant       │            │
│  │ - Integrations             │   │ - OTP Verify              │   │ - Streaming Responses      │            │
│  └────────────────────────────┘   └────────────────────────────┘   └────────────────────────────┘            │
│                                                                                                               │
│  ┌────────────────────────────┐   ┌────────────────────────────┐   ┌────────────────────────────┐            │
│  │ Owner Dashboard            │   │ Employee Dashboard         │   │ Task & Goal System         │            │
│  │ - AI Insights              │   │ - Tasks                    │   │ - Task Creation            │            │
│  │ - Metrics                  │   │ - Productivity             │   │ - Workflow Tracking        │            │
│  │ - Analytics                │   │ - Notifications            │   │ - Approvals                │            │
│  └────────────────────────────┘   └────────────────────────────┘   └────────────────────────────┘            │
│                                                                                                               │
└───────────────────────────────────────────────┬───────────────────────────────────────────────────────────────┘
                                                │
                                                │ REST API / WebSocket
                                                ▼

┌───────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                          FASTAPI BACKEND                                                     │
├───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                               │
│  ┌────────────────────────────┐   ┌────────────────────────────┐   ┌────────────────────────────┐            │
│  │ Authentication Service     │   │ Organization Service       │   │ Employee Service           │            │
│  │ - JWT Verify               │   │ - Org Creation             │   │ - Employee Onboarding      │            │
│  │ - OTP Handling             │   │ - Company Data             │   │ - Hierarchy Building       │            │
│  │ - Session Handling         │   │ - Industry Mapping         │   │ - Department Mapping       │            │
│  └────────────────────────────┘   └────────────────────────────┘   └────────────────────────────┘            │
│                                                                                                               │
│  ┌────────────────────────────┐   ┌────────────────────────────┐   ┌────────────────────────────┐            │
│  │ Goal Management Service    │   │ Task Engine                │   │ Notification Service       │            │
│  │ - Goal Parsing             │   │ - Dependencies             │   │ - Realtime Alerts          │            │
│  │ - AI Task Generation       │   │ - Review System            │   │ - Email / In-app           │            │
│  │ - Priority Detection       │   │ - Workflow Execution       │   │ - Activity Updates         │            │
│  └────────────────────────────┘   └────────────────────────────┘   └────────────────────────────┘            │
│                                                                                                               │
│  ┌────────────────────────────┐   ┌────────────────────────────┐   ┌────────────────────────────┐            │
│  │ File Upload Service        │   │ AI Orchestration Layer     │   │ Memory Retrieval Service   │            │
│  │ - PDF Upload               │   │ - LangGraph                │   │ - Semantic Search          │            │
│  │ - OCR                      │   │ - Agent Routing            │   │ - Context Injection        │            │
│  │ - Chunking                 │   │ - AI Decisions             │   │ - Long-term Recall         │            │
│  └────────────────────────────┘   └────────────────────────────┘   └────────────────────────────┘            │
│                                                                                                               │
└───────────────────────────────────────────────┬───────────────────────────────────────────────────────────────┘
                                                │
          ┌─────────────────────────────────────┼──────────────────────────────────────┐
          │                                     │                                      │
          ▼                                     ▼                                      ▼

┌────────────────────────────┐    ┌────────────────────────────┐    ┌────────────────────────────┐
│     AUTHENTICATION         │    │        DATABASES           │    │       VECTOR MEMORY        │
├────────────────────────────┤    ├────────────────────────────┤    ├────────────────────────────┤
│                            │    │                            │    │                            │
│ Supabase Auth              │    │ MongoDB Atlas              │    │ Qdrant Cloud               │
│                            │    │                            │    │                            │
│ • OTP Login                │    │ Collections:               │    │ • Embeddings               │
│ • JWT Tokens               │    │ - users                    │    │ • AI Memory                │
│ • Role Authentication      │    │ - organizations            │    │ • Workflow Patterns        │
│ • Session Handling         │    │ - employees                │    │ • Semantic Search          │
│                            │    │ - goals                    │    │ • Chat Context             │
│                            │    │ - tasks                    │    │ • File Intelligence        │
│                            │    │ - uploads                  │    │                            │
│                            │    │ - chats                    │    │                            │
│                            │    │ - analytics                │    │                            │
└────────────────────────────┘    └────────────────────────────┘    └────────────────────────────┘


                                                │
                                                ▼

┌───────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                        AI ORCHESTRATION CORE                                                 │
├───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                               │
│                                       LANGGRAPH MASTER AGENT                                                  │
│                                                                                                               │
│ Responsibilities:                                                                                            │
│ • Understand user intent                                                                                     │
│ • Select AI model                                                                                            │
│ • Activate expert agents                                                                                     │
│ • Retrieve memory                                                                                            │
│ • Control workflows                                                                                          │
│ • Merge AI outputs                                                                                           │
│ • Generate final response                                                                                    │
│                                                                                                               │
└───────────────────────────────────────────────┬───────────────────────────────────────────────────────────────┘
                                                │
          ┌─────────────────────────────────────┼──────────────────────────────────────┐
          │                                     │                                      │
          ▼                                     ▼                                      ▼

┌────────────────────────────┐    ┌────────────────────────────┐    ┌────────────────────────────┐
│       EXPERT AGENTS        │    │      TOOLING SYSTEM        │    │      LEARNING SYSTEM       │
├────────────────────────────┤    ├────────────────────────────┤    ├────────────────────────────┤
│                            │    │                            │    │                            │
│ CrewAI Agents              │    │ Firecrawl                  │    │ Continuous Learning        │
│                            │    │ Playwright                 │    │                            │
│ • Finance Agent            │    │ BeautifulSoup              │    │ • Workflow Learning        │
│ • Operations Agent         │    │ OCR Engine                 │    │ • Bottleneck Detection     │
│ • Workflow Agent           │    │ PDF Parser                 │    │ • Productivity Analysis    │
│ • HR Agent                 │    │ Excel Parser               │    │ • Team Pattern Learning    │
│ • Forecasting Agent        │    │ Embedding Generator        │    │ • Behavioral Memory        │
│ • Industry Intelligence    │    │ Website Scraper            │    │                            │
│ • Organization Agent       │    │                            │    │                            │
└────────────────────────────┘    └────────────────────────────┘    └────────────────────────────┘


                                                │
                                                ▼

┌───────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           LLM PROVIDER LAYER                                                  │
├───────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                               │
│  ┌────────────────────────────┐   ┌────────────────────────────┐   ┌────────────────────────────┐            │
│  │ OpenAI GPT                 │   │ Anthropic Claude           │   │ xAI Grok                  │            │
│  │                            │   │                            │   │                            │            │
│  │ • Reasoning                │   │ • Long Context             │   │ • Fast Analysis            │            │
│  │ • Planning                 │   │ • Deep Analysis            │   │ • Realtime-style Answers   │            │
│  │ • AI Coordination          │   │ • Large Documents          │   │ • Dynamic Insights         │            │
│  └────────────────────────────┘   └────────────────────────────┘   └────────────────────────────┘            │
│                                                                                                               │
│                                   ┌────────────────────────────┐                                              │
│                                   │ Qwen 14B                  │                                              │
│                                   │                            │                                              │
│                                   │ • Structured Tasks         │                                              │
│                                   │ • Lower Cost Operations    │                                              │
│                                   │ • Data Extraction          │                                              │
│                                   └────────────────────────────┘                                              │
│                                                                                                               │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

---

# OWNER ONBOARDING FLOW

```plaintext
Signup/Login
      │
      ▼
Email Domain Extraction
      │
      ▼
Website Detection
      │
      ▼
Firecrawl + Playwright Scraping
      │
      ▼
AI Industry Analysis
      │
      ▼
Dynamic AI Questions
      │
      ▼
File Upload Intelligence
      │
      ▼
Embedding + Memory Storage
      │
      ▼
AI Dashboard Generation
```

---

# EMPLOYEE ONBOARDING FLOW

```plaintext
Employee Signup
      │
      ▼
Organization Detection
      │
      ▼
Department Mapping
      │
      ▼
Hierarchy Building
      │
      ▼
Persona Intelligence Chat
      │
      ▼
Workspace Creation
      │
      ▼
AI Productivity Learning
```

---

# CORE TECHNOLOGY STACK

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 + TypeScript |
| Styling | TailwindCSS |
| UI Library | Radix UI |
| State Management | Zustand |
| Backend | FastAPI |
| Authentication | Supabase Auth |
| Database | MongoDB Atlas |
| Vector Database | Qdrant Cloud |
| AI Orchestration | LangGraph |
| Multi-Agent Framework | CrewAI |
| Realtime Engine | Socket.IO |
| Scraping | Firecrawl + Playwright |
| File Processing | OCR + PyPDF |
| Deployment Frontend | Vercel |
| Deployment Backend | Railway / Render |

---

# SYSTEM DESIGN PRINCIPLES

## Frontend Principles
- Server Components where possible
- Client Components only for interactions
- Streaming AI responses
- Modular feature-based architecture
- Reusable component system

## Backend Principles
- Async FastAPI architecture
- Service-layer pattern
- Modular AI orchestration
- Scalable stateless APIs
- Queue-ready architecture

## AI System Principles
- Multi-model AI routing
- Dynamic expert-agent selection
- Long-term semantic memory
- Continuous organizational learning
- Workflow intelligence generation

## Scalability Strategy
- Horizontal backend scaling
- Cloud-native deployment
- Independent AI services
- Distributed memory architecture
- Future-ready event-driven system

