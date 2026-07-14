import logging
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel

from ..core.database import get_database
from ..dependencies.auth import get_current_user

logger = logging.getLogger("yesboss.journal")
router = APIRouter()


class JournalEntryCreate(BaseModel):
    content: str
    type: str = "idea"
    mood: str | None = None


class JournalEntryUpdate(BaseModel):
    content: str | None = None
    type: str | None = None
    mood: str | None = None


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

    query: dict[str, Any] = {"org_id": resolved_org}
    if type:
        query["type"] = type

    total = db.journal_entries.count_documents(query)
    entries = list(db.journal_entries.find(query).sort("created_at", -1).skip(skip).limit(limit))
    for e in entries:
        e["_id"] = str(e["_id"])

    return {"entries": entries, "total": total}


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


@router.get("/mood-trends")
async def get_mood_trends(
    current_user=Depends(get_current_user),
    org_id: str = Query(None, alias="organization_id"),
    days: int = Query(30, ge=7, le=90),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    resolved_org = org_id or (current_user.user_metadata or {}).get("organization_id") if hasattr(current_user, "user_metadata") else None
    if not resolved_org:
        raise HTTPException(status_code=400, detail="Organization ID required")
    cutoff = datetime.utcnow() - timedelta(days=days)
    entries = list(db.journal_entries.find({
        "org_id": resolved_org,
        "mood": {"$nin": [None, ""]},
        "created_at": {"$gte": cutoff},
    }).sort("created_at", 1))
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
