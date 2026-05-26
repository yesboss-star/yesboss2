# YESBOSS — xAI-Only Orchestration Architecture

## Overview

xAI Grok handles **everything** — orchestrator routing, expert agent execution, training/learning, and monitoring. One brain, one API, no local models.

```
                       ┌──────────────────────────────┐
                       │         USER REQUEST          │
                       │  (Owner COO / Employee AI)    │
                       └────────────┬─────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         xAI Grok ORCHESTRATOR                                │
│                                                                              │
│  One model call: determines intent, selects experts, plans execution         │
│                                                                              │
│  Responsibilities:                                                           │
│  • Understand user intent (Owner vs Employee context)                        │
│  • Decompose complex requests into sub-tasks                                 │
│  • Select relevant domain expert(s)                                          │
│  • Manage conversation state + memory (MongoDB + Qdrant)                     │
│  • Call itself (xAI Grok) with different system prompts per domain           │
│  • Synthesize multi-expert outputs into final response                       │
│  • Log trajectories for continuous learning                                 │
│                                                                              │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                    EXPERT AGENTS (xAI Grok — Different System Prompts)       │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Finance     │  │  Operations  │  │  Workflow    │  │  Industry    │     │
│  │  Agent       │  │  Agent       │  │  Agent       │  │  Intel Agent │     │
│  ├──────────────┤  ├──────────────┤  ├──────────────┤  ├──────────────┤     │
│  │ • Finanical  │  │ • Process    │  │ • Task Graph │  │ • Competitor │     │
│  │   Analysis   │  │   Mining     │  │   Generation │  │   Analysis   │     │
│  │ • Budget     │  │ • Supply     │  │ • Dependency │  │ • Market     │     │
│  │   Forecast   │  │   Chain      │  │   Detection  │  │   Research   │     │
│  │ • Cost       │  │ • Resource   │  │ • Timeline   │  │ • Trends     │     │
│  │   Optimize   │  │   Planning   │  │   Estimation │  │   Detection  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  HR Agent    │  │ Forecast     │  │ Organization │  │  Code/Data   │     │
│  │              │  │ Agent        │  │ Agent        │  │  Agent       │     │
│  ├──────────────┤  ├──────────────┤  ├──────────────┤  ├──────────────┤     │
│  │ • Persona    │  │ • Predictive │  │ • Hierarchy  │  │ • Data       │     │
│  │   Analysis   │  │   Analytics  │  │   Builder    │  │   Analysis   │     │
│  │ • Team       │  │ • Trend      │  │ • Department │  │ • Report     │     │
│  │   Dynamics   │  │   Projection │  │   Mapping    │  │   Generation │     │
│  │ • Skills     │  │ • Risk       │  │ • Role       │  │ • Code Gen   │     │
│  │   Mapping    │  │   Assessment │  │   Definition │  │   (analysis) │     │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                                              │
│  Each expert = xAI Grok + domain-specific system prompt                      │
│  No separate models. No local GPU. No routing logic.                         │
│  Orchestrator decides which expert(s) to call, passes context.               │
│                                                                              │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                    LEARNING & MEMORY SYSTEM                                  │
│                                                                              │
│  • Every interaction logged to MongoDB (trajectory logging)                  │
│  • Embeddings stored in Qdrant for semantic retrieval                        │
│  • xAI Grok reviews past interactions periodically to improve responses      │
│  • No separate "Trainer Agent" — xAI is self-aware, you just ask it          │
│    to reflect: "Review recent failures and suggest system prompt changes"    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## HOW IT WORKS — FLOW

### Request Flow (User → Response)

1. **User sends request** — "Analyze our Q3 spending and suggest cuts"
2. **Backend receives request** → calls xAI Grok once with:
   - `system_prompt`: Main orchestrator prompt (knows all experts, routes tasks)
   - `user_message`: The request
   - `context`: Org data, chat history, relevant Qdrant memories
3. **xAI Grok returns structured response**:
   ```json
   {
     "intent": "financial_analysis",
     "experts_needed": ["finance", "industry_intelligence"],
     "task_plan": ["analyze q3 spending", "benchmark against industry"],
     "final_answer": "..."
   }
   ```
4. **Backend fans out** — calls xAI Grok again for each expert with domain-specific prompt + context (or optionally in parallel)
5. **Synthesize** — combine expert outputs + return to user (or have the first call already do this in one shot for simple queries)
6. **Log everything** — trajectory saved to MongoDB + Qdrant for future learning

### Two Execution Modes

| Mode | When | Description |
|------|------|-------------|
| **Single-shot** | Simple questions | One xAI call. The model acts as both orchestrator + expert. Fast. |
| **Multi-step** | Complex requests | Orchestrator call → identifies experts → parallel expert calls → synthesize. Deeper. |

---

## ARCHITECTURE DECISIONS

### Why xAI-Only

| Concern | xAI Handles It |
|---------|---------------|
| Orchestration | Give it a system prompt describing all experts + routing rules |
| Deep reasoning | Grok's native strength |
| Web research | Built-in `web_search` tool |
| Code/data analysis | Built-in `code_execution` tool |
| Learning/improvement | Log trajectories, periodically ask Grok to review + suggest improvements |
| Multi-agent simulation | Call same model with different system prompts = different "experts" |

### No Need For

- Ollama (no local GPU, no model management)
- Router model (no "is this simple enough?" logic)
- Separate trainer agent (one model does everything)
- CrewAI (LangGraph handles flow, xAI handles thinking)

---

## COMPONENT DETAILS

### 1. xAI Integration

```python
# Single client — works for everything
from openai import AsyncOpenAI

