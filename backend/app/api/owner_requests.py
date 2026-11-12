import logging
import uuid
from datetime import datetime
from html import escape as html_escape

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from ..core.config import settings
from ..core.database import get_database
from ..core.email_service import (
    _render_owner_approval,
    _render_owner_request_approved,
    _render_owner_request_rejected,
    send_email,
)
from ..dependencies.auth import get_current_user
from ..dependencies.scope import is_org_owner

logger = logging.getLogger("yesboss.owner_requests")
router = APIRouter()

APP_NAME = "YESBOSS"
BASE_URL = getattr(settings, "FRONTEND_URL", "http://localhost:3000")
API_BASE = getattr(settings, "API_URL", "http://localhost:8000/api/v1")


class RequestOwnerBody(BaseModel):
    uid: str
    email: str
    full_name: str


_request_approved_page = """<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Request Approved - {app_name}</title>
<style>
  body {{ font-family:-apple-system,sans-serif;background:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0 }}
  .card {{ max-width:480px;background:white;border-radius:12px;padding:40px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.08) }}
  .check {{ width:64px;height:64px;border-radius:50%;background:#22c55e15;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:32px;color:#22c55e }}
  h1 {{ font-size:22px;color:#1e293b;margin:0 0 8px }}
  p {{ color:#64748b;font-size:15px;line-height:1.5;margin:0 }}
  .fallback {{ margin-top:16px;padding:12px;background:#fff3cd;border-radius:8px;font-size:13px;color:#856404;text-align:left }}
  .fallback a {{ color:#226DB4 }}
</style></head>
<body>
  <div class="card">
    <div class="check">&#10003;</div>
    <h1>Request Approved</h1>
    <p>The user has been added as a co-owner. They will be notified via email.</p>
    {{fallback_html}}
  </div>
</body>
</html>"""

_request_rejected_page = """<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Request Declined - {app_name}</title>
<style>
  body {{ font-family:-apple-system,sans-serif;background:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0 }}
  .card {{ max-width:480px;background:white;border-radius:12px;padding:40px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.08) }}
  .x {{ width:64px;height:64px;border-radius:50%;background:#ef444415;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:32px;color:#ef4444 }}
  h1 {{ font-size:22px;color:#1e293b;margin:0 0 8px }}
  p {{ color:#64748b;font-size:15px;line-height:1.5;margin:0 }}
  .fallback {{ margin-top:16px;padding:12px;background:#fff3cd;border-radius:8px;font-size:13px;color:#856404;text-align:left }}
  .fallback a {{ color:#226DB4 }}
</style></head>
<body>
  <div class="card">
    <div class="x">&#10007;</div>
    <h1>Request Declined</h1>
    <p>The request has been declined. The user will be notified via email.</p>
    {{fallback_html}}
  </div>
</body>
</html>"""


