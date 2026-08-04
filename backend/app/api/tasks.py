import asyncio
import json
import logging
import os
import re
from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile

logger = logging.getLogger("yesboss.tasks")
from pydantic import BaseModel

from ..api.websocket import manager as ws_manager
from ..core.database import get_database
from ..core.zoho import ZohoMailTasks, ZohoOAuth
from ..dependencies.auth import get_current_user_optional

router = APIRouter()


def get_user_org_id(user) -> str | None:
    if hasattr(user, 'user_metadata') and user.user_metadata:
        return user.user_metadata.get("organization_id")
    return None


async def _is_org_owner(db, org_id: str, user_id: str) -> bool:
    """Check if user_id is the primary owner of the org."""
    from bson import ObjectId
    org = db.organizations.find_one(
        {"_id": ObjectId(org_id) if ObjectId.is_valid(org_id) else org_id},
        {"owner_id": 1}
    )
    if not org:
        return False
    return org.get("owner_id") == user_id


async def create_notification(user_id: str, org_id: str, type: str, title: str, message: str, link: str = None, actor_id: str = None, actor_name: str = None, metadata: dict = None, email: str = None):
    from ..core.notification_service import create_and_deliver
    await create_and_deliver(user_id, org_id, type, title, message, link, actor_id, actor_name, metadata, email=email)


async def sync_task_to_zoho(db, task_doc: dict, org_id: str, old_data: dict = None):
    try:
        zmt = ZohoMailTasks(db)
        zoho = ZohoOAuth(db)
        assignee_emails = task_doc.get("assignee_id") or []
        if isinstance(assignee_emails, str):
            assignee_emails = [assignee_emails]
        if not assignee_emails:
            assignee_emails = [task_doc.get("assignee_email")] if task_doc.get("assignee_email") else []

        owner = db.organizations.find_one({"_id": ObjectId(org_id)}) if ObjectId.is_valid(org_id) else None
        org_name = owner.get("name", "") if owner else ""

        owner_token = None
        if owner:
            owner_id = owner.get("owner_id", "")
            owner_token = await zoho.get_valid_token(owner_id)

        for email in assignee_emails:
            if not email:
                continue
            from ..api.meetings import _resolve_token_for_email
            assignee_token = await _resolve_token_for_email(db, email, org_id)
            if not assignee_token:
                continue

            existing_group_id = task_doc.get("zoho_group_task_id")
            existing_personal_id = task_doc.get("zoho_personal_task_id")

            if old_data is None:
                zgid = None
                if owner_token and org_name:
                    zgid = await zmt.ensure_group(org_name, owner_token)

                group_id = None
                if zgid and owner_token:
                    assignee_zoho_id = await zmt.get_zoho_user_id(assignee_token)
                    group_id = await zmt.create_group_task(owner_token, zgid, task_doc, assignee_zoho_id)

                personal_id = await zmt.create_personal_task(assignee_token, task_doc)

                updates = {}
                if group_id:
                    updates["zoho_group_task_id"] = group_id
                if zgid:
                    updates["zoho_zgid"] = zgid
                if personal_id:
                    updates["zoho_personal_task_id"] = personal_id
                if updates:
                    updates["zoho_sync_status"] = "synced"
                    updates["zoho_last_synced_at"] = datetime.utcnow().isoformat()
                    db.tasks.update_one({"_id": task_doc["_id"] if isinstance(task_doc["_id"], ObjectId) else ObjectId(task_doc["_id"])}, {"$set": updates})
            else:
                task_zgid = task_doc.get("zoho_zgid") or old_data.get("zoho_zgid")
                if existing_group_id and owner_token and task_zgid:
                    changes = {}
                    for f in ("title", "description", "priority", "status", "due_date"):
                        if task_doc.get(f) != old_data.get(f):
                            changes[f] = task_doc.get(f)
                    if changes:
                        await zmt.update_task(owner_token, existing_group_id, changes, is_group=True, zgid=task_zgid)
                if existing_personal_id:
                    changes = {}
                    for f in ("title", "description", "priority", "status", "due_date"):
                        if task_doc.get(f) != old_data.get(f):
                            changes[f] = task_doc.get(f)
                    if changes:
                        await zmt.update_task(assignee_token, existing_personal_id, changes)
    except Exception as e:
        logger = __import__("logging").getLogger("yesboss.tasks")
        logger.warning("Zoho sync failed: %s", e)


async def delete_zoho_task(task: dict, org_id: str):
    try:
        from ..core.database import get_database as _get_db
        db = _get_db()
        zmt = ZohoMailTasks(db)
        zoho = ZohoOAuth(db)
        zoho_group_id = task.get("zoho_group_task_id")
        zoho_personal_id = task.get("zoho_personal_task_id")
        zgid = task.get("zoho_zgid")
        assignee_emails = task.get("assignee_id") or []
        if isinstance(assignee_emails, str):
            assignee_emails = [assignee_emails]
        owner = db.organizations.find_one({"_id": ObjectId(org_id)}) if ObjectId.is_valid(org_id) else None
        owner_token = await zoho.get_valid_token(owner.get("owner_id", "")) if owner else None
        if zoho_group_id and owner_token:
            await zmt.delete_task(owner_token, zoho_group_id, is_group=True, zgid=zgid)
        for email in assignee_emails:
            if email:
                token = await zoho.get_valid_token(email)
                if token and zoho_personal_id:
                    await zmt.delete_task(token, zoho_personal_id)
    except Exception as e:
        logger = __import__("logging").getLogger("yesboss.tasks")
        logger.warning("Zoho delete sync failed: %s", e)


