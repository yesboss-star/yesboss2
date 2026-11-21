import asyncio
import json
import logging
import re
import urllib.parse
from datetime import datetime, timedelta
from xml.etree import ElementTree

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from ..api.websocket import manager as ws_manager
from ..core.ai_client import get_ai_response
from ..core.database import get_database
from ..dependencies.auth import get_current_user_optional


async def create_notification(user_id: str, org_id: str, type: str, title: str, message: str, link: str = None, actor_id: str = None, actor_name: str = None, metadata: dict = None, email: str = None):
    try:
        from ..core.notification_service import create_and_deliver
        await create_and_deliver(user_id, org_id, type, title, message, link, actor_id, actor_name, metadata, email=email)
    except Exception as e:
        logger.error(f"Failed to create notification: {e}")

router = APIRouter()
logger = logging.getLogger("yesboss.market_trends")


def get_user_org_id(user) -> str | None:
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


async def fetch_google_news(industry: str, micro_vertical: str = "") -> list:
    try:
        import httpx
        query = f"{industry} {micro_vertical} market trends growth".strip()
        query = urllib.parse.quote_plus(query)
        url = f"https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en"
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            if resp.status_code != 200:
                logger.warning(f"Google News RSS returned {resp.status_code}")
                return []
        root = ElementTree.fromstring(resp.content)
        articles = []
        for item in root.iter("item"):
            title = ""
            desc = ""
            link = ""
            source = ""
            pub_date = ""
            for child in item:
                if child.tag == "title":
                    title = child.text or ""
                elif child.tag == "description":
                    desc = child.text or ""
                elif child.tag == "link":
                    link = child.text or ""
                elif child.tag == "source":
                    source = child.text or ""
                elif child.tag == "pubDate":
                    pub_date = child.text or ""
            if not title:
                continue
            try:
                parsed_date = datetime.strptime(pub_date, "%a, %d %b %Y %H:%M:%S %Z")
            except Exception:
                parsed_date = datetime.utcnow()
            articles.append({
                "title": title,
                "description": desc[:200],
                "source": source or "Google News",
                "url": link,
                "published_at": parsed_date.isoformat() + "Z",
                "category": [industry],
                "image_url": "",
                "growth_impact": "",
            })
        logger.info(f"Google News RSS returned {len(articles)} articles for '{query}'")
        return articles[:8]
    except ImportError:
        logger.warning("httpx not available for Google News RSS")
    except Exception as e:
        logger.warning(f"Google News RSS failed: {e}")
    return []


@router.get("/news")
async def get_market_news(
    industry: str | None = Query(None),
    micro_vertical: str | None = Query(None),
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

    real_articles = await fetch_google_news(industry_name, vertical)
    if real_articles:
        return {
            "query": query_description,
            "total": len(real_articles),
            "articles": real_articles,
            "source": "google_news",
        }

    # No real headlines were found. Never ask the AI to write articles: report that nothing was found.
    return {
        "query": query_description,
        "total": 0,
        "articles": [],
        "source": "none",
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
    impact = await analyze_market_impact(db, organization_id, refresh_trends=True)
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


@router.post("/create-goal")
async def create_goal_from_trend(
    organization_id: str = Query(...),
    title: str = Query(...),
    description: str = Query(""),
    department: str = Query("general"),
    current_user = Depends(get_current_user_optional)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    goal = {
        "title": title,
        "description": description,
        "status": "active",
        "priority": "medium",
        "department": department,
        "timeline": "quarterly",
        "duration": "90",
        "goal_type": "growth",
        "organization_id": organization_id,
        "created_by": getattr(current_user, 'id', None) if current_user else None,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "is_default": False,
        "industry": "",
        "micro_vertical": "",
        "review_frequency_days": 30,
        "source": "market_trend",
    }

    result = db.goals.insert_one(goal)
    goal_id = str(result.inserted_id)
    goal["_id"] = goal_id
    goal["created_at"] = goal["created_at"].isoformat()
    goal["updated_at"] = goal["updated_at"].isoformat()

    org = db.organizations.find_one({"_id": ObjectId(organization_id)}) if organization_id else None
    owner_id = org.get("owner_id") if org else None
    notif_user_id = getattr(current_user, 'id', None) if current_user else owner_id

    async def _background_task_gen():
        try:
            from ..core.intelligence import generate_tasks_from_goal
            generated = await generate_tasks_from_goal(goal["title"], description, count=4)
            created_tasks = []
            for t in generated:
                task_doc = {
                    "title": t.get("title", f"Task for {goal['title']}"),
                    "description": t.get("description", ""),
                    "priority": t.get("priority", "medium"),
                    "status": "pending",
                    "goal_id": goal_id,
                    "organization_id": organization_id,
                    "created_by": goal["created_by"],
                    "department": department,
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                    "source": "market_trend",
                }
                tr = db.tasks.insert_one(task_doc)
                task_doc["_id"] = str(tr.inserted_id)
                task_doc["created_at"] = task_doc["created_at"].isoformat()
                task_doc["updated_at"] = task_doc["updated_at"].isoformat()
                created_tasks.append(task_doc)

            asyncio.create_task(ws_manager.broadcast_to_organization(
                {"type": "goal_created", "data": {**goal, "tasks": created_tasks, "task_count": len(created_tasks)}},
                organization_id
            ))

            if notif_user_id:
                asyncio.create_task(create_notification(
                    user_id=notif_user_id,
                    org_id=organization_id,
                    type="goal_created",
                    title="Goal Created from Market Trend",
                    message=f"Goal created from market trend: {title}",
                    link=f"/goals/{goal_id}",
                ))
        except Exception as e:
            logger.error(f"Background task generation failed: {e}")

    asyncio.create_task(_background_task_gen())

    asyncio.create_task(ws_manager.broadcast_to_organization(
        {"type": "goal_created", "data": goal},
        organization_id
    ))

    return {"success": True, "goal": goal, "tasks": [], "task_count": 4}


@router.get("/impact-history/{organization_id}")
async def get_market_impact_history(
    organization_id: str,
    current_user = Depends(get_current_user_optional)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    history = list(
        db.market_impact_history.find({"organization_id": organization_id})
        .sort("snapshot_date", -1)
        .limit(12)
    )
    for h in history:
        h.pop("_id", None)

    current = db.market_impacts.find_one({"organization_id": organization_id})

    return {
        "history": history,
        "current": {
            "high": len([i for i in (current.get("impacts", []) if current else []) if i.get("impact_level") == "high"]),
            "medium": len([i for i in (current.get("impacts", []) if current else []) if i.get("impact_level") == "medium"]),
            "low": len([i for i in (current.get("impacts", []) if current else []) if i.get("impact_level") == "low"]),
        } if current else None,
    }
