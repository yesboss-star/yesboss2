import json
import logging
from datetime import datetime

logger = logging.getLogger("yesboss.agents.expert")

from ..core.ai_client import get_ai_response
from ..core.database import get_database
from ..core.prompt_engine import MasterPromptEngine


class BaseExpertAgent:
    def __init__(self, agent_type: str, provider: str | None = None, db=None):
        self.agent_type = agent_type
        self.provider = provider
        self.db = db or get_database()
        # Get persona from MasterPromptEngine
        engine = MasterPromptEngine(self.db)
        persona_key = f"expert_{agent_type}" if not agent_type.startswith("expert_") else agent_type
        self.system_prompt = engine._get_persona_instructions(persona_key)

    async def analyze(self, query: str, context: dict | None = None, org_id: str | None = None) -> dict:
        engine = MasterPromptEngine(self.db)
        context_str = ""

        if org_id:
            # Build unified context from engine
            f"expert_{self.agent_type}" if not self.agent_type.startswith("expert_") else self.agent_type
            engine_ctx = await engine.build_selected_context(
                org_id=org_id,
                sections_requested={"org", "goals", "tasks", "team", "docs", "patterns"},
            )
            if engine_ctx:
                context_str = f"\n\nBusiness Context:\n{engine_ctx}"

        if context:
            context_str += f"\n\nAdditional Context: {json.dumps(context, indent=2)}"

        full_prompt = f"""{query}{context_str}

Provide your analysis with:
1. Key findings
2. Specific recommendations
3. Confidence level (as a percentage)
4. Next steps if applicable"""

        try:
            response = await get_ai_response(
                prompt=full_prompt,
                system_prompt=self.system_prompt,
                provider=self.provider,
                temperature=0.7,
                max_tokens=1500
            )

            return {
                "agent_type": self.agent_type,
                "query": query,
                "analysis": response,
                "recommendations": self._extract_recommendations(response),
                "confidence": self._estimate_confidence(response),
                "context": context or {},
                "timestamp": datetime.utcnow().isoformat()
            }
        except Exception as e:
            logger.error(f"Agent analysis failed: {e}")
            return {
                "agent_type": self.agent_type,
                "query": query,
                "analysis": f"I apologize, but I encountered an error: {str(e)}",
                "recommendations": [],
                "confidence": 0.3,
                "context": context or {},
                "error": str(e)
            }

    def _extract_recommendations(self, response: str) -> list[str]:
        recommendations = []
        lines = response.split("\n")
        for line in lines:
            line = line.strip()
            if line and (line.startswith("-") or line.startswith("*") or line.startswith("•")):
                clean = line.lstrip("-*• ").strip()
                if clean and len(clean) > 10:
                    recommendations.append(clean)
        return recommendations[:5]

    def _estimate_confidence(self, response: str) -> float:
        response_lower = response.lower()
        confidence_indicators = ["confident", "certain", "sure", "definitely", "clear"]
        uncertainty_indicators = ["maybe", "perhaps", "might", "could be", "uncertain"]

        conf_count = sum(1 for word in confidence_indicators if word in response_lower)
        unc_count = sum(1 for word in uncertainty_indicators if word in response_lower)

        base = 0.7
        confidence = base + (conf_count * 0.05) - (unc_count * 0.05)
        return max(0.3, min(0.95, confidence))


class FinanceAgent(BaseExpertAgent):
    def __init__(self, provider: str | None = None, db=None):
        super().__init__("finance", provider, db)

    async def analyze_financial_health(self, org_id: str) -> dict:
        try:
            query = "Analyze the financial health indicators based on the available organizational data."
            return await self.analyze(query, org_id=org_id)
        except Exception:
            return await self.analyze("Provide general financial health analysis for a business.", org_id=org_id)

    async def suggest_cost_optimization(self, org_id: str) -> dict:
        return await self.analyze(
            "What are the top 5 cost optimization opportunities for this organization?",
            org_id=org_id
        )


class OperationsAgent(BaseExpertAgent):
    def __init__(self, provider: str | None = None, db=None):
        super().__init__("operations", provider, db)

    async def analyze_operations(self, org_id: str) -> dict:
        try:
            query = "Analyze operational efficiency and identify improvement areas."
            return await self.analyze(query, org_id=org_id)
        except Exception:
            return await self.analyze("Provide operations optimization recommendations.", org_id=org_id)

    async def identify_bottlenecks(self, org_id: str) -> dict:
        return await self.analyze(
            "Identify the top operational bottlenecks and suggest ways to resolve them.",
            org_id=org_id
        )


