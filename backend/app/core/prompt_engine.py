import logging
from typing import Optional, List, Dict, Any, Set
from datetime import datetime

logger = logging.getLogger("yesboss.prompt_engine")

PERSONA_INSTRUCTIONS = {
    # --- Existing ---
    "business_analyst": (
        "You are an AI Business Analyst — conversational, insightful, and helpful. "
        "You draw on business knowledge and the provided context to give data-backed answers. "
        "Use **bold** for key numbers and names, short paragraphs, bullet lists. "
        "Never say 'I don't have that data' as your entire answer."
    ),
    "strategy_advisor": (
        "You are an AI Strategy Advisor — you help CEOs and business owners think long-term. "
        "You identify strategic opportunities, risks, and market positioning. "
        "You provide 3-5 year outlooks and competitive analysis. "
        "Always tie recommendations back to the organization's goals and industry."
    ),
    "task_planner": (
        "You are an AI Task Planner — you break down goals into actionable tasks. "
        "You think about dependencies, resource allocation, and timelines. "
        "You suggest task assignments based on team structure. "
        "Be precise and practical."
    ),
    "goal_architect": (
        "You are an AI Goal Architect — you help define and refine business goals. "
        "You ask very specific probing questions tailored to the goal. "
        "For example, if the goal is 'Start hiring', ask: which department, what positions, "
        "how many people, what salary range, by when, what qualifications. "
        "If the goal is 'Increase revenue', ask: by what percentage, which revenue stream, "
        "what timeframe, what's the current baseline. "
        "You guide the user from vague ideas to well-structured goals with measurable outcomes "
        "and concrete sub-tasks. Once you have enough goal details (success criteria, KPIs, "
        "timeline), suggest 3-5 actionable sub-tasks as a JSON block. "
        "Be conversational and specific — never ask generic questions."
    ),
    # --- New: Persona / Onboarding ---
    "persona_builder": (
        "You are YesBoss, an AI business co-founder building a deep understanding of "
        "a business owner and their company. You ask thoughtful, personalized questions "
        "about their leadership style, vision, challenges, team, and goals. "
        "You are empathetic, conversational, and remember every detail they share. "
        "Each question builds on previous answers to form a complete picture. "
        "Never ask generic questions — always tailor to their specific industry and context."
    ),
    "onboarding_assistant": (
        "You are YesBoss AI, an intelligent business analysis assistant helping "
        "a business owner through onboarding. You explain your capabilities, "
        "learn about their business, and guide them to set up their first goals. "
        "Be warm, professional, and proactive — suggest what they could do next."
    ),
    # --- New: Expert agents ---
    "expert_finance": (
        "You are a Finance Expert AI Agent. You analyze financial health, cash flow, "
        "revenue trends, and cost structures. You provide data-backed financial "
        "recommendations, identify risks, and suggest optimizations. "
        "Always reference specific metrics when available."
    ),
    "expert_operations": (
        "You are an Operations Expert AI Agent. You analyze business operations, "
        "workflow efficiency, bottlenecks, and resource allocation. "
        "You identify process improvements and operational risks. "
        "Provide specific, actionable recommendations."
    ),
    "expert_workflow": (
        "You are a Workflow Automation Expert AI Agent. You design and optimize "
        "business workflows, identify automation opportunities, and suggest "
        "process improvements. Think step-by-step about how work flows through the organization."
    ),
    "expert_forecasting": (
        "You are a Forecasting Expert AI Agent. You analyze trends, predict outcomes, "
        "and provide data-driven forecasts. You identify growth opportunities and "
        "risks. Base predictions on the provided data and industry patterns."
    ),
    "expert_industry_intelligence": (
        "You are an Industry Intelligence Expert AI Agent. You track market trends, "
        "competitive landscapes, and industry shifts. You provide strategic insights "
        "about market positioning, emerging threats, and growth opportunities."
    ),
    "expert_org_understanding": (
        "You are an Organizational Understanding Expert AI Agent. You analyze "
        "company structure, team dynamics, role clarity, and communication patterns. "
        "You identify organizational gaps and recommend structure improvements."
    ),
    # --- New: Domain-specific ---
    "market_analyst": (
        "You are a market research analyst. Generate realistic, recent market news "
        "and trends for the given industry. For each article provide a title, "
        "source (realistic news outlet), date, summary, relevance explanation, "
        "and a sentiment score. Be specific to the industry and micro-vertical."
    ),
    "kpi_analyst": (
        "You are a business analytics expert. Given organization goals, tasks, "
        "team composition, and completion data, suggest the most relevant KPIs "
        "to track. Focus on actionable metrics that tie directly to business outcomes. "
        "Return ONLY valid JSON."
    ),
    "social_verifier": (
        "You are a strict social media verifier for business directories. "
        "You examine candidate social media URLs found on a company's website "
        "and determine which are genuine company pages. NEVER guess or invent "
        "URLs. Only confirm URLs that have strong evidence. Return structured JSON only."
    ),
    "company_analyst": (
        "You are an industry analyst. Given a company domain and scraped website "
        "content, identify the company name, primary industry, micro-verticals, "
        "and website URL. Return ONLY valid JSON. No markdown."
    ),
    "goal_suggester": (
        "You are a business consultant. Given an industry and micro-vertical, "
        "suggest relevant, strategic business goals. Each goal should have a "
        "title, description, department, and priority. Return ONLY valid JSON array."
    ),
    "department_classifier": (
        "You classify business goals into departments. Reply with ONE department "
        "word only. Choose from: Engineering, Marketing, Sales, Operations, Finance, "
        "Human Resources, Product, Design, Customer Support, R&D, Supply Chain, Legal."
    ),
    "company_researcher": (
        "You are a precise company researcher. Given a company name, find and "
        "return verified information including description, industry, size, "
        "location, and website. Only return real, verified companies. "
        "Return ONLY valid, parseable JSON."
    ),
    "default": (
        "You are an AI Assistant for YesBoss, an AI Business Operating System. "
        "You help users understand their business data, make decisions, and take action. "
        "Be helpful, concise, and professional."
    ),
}

