import asyncio
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List, Union
from datetime import datetime
from ..core.database import get_database
from ..dependencies.auth import get_current_user_optional
from ..api.websocket import manager as ws_manager
from ..core.zoho import ZohoMailTasks, ZohoOAuth
from bson import ObjectId

router = APIRouter()


def get_user_org_id(user) -> Optional[str]:
    if hasattr(user, 'user_metadata') and user.user_metadata:
        return user.user_metadata.get("organization_id")
    return None


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
            assignee_token = await zoho.get_valid_token(email)
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


def _normalize_assignee_ids(v):
    if v is None:
        return None
    if isinstance(v, str):
        return [v]
    return list(v)

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    priority: str = "medium"
    goal_id: Optional[str] = None
    assignee_id: Optional[Union[str, List[str]]] = None
    assignee_email: Optional[str] = None
    department: Optional[str] = None
    due_date: Optional[str] = None
    dependencies: Optional[List[str]] = None
    reviewers: Optional[List[str]] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    assignee_id: Optional[Union[str, List[str]]] = None
    due_date: Optional[str] = None
    dependencies: Optional[List[str]] = None
    reviewers: Optional[List[str]] = None


class TaskComment(BaseModel):
    content: str


@router.post("")
async def create_task(task: TaskCreate, organization_id: Optional[str] = None, current_user = Depends(get_current_user_optional)):
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
        "due_date": task.due_date,
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
    asyncio.create_task(sync_task_to_zoho(db, task_doc, org_id))

    for aid in assignee_ids:
        asyncio.create_task(ws_manager.send_personal_message(
            {"type": "task_assigned", "data": task_doc},
            aid
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
    
    return {"task": task_doc}


@router.get("")
async def list_tasks(
    goal_id: Optional[str] = None,
    assignee_id: Optional[str] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    department: Optional[str] = None,
    organization_id: Optional[str] = None,
    overdue: bool = Query(False),
    escalation_level: Optional[int] = Query(None),
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
        now = datetime.utcnow()
        query["due_date"] = {"$lt": now.isoformat()}
        query["status"] = {"$nin": ["completed", "approved"]}
    if priority:
        query["priority"] = priority
    if department:
        query["department"] = department
    if escalation_level is not None:
        query["escalation_level"] = escalation_level
    
    tasks = list(db.tasks.find(query).sort("created_at", -1))
    
    for task in tasks:
        task["_id"] = str(task["_id"])
        raw = task.get("assignee_id")
        if isinstance(raw, str):
            task["assignee_id"] = [raw]
        elif raw is None:
            task["assignee_id"] = []
    
    return {"tasks": tasks}


@router.get("/{task_id}")
async def get_task(task_id: str, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    task = db.tasks.find_one({"_id": ObjectId(task_id)})
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
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
    org_id = old_obj.get("organization_id", "") if old_obj else ""

    update_data = {}
    for k, v in task.model_dump().items():
        if v is None:
            continue
        if k == "assignee_id":
            update_data[k] = _normalize_assignee_ids(v) or []
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
    
    if org_id:
        asyncio.create_task(sync_task_to_zoho(db, task_obj, org_id, old_obj))

        asyncio.create_task(ws_manager.broadcast_to_organization(
            {"type": "task_updated", "data": task_obj},
            org_id
        ))

        if task.status and task_obj.get("assignee_id"):
            status_title = task.status.replace("_", " ").title()
            for aid in task_obj["assignee_id"]:
                asyncio.create_task(create_notification(
                    user_id=aid,
                    org_id=org_id,
                    type="task_status",
                    title=f"Task {status_title}",
                    message=f"Task '{task_obj.get('title')}' is now {task.status}",
                    link=f"/tasks/{task_id}",
                    email=task_obj.get("assignee_email"),
                ))
    
    return {"task": task_obj}


@router.delete("/{task_id}")
async def delete_task(task_id: str, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    task = db.tasks.find_one({"_id": ObjectId(task_id)})
    if task:
        raw_assignees = task.get("assignee_id", [])
        if isinstance(raw_assignees, str):
            raw_assignees = [raw_assignees]
        assignee_email = task.get("assignee_email")
        org_id = task.get("organization_id", "")

        zoho_group_id = task.get("zoho_group_task_id")
        zoho_personal_id = task.get("zoho_personal_task_id")
        if zoho_group_id or zoho_personal_id:
            asyncio.create_task(delete_zoho_task(task, org_id))

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
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    task = db.tasks.find_one({"_id": ObjectId(task_id)})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
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
    
    return {"task": task_obj}


@router.post("/{task_id}/complete")
async def complete_task(task_id: str, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    task = db.tasks.find_one({"_id": ObjectId(task_id)})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
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
    
    return {"task": task_obj}