import logging
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel

from ..core.database import get_database
from ..dependencies.auth import get_current_user
from ..dependencies.scope import is_org_owner

logger = logging.getLogger("yesboss.journal")
router = APIRouter()

# Journal entries are personal. "idea" / "reflection" stay org-visible to owners
# (the Ideas page), but "journal" entries are author-only.
PERSONAL_ENTRY_TYPES = ("journal",)


def _uid(current_user) -> str | None:
    return getattr(current_user, "uid", None) or getattr(current_user, "id", None)


def _is_entry_author(entry: dict[str, Any], current_user) -> bool:
    uid = _uid(current_user)
    return bool(uid) and entry.get("user_id") == uid


async def _can_read_entry(db, entry: dict[str, Any], current_user) -> bool:
    if _is_entry_author(entry, current_user):
        return True
    if entry.get("type") in PERSONAL_ENTRY_TYPES:
        return False
    return await is_org_owner(db, entry.get("org_id", ""), current_user)


def _personal_scope(org_id: str, uid: str | None, owner: bool, type_filter: str | None = None) -> dict[str, Any]:
    query: dict[str, Any] = {"org_id": org_id}
    if type_filter:
        query["type"] = type_filter
    if owner:
        query["$or"] = [{"type": {"$nin": list(PERSONAL_ENTRY_TYPES)}}, {"user_id": uid}]
    else:
        query["user_id"] = uid
    return query


class JournalEntryCreate(BaseModel):
    content: str
    type: str = "idea"
    mood: str | None = None


class JournalEntryUpdate(BaseModel):
    content: str | None = None
    type: str | None = None
    mood: str | None = None


class JournalSyncRequest(BaseModel):
    session_id: str
    messages: list[dict[str, Any]] = []
    content: str | None = None
    mood: str | None = None
    organization_id: str | None = None


