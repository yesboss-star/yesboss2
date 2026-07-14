
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..core.database import get_database
from ..dependencies.auth import get_current_user_optional

router = APIRouter()

DEFAULT_PREFERENCES = {
    "email": {
        "task_assigned": True,
        "task_status": True,
        "task_completed": True,
        "goal_created": True,
        "goal_assigned": True,
        "goal_status": True,
        "alert": True,
    },
    "push": {
        "task_assigned": True,
        "task_status": True,
        "task_completed": True,
        "goal_created": True,
        "goal_assigned": True,
        "goal_status": True,
        "alert": True,
    },
    "in_app": {
        "task_assigned": True,
        "task_status": True,
        "task_completed": True,
        "goal_created": True,
        "goal_assigned": True,
        "goal_status": True,
        "alert": True,
    },
    "sound": True,
    "digest": {
        "enabled": False,
        "frequency": "never",
    },
}


class NotificationPreferencesUpdate(BaseModel):
    email: dict | None = None
    push: dict | None = None
    in_app: dict | None = None
    sound: bool | None = None
    digest: dict | None = None


def get_preferences_collection():
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    return db["notification_preferences"]


def get_user_preferences(user_id: str, org_id: str) -> dict:
    collection = get_preferences_collection()
    prefs = collection.find_one({"user_id": user_id, "organization_id": org_id})
    if not prefs:
        prefs = {"user_id": user_id, "organization_id": org_id, **DEFAULT_PREFERENCES}
        collection.insert_one(prefs)
    prefs.pop("_id", None)
    return prefs


@router.get("")
async def get_preferences(current_user=Depends(get_current_user_optional)):
    user_id = getattr(current_user, "id", None) or str(current_user) if current_user else None
    org_id = None
    if hasattr(current_user, "user_metadata") and current_user.user_metadata:
        org_id = current_user.user_metadata.get("organization_id")

    if not user_id:
        return {"preferences": DEFAULT_PREFERENCES}

    prefs = get_user_preferences(user_id, org_id or "")
    return {"preferences": prefs}


@router.put("")
async def update_preferences(
    updates: NotificationPreferencesUpdate,
    current_user=Depends(get_current_user_optional),
):
    user_id = getattr(current_user, "id", None) or str(current_user) if current_user else None
    org_id = None
    if hasattr(current_user, "user_metadata") and current_user.user_metadata:
        org_id = current_user.user_metadata.get("organization_id")

    if not user_id:
        raise HTTPException(status_code=400, detail="User not authenticated")

    collection = get_preferences_collection()
    existing = collection.find_one({"user_id": user_id, "organization_id": org_id or ""})
    if not existing:
        existing = {"user_id": user_id, "organization_id": org_id or "", **DEFAULT_PREFERENCES}
        collection.insert_one(existing)

    update_data = {}
    if updates.email is not None:
        update_data["email"] = {**existing.get("email", DEFAULT_PREFERENCES["email"]), **updates.email}
    if updates.push is not None:
        update_data["push"] = {**existing.get("push", DEFAULT_PREFERENCES["push"]), **updates.push}
    if updates.in_app is not None:
        update_data["in_app"] = {**existing.get("in_app", DEFAULT_PREFERENCES["in_app"]), **updates.in_app}
    if updates.sound is not None:
        update_data["sound"] = updates.sound
    if updates.digest is not None:
        update_data["digest"] = {**existing.get("digest", DEFAULT_PREFERENCES["digest"]), **updates.digest}

    if update_data:
        collection.update_one(
            {"user_id": user_id, "organization_id": org_id or ""},
            {"$set": update_data},
        )

    updated = collection.find_one({"user_id": user_id, "organization_id": org_id or ""})
    updated.pop("_id", None)
    return {"preferences": updated}
