"""Forward-by-email intake for Capture (Phase 4). See ``core/capture_intake`` for the design.

``public_router`` is the webhook the mail provider calls. It has no user sign-in, so it is guarded by
a shared secret (``CAPTURE_INBOUND_SECRET``; empty means the endpoint is off) and routes each
message by the private token inside the recipient address, never by the (forgeable) From header.
``router`` lets a signed-in person see and replace their own address.
"""
import hmac
import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from starlette.datastructures import UploadFile  # the form parser returns Starlette's class, not FastAPI's subclass

from ..core.capture_intake import (
    MAX_ATTACHMENT_BYTES,
    MAX_ATTACHMENTS,
    decode_json_attachments,
    get_or_create_token,
    inbox_address,
    inbox_enabled,
    ingest_email,
    regenerate_token,
    strip_html,
    token_from_recipients,
    user_for_token,
)
from ..core.config import settings
from ..core.database import get_database
from ..dependencies.auth import get_current_user
from ..dependencies.scope import user_id

logger = logging.getLogger("yesboss.captures.inbox")
router = APIRouter()
public_router = APIRouter()

MAX_REQUEST_BYTES = 40 * 1024 * 1024
_RECIPIENT_KEYS = ("to", "recipient", "envelope", "delivered-to", "x-original-to", "cc")
_BODY_KEYS = ("text", "body-plain", "stripped-text", "plain", "TextBody", "body")
_HTML_KEYS = ("html", "body-html", "HtmlBody")
_ID_KEYS = ("message-id", "message_id", "messageId")


def _db():
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    return db


def _field(fields: dict[str, Any], *keys: str) -> str:
    lowered = {str(k).lower(): v for k, v in fields.items()}
    for key in keys:
        value = lowered.get(key.lower())
        if isinstance(value, (str, int)) and str(value).strip():
            return str(value)
        if isinstance(value, (dict, list)) and value:
            return json.dumps(value)
    return ""


# ---------------------------------------------------------------- the webhook (no sign-in)
@public_router.post("/email")
async def inbound_email(request: Request, secret: str = Query(""), x_capture_secret: str | None = Header(default=None)):
    expected = settings.CAPTURE_INBOUND_SECRET
    if not expected:
        raise HTTPException(status_code=404, detail="Not found")
    if not hmac.compare_digest((x_capture_secret or secret).encode(), expected.encode()):
        raise HTTPException(status_code=403, detail="Forbidden")
    if int(request.headers.get("content-length") or 0) > MAX_REQUEST_BYTES:
        raise HTTPException(status_code=413, detail="Message too large")

    fields: dict[str, Any] = {}
    attachments: list[tuple[str, bytes]] = []
    content_type = (request.headers.get("content-type") or "").lower()
    try:
        if "application/json" in content_type:
            payload = await request.json()
            fields = payload if isinstance(payload, dict) else {}
            attachments = decode_json_attachments(fields.get("attachments"))
        else:  # the form posts Mailgun / SendGrid / Postmark make
            form = await request.form()
            for key, value in form.multi_items():
                if isinstance(value, UploadFile):
                    if len(attachments) < MAX_ATTACHMENTS + 1:
                        attachments.append((value.filename or "attachment", await value.read(MAX_ATTACHMENT_BYTES + 1)))
                else:
                    fields[key] = value
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read the message")

    db = _db()
    token = token_from_recipients(*(_field(fields, k) for k in _RECIPIENT_KEYS))
    user_doc = user_for_token(db, token) if token else None
    if not user_doc:
        return {"ok": True, "captured": 0}  # 200 so the provider does not keep retrying a dead address

    body = _field(fields, *_BODY_KEYS) or strip_html(_field(fields, *_HTML_KEYS))
    result = await ingest_email(db, user_doc, subject=_field(fields, "subject"), body=body, attachments=attachments,
                                message_id=_field(fields, *_ID_KEYS) or None)
    logger.info("Capture inbox: %s captured, %s skipped", result["captured"], len(result["skipped"]))
    return {"ok": True, **result}


# ---------------------------------------------------------------- each person's own address
def _address_payload(db, uid: str, token: str | None) -> dict[str, Any]:
    return {"enabled": inbox_enabled() and bool(token), "address": inbox_address(token) if token and inbox_enabled() else None,
            "needs_domain": inbox_enabled() and not (settings.CAPTURE_INBOUND_DOMAIN or "").strip()}


@router.get("/address")
async def my_address(current_user=Depends(get_current_user)):
    db = _db()
    uid = user_id(current_user)
    return _address_payload(db, uid, get_or_create_token(db, uid) if inbox_enabled() else None)


@router.post("/address/regenerate")
async def new_address(current_user=Depends(get_current_user)):
    """Replace your address, for example if it was shared by mistake. The old one stops working."""
    db = _db()
    if not inbox_enabled():
        raise HTTPException(status_code=404, detail="Forward-by-email is not set up on this server")
    uid = user_id(current_user)
    return _address_payload(db, uid, regenerate_token(db, uid))
