import asyncio
import json
import re
import logging
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Query
from typing import Optional, List
from ..core.database import get_database
from ..dependencies.auth import get_current_user_optional
from ..api.websocket import manager as ws_manager
from bson import ObjectId

logger = logging.getLogger("yesboss.meetings")

router = APIRouter()


def resolve_mentions(text: str, db, org_id: str) -> List[str]:
    names = re.findall(r'@(\w[\w\s.-]+?)(?:\s|$|[,;:.!?])', text + " ")
    resolved = []
    seen = set()
    for name in names:
        name = name.strip()
        if not name or name.lower() in seen:
            continue
        seen.add(name.lower())
        member = db.org_chart_members.find_one({
            "organization_id": org_id,
            "full_name": {"$regex": f"^{re.escape(name)}$", "$options": "i"},
        })
        if member:
            resolved.append(member.get("email", "").lower())
    return list(set(resolved))


def _resolve_assignee(db, org_id: str, name: str):
    """Try to match a name against org chart members with progressive loosening."""
    name = name.strip()
    if not name:
        return None
    emp = db.org_chart_members.find_one({
        "organization_id": org_id,
        "$or": [
            {"email": {"$regex": f"^{re.escape(name)}$", "$options": "i"}},
            {"full_name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}},
        ]
    })
    if not emp:
        name_parts = name.split()
        if len(name_parts) >= 2:
            first = re.escape(name_parts[0])
            last = re.escape(name_parts[-1])
            emp = db.org_chart_members.find_one({
                "organization_id": org_id,
                "full_name": {"$regex": f"^{first} .*{last}$", "$options": "i"},
            })
        if not emp:
            emp = db.org_chart_members.find_one({
                "organization_id": org_id,
                "full_name": {"$regex": re.escape(name_parts[0]), "$options": "i"},
            })
    return emp

TASK_SYSTEM_PROMPT = (
    "You are an AI assistant that extracts actionable tasks from meeting notes. "
    "Given the meeting title, participants, and notes below, identify all actionable tasks. "
    "For each task, return a JSON object with these fields:\n"
    "- title: short task name (required)\n"
    "- description: detailed description of what needs to be done\n"
    "- suggested_assignee: the EXACT full name of the person responsible, as written in the meeting notes. Choose from the participants list if possible. Extract this from the meeting notes text — do not make up a name. If unclear, use the empty string.\n"
    "- suggested_priority: one of high, medium, low\n"
    "- suggested_deadline: when it should be done (relative date like '2026-06-20' or empty string)\n\n"
    "IMPORTANT: suggested_assignee must be the exact name mentioned in the notes (e.g. 'Arijit Das'), preferably matching someone from the participants list. Do not use email addresses. Leave empty if no person is clearly responsible.\n\n"
    "Return ONLY a valid JSON array of task objects. No markdown, no code blocks, no extra text."
)


async def get_user_org_id(user) -> Optional[str]:
    if hasattr(user, 'user_metadata') and user.user_metadata:
        return user.user_metadata.get("organization_id")
    return None


async def create_task_from_meeting(
    db,
    org_id: str,
    user_id: str,
    task_data: dict,
    meeting_title: str,
    participant_list: Optional[list] = None,
):
    assignee_ids = []
    combined_text = f"{task_data.get('suggested_assignee', '')} {task_data.get('description', '')} {task_data.get('title', '')}"
    mentioned = resolve_mentions(combined_text, db, org_id)
    if mentioned:
        assignee_ids = mentioned
    elif task_data.get("suggested_assignee"):
        suggested = task_data["suggested_assignee"].strip()
        emp = _resolve_assignee(db, org_id, suggested)
        if emp:
            assignee_ids = [emp.get("email", "").lower()]

    if not assignee_ids and participant_list:
        for p in participant_list:
            p = p.strip()
            if not p:
                continue
            if "@" in p:
                emp = db.org_chart_members.find_one({
                    "organization_id": org_id,
                    "email": {"$regex": f"^{re.escape(p)}$", "$options": "i"},
                })
            else:
                emp = _resolve_assignee(db, org_id, p)
            if emp:
                assignee_ids = [emp.get("email", "").lower()]
                break

    task_doc = {
        "title": task_data.get("title", "Untitled Task"),
        "description": task_data.get("description", ""),
        "priority": task_data.get("suggested_priority", "medium"),
        "status": "pending",
        "assignee_id": assignee_ids,
        "assignee_email": task_data.get("suggested_assignee", ""),
        "department": None,
        "due_date": task_data.get("suggested_deadline"),
        "dependencies": [],
        "reviewers": [],
        "organization_id": org_id,
        "created_by": user_id,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "escalation_level": 0,
        "owner_escalated": False,
        "owner_escalated_at": None,
        "source": "meeting",
        "source_meeting_title": meeting_title,
    }
    result = db.tasks.insert_one(task_doc)
    task_doc["_id"] = str(result.inserted_id)

    asyncio.create_task(ws_manager.broadcast_to_organization(
        {"type": "task_created", "data": task_doc}, org_id
    ))

    for aid in assignee_ids:
        from ..core.notification_service import create_and_deliver
        asyncio.create_task(create_and_deliver(
            user_id=aid,
            org_id=org_id,
            type="task_assigned",
            title="New Task from Meeting",
            message=f"Task '{task_doc['title']}' created from meeting '{meeting_title}'",
            link=f"/tasks/{result.inserted_id}",
            actor_id=user_id,
        ))

    return task_doc


@router.post("/process")
async def process_meeting(
    meeting_title: str = Form(...),
    participants: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    zoho_event_id: Optional[str] = Form(None),
    organization_id: Optional[str] = Form(None),
    current_user=Depends(get_current_user_optional),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = organization_id or await get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

    user_id = getattr(current_user, 'id', None) or str(current_user) if current_user else None

    raw_text = ""
    participant_list = []

    if zoho_event_id:
        event = db.calendar_events.find_one({"zoho_event_id": zoho_event_id})
        if not event:
            raise HTTPException(status_code=404, detail="Calendar event not found. Sync your calendar first.")
        raw_text = event.get("description", "")
        if not raw_text:
            raw_text = event.get("title", "")
        participant_list = event.get("attendees", [])
        if not meeting_title:
            meeting_title = event.get("title", "Meeting from Calendar")

    else:
        if not file:
            raise HTTPException(status_code=400, detail="Either file or zoho_event_id is required")
        ALLOWED_EXTENSIONS = {"txt", "md", "csv", "json", "xml", "html", "log", "pdf", "docx", "xlsx", "xls"}
        MAX_FILE_SIZE = 20 * 1024 * 1024
        file_bytes = await file.read()
        if not file_bytes:
            raise HTTPException(status_code=400, detail="Empty file")
        if len(file_bytes) > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail=f"File too large. Max {MAX_FILE_SIZE // (1024*1024)}MB.")
        filename = file.filename or "meeting_notes.txt"
        ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail=f"Unsupported file type '.{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}")
        text_ext = {"txt", "md", "csv", "json", "xml", "html", "log"}
        doc_ext = {"pdf", "docx", "xlsx", "xls"}
        if ext in text_ext:
            raw_text = file_bytes.decode("utf-8", errors="ignore").strip()
        elif ext in doc_ext:
            from ..core.file_processor import extract_text
            raw_text = extract_text(file_bytes, filename)
        else:
            raw_text = file_bytes.decode("utf-8", errors="ignore").strip()
        if not raw_text:
            raise HTTPException(status_code=400, detail="Could not extract text from file. Supported formats: txt, md, pdf, docx.")
        participant_list = [p.strip() for p in (participants or "").split(",") if p.strip()] if participants else []

    ai_prompt = (
        f"Meeting Title: {meeting_title}\n"
        f"Participants: {', '.join(participant_list) if participant_list else 'N/A'}\n\n"
        f"Meeting Notes:\n{raw_text[:8000]}"
    )

    from ..core.ai_client import get_ai_response
    ai_result = ""
    try:
        ai_result = await get_ai_response(
            prompt=ai_prompt,
            system_prompt=TASK_SYSTEM_PROMPT,
            temperature=0.3,
            max_tokens=3000,
        )
    except Exception as e:
        logger.error(f"AI analysis failed: {e}")
        raise HTTPException(status_code=502, detail=f"AI analysis failed: {e}")

    tasks_data = []
    cleaned = ai_result.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned)
        cleaned = re.sub(r'\s*```$', '', cleaned)
    try:
        tasks_data = json.loads(cleaned)
        if isinstance(tasks_data, dict):
            tasks_data = tasks_data.get("tasks", tasks_data.get("task", [tasks_data]))
        if not isinstance(tasks_data, list):
            tasks_data = [tasks_data]
    except json.JSONDecodeError:
        logger.warning(f"AI returned non-JSON, attempting extraction: {ai_result[:200]}")
        match = re.search(r'\[.*?\]', cleaned, re.DOTALL)
        if match:
            try:
                tasks_data = json.loads(match.group(0))
            except json.JSONDecodeError:
                tasks_data = []
        else:
            tasks_data = []

    created_tasks = []
    for td in tasks_data:
        if isinstance(td, dict) and td.get("title"):
            task = await create_task_from_meeting(db, org_id, user_id, td, meeting_title, participant_list)
            created_tasks.append(task)

    from ..core.notification_service import create_and_deliver
    owner_id = None
    org = db.organizations.find_one({"_id": ObjectId(org_id)})
    if org:
        owner_id = org.get("owner_id")

    if owner_id:
        asyncio.create_task(create_and_deliver(
            user_id=owner_id,
            org_id=org_id,
            type="meeting_processed",
            title="Meeting Processed",
            message=f"{len(created_tasks)} tasks created from your meeting '{meeting_title}'",
            link="/dashboard",
            actor_id=user_id,
        ))

    meeting_record = {
        "organization_id": org_id,
        "title": meeting_title,
        "file_name": filename,
        "participants": participant_list,
        "tasks_created": [t.get("_id") for t in created_tasks],
        "task_count": len(created_tasks),
        "raw_text": raw_text[:5000],
        "created_by": user_id,
        "created_at": datetime.utcnow(),
    }
    meeting_result = db.meetings.insert_one(meeting_record)
    meeting_id = str(meeting_result.inserted_id)

    return {
        "meeting_id": meeting_id,
        "meeting_title": meeting_title,
        "tasks_created": [
            {"id": t["_id"], "title": t["title"], "priority": t["priority"]}
            for t in created_tasks
        ],
        "task_count": len(created_tasks),
        "raw_text": raw_text[:2000],
    }


