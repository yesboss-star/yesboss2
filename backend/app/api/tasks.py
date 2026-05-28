from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from ..core.database import get_database
from ..dependencies.auth import get_current_user_optional
from bson import ObjectId

router = APIRouter()


def get_user_org_id(user) -> Optional[str]:
    if hasattr(user, 'user_metadata') and user.user_metadata:
        return user.user_metadata.get("organization_id")
    return None


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    priority: str = "medium"
    goal_id: Optional[str] = None
    assignee_id: Optional[str] = None
    department: Optional[str] = None
    due_date: Optional[str] = None
    dependencies: Optional[List[str]] = None
    reviewers: Optional[List[str]] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    assignee_id: Optional[str] = None
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
    
    task_doc = {
        "title": task.title,
        "description": task.description,
        "priority": task.priority,
        "status": "pending",
        "goal_id": task.goal_id,
        "assignee_id": task.assignee_id,
        "department": task.department,
        "due_date": task.due_date,
        "dependencies": task.dependencies or [],
        "reviewers": task.reviewers or [],
        "organization_id": org_id,
        "created_by": user_id,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    
    result = db.tasks.insert_one(task_doc)
    task_doc["_id"] = str(result.inserted_id)
    
    return {"task": task_doc}


@router.get("")
async def list_tasks(
    goal_id: Optional[str] = None,
    assignee_id: Optional[str] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    department: Optional[str] = None,
    organization_id: Optional[str] = None,
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
        query["assignee_id"] = assignee_id
    if status:
        query["status"] = status
    if priority:
        query["priority"] = priority
    if department:
        query["department"] = department
    
    tasks = list(db.tasks.find(query).sort("created_at", -1))
    
    for task in tasks:
        task["_id"] = str(task["_id"])
    
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
    
    comments = list(db.task_comments.find({"task_id": task_id}).sort("created_at", 1))
    for comment in comments:
        comment["_id"] = str(comment["_id"])
    
    return {"task": task, "comments": comments}


@router.put("/{task_id}")
async def update_task(task_id: str, task: TaskUpdate, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    update_data = {k: v for k, v in task.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    
    db.tasks.update_one(
        {"_id": ObjectId(task_id)},
        {"$set": update_data}
    )
    
    task_obj = db.tasks.find_one({"_id": ObjectId(task_id)})
    task_obj["_id"] = str(task_obj["_id"])
    
    return {"task": task_obj}


@router.delete("/{task_id}")
async def delete_task(task_id: str, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
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
    
    return {"task": task_obj}