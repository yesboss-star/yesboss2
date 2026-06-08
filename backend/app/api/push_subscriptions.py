import asyncio
import json
import logging
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from ..core.database import get_database
from ..dependencies.auth import get_current_user, get_current_user_optional
from ..core.config import settings

logger = logging.getLogger("yesboss.push")

router = APIRouter()


class PushSubscriptionCreate(BaseModel):
    endpoint: str
    keys: dict
    user_agent: Optional[str] = None


def get_push_collection():
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    return db["push_subscriptions"]


@router.post("/subscribe")
async def subscribe(
    subscription: PushSubscriptionCreate,
    current_user=Depends(get_current_user_optional),
):
    user_id = getattr(current_user, "id", None) or str(current_user) if current_user else None
    if not user_id:
        raise HTTPException(status_code=400, detail="User not authenticated")

    collection = get_push_collection()
    existing = collection.find_one({"user_id": user_id, "endpoint": subscription.endpoint})
    if existing:
        return {"success": True, "message": "Already subscribed"}

    collection.insert_one({
        "user_id": user_id,
        "endpoint": subscription.endpoint,
        "keys": subscription.keys,
        "user_agent": subscription.user_agent,
        "created_at": __import__("datetime").datetime.utcnow(),
    })
    return {"success": True, "message": "Subscribed"}


@router.post("/unsubscribe")
async def unsubscribe(
    endpoint: str,
    current_user=Depends(get_current_user_optional),
):
    user_id = getattr(current_user, "id", None) or str(current_user) if current_user else None
    if not user_id:
        raise HTTPException(status_code=400, detail="User not authenticated")

    collection = get_push_collection()
    collection.delete_one({"user_id": user_id, "endpoint": endpoint})
    return {"success": True, "message": "Unsubscribed"}


@router.get("/vapid-public-key")
async def get_vapid_public_key():
    if not settings.VAPID_PUBLIC_KEY:
        raise HTTPException(status_code=404, detail="VAPID not configured")
    return {"public_key": settings.VAPID_PUBLIC_KEY}
