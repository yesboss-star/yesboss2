"""Journal intelligence endpoints (check-ins, decisions, ideas, recaps, ask, patterns, reminders).

Every query is scoped to the signed-in author (`user_id`) and the given organization;
nobody, including the org owner, can read another person's journal data here.
"""

import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..core import journal_intel as intel
from ..core.database import get_database
from ..dependencies.auth import get_current_user

logger = logging.getLogger("yesboss.journal_intel.api")
router = APIRouter()
IST = ZoneInfo("Asia/Kolkata")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _db():
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    return db


def _uid(current_user) -> str:
    uid = getattr(current_user, "uid", None) or getattr(current_user, "id", None)
    if not uid:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return str(uid)


def _oid(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except Exception:
        raise HTTPException(status_code=404, detail="Not found")


def _ser(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _ser(v) for k, v in value.items() if not k.startswith("_score")}
    if isinstance(value, list):
        return [_ser(v) for v in value]
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return (value if value.tzinfo else value.replace(tzinfo=UTC)).isoformat()
    return value


def _own(db, collection: str, doc_id: str, uid: str, org: str) -> dict[str, Any]:
    doc = db[collection].find_one({"_id": _oid(doc_id), "user_id": uid, "org_id": org})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return doc


def _parse_when(value: str | None, default_hour: int = 9) -> datetime | None:
    """Accept YYYY-MM-DD or ISO datetime; naive values are IST. Returns naive UTC."""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid date: {value}")
    if len(value) <= 10:
        dt = dt.replace(hour=default_hour)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=IST)
    return dt.astimezone(UTC).replace(tzinfo=None)


# ---------------------------------------------------------------------------
# Entries (AI Journal Intelligence)
# ---------------------------------------------------------------------------

@router.get("/entries")
async def list_analyzed_entries(
    organization_id: str,
    kind: str | None = None,
    limit: int = Query(30, ge=1, le=100),
    current_user=Depends(get_current_user),
):
    db, uid = _db(), _uid(current_user)
    query: dict[str, Any] = {"user_id": uid, "org_id": organization_id}
    if kind:
        query["ai_analysis.kind"] = kind
    docs = list(db.journal_entries.find(query, {"messages": 0}).sort("created_at", -1).limit(limit))
    return {"entries": _ser(docs)}


@router.get("/entries/{entry_id}")
async def get_entry(entry_id: str, organization_id: str, current_user=Depends(get_current_user)):
    db, uid = _db(), _uid(current_user)
    return {"entry": _ser(_own(db, "journal_entries", entry_id, uid, organization_id))}


@router.get("/sessions/{session_id}")
async def session_summary(session_id: str, organization_id: str, current_user=Depends(get_current_user)):
    """What the AI made of one journal conversation (for the small chips shown in the chat)."""
    db, uid = _db(), _uid(current_user)
    entry = db.journal_entries.find_one({"user_id": uid, "org_id": organization_id, "session_id": session_id}, {"messages": 0})
    analysis = (entry or {}).get("ai_analysis") or {}
    if not entry or analysis.get("analysis_version") != 2:
        return {"ready": False}
    idea = db.journal_ideas.find_one({"user_id": uid, "entry_id": str(entry["_id"])})
    return {
        "ready": True,
        "entry_id": str(entry["_id"]),
        "kind": analysis.get("kind"),
        "mood_noted": (analysis.get("signals") or {}).get("mood") is not None,
        "idea_saved": bool(idea),
        "idea_note": (idea or {}).get("connection_note"),
    }


@router.post("/entries/{entry_id}/reanalyze")
async def reanalyze_entry(entry_id: str, organization_id: str, current_user=Depends(get_current_user)):
    db, uid = _db(), _uid(current_user)
    entry = _own(db, "journal_entries", entry_id, uid, organization_id)
    from ..agents.journal_agent import analyze_entry

    analysis = await analyze_entry(entry_id=str(entry["_id"]), content=entry.get("content", ""), entry_type=entry.get("type", "journal"), org_id=organization_id)
    if not analysis:
        raise HTTPException(status_code=502, detail="Analysis failed")
    return {"analysis": _ser(analysis)}


