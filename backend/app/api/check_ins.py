from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from ..core.database import get_database
from ..core.check_in_service import check_org_due_for_check_in, generate_check_in, send_check_in_notification, store_check_in, record_check_in_response
from ..dependencies.auth import get_current_user_optional

router = APIRouter()

class CheckInNote(BaseModel):
    goal_id: str
    note: Optional[str] = None
    action_taken: str = "none"

class CheckInResponse(BaseModel):
    check_in_id: str
    notes: list[CheckInNote] = []


@router.get("/{org_id}/check-ins")
async def list_check_ins(org_id: str, limit: int = 10):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    check_ins = list(db.check_ins.find({"org_id": org_id}).sort("check_in_date", -1).limit(limit))
    for c in check_ins:
        c["_id"] = str(c["_id"])
        if isinstance(c.get("check_in_date"), datetime):
            c["check_in_date"] = c["check_in_date"].isoformat()
    return {"check_ins": check_ins}


@router.get("/{org_id}/check-ins/pending")
async def get_pending_check_in(org_id: str, current_user=Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    from bson import ObjectId
    org = db.organizations.find_one({"_id": ObjectId(org_id)})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    owner_id = current_user.id if current_user and hasattr(current_user, 'id') else org.get("owner_id")
    if not owner_id:
        return {"pending": False, "reason": "no_owner"}

    due = await check_org_due_for_check_in(db, org)
    if not due:
        return {"pending": False, "reason": "not_due"}

    check_in_data = await generate_check_in(db, org_id, owner_id)
    if not check_in_data.get("should_send"):
        return {"pending": False, "reason": check_in_data.get("reason", "no_active_goals")}

    return {"pending": True, "check_in": check_in_data}


@router.post("/{org_id}/check-ins/trigger")
async def trigger_check_in(org_id: str, current_user=Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    from bson import ObjectId
    org = db.organizations.find_one({"_id": ObjectId(org_id)})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    owner_id = current_user.id if current_user and hasattr(current_user, 'id') else org.get("owner_id")
    if not owner_id:
        raise HTTPException(status_code=400, detail="No owner found")

    check_in_data = await generate_check_in(db, org_id, owner_id)
    if not check_in_data.get("should_send"):
        return {"check_in": None, "message": "No active goals to review"}

    stored = await store_check_in(db, check_in_data)
    await send_check_in_notification(db, check_in_data)

    return {"check_in": stored, "message": f"{check_in_data['total_active']} goals to review"}


@router.post("/{org_id}/check-ins/{check_in_id}/respond")
async def respond_to_check_in(org_id: str, check_in_id: str, request: CheckInResponse, current_user=Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    from bson import ObjectId
    org = db.organizations.find_one({"_id": ObjectId(org_id)})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    owner_id = current_user.id if current_user and hasattr(current_user, 'id') else org.get("owner_id")
    if not owner_id:
        raise HTTPException(status_code=400, detail="No owner found")

    result = await record_check_in_response(db, check_in_id, org_id, owner_id, [n.model_dump() for n in request.notes])

    return result
