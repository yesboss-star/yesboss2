import json
import logging
from datetime import datetime
from typing import Any

logger = logging.getLogger("yesboss.market_impact")


async def analyze_market_impact(db: Any, org_id: str) -> dict:
    org = None
    try:
        from bson import ObjectId
        org = db.organizations.find_one({"_id": ObjectId(org_id)})
    except Exception:
        org = db.organizations.find_one({"owner_id": org_id})
    if not org:
        return {"organization_id": org_id, "error": "Organization not found", "impacts": [], "summary": ""}

    industry = org.get("industry", "")
    micro_vertical = org.get("micro_vertical", "")

    trends: list[dict[str, Any]] = list(db.market_trends.find({"organization_id": org_id}).sort("published_at", -1).limit(10))
    if not trends:
        from ..core.ai_client import get_ai_response
        prompt = (
            f"Generate 5 realistic market trend articles for a business in the {industry} industry"
            + (f" specifically in {micro_vertical}" if micro_vertical else "")
            + """. Each article must have: title, description, source, url, published_at, category, growth_impact.
Return ONLY a valid JSON array. No markdown."""
        )
        try:
            response = await get_ai_response(prompt, temperature=0.7, max_tokens=2500)
            import re
            match = re.search(r'\[.*\]', response, re.DOTALL)
            if match:
                trends = json.loads(match.group())
                if isinstance(trends, list):
                    for t in trends:
                        t["organization_id"] = org_id
                        t["created_at"] = datetime.utcnow()
                        db.market_trends.insert_one(t)
        except Exception as e:
            logger.warning(f"Market trend generation failed: {e}")
            trends = []

    goals = list(db.goals.find({"organization_id": org_id}).sort("created_at", -1).limit(20))
    tasks = list(db.tasks.find({"organization_id": org_id}).sort("created_at", -1).limit(50))
    total_tasks = len(tasks)
    completed_tasks = len([t for t in tasks if t.get("status") == "completed"])

    from ..core.ai_client import get_ai_response
    trends_summary = []
    for t in trends[:5]:
        trends_summary.append(f"- {t.get('title')} ({t.get('growth_impact', 'N/A')})")

    prompt = (
        f"Analyze these market trends for a {industry} company"
        + (f" ({micro_vertical})" if micro_vertical else "")
        + f".\n\nCompany context:\n"
        f"- Active goals: {len([g for g in goals if g.get('status') == 'active'])}"
        f"\n- Completed goals: {len([g for g in goals if g.get('status') == 'completed'])}"
        f"\n- Task completion rate: {round((completed_tasks / total_tasks * 100), 1) if total_tasks > 0 else 0}%"
        f"\n\nMarket trends:\n" + "\n".join(trends_summary) +
        "\n\nFor each trend, assess: impact_level (high/medium/low), growth_opportunity (1 sentence), "
        "investment_recommendation (1 sentence), risk_if_ignored (1 sentence). "
        "Also provide a 2-3 sentence executive summary of the overall market positioning.\n\n"
        "Return as JSON: { \"impacts\": [{ \"title\": \"...\", \"impact_level\": \"...\", "
        "\"growth_opportunity\": \"...\", \"investment_recommendation\": \"...\", "
        "\"risk_if_ignored\": \"...\" }], \"summary\": \"...\" }"
        "Only return valid JSON, no markdown."
    )

    result_data: dict[str, Any] = {"impacts": [], "summary": "Market impact analysis unavailable."}
    try:
        response = await get_ai_response(prompt, temperature=0.4, max_tokens=2500)
        response = response.strip()
        if response.startswith("```"):
            response = response.split("\n", 1)[-1]
            response = response.rsplit("```", 1)[0]
        parsed = json.loads(response)
        result_data["impacts"] = parsed.get("impacts", [])
        result_data["summary"] = parsed.get("summary", "")
    except Exception as e:
        logger.warning(f"Market impact analysis failed: {e}")

    for imp in result_data["impacts"]:
        trend = next((t for t in trends if t.get("title") == imp.get("title")), {})
        imp["growth_impact"] = trend.get("growth_impact", "")
        imp["category"] = trend.get("category", [])

    doc = {
        "organization_id": org_id,
        "generated_at": datetime.utcnow(),
        "industry": industry,
        "micro_vertical": micro_vertical,
        "impacts": result_data["impacts"],
        "summary": result_data["summary"],
        "trend_count": len(trends),
    }

    try:
        existing = db.market_impacts.find_one({"organization_id": org_id})
        if existing:
            db.market_impacts.update_one({"_id": existing["_id"]}, {"$set": doc})
        else:
            db.market_impacts.insert_one(doc)
    except Exception as e:
        logger.warning(f"Failed to store market impact: {e}")

    return doc


async def get_investment_recommendations(db: Any, org_id: str) -> dict:
    impact = db.market_impacts.find_one({"organization_id": org_id})
    if not impact:
        impact = await analyze_market_impact(db, org_id)

    org = None
    try:
        from bson import ObjectId
        org = db.organizations.find_one({"_id": ObjectId(org_id)})
    except Exception:
        org = db.organizations.find_one({"owner_id": org_id})

    import json

    from ..core.ai_client import get_ai_response

    impacts_text = ""
    for imp in impact.get("impacts", []):
        impacts_text += f"- {imp.get('title')} ({imp.get('impact_level')}): {imp.get('investment_recommendation', '')}\n"

    prompt = (
        f"Based on these market impacts for a {org.get('industry', '')} company"
        + (f" ({org.get('micro_vertical', '')})" if org and org.get('micro_vertical') else "")
        + f":\n\n{impacts_text}\n\n"
        f"Provide 3-5 specific investment recommendations. For each: area (string), "
        f"recommendation (1-2 sentences), estimated_roi (e.g. '15-20%'), "
        f"timeline (e.g. '3-6 months'), risk_level (low/medium/high).\n\n"
        f"Return as JSON array. Only valid JSON, no markdown."
    )

    try:
        response = await get_ai_response(prompt, temperature=0.4, max_tokens=2000)
        response = response.strip()
        if response.startswith("```"):
            response = response.split("\n", 1)[-1]
            response = response.rsplit("```", 1)[0]
        recommendations = json.loads(response)
        if isinstance(recommendations, dict) and "recommendations" in recommendations:
            recommendations = recommendations["recommendations"]
        if not isinstance(recommendations, list):
            recommendations = [recommendations]
        return {"recommendations": recommendations}
    except Exception as e:
        logger.warning(f"Investment recommendations failed: {e}")
        return {"recommendations": []}