# ---------------------------------------------------------------------------
# Mood / energy / stress
# ---------------------------------------------------------------------------

class CheckinIn(BaseModel):
    mood: int | None = Field(None, ge=1, le=5)
    energy: int | None = Field(None, ge=1, le=5)
    stress: int | None = Field(None, ge=1, le=5)
    confidence: int | None = Field(None, ge=1, le=5)
    reasons: list[str] = []
    note: str | None = None


@router.post("/checkins")
async def save_checkin(data: CheckinIn, organization_id: str, current_user=Depends(get_current_user)):
    db, uid = _db(), _uid(current_user)
    if all(v is None for v in (data.mood, data.energy, data.stress, data.confidence)):
        raise HTTPException(status_code=400, detail="Add at least one rating")
    today = intel.day_ist(datetime.utcnow())
    fields = {
        "mood": data.mood, "energy": data.energy, "stress": data.stress, "confidence": data.confidence,
        "reasons": [r for r in data.reasons if r in intel.TRIGGERS], "note": (data.note or "")[:300],
        "updated_at": datetime.utcnow(),
    }
    db.journal_checkins.update_one(
        {"user_id": uid, "org_id": organization_id, "date": today},
        {"$set": fields, "$setOnInsert": {"user_id": uid, "org_id": organization_id, "date": today, "created_at": datetime.utcnow()}},
        upsert=True,
    )
    return {"checkin": _ser(db.journal_checkins.find_one({"user_id": uid, "org_id": organization_id, "date": today}))}


@router.get("/checkins")
async def list_checkins(organization_id: str, days: int = Query(30, ge=1, le=180), current_user=Depends(get_current_user)):
    db, uid = _db(), _uid(current_user)
    since = intel.day_ist(datetime.utcnow() - timedelta(days=days))
    docs = list(db.journal_checkins.find({"user_id": uid, "org_id": organization_id, "date": {"$gte": since}}).sort("date", 1))
    return {"checkins": _ser(docs)}


@router.get("/mood-insights")
async def mood_insights(organization_id: str, days: int = Query(30, ge=7, le=180), current_user=Depends(get_current_user)):
    db, uid = _db(), _uid(current_user)
    since_dt = datetime.utcnow() - timedelta(days=days)
    checkins = list(db.journal_checkins.find({"user_id": uid, "org_id": organization_id, "date": {"$gte": intel.day_ist(since_dt)}}))
    entries = list(db.journal_entries.find({"user_id": uid, "org_id": organization_id, "created_at": {"$gte": since_dt}, "ai_analysis": {"$ne": None}}, {"messages": 0}).limit(500))
    result = intel.compute_mood_insights(checkins, entries)
    result["today_checkin"] = _ser(next((c for c in checkins if c.get("date") == intel.day_ist(datetime.utcnow())), None))
    return result


# ---------------------------------------------------------------------------
# Reminders
# ---------------------------------------------------------------------------

class ReminderIn(BaseModel):
    text: str
    type: str = "date"  # date | after_days | after_meeting | project_active
    due_at: str | None = None
    days: int | None = Field(None, ge=1, le=730)
    match: str | None = None
    goal_title: str | None = None
    entry_id: str | None = None
    decision_id: str | None = None
    idea_id: str | None = None
    session_id: str | None = None


def _make_reminder(db, uid: str, org: str, email: str | None, data: ReminderIn) -> dict[str, Any]:
    if not data.text.strip():
        raise HTTPException(status_code=400, detail="Reminder text is required")
    if data.type in ("date", "after_days"):
        due = _parse_when(data.due_at) if data.type == "date" else datetime.utcnow() + timedelta(days=data.days or 0)
        if not due:
            raise HTTPException(status_code=400, detail="A date or number of days is required")
        trigger: dict[str, Any] = {"type": "date", "due_at": due}
    elif data.type == "after_meeting" and data.match:
        trigger = {"type": "after_meeting", "match": data.match.strip()}
    elif data.type == "project_active" and data.goal_title:
        trigger = {"type": "project_active", "goal_title": data.goal_title.strip()}
    else:
        raise HTTPException(status_code=400, detail="Invalid reminder trigger")
    entry_id = data.entry_id
    if not entry_id and data.session_id:
        entry = db.journal_entries.find_one({"user_id": uid, "org_id": org, "session_id": data.session_id}, {"_id": 1})
        entry_id = str(entry["_id"]) if entry else None
    return intel.create_reminder(db, uid, org, data.text, trigger, user_email=email, entry_id=entry_id, decision_id=data.decision_id, idea_id=data.idea_id)


