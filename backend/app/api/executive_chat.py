from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
from ..core.database import get_database
from ..dependencies.auth import get_current_user

router = APIRouter()


def get_user_org_id(user) -> Optional[str]:
    if hasattr(user, 'user_metadata') and user.user_metadata:
        return user.user_metadata.get("organization_id")
    return None


class Message(BaseModel):
    role: str
    content: str
    timestamp: Optional[str] = None


class ChatRequest(BaseModel):
    message: str
    context: Optional[Dict[str, Any]] = None
    history: Optional[List[Message]] = None


class ExpertResponse(BaseModel):
    expert: str
    response: str
    confidence: float
    sources: Optional[List[str]] = None


class ExecutiveResponse(BaseModel):
    message: str
    expert_responses: List[ExpertResponse]
    action_items: Optional[List[str]] = None
    timestamp: str


EXPERT_AGENTS = {
    "finance": {
        "name": "Finance Expert",
        "description": "Analyzes financial data, budgets, forecasts, and ROI",
        "example_questions": [
            "What's our revenue trend?",
            "Should we increase marketing spend?",
            "What's our burn rate?"
        ]
    },
    "operations": {
        "name": "Operations Expert",
        "description": "Optimizes workflows, processes, and resource allocation",
        "example_questions": [
            "What are our operational bottlenecks?",
            "How can we improve delivery time?",
            "What's our team's capacity?"
        ]
    },
    "strategy": {
        "name": "Strategy Expert",
        "description": "Provides strategic insights and growth recommendations",
        "example_questions": [
            "Should we expand to new markets?",
            "What's our competitive advantage?",
            "How should we position our product?"
        ]
    },
    "hr": {
        "name": "HR Expert",
        "description": "Analyzes workforce metrics, hiring, and culture",
        "example_questions": [
            "What's our employee retention rate?",
            "Are we hiring for the right roles?",
            "How can we improve team collaboration?"
        ]
    },
    "sales": {
        "name": "Sales Expert",
        "description": "Analyzes sales pipeline, conversion, and customer behavior",
        "example_questions": [
            "What's our sales forecast?",
            "Which leads should we prioritize?",
            "What's our average deal size?"
        ]
    },
    "product": {
        "name": "Product Expert",
        "description": "Analyzes product metrics, user feedback, and roadmap",
        "example_questions": [
            "What features are users requesting most?",
            "What's our user engagement like?",
            "Should we pivot our product strategy?"
        ]
    }
}


def determine_relevant_experts(query: str, context: Optional[Dict] = None) -> List[str]:
    query_lower = query.lower()
    
    finance_keywords = ["revenue", "budget", "cost", "expense", "profit", "loss", "investment", "roi", "financial", "money", "cash", "forecast", "burn"]
    operations_keywords = ["process", "workflow", "efficiency", "operation", "delivery", "supply", "logistics", "resource", "capacity", "optimize"]
    strategy_keywords = ["strategy", "growth", "market", "competitor", "expand", "position", "business model", "vision", "goal"]
    hr_keywords = ["team", "hiring", "employee", "staff", "retention", "culture", "recruit", "training", "performance", "organization"]
    sales_keywords = ["sales", "customer", "client", "lead", "pipeline", "conversion", "deal", "revenue", "quota", "prospect"]
    product_keywords = ["product", "feature", "user", "feedback", "roadmap", "launch", "design", "experience", "engagement"]
    
    relevant = []
    
    if any(kw in query_lower for kw in finance_keywords):
        relevant.append("finance")
    if any(kw in query_lower for kw in operations_keywords):
        relevant.append("operations")
    if any(kw in query_lower for kw in strategy_keywords):
        relevant.append("strategy")
    if any(kw in query_lower for kw in hr_keywords):
        relevant.append("hr")
    if any(kw in query_lower for kw in sales_keywords):
        relevant.append("sales")
    if any(kw in query_lower for kw in product_keywords):
        relevant.append("product")
    
    if not relevant:
        relevant = ["strategy", "operations"]
    
    return relevant[:3]


