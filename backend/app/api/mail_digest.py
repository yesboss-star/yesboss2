"""A signed-in person's own, private inbox summary (Zoho Mail, read-only).

Every route works on the caller's own id only: there is no organization or user id to pass, so there
is nothing to point at someone else's mailbox. Owners get no extra access.
"""
from fastapi import APIRouter, Depends, HTTPException, Query

from ..core.database import get_database
from ..core.mail_digest import get_digest, mail_status, stop_reading
from ..dependencies.auth import get_current_user
from ..dependencies.scope import user_id

router = APIRouter()


def _who(current_user) -> tuple:
    db = get_database()
    uid = user_id(current_user)
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    if not uid:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return db, uid


@router.get("/status")
async def status(current_user=Depends(get_current_user)):
    db, uid = _who(current_user)
    return await mail_status(db, uid)


@router.get("/digest")
async def digest(
    hours: int = Query(24, ge=1, le=72),
    refresh: bool = Query(False),
    current_user=Depends(get_current_user),
):
    db, uid = _who(current_user)
    return await get_digest(db, uid, hours=hours, refresh=refresh)


@router.post("/stop")
async def stop(current_user=Depends(get_current_user)):
    """Stop reading this person's mail and erase the stored summary."""
    db, uid = _who(current_user)
    await stop_reading(db, uid)
    return {"stopped": True}
