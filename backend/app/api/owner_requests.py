import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException
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
async def request_owner(org_id: str, body: RequestOwnerBody):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

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

    return {
        "request_id": request_doc["_id"],
        "status": "pending",
        "message": "Request sent to primary owner for approval",
        "approve_link": approve_link,
        "reject_link": reject_link,
        "resend": is_resend,
    }


@router.get("/owner-requests/{token}/approve", response_class=HTMLResponse)
async def approve_owner_request(token: str):
    db = get_database()
    if db is None:
        return HTMLResponse(content="<h1>Server error</h1>", status_code=500)

    request_doc = db.owner_requests.find_one({"token": token})
    if not request_doc:
        return HTMLResponse(content="<h1>Invalid or expired link</h1>", status_code=404)

    if request_doc["status"] != "pending":
        msg = "already approved" if request_doc["status"] == "approved" else "already rejected"
        return HTMLResponse(content=f"<h1>Request {msg}</h1>", status_code=400)

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


@router.get("/owner-requests/{token}/reject", response_class=HTMLResponse)
async def reject_owner_request(token: str):
    db = get_database()
    if db is None:
        return HTMLResponse(content="<h1>Server error</h1>", status_code=500)

    request_doc = db.owner_requests.find_one({"token": token})
    if not request_doc:
        return HTMLResponse(content="<h1>Invalid or expired link</h1>", status_code=404)

    if request_doc["status"] != "pending":
        msg = "already approved" if request_doc["status"] == "approved" else "already rejected"
        return HTMLResponse(content=f"<h1>Request {msg}</h1>", status_code=400)

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
    request_doc = db.owner_requests.find_one({"_id": ObjectId(request_id)})
    if not request_doc:
        raise HTTPException(status_code=404, detail="Request not found")

    return {
        "request_id": str(request_doc["_id"]),
        "status": request_doc["status"],
        "requester_uid": request_doc["requester_uid"],
    }


@router.get("/organizations/{org_id}/owner-requests")
async def list_org_owner_requests(org_id: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    requests_list = list(db.owner_requests.find({"org_id": org_id}).sort("created_at", -1))
    for r in requests_list:
        r["_id"] = str(r["_id"])

    return {"owner_requests": requests_list}


def _get_org_by_id(db, org_id: str):
    from bson import ObjectId
    try:
        return db.organizations.find_one({"_id": ObjectId(org_id)})
    except Exception:
        return None
