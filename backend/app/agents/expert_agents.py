import logging
import json
from typing import Optional, List, Dict, Any
from datetime import datetime

logger = logging.getLogger("yesboss.agents.expert")

from ..core.ai_client import get_ai_response, get_chat_response
from ..core.database import get_database

SYSTEM_PROMPTS = {
    "finance": """You are a Finance Expert AI Agent. You specialize in:
- Financial analysis and planning
- Cash flow management
- Cost optimization
- Budgeting and forecasting
- ROI analysis
- Investment decisions

Provide clear, actionable financial insights with specific recommendations.""",
    
    "operations": """You are an Operations Expert AI Agent. You specialize in:
- Process optimization
- Supply chain management
- Resource allocation
- Workflow efficiency
- Quality control
- Vendor management

Provide practical operational improvements with measurable outcomes.""",
    
    "workflow": """You are a Workflow Design Expert AI Agent. You specialize in:
- Business process design
- Automation opportunities
- Team coordination
- Task dependencies
- Approval workflows
- Reporting structures

Design efficient workflows that reduce bottlenecks and improve productivity.""",
    
    "forecasting": """You are a Business Forecasting Expert AI Agent. You specialize in:
- Trend analysis
- Demand forecasting
- Growth predictions
- Risk assessment
- Market analysis
- Seasonal patterns

Provide data-driven forecasts with confidence levels and key assumptions.""",
    
    "industry_intelligence": """You are an Industry Intelligence Expert AI Agent. You specialize in:
- Market analysis
- Competitor research
- Industry trends
- Best practices
- Benchmarking
- Regulatory changes

Provide comprehensive industry insights to inform strategic decisions.""",
    
    "org_understanding": """You are an Organization Analysis Expert AI Agent. You specialize in:
- Organizational structure
- Team dynamics
- Leadership patterns
- Communication flows
- Department interactions
- Cultural analysis

Analyze and provide insights about how the organization works.""",
}


class BaseExpertAgent:
    def __init__(self, agent_type: str, provider: str = "openai"):
        self.agent_type = agent_type
        self.provider = provider
        self.system_prompt = SYSTEM_PROMPTS.get(agent_type, "You are a helpful AI assistant.")
    
    async def analyze(self, query: str, context: Optional[dict] = None) -> dict:
        context_str = ""
        if context:
            context_str = f"\n\nContext: {json.dumps(context, indent=2)}"
        
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
    
    def _extract_recommendations(self, response: str) -> List[str]:
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
    def __init__(self, provider: str = "openai"):
        super().__init__("finance", provider)
    
    async def analyze_financial_health(self, org_id: str) -> dict:
        db = get_database()
        
        try:
            tasks = list(db.tasks.find({"organization_id": org_id}))
            goals = list(db.goals.find({"organization_id": org_id}))
            
            context = {
                "task_count": len(tasks),
                "goal_count": len(goals),
                "has_goals": len(goals) > 0,
            }
            
            query = "Analyze the financial health indicators based on the available organizational data."
            return await self.analyze(query, context)
        except Exception as e:
            return await self.analyze("Provide general financial health analysis for a business.", {"error": str(e)})
    
    async def suggest_cost_optimization(self, org_id: str) -> dict:
        return await self.analyze(
            "What are the top 5 cost optimization opportunities for this organization?",
            {"organization_id": org_id, "focus": "cost_optimization"}
        )


class OperationsAgent(BaseExpertAgent):
    def __init__(self, provider: str = "openai"):
        super().__init__("operations", provider)
    
    async def analyze_operations(self, org_id: str) -> dict:
        db = get_database()
        
        try:
            tasks = list(db.tasks.find({"organization_id": org_id}).limit(20))
            
            context = {
                "task_count": len(tasks),
                "task_sample": [{"title": t.get("title"), "status": t.get("status")} for t in tasks[:5]]
            }
            
            query = "Analyze operational efficiency and identify improvement areas."
            return await self.analyze(query, context)
        except Exception as e:
            return await self.analyze("Provide operations optimization recommendations.", {"error": str(e)})
    
    async def identify_bottlenecks(self, org_id: str) -> dict:
        return await self.analyze(
            "Identify the top operational bottlenecks and suggest ways to resolve them.",
            {"organization_id": org_id, "focus": "bottlenecks"}
        )


class WorkflowAgent(BaseExpertAgent):
    def __init__(self, provider: str = "openai"):
        super().__init__("workflow", provider)
    
    async def create_workflow(self, workflow_type: str, context: Optional[dict] = None) -> dict:
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
    
    def _extract_steps(self, analysis: str) -> List[Dict[str, str]]:
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
    def __init__(self, provider: str = "openai"):
        super().__init__("forecasting", provider)
    
    async def forecast(self, metric: str, historical_data: Optional[list] = None, context: Optional[dict] = None) -> dict:
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
    def __init__(self, provider: str = "openai"):
        super().__init__("industry_intelligence", provider)
    
    async def analyze_industry(self, industry: str) -> dict:
        query = f"Provide comprehensive analysis of the {industry} industry including trends, challenges, and opportunities."
        
        return await self.analyze(query, {"industry": industry})
    
    async def get_competitor_insights(self, industry: str) -> dict:
        query = f"What are the key competitive factors and best practices in the {industry} industry?"
        
        return await self.analyze(query, {"industry": industry, "focus": "competitors"})


class OrgUnderstandingAgent(BaseExpertAgent):
    def __init__(self, provider: str = "openai"):
        super().__init__("org_understanding", provider)
    
    async def analyze_organization(self, org_id: str) -> dict:
        db = get_database()
        
        try:
            org = db.organizations.find_one({"_id": org_id})
            employees = list(db.employees.find({"organization_id": org_id}))
            tasks = list(db.tasks.find({"organization_id": org_id}).limit(20))
            
            context = {
                "organization": org,
                "employee_count": len(employees),
                "task_count": len(tasks),
                "has_organization": org is not None
            }
            
            query = "Analyze the organization's structure, culture, and operational patterns."
            return await self.analyze(query, context)
        except Exception as e:
            return await self.analyze("Provide organizational analysis based on available data.", {"error": str(e)})


def get_expert_agent(agent_type: str, provider: str = "openai") -> BaseExpertAgent:
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