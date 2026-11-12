"""Weekly review endpoints (Phase 3). See UNIFIED_CAPTURE_SPEC.md section 7.

``router`` needs a signed-in member of the organization. ``public_router`` is the one-click
"stop these emails" page: it works without signing in, because the person clicking is in their mail
app, so it is guarded by a signed, expiring token instead - and it asks for a confirming click
(POST) so a mail scanner that opens links cannot unsubscribe anyone.
"""
import html
import logging
from datetime import datetime
from typing import Any, Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, Form, HTTPException, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from ..core.capture_access import can_read, is_author
from ..core.database import get_database
from ..core.weekly_review import build_review, email_review_to, verify_unsubscribe
from ..dependencies.auth import get_current_user
from ..dependencies.scope import is_org_owner, user_email, user_id
from ..dependencies.tenant import assert_org_access

logger = logging.getLogger("yesboss.weekly_review.api")
router = APIRouter()
public_router = APIRouter()


class Preferences(BaseModel):
    weekly_review_email: bool


def _db():
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    return db


def _pref(db, uid: str) -> bool:
    row = db.users.find_one({"uid": uid}, {"weekly_review_email": 1}) or {}
    return row.get("weekly_review_email", True) is not False


# ---------------------------------------------------------------- the review
@router.get("")
async def get_review(
    organization_id: str = Query(...),
    scope: Literal["personal", "company"] = Query("personal"),
    current_user=Depends(get_current_user),
):
    db = _db()
    await assert_org_access(db, organization_id, current_user)
    owner = await is_org_owner(db, organization_id, current_user)
    if scope == "company" and not owner:
        raise HTTPException(status_code=403, detail="Only owners can see the company review")
    review = await build_review(db, organization_id, current_user, scope)
    return {"review": review, "can_see_company": owner, "email_enabled": _pref(db, user_id(current_user))}


# ---------------------------------------------------------------- acting on a commitment
async def _load_commitment(db, commitment_id: str, user) -> tuple[dict[str, Any], dict[str, Any]]:
    """The commitment and its capture, or 404 when either is missing or the caller may not see it."""
    if not ObjectId.is_valid(commitment_id):
        raise HTTPException(status_code=404, detail="Commitment not found")
    commitment = db.commitments.find_one({"_id": ObjectId(commitment_id)})
    capture = db.captures.find_one({"_id": commitment["capture_id"]}) if commitment else None
    if not commitment or not capture or not await can_read(db, capture, user):
        raise HTTPException(status_code=404, detail="Commitment not found")
    await assert_org_access(db, capture.get("org_id"), user)
    return commitment, capture


async def _may_act(db, commitment: dict[str, Any], capture: dict[str, Any], user) -> bool:
    if is_author(capture, user) or (user_email(user) and commitment.get("owner_email") == user_email(user)):
        return True
    return capture.get("visibility") != "private" and await is_org_owner(db, capture["org_id"], user)


@router.post("/commitments/{commitment_id}/done")
async def mark_done(commitment_id: str, current_user=Depends(get_current_user)):
    """The person who owns it (or wrote it down) says it is done. Recorded as manual evidence."""
    db = _db()
    commitment, capture = await _load_commitment(db, commitment_id, current_user)
    if not await _may_act(db, commitment, capture, current_user):
        raise HTTPException(status_code=403, detail="Only the owner or the author can do this")
    db.commitments.update_one({"_id": commitment["_id"]}, {"$set": {"manual_done_at": datetime.utcnow()}})
    return {"success": True}


@router.post("/commitments/{commitment_id}/drop")
async def drop(commitment_id: str, current_user=Depends(get_current_user)):
    """It is no longer a commitment (decided against, or noted by mistake)."""
    db = _db()
    commitment, capture = await _load_commitment(db, commitment_id, current_user)
    if not await _may_act(db, commitment, capture, current_user):
        raise HTTPException(status_code=403, detail="Only the owner or the author can do this")
    db.commitments.update_one({"_id": commitment["_id"]}, {"$set": {"dropped": True}})
    return {"success": True}


# ---------------------------------------------------------------- the email
@router.get("/preferences")
async def get_preferences(current_user=Depends(get_current_user)):
    return {"weekly_review_email": _pref(_db(), user_id(current_user))}


@router.put("/preferences")
async def set_preferences(data: Preferences, current_user=Depends(get_current_user)):
    db = _db()
    db.users.update_one({"uid": user_id(current_user)}, {"$set": {"weekly_review_email": data.weekly_review_email}})
    return {"weekly_review_email": data.weekly_review_email}


@router.post("/email-me")
async def email_me(
    organization_id: str = Query(...),
    scope: Literal["personal", "company"] = Query("personal"),
    current_user=Depends(get_current_user),
):
    """Send yourself the review now (never anyone else's)."""
    db = _db()
    await assert_org_access(db, organization_id, current_user)
    if scope == "company" and not await is_org_owner(db, organization_id, current_user):
        raise HTTPException(status_code=403, detail="Only owners can email the company review")
    return await email_review_to(db, organization_id, current_user, scope)


# ---------------------------------------------------------------- unsubscribe (no sign-in)
def _page(title: str, body: str) -> HTMLResponse:
    return HTMLResponse(
        f'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        f'<title>{html.escape(title)}</title><body style="font-family:-apple-system,sans-serif;max-width:480px;'
        f'margin:15vh auto;padding:0 24px;color:#1e293b"><h2>{html.escape(title)}</h2>{body}</body>')


@public_router.get("/unsubscribe")
async def unsubscribe_page(token: str = Query("")):
    if not verify_unsubscribe(token):
        return _page("This link has expired", "<p>Sign in and switch the weekly email off on the Weekly review page.</p>")
    return _page(
        "Stop the weekly review email?",
        f'<p>You can still read the review in the app.</p><form method="post" action="">'
        f'<input type="hidden" name="token" value="{html.escape(token)}">'
        f'<button style="padding:10px 20px;background:#6366f1;color:white;border:0;border-radius:8px;font-size:15px">'
        f"Stop the emails</button></form>")


@public_router.post("/unsubscribe")
async def unsubscribe(token: str = Form("")):
    uid = verify_unsubscribe(token)
    if not uid:
        return _page("This link has expired", "<p>Sign in and switch the weekly email off on the Weekly review page.</p>")
    _db().users.update_one({"uid": uid}, {"$set": {"weekly_review_email": False}})
    return _page("You are unsubscribed", "<p>You will not get the weekly review email any more. "
                                         "You can switch it back on from the Weekly review page.</p>")
