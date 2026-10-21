"""Task Interaction Agent — stateful per (task_id, assignee_email) thread.

Phase 1 responsibilities (additive only):
  * on_task_assigned — create the follow-up thread + send assignment card
  * on_reply         — capture a 1-1 Cliq reply, classify it, update risk
  * on_button        — handle Started / Blocked / Extension button taps

Every Zoho Cliq send goes through ZohoCliq, which is a no-op (logs only) until
ZOHO_CLIQ_BOT_ID is configured — so this is fully testable in stub mode and never
raises into the task/scheduler flows.

Criticality scoring, follow-up cadence and escalation follow the implementation
guide (§9-§11). LLM augmentation is left pluggable (Phase 2) — rule scoring is
authoritative in Phase 1.
"""

import asyncio
import json
import logging
from datetime import datetime, timedelta
from typing import Any

from bson import ObjectId

from ..core.identity import normalize_email

logger = logging.getLogger("yesboss.task_interaction_agent")

# ── status / criticality vocabulary ─────────────────────────────────────────
STATUS_ASSIGNED = "assigned"
STATUS_ACKNOWLEDGED = "acknowledged"
STATUS_IN_PROGRESS = "in_progress"
STATUS_BLOCKED = "blocked"
STATUS_AT_RISK = "at_risk"
STATUS_EXTENSION = "extension_requested"
STATUS_COMPLETED = "completed"
STATUS_OVERDUE = "overdue"
STATUS_SUMMARIZED = "summarized"

CLOSED_STATUSES = (STATUS_COMPLETED, STATUS_SUMMARIZED)

INTENT_TO_STATUS = {
    "started": STATUS_IN_PROGRESS,
    "progress": STATUS_IN_PROGRESS,
    "blocked": STATUS_BLOCKED,
    "extension_requested": STATUS_EXTENSION,
    "completed": STATUS_COMPLETED,
    "unclear": None,
}

BUTTON_TO_STATUS = {
    "started": STATUS_IN_PROGRESS,
    "blocked": STATUS_BLOCKED,
    "extension": STATUS_EXTENSION,
    "extension_requested": STATUS_EXTENSION,
    "completed": STATUS_COMPLETED,
}

# Ordered (intent, keywords, confidence, suggested_criticality).
_REPLY_RULES: list[tuple[str, tuple[str, ...], float, str]] = [
    ("completed", ("done", "completed", "finished", "complete", "shipped", "closed"), 0.75, "low"),
    ("extension_requested", ("extension", "extend", "more time", "extra time", "postpone", "delay"), 0.7, "medium"),
    ("blocked", ("blocked", "blocker", "stuck", "waiting on", "waiting for", "cannot proceed", "can't proceed", "dependent on"), 0.8, "high"),
    ("started", ("started", "start", "working on", "in progress", "began", "on it", "picked up"), 0.7, "low"),
    ("progress", ("progress", "halfway", "almost", "on track", "50%", "70%", "90%"), 0.6, "low"),
]

_NEGATED_START = ("not start", "haven't start", "have not start", "didn't start", "yet to start", "not yet")


def _utcnow() -> datetime:
    return datetime.utcnow()


def _parse_due(due_date: Any) -> datetime | None:
    if not due_date:
        return None
    try:
        v = str(due_date).strip().replace("Z", "").replace("+00:00", "")
        return datetime.fromisoformat(v)
    except Exception:
        return None


def classify_reply(text: str) -> dict[str, Any]:
    """Rule-based reply classifier (Phase 1). Deterministic + offline-safe."""
    low = (text or "").lower().strip()
    if any(neg in low for neg in _NEGATED_START):
        return {
            "intent": "unclear",
            "confidence": 0.3,
            "blocker_severity": "none",
            "sentiment": "neutral",
            "suggested_criticality": "medium",
            "risk_summary": "Assignee replied but status is not explicit.",
            "next_action": "Ask assignee to confirm current status.",
        }
    for intent, keywords, confidence, suggested in _REPLY_RULES:
        if any(kw in low for kw in keywords):
            return {
                "intent": intent,
                "confidence": confidence,
                "blocker_severity": "high" if intent == "blocked" else "none",
                "sentiment": "negative" if intent in ("blocked", "extension_requested") else "neutral",
                "suggested_criticality": suggested,
                "risk_summary": _summarize_intent(intent, text),
                "next_action": _next_action(intent),
            }
    return {
        "intent": "unclear",
        "confidence": 0.3,
        "blocker_severity": "none",
        "sentiment": "neutral",
        "suggested_criticality": "medium",
        "risk_summary": "Assignee replied but status is not explicit.",
        "next_action": "Ask assignee to confirm current status.",
    }