AGENT_TYPES = [
    {"id": "business_analyst", "name": "Business Analyst"},
    {"id": "strategy_advisor", "name": "Strategy Advisor"},
    {"id": "task_planner", "name": "Task Planner"},
    {"id": "goal_architect", "name": "Goal Architect"},
    {"id": "persona_builder", "name": "Persona Builder"},
    {"id": "onboarding_assistant", "name": "Onboarding Assistant"},
    {"id": "expert_finance", "name": "Finance Expert"},
    {"id": "expert_operations", "name": "Operations Expert"},
    {"id": "expert_workflow", "name": "Workflow Expert"},
    {"id": "expert_forecasting", "name": "Forecasting Expert"},
    {"id": "expert_industry_intelligence", "name": "Industry Intelligence Expert"},
    {"id": "expert_org_understanding", "name": "Org Understanding Expert"},
    {"id": "market_analyst", "name": "Market Analyst"},
    {"id": "kpi_analyst", "name": "KPI Analyst"},
    {"id": "social_verifier", "name": "Social Verifier"},
    {"id": "company_analyst", "name": "Company Analyst"},
    {"id": "goal_suggester", "name": "Goal Suggester"},
    {"id": "department_classifier", "name": "Department Classifier"},
    {"id": "company_researcher", "name": "Company Researcher"},
]

# Map agent_type -> set of context section keys needed
AGENT_SECTION_MAP: Dict[str, Set[str]] = {
    "business_analyst":       {"org", "goals", "tasks", "team", "docs", "website", "patterns"},
    "strategy_advisor":       {"org", "goals", "tasks", "team", "docs", "website", "patterns"},
    "task_planner":           {"org", "goals", "tasks", "team", "docs", "patterns"},
    "goal_architect":         {"org", "goals", "tasks", "team", "docs", "website", "patterns"},
    "persona_builder":        {"org", "docs", "website", "patterns"},
    "onboarding_assistant":   {"org"},
    "expert_finance":         {"org", "goals", "tasks", "team", "patterns"},
    "expert_operations":      {"org", "goals", "tasks", "team", "patterns"},
    "expert_workflow":        {"org", "goals", "tasks", "team", "patterns"},
    "expert_forecasting":     {"org", "goals", "tasks", "team", "docs", "website", "patterns"},
    "expert_industry_intelligence": {"org", "website", "patterns"},
    "expert_org_understanding":     {"org", "goals", "tasks", "team", "patterns"},
    "market_analyst":         {"org", "website"},
    "kpi_analyst":            {"org", "goals", "tasks", "team"},
    "social_verifier":        {"org", "website"},
    "company_analyst":        set(),
    "goal_suggester":         set(),
    "department_classifier":  set(),
    "company_researcher":     set(),
    "default":                {"org", "goals", "tasks", "team", "docs"},
}


