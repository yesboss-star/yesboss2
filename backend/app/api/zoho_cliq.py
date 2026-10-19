"""Zoho Cliq router — Communication Agent (additive).

Phase 0: webhook skeleton (verify + ack) and bot capabilities.
Phase 1: verified inbound messages are normalized, resolved to an identity and
routed to the Task Interaction Agent in the background (so the webhook still
acks in <2s, as Cliq requires). All processing is wrapped so a Cliq outage or
unresolved sender can never break the endpoint.
"""

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel

from ..core.config import settings
from ..core.zoho.cliq import verify_webhook_signature
from ..dependencies.auth import get_current_user

logger = logging.getLogger("yesboss.api.zoho_cliq")

router = APIRouter()


async def _process_inbound(body: dict[str, Any]) -> None:
    """Normalize → resolve identity → route. Never raises."""
    try:
        from ..agents.communication_agent import (
            extract_sender_email,
            normalize_input,
            resolve_identity,
            route,
        )
        from ..core import database as db_module

        # Use the already-connected handle (set at app startup). Never trigger a
        # lazy connect from a webhook background task — ack speed is paramount.
        db = db_module.db
        if db is None:
            logger.debug("cliq inbound: db not connected — skipping processing")
            return
        sender = extract_sender_email(body)
        identity = resolve_identity(db, sender)
        if not identity.get("email"):
            logger.warning("cliq inbound: unresolved sender — ack only")
            return
        normalized = normalize_input(body)
        result = await route(
            db,
            normalized,
            identity,
            context={"task_id": normalized.get("button_task_id") or ""},
        )
        logger.info(
            "cliq inbound routed sender=%s kind=%s routed=%s",
            sender,
            result.get("kind"),
            result.get("routed"),
        )
    except Exception as e:
        logger.warning("cliq inbound processing failed: %s", e)


@router.post("/webhook")
async def cliq_webhook(
    request: Request,
    x_cliq_signature: str | None = Header(default=None, alias="X-Cliq-Signature"),
):
    raw = await request.body()
    if not verify_webhook_signature(raw, x_cliq_signature or ""):
        logger.warning("cliq webhook: invalid signature — acking without processing")
        return {"ok": True, "verified": False}
    try:
        body = await request.json()
    except Exception:
        body = {}
    if not isinstance(body, dict):
        body = {}

    sender = ""
    task_id = ""
    try:
        sender_obj = body.get("sender", {})
        if isinstance(sender_obj, dict):
            sender = str(sender_obj.get("email", ""))
        btn = body.get("button", {})
        if isinstance(btn, dict):
            payload = btn.get("payload", {})
            if isinstance(payload, dict):
                task_id = str(payload.get("task_id", ""))
    except Exception:
        pass
    logger.info("cliq webhook: verified sender=%s task_id=%s", sender, task_id)

    # Route off the request path (separate worker thread) so a slow downstream
    # (DB connect, LLM, Cliq API) can never delay the ack past Cliq's 2s limit.
    _dispatch(_process_inbound(body))
    return {"ok": True, "verified": True}


def _dispatch(coro) -> None:
    """Fire-and-forget a coroutine on a worker thread so the loop stays free."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        asyncio.run(coro)
        return
    loop.run_in_executor(None, asyncio.run, coro)


@router.get("/bot/capabilities")
async def bot_capabilities():
    return {
        "bot": "YesBoss",
        "dc": "zoho.com",
        "enabled": bool(getattr(settings, "ZOHO_CLIQ_ENABLED", True)),
        "configured": bool(getattr(settings, "ZOHO_CLIQ_BOT_ID", "")),
        "inputs": ["text", "button", "voice-note"],
        "followups": "cliq-only",
    }


class _TestDMRequest(BaseModel):
    email: str


@router.post("/bot/test-dm")
async def bot_test_dm(payload: _TestDMRequest, current_user=Depends(get_current_user)):
    """Diagnostic: send a one-off DM and report token presence + delivery result."""
    from ..core import database as db_module
    from ..core.zoho.cliq import ZohoCliq

    db = db_module.db
    cliq = ZohoCliq(db)
    token = await cliq._resolve_token("") if db is not None else None
    if not token:
        return {"ok": False, "has_token": False, "chat_id": "", "error": "no_oauth_token"}
    result = await cliq.send_dm(payload.email, "YesBoss test DM — Cliq delivery check.", org_id="")
    return {
        "ok": bool(result),
        "has_token": True,
        "chat_id": (result or {}).get("chat_id", ""),
        "error": "" if result else "send_failed",
    }
