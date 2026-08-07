import logging
from datetime import datetime, timedelta

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from ..core.database import get_database
from ..dependencies.auth import get_current_user_optional

logger = logging.getLogger("yesboss.sessions")
router = APIRouter()

STALE_DAYS = 30


@router.get("/insights/{organization_id}")
async def list_insights(
    organization_id: str,
    status: str | None = None,
    limit: int = 20,
    current_user = Depends(get_current_user_optional),
):
    """List session insights for an organization, optionally filtered by status.

    Insights are scoped to the authenticated user so nobody sees another
    person's chat insights. Automatically marks open insights older than 30
    days as stale.
    """
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    user_id = getattr(current_user, "uid", None) or (getattr(current_user, "id", None) if current_user else None)
    user_email = getattr(current_user, "email", None) if current_user else None

    # Auto-stale open insights older than 30 days (user-scoped)
    cutoff = datetime.utcnow() - timedelta(days=STALE_DAYS)
    stale_filter: dict = {"organization_id": organization_id, "status": "open", "created_at": {"$lt": cutoff}}
    if user_id:
        stale_filter["user_id"] = user_id
    db.session_insights.update_many(
        stale_filter,
        {"$set": {"status": "stale", "staled_at": datetime.utcnow()}},
    )

    query: dict = {"organization_id": organization_id}
    if user_id:
        query["user_id"] = user_id
    elif user_email:
        query["user_email"] = user_email
    else:
        query["user_id"] = "__unauthenticated__"
    if status:
        query["status"] = status

    insights = list(
        db.session_insights.find(query)
        .sort("created_at", -1)
        .limit(limit)
    )
    for i in insights:
        i["_id"] = str(i["_id"])
        if isinstance(i.get("created_at"), datetime):
            i["created_at"] = i["created_at"].isoformat()

    return {"insights": insights}


@router.post("/insights/confirm")
async def confirm_insight(
    insight_id: str,
    current_user = Depends(get_current_user_optional),
):
    """Mark a session insight as done (only the owning user may do so)."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    try:
        oid = ObjectId(insight_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid insight ID")

    user_id = getattr(current_user, "uid", None) or (getattr(current_user, "id", None) if current_user else None)
    filter: dict = {"_id": oid}
    if user_id:
        filter["user_id"] = user_id

    result = db.session_insights.update_one(
        filter,
        {"$set": {"status": "done", "confirmed_at": datetime.utcnow()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Insight not found")

    return {"success": True, "status": "done"}


@router.post("/insights/dismiss")
async def dismiss_insight(
    insight_id: str,
    current_user = Depends(get_current_user_optional),
):
    """Dismiss a session insight (only the owning user may do so)."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    try:
        oid = ObjectId(insight_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid insight ID")

    user_id = getattr(current_user, "uid", None) or (getattr(current_user, "id", None) if current_user else None)
    filter: dict = {"_id": oid}
    if user_id:
        filter["user_id"] = user_id

    result = db.session_insights.update_one(
        filter,
        {"$set": {"status": "dismissed", "dismissed_at": datetime.utcnow()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Insight not found")

    return {"success": True, "status": "dismissed"}