@router.get("/reminders")
async def list_reminders(organization_id: str, status: str | None = None, current_user=Depends(get_current_user)):
    db, uid = _db(), _uid(current_user)
    query: dict[str, Any] = {"user_id": uid, "org_id": organization_id}
    if status:
        query["status"] = status
    return {"reminders": _ser(list(db.journal_reminders.find(query).sort("created_at", -1).limit(100)))}


@router.post("/reminders")
async def add_reminder(data: ReminderIn, organization_id: str, current_user=Depends(get_current_user)):
    db, uid = _db(), _uid(current_user)
    return {"reminder": _ser(_make_reminder(db, uid, organization_id, getattr(current_user, "email", None), data))}


@router.post("/reminders/{reminder_id}/done")
async def finish_reminder(reminder_id: str, organization_id: str, current_user=Depends(get_current_user)):
    db, uid = _db(), _uid(current_user)
    _own(db, "journal_reminders", reminder_id, uid, organization_id)
    db.journal_reminders.update_one({"_id": _oid(reminder_id)}, {"$set": {"status": "done", "updated_at": datetime.utcnow()}})
    return {"success": True}


@router.delete("/reminders/{reminder_id}")
async def delete_reminder(reminder_id: str, organization_id: str, current_user=Depends(get_current_user)):
    db, uid = _db(), _uid(current_user)
    _own(db, "journal_reminders", reminder_id, uid, organization_id)
    db.journal_reminders.delete_one({"_id": _oid(reminder_id)})
    return {"success": True}


# ---------------------------------------------------------------------------
# Decision journal + What-if
# ---------------------------------------------------------------------------

class DecisionIn(BaseModel):
    question: str
    options: list[str] = []
    preferred: str | None = None
    why: str | None = None
    assumptions: list[str] = []
    risks: list[str] = []
    expected_outcome: str | None = None
    review_on: str | None = None
    entry_id: str | None = None


class OutcomeIn(BaseModel):
    actual_outcome: str
    result: str = "as_expected"  # better | as_expected | worse


def _clean_list(values: list[str], n: int = 8) -> list[str]:
    return [v.strip()[:200] for v in values if v and v.strip()][:n]


def _decision_fields(data: DecisionIn) -> dict[str, Any]:
    return {
        "question": data.question.strip()[:300], "options": _clean_list(data.options), "preferred": (data.preferred or "").strip()[:200],
        "why": (data.why or "").strip()[:600], "assumptions": _clean_list(data.assumptions), "risks": _clean_list(data.risks),
        "expected_outcome": (data.expected_outcome or "").strip()[:400], "review_on": (data.review_on or "").strip() or None,
    }


def _set_decision_reminder(db, uid: str, org: str, email: str | None, decision: dict[str, Any]) -> None:
    if decision.get("reminder_id"):
        db.journal_reminders.update_one({"_id": decision["reminder_id"], "status": "active"}, {"$set": {"status": "cancelled"}})
    if not decision.get("review_on"):
        db.journal_decisions.update_one({"_id": decision["_id"]}, {"$set": {"reminder_id": None}})
        return
    rem = intel.create_reminder(
        db, uid, org, f"Review your decision: {decision['question'][:120]}. What actually happened?",
        {"type": "date", "due_at": _parse_when(decision["review_on"])}, user_email=email, decision_id=str(decision["_id"]),
        entry_id=decision.get("entry_id"),
    )
    db.journal_decisions.update_one({"_id": decision["_id"]}, {"$set": {"reminder_id": rem["_id"]}})


@router.get("/decisions")
async def list_decisions(organization_id: str, status: str | None = None, current_user=Depends(get_current_user)):
    db, uid = _db(), _uid(current_user)
    query: dict[str, Any] = {"user_id": uid, "org_id": organization_id}
    if status:
        query["status"] = status
    return {"decisions": _ser(list(db.journal_decisions.find(query).sort("created_at", -1).limit(100)))}


