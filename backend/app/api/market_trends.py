import logging
import json
import re
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
from datetime import datetime, timedelta
from ..core.database import get_database
from ..dependencies.auth import get_current_user_optional
from ..core.ai_client import get_ai_response

router = APIRouter()
logger = logging.getLogger("yesboss.market_trends")


def get_user_org_id(user) -> Optional[str]:
    if hasattr(user, 'user_metadata') and user.user_metadata:
        return user.user_metadata.get("organization_id")
    return None


def parse_articles_from_ai(response: str) -> list:
    try:
        json_match = re.search(r'\[.*\]', response, re.DOTALL)
        if json_match:
            articles = json.loads(json_match.group())
            if isinstance(articles, list):
                return articles
    except (json.JSONDecodeError, AttributeError):
        pass
    return []


@router.get("/news")
async def get_market_news(
    industry: Optional[str] = Query(None),
    micro_vertical: Optional[str] = Query(None),
    current_user = Depends(get_current_user_optional)
):
    db = get_database()

    org_industry = industry
    org_micro_vertical = micro_vertical

    if current_user and not org_industry:
        org_id = get_user_org_id(current_user)
        if org_id and db:
            org = db.organizations.find_one({"_id": org_id if org_id else None})
            if org:
                org_industry = org_industry or org.get("industry")
                org_micro_vertical = org_micro_vertical or org.get("micro_vertical")

    industry_name = org_industry or "technology"
    vertical = org_micro_vertical or ""
    query_description = f"{industry_name}" + (f" ({vertical})" if vertical else "")

    from ..core.prompt_engine import PERSONA_INSTRUCTIONS
    market_persona = PERSONA_INSTRUCTIONS.get("market_analyst", "You are a market research analyst.")
    system_prompt = (
        f"{market_persona} "
        f"Focus on the {industry_name} industry. "
        "Return ONLY a valid JSON array of article objects. No markdown, no explanation."
    )

    user_prompt = (
        f"Generate 5 realistic market trend articles for a business in the {industry_name} industry"
        + (f" specifically in {vertical}" if vertical else "")
        + """. Every article MUST describe a market trend, shift, or signal that is actively driving or expected to drive revenue growth, market expansion, or competitive advantage for businesses in this space — not generic news.

Focus areas to bias toward:
- emerging customer demand, behavior shifts, or new buyer segments
- technology, AI, or automation adoption that improves margins or unlocks new products
- regulatory or policy changes opening up market opportunity
- capital flows, M&A, or funding momentum signaling where the market is going
- distribution, channel, or partnership shifts (e.g., marketplaces, platforms)
- pricing, packaging, or business model innovations that expand the TAM
- macro or industry indicators (e.g., CAGR, market size growth) that confirm tailwinds

Each article must have these exact fields:
- title: compelling headline framing a growth-driving trend (e.g., "AI-Powered Personalization Lifts DTC Conversion 32%" not "Company X Releases Feature Y")
- description: 1-2 sentence summary that explicitly states WHY this trend creates a growth opportunity for a business in this industry and roughly how big the impact is
- source: real publication name (e.g., Bloomberg, TechCrunch, Reuters, Forbes, McKinsey, Gartner, HBR)
- url: A REAL, VERIFIABLE news URL from a well-known publication that matches the article content (e.g., https://techcrunch.com/2026/05/28/article-slug or https://www.reuters.com/business/article-slug). The URL must look authentic and point to a real, existing publication domain.
- published_at: ISO date string within the last 7 days
- category: array of category strings (use growth-driver tags like "demand", "technology", "regulation", "investment", "distribution", "pricing", "macro")
- image_url: ""
- growth_impact: short string (max 80 chars) summarizing the specific growth lever, e.g. "Unlocks 2x LTV via personalization" or "Opens EU compliance-ready demand pool"

Return a JSON array. Example:
[
  {
    "title": "AI-Powered Personalization Lifts DTC E-commerce Conversion 32%",
    "description": "Brands deploying real-time AI personalization in the first 30 days see a 32% lift in conversion and 18% higher AOV — a major growth lever for direct-to-consumer operators.",
    "source": "TechCrunch",
    "url": "https://techcrunch.com/2026/05/28/ai-personalization-dtc-conversion",
    "published_at": "2026-05-28T10:00:00Z",
    "category": ["technology", "demand"],
    "image_url": "",
    "growth_impact": "2x LTV via personalization"
  }
]"""
    )

    try:
        response = await get_ai_response(
            prompt=user_prompt,
            system_prompt=system_prompt,
            provider="xai",
            temperature=0.7,
            max_tokens=2000,
        )

        articles = parse_articles_from_ai(response)

        if articles:
            now = datetime.utcnow()
            import urllib.parse
            for article in articles:
                if not article.get("published_at"):
                    article["published_at"] = (now - timedelta(hours=len(articles))).isoformat()
                article.setdefault("source", "Market Analysis")
                title_q = urllib.parse.quote(article.get("title", industry_name))
                article["url"] = f"https://news.google.com/search?q={title_q}"
                article.setdefault("category", [industry_name])
                article.setdefault("image_url", "")
                article.setdefault("growth_impact", "")

            return {
                "query": query_description,
                "total": len(articles),
                "articles": articles,
                "source": "ai",
            }
    except Exception as e:
        logger.warning(f"AI news generation failed: {e}")

    return {
        "query": query_description,
        "total": 0,
        "articles": [],
        "source": "ai",
    }


@router.get("/impact/{organization_id}")
async def get_market_impact(
    organization_id: str,
    current_user = Depends(get_current_user_optional)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    impact = db.market_impacts.find_one({"organization_id": organization_id})
    if not impact:
        from ..core.market_impact import analyze_market_impact
        impact = await analyze_market_impact(db, organization_id)

    impact.pop("_id", None)
    return {"impact": impact}


@router.post("/refresh-impact/{organization_id}")
async def refresh_market_impact(
    organization_id: str,
    current_user = Depends(get_current_user_optional)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    from ..core.market_impact import analyze_market_impact
    impact = await analyze_market_impact(db, organization_id)
    impact.pop("_id", None)
    return {"impact": impact}


@router.get("/recommendations/{organization_id}")
async def get_investment_recommendations(
    organization_id: str,
    current_user = Depends(get_current_user_optional)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    from ..core.market_impact import get_investment_recommendations
    result = await get_investment_recommendations(db, organization_id)
    return result