async def sync_task_to_google(db, task_doc: dict, org_id: str, old_data: dict = None):
    try:
        from ..core.google import GoogleTasks
        from ..core.providers import _resolve_google_token

        gtasks = GoogleTasks(db)
        assignee_emails = task_doc.get("assignee_id") or []
        if isinstance(assignee_emails, str):
            assignee_emails = [assignee_emails]
        if not assignee_emails:
            assignee_emails = [task_doc.get("assignee_email")] if task_doc.get("assignee_email") else []

        for email in assignee_emails:
            if not email:
                continue
            assignee_token = await _resolve_google_token(db, email, org_id, include_org_fallback=False)
            if not assignee_token:
                continue

            list_id = await gtasks.ensure_list(assignee_token)
            if not list_id:
                continue

            existing_task_id = task_doc.get("google_task_id")

            if old_data is None:
                task_id = await gtasks.create_task(assignee_token, list_id, task_doc)
                updates = {
                    "google_sync_status": "synced" if task_id else "pending",
                    "google_last_synced_at": datetime.utcnow().isoformat(),
                }
                if task_id:
                    updates["google_task_id"] = task_id
                    updates["google_task_list_id"] = list_id
                db.tasks.update_one(
                    {"_id": task_doc["_id"] if isinstance(task_doc["_id"], ObjectId) else ObjectId(task_doc["_id"])},
                    {"$set": updates},
                )
            else:
                if not existing_task_id:
                    continue
                changes = {}
                for f in ("title", "description", "status", "due_date"):
                    if task_doc.get(f) != old_data.get(f):
                        changes[f] = task_doc.get(f)
                if changes:
                    await gtasks.update_task(assignee_token, list_id, existing_task_id, changes)
                    db.tasks.update_one(
                        {"_id": task_doc["_id"] if isinstance(task_doc["_id"], ObjectId) else ObjectId(task_doc["_id"])},
                        {"$set": {"google_sync_status": "synced", "google_last_synced_at": datetime.utcnow().isoformat()}},
                    )
    except Exception as e:
        logger = __import__("logging").getLogger("yesboss.tasks")
        logger.warning("Google sync failed: %s", e)


async def delete_google_task(task: dict):
    try:
        from ..core.database import get_database as _get_db
        from ..core.google import GoogleTasks
        from ..core.providers import _resolve_google_token

        db = _get_db()
        gtasks = GoogleTasks(db)
        google_task_id = task.get("google_task_id")
        list_id = task.get("google_task_list_id")
        assignee_emails = task.get("assignee_id") or []
        if isinstance(assignee_emails, str):
            assignee_emails = [assignee_emails]
        for email in assignee_emails:
            if email and google_task_id:
                token = await _resolve_google_token(db, email, task.get("organization_id"), include_org_fallback=False)
                if token and list_id:
                    await gtasks.delete_task(token, list_id, google_task_id)
    except Exception as e:
        logger = __import__("logging").getLogger("yesboss.tasks")
        logger.warning("Google delete sync failed: %s", e)


async def sync_task_to_provider(db, task_doc: dict, org_id: str, old_data: dict = None):
    """Dispatch a task sync to the org's connected provider (Google or Zoho)."""
    try:
        from ..core.providers import get_org_provider

        provider = get_org_provider(db, org_id)
        if provider == "google":
            await sync_task_to_google(db, task_doc, org_id, old_data)
        else:
            await sync_task_to_zoho(db, task_doc, org_id, old_data)
    except Exception as e:
        logger = __import__("logging").getLogger("yesboss.tasks")
        logger.warning("Provider task sync dispatch failed: %s", e)


def _normalize_assignee_ids(v):
    if v is None:
        return None
    if isinstance(v, str):
        return [] if v == "" else [v]
    result = list(v)
    return [x for x in result if x is not None]


def _normalize_due_date(value):
    if not value:
        return value
    v = str(value).strip().replace("Z", "").replace("+00:00", "").replace("T00:00:00.000", "")
    if re.match(r"^\d{4}-\d{2}-\d{2}$", v):
        v = v + "T00:00:00"
    return v

class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    priority: str = "medium"
    goal_id: str | None = None
    assignee_id: str | list[str] | None = None
    assignee_email: str | None = None
    department: str | None = None
    due_date: str | None = None
    dependencies: list[str] | None = None
    reviewers: list[str] | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    priority: str | None = None
    status: str | None = None
    assignee_id: str | list[str] | None = None
    assignee_name: str | list[str] | None = None
    due_date: str | None = None
    dependencies: list[str] | None = None
    reviewers: list[str] | None = None


class TaskComment(BaseModel):
    content: str