def _parse_llm_json(raw: str) -> dict[str, Any] | None:
    """Parse a JSON object out of an LLM response (tolerates code fences)."""
    if not raw:
        return None
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`").strip()
        if text.lower().startswith("json"):
            text = text[4:]
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        data = json.loads(text[start : end + 1])
    except Exception:
        return None
    if not isinstance(data, dict):
        return None
    intent = str(data.get("intent") or "").lower()
    if intent not in INTENT_TO_STATUS:
        return None
    try:
        confidence = float(data.get("confidence") or 0)
    except Exception:
        confidence = 0.0
    suggested = str(data.get("suggested_criticality") or "").lower()
    if suggested not in ("low", "medium", "high", "critical"):
        suggested = ""
    return {
        "intent": intent,
        "confidence": max(0.0, min(confidence, 1.0)),
        "blocker_severity": str(data.get("blocker_severity") or "none").lower(),
        "sentiment": str(data.get("sentiment") or "neutral").lower(),
        "suggested_criticality": suggested,
        "risk_summary": str(data.get("risk_summary") or ""),
        "next_action": str(data.get("next_action") or ""),
    }


async def classify_reply_llm(text: str, task: dict[str, Any] | None = None) -> dict[str, Any] | None:
    """Optional LLM classifier (§9). Fail-safe: any error → None (rules win)."""
    task = task or {}
    try:
        from ..core.ai_client import get_ai_response

        prompt = (
            f"Classify the assignee's reply for task {task.get('title', '')} "
            f"due {str(task.get('due_date') or '')[:10]} priority {task.get('priority', '')}.\n"
            f'Reply: "{text}".\n'
            "Return JSON ONLY: {intent: started|progress|blocked|extension_requested|completed|unclear, "
            "confidence 0-1, blocker_severity: none|low|med|high, sentiment, "
            "suggested_criticality: low|medium|high|critical, risk_summary (1-2 lines, manager-safe), next_action}."
        )
        raw = await get_ai_response(
            prompt,
            system_prompt="You are a strict JSON classifier. Return JSON only, no prose.",
            temperature=0.0,
            max_tokens=300,
        )
        return _parse_llm_json(raw)
    except Exception as e:
        logger.debug("cliq llm classify failed: %s", e)
        return None


def _merge_classification(rules: dict[str, Any], llm: dict[str, Any] | None) -> dict[str, Any]:
    """Rules-first merge: LLM may only resolve an `unclear` rules result."""
    merged = dict(rules)
    if not llm or float(llm.get("confidence") or 0) < 0.7:
        return merged
    if merged.get("intent") == "unclear" and llm.get("intent") in INTENT_TO_STATUS:
        merged["intent"] = llm["intent"]
        merged["confidence"] = float(llm.get("confidence") or merged.get("confidence", 0.3))
        if llm.get("risk_summary"):
            merged["risk_summary"] = llm["risk_summary"]
        if llm.get("next_action"):
            merged["next_action"] = llm["next_action"]
    return merged


def _summarize_intent(intent: str, text: str) -> str:
    snippet = (text or "").strip().replace("\n", " ")[:140]
    phrases = {
        "blocked": "Assignee reports being blocked.",
        "extension_requested": "Assignee is requesting more time.",
        "completed": "Assignee reports the task complete.",
        "started": "Assignee has started the task.",
        "progress": "Assignee reports progress.",
        "unclear": "Assignee replied; status unclear.",
    }
    base = phrases.get(intent, "Assignee replied.")
    return f"{base} \u201c{snippet}\u201d" if snippet else base


def _next_action(intent: str) -> str:
    return {
        "blocked": "Manager review of the blocker may be required.",
        "extension_requested": "Evaluate a new due date.",
        "completed": "Verify and close.",
        "started": "Continue monitoring.",
        "progress": "Continue monitoring.",
        "unclear": "Clarify status with assignee.",
    }.get(intent, "Continue monitoring.")


def evaluate_criticality(
    task: dict[str, Any] | None,
    thread: dict[str, Any] | None,
    llm: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Hybrid rules (+ optional LLM adjust) criticality scorer (guide §9)."""
    task = task or {}
    thread = thread or {}
    now = _utcnow()
    score = 0

    due = _parse_due(task.get("due_date"))
    if due:
        overdue_days = max((now - due).days, 0)
        score += overdue_days * 15
        hours_to_due = (due - now).total_seconds() / 3600
        if 0 <= hours_to_due <= 24:
            score += 25
        elif 24 < hours_to_due <= 72:
            score += 12

    priority = str(task.get("priority") or "").lower()
    score += {"critical": 30, "high": 20, "medium": 10, "low": 0}.get(priority, 0)
    score += int(task.get("escalation_level") or 0) * 10
    score += min(int(thread.get("nudge_count") or 0) * 5, 15)
    if thread.get("status") == STATUS_BLOCKED:
        score += 15

    score = max(0, min(score, 100))
    criticality = "low"
    if score >= 80:
        criticality = "critical"
    elif score >= 60:
        criticality = "high"
    elif score >= 40:
        criticality = "medium"

    risk_notes = thread.get("risk_notes") or _rules_risk_note(criticality, task, thread)

    # Optional LLM adjust (Phase 2 wiring). Never overrides with low confidence.
    if llm and float(llm.get("confidence") or 0) >= 0.7:
        suggested = str(llm.get("suggested_criticality") or "").lower()
        levels = ["low", "medium", "high", "critical"]
        if suggested in levels and suggested != criticality:
            idx = levels.index(criticality)
            target = levels.index(suggested)
            idx += 1 if target > idx else -1
            criticality = levels[idx]
        if llm.get("risk_summary"):
            risk_notes = str(llm["risk_summary"])

    return {"criticality": criticality, "risk_score": score, "risk_notes": risk_notes}


def _rules_risk_note(criticality: str, task: dict[str, Any], thread: dict[str, Any]) -> str:
    if thread.get("status") == STATUS_BLOCKED:
        return "Assignee reports a blocker."
    due = task.get("due_date")
    if due:
        return f"Task due {str(due)[:10]}; criticality {criticality}."
    return f"Criticality {criticality} based on priority and activity."


def compute_next_followup(
    criticality: str,
    status: str,
    due_date: Any = None,
    nudge_count: int = 0,
    now: datetime | None = None,
) -> datetime:
    """Follow-up cadence (guide §11): critical +2h, high +8h, med +24h, low +48h.

    Clamped so a follow-up never overshoots the due-date window.
    """
    now = now or _utcnow()
    deltas = {
        "critical": timedelta(hours=2),
        "high": timedelta(hours=8),
        "medium": timedelta(hours=24),
        "low": timedelta(hours=48),
    }
    base = now + deltas.get(criticality, timedelta(hours=24))

    if status == STATUS_ASSIGNED:
        base = min(base, now + timedelta(hours=4))

    due = _parse_due(due_date)
    if due is not None:
        cap = due - timedelta(hours=2)
        if cap > now and base > cap:
            base = cap
    return base


# ── persistence helpers (db may be None → all no-op, safe for tests) ────────


def _thread_key(thread: dict[str, Any]) -> dict[str, Any]:
    return {"task_id": thread.get("task_id", ""), "assignee_email": thread.get("assignee_email", "")}


def _load_thread(db: Any, task_id: str, email: str) -> dict[str, Any] | None:
    if db is None or not task_id or not email:
        return None
    try:
        return db.task_followups.find_one(_thread_key({"task_id": task_id, "assignee_email": email}))
    except Exception as e:
        logger.debug("load thread failed: %s", e)
        return None


def _load_thread_by_id(db: Any, thread_id: str) -> dict[str, Any] | None:
    if db is None or not thread_id:
        return None
    try:
        oid = ObjectId(str(thread_id)) if ObjectId.is_valid(str(thread_id)) else thread_id
        return db.task_followups.find_one({"_id": oid})
    except Exception as e:
        logger.debug("load thread by id failed: %s", e)
        return None


def _find_open_thread(db: Any, email: str) -> dict[str, Any] | None:
    if db is None or not email:
        return None
    query = {"assignee_email": email, "status": {"$nin": list(CLOSED_STATUSES)}}
    try:
        # Latest open thread wins when a sender has several in-flight tasks.
        return db.task_followups.find_one(query, sort=[("updated_at", -1)])
    except TypeError:
        # Some lightweight db doubles don't accept sort; fall back gracefully.
        try:
            return db.task_followups.find_one(query)
        except Exception as e:
            logger.debug("find open thread failed: %s", e)
            return None
    except Exception as e:
        logger.debug("find open thread failed: %s", e)
        return None


def _upsert_thread(db: Any, thread: dict[str, Any]) -> None:
    if db is None:
        return
    try:
        existing = db.task_followups.find_one(_thread_key(thread))
        if existing:
            thread["_id"] = existing.get("_id")
            db.task_followups.update_one({"_id": existing["_id"]}, {"$set": thread})
        else:
            res = db.task_followups.insert_one(dict(thread))
            thread["_id"] = getattr(res, "inserted_id", None)
    except Exception as e:
        logger.warning("upsert thread failed: %s", e)


def _persist_thread(db: Any, thread: dict[str, Any]) -> None:
    if db is None:
        return
    try:
        if thread.get("_id") is not None:
            db.task_followups.update_one({"_id": thread["_id"]}, {"$set": thread})
        else:
            db.task_followups.update_one(_thread_key(thread), {"$set": thread}, upsert=True)
    except Exception as e:
        logger.warning("persist thread failed: %s", e)


def _load_task(db: Any, task_id: str) -> dict[str, Any] | None:
    if db is None or not task_id:
        return None
    try:
        if ObjectId.is_valid(str(task_id)):
            return db.tasks.find_one({"_id": ObjectId(str(task_id))})
        return db.tasks.find_one({"_id": task_id})
    except Exception as e:
        logger.debug("load task failed: %s", e)
        return None


def _link_task_thread(db: Any, task_id: str, thread: dict[str, Any]) -> None:
    if db is None or not task_id:
        return
    try:
        oid = ObjectId(str(task_id)) if ObjectId.is_valid(str(task_id)) else task_id
        db.tasks.update_one(
            {"_id": oid},
            {"$set": {
                "cliq_thread_id": str(thread.get("_id") or ""),
                "criticality": thread.get("criticality", "low"),
                "last_cliq_nudge_at": thread.get("last_nudge_at"),
            }},
        )
    except Exception as e:
        logger.warning("link task thread failed: %s", e)


# ── public API ──────────────────────────────────────────────────────────────


async def on_task_assigned(db: Any, task_doc: dict[str, Any], assignee_email: str) -> str | None:
    """Create (or reuse) the follow-up thread and send the assignment card."""
    email = normalize_email(assignee_email)
    if not email or "@" not in email:
        return None
    task_id = str(task_doc.get("_id") or task_doc.get("id") or "")
    if not task_id:
        return None
    org_id = str(task_doc.get("organization_id") or "")

    existing = _load_thread(db, task_id, email)
    if existing:
        return str(existing.get("_id") or "")

    now = _utcnow()
    seed = evaluate_criticality(task_doc, {"status": STATUS_ASSIGNED, "nudge_count": 0})
    thread: dict[str, Any] = {
        "task_id": task_id,
        "org_id": org_id,
        "assignee_email": email,
        "assignee_uid": email,
        "cliq_chat_id": "",
        "cliq_bot_id": _bot_id(),
        "cliq_message_ids": [],
        "status": STATUS_ASSIGNED,
        "criticality": seed["criticality"],
        "risk_score": seed["risk_score"],
        "risk_notes": "",
        "messages": [],
        "nudge_count": 0,
        "last_reply_at": None,
        "last_nudge_at": None,
        "last_send_error": "",
        "next_followup_at": now + timedelta(hours=4),
        "summarized": False,
        "escalated_at": None,
        "created_at": now,
        "updated_at": now,
    }
    _upsert_thread(db, thread)

    title = task_doc.get("title", "")
    try:
        from ..core.zoho.cliq import ZohoCliq

        due_note = str(task_doc.get("due_date") or "no deadline")[:10]
        prompt = (
            f"Due: {due_note}\n\n"
            "Tap a button below or reply *started*, *blocked*, or *extension* to update me."
        )
        cliq = ZohoCliq(db)
        res = await cliq.send_card(
            email, f"📋 New task: {title}", prompt, task_id=task_id, org_id=org_id
        )
        if res is None:
            # Fall back to a plain text DM if the button card is rejected.
            res = await cliq.send_dm(email, f"📋 *New task:* {title}\n{prompt}", org_id=org_id)
        if res is not None:
            # send_dm returns a dict only on HTTP 2xx (None on skip/failure); a
            # Cliq bot DM 200 body may carry no chat_id, so don't gate on it.
            thread["cliq_chat_id"] = res.get("chat_id", "") or ""
            thread["last_send_error"] = ""
        else:
            thread["last_send_error"] = "send_failed"
        _persist_thread(db, thread)
    except Exception as e:
        logger.warning("cliq assignment send failed: %s", e)
        thread["last_send_error"] = f"exception: {e}"
        _persist_thread(db, thread)

    _notify_in_app(db, org_id, email, task_id, title, thread.get("last_send_error", ""))

    _link_task_thread(db, task_id, thread)
    logger.info("task_followup created task_id=%s assignee=%s criticality=%s", task_id, email, thread["criticality"])
    return str(thread.get("_id") or "")


def notify_cliq_assignments(db: Any, task_doc: dict[str, Any]) -> None:
    """Dispatch Cliq follow-up thread(s) for a task's assignees (fire-and-forget).

    Call this immediately after a task is inserted (i.e. once ``_id`` is set) from
    any creation path — AI executive chat, assistant delegation, goals, meetings,
    bulk import, etc. It is a safe no-op when the task has no email assignee and it
    never raises into the caller. Idempotent per (task_id, assignee_email).
    """
    if db is None or not task_doc:
        return

    candidates: list[Any] = []
    aid = task_doc.get("assignee_id")
    if isinstance(aid, (list, tuple)):
        candidates.extend(aid)
    elif isinstance(aid, str):
        candidates.append(aid)
    ae = task_doc.get("assignee_email")
    if isinstance(ae, (list, tuple)):
        candidates.extend(ae)
    elif isinstance(ae, str):
        candidates.append(ae)

    seen: set[str] = set()
    for raw in candidates:
        email = normalize_email(str(raw or ""))
        if not email or "@" not in email or email in seen:
            continue
        seen.add(email)
        try:
            asyncio.create_task(on_task_assigned(db, task_doc, email))
        except Exception as e:
            logger.warning("cliq assign dispatch failed for %s: %s", email, e)


async def on_reply(
    db: Any,
    thread: dict[str, Any],
    text: str,
    modality: str = "text",
    cliq_msg_id: str = "",
    use_llm: bool = False,
) -> dict[str, Any]:
    """Capture an assignee reply: classify (rules + optional LLM), update status/risk, ack."""
    if cliq_msg_id and cliq_msg_id in (thread.get("cliq_message_ids") or []):
        return {"deduped": True, "thread_id": str(thread.get("_id") or "")}

    now = _utcnow()
    task = _load_task(db, thread.get("task_id", ""))
    classification = classify_reply(text)
    llm = await classify_reply_llm(text, task) if use_llm else None
    classification = _merge_classification(classification, llm)
    intent = classification["intent"]

    thread.setdefault("messages", []).append({
        "dir": "in",
        "text": text,
        "modality": modality,
        "intent": intent,
        "confidence": classification["confidence"],
        "ts": now,
        "cliq_msg_id": cliq_msg_id,
    })
    if cliq_msg_id:
        thread.setdefault("cliq_message_ids", []).append(cliq_msg_id)

    new_status = INTENT_TO_STATUS.get(intent)
    if new_status:
        thread["status"] = new_status
    elif thread.get("status") == STATUS_ASSIGNED:
        thread["status"] = STATUS_ACKNOWLEDGED

    thread["last_reply_at"] = now
    crit = evaluate_criticality(task, thread, llm)
    thread["criticality"] = crit["criticality"]
    thread["risk_score"] = crit["risk_score"]
    thread["risk_notes"] = (llm or {}).get("risk_summary") or crit["risk_notes"]
    thread["next_followup_at"] = compute_next_followup(
        thread["criticality"], thread["status"], (task or {}).get("due_date"), thread.get("nudge_count", 0), now
    )
    thread["updated_at"] = now
    _persist_thread(db, thread)

    await _send_dm(db, thread, f"Got it — marked *{thread['status']}*. Next check-in {_fmt(thread['next_followup_at'])}.")

    if thread["criticality"] in ("high", "critical") or thread["status"] in (STATUS_BLOCKED, STATUS_EXTENSION):
        await escalate_risk_summary(db, thread)

    return {
        "deduped": False,
        "intent": intent,
        "status": thread["status"],
        "criticality": thread["criticality"],
        "next_followup_at": thread["next_followup_at"].isoformat(),
        "thread_id": str(thread.get("_id") or ""),
    }


async def on_button(db: Any, thread: dict[str, Any], action: str) -> dict[str, Any]:
    """Handle a Cliq button tap: started | blocked | extension."""
    action = (action or "").strip().lower()
    new_status = BUTTON_TO_STATUS.get(action)
    now = _utcnow()

    if new_status:
        thread["status"] = new_status
    thread.setdefault("messages", []).append({
        "dir": "in",
        "text": f"[button] {action}",
        "modality": "button",
        "intent": action or "unclear",
        "confidence": 1.0,
        "ts": now,
        "cliq_msg_id": "",
    })
    thread["last_reply_at"] = now

    task = _load_task(db, thread.get("task_id", ""))
    crit = evaluate_criticality(task, thread)
    thread["criticality"] = crit["criticality"]
    thread["risk_score"] = crit["risk_score"]
    thread["risk_notes"] = crit["risk_notes"]
    thread["next_followup_at"] = compute_next_followup(
        thread["criticality"], thread["status"], (task or {}).get("due_date"), thread.get("nudge_count", 0), now
    )
    thread["updated_at"] = now
    _persist_thread(db, thread)

    await _send_dm(db, thread, f"Marked *{thread['status']}*. Next check-in {_fmt(thread['next_followup_at'])}.")

    if thread["criticality"] in ("high", "critical") or thread["status"] in (STATUS_BLOCKED, STATUS_EXTENSION):
        await escalate_risk_summary(db, thread)

    return {
        "action": action,
        "status": thread["status"],
        "criticality": thread["criticality"],
        "thread_id": str(thread.get("_id") or ""),
    }


async def escalate_risk_summary(db: Any, thread: dict[str, Any]) -> None:
    """Notify manager + owner with a RISK SUMMARY ONLY (never the transcript)."""
    if db is None or not thread.get("org_id"):
        return
    if thread.get("escalated_at"):
        return
    try:
        from ..core.notification_service import create_and_deliver
        from ..core.scheduler import find_manager_email, get_org_owner_info

        email = thread.get("assignee_email", "")
        org_id = thread.get("org_id", "")
        task_id = thread.get("task_id", "")

        targets: list[str] = []
        mgr = await find_manager_email(db, email)
        if mgr:
            targets.append(mgr)
        _, owner_email = await get_org_owner_info(db, org_id)
        if owner_email and owner_email not in targets:
            targets.append(owner_email)

        # Manager-safe: summary + counts only, no `thread.messages`.
        summary = thread.get("risk_notes") or f"Task at risk ({thread.get('criticality')})."
        message = (
            f"{summary} (criticality={thread.get('criticality')}, "
            f"status={thread.get('status')}, replies={len(thread.get('messages') or [])})"
        )
        for target in targets:
            try:
                await create_and_deliver(
                    user_id=target,
                    org_id=org_id,
                    type="task_escalation",
                    title="Task at risk",
                    message=message,
                    link=f"/tasks/{task_id}",
                    metadata={
                        "task_id": task_id,
                        "thread_id": str(thread.get("_id") or ""),
                        "criticality": thread.get("criticality"),
                    },
                )
            except Exception as e:
                logger.warning("escalation notify failed for %s: %s", target, e)
        thread["escalated_at"] = _utcnow()
        _persist_thread(db, thread)
    except Exception as e:
        logger.warning("escalate_risk_summary failed: %s", e)


def _rules_summary(thread: dict[str, Any]) -> str:
    """Deterministic, manager-safe thread summary (LLM polish lands in Phase 3)."""
    messages = thread.get("messages") or []
    replies = len([m for m in messages if m.get("dir") == "in"])
    blockers = len([m for m in messages if m.get("intent") == "blocked"])
    parts = [
        f"Status: {thread.get('status', 'unknown')}",
        f"Criticality: {thread.get('criticality', 'low')}",
        f"Replies: {replies}",
    ]
    if blockers:
        parts.append(f"Blockers raised: {blockers}")
    note = thread.get("risk_notes")
    if note:
        parts.append(f"Risk: {note}")
    return "Task summary — " + "; ".join(parts)


async def summarize_thread(db: Any, thread_id: str) -> dict[str, Any]:
    """Summarize a thread, persist the outbound summary and post it to the DM."""
    thread = _load_thread_by_id(db, thread_id)
    if thread is None:
        return {"summarized": False, "thread_id": thread_id, "reason": "not_found"}
    if thread.get("summarized"):
        return {"summarized": True, "thread_id": str(thread.get("_id") or thread_id), "deduped": True}

    now = _utcnow()
    summary = _rules_summary(thread)
    thread.setdefault("messages", []).append({
        "dir": "out",
        "text": summary,
        "modality": "summary",
        "intent": "summary",
        "confidence": 1.0,
        "ts": now,
        "cliq_msg_id": "",
    })
    thread["summarized"] = True
    thread["updated_at"] = now
    _persist_thread(db, thread)
    await _send_dm(db, thread, summary)
    logger.info("thread summarized thread_id=%s", thread_id)
    return {
        "summarized": True,
        "thread_id": str(thread.get("_id") or thread_id),
        "summary": summary,
    }


# ── internal helpers ────────────────────────────────────────────────────────


def _bot_id() -> str:
    try:
        from ..core.config import settings

        return getattr(settings, "ZOHO_CLIQ_BOT_ID", "") or ""
    except Exception:
        return ""


def _fmt(dt: datetime) -> str:
    try:
        return dt.strftime("%Y-%m-%d %H:%M")
    except Exception:
        return ""


def _notify_in_app(db: Any, org_id: str, user_id: str, task_id: str, title: str, error: str = "") -> None:
    """In-app-only signal so Cliq follow-up activity is visible even when a DM is
    skipped (e.g. bot not yet org-approved). No email/push side effects."""
    if db is None:
        return
    try:
        message = f"Cliq follow-up started for '{title}'"
        if error:
            message += f" — Cliq DM not delivered ({error})"
        db.notifications.insert_one({
            "type": "cliq_followup",
            "title": "Cliq follow-up started",
            "message": message,
            "user_id": user_id,
            "organization_id": org_id,
            "link": f"/tasks/{task_id}",
            "read": False,
            "created_at": _utcnow(),
        })
    except Exception as e:
        logger.warning("cliq in-app notify failed: %s", e)


async def _send_dm(db: Any, thread: dict[str, Any], text: str) -> None:
    try:
        from ..core.zoho.cliq import ZohoCliq

        await ZohoCliq(db).send_dm(thread.get("assignee_email", ""), text, org_id=thread.get("org_id", ""))
    except Exception as e:
        logger.warning("cliq DM failed: %s", e)