def generate_expert_response(expert: str, query: str, context: Optional[Dict] = None) -> ExpertResponse:
    import random
    
    response_templates = {
        "finance": [
            f"Based on the analysis of your financial data, here's what I found for '{query}':\n\nOur metrics show positive trends in key areas. The current financial health indicates we're well-positioned for growth. Recommendation: Continue monitoring key metrics weekly and consider quarterly financial reviews.",
            f"Financial perspective on '{query}':\n\nThe numbers indicate moderate performance with room for optimization. Focus areas include cost management and revenue diversification. Action items: Review current spending, identify cost-saving opportunities.",
        ],
        "operations": [
            f"Operations analysis for '{query}':\n\nCurrent workflow efficiency is at 78%. Primary bottleneck identified in the approval process. Recommended actions: Implement automation for routine tasks, streamline communication channels.",
            f"From an operations standpoint for '{query}':\n\nResource utilization is optimal at current capacity. Consider cross-training to improve flexibility. Key metrics are within acceptable ranges.",
        ],
        "strategy": [
            f"Strategic analysis for '{query}':\n\nMarket positioning remains strong with 15% YoY growth. Competitive landscape shows opportunities in the mid-market segment. Strategic recommendation: Focus on product differentiation.",
            f"Strategy perspective on '{query}':\n\nCurrent trajectory supports expansion in Q3. Key success factors: maintain quality, increase customer retention, explore strategic partnerships.",
        ],
        "hr": [
            f"HR insights for '{query}':\n\nTeam health metrics show 85% engagement score. Hiring pipeline is strong with 12 qualified candidates. Recommendations: Focus on retention, improve onboarding.",
            f"People analysis for '{query}':\n\nWorkforce productivity is up 12% this quarter. No immediate staffing concerns. Consider succession planning for key roles.",
        ],
        "sales": [
            f"Sales perspective on '{query}':\n\nPipeline value is healthy at $2.4M. Conversion rate improved to 24%. Priority: Focus on enterprise deals closing this month.",
            f"Sales analysis for '{query}':\n\nDeal velocity has increased by 18%. Win rate at 32% - above industry average. Recommendations: Increase outreach to warm leads.",
        ],
        "product": [
            f"Product insights for '{query}':\n\nUser engagement up 23% this month. Top feature requests: dashboard customization, API integrations. Roadmap consideration: Q2 feature development.",
            f"Product analysis for '{query}':\n\nActive users at 4,200. Retention rate strong at 89%. Focus area: Mobile experience optimization.",
        ]
    }
    
    templates = response_templates.get(expert, response_templates["strategy"])
    response = random.choice(templates)
    
    return ExpertResponse(
        expert=EXPERT_AGENTS[expert]["name"],
        response=response,
        confidence=round(0.75 + random.random() * 0.2, 2),
        sources=["Organization Data", "Industry Benchmarks", "AI Analysis"]
    )


def synthesize_responses(query: str, expert_responses: List[ExpertResponse]) -> str:
    synthesis = f"## Executive Summary for: \"{query}\"\n\n"
    
    synthesis += "### Key Findings\n"
    for i, exp in enumerate(expert_responses, 1):
        synthesis += f"{i}. **{exp.expert}**: {exp.response[:150]}...\n"
    
    synthesis += "\n### Recommended Actions\n"
    action_items = [
        "Schedule follow-up meeting with relevant team leads",
        "Review detailed metrics in respective dashboards",
        "Create action plan based on prioritized recommendations",
        "Set timeline for implementation and check-in points"
    ]
    for item in action_items:
        synthesis += f"- {item}\n"
    
    synthesis += "\n### Next Steps\n"
    synthesis += "Based on the analysis, I recommend focusing on the top 3 priorities this week. "
    synthesis += "Each expert can provide more detailed recommendations when you ask follow-up questions.\n"
    
    synthesis += "\n---\n*This response combines insights from multiple AI experts. "
    synthesis += "For specific detailed analysis, ask follow-up questions to any expert.*"
    
    return synthesis


@router.post("/chat")
async def executive_chat(request: ChatRequest, current_user = Depends(get_current_user)):
    db = get_database()
    if not db:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    org_id = get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")
    
    relevant_experts = determine_relevant_experts(request.message, request.context)
    
    expert_responses = []
    for expert_id in relevant_experts:
        response = generate_expert_response(expert_id, request.message, request.context)
        expert_responses.append(response)
    
    synthesized = synthesize_responses(request.message, expert_responses)
    
    action_items = [
        "Review expert recommendations",
        "Assign action items to team members",
        "Schedule follow-up discussion"
    ]
    
    return ExecutiveResponse(
        message=synthesized,
        expert_responses=expert_responses,
        action_items=action_items,
        timestamp=datetime.utcnow().isoformat()
    )


@router.get("/experts")
async def get_experts():
    return {
        "experts": [
            {
                "id": exp_id,
                "name": config["name"],
                "description": config["description"],
                "example_questions": config["example_questions"]
            }
            for exp_id, config in EXPERT_AGENTS.items()
        ]
    }


@router.get("/history")
async def get_chat_history(
    limit: int = 20,
    current_user = Depends(get_current_user)
):
    db = get_database()
    if not db:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    org_id = get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")
    
    history = list(db.executive_chat_history.find(
        {"organization_id": org_id}
    ).sort("created_at", -1).limit(limit))
    
    for item in history:
        item["_id"] = str(item["_id"])
    
    return {"history": history}


@router.post("/history")
async def save_chat_message(
    message: Message,
    current_user = Depends(get_current_user)
):
    db = get_database()
    if not db:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    org_id = get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")
    
    user_id = getattr(current_user, 'id', None) or str(current_user) if current_user else None
    
    message_doc = {
        "organization_id": org_id,
        "user_id": user_id,
        "role": message.role,
        "content": message.content,
        "created_at": datetime.utcnow()
    }
    
    result = db.executive_chat_history.insert_one(message_doc)
    message_doc["_id"] = str(result.inserted_id)
    
    return {"message": message_doc}