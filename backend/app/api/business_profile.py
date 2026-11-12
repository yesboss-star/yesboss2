"""What YesBoss understands about the business and its owner (owners only). See core/business_profile.py."""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from ..core import business_profile as bp
from ..core.database import get_database
from ..dependencies.auth import get_current_user
from ..dependencies.scope import is_org_owner, user_email, user_id
from ..dependencies.tenant import assert_org_access

logger = logging.getLogger("yesboss.business_profile.api")
router = APIRouter()


class RegenerateRequest(BaseModel):
    organization_id: str


def _db():
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    return db


async def _owner_only(db, org_id: str, current_user) -> None:
    """Checked here on the server: hiding the page is not protection."""
    await assert_org_access(db, org_id, current_user)
    if not await is_org_owner(db, org_id, current_user):
        raise HTTPException(status_code=403, detail="Only owners can see what YesBoss understands about the business")


@router.get("")
async def get_profile(organization_id: str = Query(...), current_user=Depends(get_current_user)):
    db = _db()
    await _owner_only(db, organization_id, current_user)
    return {"profile": bp.present(db[bp.COLLECTION].find_one({"org_id": organization_id}))}


@router.post("/regenerate")
async def regenerate(data: RegenerateRequest, current_user=Depends(get_current_user)):
    db = _db()
    await _owner_only(db, data.organization_id, current_user)
    existing = db[bp.COLLECTION].find_one({"org_id": data.organization_id})
    if bp.too_soon(existing):
        raise HTTPException(status_code=429, detail="It was just updated. Give it a few seconds.")
    profile = await bp.generate(db, data.organization_id, user_email(current_user), user_email(current_user) or user_id(current_user))
    return {"profile": profile}