xai_client = AsyncOpenAI(
    api_key="YOUR_XAI_KEY",
    base_url="https://api.x.ai/v1"
)

# Orchestrator call (single-shot)
response = await xai_client.chat.completions.create(
    model="grok-4.3",
    messages=[
        {"role": "system", "content": ORCHESTRATOR_SYSTEM_PROMPT},
        {"role": "user", "content": user_query}
    ],
    tools=[web_search_tool, code_execution_tool],
    temperature=0.3
)

# Expert call (same model, different system prompt)
response = await xai_client.chat.completions.create(
    model="grok-4.3",
    messages=[
        {"role": "system", "content": FINANCE_EXPERT_SYSTEM_PROMPT},
        {"role": "user", "content": task_from_orchestrator}
    ],
    tools=[...],
    temperature=0.5
)
```

### 2. LangGraph Structure (Simplified)

```python
from langgraph.graph import StateGraph, END

class AgentState(TypedDict):
    user_input: str
    user_id: str
    org_id: str
    intent: str
    task_plan: list[str]
    expert_results: dict[str, str]
    final_answer: str
    chat_history: list
    context: dict

# Nodes — each calls xAI Grok with different system prompts
graph.add_node("orchestrator", call_xai_orchestrator)   # determines intent + experts
graph.add_node("finance_expert", call_xai_finance)       # domain expert calls
graph.add_node("operations_expert", call_xai_operations)
graph.add_node("workflow_expert", call_xai_workflow)
graph.add_node("industry_expert", call_xai_industry)
graph.add_node("hr_expert", call_xai_hr)
graph.add_node("forecast_expert", call_xai_forecast)
graph.add_node("org_expert", call_xai_org)
graph.add_node("code_expert", call_xai_code)
graph.add_node("synthesizer", synthesize_results)        # combines expert outputs

# Routing — orchestrator decides which experts to call
graph.add_conditional_edges("orchestrator", route_to_experts, ...)
graph.add_edge("synthesizer", END)
```

### 3. Memory & Learning

```python
# Every interaction saved
db.trajectories.insert_one({
    "user_id": user_id,
    "org_id": org_id,
    "query": user_input,
    "intent": intent,
    "experts_used": ["finance", "industry"],
    "responses": {...},
    "user_rating": None,  # filled later if user gives feedback
    "latency_ms": 1234,
    "created_at": datetime.utcnow()
})

# Qdrant for semantic memory
qdrant.upsert(
    collection_name="conversations",
    points=[{
        "id": str(uuid4()),
        "vector": embedding_of_query,
        "payload": {"user_id": user_id, "text": query, "response": answer}
    }]
)