@router.get("/titles")
async def list_meeting_titles(
    q: Optional[str] = Query(""),
    organization_id: Optional[str] = Query(None),
    limit: int = Query(10, ge=1, le=50),
    current_user=Depends(get_current_user_optional),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = organization_id or await get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

    user_id = getattr(current_user, 'id', None) or str(current_user) if current_user else None

    query_filter = {"organization_id": org_id, "created_by": user_id}
    if q:
        query_filter["title"] = {"$regex": re.escape(q), "$options": "i"}

    titles = list(
        db.meetings.find(query_filter, {"title": 1})
        .sort("created_at", -1)
        .limit(limit)
    )
    return {"titles": [t["title"] for t in titles if t.get("title")]}


@router.delete("/{meeting_id}")
async def delete_meeting(
    meeting_id: str,
    organization_id: Optional[str] = Query(None),
    current_user=Depends(get_current_user_optional),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = organization_id or await get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

    logger.info(f"DELETE meeting: meeting_id={meeting_id}, org_id={org_id}")
    try:
        oid = ObjectId(meeting_id)
    except Exception as e:
        logger.error(f"Invalid meeting_id '{meeting_id}': {e}")
        raise HTTPException(status_code=400, detail=f"Invalid meeting ID: {e}")

    existing = db.meetings.find_one({"_id": oid, "organization_id": org_id})
    if not existing:
        logger.warning(f"Meeting not found with _id={meeting_id}, org_id={org_id}. Exists without org filter: {db.meetings.find_one({'_id': oid}) is not None}")
        raise HTTPException(status_code=404, detail="Meeting not found")

    result = db.meetings.delete_one({"_id": oid, "organization_id": org_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Meeting not found")

    return {"deleted": True}


@router.get("/history")
async def list_meetings(
    organization_id: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    current_user=Depends(get_current_user_optional),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = organization_id or await get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

    meetings = list(
        db.meetings.find({"organization_id": org_id})
        .sort("created_at", -1)
        .limit(limit)
    )

    for m in meetings:
        m["id"] = str(m.pop("_id"))
        m.pop("raw_text", None)

    return {"meetings": meetings}
