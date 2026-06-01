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
        f"Generate 5 realistic market news articles about the {industry_name} industry"
        + (f" specifically in {vertical}" if vertical else "")
        + """. Each article must have these exact fields:
- title: compelling headline
- description: 1-2 sentence summary
- source: real publication name (e.g., Bloomberg, TechCrunch, Reuters, Forbes)
- url: A REAL, VERIFIABLE news URL from a well-known publication that matches the article content (e.g., https://techcrunch.com/2026/05/28/article-slug or https://www.reuters.com/business/article-slug). The URL must look authentic and point to a real, existing publication domain.
- published_at: ISO date string within the last 7 days
- category: array of category strings
- image_url: ""

Return a JSON array. Example:
[
  {
    "title": "AI Startups Raise Record Funding",
    "description": "Venture capital investment in AI reaches new highs...",
    "source": "TechCrunch",
    "url": "https://techcrunch.com/2026/05/28/ai-startups-record-funding",
    "published_at": "2026-05-28T10:00:00Z",
    "category": ["technology"],
    "image_url": ""
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
