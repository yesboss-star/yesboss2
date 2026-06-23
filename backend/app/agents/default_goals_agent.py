"""AI agent that generates default goals for a new organization based on industry and micro-vertical."""

import json
import logging
from typing import Optional, List, Dict, Any
from ..core.ai_client import get_ai_response

logger = logging.getLogger("yesboss.default_goals_agent")

SYSTEM_PROMPT = """You are a business strategy expert specializing in organizational goal-setting across industries.
Generate realistic, actionable default goals that a company in the given industry and micro-vertical would typically need."""


def _build_prompt(industry: str, micro_vertical: str, count: int = 5) -> str:
    mv = micro_vertical or "general"
    return f"""Generate {count} default goals for a {industry} / {mv} company.

Return a JSON array ONLY — no markdown, no commentary, no extra text.
Each goal must have these exact fields:
  - "title": str (clear, actionable title)
  - "description": str (2-3 sentence description)
  - "goal_type": "short_term" | "long_term"
  - "duration": "one_time" | "continuous"
  - "priority": "high" | "medium" | "low"
  - "department": str (which department owns this goal)
  - "suggested_timeline": str (e.g. "3 months", "Q3 2026", "ongoing")

Make each goal specific to {industry} companies in the {mv} vertical.
Include a mix of short-term and long-term goals, and a mix of one-time and continuous goals.

Example:
[
  {{
    "title": "Increase customer acquisition by 25%",
    "description": "Run targeted marketing campaigns across LinkedIn and Google Ads to attract new enterprise customers in the fintech space.",
    "goal_type": "short_term",
    "duration": "one_time",
    "priority": "high",
    "department": "Marketing",
    "suggested_timeline": "Q3 2026"
  }}
]"""


async def generate_default_goals(
    industry: str,
    micro_vertical: Optional[str] = None,
    count: int = 5,
    provider: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Generate default goals for an organization using AI."""
    prompt = _build_prompt(industry, micro_vertical, count)

    try:
        raw = await get_ai_response(
            prompt=prompt,
            system_prompt=SYSTEM_PROMPT,
            temperature=0.7,
            max_tokens=2500,
            provider=provider,
        )

        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
            cleaned = cleaned.rsplit("```", 1)[0] if "```" in cleaned else cleaned

        goals = json.loads(cleaned)
        if not isinstance(goals, list):
            raise ValueError("AI response was not a list")

        for g in goals:
            g.setdefault("is_default", True)

        logger.info(f"Generated {len(goals)} default goals for {industry}/{micro_vertical}")
        return goals

    except (json.JSONDecodeError, ValueError) as e:
        logger.error(f"Failed to parse AI response: {e}")
        return _fallback_goals(industry, micro_vertical, count)


def _fallback_goals(industry: str, micro_vertical: str, count: int = 5) -> List[Dict[str, Any]]:
    """Fallback goals when AI fails — template-based for common industries."""
    templates = {
        "saas": [
            {"title": "Increase Monthly Recurring Revenue by 20%", "description": "Focus on upselling existing customers and reducing churn through improved onboarding and support.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Sales", "suggested_timeline": "Q3 2026", "is_default": True},
            {"title": "Launch new product feature for enterprise tier", "description": "Develop and release an enterprise-grade feature set to attract larger clients and increase ARPU.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Product", "suggested_timeline": "4 months", "is_default": True},
            {"title": "Reduce customer churn rate to under 5%", "description": "Implement proactive customer success outreach, improve onboarding flow, and gather feedback loops.", "goal_type": "long_term", "duration": "continuous", "priority": "high", "department": "Customer Success", "suggested_timeline": "ongoing", "is_default": True},
            {"title": "Build and train high-performing engineering team", "description": "Hire 3 senior engineers, establish coding standards, and implement CI/CD pipeline.", "goal_type": "long_term", "duration": "one_time", "priority": "medium", "department": "Engineering", "suggested_timeline": "6 months", "is_default": True},
            {"title": "Achieve SOC 2 Type II certification", "description": "Prepare documentation, implement security controls, and pass audit for SOC 2 compliance.", "goal_type": "short_term", "duration": "one_time", "priority": "medium", "department": "Operations", "suggested_timeline": "6 months", "is_default": True},
        ],
        "fintech": [
            {"title": "Reduce payment processing failure rate", "description": "Optimize payment gateway integrations and implement retry logic to minimize failed transactions.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Engineering", "suggested_timeline": "2 months", "is_default": True},
            {"title": "Achieve regulatory compliance for new market", "description": "Research and implement compliance requirements for expanding into a new geographic market.", "goal_type": "long_term", "duration": "one_time", "priority": "high", "department": "Legal", "suggested_timeline": "6 months", "is_default": True},
        ],
        "healthcare": [
            {"title": "Achieve HIPAA compliance", "description": "Implement required security measures, train staff, and complete audit for HIPAA compliance.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Operations", "suggested_timeline": "3 months", "is_default": True},
        ],
        "ecommerce": [
            {"title": "Reduce cart abandonment rate by 15%", "description": "Optimize checkout flow, add guest checkout option, and implement cart recovery emails.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Product", "suggested_timeline": "2 months", "is_default": True},
        ],
    }

    ind = (industry or "").lower()
    for key in templates:
        if key in ind:
            return templates[key][:count]

    return [
        {"title": f"Increase revenue by 20% in the next quarter", "description": f"Drive growth through targeted sales and marketing initiatives for the {industry} vertical.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Sales", "suggested_timeline": "Q3 2026", "is_default": True},
        {"title": f"Build a strong team culture and processes", "description": "Establish regular team meetings, OKR tracking, and performance reviews.", "goal_type": "long_term", "duration": "continuous", "priority": "medium", "department": "Human Resources", "suggested_timeline": "ongoing", "is_default": True},
        {"title": f"Improve customer satisfaction score", "description": "Implement feedback surveys, reduce response times, and enhance product based on user input.", "goal_type": "short_term", "duration": "continuous", "priority": "medium", "department": "Customer Support", "suggested_timeline": "ongoing", "is_default": True},
        {"title": f"Develop thought leadership in {industry}", "description": "Publish whitepapers, speak at conferences, and build brand authority in the industry.", "goal_type": "long_term", "duration": "continuous", "priority": "low", "department": "Marketing", "suggested_timeline": "ongoing", "is_default": True},
        {"title": f"Streamline internal operations and reduce costs", "description": "Audit current operational expenses and implement automation where possible.", "goal_type": "short_term", "duration": "one_time", "priority": "medium", "department": "Operations", "suggested_timeline": "3 months", "is_default": True},
    ][:count]
