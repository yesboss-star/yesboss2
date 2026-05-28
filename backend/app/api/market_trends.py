import logging
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from datetime import datetime
from ..core.database import get_database
from ..dependencies.auth import get_current_user, get_current_user_optional
import httpx

router = APIRouter()
logger = logging.getLogger("yesboss.market_trends")

NEWS_DATA_IO_BASE = "https://newsdata.io/api/1"

def get_user_org_id(user) -> Optional[str]:
    if hasattr(user, 'user_metadata') and user.user_metadata:
        return user.user_metadata.get("organization_id")
    return None

@router.get("/news")
async def get_market_news(
    industry: Optional[str] = Query(None),
    micro_vertical: Optional[str] = Query(None),
    country: Optional[str] = Query("us"),
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

    query_parts = [org_industry or "business"]
    if org_micro_vertical:
        query_parts.append(org_micro_vertical)
    query = " ".join(query_parts)

    try:
        api_key = None
        from ..core.config import settings
        api_key = getattr(settings, 'NEWS_DATA_IO_KEY', None)

        if not api_key:
            from ..core.database import get_database
            env_config = db.settings.find_one({"key": "newsdataio_key"}) if db else None
            api_key = env_config.get("value") if env_config else None

        if not api_key:
            return get_mock_news(org_industry, org_micro_vertical)

        async with httpx.AsyncClient() as client:
            params = {
                "apikey": api_key,
                "q": query,
                "country": country,
                "language": "en",
                "size": 10,
            }
            response = await client.get(f"{NEWS_DATA_IO_BASE}/news", params=params, timeout=15.0)
            response.raise_for_status()
            data = response.json()

            articles = []
            for article in data.get("results", [])[:10]:
                articles.append({
                    "title": article.get("title", ""),
                    "description": article.get("description", ""),
                    "source": article.get("source_id", "Unknown"),
                    "url": article.get("link", ""),
                    "published_at": article.get("pubDate", ""),
                    "category": article.get("category", []),
                    "image_url": article.get("image_url", ""),
                })

            return {
                "query": query,
                "total": len(articles),
                "articles": articles,
                "source": "newsdataio",
            }

    except Exception as e:
        logger.warning(f"News API failed: {e}, using mock data")
        return get_mock_news(org_industry, org_micro_vertical)

def get_mock_news(industry: Optional[str], micro_vertical: Optional[str]):
    industry = industry or "technology"
    templates = {
        "technology": [
            {"title": "AI Startups Raise Record $15B in Q2 2026", "description": "Venture capital investment in AI startups reaches new heights as enterprise adoption accelerates across all sectors.", "source": "TechCrunch", "category": ["technology"], "days_ago": 0},
            {"title": "Cloud Computing Market Expected to Reach $2T by 2028", "description": "Major cloud providers announce new AI-powered services as competition intensifies in the cloud market.", "source": "ZDNet", "category": ["technology"], "days_ago": 1},
            {"title": "Cybersecurity Threats Evolve: AI-Powered Defense Systems", "description": "Companies are investing heavily in AI-driven security solutions as cyber threats become more sophisticated.", "source": "Wired", "category": ["technology"], "days_ago": 2},
            {"title": "Quantum Computing Breakthrough: 1000-Qubit Milestone Reached", "description": "Research teams achieve stable 1000-qubit quantum processor, opening new possibilities for complex calculations.", "source": "Nature", "category": ["science"], "days_ago": 3},
            {"title": "SaaS Revenue Multiples Stabilize as Market Matures", "description": "Public SaaS companies see valuation multiples stabilize after two years of correction, signaling market maturity.", "source": "SaaS Capital", "category": ["business"], "days_ago": 4},
            {"title": "Remote Work Tech Stack: New Tools Reshaping Collaboration", "description": "AI-powered collaboration tools are transforming how distributed teams work and communicate effectively.", "source": "Forbes", "category": ["technology"], "days_ago": 5},
            {"title": "Green Tech Investment Surges Amid Climate Regulations", "description": "Sustainable technology investments reach all-time high as new environmental regulations take effect globally.", "source": "Bloomberg", "category": ["business"], "days_ago": 6},
            {"title": "Edge Computing Adoption Accelerates in Manufacturing", "description": "Manufacturing sector leads edge computing adoption with 45% year-over-year growth in implementation.", "source": "Industrial IoT", "category": ["technology"], "days_ago": 7},
            {"title": "Digital Payment Revolution: BNPL and Crypto Integration", "description": "Buy-now-pay-later services and cryptocurrency payments are becoming mainstream in e-commerce platforms.", "source": "Financial Times", "category": ["finance"], "days_ago": 8},
            {"title": "Tech Talent War: Salaries Rise 25% for AI Engineers", "description": "Demand for AI and machine learning engineers drives unprecedented salary growth across the tech industry.", "source": "HR Tech", "category": ["business"], "days_ago": 9},
        ],
        "finance": [
            {"title": "Federal Reserve Signals Policy Shift in Q3 Outlook", "description": "Markets react as Fed signals potential rate adjustments in upcoming quarters.", "source": "Bloomberg", "category": ["finance"], "days_ago": 0},
            {"title": "Fintech Disruption: Traditional Banks Face Digital Challenge", "description": "Legacy banks accelerate digital transformation as fintech startups capture 35% of new accounts.", "source": "Financial Times", "category": ["finance"], "days_ago": 1},
        ],
        "healthcare": [
            {"title": "AI Diagnostics Accuracy Reaches 98% in Clinical Trials", "description": "Machine learning models show remarkable accuracy in early disease detection across multiple specialties.", "source": "Medical News", "category": ["health"], "days_ago": 0},
            {"title": "Telemedicine Adoption Stabilizes at 40% of Patient Visits", "description": "Virtual healthcare visits become permanent fixture as regulations evolve to support remote care.", "source": "Healthcare IT", "category": ["health"], "days_ago": 2},
        ],
        "retail": [
            {"title": "Omnichannel Retail: Online Sales Account for 45% of Total", "description": "Retailers investing heavily in seamless online-to-offline experiences as consumer behavior shifts.", "source": "Retail Dive", "category": ["business"], "days_ago": 0},
        ],
        "manufacturing": [
            {"title": "Industry 5.0: Human-AI Collaboration Drives Productivity", "description": "Next-generation manufacturing facilities report 40% productivity gains through human-AI collaboration.", "source": "Manufacturing Today", "category": ["business"], "days_ago": 1},
        ],
    }

    articles = templates.get(industry.lower(), templates["technology"])
    from datetime import datetime, timedelta
    result = []
    for article in articles:
        published = datetime.utcnow() - timedelta(days=article["days_ago"])
        result.append({
            "title": article["title"],
            "description": article["description"],
            "source": article["source"],
            "url": "#",
            "published_at": published.isoformat(),
            "category": article["category"],
            "image_url": "",
        })

    return {
        "query": industry,
        "total": len(result),
        "articles": result,
        "source": "mock",
    }