@router.post("")
async def create_journal_entry(
    data: JournalEntryCreate,
    current_user=Depends(get_current_user),
    org_id: str = Query(None, alias="organization_id"),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    resolved_org = org_id or (current_user.user_metadata or {}).get("organization_id") if hasattr(current_user, "user_metadata") else None
    if not resolved_org:
        raise HTTPException(status_code=400, detail="Organization ID required")

    entry = {
        "user_id": current_user.uid,
        "org_id": resolved_org,
        "content": data.content,
        "type": data.type,
        "mood": data.mood,
        "status": "seed",
        "pipeline_status": "backlog",
        "ai_analysis": None,
        "linked_goals": [],
        "linked_tasks": [],
        "is_shared": False,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    result = db.journal_entries.insert_one(entry)
    entry["_id"] = str(result.inserted_id)

    try:
        import asyncio

        from ..agents.journal_agent import analyze_entry
        asyncio.create_task(analyze_entry(
            entry_id=str(result.inserted_id),
            content=data.content,
            entry_type=data.type,
            org_id=resolved_org,
        ))
    except Exception as e:
        logger.warning("Failed to schedule analysis: %s", e)

    return {"success": True, "entry": entry}


class JournalSpeakRequest(BaseModel):
    text: str
    voice: str | None = None


@router.post("/tts")
async def journal_text_to_speech(
    data: JournalSpeakRequest,
    current_user=Depends(get_current_user),
):
    """Read journal text aloud in a natural voice (Gemini TTS). Returns audio/wav."""
    from ..core.tts import TtsNotConfigured, TtsProviderError, synthesize

    try:
        audio = await synthesize(data.text, voice=data.voice)
    except TtsNotConfigured as e:
        raise HTTPException(status_code=501, detail=str(e))
    except TtsProviderError as e:
        logger.warning("Journal TTS failed: %s", e)
        raise HTTPException(status_code=502, detail="Voice is unavailable right now")
    return Response(content=audio, media_type="audio/wav", headers={"Cache-Control": "private, max-age=3600"})


@router.post("/sync")
async def sync_journal_entry(
    data: JournalSyncRequest,
    current_user=Depends(get_current_user),
    org_id: str = Query(None, alias="organization_id"),
):
    """Upsert the journal entry that mirrors one private journal conversation."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    resolved_org = (
        data.organization_id
        or org_id
        or ((current_user.user_metadata or {}).get("organization_id") if hasattr(current_user, "user_metadata") else None)
    )
    uid = _uid(current_user)
    if not resolved_org or not uid or not data.session_id:
        raise HTTPException(status_code=400, detail="session_id and organization_id are required")

    messages = [
        {"role": m.get("role", "user"), "content": (m.get("content") or "").strip(), "timestamp": m.get("timestamp")}
        for m in data.messages
        if (m.get("content") or "").strip()
    ]
    user_texts = [m["content"] for m in messages if m["role"] == "user"]
    content = (data.content or (user_texts[0] if user_texts else "")).strip()
    if not content:
        raise HTTPException(status_code=400, detail="A journal entry needs at least one user message")

    now = datetime.utcnow()
    existing = db.journal_entries.find_one({"user_id": uid, "session_id": data.session_id})
    if existing:
        update: dict[str, Any] = {"messages": messages, "updated_at": now}
        if data.mood:
            update["mood"] = data.mood
        db.journal_entries.update_one({"_id": existing["_id"]}, {"$set": update})
        existing.update(update)
        entry_id = str(existing["_id"])
        existing["_id"] = entry_id
        try:
            import asyncio

            from ..agents.journal_agent import maybe_reanalyze
            asyncio.create_task(maybe_reanalyze(entry_id, resolved_org))
        except Exception as e:
            logger.warning("Failed to schedule journal re-analysis: %s", e)
        return {"success": True, "entry": existing, "created": False}

    entry = {
        "user_id": uid,
        "org_id": resolved_org,
        "session_id": data.session_id,
        "content": content,
        "messages": messages,
        "type": "journal",
        "mood": data.mood,
        "status": "seed",
        "pipeline_status": "backlog",
        "ai_analysis": None,
        "linked_goals": [],
        "linked_tasks": [],
        "is_shared": False,
        "created_at": now,
        "updated_at": now,
    }
    result = db.journal_entries.insert_one(entry)
    entry["_id"] = str(result.inserted_id)

    try:
        import asyncio

        from ..agents.journal_agent import analyze_entry
        asyncio.create_task(analyze_entry(
            entry_id=entry["_id"],
            content=content,
            entry_type="journal",
            org_id=resolved_org,
        ))
    except Exception as e:
        logger.warning("Failed to schedule journal analysis: %s", e)

    return {"success": True, "entry": entry, "created": True}


@router.get("")
async def list_journal_entries(
    current_user=Depends(get_current_user),
    org_id: str = Query(None, alias="organization_id"),
    type: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    resolved_org = org_id or (current_user.user_metadata or {}).get("organization_id") if hasattr(current_user, "user_metadata") else None
    if not resolved_org:
        raise HTTPException(status_code=400, detail="Organization ID required")

    query = _personal_scope(
        resolved_org,
        _uid(current_user),
        await is_org_owner(db, resolved_org, current_user),
        type,
    )

    total = db.journal_entries.count_documents(query)
    entries = list(db.journal_entries.find(query).sort("created_at", -1).skip(skip).limit(limit))
    for e in entries:
        e["_id"] = str(e["_id"])

    return {"entries": entries, "total": total}


@router.get("/mood-trends")
async def get_mood_trends(
    current_user=Depends(get_current_user),
    org_id: str = Query(None, alias="organization_id"),
    days: int = Query(30, ge=7, le=90),
):
    # Registered before "/{entry_id}" so the static path is not shadowed.
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    resolved_org = org_id or (current_user.user_metadata or {}).get("organization_id") if hasattr(current_user, "user_metadata") else None
    if not resolved_org:
        raise HTTPException(status_code=400, detail="Organization ID required")
    cutoff = datetime.utcnow() - timedelta(days=days)
    query: dict[str, Any] = {
        "org_id": resolved_org,
        "mood": {"$nin": [None, ""]},
        "created_at": {"$gte": cutoff},
    }
    owner = await is_org_owner(db, resolved_org, current_user)
    if owner:
        query["$or"] = [{"type": {"$nin": list(PERSONAL_ENTRY_TYPES)}}, {"user_id": _uid(current_user)}]
    else:
        query["user_id"] = _uid(current_user)
    entries = list(db.journal_entries.find(query).sort("created_at", 1))
    daily: dict[str, dict[str, int]] = {}
    for e in entries:
        day = e["created_at"].strftime("%Y-%m-%d") if hasattr(e["created_at"], "strftime") else str(e["created_at"])[:10]
        mood = e["mood"]
        if day not in daily:
            daily[day] = {}
        daily[day][mood] = daily[day].get(mood, 0) + 1
    trend_data = []
    for day, moods in sorted(daily.items()):
        total = sum(moods.values())
        row = {"date": day, "total": total}
        for m in ("great", "good", "okay", "bad"):
            row[m] = moods.get(m, 0)
        trend_data.append(row)
    summary = {"total_entries": len(entries), "days_with_data": len(trend_data)}
    if trend_data:
        all_moods = [m for e in entries for m in [e.get("mood")] if m]
        summary["most_common_mood"] = max(set(all_moods), key=all_moods.count) if all_moods else None
    return {"trends": trend_data, "summary": summary}


@router.get("/{entry_id}")
async def get_journal_entry(
    entry_id: str,
    current_user=Depends(get_current_user),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    from bson import ObjectId
    entry = db.journal_entries.find_one({"_id": ObjectId(entry_id)})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    # Only the author may read a journal entry; owners keep access to ideas.
    if not await _can_read_entry(db, entry, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    entry["_id"] = str(entry["_id"])
    return {"entry": entry}


@router.put("/{entry_id}")
async def update_journal_entry(
    entry_id: str,
    data: JournalEntryUpdate,
    current_user=Depends(get_current_user),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    from bson import ObjectId
    update: dict[str, Any] = {"updated_at": datetime.utcnow()}
    if data.content is not None:
        update["content"] = data.content
    if data.type is not None:
        update["type"] = data.type
    if data.mood is not None:
        update["mood"] = data.mood

    result = db.journal_entries.update_one(
        {"_id": ObjectId(entry_id), "user_id": current_user.uid},
        {"$set": update},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")

    return {"success": True}


@router.delete("/{entry_id}")
async def delete_journal_entry(
    entry_id: str,
    current_user=Depends(get_current_user),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    from bson import ObjectId
    result = db.journal_entries.delete_one(
        {"_id": ObjectId(entry_id), "user_id": current_user.uid}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")

    return {"success": True}


@router.post("/{entry_id}/analyze")
async def analyze_journal_entry(
    entry_id: str,
    current_user=Depends(get_current_user),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    from bson import ObjectId
    entry = db.journal_entries.find_one({"_id": ObjectId(entry_id)})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    # Only the author may analyze a journal entry; owners keep access to ideas.
    if not await _can_read_entry(db, entry, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    from ..agents.journal_agent import analyze_entry
    analysis = await analyze_entry(
        entry_id=str(entry["_id"]),
        content=entry.get("content", ""),
        entry_type=entry.get("type", "idea"),
        org_id=entry.get("org_id", ""),
    )

    if analysis:
        db.journal_entries.update_one(
            {"_id": ObjectId(entry_id)},
            {"$set": {"ai_analysis": analysis, "updated_at": datetime.utcnow()}},
        )
        return {"success": True, "analysis": analysis}
    else:
        raise HTTPException(status_code=500, detail="Analysis failed")


@router.put("/{entry_id}/pipeline")
async def update_pipeline_status(
    entry_id: str,
    status: str = Body(..., embed=True),
    current_user=Depends(get_current_user),
):
    if status not in ("backlog", "in_review", "approved", "converted"):
        raise HTTPException(status_code=400, detail="Invalid pipeline status")
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    from bson import ObjectId
    entry = db.journal_entries.find_one({"_id": ObjectId(entry_id)})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    if entry.get("type") in PERSONAL_ENTRY_TYPES:
        raise HTTPException(status_code=400, detail="Journal entries do not use the idea pipeline")
    # Only the author or an org owner may update pipeline status.
    if not await _can_read_entry(db, entry, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    result = db.journal_entries.update_one(
        {"_id": ObjectId(entry_id), "org_id": {"$exists": True}},
        {"$set": {"pipeline_status": status, "updated_at": datetime.utcnow()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"success": True, "pipeline_status": status}


@router.post("/{entry_id}/share")
async def share_journal_entry(
    entry_id: str,
    current_user=Depends(get_current_user),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    from bson import ObjectId
    entry = db.journal_entries.find_one({"_id": ObjectId(entry_id)})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    if entry.get("type") in PERSONAL_ENTRY_TYPES:
        raise HTTPException(status_code=400, detail="Journal entries stay private")
    # Only the author or an org owner may share the entry.
    if not await _can_read_entry(db, entry, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    org_id = entry.get("org_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="Entry has no organization")
    db.journal_entries.update_one(
        {"_id": ObjectId(entry_id)},
        {"$set": {"is_shared": True, "updated_at": datetime.utcnow()}},
    )
    members = list(db.users.find({"organization_id": org_id, "uid": {"$ne": current_user.uid}}))
    from ..core.notification_service import create_and_deliver
    for member in members:
        try:
            await create_and_deliver(
                user_id=member["uid"],
                org_id=org_id,
                type="shared_idea",
                title=f"{current_user.display_name or 'Someone'} shared an idea",
                message=entry.get("content", "")[:200],
                link=f"/dashboard/ideas?focus={entry_id}",
                actor_id=current_user.uid,
                actor_name=current_user.display_name or "Unknown",
            )
        except Exception:
            pass
    return {"success": True, "shared_with": len(members)}