@router.post("/decisions")
async def create_decision(data: DecisionIn, organization_id: str, current_user=Depends(get_current_user)):
    db, uid = _db(), _uid(current_user)
    if not data.question.strip():
        raise HTTPException(status_code=400, detail="Describe the decision to be made")
    _parse_when(data.review_on)  # validate
    now = datetime.utcnow()
    doc = {**_decision_fields(data), "user_id": uid, "org_id": organization_id, "entry_id": data.entry_id, "status": "open",
           "actual_outcome": None, "result": None, "created_at": now, "updated_at": now, "reminder_id": None}
    doc["_id"] = db.journal_decisions.insert_one(doc).inserted_id
    _set_decision_reminder(db, uid, organization_id, getattr(current_user, "email", None), doc)
    return {"decision": _ser(db.journal_decisions.find_one({"_id": doc["_id"]}))}


@router.put("/decisions/{decision_id}")
async def update_decision(decision_id: str, data: DecisionIn, organization_id: str, current_user=Depends(get_current_user)):
    db, uid = _db(), _uid(current_user)
    existing = _own(db, "journal_decisions", decision_id, uid, organization_id)
    _parse_when(data.review_on)
    fields = _decision_fields(data)
    db.journal_decisions.update_one({"_id": existing["_id"]}, {"$set": {**fields, "updated_at": datetime.utcnow()}})
    if fields["review_on"] != existing.get("review_on"):
        _set_decision_reminder(db, uid, organization_id, getattr(current_user, "email", None), {**existing, **fields})
    return {"decision": _ser(db.journal_decisions.find_one({"_id": existing["_id"]}))}


@router.post("/decisions/{decision_id}/outcome")
async def record_outcome(decision_id: str, data: OutcomeIn, organization_id: str, current_user=Depends(get_current_user)):
    db, uid = _db(), _uid(current_user)
    existing = _own(db, "journal_decisions", decision_id, uid, organization_id)
    result = data.result if data.result in ("better", "as_expected", "worse") else "as_expected"
    db.journal_decisions.update_one(
        {"_id": existing["_id"]},
        {"$set": {"status": "reviewed", "actual_outcome": data.actual_outcome.strip()[:600], "result": result, "reviewed_at": datetime.utcnow(), "updated_at": datetime.utcnow()}},
    )
    if existing.get("reminder_id"):
        db.journal_reminders.update_one({"_id": existing["reminder_id"], "status": "active"}, {"$set": {"status": "done"}})
    return {"decision": _ser(db.journal_decisions.find_one({"_id": existing["_id"]}))}


@router.delete("/decisions/{decision_id}")
async def delete_decision(decision_id: str, organization_id: str, current_user=Depends(get_current_user)):
    db, uid = _db(), _uid(current_user)
    existing = _own(db, "journal_decisions", decision_id, uid, organization_id)
    if existing.get("reminder_id"):
        db.journal_reminders.update_one({"_id": existing["reminder_id"]}, {"$set": {"status": "cancelled"}})
    db.journal_decisions.delete_one({"_id": existing["_id"]})
    return {"success": True}


class WhatIfIn(BaseModel):
    question: str


async def _org_context(db, org_id: str, uid: str, email: str | None) -> str:
    try:
        from .assistant import _gather_org_snapshot

        snap = await _gather_org_snapshot(db, org_id, user_id=uid, user_email=email)
    except Exception as e:
        logger.info("what-if context unavailable: %s", e)
        return ""
    lines = []
    profile = snap.get("org_profile") or {}
    lines += [f"{k}: {v}" for k, v in list(profile.items())[:8] if v]
    goals = snap.get("goals") or {}
    if goals.get("titles"):
        lines.append("Goals: " + "; ".join(str(t) for t in goals["titles"][:6]))
    tasks = snap.get("tasks") or {}
    if tasks:
        lines.append(f"Tasks: {tasks.get('total', 0)} total, {tasks.get('pending', 0)} pending, {tasks.get('in_progress', 0)} in progress")
    emp = snap.get("employees") or {}
    if emp.get("count"):
        lines.append(f"Team size: {emp['count']}")
    docs = snap.get("documents") or {}
    if docs.get("summary"):
        lines.append("Documents summary: " + str(docs["summary"])[:500])
    return "\n".join(lines)