class MasterPromptEngine:
    def __init__(self, db):
        self.db = db

    async def build_prompt(
        self,
        org_id: str,
        user_id: Optional[str] = None,
        goal_id: Optional[str] = None,
        agent_type: Optional[str] = None,
        extra_context: Optional[str] = None,
    ) -> str:
        agent_type = agent_type or "default"
        sections = await self._build_selected_context(
            org_id=org_id,
            user_id=user_id,
            goal_id=goal_id,
            agent_type=agent_type,
        )

        persona = self._get_persona_instructions(agent_type)
        sections.append(f"===== PERSONA =====\n{persona}\n====================\n")

        cutoff = datetime.utcnow().isoformat()
        prompt = f"Unified Business Context (generated {cutoff}):\n\n" + "\n".join(sections)

        if extra_context:
            prompt += f"\n\nExtra Context:\n{extra_context}\n"

        if user_id:
            await self._log_prompt_usage(org_id, user_id, agent_type, sections)

        return prompt

    async def build_selected_context(
        self,
        org_id: str,
        sections_requested: Set[str],
        user_id: Optional[str] = None,
        goal_id: Optional[str] = None,
    ) -> str:
        builder = {
            "org": self._build_org_profile,
            "goals": self._build_goals_section,
            "tasks": self._build_tasks_section,
            "team": self._build_team_section,
            "docs": self._build_documents_section,
            "website": self._build_website_section,
            "patterns": self._build_user_patterns,
        }
        parts = []
        for key, method in builder.items():
            if key in sections_requested:
                if key in ("goals", "tasks"):
                    result = await method(org_id, goal_id)
                elif key == "patterns":
                    result = await method(org_id, user_id)
                else:
                    result = await method(org_id)
                if result:
                    parts.append(result)
        return "\n".join(parts)

    async def _build_selected_context(
        self,
        org_id: str,
        user_id: Optional[str],
        goal_id: Optional[str],
        agent_type: str,
    ) -> List[str]:
        section_keys = AGENT_SECTION_MAP.get(agent_type, AGENT_SECTION_MAP["default"])
        builder = {
            "org": self._build_org_profile,
            "goals": self._build_goals_section,
            "tasks": self._build_tasks_section,
            "team": self._build_team_section,
            "docs": self._build_documents_section,
            "website": self._build_website_section,
            "patterns": self._build_user_patterns,
        }
        sections: List[str] = []
        for key in AGENT_SECTION_MAP.get(agent_type, AGENT_SECTION_MAP["default"]):
            method = builder[key]
            if key in ("goals", "tasks"):
                result = await method(org_id, goal_id)
            elif key == "patterns":
                result = await method(org_id, user_id)
            else:
                result = await method(org_id)
            if result:
                sections.append(result)
        return sections

    # ------------------------------------------------------------------ #
    #  Context section builders (called by build_prompt internally)       #
    # ------------------------------------------------------------------ #

    async def _build_org_profile(self, org_id: str) -> str:
        if self.db is None:
            return "===== ORGANIZATION =====\nNo database connection.\n========================\n"
        from bson import ObjectId
        oid = ObjectId(org_id) if ObjectId.is_valid(org_id) else org_id
        org = self.db.organizations.find_one({"_id": oid})
        if not org:
            return "===== ORGANIZATION =====\nNo organization data found.\n========================\n"

        return f"""===== ORGANIZATION =====
Name: {org.get('name', 'Unknown')}
Industry: {org.get('industry', 'N/A')}
Micro Vertical: {org.get('micro_vertical', 'N/A')}
Size: {org.get('size', 'N/A')}
Website: {org.get('website_url', 'N/A')}
Domain: {org.get('domain', 'N/A')}
========================\n"""

    async def _build_goals_section(self, org_id: str, goal_id: Optional[str] = None) -> str:
        if self.db is None:
            return "===== GOALS =====\nNo database connection.\n==================\n"
        query = {"organization_id": org_id}
        if goal_id:
            from bson import ObjectId
            query["_id"] = ObjectId(goal_id)

        goals = list(self.db.goals.find(query).sort("created_at", -1).limit(20))
        if not goals:
            return "===== GOALS =====\nNo goals found.\n==================\n"

        lines = []
        for g in goals:
            title = g.get("title", "Untitled")
            desc = g.get("description", "")
            status = g.get("status", "unknown")
            priority = g.get("priority", "medium")
            department = g.get("department", "N/A")
            assignee = g.get("assignee_name", g.get("assignee_id", "unassigned"))
            timeline = g.get("timeline", "N/A")

            sc = g.get("success_criteria", "")
            kpis = g.get("kpis", "")
            tl_detail = g.get("timeline_detail", "")
            deps = g.get("dependencies", "")

            lines.append(
                f"  [{status}] {title} (priority: {priority}, dept: {department}, "
                f"assignee: {assignee}, timeline: {timeline})"
            )
            if desc:
                lines.append(f"    Description: {desc[:200]}")
            if sc:
                lines.append(f"    Success Criteria: {sc[:200]}")
            if kpis:
                lines.append(f"    KPIs: {kpis[:200]}")
            if tl_detail:
                lines.append(f"    Timeline Detail: {tl_detail[:200]}")
            if deps:
                lines.append(f"    Dependencies: {deps[:200]}")

        text = "\n".join(lines)
        return f"===== GOALS ({len(goals)} total) =====\n{text}\n=============================\n"

    async def _build_tasks_section(self, org_id: str, goal_id: Optional[str] = None) -> str:
        if self.db is None:
            return "===== TASKS =====\nNo database connection.\n==================\n"
        query = {"organization_id": org_id}
        if goal_id:
            query["goal_id"] = goal_id

        tasks = list(self.db.tasks.find(query).sort("created_at", -1).limit(30))
        if not tasks:
            return "===== TASKS =====\nNo tasks found.\n==================\n"

        lines = []
        for t in tasks:
            lines.append(
                f"  [{t.get('status', 'pending')}] {t.get('title', 'Untitled')} "
                f"(priority: {t.get('priority', 'medium')}, "
                f"assignee: {t.get('assignee_id', 'unassigned')})"
            )

        total = len(tasks)
        completed = len([t for t in tasks if t.get("status") == "completed"])
        rate = round((completed / total * 100) if total > 0 else 0, 1)

        text = "\n".join(lines)
        return (
            f"===== TASKS ({total} total, {completed} completed, "
            f"{rate}% rate) =====\n{text}\n======================================\n"
        )

    async def _build_team_section(self, org_id: str) -> str:
        if self.db is None:
            return "===== TEAM =====\nNo database connection.\n===================\n"
        members = list(self.db.org_chart_members.find({"organization_id": org_id}))
        if not members:
            return "===== TEAM =====\nNo team members found.\n===================\n"

        dept_count = {}
        names = []
        for m in members:
            d = m.get("department", "General")
            dept_count[d] = dept_count.get(d, 0) + 1
            names.append(m.get("full_name", m.get("email", "Unknown")))

        lines = [f"Team size: {len(members)}"]
        lines.append(
            "By department: " + ", ".join(
                [f"{d}: {c}" for d, c in dept_count.items()]
            )
        )
        lines.append("Members: " + ", ".join(names))
        return "===== TEAM =====\n" + "\n".join(lines) + "\n================\n"

    async def _build_documents_section(self, org_id: str) -> str:
        if self.db is None:
            return "===== DOCUMENTS =====\nNo database connection.\n=======================\n"
        docs = list(
            self.db.documents.find({"org_id": org_id})
            .sort("created_at", -1)
            .limit(5)
        )
        if not docs:
            return "===== DOCUMENTS =====\nNo uploaded documents found.\n=======================\n"

        lines = []
        for d in docs:
            preview = (d.get("text", "") or "")[:300]
            lines.append(
                f"  {d.get('filename', 'unknown')} — {d.get('text_length', 0)} chars, "
                f"{d.get('chunk_count', 0)} chunks. Preview: {preview}"
            )
        return "===== DOCUMENTS =====\n" + "\n".join(lines) + "\n=====================\n"

    async def _build_website_section(self, org_id: str) -> str:
        if self.db is None:
            return ""
        from bson import ObjectId
        oid = ObjectId(org_id) if ObjectId.is_valid(org_id) else org_id
        org = self.db.organizations.find_one({"_id": oid})
        if not org or not org.get("website_url"):
            return ""

        url = org["website_url"]
        try:
            import httpx
            import re
            last_err = None
            for attempt in range(2):
                try:
                    headers = {}
                    if attempt > 0:
                        headers["Accept-Encoding"] = "identity"
                    async with httpx.AsyncClient(timeout=8.0) as client:
                        resp = await client.get(url, follow_redirects=True, headers=headers)
                        if resp.status_code == 200:
                            text = resp.text
                            text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.DOTALL)
                            text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL)
                            text = re.sub(r'<[^>]+>', ' ', text)
                            text = re.sub(r'\s+', ' ', text).strip()
                            content = text[:2000]
                            return (
                                f"===== WEBSITE CONTENT (from {url}) =====\n"
                                f"{content}\n"
                                f"=====================================\n"
                            )
                except Exception as e2:
                    err_str = str(e2)
                    if "decompressobj" in err_str or "gzip" in err_str.lower():
                        last_err = e2
                        continue
                    raise
        except Exception as e:
            logger.warning(f"Website scrape failed for {url}: {last_err or e}")
        return ""

    async def _build_user_patterns(self, org_id: str, user_id: Optional[str] = None) -> str:
        if not user_id or self.db is None:
            return "===== USER PATTERNS =====\nNo user context available.\n==========================\n"

        query = {"org_id": org_id, "user_id": user_id}
        patterns = list(
            self.db.user_patterns.find(query).sort("created_at", -1).limit(10)
        )
        if not patterns:
            return "===== USER PATTERNS =====\nNo learned patterns yet.\n==========================\n"

        top = patterns[:3]
        lines = ["Learned patterns from past sessions:"]
        for p in top:
            industry = p.get("industry", "")
            goals_created = p.get("goal_titles", [])
            questions = p.get("questions_asked", [])
            breakdowns = p.get("breakdowns_provided", [])

            if goals_created:
                lines.append(f"  - Previously created goals: {', '.join(goals_created[:3])}")
            if industry:
                lines.append(f"  - Industry: {industry}")
            if questions:
                lines.append(f"  - Common questions: {', '.join(questions[:2])}")
            if breakdowns:
                lines.append(f"  - Typical breakdowns: {', '.join(breakdowns[:2])}")

        lines.append("\nSuggested pre-fills based on patterns:")
        has_healthcare = any(
            "patient" in str(p.get("breakdowns_provided", [])).lower()
            or "healthcare" in str(p.get("industry", "")).lower()
            for p in top
        )
        if has_healthcare:
            lines.append(
                "  - User typically sets healthcare/patient satisfaction metrics "
                "\u2192 suggest 90-day goals with patient satisfaction KPIs"
            )
        has_quarterly = any(
            "90" in str(p.get("goal_titles", []))
            or "quarter" in str(p.get("goal_titles", [])).lower()
            for p in top
        )
        if has_quarterly:
            lines.append(
                "  - User prefers quarterly (90-day) goal cycles "
                "\u2192 pre-fill 90-day timeline"
            )

        return (
            "===== USER PATTERNS =====\n"
            + "\n".join(lines)
            + "\n========================\n"
        )

    # ------------------------------------------------------------------ #
    #  Probing questions for goal breakdown chat                          #
    # ------------------------------------------------------------------ #

    async def generate_probing_questions(
        self,
        goal_title: str,
        org_id: str,
        user_id: Optional[str] = None,
        existing_fields: Optional[Dict[str, Any]] = None,
    ) -> List[str]:
        existing = existing_fields or {}
        questions = []

        if not existing.get("success_criteria"):
            questions.append("What does success look like in numbers? How will you measure it?")
        if not existing.get("kpis"):
            questions.append("What specific KPIs would best track progress on this goal?")
        if not existing.get("timeline_detail"):
            questions.append("What's your target deadline, and are there any key milestones along the way?")
        if not existing.get("dependencies"):
            questions.append("What teams or resources need to be involved? Any dependencies?")

        if not questions:
            questions = [
                "What would success look like in specific numbers?",
                "Which teams need to be involved?",
                "What's the first milestone you want to hit?",
            ]

        try:
            from .ai_client import get_ai_response

            patterns_ctx = ""
            if user_id and self.db is not None:
                patterns = list(
                    self.db.user_patterns.find({"org_id": org_id, "user_id": user_id})
                    .sort("created_at", -1)
                    .limit(3)
                )
                if patterns and patterns[0].get("goal_titles"):
                    titles = patterns[0]["goal_titles"][:3]
                    patterns_ctx = f"\nUser previously created goals: {', '.join(titles)}"

            prompt = (
                f"Goal title: {goal_title}\n"
                f"Existing fields: success_criteria={existing.get('success_criteria', 'empty')}, "
                f"kpis={existing.get('kpis', 'empty')}, "
                f"timeline_detail={existing.get('timeline_detail', 'empty')}, "
                f"dependencies={existing.get('dependencies', 'empty')}"
                f"{patterns_ctx}\n\n"
                f"Generate exactly 3 probing, conversational questions "
                f"to help refine this goal. Target any empty fields. "
                f"Return as a JSON array of strings, no other text."
            )

            ai_response = await get_ai_response(
                prompt=prompt,
                system_prompt=(
                    "You are a goal-coaching AI. Generate concise, "
                    "probing questions to help define business goals."
                ),
                temperature=0.7,
                max_tokens=500,
            )

            import json
            ai_questions = json.loads(ai_response)
            if isinstance(ai_questions, list) and len(ai_questions) > 0:
                questions = ai_questions[:3]
        except Exception as e:
            logger.warning(f"AI probing question generation failed: {e}")

        return questions

    # ------------------------------------------------------------------ #
    #  User pattern logging                                               #
    # ------------------------------------------------------------------ #

    async def log_user_pattern(
        self,
        org_id: str,
        user_id: str,
        goal_title: Optional[str] = None,
        question: Optional[str] = None,
        breakdown: Optional[str] = None,
        context_sections_used: Optional[List[str]] = None,
    ):
        if not user_id or self.db is None:
            return

        from bson import ObjectId
        oid = ObjectId(org_id) if ObjectId.is_valid(org_id) else org_id
        org = self.db.organizations.find_one({"_id": oid})
        industry = org.get("industry", "") if org else ""

        now = datetime.utcnow()

        if goal_title:
            self.db.user_patterns.update_one(
                {"user_id": user_id, "org_id": org_id},
                {
                    "$push": {"goal_titles": goal_title},
                    "$set": {"industry": industry, "updated_at": now},
                    "$setOnInsert": {"created_at": now},
                },
                upsert=True,
            )

        if question:
            self.db.user_patterns.update_one(
                {"user_id": user_id, "org_id": org_id},
                {
                    "$push": {"questions_asked": question},
                    "$set": {"updated_at": now},
                    "$setOnInsert": {"created_at": now},
                },
                upsert=True,
            )

        if breakdown:
            self.db.user_patterns.update_one(
                {"user_id": user_id, "org_id": org_id},
                {
                    "$push": {"breakdowns_provided": breakdown},
                    "$set": {"updated_at": now},
                    "$setOnInsert": {"created_at": now},
                },
                upsert=True,
            )

        if context_sections_used:
            self.db.user_patterns.update_one(
                {"user_id": user_id, "org_id": org_id},
                {
                    "$push": {"context_sections_used": {"$each": context_sections_used}},
                    "$set": {"updated_at": now},
                    "$setOnInsert": {"created_at": now},
                },
                upsert=True,
            )

    def _get_persona_instructions(self, agent_type: str) -> str:
        return PERSONA_INSTRUCTIONS.get(agent_type, PERSONA_INSTRUCTIONS["default"])

    def get_agent_types(self) -> List[Dict[str, str]]:
        return AGENT_TYPES

    async def _log_prompt_usage(
        self,
        org_id: str,
        user_id: str,
        agent_type: Optional[str],
        sections: List[str],
    ):
        section_names = []
        for s in sections:
            if s.startswith("===== ORGANIZATION"):
                section_names.append("organization")
            elif s.startswith("===== GOALS"):
                section_names.append("goals")
            elif s.startswith("===== TASKS"):
                section_names.append("tasks")
            elif s.startswith("===== TEAM"):
                section_names.append("team")
            elif s.startswith("===== DOCUMENTS"):
                section_names.append("documents")
            elif s.startswith("===== WEBSITE"):
                section_names.append("website")
            elif s.startswith("===== USER PATTERNS"):
                section_names.append("user_patterns")

        await self.log_user_pattern(
            org_id=org_id,
            user_id=user_id,
            context_sections_used=section_names,
        )
