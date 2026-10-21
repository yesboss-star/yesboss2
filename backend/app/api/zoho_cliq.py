"""Zoho Cliq router — Communication Agent (additive).

Phase 0: webhook skeleton (verify + ack) and bot capabilities.
Phase 1: verified inbound messages are normalized, resolved to an identity and
routed to the Task Interaction Agent in the background (so the webhook still
acks in <2s, as Cliq requires). All processing is wrapped so a Cliq outage or
unresolved sender can never break the endpoint.
"""

import asyncio
import logging
from datetime import datetime
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel

from ..core.config import settings
from ..core.zoho.cliq import verify_webhook_signature
from ..dependencies.auth import get_current_user

logger = logging.getLogger("yesboss.api.zoho_cliq")

router = APIRouter()


def _first_voice_file(body: dict[str, Any]) -> tuple[str, str]:
    """Return (url, filename) for the first Cliq attachment, if any."""
    for key in ("files", "attachments"):
        items = body.get(key)
        if not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            url = item.get("download_url") or item.get("url") or item.get("file_url")
            if url:
                name = item.get("name") or item.get("file_name") or "voice-note.webm"
                return str(url), str(name)
    return "", ""


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
        if normalized.get("modality") == "voice" and not normalized.get("text"):
            url, name = _first_voice_file(body)
            if url:
                from ..core.stt import transcribe_bytes
                from ..core.zoho.cliq import ZohoCliq

                blob = await ZohoCliq(db).download_file(url, identity.get("org_id", ""))
                if blob:
                    try:
                        normalized["text"] = await transcribe_bytes(blob[0], blob[1] or name)
                        normalized["confidence"] = 0.8
                    except Exception as e:
                        logger.info("cliq voice-note transcription skipped: %s", e)
        if not normalized.get("text"):
            logger.info("cliq inbound: no text (modality=%s) — ack only", normalized.get("modality"))
            return
        result = await route(
            db,
            normalized,
            identity,
            context={"task_id": normalized.get("button_task_id") or ""},
            use_llm=True,
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


# ── thread admin endpoints (role-gated, privacy-enforcing) ──────────────────


def _requester_email(user: Any) -> str:
    return (getattr(user, "email", "") or "").strip().lower()


async def _role_for(db: Any, user: Any) -> str:
    try:
        from .auth import _resolve_user_role

        return await _resolve_user_role(db, user)
    except Exception:
        claims = getattr(user, "custom_claims", {}) or {}
        return str(claims.get("role") or "employee")


async def _is_manager_of(db: Any, manager_email: str, assignee_email: str) -> bool:
    if not manager_email or not assignee_email:
        return False
    try:
        from ..core.scheduler import find_manager_email

        manager = await find_manager_email(db, assignee_email)
        return bool(manager) and manager.lower() == manager_email
    except Exception:
        return False


def _owned_org_ids(db: Any, user: Any) -> list[str]:
    """Orgs the requester owns/co-owns (used to scope owner thread queries)."""
    uid = getattr(user, "uid", None) or getattr(user, "id", None)
    email = _requester_email(user)
    clauses = []
    for key in ("owner_id", "co_owners"):
        if uid:
            clauses.append({key: uid})
        if email:
            clauses.append({key: email})
    if not clauses:
        return []
    try:
        docs = list(db.organizations.find({"$or": clauses}, {"_id": 1}))
        return [str(doc.get("_id")) for doc in docs if doc.get("_id") is not None]
    except Exception:
        return []


async def _authorize_thread_admin(db: Any, thread: dict[str, Any], user: Any) -> None:
    role = await _role_for(db, user)
    if role == "owner":
        return
    email = _requester_email(user)
    if await _is_manager_of(db, email, str(thread.get("assignee_email") or "")):
        return
    raise HTTPException(status_code=403, detail="Owner or manager access required")


def _thread_out(doc: dict[str, Any], risk_view: bool) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, value in doc.items():
        if key == "_id":
            out["_id"] = str(value)
        elif isinstance(value, datetime):
            out[key] = value.isoformat()
        elif isinstance(value, ObjectId):
            out[key] = str(value)
        else:
            out[key] = value
    if risk_view:
        out.pop("messages", None)
        out.pop("cliq_chat_id", None)
        out.pop("cliq_message_ids", None)
        out["reply_count"] = len(doc.get("messages") or [])
    return out


@router.get("/threads")
async def list_threads(
    task_id: str = "",
    assignee: str = "",
    org_id: str = "",
    current_user=Depends(get_current_user),
):
    """List follow-up threads. Assignee → full; owner/manager → risk view."""
    from ..core import database as db_module

    db = db_module.db
    if db is None:
        raise HTTPException(status_code=503, detail="Database not configured")

    email = _requester_email(current_user)
    role = await _role_for(db, current_user)
    query: dict[str, Any] = {}
    if task_id:
        query["task_id"] = str(task_id)
    if org_id:
        query["org_id"] = str(org_id)

    risk_view = False
    if role == "owner":
        risk_view = True
        if assignee:
            query["assignee_email"] = assignee.strip().lower()
        if not org_id:
            owned = _owned_org_ids(db, current_user)
            if owned:
                query["org_id"] = {"$in": owned}
            else:
                query["assignee_email"] = email
    else:
        target = assignee.strip().lower()
        if target and target != email:
            if not await _is_manager_of(db, email, target):
                raise HTTPException(status_code=403, detail="Not allowed to view this thread")
            query["assignee_email"] = target
            risk_view = True
        else:
            query["assignee_email"] = email

    docs = list(db.task_followups.find(query).limit(100))
    return {"threads": [_thread_out(doc, risk_view) for doc in docs]}


@router.post("/threads/{thread_id}/nudge")
async def nudge_thread(thread_id: str, current_user=Depends(get_current_user)):
    """Force a Cliq nudge now (owner/manager only)."""
    from ..agents.task_interaction_agent import (
        _load_task,
        _load_thread_by_id,
        _persist_thread,
        compute_next_followup,
        escalate_risk_summary,
        evaluate_criticality,
    )
    from ..core import database as db_module
    from ..core.zoho.cliq import ZohoCliq

    db = db_module.db
    if db is None:
        raise HTTPException(status_code=503, detail="Database not configured")
    thread = _load_thread_by_id(db, thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    await _authorize_thread_admin(db, thread, current_user)

    now = datetime.utcnow()
    task = _load_task(db, thread.get("task_id", ""))
    title = (task or {}).get("title") or "your task"
    text = f"Reminder — {title}. Reply *started*, *blocked*, or *extension*."
    result = await ZohoCliq(db).send_dm(
        thread.get("assignee_email", ""), text, org_id=thread.get("org_id", "")
    )
    thread["nudge_count"] = int(thread.get("nudge_count") or 0) + 1
    thread["last_nudge_at"] = now
    thread["last_send_error"] = "" if result else "send_failed"
    crit = evaluate_criticality(task, thread)
    thread["criticality"] = crit["criticality"]
    thread["risk_score"] = crit["risk_score"]
    thread["next_followup_at"] = compute_next_followup(
        crit["criticality"],
        thread.get("status", ""),
        (task or {}).get("due_date"),
        thread["nudge_count"],
        now,
    )
    thread["updated_at"] = now
    _persist_thread(db, thread)

    if crit["criticality"] in ("high", "critical") or thread.get("status") in (
        "blocked",
        "extension_requested",
    ):
        await escalate_risk_summary(db, thread)

    return {"ok": bool(result), "thread": _thread_out(thread, True)}


@router.post("/threads/{thread_id}/summarize")
async def summarize_thread_endpoint(thread_id: str, current_user=Depends(get_current_user)):
    """Summarize a thread and post the card to its DM (owner/manager only)."""
    from ..agents.task_interaction_agent import _load_thread_by_id, summarize_thread
    from ..core import database as db_module

    db = db_module.db
    if db is None:
        raise HTTPException(status_code=503, detail="Database not configured")
    thread = _load_thread_by_id(db, thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    await _authorize_thread_admin(db, thread, current_user)
    return await summarize_thread(db, thread_id)


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