@router.post("")
async def create_task(task: TaskCreate, organization_id: str | None = None, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = organization_id or get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

    user_id = getattr(current_user, 'id', None) or str(current_user) if current_user else None

    assignee_ids = _normalize_assignee_ids(task.assignee_id) or []

    task_doc = {
        "title": task.title,
        "description": task.description,
        "priority": task.priority,
        "status": "pending",
        "goal_id": task.goal_id,
        "assignee_id": assignee_ids,
        "assignee_email": task.assignee_email,
        "department": task.department,
        "due_date": _normalize_due_date(task.due_date),
        "dependencies": task.dependencies or [],
        "reviewers": task.reviewers or [],
        "organization_id": org_id,
        "created_by": user_id,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "escalation_level": 0,
        "owner_escalated": False,
        "owner_escalated_at": None,
    }

    result = db.tasks.insert_one(task_doc)
    task_doc["_id"] = str(result.inserted_id)

    asyncio.create_task(ws_manager.broadcast_to_organization(
        {"type": "task_created", "data": task_doc},
        org_id
    ))
    asyncio.create_task(sync_task_to_provider(db, task_doc, org_id))

    for aid in assignee_ids:
        from ..core.notification_service import resolve_uid

        target = resolve_uid(aid)
        asyncio.create_task(ws_manager.send_personal_message(
            {"type": "task_assigned", "data": task_doc},
            target,
        ))
        asyncio.create_task(create_notification(
            user_id=aid,
            org_id=org_id,
            type="task_assigned",
            title="New Task Assigned",
            message=f"You have been assigned: {task.title}",
            link=f"/tasks/{result.inserted_id}",
            actor_id=user_id,
            email=task.assignee_email,
        ))

    from ..agents.frequency_agent import process_task as _freq_task
    asyncio.create_task(_freq_task(task_doc, org_id))

    return {"task": task_doc}


@router.get("")
async def list_tasks(
    goal_id: str | None = None,
    assignee_id: str | None = None,
    status: str | None = None,
    priority: str | None = None,
    department: str | None = None,
    organization_id: str | None = None,
    overdue: bool = Query(False),
    escalation_level: int | None = Query(None),
    current_user = Depends(get_current_user_optional)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = organization_id or get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

    query = {"organization_id": org_id}
    if goal_id:
        query["goal_id"] = goal_id
    if assignee_id:
        query["assignee_id"] = {"$in": [assignee_id] if isinstance(assignee_id, str) else assignee_id}
    if status:
        query["status"] = status
    if overdue:
        now = datetime.utcnow().replace(microsecond=0).isoformat()
        query["due_date"] = {"$lt": now}
        query["status"] = {"$nin": ["completed", "approved"]}
    if priority:
        query["priority"] = priority
    if department:
        query["department"] = department
    if escalation_level is not None:
        query["escalation_level"] = escalation_level

    if current_user and getattr(current_user, 'id', None):
        from bson import ObjectId
        org = db.organizations.find_one({"_id": ObjectId(org_id) if ObjectId.is_valid(org_id) else org_id}, {"owner_id": 1})
        is_owner = org and org.get("owner_id") == current_user.id
        if not is_owner:
            user_email = (getattr(current_user, 'email', '') or '').lower().strip()
            query["$or"] = [
                {"created_by": current_user.id},
                {"assignee_email": user_email},
                {"assigned_to": user_email},
                {"assignee_id": user_email},
            ]

    tasks = list(db.tasks.find(query).sort("created_at", -1))

    for task in tasks:
        task["_id"] = str(task["_id"])
        raw = task.get("assignee_id")
        if isinstance(raw, str):
            task["assignee_id"] = [raw]
        elif raw is None:
            task["assignee_id"] = []
        raw_name = task.get("assignee_name")
        if isinstance(raw_name, str):
            task["assignee_name"] = [raw_name]
        elif raw_name is None:
            task["assignee_name"] = []

    return {"tasks": tasks}


@router.get("/{task_id}")
async def get_task(task_id: str, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    task = db.tasks.find_one({"_id": ObjectId(task_id)})

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if current_user and getattr(current_user, 'id', None):
        user_email = (getattr(current_user, 'email', '') or '').lower().strip()
        if task.get("created_by") != current_user.id and task.get("assignee_email") != user_email and task.get("assigned_to") != user_email:
            raise HTTPException(status_code=403, detail="Access denied")

    task["_id"] = str(task["_id"])
    raw = task.get("assignee_id")
    if isinstance(raw, str):
        task["assignee_id"] = [raw]
    elif raw is None:
        task["assignee_id"] = []

    comments = list(db.task_comments.find({"task_id": task_id}).sort("created_at", 1))
    for comment in comments:
        comment["_id"] = str(comment["_id"])

    return {"task": task, "comments": comments}


@router.put("/{task_id}")
async def update_task(task_id: str, task: TaskUpdate, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    old_obj = db.tasks.find_one({"_id": ObjectId(task_id)})
    if not old_obj:
        raise HTTPException(status_code=404, detail="Task not found")

    org_id = old_obj.get("organization_id", "")
    if current_user and getattr(current_user, 'id', None):
        if not await _is_org_owner(db, org_id, current_user.id):
            user_email = (getattr(current_user, 'email', '') or '').lower().strip()
            if old_obj.get("created_by") != current_user.id and old_obj.get("assignee_email") != user_email and old_obj.get("assigned_to") != user_email:
                raise HTTPException(status_code=403, detail="Access denied")

    update_data = {}
    for k, v in task.model_dump().items():
        if v is None:
            continue
        if k == "assignee_id":
            update_data[k] = _normalize_assignee_ids(v) or []
        elif k == "assignee_name":
            update_data[k] = _normalize_assignee_ids(v) or []
        elif k == "due_date":
            update_data[k] = _normalize_due_date(v)
        else:
            update_data[k] = v
    update_data["updated_at"] = datetime.utcnow()

    db.tasks.update_one(
        {"_id": ObjectId(task_id)},
        {"$set": update_data}
    )

    task_obj = db.tasks.find_one({"_id": ObjectId(task_id)})
    task_obj["_id"] = str(task_obj["_id"])
    raw = task_obj.get("assignee_id")
    if isinstance(raw, str):
        task_obj["assignee_id"] = [raw]
    elif raw is None:
        task_obj["assignee_id"] = []
    raw_name = task_obj.get("assignee_name")
    if isinstance(raw_name, str):
        task_obj["assignee_name"] = [raw_name]
    elif raw_name is None:
        task_obj["assignee_name"] = []

    if org_id:
        asyncio.create_task(sync_task_to_provider(db, task_obj, org_id, old_obj))

        asyncio.create_task(ws_manager.broadcast_to_organization(
            {"type": "task_updated", "data": task_obj},
            org_id
        ))

        user_id = getattr(current_user, 'id', None) or str(current_user) if current_user else None
        old_assignee_ids = _normalize_assignee_ids(old_obj.get("assignee_id")) or [] if old_obj else []
        new_assignee_ids = task_obj.get("assignee_id") or []
        new_assignees = [a for a in new_assignee_ids if a not in old_assignee_ids]

        for aid in new_assignees:
            if aid != user_id:
                from ..core.notification_service import resolve_uid

                target = resolve_uid(aid)
                asyncio.create_task(ws_manager.send_personal_message(
                    {"type": "task_assigned", "data": task_obj},
                    target,
                ))
                asyncio.create_task(create_notification(
                    user_id=aid, org_id=org_id,
                    type="task_assigned",
                    title="Task Assigned to You",
                    message=f"You have been assigned: {task_obj.get('title')}",
                    link=f"/tasks/{task_id}",
                    actor_id=user_id,
                    email=task_obj.get("assignee_email"),
                ))

        if task.status and new_assignee_ids:
            status_title = task.status.replace("_", " ").title()
            for aid in new_assignee_ids:
                asyncio.create_task(create_notification(
                    user_id=aid, org_id=org_id,
                    type="task_status",
                    title=f"Task {status_title}",
                    message=f"Task '{task_obj.get('title')}' is now {task.status}",
                    link=f"/tasks/{task_id}",
                    email=task_obj.get("assignee_email"),
                ))

    goal_id = task_obj.get("goal_id")
    if goal_id:
        await _recalc_goal_task_counts_and_broadcast(db, goal_id, org_id)

    from ..agents.frequency_agent import process_task as _freq_task
    asyncio.create_task(_freq_task(task_obj, org_id))

    return {"task": task_obj}


@router.delete("/{task_id}")
async def delete_task(task_id: str, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    task = db.tasks.find_one({"_id": ObjectId(task_id)})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if current_user and getattr(current_user, 'id', None):
        t_org_id = task.get("organization_id", "")
        if not await _is_org_owner(db, t_org_id, current_user.id):
            user_email = (getattr(current_user, 'email', '') or '').lower().strip()
            if task.get("created_by") != current_user.id and task.get("assignee_email") != user_email and task.get("assigned_to") != user_email:
                raise HTTPException(status_code=403, detail="Access denied")

    if task:
        raw_assignees = task.get("assignee_id", [])
        if isinstance(raw_assignees, str):
            raw_assignees = [raw_assignees]
        assignee_email = task.get("assignee_email")
        org_id = task.get("organization_id", "")

        zoho_group_id = task.get("zoho_group_task_id")
        zoho_personal_id = task.get("zoho_personal_task_id")
        google_task_id = task.get("google_task_id")
        if zoho_group_id or zoho_personal_id:
            asyncio.create_task(delete_zoho_task(task, org_id))
        if google_task_id:
            asyncio.create_task(delete_google_task(task))

        for aid in raw_assignees or []:
            asyncio.create_task(create_notification(
                user_id=aid,
                org_id=org_id,
                type="task_deleted",
                title="Task Deleted",
                message=f"Task '{task.get('title')}' was deleted",
                metadata={"task_id": task_id},
                email=assignee_email,
            ))

    goal_id = task.get("goal_id")
    if goal_id:
        await _recalc_goal_task_counts_and_broadcast(db, goal_id, org_id)

    db.tasks.delete_one({"_id": ObjectId(task_id)})
    db.task_comments.delete_many({"task_id": task_id})

    return {"success": True, "message": "Task deleted"}


@router.post("/{task_id}/comments")
async def add_comment(task_id: str, comment: TaskComment, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    task = db.tasks.find_one({"_id": ObjectId(task_id)})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    user_id = getattr(current_user, 'id', None) or str(current_user) if current_user else None
    user_email = getattr(current_user, 'email', None) or ""

    comment_doc = {
        "task_id": task_id,
        "content": comment.content,
        "user_id": user_id,
        "user_email": user_email,
        "created_at": datetime.utcnow(),
    }

    result = db.task_comments.insert_one(comment_doc)
    comment_doc["_id"] = str(result.inserted_id)

    return {"comment": comment_doc}


@router.post("/{task_id}/approve")
async def approve_task(task_id: str, current_user = Depends(get_current_user_optional)):
    try:
        db = get_database()
        if db is None:
            raise HTTPException(status_code=500, detail="Database not configured")

        task = db.tasks.find_one({"_id": ObjectId(task_id)})
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        if current_user and getattr(current_user, "id", None):
            t_org_id = task.get("organization_id", "")
            if not await _is_org_owner(db, t_org_id, current_user.id):
                user_email = (getattr(current_user, "email", "") or "").lower().strip()
                assignee_ids = [str(a).lower().strip() for a in (task.get("assignee_id") or [])]
                if (
                    task.get("created_by") != current_user.id
                    and (task.get("assignee_email") or "").lower().strip() != user_email
                    and (task.get("assigned_to") or "").lower().strip() != user_email
                    and user_email not in assignee_ids
                ):
                    raise HTTPException(status_code=403, detail="Access denied")

        user_id = getattr(current_user, 'id', None) or str(current_user) if current_user else None

        db.tasks.update_one(
            {"_id": ObjectId(task_id)},
            {"$set": {"status": "approved", "approved_by": user_id, "updated_at": datetime.utcnow()}}
        )

        task_obj = db.tasks.find_one({"_id": ObjectId(task_id)})
        task_obj["_id"] = str(task_obj["_id"])
        raw = task_obj.get("assignee_id")
        if isinstance(raw, str):
            task_obj["assignee_id"] = [raw]
        elif raw is None:
            task_obj["assignee_id"] = []

        org_id = task_obj.get("organization_id")

        if org_id:
            asyncio.create_task(ws_manager.broadcast_to_organization(
                {"type": "task_updated", "data": task_obj},
                org_id,
            ))

            for aid in task_obj.get("assignee_id") or []:
                asyncio.create_task(create_notification(
                    user_id=aid,
                    org_id=org_id,
                    type="task_approved",
                    title="Task Approved",
                    message=f"Task '{task_obj.get('title')}' has been approved",
                    link=f"/tasks/{task_id}",
                    email=task_obj.get("assignee_email"),
                ))

        goal_id = task_obj.get("goal_id")
        if goal_id:
            await _recalc_goal_task_counts_and_broadcast(db, goal_id, org_id)

        from ..agents.frequency_agent import process_task as _freq_task
        asyncio.create_task(_freq_task(task_obj, org_id))

        return {"task": task_obj}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error approving task {task_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to approve task: {str(e)}")


async def _recalc_goal_task_counts_and_broadcast(db, goal_id: str, org_id: str):
    """Recalculate task_counts for a goal, auto-set to pending_review if all done, and broadcast goal_updated."""
    if not goal_id or not org_id:
        return
    pipeline = [
        {"$match": {"goal_id": goal_id}},
        {"$group": {
            "_id": "$goal_id",
            "total": {"$sum": 1},
            "completed": {"$sum": {"$cond": [{"$in": ["$status", ["completed", "approved"]]}, 1, 0]}},
            "in_progress": {"$sum": {"$cond": [{"$eq": ["$status", "in_progress"]}, 1, 0]}},
            "pending": {"$sum": {"$cond": [{"$eq": ["$status", "pending"]}, 1, 0]}},
        }}
    ]
    results = list(db.tasks.aggregate(pipeline))
    if results:
        r = results[0]
        tc = {"total": r["total"], "completed": r["completed"], "in_progress": r["in_progress"], "pending": r["pending"]}
    else:
        tc = {"total": 0, "completed": 0, "in_progress": 0, "pending": 0}

    goal = db.goals.find_one({"_id": ObjectId(goal_id)})
    if not goal:
        return

    new_status = goal.get("status", "active")
    if tc["total"] > 0 and tc["completed"] >= tc["total"] and new_status not in ("completed", "pending_review", "archived"):
        new_status = "pending_review"

    update_fields = {"task_counts": tc, "updated_at": datetime.utcnow()}
    if new_status != goal.get("status"):
        update_fields["status"] = new_status
        logger.info("Goal %s status changed: %s -> %s", goal_id, goal.get("status"), new_status)

    db.goals.update_one({"_id": ObjectId(goal_id)}, {"$set": update_fields})

    goal_obj = db.goals.find_one({"_id": ObjectId(goal_id)})
    if goal_obj:
        goal_obj["_id"] = str(goal_obj["_id"])
        for f in ("assignee_id", "assignee_name", "reviewer_id", "reviewer_name"):
            raw = goal_obj.get(f)
            if isinstance(raw, str):
                goal_obj[f] = [raw]
            elif raw is None:
                goal_obj[f] = []
        goal_obj["progress"] = round((tc["completed"] / tc["total"] * 100) if tc["total"] > 0 else 0, 1)
        goal_obj["task_counts"] = tc
        asyncio.create_task(ws_manager.broadcast_to_organization(
            {"type": "goal_updated", "data": goal_obj}, org_id,
        ))


@router.post("/{task_id}/complete")
async def complete_task(task_id: str, current_user = Depends(get_current_user_optional)):
    try:
        db = get_database()
        if db is None:
            raise HTTPException(status_code=500, detail="Database not configured")

        task = db.tasks.find_one({"_id": ObjectId(task_id)})
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        if current_user and getattr(current_user, "id", None):
            t_org_id = task.get("organization_id", "")
            if not await _is_org_owner(db, t_org_id, current_user.id):
                user_email = (getattr(current_user, "email", "") or "").lower().strip()
                assignee_ids = [str(a).lower().strip() for a in (task.get("assignee_id") or [])]
                if (
                    task.get("created_by") != current_user.id
                    and (task.get("assignee_email") or "").lower().strip() != user_email
                    and (task.get("assigned_to") or "").lower().strip() != user_email
                    and user_email not in assignee_ids
                ):
                    raise HTTPException(status_code=403, detail="Access denied")

        db.tasks.update_one(
            {"_id": ObjectId(task_id)},
            {"$set": {"status": "completed", "completed_at": datetime.utcnow(), "updated_at": datetime.utcnow()}}
        )

        task_obj = db.tasks.find_one({"_id": ObjectId(task_id)})
        task_obj["_id"] = str(task_obj["_id"])
        raw = task_obj.get("assignee_id")
        if isinstance(raw, str):
            task_obj["assignee_id"] = [raw]
        elif raw is None:
            task_obj["assignee_id"] = []

        org_id = task_obj.get("organization_id")

        if org_id:
            asyncio.create_task(ws_manager.broadcast_to_organization(
                {"type": "task_updated", "data": task_obj},
                org_id,
            ))

            created_by = task_obj.get("created_by")
            if created_by:
                asyncio.create_task(create_notification(
                    user_id=created_by,
                    org_id=org_id,
                    type="task_completed",
                    title="Task Completed",
                    message=f"Task '{task_obj.get('title')}' has been marked complete",
                    link=f"/tasks/{task_id}",
                ))

        goal_id = task_obj.get("goal_id")
        if goal_id:
            await _recalc_goal_task_counts_and_broadcast(db, goal_id, org_id)

        from ..agents.frequency_agent import process_task as _freq_task
        asyncio.create_task(_freq_task(task_obj, org_id))

        return {"task": task_obj}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error completing task {task_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to complete task: {str(e)}")


TASK_COLUMN_PROMPT = """You are a smart data interpreter. Given column headers and sample rows from an Excel file, determine:

1. Whether this file contains task assignment data (rows with a task title and a person to assign it to)
2. Map each column to its role using these categories:
   - "title" — the task name / description of work
   - "assignee" — who the task is assigned to (name or email)
   - "priority" — priority level
   - "due_date" — deadline or due date
   - "description" — additional details about the task
   - "status" — current status of the task
   - "ignore" — columns not relevant to task creation

3. For each row, extract the mapped fields. For assignee, resolve against the provided org chart members (return email if found, otherwise return the raw value).

Return ONLY valid JSON:
{
  "is_task_file": true/false,
  "confidence": 0.0-1.0,
  "column_mapping": { "original_column_name": "title|assignee|priority|due_date|description|status|ignore" },
  "rows": [
    {
      "row_index": 0,
      "title": "...",
      "assignee_raw": "...",
      "assignee_email": "...",
      "assignee_name": "...",
      "priority": "high|medium|low",
      "due_date": "...",
      "description": "...",
      "status": "...",
      "valid": true,
      "validation_error": ""
    }
  ]
}

Be flexible with column name variations across languages. Use sample data to infer meaning.
If you cannot confidently map a column, mark it as "ignore".
Set is_task_file to false if the data is clearly not a task list (e.g. financial reports, pure analytics, employee lists)."""


@router.post("/bulk-import/preview")
async def bulk_import_preview(
    file: UploadFile = File(None),
    organization_id: str = Form(...),
    file_id: str = Form(""),
    current_user = Depends(get_current_user_optional),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    # If file_id is provided, read from previously uploaded file on disk
    if file_id:
        doc = db.documents.find_one({"file_id": file_id, "org_id": organization_id})
        if not doc:
            raise HTTPException(status_code=404, detail="Uploaded file not found")
        file_path = doc.get("file_path")
        if not file_path or not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="File not found on disk")
        with open(file_path, "rb") as fh:
            contents = fh.read()
        filename = doc.get("filename", "upload.xlsx")
    else:
        if not file or not file.filename:
            raise HTTPException(status_code=400, detail="Filename required")
        filename = file.filename
        ext = filename.lower().rsplit(".", 1)[-1]
        if ext not in ("xlsx", "xls"):
            raise HTTPException(status_code=400, detail="Only .xlsx and .xls files are supported")
        contents = await file.read()
        if len(contents) > 25 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File too large (max 25MB)")

    try:
        import io

        import pandas as pd
        dfs = pd.read_excel(io.BytesIO(contents), sheet_name=None)
        sheet_names = list(dfs.keys())
        combined = pd.concat(dfs.values(), ignore_index=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse Excel file: {str(e)}")

    if combined.empty:
        raise HTTPException(status_code=400, detail="Excel file is empty")

    headers = list(combined.columns)
    sample_rows = combined.head(5).fillna("").to_dict(orient="records")
    sample_rows_clean = []
    for row in sample_rows:
        sample_rows_clean.append({k: str(v) for k, v in row.items()})

    org_members = list(db.org_chart_members.find({"organization_id": organization_id}))
    org_members_list = [{"name": m.get("full_name", ""), "email": m.get("email", "")} for m in org_members]

    from ..core.ai_client import get_ai_response

    ai_prompt = (
        f"Column Headers: {headers}\n\n"
        f"Sample Rows ({len(sample_rows_clean)}):\n"
        f"{json.dumps(sample_rows_clean, indent=2)}\n\n"
        f"Org Chart Members ({len(org_members_list)}):\n"
        f"{json.dumps(org_members_list, indent=2)}"
    )

    ai_result = ""
    try:
        ai_result = await get_ai_response(
            prompt=ai_prompt,
            system_prompt=TASK_COLUMN_PROMPT,
            temperature=0.2,
            max_tokens=4000,
        )
    except Exception as e:
        logger.error(f"AI column mapping failed: {e}")
        raise HTTPException(status_code=502, detail=f"AI analysis failed: {e}")

    cleaned = ai_result.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned)
        cleaned = re.sub(r'\s*```$', '', cleaned)

    try:
        mapping = json.loads(cleaned)
    except json.JSONDecodeError:
        logger.error(f"AI returned invalid JSON: {ai_result[:500]}")
        raise HTTPException(status_code=502, detail="AI returned invalid response format")

    is_task_file = mapping.get("is_task_file", False)
    confidence = mapping.get("confidence", 0)
    column_mapping = mapping.get("column_mapping", {})

    preview_rows = []
    title_col = next((c for c, v in column_mapping.items() if v == "title"), None)
    assignee_col = next((c for c, v in column_mapping.items() if v == "assignee"), None)

    all_data = combined.fillna("").to_dict(orient="records")
    org_member_map = {m["email"].lower(): m for m in org_members_list if m.get("email")}
    org_member_by_name = {m["name"].lower(): m for m in org_members_list if m.get("name")}

    for idx, row in enumerate(all_data):
        if title_col:
            title = str(row.get(title_col, "")).strip()
        else:
            continue

        if not title:
            continue

        assignee_raw = ""
        assignee_email = ""
        assignee_name = ""
        if assignee_col:
            assignee_raw = str(row.get(assignee_col, "")).strip()
            lower = assignee_raw.lower()
            if lower in org_member_map:
                assignee_email = org_member_map[lower]["email"]
                assignee_name = org_member_map[lower]["name"]
            elif lower in org_member_by_name:
                assignee_email = org_member_by_name[lower]["email"]
                assignee_name = org_member_by_name[lower]["name"]
            else:
                assignee_email = assignee_raw
                assignee_name = assignee_raw

        priority = "medium"
        priority_col = next((c for c, v in column_mapping.items() if v == "priority"), None)
        if priority_col:
            raw_p = str(row.get(priority_col, "")).strip().lower()
            if raw_p in ("high", "urgent", "critical", "p0", "p1"):
                priority = "high"
            elif raw_p in ("low", "minor", "p3", "p4"):
                priority = "low"

        due_date = ""
        due_col = next((c for c, v in column_mapping.items() if v == "due_date"), None)
        if due_col:
            raw_d = row.get(due_col)
            if raw_d is not None and str(raw_d).strip():
                due_date = str(raw_d).strip()

        description = ""
        desc_col = next((c for c, v in column_mapping.items() if v == "description"), None)
        if desc_col:
            raw_desc = str(row.get(desc_col, "")).strip()
            if raw_desc:
                description = raw_desc

        preview_rows.append({
            "row_index": idx,
            "title": title,
            "assignee_raw": assignee_raw,
            "assignee_email": assignee_email,
            "assignee_name": assignee_name,
            "priority": priority,
            "due_date": due_date,
            "description": description,
            "valid": bool(assignee_email),
            "total_rows": len(all_data),
        })

    return {
        "is_task_file": is_task_file,
        "confidence": confidence,
        "column_mapping": column_mapping,
        "sheet_names": sheet_names,
        "total_rows": len(all_data),
        "detected_count": len(preview_rows),
        "rows": preview_rows,
        "message": f"Detected {len(preview_rows)} tasks from {len(all_data)} rows" if is_task_file else "File does not appear to be a task list",
    }


@router.post("/bulk-import/confirm")
async def bulk_import_confirm(
    tasks: str = Form(...),
    organization_id: str = Form(...),
    meeting_title: str | None = Form(None),
    current_user = Depends(get_current_user_optional),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    try:
        tasks_data = json.loads(tasks)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid tasks JSON")

    if not isinstance(tasks_data, list) or not tasks_data:
        raise HTTPException(status_code=400, detail="tasks must be a non-empty array")

    user_id = getattr(current_user, 'id', None) or str(current_user) if current_user else None

    from ..api.websocket import manager as ws_manager
    from ..core.notification_service import create_and_deliver

    created_tasks = []
    failed = []

    for td in tasks_data:
        try:
            assignee_email = (td.get("assignee_email") or "").strip()
            assignee_name = (td.get("assignee_name") or "").strip()
            assignee_emails = [assignee_email] if assignee_email else []

            task_doc = {
                "title": td.get("title", "Untitled Task"),
                "description": td.get("description", ""),
                "priority": td.get("priority", "medium"),
                "status": "pending",
                "assignee_id": assignee_emails,
                "assignee_email": assignee_email,
                "assignee_name": assignee_name,
                "department": None,
                "due_date": td.get("due_date"),
                "dependencies": [],
                "reviewers": [],
                "organization_id": organization_id,
                "created_by": user_id,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
                "escalation_level": 0,
                "owner_escalated": False,
                "owner_escalated_at": None,
                "source": "bulk_import",
                "source_meeting_title": meeting_title or "",
                "zoho_task_ids": [],
                "goal_id": None,
            }

            result = db.tasks.insert_one(task_doc)
            task_doc["_id"] = str(result.inserted_id)

            asyncio.create_task(ws_manager.broadcast_to_organization(
                {"type": "task_created", "data": task_doc}, organization_id
            ))

            for email in assignee_emails:
                asyncio.create_task(create_and_deliver(
                    user_id=email,
                    org_id=organization_id,
                    type="task_assigned",
                    title="New Task from Import",
                    message=f"Task '{task_doc['title']}' created from bulk import",
                    link=f"/tasks/{result.inserted_id}",
                    actor_id=user_id,
                ))

            if not task_doc.get("due_date") and user_id:
                asyncio.create_task(create_and_deliver(
                    user_id=user_id,
                    org_id=organization_id,
                    type="deadline_needed",
                    title="Task needs a deadline",
                    message=f"Task '{task_doc['title']}' has no deadline — please set one",
                    link=f"/tasks/{result.inserted_id}",
                    actor_id=user_id,
                ))

            from ..api.meetings import _push_to_provider_todo
            asyncio.create_task(_push_to_provider_todo(db, organization_id, task_doc, assignee_emails))

            from ..agents.frequency_agent import process_task as _freq_task
            asyncio.create_task(_freq_task(task_doc, organization_id))

            created_tasks.append(task_doc)
        except Exception as e:
            logger.error(f"Failed to create task from bulk import: {e}", exc_info=True)
            failed.append({"row": td.get("title", ""), "reason": str(e)})

    suggestion = None
    if created_tasks:
        try:
            from ..core.ai_client import get_ai_response
            titles = [t.get("title", "") for t in created_tasks]
            descs = [t.get("description", "") for t in created_tasks]
            no_dates = sum(1 for t in created_tasks if not t.get("due_date"))
            prompt = f"""You are analyzing a set of tasks just created via bulk import.

Task titles: {json.dumps(titles)}
Task descriptions: {json.dumps(descs)}
Tasks without due dates: {no_dates}

Analyze these tasks and return ONLY valid JSON (no markdown, no code fences):
1. If 3+ tasks share a common theme (e.g., marketing, hiring, product, sales, engineering), suggest a goal title and description to group them
2. Count how many tasks have no due date
3. Generate a brief, friendly suggestion_text (1-2 sentences) that explains what was found and offers next steps

Return format:
{{"suggested_goal_title": "string or null", "suggested_goal_description": "string or null", "tasks_without_dates_count": number, "suggestion_text": "string"}}"""
            ai_text = await get_ai_response(prompt)
            import re
            json_match = re.search(r'\{.*\}', ai_text, re.DOTALL)
            if json_match:
                parsed = json.loads(json_match.group())
                suggestion = {
                    "suggested_goal_title": parsed.get("suggested_goal_title"),
                    "suggested_goal_description": parsed.get("suggested_goal_description"),
                    "tasks_without_dates_count": parsed.get("tasks_without_dates_count", no_dates),
                    "suggestion_text": parsed.get("suggestion_text", ""),
                }
        except Exception as e:
            logger.warning(f"Failed to generate import suggestion: {e}")

    return {
        "created_count": len(created_tasks),
        "failed_count": len(failed),
        "failed": failed,
        "suggestion": suggestion,
        "tasks_created": [
            {
                "id": t["_id"],
                "title": t["title"],
                "priority": t["priority"],
                "assignee_id": t.get("assignee_id", []),
                "assignee_email": t.get("assignee_email", ""),
                "assignee_name": t.get("assignee_name", ""),
            }
            for t in created_tasks
        ],
    }