class WorkflowAgent(BaseExpertAgent):
    def __init__(self, provider: str | None = None):
        super().__init__("workflow", provider)

    async def create_workflow(self, workflow_type: str, context: dict | None = None) -> dict:
        query = f"Design a {workflow_type} workflow with clear steps, responsibilities, and dependencies."

        try:
            result = await self.analyze(query, context)

            return {
                "workflow_type": workflow_type,
                "steps": self._extract_steps(result.get("analysis", "")),
                "estimated_time": self._estimate_time(workflow_type),
                "status": "ready",
                "agent_response": result.get("analysis", ""),
                "recommendations": result.get("recommendations", []),
                "timestamp": datetime.utcnow().isoformat()
            }
        except Exception as e:
            return {
                "workflow_type": workflow_type,
                "steps": [],
                "estimated_time": "Unknown",
                "status": "error",
                "error": str(e)
            }

    def _extract_steps(self, analysis: str) -> list[dict[str, str]]:
        steps = []
        lines = analysis.split("\n")
        for i, line in enumerate(lines, 1):
            line = line.strip()
            if line and (line[0].isdigit() or line.startswith("-") or line.startswith("*")):
                clean = line.lstrip("0123456789.-*•) ").strip()
                if clean and len(clean) > 5:
                    steps.append({
                        "step": i,
                        "description": clean[:200],
                        "status": "pending"
                    })

        return steps[:10]

    def _estimate_time(self, workflow_type: str) -> str:
        time_map = {
            "onboarding": "2-3 weeks",
            "approval": "1-2 days",
            "reporting": "1 week",
            "hiring": "2-4 weeks",
            "project": "4-8 weeks",
            "default": "1-2 weeks"
        }
        return time_map.get(workflow_type.lower(), time_map["default"])


class ForecastingAgent(BaseExpertAgent):
    def __init__(self, provider: str | None = None):
        super().__init__("forecasting", provider)

    async def forecast(self, metric: str, historical_data: list | None = None, context: dict | None = None) -> dict:
        data_context = f"Historical data points: {historical_data}" if historical_data else "No historical data available"

        query = f"Provide a forecast for {metric}. {data_context}"

        try:
            result = await self.analyze(query, context)

            return {
                "metric": metric,
                "forecast": result.get("analysis", "No forecast available"),
                "confidence": result.get("confidence", 0.5),
                "timeframe": context.get("timeframe", "next_quarter") if context else "next_quarter",
                "recommendations": result.get("recommendations", []),
                "timestamp": datetime.utcnow().isoformat()
            }
        except Exception as e:
            return {
                "metric": metric,
                "forecast": f"Error generating forecast: {str(e)}",
                "confidence": 0.3,
                "timeframe": "unknown",
                "error": str(e)
            }

    async def predict_growth(self, org_id: str) -> dict:
        return await self.forecast(
            "business growth metrics",
            context={"organization_id": org_id, "focus": "growth"}
        )


class IndustryIntelligenceAgent(BaseExpertAgent):
    def __init__(self, provider: str | None = None):
        super().__init__("industry_intelligence", provider)

    async def analyze_industry(self, industry: str) -> dict:
        query = f"Provide comprehensive analysis of the {industry} industry including trends, challenges, and opportunities."

        return await self.analyze(query, {"industry": industry})

    async def get_competitor_insights(self, industry: str) -> dict:
        query = f"What are the key competitive factors and best practices in the {industry} industry?"

        return await self.analyze(query, {"industry": industry, "focus": "competitors"})


class OrgUnderstandingAgent(BaseExpertAgent):
    def __init__(self, provider: str | None = None, db=None):
        super().__init__("org_understanding", provider, db)

    async def analyze_organization(self, org_id: str) -> dict:
        try:
            query = "Analyze the organization's structure, culture, and operational patterns."
            return await self.analyze(query, org_id=org_id)
        except Exception:
            return await self.analyze("Provide organizational analysis based on available data.", org_id=org_id)


def get_expert_agent(agent_type: str, provider: str | None = None) -> BaseExpertAgent:
    agents = {
        "finance": FinanceAgent,
        "operations": OperationsAgent,
        "workflow": WorkflowAgent,
        "forecasting": ForecastingAgent,
        "industry_intelligence": IndustryIntelligenceAgent,
        "org_understanding": OrgUnderstandingAgent,
    }

    agent_class = agents.get(agent_type.lower())
    if not agent_class:
        raise ValueError(f"Unknown agent type: {agent_type}")

    return agent_class(provider=provider)
