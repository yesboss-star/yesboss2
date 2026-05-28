import logging
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from ..core.database import get_database
from ..dependencies.auth import get_current_user, get_current_user_optional
from bson import ObjectId

router = APIRouter()


class GoalCreate(BaseModel):
    title: str
    description: Optional[str] = None
    priority: str = "medium"
    timeline: Optional[str] = None
    department: Optional[str] = None
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    reviewer_id: Optional[str] = None
    reviewer_name: Optional[str] = None
    organization_id: Optional[str] = None


class GoalUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    timeline: Optional[str] = None
    department: Optional[str] = None
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    reviewer_id: Optional[str] = None
    reviewer_name: Optional[str] = None
    status: Optional[str] = None


class GoalSuggestionsRequest(BaseModel):
    industry: str
    micro_vertical: Optional[str] = None
    count: int = 5


class DepartmentAnalysisRequest(BaseModel):
    title: str
    description: Optional[str] = None
    industry: Optional[str] = None


class TaskGenerate(BaseModel):
    goal_id: str
    count: int = 5


def get_user_org_id(user) -> Optional[str]:
    if user and hasattr(user, 'user_metadata') and user.user_metadata:
        return user.user_metadata.get("organization_id")
    return None


@router.post("")
async def create_goal(goal: GoalCreate, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    org_id = goal.organization_id or get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")
    
    user_id = getattr(current_user, 'id', None) if current_user else None
    
    goal_doc = {
        "title": goal.title,
        "description": goal.description,
        "priority": goal.priority,
        "timeline": goal.timeline,
        "department": goal.department,
        "assignee_id": goal.assignee_id,
        "assignee_name": goal.assignee_name,
        "reviewer_id": goal.reviewer_id,
        "reviewer_name": goal.reviewer_name,
        "organization_id": org_id,
        "created_by": user_id,
        "status": "active",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    
    result = db.goals.insert_one(goal_doc)
    goal_doc["_id"] = str(result.inserted_id)
    
    return {"goal": goal_doc}


@router.get("")
async def list_goals(
    department: Optional[str] = None,
    priority: Optional[str] = None,
    status: Optional[str] = None,
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
    if department:
        query["department"] = department
    if priority:
        query["priority"] = priority
    if status:
        query["status"] = status
    
    goals = list(db.goals.find(query).sort("created_at", -1))
    
    for goal in goals:
        goal["_id"] = str(goal["_id"])
    
    return {"goals": goals}


@router.get("/{goal_id}")
async def get_goal(goal_id: str, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    goal = db.goals.find_one({"_id": ObjectId(goal_id)})
    
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    goal["_id"] = str(goal["_id"])
    
    tasks = list(db.tasks.find({"goal_id": goal_id}))
    for task in tasks:
        task["_id"] = str(task["_id"])
    
    return {"goal": goal, "tasks": tasks}


@router.put("/{goal_id}")
async def update_goal(goal_id: str, goal: GoalUpdate, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    update_data = {k: v for k, v in goal.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    
    db.goals.update_one(
        {"_id": ObjectId(goal_id)},
        {"$set": update_data}
    )
    
    goal = db.goals.find_one({"_id": ObjectId(goal_id)})
    goal["_id"] = str(goal["_id"])
    
    return {"goal": goal}


@router.delete("/{goal_id}")
async def delete_goal(goal_id: str, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    db.goals.delete_one({"_id": ObjectId(goal_id)})
    db.tasks.delete_many({"goal_id": goal_id})
    
    return {"success": True, "message": "Goal deleted"}


@router.post("/suggestions")
async def suggest_goals(request: GoalSuggestionsRequest):
    try:
        from ..core.intelligence import generate_goal_suggestions
        suggestions = await generate_goal_suggestions(
            industry=request.industry,
            micro_vertical=request.micro_vertical or "",
            count=request.count
        )
        return {"suggestions": suggestions}
    except Exception as e:
        logger = logging.getLogger("yesboss.goals")
        logger.error(f"Goal suggestions failed: {e}")
        return {"suggestions": []}


@router.post("/analyze-department")
async def analyze_department(request: DepartmentAnalysisRequest):
    try:
        from ..core.intelligence import analyze_goal_department
        department = await analyze_goal_department(
            title=request.title,
            description=request.description or "",
            industry=request.industry or ""
        )
        return {"department": department}
    except Exception as e:
        logger = logging.getLogger("yesboss.goals")
        logger.error(f"Department analysis failed: {e}")
        return {"department": ""}


@router.post("/generate-tasks")
async def generate_tasks_from_goal(request: TaskGenerate, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    goal = db.goals.find_one({"_id": ObjectId(request.goal_id)})
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    try:
        from ..core.intelligence import generate_tasks_from_goal
        tasks_data = await generate_tasks_from_goal(
            goal_title=goal.get("title", ""),
            goal_description=goal.get("description", ""),
            count=request.count
        )
    except Exception as e:
        tasks_data = [
            {"title": f"Task {i+1} for {goal.get('title')}", "description": "AI task generation failed - create manually", "priority": "medium"}
            for i in range(request.count)
        ]
    
    created_tasks = []
    for task_data in tasks_data:
        task_doc = {
            "title": task_data.get("title", "Untitled Task"),
            "description": task_data.get("description", ""),
            "priority": task_data.get("priority", "medium"),
            "status": "pending",
            "goal_id": request.goal_id,
            "organization_id": goal.get("organization_id"),
            "assignee_id": goal.get("assignee_id"),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        result = db.tasks.insert_one(task_doc)
        task_doc["_id"] = str(result.inserted_id)
        created_tasks.append(task_doc)
    
    return {"tasks": created_tasks}