┌─────────────────────────────────────────────────────────────────────────────┐
│                             USER INITIATES ACTION                           │
│                                                                             │
│  • Chat Message                                                             │
│  • Goal Creation                                                            │
│  • Goal Breakdown                                                           │
│  • Expert Agent Request                                                     │
│  • Business Analysis                                                        │
│  • Strategy Request                                                         │
│  • AI Assistant Interaction                                                 │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API ENTRY POINT                                │
│                                                                             │
│  Receives:                                                                  │
│  • User ID                                                                  │
│  • Organization ID                                                          │
│  • Goal ID (if available)                                                   │
│  • Agent Type                                                               │
│  • User Query                                                               │
│  • Additional Context                                                       │
│                                                                             │
│  Endpoints:                                                                 │
│  • /prompt/build                                                            │
│  • /expert_agents                                                           │
│  • /assistant                                                               │
│  • Goal-related APIs                                                        │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MASTER PROMPT ENGINE                              │
│                                                                             │
│  Responsibilities:                                                          │
│                                                                             │
│  1. Identify request type                                                   │
│  2. Select appropriate AI persona                                           │
│  3. Determine required context sections                                     │
│  4. Minimize unnecessary prompt data                                        │
│  5. Build complete business context                                         │
│  6. Assemble final prompt                                                   │
│                                                                             │
│  Decision Layer:                                                            │
│                                                                             │
│  User Request                                                               │
│       │                                                                     │
│       ▼                                                                     │
│  Agent Selection                                                            │
│       │                                                                     │
│       ▼                                                                     │
│  Context Requirement Mapping                                                │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CONTEXT REQUIREMENT SELECTION                          │
│                                                                             │
│  Example Agent → Required Context                                           │
│                                                                             │
│  Business Analyst                                                           │
│    ├─ Organization                                                          │
│    ├─ Goals                                                                 │
│    ├─ Tasks                                                                 │
│    ├─ Team                                                                  │
│    ├─ Documents                                                             │
│    ├─ Website                                                               │
│    └─ User Patterns                                                         │
│                                                                             │
│  Finance Expert                                                             │
│    ├─ Organization                                                          │
│    ├─ Goals                                                                 │
│    ├─ Tasks                                                                 │
│    ├─ Team                                                                  │
│    └─ User Patterns                                                         │
│                                                                             │
│  Persona Builder                                                            │
│    ├─ Organization                                                          │
│    ├─ Documents                                                             │
│    ├─ Website                                                               │
│    └─ User Patterns                                                         │
│                                                                             │
│  Onboarding Assistant                                                       │
│    └─ Organization Only                                                     │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
═════════════════════════════════════════════════════════════════════════════════
                     CONTEXT CONSTRUCTION PIPELINE
═════════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. ORGANIZATION CONTEXT                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ Collects:                                                                   │
│ • Company Name                                                              │
│ • Industry                                                                  │
│ • Micro Vertical                                                            │
│ • Company Size                                                              │
│ • Website URL                                                               │
│ • Domain Information                                                        │
│ • Organization Profile                                                      │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼

┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. GOALS CONTEXT                                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│ Collects:                                                                   │
│ • Goal Title                                                                │
│ • Goal Description                                                          │
│ • Goal Status                                                               │
│ • Goal Priority                                                             │
│ • Goal Owner                                                                │
│ • Department                                                                │
│ • Timeline                                                                  │
│ • KPIs                                                                      │
│ • Success Criteria                                                          │
│ • Dependencies                                                              │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼

┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. TASK CONTEXT                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ Collects:                                                                   │
│ • Task Title                                                                │
│ • Assignee                                                                  │
│ • Status                                                                    │
│ • Priority                                                                  │
│ • Due Dates                                                                 │
│                                                                             │
│ Calculates:                                                                 │
│ • Total Tasks                                                               │
│ • Completed Tasks                                                           │
│ • Completion Percentage                                                     │
│ • Progress Metrics                                                          │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼

┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. TEAM CONTEXT                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ Collects:                                                                   │
│ • Employee Names                                                            │
│ • Team Structure                                                            │
│ • Department Structure                                                      │
│ • Team Size                                                                 │
│ • Reporting Relationships                                                   │
│ • Department Counts                                                         │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼

┌─────────────────────────────────────────────────────────────────────────────┐
│ 5. DOCUMENT CONTEXT                                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ Collects:                                                                   │
│ • Uploaded Documents                                                        │
│ • Document Summaries                                                        │
│ • Extracted Content                                                         │
│ • Text Chunks                                                               │
│ • Knowledge Base Content                                                    │
│ • Recent Files                                                              │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼

┌─────────────────────────────────────────────────────────────────────────────┐
│ 6. WEBSITE CONTEXT                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ Website Processing Flow:                                                    │
│                                                                             │
│ Organization Website                                                        │
│        │                                                                    │
│        ▼                                                                    │
│ Fetch Website Content                                                       │
│        │                                                                    │
│        ▼                                                                    │
│ Remove HTML                                                                 │
│        │                                                                    │
│        ▼                                                                    │
│ Extract Plain Text                                                          │
│        │                                                                    │
│        ▼                                                                    │
│ Generate Website Summary                                                    │
│                                                                             │
│ Output:                                                                     │
│ • Business Description                                                      │
│ • Products & Services                                                       │
│ • Market Positioning                                                        │
│ • Website Intelligence                                                      │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼

