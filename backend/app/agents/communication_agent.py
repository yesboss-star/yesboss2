"""Communication Agent — stateless input normalizer + identity resolver + router.

Phase 1 (Communication Agent): accepts any input modality (text, Cliq button,
voice-note placeholder), normalizes it, resolves the sender to an org-scoped
identity, and routes to the Task Interaction Agent. No task business logic and
no DB writes live here.

Additive only — nothing in this module mutates existing task/notification flows.
"""

import logging
from datetime import datetime
from typing import Any

logger = logging.getLogger("yesboss.communication_agent")


def normalize_input(raw: dict[str, Any] | None) -> dict[str, Any]:
    """Normalize any inbound payload into a single canonical shape.

    Accepts:
      * Cliq bot webhook body: {sender, chat, message:{text,id}, button:{payload}, files}
      * YesBoss web composer:  {text, audio_url, transcript}

    Returns:
      {text, modality, confidence, button_task_id, button_action,
       cliq_msg_id, chat_id}
    """
    raw = raw or {}
    modality = "text"
    confidence = 0.9
    text = ""
    button_task_id = ""
    button_action = ""
    cliq_msg_id = ""
    chat_id = ""

    message = raw.get("message")
    if isinstance(message, dict):
        text = str(message.get("text") or "")
        cliq_msg_id = str(message.get("id") or "")

    chat = raw.get("chat")
    if isinstance(chat, dict):
        chat_id = str(chat.get("id") or "")

    button = raw.get("button")
    if isinstance(button, dict):
        payload = button.get("payload")
        if isinstance(payload, dict):
            button_task_id = str(payload.get("task_id") or "")
            button_action = str(payload.get("action") or "")
        # A button tap carries no free text but is a distinct modality.
        if button_action:
            modality = "button"
            confidence = 1.0
            if not text:
                text = button_action

    if not text:
        text = str(raw.get("text") or raw.get("transcript") or "")

    if raw.get("audio_url") or (isinstance(raw.get("files"), list) and raw.get("files")):
        modality = "voice" if raw.get("audio_url") else modality
        confidence = 0.6

    return {
        "text": text.strip(),
        "modality": modality,
        "confidence": confidence,
        "button_task_id": button_task_id,
        "button_action": button_action,
        "cliq_msg_id": cliq_msg_id,
        "chat_id": chat_id,
        "normalized_at": datetime.utcnow().isoformat(),
    }


def resolve_identity(db: Any, sender_email: str) -> dict[str, Any]:
    """Resolve a sender email to {uid, email, org_id}.

    Mirrors notification_service.resolve_uid / get_user_email lookups but scoped
    to the passed db handle so it is unit-testable. Unresolved senders return the
    email as uid with org_id "" (caller logs + acks, never crashes).
    """
    email = str(sender_email or "").strip().lower()
    result: dict[str, Any] = {"uid": email, "email": email, "org_id": ""}
    if not email or db is None:
        return result

    for coll_name in ("users", "employees", "org_chart_members"):
        try:
            doc = db[coll_name].find_one({"email": email})
        except Exception:
            doc = None
        if doc:
            result["uid"] = (
                doc.get("uid") or doc.get("user_id") or doc.get("id") or email
            )
            org_id = doc.get("organization_id") or doc.get("org_id") or ""
            if org_id:
                result["org_id"] = str(org_id)
                break
    return result


def extract_sender_email(raw: dict[str, Any] | None) -> str:
    """Pull sender.email out of a Cliq webhook body (defensive)."""
    raw = raw or {}
    sender = raw.get("sender")
    if isinstance(sender, dict):
        return str(sender.get("email") or "")
    return ""


async def route(
    db: Any,
    normalized: dict[str, Any],
    identity: dict[str, Any],
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Route a normalized message to the Task Interaction Agent.

    Returns {"routed": bool, ...}. Never raises to the webhook caller.
    """
    from .task_interaction_agent import (
        _find_open_thread,
        _load_thread,
        on_button,
        on_reply,
    )

    context = context or {}
    task_id = (
        context.get("task_id")
        or normalized.get("button_task_id")
        or ""
    )
    email = identity.get("email", "")
    action = normalized.get("button_action") or ""

    try:
        if action:
            thread = _load_thread(db, task_id, email) if task_id else None
            if thread is None:
                thread = _find_open_thread(db, email)
            if thread is None:
                return {"routed": False, "reason": "no_thread_for_button"}
            result = await on_button(db, thread, action)
            return {"routed": True, "kind": "button", **result}

        thread = _load_thread(db, task_id, email) if task_id else None
        if thread is None:
            thread = _find_open_thread(db, email)
        if thread is None:
            return {"routed": False, "reason": "no_open_thread"}

        result = await on_reply(
            db,
            thread,
            normalized.get("text", ""),
            modality=normalized.get("modality", "text"),
            cliq_msg_id=normalized.get("cliq_msg_id", ""),
        )
        return {"routed": True, "kind": "reply", **result}
    except Exception as e:
        logger.warning("communication route failed: %s", e)
        return {"routed": False, "reason": "error"}