# Periodic reflection — ask xAI to review + improve
reflect_prompt = """
Review the last 100 trajectories from MongoDB.
Identify:
1. Common failure patterns
2. Which expert prompts need improvement
3. New routing rules to add
4. Suggested system prompt changes
Return structured recommendations.
"""
```

### 4. Expert System Prompts

Each expert is just xAI Grok called with a different system prompt. Examples:

- **Finance**: "You are a Finance Expert at YESBOSS. Analyze financial data, budgets, forecasts, and ROI. Use web_search for industry benchmarks and code_execution for calculations. Return structured analysis with findings, recommendations, and confidence."
- **Operations**: "You are an Operations Expert at YESBOSS. Analyze workflows, supply chain, resource allocation, and bottlenecks. Use web_search for best practices. Provide actionable improvements."
- **HR**: "You are an HR Expert at YESBOSS. Analyze team dynamics, hiring needs, skills gaps, and organizational culture. Provide people-focused recommendations."
- **Workflow**: "You are a Workflow Designer at YESBOSS. Design business processes, identify automation opportunities, map dependencies, and create efficient workflows."
- **Industry Intel**: "You are an Industry Intelligence Expert at YESBOSS. Research market trends, competitors, benchmarks, and regulatory changes using web_search. Provide strategic insights."
- **Forecasting**: "You are a Forecasting Expert at YESBOSS. Analyze trends, predict outcomes, assess risks, and provide data-driven projections with confidence levels."
- **Organization**: "You are an Organization Analyst at YESBOSS. Map hierarchies, analyze team structures, communication flows, and department interactions."
- **Code/Data**: "You are a Data & Code Expert at YESBOSS. Analyze data, generate reports, create visualizations, and process files using code_execution."

---

## INFRASTRUCTURE

| Component | Tech | Notes |
|-----------|------|-------|
| LLM | xAI Grok 4.3 | One API key, no GPU, no local infra |
| Agent Framework | LangGraph (Python) | Inside FastAPI |
| Backend | FastAPI | Already built |
| Database | MongoDB Atlas | Already integrated |
| Vector DB | Qdrant Cloud | Already integrated |
| Auth | Supabase | Already integrated |
| Frontend | Next.js 15 + TailwindCSS + Radix UI | Already built |
| File Processing | PyPDF + OCR | Already in place |
| Scraping | Firecrawl + Playwright | Already in place |

---

## IMPLEMENTATION ROADMAP

### Phase 1: Foundation (Fix What's Broken)
- [ ] Replace hardcoded template responses in `executive_chat.py` with real xAI Grok calls
- [ ] Add xAI client to `ai_client.py` (using existing OpenAI-compatible pattern)
- [ ] Make master agent use xAI Grok for intent understanding instead of keyword matching
- [ ] Create all 8 expert system prompts in `agents/expert_agents.py`

### Phase 2: Orchestration
- [ ] Implement orchestrator node: one xAI call that returns intent + expert list + execution plan
- [ ] Wire LangGraph to call experts based on orchestrator's decision
- [ ] Implement single-shot mode (simple queries skip multi-step)
- [ ] Add parallel expert execution where appropriate

### Phase 3: Memory & Learning
- [ ] Log every trajectory to MongoDB (already partially done)
- [ ] Store embeddings + context in Qdrant (already partially done)
- [ ] Add periodic reflection endpoint: "xAI reviews past N interactions and suggests improvements"
- [ ] Auto-apply prompt improvements (or flag for manual review)

### Phase 4: Polish
- [ ] Streaming responses from xAI Grok
- [ ] User feedback loop (thumbs up/down → better trajectory scoring)
- [ ] Performance monitoring
- [ ] A/B testing different system prompts

---

## WHY THIS WINS FOR YESBOSS

1. **One brain, one integration** — xAI Grok handles everything. No routing logic, no model selection, no fallback chains.
2. **Simpler infrastructure** — No GPU, no Ollama server, no model downloads, no compatibility issues.
3. **Reliable at scale** — xAI's infrastructure, not yours. If it breaks, they fix it.
4. **Fast to build** — Skip months of fine-tuning, prompt engineering across models, and debugging local setups. Just write good system prompts.
5. **Actually matches your codebase** — Your `ai_client.py` already has the OpenAI-compatible pattern. xAI uses the same format. Add 10 lines of config and it works.
6. **Your "Highly Intelligent Intern"** — One model that trains, assigns, monitors, executes, reasons, and improves. That's xAI Grok with the right prompts.