@router.post("/organizations/{org_id}/request-owner")
async def request_owner(org_id: str, body: RequestOwnerBody, current_user=Depends(get_current_user)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    # Who is asking comes from the verified token, never from the body: otherwise anyone could
    # put a CEO's name and email in front of the owner (phishing) or request on someone's behalf.
    caller_uid = getattr(current_user, "id", None) or getattr(current_user, "uid", None)
    caller_email = (getattr(current_user, "email", "") or "").strip().lower()
    if not caller_uid:
        raise HTTPException(status_code=401, detail="Not authenticated")
    body.uid = caller_uid
    body.email = caller_email or body.email
    body.full_name = (body.full_name or "").strip()[:100] or caller_email

    from bson import ObjectId
    org = db.organizations.find_one({"_id": ObjectId(org_id)})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    existing = db.owner_requests.find_one({
        "org_id": org_id,
        "requester_uid": body.uid,
        "status": "pending",
    })

    token = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()

    if existing:
        db.owner_requests.update_one(
            {"_id": existing["_id"]},
            {"$set": {"token": token, "requester_email": body.email, "requester_name": body.full_name, "updated_at": now}}
        )
        request_doc = existing
        request_doc["token"] = token
        request_doc["_id"] = str(request_doc["_id"])
        is_resend = True
    else:
        request_doc = {
            "org_id": org_id,
            "requester_uid": body.uid,
            "requester_email": body.email,
            "requester_name": body.full_name,
            "status": "pending",
            "token": token,
            "created_at": now,
            "updated_at": now,
        }
        result = db.owner_requests.insert_one(request_doc)
        request_doc["_id"] = str(result.inserted_id)
        is_resend = False

    approve_link = f"{API_BASE}/owner-requests/{token}/approve"
    reject_link = f"{API_BASE}/owner-requests/{token}/reject"

    primary_owner_uid = org.get("owner_id")
    primary_owner_email = None
    if primary_owner_uid:
        user_doc = db.users.find_one({"uid": primary_owner_uid}, {"email": 1})
        if user_doc:
            primary_owner_email = user_doc.get("email")

    if not primary_owner_email:
        logger.warning("No primary owner email found for uid=%s in org %s", primary_owner_uid, org_id)
        logger.info("Test links:\nApprove: %s\nReject: %s", approve_link, reject_link)
    else:
        html = _render_owner_approval(
            requester_name=body.full_name,
            requester_email=body.email,
            org_name=org.get("name", "the organization"),
            approve_link=approve_link,
            reject_link=reject_link,
        )
        sent = send_email(
            to_email=primary_owner_email,
            subject=f"{APP_NAME} - Co-Owner Request from {body.full_name}",
            html_body=html,
            text_body=f"{body.full_name} ({body.email}) wants to join as co-owner.\nApprove: {approve_link}\nReject: {reject_link}",
        )
        if not sent:
            logger.info("SMTP failed — test links:\nApprove: %s\nReject: %s", approve_link, reject_link)

    response = {
        "request_id": request_doc["_id"],
        "status": "pending",
        "message": "Request sent to primary owner for approval",
        "resend": is_resend,
    }
    # The approve/reject links are bearer secrets for the primary owner. Never hand them
    # back to the requester in production (they could approve themselves).
    if settings.ENVIRONMENT != "production":
        response["approve_link"] = approve_link
        response["reject_link"] = reject_link
    return response


REQUEST_TTL_DAYS = 7

_confirm_page = """<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>{title} - {app_name}</title>
<style>
  body {{ font-family:-apple-system,sans-serif;background:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0 }}
  .card {{ max-width:480px;background:white;border-radius:12px;padding:40px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.08) }}
  h1 {{ font-size:22px;color:#1e293b;margin:0 0 8px }}
  p {{ color:#64748b;font-size:15px;line-height:1.5;margin:0 0 20px }}
  button {{ padding:12px 32px;border:0;border-radius:8px;color:white;font-size:15px;font-weight:600;cursor:pointer;background:{color} }}
</style></head>
<body>
  <div class="card">
    <h1>{title}</h1>
    <p><strong>{name}</strong> ({email}) wants to be a co-owner of <strong>{org}</strong>.</p>
    <form method="post"><button type="submit">{button}</button></form>
  </div>
</body>
</html>"""


def _expired(request_doc: dict) -> bool:
    created = request_doc.get("created_at")
    try:
        created_dt = created if isinstance(created, datetime) else datetime.fromisoformat(str(created))
    except (TypeError, ValueError):
        return False
    return (datetime.utcnow() - created_dt).days >= REQUEST_TTL_DAYS


def _load_pending_request(db, token: str):
    """Return (request_doc, None) or (None, error HTMLResponse)."""
    request_doc = db.owner_requests.find_one({"token": token})
    if not request_doc:
        return None, HTMLResponse(content="<h1>Invalid or expired link</h1>", status_code=404)
    if request_doc["status"] != "pending":
        msg = "already approved" if request_doc["status"] == "approved" else "already rejected"
        return None, HTMLResponse(content=f"<h1>Request {msg}</h1>", status_code=400)
    if _expired(request_doc):
        return None, HTMLResponse(content="<h1>This request has expired. Ask the person to send a new one.</h1>", status_code=410)
    return request_doc, None


def _confirmation_page(token: str, action: str) -> HTMLResponse:
    """A GET only shows what will happen. Mail scanners and link previews open every link in an
    email, so approving/rejecting must need a deliberate click (a POST)."""
    db = get_database()
    if db is None:
        return HTMLResponse(content="<h1>Server error</h1>", status_code=500)
    request_doc, error = _load_pending_request(db, token)
    if error:
        return error
    org = _get_org_by_id(db, request_doc["org_id"])
    approve = action == "approve"
    return HTMLResponse(content=_confirm_page.format(
        app_name=APP_NAME,
        title="Approve co-owner request" if approve else "Decline co-owner request",
        color="#22c55e" if approve else "#ef4444",
        button="Approve" if approve else "Decline",
        name=html_escape(request_doc.get("requester_name", "")),
        email=html_escape(request_doc.get("requester_email", "")),
        org=html_escape((org or {}).get("name", "the organization")),
    ))


@router.get("/owner-requests/{token}/approve", response_class=HTMLResponse)
async def approve_owner_request_page(token: str):
    return _confirmation_page(token, "approve")


@router.get("/owner-requests/{token}/reject", response_class=HTMLResponse)
async def reject_owner_request_page(token: str):
    return _confirmation_page(token, "reject")


@router.post("/owner-requests/{token}/approve", response_class=HTMLResponse)
async def approve_owner_request(token: str):
    db = get_database()
    if db is None:
        return HTMLResponse(content="<h1>Server error</h1>", status_code=500)

    request_doc, error = _load_pending_request(db, token)
    if error:
        return error

    from bson import ObjectId
    org = db.organizations.find_one({"_id": ObjectId(request_doc["org_id"])})
    if not org:
        return HTMLResponse(content="<h1>Organization not found</h1>", status_code=404)

    uid = request_doc["requester_uid"]
    existing_co_owners = org.get("co_owners", []) or []
    if uid not in existing_co_owners and uid != org.get("owner_id"):
        existing_co_owners.append(uid)
        db.organizations.update_one(
            {"_id": ObjectId(request_doc["org_id"])},
            {"$set": {"co_owners": existing_co_owners, "updated_at": datetime.utcnow()}}
        )

    db.owner_requests.update_one(
        {"_id": request_doc["_id"]},
        {"$set": {"status": "approved", "updated_at": datetime.utcnow().isoformat()}}
    )

    requester_email = request_doc["requester_email"]
    requester_name = request_doc["requester_name"]
    org_name = org.get("name", "the organization")
    html = _render_owner_request_approved(org_name=org_name, requester_name=requester_name)
    sent = send_email(
        to_email=requester_email,
        subject=f"{APP_NAME} - Co-Owner Request Approved",
        html_body=html,
        text_body=f"Hi {requester_name}, your request to join {org_name} as a co-owner has been approved.",
    )
    if sent:
        logger.info("Approval email sent to %s", requester_email)
        fallback_html = ""
    else:
        logger.error("Approval email FAILED to %s", requester_email)
        fallback_html = f'<div class="fallback">Email delivery failed. Ask the user to log in and check their dashboard, or use this link: <a href="{BASE_URL}/dashboard">Go to Dashboard</a></div>'

    return HTMLResponse(
        content=_request_approved_page.format(app_name=APP_NAME, fallback_html=fallback_html),
        status_code=200,
    )


@router.post("/owner-requests/{token}/reject", response_class=HTMLResponse)
async def reject_owner_request(token: str):
    db = get_database()
    if db is None:
        return HTMLResponse(content="<h1>Server error</h1>", status_code=500)

    request_doc, error = _load_pending_request(db, token)
    if error:
        return error

    db.owner_requests.update_one(
        {"_id": request_doc["_id"]},
        {"$set": {"status": "rejected", "updated_at": datetime.utcnow().isoformat()}}
    )

    requester_email = request_doc["requester_email"]
    requester_name = request_doc["requester_name"]
    org = _get_org_by_id(db, request_doc["org_id"])
    org_name = org.get("name", "the organization") if org else "the organization"
    html = _render_owner_request_rejected(org_name=org_name, requester_name=requester_name)
    sent = send_email(
        to_email=requester_email,
        subject=f"{APP_NAME} - Co-Owner Request Declined",
        html_body=html,
        text_body=f"Hi {requester_name}, your request to join {org_name} as a co-owner has been declined.",
    )
    if sent:
        logger.info("Rejection email sent to %s", requester_email)
        fallback_html = ""
    else:
        logger.error("Rejection email FAILED to %s", requester_email)
        fallback_html = '<div class="fallback">Email delivery failed. The user has been notified in-app instead.</div>'

    return HTMLResponse(
        content=_request_rejected_page.format(app_name=APP_NAME, fallback_html=fallback_html),
        status_code=200,
    )


@router.get("/owner-requests/{request_id}/status")
async def get_request_status(request_id: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    from bson import ObjectId
    if not ObjectId.is_valid(request_id):
        raise HTTPException(status_code=404, detail="Request not found")
    request_doc = db.owner_requests.find_one({"_id": ObjectId(request_id)})
    if not request_doc:
        raise HTTPException(status_code=404, detail="Request not found")

    return {
        "request_id": str(request_doc["_id"]),
        "status": request_doc["status"],
        "requester_uid": request_doc["requester_uid"],
    }


@router.get("/organizations/{org_id}/owner-requests")
async def list_org_owner_requests(org_id: str, current_user=Depends(get_current_user)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    if not await is_org_owner(db, org_id, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    requests_list = list(db.owner_requests.find({"org_id": org_id}, {"token": 0}).sort("created_at", -1))
    for r in requests_list:
        r["_id"] = str(r["_id"])

    return {"owner_requests": requests_list}


def _get_org_by_id(db, org_id: str):
    from bson import ObjectId
    try:
        return db.organizations.find_one({"_id": ObjectId(org_id)})
    except Exception:
        return None
