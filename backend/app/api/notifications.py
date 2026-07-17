import asyncio
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from ..api.websocket import manager as ws_manager
from ..core.database import get_database
from ..dependencies.auth import get_current_user_optional

router = APIRouter()


def get_user_org_id(user) -> str | None:
    if hasattr(user, 'user_metadata') and user.user_metadata:
        return user.user_metadata.get("organization_id")
    return None


class NotificationCreate(BaseModel):
    type: str
    title: str
    message: str
    user_id: str
    organization_id: str
    link: str | None = None
    actor_id: str | None = None
    actor_name: str | None = None
    metadata: dict | None = None


class NotificationUpdate(BaseModel):
    read: bool | None = None


@router.post("")
async def create_notification(notification: NotificationCreate, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    notif_doc = {
        "type": notification.type,
        "title": notification.title,
        "message": notification.message,
        "user_id": notification.user_id,
        "organization_id": notification.organization_id,
        "link": notification.link,
        "actor_id": notification.actor_id,
        "actor_name": notification.actor_name,
        "metadata": notification.metadata or {},
        "read": False,
        "created_at": datetime.now(timezone.utc),
    }

    result = db.notifications.insert_one(notif_doc)
    notif_doc["_id"] = str(result.inserted_id)

    asyncio.create_task(ws_manager.send_personal_message(
        {"type": "notification", "data": notif_doc},
        notification.user_id
    ))

    return {"notification": notif_doc}


@router.get("")
async def list_notifications(
    read: bool | None = None,
    type: str | None = None,
    limit: int = Query(default=50, le=100),
    organization_id: str | None = None,
    current_user = Depends(get_current_user_optional)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = organization_id or get_user_org_id(current_user)
    user_id = getattr(current_user, 'id', None) or str(current_user) if current_user else None

    if not user_id and not org_id:
        return {"notifications": [], "total": 0}

    query = {}
    if user_id:
        query["user_id"] = user_id
    if org_id:
        query["organization_id"] = org_id
    if read is not None:
        query["read"] = read
    if type:
        query["type"] = type

    notifications = list(db.notifications.find(query).sort("created_at", -1).limit(limit))

    for n in notifications:
        n["_id"] = str(n["_id"])

    return {"notifications": notifications, "total": len(notifications)}


@router.get("/unread-count")
async def unread_notification_count(current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    user_id = getattr(current_user, 'id', None) or str(current_user) if current_user else None
    if not user_id:
        return {"count": 0}

    count = db.notifications.count_documents({"user_id": user_id, "read": False})
    return {"count": count}


@router.get("/{notification_id}")
async def get_notification(notification_id: str, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    notif = db.notifications.find_one({"_id": ObjectId(notification_id)})
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")

    notif["_id"] = str(notif["_id"])
    return {"notification": notif}


@router.patch("/{notification_id}/read")
async def mark_notification_read(notification_id: str, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    db.notifications.update_one(
        {"_id": ObjectId(notification_id)},
        {"$set": {"read": True, "read_at": datetime.utcnow()}}
    )

    notif = db.notifications.find_one({"_id": ObjectId(notification_id)})
    if notif:
        notif["_id"] = str(notif["_id"])

    return {"notification": notif, "success": True}


@router.post("/mark-all-read")
async def mark_all_notifications_read(organization_id: str | None = None, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    user_id = getattr(current_user, 'id', None) or str(current_user) if current_user else None
    if not user_id:
        raise HTTPException(status_code=400, detail="User ID required")

    query = {"user_id": user_id, "read": False}
    if organization_id:
        query["organization_id"] = organization_id

    result = db.notifications.update_many(
        query,
        {"$set": {"read": True, "read_at": datetime.utcnow()}}
    )

    return {"success": True, "modified_count": result.modified_count}


@router.delete("/{notification_id}")
async def delete_notification(notification_id: str, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    db.notifications.delete_one({"_id": ObjectId(notification_id)})
    return {"success": True, "message": "Notification deleted"}