@router.post("/what-if")
async def explore_what_if(data: WhatIfIn, organization_id: str, current_user=Depends(get_current_user)):
    db, uid = _db(), _uid(current_user)
    if not data.question.strip():
        raise HTTPException(status_code=400, detail="Describe the decision you are considering")
    context = await _org_context(db, organization_id, uid, getattr(current_user, "email", None))
    result = await intel.what_if(data.question.strip()[:600], context)
    if not result:
        raise HTTPException(status_code=502, detail="Couldn't explore that right now. Please try again.")
    return {"analysis": result}


# ---------------------------------------------------------------------------
# Idea vault
# ---------------------------------------------------------------------------

class IdeaIn(BaseModel):
    title: str
    note: str | None = None


class IdeaUpdate(BaseModel):
    title: str | None = None
    status: str | None = None
    goal_ids: list[str] | None = None
    task_ids: list[str] | None = None
    problem: str | None = None
    experiment_days: int | None = Field(None, ge=1, le=365)


@router.get("/ideas")
async def list_ideas(organization_id: str, status: str | None = None, current_user=Depends(get_current_user)):
    db, uid = _db(), _uid(current_user)
    query: dict[str, Any] = {"user_id": uid, "org_id": organization_id}
    if status:
        query["status"] = status
    return {"ideas": _ser(list(db.journal_ideas.find(query).sort("created_at", -1).limit(200)))}


@router.get("/ideas/search")
async def search_ideas(organization_id: str, q: str = Query(..., min_length=2), current_user=Depends(get_current_user)):
    db, uid = _db(), _uid(current_user)
    entries = await intel.search_entries(db, uid, organization_id, q, k=10)
    ids = [str(e["_id"]) for e in entries]
    ideas = {i["entry_id"]: i for i in db.journal_ideas.find({"user_id": uid, "org_id": organization_id, "entry_id": {"$in": ids}})}
    ranked = [ideas[i] for i in ids if i in ideas]
    return {"ideas": _ser(ranked), "entries": _ser([intel.public_entry(e) for e in entries])}


@router.post("/ideas")
async def add_idea(data: IdeaIn, organization_id: str, current_user=Depends(get_current_user)):
    db, uid = _db(), _uid(current_user)
    title = data.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Describe the idea")
    now = datetime.utcnow()
    entry = {"user_id": uid, "org_id": organization_id, "content": f"{title}\n{data.note or ''}".strip(), "type": "journal", "status": "seed",
             "pipeline_status": "backlog", "ai_analysis": None, "linked_goals": [], "linked_tasks": [], "is_shared": False, "created_at": now, "updated_at": now}
    entry["_id"] = db.journal_entries.insert_one(entry).inserted_id
    analysis = await intel.analyze_content(entry["content"], "idea") or {"kind": "idea", "summary": title[:200], "themes": [], "category": "general"}
    analysis["kind"] = "idea"
    db.journal_entries.update_one({"_id": entry["_id"]}, {"$set": {"ai_analysis": analysis}})
    entry["ai_analysis"] = analysis
    await intel.index_entry(entry)
    idea = await intel.sync_idea(db, entry, analysis)
    return {"idea": _ser(idea)}


@router.put("/ideas/{idea_id}")
async def update_idea(idea_id: str, data: IdeaUpdate, organization_id: str, current_user=Depends(get_current_user)):
    db, uid = _db(), _uid(current_user)
    idea = _own(db, "journal_ideas", idea_id, uid, organization_id)
    sets: dict[str, Any] = {"updated_at": datetime.utcnow()}
    if data.title:
        sets["title"] = data.title.strip()[:160]
    if data.status:
        if data.status not in intel.IDEA_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        sets["status"] = data.status
    if data.goal_ids is not None:
        sets["links.goal_ids"] = data.goal_ids[:10]
    if data.task_ids is not None:
        sets["links.task_ids"] = data.task_ids[:10]
    if data.problem is not None:
        sets["links.problem"] = data.problem.strip()[:200]
    db.journal_ideas.update_one({"_id": idea["_id"]}, {"$set": sets})
    if data.status == "experiment" and data.experiment_days:
        intel.create_reminder(
            db, uid, organization_id, f"Review your experiment: {idea.get('title', '')[:120]}. What did you learn?",
            {"type": "date", "due_at": datetime.utcnow() + timedelta(days=data.experiment_days)},
            user_email=getattr(current_user, "email", None), entry_id=idea.get("entry_id"), idea_id=str(idea["_id"]),
        )
    return {"idea": _ser(db.journal_ideas.find_one({"_id": idea["_id"]}))}


