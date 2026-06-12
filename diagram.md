# YesBoss - Complete Flow Diagram

```mermaid
flowchart TB
    U[("👤 User<br/>Owner / Employee")]

    subgraph FE["🌐 FRONTEND - Next.js + React"]
        direction TB
        LOGIN["Login / Signup<br/>Firebase Auth"]
        DASH["📊 Dashboard<br/>KPI Cards + AI Insights"]
        CHAT["💬 Executive AI Chat<br/>AISummaryChat.tsx"]
        GOALS["🎯 Goal Management<br/>Pipeline + Refinement Chat"]
        TASKS["✅ Task Pipeline<br/>Drag-drop + Status"]
        ORG["🏢 Org Chart<br/>Hierarchical Tree"]
        FILES["📁 File Upload<br/>PDF/DOCX/XLSX/CSV"]
        REPORTS["📄 Report Generator"]
        NOTIF["🔔 Notifications"]
        
        STORE[("Zustand Store<br/>16 state stores")]
    end

    subgraph API["🔌 BACKEND API - FastAPI (29 Routers)"]
        direction TB
        R1["/auth"]
        R2["/organizations"]
        R3["/goals + /goals/{id}/chat"]
        R4["/tasks"]
        R5["/dashboard"]
        R6["/executive-chat"]
        R7["/expert-agents"]
        R8["/intelligence"]
        R9["/org-chart"]
        R10["/uploads + /files"]
        R11["/reports"]
        R12["/notifications"]
        R13["/learning"]
        WS["WebSocket<br/>Real-time"]
    end

    subgraph AI["🧠 AI ORCHESTRATION"]
        direction TB
        subgraph ENGINE["MasterPromptEngine<br/>(prompt_engine.py)"]
            CTX["Context Builder<br/>Queries MongoDB + Qdrant<br/>for: org, goals, tasks,<br/>team, docs, website, patterns"]
            PERS["Persona Selector<br/>20+ Agent Personas"]
        end

        AGENTS["🤖 AI Agents<br/><br/>Business Analyst<br/>Strategy Advisor<br/>Task Planner<br/>Goal Architect<br/>Finance Expert<br/>Operations Expert<br/>Workflow Expert<br/>Forecasting Expert<br/>Industry Intel Expert<br/>Org Understanding Expert<br/>KPI Analyst<br/>Market Analyst<br/>Company Analyst<br/>Department Classifier<br/>Onboarding Assistant"]
        
        CLIENT["AI Client<br/>(ai_client.py)"]
        
        subgraph PROVIDERS["LLM Providers"]
            XAI["xAI Grok 3<br/>(Primary)"]
            OAI["OpenAI GPT-4o"]
            ANT["Anthropic Claude"]
        end
        
        LEARN["📈 Learning Loop<br/>Tracks user patterns<br/>→ improves suggestions"]
    end

    subgraph DATA["💾 DATA STORES"]
        MONGO[("MongoDB Atlas<br/><br/>users<br/>organizations<br/>goals<br/>tasks<br/>org_chart_members<br/>documents<br/>conversations<br/>notifications<br/>user_patterns<br/>reports")]
        QDRANT[("Qdrant Cloud<br/><br/>Document Embeddings<br/>Conversation Vectors<br/>Workflow Vectors")]
        REDIS[("Redis Cache")]
    end

    subgraph FILE_PROC["📂 FILE PROCESSING PIPELINE"]
        EXTRACT["Extract Text<br/>PDF → PyMuPDF<br/>DOCX → python-docx<br/>XLSX → pandas<br/>Images → OCR"]
        CHUNK["Chunk & Embed<br/>1000 chars per chunk<br/>200 overlap"]
        ANALYSIS["AI Deep Analysis<br/>Extracts: metrics,<br/>entities, decisions,<br/>action items"]
    end

    %% FLOWS
    U --> LOGIN
    LOGIN -->|Authenticated| DASH
    DASH --> CHAT & GOALS & TASKS & ORG & FILES & REPORTS
    
    CHAT --> R6
    GOALS --> R3
    TASKS --> R4
    DASH --> R5
    ORG --> R9
    FILES --> R10
    REPORTS --> R11

    R6 -->|"User question + context"| ENGINE
    R3 -->|"Goal refinement"| ENGINE
    R7 -->|"Expert query"| ENGINE
    R5 -->|"KPI suggestions"| ENGINE
    R8 -->|"Domain analysis"| ENGINE

    ENGINE -->|"Build context"| CTX
    CTX -->|"Fetch data"| MONGO
    CTX -->|"Semantic search"| QDRANT
    ENGINE -->|"Select persona"| PERS

    ENGINE -->|"System prompt +<br/>Context + History"| CLIENT
    CLIENT --> XAI & OAI & ANT
    XAI -->|"Response"| CLIENT
    CLIENT -->|"Structured reply"| R6 & R3

    R10 -->|"Upload file"| EXTRACT
    EXTRACT --> CHUNK
    CHUNK -->|"Store vectors"| QDRANT
    CHUNK -->|"Store text"| MONGO
    CHUNK --> ANALYSIS
    ANALYSIS -->|"Deep insights"| MONGO

    R3 -->|"Update"| WS
    R4 -->|"Update"| WS
    WS -->|"Live push"| DASH & NOTIF
    R12 -->|"Send"| NOTIF
    
    R13 -->|"Track"| LEARN
    LEARN -->|"Store patterns"| MONGO
    LEARN -->|"Feed back"| ENGINE

    %% STYLES
    classDef frontend fill:#1e293b,stroke:#38bdf8,color:#e2e8f0
    classDef api fill:#0f172a,stroke:#818cf8,color:#e2e8f0
    classDef ai fill:#1e1b4b,stroke:#a78bfa,color:#e2e8f0
    classDef data fill:#0c0a1d,stroke:#6366f1,color:#e2e8f0
    classDef filep fill:#1c1917,stroke:#f59e0b,color:#e2e8f0
    classDef user fill:#1e293b,stroke:#f472b6,color:#e2e8f0,stroke-width:3px

    class DASH,CHAT,GOALS,TASKS,ORG,FILES,REPORTS,NOTIF,STORE,LOGIN frontend
    class R1,R2,R3,R4,R5,R6,R7,R8,R9,R10,R11,R12,R13,WS api
    class ENGINE,CTX,PERS,AGENTS,CLIENT,LEARN,PROVIDERS,XAI,OAI,ANT ai
    class MONGO,QDRANT,REDIS data
    class EXTRACT,CHUNK,ANALYSIS filep
    class U user
```

# How It Works (One Paragraph)

**User logs in** → sees Dashboard with KPI cards and AI insights. Can **chat with AI** (asks business questions, AI pulls context from MongoDB + Qdrant and responds via xAI Grok), **manage goals** (create, refine via AI chat with one-question-at-a-time flow), **manage tasks** (linked to goals, drag-drop pipeline), **upload files** (PDF/DOCX/etc → text extraction → embedding → Qdrant → AI can answer questions about them), **build org chart** (upload CSV → hierarchical tree), and **generate reports** (AI summary → PDF/Word download). Everything is **real-time** via WebSocket. AI has **20+ specialized personas** (Finance Expert, Goal Architect, etc.) and **learns continuously** from user patterns to personalize responses.
```
