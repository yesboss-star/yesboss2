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

    Automatically marks open insights older than 30 days as stale.
    """
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    # Auto-stale open insights older than 30 days
    cutoff = datetime.utcnow() - timedelta(days=STALE_DAYS)
    db.session_insights.update_many(
        {"organization_id": organization_id, "status": "open", "created_at": {"$lt": cutoff}},
        {"$set": {"status": "stale", "staled_at": datetime.utcnow()}},
    )

    query: dict = {"organization_id": organization_id}
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
    """Mark a session insight as done."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    try:
        oid = ObjectId(insight_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid insight ID")

    result = db.session_insights.update_one(
        {"_id": oid},
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
    """Dismiss a session insight (mark as dismissed, not done)."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    try:
        oid = ObjectId(insight_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid insight ID")

    result = db.session_insights.update_one(
        {"_id": oid},
        {"$set": {"status": "dismissed", "dismissed_at": datetime.utcnow()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Insight not found")

    return {"success": True, "status": "dismissed"}