@router.delete("/ideas/{idea_id}")
async def delete_idea(idea_id: str, organization_id: str, current_user=Depends(get_current_user)):
    db, uid = _db(), _uid(current_user)
    idea = _own(db, "journal_ideas", idea_id, uid, organization_id)
    db.journal_ideas.delete_one({"_id": idea["_id"]})
    return {"success": True}


# ---------------------------------------------------------------------------
# Recaps, ask-my-journal, patterns
# ---------------------------------------------------------------------------

@router.get("/recaps")
async def list_recaps(organization_id: str, period: str | None = None, limit: int = Query(10, ge=1, le=60), current_user=Depends(get_current_user)):
    db, uid = _db(), _uid(current_user)
    query: dict[str, Any] = {"user_id": uid, "org_id": organization_id}
    if period in ("daily", "weekly"):
        query["period"] = period
    docs = list(db.journal_recaps.find(query).sort("created_at", -1).limit(limit))
    return {"recaps": _ser(docs), "labels": intel.RECAP_LABELS}


@router.post("/recaps/generate")
async def generate_recap(organization_id: str, period: str = "daily", current_user=Depends(get_current_user)):
    db, uid = _db(), _uid(current_user)
    recap = await intel.build_recap(db, uid, organization_id, period)
    if not recap:
        raise HTTPException(status_code=404, detail="No journal entries in that period yet")
    return {"recap": _ser(recap), "labels": intel.RECAP_LABELS}


class AskIn(BaseModel):
    question: str


@router.post("/ask")
async def ask_my_journal(data: AskIn, organization_id: str, current_user=Depends(get_current_user)):
    db, uid = _db(), _uid(current_user)
    question = data.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Ask a question")
    return await intel.ask_journal(db, uid, organization_id, question[:500])


@router.get("/patterns")
async def list_patterns(organization_id: str, current_user=Depends(get_current_user)):
    db, uid = _db(), _uid(current_user)
    docs = list(db.journal_patterns.find({"user_id": uid, "org_id": organization_id, "status": "active"}).sort("count", -1).limit(20))
    for d in docs:
        ids = [ObjectId(i) for i in d.get("entry_ids", []) if ObjectId.is_valid(str(i))]
        d["sources"] = [intel.public_entry(e) for e in db.journal_entries.find({"_id": {"$in": ids}, "user_id": uid}, {"messages": 0})] if d.get("type") != "stalled_ideas" else []
    return {"patterns": _ser(docs)}


@router.post("/patterns/refresh")
async def refresh(organization_id: str, current_user=Depends(get_current_user)):
    db, uid = _db(), _uid(current_user)
    keys = intel.refresh_patterns(db, uid, organization_id)
    return {"refreshed": len(keys)}


class PatternFeedback(BaseModel):
    action: str  # dismiss | correct
    note: str | None = None


@router.post("/patterns/{pattern_id}/feedback")
async def pattern_feedback(pattern_id: str, data: PatternFeedback, organization_id: str, current_user=Depends(get_current_user)):
    db, uid = _db(), _uid(current_user)
    pattern = _own(db, "journal_patterns", pattern_id, uid, organization_id)
    if data.action not in ("dismiss", "correct"):
        raise HTTPException(status_code=400, detail="Invalid action")
    status = "dismissed" if data.action == "dismiss" else "corrected"
    db.journal_patterns.update_one(
        {"_id": pattern["_id"]},
        {"$set": {"status": status, "user_feedback": (data.note or "")[:300], "updated_at": datetime.utcnow()}},
    )
    return {"success": True, "status": status}