┌─────────────────────────────────────────────────────────────────────────────┐
│ 7. USER PATTERN CONTEXT                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ Collects Historical Intelligence:                                           │
│                                                                             │
│ • Previous Questions                                                        │
│ • Previous Goals                                                            │
│ • Previous Breakdowns                                                       │
│ • Prior Recommendations                                                     │
│ • User Behaviour Patterns                                                   │
│ • Industry Trends Referenced                                                │
│ • Frequently Used Context                                                   │
│                                                                             │
│ Acts as Long-Term Memory Layer                                               │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼

┌─────────────────────────────────────────────────────────────────────────────┐
│                     UNIFIED BUSINESS CONTEXT CREATED                         │
│                                                                             │
│  Organization                                                               │
│  + Goals                                                                     │
│  + Tasks                                                                     │
│  + Team                                                                      │
│  + Documents                                                                 │
│  + Website Intelligence                                                      │
│  + User Patterns                                                             │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼

═════════════════════════════════════════════════════════════════════════════════
                           PERSONA INJECTION LAYER
═════════════════════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────────────────┐
│                           AGENT / PERSONA ENGINE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ Business Analyst                                                            │
│   • Business Insights                                                       │
│   • Performance Analysis                                                    │
│   • Recommendations                                                         │
│                                                                             │
│ Strategy Advisor                                                            │
│   • Growth Opportunities                                                    │
│   • Long-Term Planning                                                      │
│   • Competitive Positioning                                                 │
│                                                                             │
│ Goal Architect                                                              │
│   • Goal Refinement                                                         │
│   • KPI Creation                                                            │
│   • Success Criteria                                                        │
│                                                                             │
│ Finance Expert                                                              │
│   • Revenue Analysis                                                        │
│   • Cost Optimization                                                       │
│   • Financial Risk Assessment                                               │
│                                                                             │
│ Operations Expert                                                           │
│   • Process Improvement                                                     │
│   • Efficiency Analysis                                                     │
│   • Bottleneck Detection                                                    │
│                                                                             │
│ Workflow Expert                                                             │
│   • Process Design                                                          │
│   • Automation Recommendations                                               │
│   • Workflow Optimization                                                   │
│                                                                             │
│ Industry Intelligence                                                       │
│ Organization Understanding                                                  │
│ Forecasting Expert                                                          │
│ Additional Expert Personas                                                  │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼

┌─────────────────────────────────────────────────────────────────────────────┐
│                         FINAL PROMPT ASSEMBLY                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ System Instructions                                                         │
│        +                                                                    │
│ Selected Persona Instructions                                               │
│        +                                                                    │
│ Organization Context                                                        │
│        +                                                                    │
│ Goal Context                                                                │
│        +                                                                    │
│ Task Context                                                                │
│        +                                                                    │
│ Team Context                                                                │
│        +                                                                    │
│ Document Context                                                            │
│        +                                                                    │
│ Website Intelligence                                                        │
│        +                                                                    │
│ User Pattern Memory                                                         │
│        +                                                                    │
│ Additional User Input                                                       │
│                                                                             │
│ = FINAL UNIFIED PROMPT                                                      │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼

┌─────────────────────────────────────────────────────────────────────────────┐
│                             AI CLIENT ROUTER                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ Final Prompt                                                                │
│       │                                                                     │
│       ▼                                                                     │
│ AI Client                                                                   │
│       │                                                                     │
│       ├── Gemini                                                            │
│       ├── OpenAI                                                            │
│       ├── Claude                                                            │
│       ├── Grok                                                              │
│       └── Qwen                                                              │
│                                                                             │
│ Appropriate Model Selected                                                  │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼

┌─────────────────────────────────────────────────────────────────────────────┐
│                             AI GENERATES RESPONSE                            │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼

┌─────────────────────────────────────────────────────────────────────────────┐
│                           MEMORY / LEARNING LOOP                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ Prompt Generated                                                            │
│        │                                                                    │
│        ▼                                                                    │
│ Usage Logged                                                                │
│        │                                                                    │
│        ▼                                                                    │
│ User Patterns Updated                                                       │
│        │                                                                    │
│        ▼                                                                    │
│ Stored For Future Context Creation                                          │
│                                                                             │
│ Captures:                                                                   │
│ • Questions Asked                                                           │
│ • Goals Created                                                             │
│ • Analyses Generated                                                        │
│ • Context Sections Used                                                     │
│ • Historical Behaviour                                                      │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼

┌─────────────────────────────────────────────────────────────────────────────┐
│                          FUTURE REQUESTS IMPROVED                            │
│                                                                             │
│ User Patterns Feed Back Into                                                │
│ Context Builder For Better Responses                                        │
└─────────────────────────────────────────────────────────────────────────────┘