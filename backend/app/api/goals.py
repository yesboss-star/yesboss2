import logging
import asyncio
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from ..core.database import get_database
from ..dependencies.auth import get_current_user, get_current_user_optional
from ..api.websocket import manager as ws_manager
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
    success_criteria: Optional[str] = None
    kpis: Optional[str] = None
    timeline_detail: Optional[str] = None
    dependencies: Optional[str] = None


class GoalBreakdownUpdate(BaseModel):
    success_criteria: Optional[str] = None
    kpis: Optional[str] = None
    timeline_detail: Optional[str] = None
    dependencies: Optional[str] = None
    breakdown_message: Optional[dict] = None


class GoalChatRequest(BaseModel):
    message: str
    goal_id: str


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

class CreateTasksFromSuggestions(BaseModel):
    goal_id: str
    tasks: List[dict]


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
    
    department = goal.department
    if not department:
        try:
            from ..core.intelligence import analyze_goal_department
            department = await analyze_goal_department(
                title=goal.title,
                description=goal.description or "",
                industry=""
            )
        except Exception as e:
            logger = logging.getLogger("yesboss.goals")
            logger.warning(f"AI department analysis failed, leaving unassigned: {e}")
    
    goal_doc = {
        "title": goal.title,
        "description": goal.description,
        "priority": goal.priority,
        "timeline": goal.timeline,
        "department": department,
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
    
    asyncio.create_task(ws_manager.broadcast_to_organization(
        {"type": "goal_created", "data": goal_doc},
        org_id
    ))
    
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

    task_pipeline = [
        {"$match": {"organization_id": org_id, "goal_id": {"$ne": None, "$ne": ""}}},
        {"$group": {
            "_id": "$goal_id",
            "total": {"$sum": 1},
            "completed": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}},
            "in_progress": {"$sum": {"$cond": [{"$eq": ["$status", "in_progress"]}, 1, 0]}},
            "pending": {"$sum": {"$cond": [{"$eq": ["$status", "pending"]}, 1, 0]}},
        }}
    ]
    task_counts = list(db.tasks.aggregate(task_pipeline))
    task_map = {str(t["_id"]): t for t in task_counts}
    
    for goal in goals:
        goal["_id"] = str(goal["_id"])
        goal_id = goal["_id"]
        tc = task_map.get(goal_id, {"total": 0, "completed": 0, "in_progress": 0, "pending": 0})
        goal["progress"] = round((tc["completed"] / tc["total"] * 100) if tc["total"] > 0 else 0, 1)
        goal["task_counts"] = {
            "total": tc["total"],
            "completed": tc["completed"],
            "in_progress": tc["in_progress"],
            "pending": tc["pending"]
        }
    
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
    for i, task_data in enumerate(tasks_data):
        assignee_id = goal.get("assignee_id")
        reviewer_id = goal.get("reviewer_id")
        assign_person = assignee_id if i % 2 == 0 else reviewer_id
        task_doc = {
            "title": task_data.get("title", "Untitled Task"),
            "description": task_data.get("description", ""),
            "priority": task_data.get("priority", "medium"),
            "status": "pending",
            "goal_id": request.goal_id,
            "organization_id": goal.get("organization_id"),
            "assignee_id": assign_person or assignee_id,
            "reviewers": [reviewer_id] if reviewer_id else [],
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        result = db.tasks.insert_one(task_doc)
        task_doc["_id"] = str(result.inserted_id)
        created_tasks.append(task_doc)
        
        org_id = goal.get("organization_id")
        if org_id:
            asyncio.create_task(ws_manager.broadcast_to_organization(
                {"type": "task_created", "data": task_doc},
                org_id
            ))
            if assign_person:
                asyncio.create_task(ws_manager.send_personal_message(
                    {"type": "task_assigned", "data": task_doc},
                    assign_person
                ))
    
    return {"tasks": created_tasks}


@router.post("/create-tasks-from-suggestions")
async def create_tasks_from_suggestions(
    request: CreateTasksFromSuggestions,
    current_user = Depends(get_current_user_optional)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    goal = db.goals.find_one({"_id": ObjectId(request.goal_id)})
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    org_id = goal.get("organization_id", "")
    assignee_id = goal.get("assignee_id")
    reviewer_id = goal.get("reviewer_id")

    created_tasks = []
    for i, task_data in enumerate(request.tasks):
        assign_person = assignee_id if i % 2 == 0 else reviewer_id
        task_doc = {
            "title": task_data.get("title", "Untitled Task"),
            "description": task_data.get("description", ""),
            "priority": task_data.get("priority", "medium"),
            "status": "pending",
            "goal_id": request.goal_id,
            "organization_id": org_id,
            "assignee_id": assign_person or assignee_id,
            "reviewers": [reviewer_id] if reviewer_id else [],
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        result = db.tasks.insert_one(task_doc)
        task_doc["_id"] = str(result.inserted_id)
        created_tasks.append(task_doc)

        if org_id:
            asyncio.create_task(ws_manager.broadcast_to_organization(
                {"type": "task_created", "data": task_doc},
                org_id
            ))
            if assign_person:
                asyncio.create_task(ws_manager.send_personal_message(
                    {"type": "task_assigned", "data": task_doc},
                    assign_person
                ))

    return {"tasks": created_tasks}


@router.patch("/{goal_id}/breakdown")
async def patch_goal_breakdown(
    goal_id: str,
    update: GoalBreakdownUpdate,
    current_user = Depends(get_current_user_optional),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    update_data = {}
    for field in ["success_criteria", "kpis", "timeline_detail", "dependencies"]:
        val = getattr(update, field, None)
        if val is not None:
            update_data[field] = val

    if update.breakdown_message:
        db.goals.update_one(
            {"_id": ObjectId(goal_id)},
            {
                "$push": {"breakdown_history": update.breakdown_message},
                "$set": {"updated_at": datetime.utcnow()},
            },
        )

    if update_data:
        update_data["updated_at"] = datetime.utcnow()
        db.goals.update_one(
            {"_id": ObjectId(goal_id)},
            {"$set": update_data},
        )

        # Log pattern
        try:
            user_id = getattr(current_user, 'id', None) if current_user else None
            if user_id:
                goal = db.goals.find_one({"_id": ObjectId(goal_id)})
                if goal:
                    from ..core.prompt_engine import MasterPromptEngine
                    engine = MasterPromptEngine(db)
                    org_id = goal.get("organization_id", "")
                    for field, val in update_data.items():
                        if val and field != "updated_at":
                            await engine.log_user_pattern(
                                org_id=org_id,
                                user_id=user_id,
                                breakdown=f"{field}={val[:100] if isinstance(val, str) else val}",
                            )
        except Exception as e:
            logger = logging.getLogger("yesboss.goals")
            logger.warning(f"Failed to log user pattern: {e}")

    goal = db.goals.find_one({"_id": ObjectId(goal_id)})
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    goal["_id"] = str(goal["_id"])

    return {"goal": goal}


@router.post("/{goal_id}/chat")
async def goal_breakdown_chat(
    goal_id: str,
    request: GoalChatRequest,
    current_user = Depends(get_current_user_optional),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    goal = db.goals.find_one({"_id": ObjectId(goal_id)})
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    user_id = getattr(current_user, 'id', None) if current_user else None
    org_id = goal.get("organization_id", "")

    # Build focused prompt using the engine
    from ..core.prompt_engine import MasterPromptEngine
    from ..core.ai_client import get_chat_response

    engine = MasterPromptEngine(db)

    # Log user's question as a pattern
    if user_id and request.message:
        await engine.log_user_pattern(
            org_id=org_id,
            user_id=user_id,
            question=request.message[:200],
        )

    existing = {
        "success_criteria": goal.get("success_criteria", ""),
        "kpis": goal.get("kpis", ""),
        "timeline_detail": goal.get("timeline_detail", ""),
        "dependencies": goal.get("dependencies", ""),
    }

    probing = await engine.generate_probing_questions(
        goal_title=goal.get("title", ""),
        org_id=org_id,
        user_id=user_id,
        existing_fields=existing,
    )

    context = await engine.build_prompt(
        org_id=org_id,
        user_id=user_id,
        goal_id=goal_id,
        agent_type="goal_architect",
    )

    # Build conversation history from goal breakdown_history
    history = goal.get("breakdown_history", [])
    conversation = []
    for msg in history[-10:]:
        conversation.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})

    # Track if enough goal details exist to generate task suggestions
    has_goal_details = bool(
        goal.get("success_criteria") or goal.get("kpis") or goal.get("timeline_detail")
    )

    system_prompt = (
        "You are a Goal Architect AI. Be concise. Ask ONE short, specific question at a time to understand the goal. "
        "Keep responses under 3 sentences. User answers should also be kept specific.\n\n"
        "After your short response, include a JSON block with any field updates:\n"
        "---GOAL_UPDATE---\n"
        '{"success_criteria": "...", "kpis": "...", '
        '"timeline_detail": "...", "dependencies": "..."}\n'
        "---END_GOAL_UPDATE---\n\n"
        "Only include fields that were discussed. Use empty string for unchanged.\n\n"
    )

    if has_goal_details:
        system_prompt += (
            "Now suggest 3-5 actionable sub-tasks to achieve this goal.\n"
            "After the GOAL_UPDATE block, add:\n"
            "---TASK_SUGGESTIONS---\n"
            '[{"title": "Brief task", "description": "One-line detail", "priority": "medium"}, ...]\n'
            "---END_TASK_SUGGESTIONS---\n"
        )
    else:
        system_prompt += (
            "The goal needs more detail. Ask ONE specific question at a time (e.g. if hiring: "
            "\"Which department?\" → user replies → \"What position?\" → user replies → \"Salary range?\"). "
            "Never ask multiple questions in one message. Stay concise. "
            "Do NOT generate task suggestions until success_criteria is filled."
        )

    user_prompt = f"{context}\n\nGoal title: {goal.get('title')}\n\nUser message: {request.message}\n\nProbing questions to consider: {probing}"

    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(conversation)
    messages.append({"role": "user", "content": user_prompt})

    ai_response = ""
    try:
        ai_response = await get_chat_response(
            messages=messages,
            provider="xai",
            temperature=0.7,
            max_tokens=1500,
        )
    except Exception as e:
        logger = logging.getLogger("yesboss.goals")
        logger.error(f"Goal chat AI failed: {e}")
        ai_response = (
            f"I'm analyzing your goal **{goal.get('title', '')}**. "
            f"Could you tell me more about what you'd like to refine?"
        )

    # Parse structured data from AI response
    import re
    import json

    cleaned_response = ai_response
    structured_update = {}
    task_suggestions = []
    match = re.search(
        r"---GOAL_UPDATE---\s*(\{.*?\})\s*---END_GOAL_UPDATE---",
        ai_response,
        re.DOTALL,
    )
    if match:
        try:
            structured_update = json.loads(match.group(1))
            cleaned_response = ai_response.replace(match.group(0), "").strip()
        except json.JSONDecodeError:
            pass

    task_match = re.search(
        r"---TASK_SUGGESTIONS---\s*(\[.*?\])\s*---END_TASK_SUGGESTIONS---",
        cleaned_response,
        re.DOTALL,
    )
    if task_match:
        try:
            task_suggestions = json.loads(task_match.group(1))
            if isinstance(task_suggestions, list):
                for t in task_suggestions:
                    t.setdefault("priority", "medium")
                    t.setdefault("description", "")
                task_suggestions = task_suggestions[:10]
            cleaned_response = cleaned_response.replace(task_match.group(0), "").strip()
        except json.JSONDecodeError:
            pass

    # Update goal with parsed fields and add to breakdown history
    update_data = {"updated_at": datetime.utcnow()}
    for field in ["success_criteria", "kpis", "timeline_detail", "dependencies"]:
        if field in structured_update and structured_update[field]:
            update_data[field] = structured_update[field]

    if update_data:
        db.goals.update_one(
            {"_id": ObjectId(goal_id)},
            {
                "$set": update_data,
                "$push": {
                    "breakdown_history": {
                        "role": "user",
                        "content": request.message,
                        "timestamp": datetime.utcnow().isoformat(),
                    }
                },
            },
        )
        db.goals.update_one(
            {"_id": ObjectId(goal_id)},
            {
                "$push": {
                    "breakdown_history": {
                        "role": "assistant",
                        "content": cleaned_response,
                        "timestamp": datetime.utcnow().isoformat(),
                    }
                }
            },
        )

    # Log pattern for breakdown fields
    if user_id and structured_update:
        for field, val in structured_update.items():
            if val:
                await engine.log_user_pattern(
                    org_id=org_id,
                    user_id=user_id,
                    breakdown=f"{field}={val[:100]}",
                )

    updated_goal = db.goals.find_one({"_id": ObjectId(goal_id)})
    if updated_goal:
        updated_goal["_id"] = str(updated_goal["_id"])

    return {
        "response": cleaned_response,
        "probing_questions": probing,
        "structured_update": structured_update,
        "task_suggestions": task_suggestions,
        "goal": updated_goal,
    }