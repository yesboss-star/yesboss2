import logging
import asyncio
import re
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Union
from datetime import datetime
from ..core.database import get_database
from ..dependencies.auth import get_current_user, get_current_user_optional
from ..api.websocket import manager as ws_manager
from bson import ObjectId

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


async def create_notification(user_id: str, org_id: str, type: str, title: str, message: str, link: str = None, actor_id: str = None, actor_name: str = None, metadata: dict = None, email: str = None):
    from ..core.notification_service import create_and_deliver
    await create_and_deliver(user_id, org_id, type, title, message, link, actor_id, actor_name, metadata, email=email)


def _normalize_list(v):
    if v is None:
        return None
    if isinstance(v, str):
        return [v]
    return list(v)


class GoalCreate(BaseModel):
    title: str
    description: Optional[str] = None
    priority: str = "medium"
    timeline: Optional[str] = None
    due_date: Optional[str] = None
    department: Optional[str] = None
    assignee_id: Optional[Union[str, List[str]]] = None
    assignee_name: Optional[Union[str, List[str]]] = None
    assignee_email: Optional[str] = None
    reviewer_id: Optional[Union[str, List[str]]] = None
    reviewer_name: Optional[Union[str, List[str]]] = None
    organization_id: Optional[str] = None
    goal_type: Optional[str] = None          # "short_term" | "long_term"
    duration: Optional[str] = None           # "one_time" | "continuous"
    end_date: Optional[str] = None           # optional end for continuous goals
    parent_goal_id: Optional[str] = None     # if sub-goal, points to parent
    is_default: bool = False
    industry: Optional[str] = None
    micro_vertical: Optional[str] = None


class GoalUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    timeline: Optional[str] = None
    due_date: Optional[str] = None
    department: Optional[str] = None
    assignee_id: Optional[Union[str, List[str]]] = None
    assignee_name: Optional[Union[str, List[str]]] = None
    reviewer_id: Optional[Union[str, List[str]]] = None
    reviewer_name: Optional[Union[str, List[str]]] = None
    status: Optional[str] = None
    success_criteria: Optional[str] = None
    kpis: Optional[str] = None
    timeline_detail: Optional[str] = None
    dependencies: Optional[str] = None
    goal_type: Optional[str] = None
    duration: Optional[str] = None
    end_date: Optional[str] = None
    parent_goal_id: Optional[str] = None
    is_default: Optional[bool] = None
    industry: Optional[str] = None
    micro_vertical: Optional[str] = None
    review_feedback: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None


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


class SelectStrategyRequest(BaseModel):
    strategy_index: int
    organization_id: Optional[str] = None


class GoalBreakdownRequest(BaseModel):
    title: str
    description: Optional[str] = ""
    industry: Optional[str] = ""
    micro_vertical: Optional[str] = ""
    goal_type: Optional[str] = "short_term"
    department: Optional[str] = ""


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


async def _is_org_owner(db, org_id: str, user_id: str) -> bool:
    """Check if user_id is the primary owner or a co-owner of the org."""
    org = db.organizations.find_one(
        {"_id": ObjectId(org_id) if ObjectId.is_valid(org_id) else org_id},
        {"owner_id": 1, "co_owners": 1}
    )
    if not org:
        return False
    if org.get("owner_id") == user_id:
        return True
    if user_id in (org.get("co_owners") or []):
        return True
    return False


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
    
    assignee_ids = _normalize_list(goal.assignee_id) or []
    assignee_names = _normalize_list(goal.assignee_name) or []
    reviewer_ids = _normalize_list(goal.reviewer_id) or []
    reviewer_names = _normalize_list(goal.reviewer_name) or []
    
    parent_goal_id = goal.parent_goal_id or None
    
    goal_doc = {
        "title": goal.title,
        "description": goal.description,
        "priority": goal.priority,
        "timeline": goal.timeline,
        "due_date": goal.due_date,
        "department": department,
        "assignee_id": assignee_ids,
        "assignee_name": assignee_names,
        "assignee_email": goal.assignee_email,
        "reviewer_id": reviewer_ids,
        "reviewer_name": reviewer_names,
        "organization_id": org_id,
        "created_by": user_id,
        "status": "active",
        "goal_type": goal.goal_type or "short_term",
        "duration": goal.duration or "one_time",
        "end_date": goal.end_date,
        "parent_goal_id": parent_goal_id,
        "sub_goal_ids": [],
        "is_default": goal.is_default,
        "industry": goal.industry or "",
        "micro_vertical": goal.micro_vertical or "",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    
    result = db.goals.insert_one(goal_doc)
    goal_doc["_id"] = str(result.inserted_id)
    child_id_str = str(result.inserted_id)

    # Link to parent goal after insert (child ID must be known)
    if parent_goal_id and ObjectId.is_valid(parent_goal_id):
        existing_subs = (db.goals.find_one({"_id": ObjectId(parent_goal_id)}) or {}).get("sub_goal_ids") or []
        if child_id_str not in existing_subs:
            existing_subs.append(child_id_str)
            db.goals.update_one(
                {"_id": ObjectId(parent_goal_id)},
                {"$set": {"sub_goal_ids": existing_subs}}
            )
    
    asyncio.create_task(ws_manager.broadcast_to_organization(
        {"type": "goal_created", "data": goal_doc},
        org_id
    ))

    if user_id:
        asyncio.create_task(create_notification(
            user_id=user_id,
            org_id=org_id,
            type="goal_created",
            title="Goal Created",
            message=f"Goal created: {goal.title}",
            link=f"/goals/{result.inserted_id}",
        ))

    for aid in assignee_ids:
        if aid != user_id:
            asyncio.create_task(create_notification(
                user_id=aid,
                org_id=org_id,
                type="goal_assigned",
                title="New Goal Assigned",
                message=f"Goal assigned: {goal.title}",
                link=f"/goals/{result.inserted_id}",
                actor_id=user_id,
                email=goal.assignee_email,
            ))
    
    from ..agents.frequency_agent import process_goal as _freq_goal
    asyncio.create_task(_freq_goal(goal_doc, org_id))
    
    return {"goal": goal_doc}


@router.get("")
async def list_goals(
    department: Optional[str] = None,
    priority: Optional[str] = None,
    status: Optional[str] = None,
    goal_type: Optional[str] = None,
    duration: Optional[str] = None,
    parent_goal_id: Optional[str] = None,
    is_default: Optional[bool] = None,
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
    if goal_type:
        query["goal_type"] = goal_type
    if duration:
        query["duration"] = duration
    if parent_goal_id:
        query["parent_goal_id"] = parent_goal_id
    if is_default is not None:
        query["is_default"] = is_default
    
    if current_user and getattr(current_user, 'id', None):
        if await _is_org_owner(db, org_id, current_user.id):
            query["created_by"] = current_user.id
    
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
        for f in ("assignee_id", "assignee_name", "reviewer_id", "reviewer_name"):
            raw = goal.get(f)
            if isinstance(raw, str):
                goal[f] = [raw]
            elif raw is None:
                goal[f] = []
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


@router.post("/suggest-breakdown")
async def suggest_goal_breakdown(request: GoalBreakdownRequest):
    """Suggest sub-goals and tasks for a goal based on its title/description."""
    try:
        from ..core.ai_client import get_ai_response
        import json, re

        prompt = (
            f"Analyze this goal and suggest how to break it down into sub-goals and tasks.\n\n"
            f"Title: {request.title}\n"
            f"Description: {request.description}\n"
            f"Industry: {request.industry}\n"
            f"Micro-vertical: {request.micro_vertical}\n"
            f"Goal type: {request.goal_type}\n"
            f"Department: {request.department}\n\n"
            "Return a JSON object with two arrays:\n"
            "1. 'sub_goals': only if goal_type is 'long_term' — 2-4 short-term sub-goals that break this down. Each has: title, description, department, priority, suggested_timeline\n"
            "2. 'tasks': 3-5 concrete tasks needed to make progress. Each has: title, description, priority (high/medium/low), assignee_hint (what role should do this)\n\n"
            "Example:\n"
            '{"sub_goals": [{"title": "...", "description": "...", "department": "Engineering", "priority": "high", "suggested_timeline": "2 months"}], "tasks": [{"title": "...", "description": "...", "priority": "medium", "assignee_hint": "Developer"}]}\n\n'
            "Return ONLY valid JSON. No markdown."
        )

        raw = await get_ai_response(
            prompt=prompt,
            system_prompt="You are a goal-breakdown specialist. Return ONLY valid JSON. No markdown.",
            temperature=0.3,
            max_tokens=2500,
        )

        cleaned = raw.strip()
        cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned)
        cleaned = re.sub(r'\s*```$', '', cleaned)
        start = cleaned.find('{')
        end = cleaned.rfind('}') + 1
        if start >= 0 and end > start:
            cleaned = cleaned[start:end]
        data = json.loads(cleaned)
        sub_goals = (data.get("sub_goals") or [])[:4] if request.goal_type == "long_term" else []
        tasks = (data.get("tasks") or [])[:5]
        for s in sub_goals:
            s.setdefault("department", request.department or "")
            s.setdefault("priority", "medium")
        for t in tasks:
            t.setdefault("priority", "medium")
        return {"sub_goals": sub_goals, "tasks": tasks}
    except Exception as e:
        logger = logging.getLogger("yesboss.goals")
        logger.warning(f"Failed to suggest goal breakdown: {e}")
        return {"sub_goals": [], "tasks": []}


@router.get("/{goal_id}")
async def get_goal(goal_id: str, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    goal = db.goals.find_one({"_id": ObjectId(goal_id)})
    
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    if current_user and getattr(current_user, 'id', None):
        org_id = goal.get("organization_id", "")
        if await _is_org_owner(db, org_id, current_user.id):
            if goal.get("created_by") != current_user.id:
                raise HTTPException(status_code=403, detail="Access denied: this goal belongs to another owner")
    
    goal["_id"] = str(goal["_id"])
    for f in ("assignee_id", "assignee_name", "reviewer_id", "reviewer_name"):
        raw = goal.get(f)
        if isinstance(raw, str):
            goal[f] = [raw]
        elif raw is None:
            goal[f] = []
    
    # Attach parent goal breadcrumb for sub-goals
    parent_goal = None
    parent_id = goal.get("parent_goal_id")
    if parent_id:
        pg = db.goals.find_one({"_id": ObjectId(parent_id)}, {"title": 1})
        if pg:
            parent_goal = {"id": str(pg["_id"]), "title": pg.get("title")}
    goal["parent_goal"] = parent_goal
    
    # Attach sub-goals list
    sub_ids = goal.get("sub_goal_ids") or []
    sub_goals = list(db.goals.find(
        {"_id": {"$in": [ObjectId(sid) for sid in sub_ids if ObjectId.is_valid(sid)]}},
        {"title": 1, "status": 1, "goal_type": 1}
    ))
    goal["sub_goals"] = [{"id": str(s["_id"]), "title": s.get("title"), "status": s.get("status"), "goal_type": s.get("goal_type")} for s in sub_goals]
    
    tasks = list(db.tasks.find({"goal_id": goal_id}))
    for task in tasks:
        task["_id"] = str(task["_id"])
    
    return {"goal": goal, "tasks": tasks}


@router.post("/{goal_id}/suggest-children")
async def suggest_child_goals(goal_id: str, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    goal = db.goals.find_one({"_id": ObjectId(goal_id)})
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    title = goal.get("title", "")
    description = goal.get("description", "")
    industry = goal.get("industry", "")
    micro_vertical = goal.get("micro_vertical", "")
    department = goal.get("department", "")

    prompt = (
        f"Based on this parent goal, suggest 4 specific child goals (short-term milestones) that would help achieve it.\n\n"
        f"Parent Goal: {title}\n"
        f"Description: {description}\n"
        f"Industry: {industry}\n"
        f"Micro-vertical: {micro_vertical}\n"
        f"Department: {department}\n\n"
        "Return a JSON array ONLY. Each item must have: title, description, department, priority (high/medium/low), suggested_timeline.\n"
        "Make each child goal concrete, actionable, and directly contributing to the parent goal."
    )

    try:
        from ..core.ai_client import get_ai_response
        import json, re

        raw = await get_ai_response(
            prompt=prompt,
            system_prompt="You are a goal-decomposition specialist. Return ONLY a valid JSON array. No markdown.",
            temperature=0.4,
            max_tokens=2000,
        )
        cleaned = raw.strip()
        cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned)
        cleaned = re.sub(r'\s*```$', '', cleaned)
        start = cleaned.find('[')
        end = cleaned.rfind(']') + 1
        if start >= 0 and end > start:
            cleaned = cleaned[start:end]
        suggestions = json.loads(cleaned)
        if not isinstance(suggestions, list):
            suggestions = []
        for s in suggestions:
            s.setdefault("department", department or "")
            s.setdefault("priority", "medium")
        return {"suggestions": suggestions[:6]}
    except Exception as e:
        logger = logging.getLogger("yesboss.goals")
        logger.warning(f"Failed to suggest child goals: {e}")
        return {"suggestions": []}


@router.put("/{goal_id}")
async def update_goal(goal_id: str, goal: GoalUpdate, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    update_data = {}
    for k, v in goal.model_dump().items():
        if v is None:
            continue
        if k in ("assignee_id", "assignee_name", "reviewer_id", "reviewer_name"):
            update_data[k] = _normalize_list(v) or []
        else:
            update_data[k] = v
    update_data["updated_at"] = datetime.utcnow()
    
    db.goals.update_one(
        {"_id": ObjectId(goal_id)},
        {"$set": update_data}
    )
    
    goal = db.goals.find_one({"_id": ObjectId(goal_id)})
    goal["_id"] = str(goal["_id"])
    for f in ("assignee_id", "assignee_name", "reviewer_id", "reviewer_name"):
        raw = goal.get(f)
        if isinstance(raw, str):
            goal[f] = [raw]
        elif raw is None:
            goal[f] = []

    asyncio.create_task(ws_manager.broadcast_to_organization(
        {"type": "goal_updated", "data": goal},
        goal.get("organization_id", "")
    ))

    # If goal was moved to pending_review, notify the owner who created it
    if update_data.get("status") == "pending_review":
        created_by = goal.get("created_by")
        assignee_names = goal.get("assignee_name") or []
        submitter = assignee_names[0] if assignee_names else "An assignee"
        asyncio.create_task(create_notification(
            user_id=created_by or "",
            org_id=goal.get("organization_id", ""),
            type="goal_pending_review",
            title="Goal Ready for Review",
            message=f"{submitter} marked goal '{goal.get('title')}' as complete. Review it now.",
            link=f"/goals/{goal_id}",
        ))

    assignee_ids = goal.get("assignee_id") or []
    if goal.get("status") and assignee_ids:
        for aid in assignee_ids:
            asyncio.create_task(create_notification(
                user_id=aid,
                org_id=goal.get("organization_id", ""),
                type="goal_status",
                title=f"Goal Status: {goal['status'].title()}",
                message=f"Goal '{goal.get('title')}' status updated to {goal['status']}",
                link=f"/goals/{goal_id}",
                email=goal.get("assignee_email"),
            ))

    if goal.get("created_by") and assignee_ids:
        for aid in assignee_ids:
            if goal["created_by"] != aid:
                asyncio.create_task(create_notification(
                    user_id=goal["created_by"],
                    org_id=goal.get("organization_id", ""),
                    type="goal_status",
                    title=f"Goal Status: {goal['status'].title()}",
                    message=f"Goal '{goal.get('title')}' updated to {goal['status']}",
                    link=f"/goals/{goal_id}",
                ))
    
    from ..agents.frequency_agent import process_goal as _freq_goal
    asyncio.create_task(_freq_goal(goal, goal.get("organization_id", "")))
    
    return {"goal": goal}


class ReviewRequest(BaseModel):
    action: str  # "approve" | "reject"
    feedback: Optional[str] = None


@router.post("/{goal_id}/review")
async def review_goal(goal_id: str, request: ReviewRequest, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    goal = db.goals.find_one({"_id": ObjectId(goal_id)})
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    org_id = goal.get("organization_id", "")
    user_id = getattr(current_user, 'id', None) if current_user else None
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    if request.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="Action must be 'approve' or 'reject'")

    if goal.get("status") != "pending_review":
        raise HTTPException(status_code=400, detail=f"Goal is in '{goal.get('status')}' state, not 'pending_review'")

    if request.action == "approve":
        update = {
            "status": "completed",
            "reviewed_by": user_id,
            "reviewed_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow(),
        }
    else:
        update = {
            "status": "active",
            "review_feedback": request.feedback,
            "updated_at": datetime.utcnow(),
        }

    db.goals.update_one({"_id": ObjectId(goal_id)}, {"$set": update})

    goal = db.goals.find_one({"_id": ObjectId(goal_id)})
    goal["_id"] = str(goal["_id"])
    for f in ("assignee_id", "assignee_name", "reviewer_id", "reviewer_name"):
        raw = goal.get(f)
        if isinstance(raw, str):
            goal[f] = [raw]
        elif raw is None:
            goal[f] = []

    # Notify assignees
    assignee_ids = goal.get("assignee_id") or []
    created_by = goal.get("created_by")
    notified = set()

    if request.action == "approve":
        msg = f"Goal '{goal.get('title')}' has been approved and marked complete"
        notif_type = "goal_approved"
    else:
        msg = f"Goal '{goal.get('title')}' was sent back with feedback: {request.feedback}" if request.feedback else f"Goal '{goal.get('title')}' was sent back for revisions"
        notif_type = "goal_rejected"

    for aid in assignee_ids:
        if aid and aid not in notified:
            notified.add(aid)
            asyncio.create_task(create_notification(
                user_id=aid, org_id=org_id, type=notif_type,
                title=f"Goal {request.action.title()}d", message=msg,
                link=f"/goals/{goal_id}", actor_id=user_id,
            ))

    if created_by and created_by not in notified:
        asyncio.create_task(create_notification(
            user_id=created_by, org_id=org_id, type=notif_type,
            title=f"Goal {request.action.title()}d", message=msg,
            link=f"/goals/{goal_id}",
        ))

    # On approval → record goal outcome for cross-company learning
    if request.action == "approve":
        try:
            from ..core.learning import learning
            from datetime import datetime
            created = goal.get("created_at")
            actual_days = None
            if created:
                if isinstance(created, datetime):
                    actual_days = (datetime.utcnow() - created).days
                elif isinstance(created, str):
                    try:
                        c = datetime.fromisoformat(created.replace("Z", "+00:00"))
                        actual_days = (datetime.utcnow() - c).days
                    except Exception:
                        pass
            learning.record_goal_outcome(org_id, {
                "goal_id": goal_id,
                "goal_title": goal.get("title"),
                "goal_type": goal.get("goal_type"),
                "duration": goal.get("duration"),
                "department": goal.get("department"),
                "priority": goal.get("priority"),
                "industry": goal.get("industry", ""),
                "micro_vertical": goal.get("micro_vertical", ""),
                "status": "completed",
                "completion_reviewed": True,
                "actual_duration_days": actual_days,
                "estimated_duration_days": goal.get("estimated_duration_days"),
                "was_delayed": actual_days > 30 if actual_days else False,
                "completed_at": datetime.utcnow().isoformat(),
                "created_at": created.isoformat() if isinstance(created, datetime) else created,
            })
        except Exception as e:
            logger = __import__("logging").getLogger("yesboss.goals")
            logger.warning(f"Failed to record goal outcome: {e}")

    asyncio.create_task(ws_manager.broadcast_to_organization(
        {"type": "goal_updated", "data": goal}, org_id
    ))

    from ..agents.frequency_agent import process_goal as _freq_goal
    asyncio.create_task(_freq_goal(goal, org_id))

    return {"goal": goal}


@router.delete("/{goal_id}")
async def delete_goal(goal_id: str, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    goal = db.goals.find_one({"_id": ObjectId(goal_id)})
    if goal:
        assignee_ids = goal.get("assignee_id") or []
        if isinstance(assignee_ids, str):
            assignee_ids = [assignee_ids]
        created_by = goal.get("created_by")
        notified = set()
        for aid in assignee_ids:
            if aid and aid not in notified:
                notified.add(aid)
                asyncio.create_task(create_notification(
                    user_id=aid,
                    org_id=goal.get("organization_id", ""),
                    type="goal_deleted",
                    title="Goal Deleted",
                    message=f"Goal '{goal.get('title')}' was deleted",
                    metadata={"goal_id": goal_id},
                    email=goal.get("assignee_email"),
                ))
        if created_by and created_by not in notified:
            asyncio.create_task(create_notification(
                user_id=created_by,
                org_id=goal.get("organization_id", ""),
                type="goal_deleted",
                title="Goal Deleted",
                message=f"Goal '{goal.get('title')}' was deleted",
                metadata={"goal_id": goal_id},
            ))
    
    db.goals.delete_one({"_id": ObjectId(goal_id)})
    db.tasks.delete_many({"goal_id": goal_id})
    
    return {"success": True, "message": "Goal deleted"}


class BulkDeleteDefaultGoalsRequest(BaseModel):
    organization_id: str


@router.get("/defaults")
async def get_or_generate_default_goals(
    organization_id: Optional[str] = None,
    current_user = Depends(get_current_user_optional)
):
    """Return existing default goals for the org, or generate them on-demand if none exist."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = organization_id or get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

    existing = list(db.goals.find(
        {"organization_id": org_id, "is_default": True}
    ).sort("created_at", -1))

    if existing:
        goals = []
        for g in existing:
            g["_id"] = str(g["_id"])
            goals.append(g)
        return {"goals": goals, "generated": False}

    # No defaults exist — generate them on-demand
    org = db.organizations.find_one({"_id": ObjectId(org_id)})
    industry = (org.get("industry") or "General") if org else "General"
    micro_vertical = (org.get("micro_vertical") or "") if org else ""
    owner_id = (org.get("owner_id") or getattr(current_user, 'id', None)) if org else getattr(current_user, 'id', None)

    try:
        from ..agents.default_goals_agent import generate_default_goals as _gen
        ai_goals = await _gen(industry, micro_vertical, count=5)
    except Exception as e:
        logging.getLogger("yesboss.goals").warning(f"Failed to generate default goals: {e}")
        ai_goals = []

    created = []
    for g in ai_goals:
        goal_doc = {
            "title": g["title"],
            "description": g.get("description", ""),
            "priority": g.get("priority", "medium"),
            "timeline": g.get("suggested_timeline"),
            "department": g.get("department"),
            "organization_id": org_id,
            "created_by": owner_id,
            "status": "active",
            "goal_type": g.get("goal_type", "short_term"),
            "duration": g.get("duration", "one_time"),
            "is_default": True,
            "industry": industry,
            "micro_vertical": micro_vertical,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        result = db.goals.insert_one(goal_doc)
        goal_doc["_id"] = str(result.inserted_id)
        created.append(goal_doc)

    return {"goals": created, "generated": True}


@router.post("/delete-defaults")
async def bulk_delete_default_goals(request: BulkDeleteDefaultGoalsRequest, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = request.organization_id
    user_id = getattr(current_user, 'id', None) if current_user else None

    if user_id and await _is_org_owner(db, org_id, user_id):
        query = {"organization_id": org_id, "is_default": True}
    else:
        query = {"organization_id": org_id, "is_default": True, "created_by": user_id} if user_id else {"organization_id": org_id, "is_default": True}

    default_goals = list(db.goals.find(query, {"_id": 1}))
    goal_ids = [str(g["_id"]) for g in default_goals]

    db.goals.delete_many(query)
    db.tasks.delete_many({"goal_id": {"$in": goal_ids}})

    return {"success": True, "deleted_count": len(goal_ids)}


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
    goal_assignee_ids = goal.get("assignee_id") or []
    goal_reviewer_ids = goal.get("reviewer_id") or []
    if isinstance(goal_assignee_ids, str): goal_assignee_ids = [goal_assignee_ids]
    if isinstance(goal_reviewer_ids, str): goal_reviewer_ids = [goal_reviewer_ids]
    for i, task_data in enumerate(tasks_data):
        assign_person = (goal_assignee_ids or [None])[0] if i % 2 == 0 else (goal_reviewer_ids or [None])[0]
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
        
        from ..agents.frequency_agent import process_task as _freq_task
        org_id = goal.get("organization_id")
        asyncio.create_task(_freq_task(task_doc, org_id))
        
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


@router.post("/{goal_id}/generate-strategies")
async def generate_strategies(
    goal_id: str,
    current_user = Depends(get_current_user_optional)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    goal = db.goals.find_one({"_id": ObjectId(goal_id)})
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    org_id = goal.get("organization_id", "")
    org = db.organizations.find_one({"_id": ObjectId(org_id)}) if ObjectId.is_valid(org_id) else db.organizations.find_one({"owner_id": org_id})
    industry = org.get("industry", "") if org else ""

    from ..core.ai_client import get_ai_response
    import json

    market_context = ""
    try:
        trends = list(db.market_trends.find({"organization_id": org_id}).sort("published_at", -1).limit(5))
        if trends:
            market_lines = []
            for t in trends:
                title = t.get("title", "")
                impact = t.get("growth_impact", "")
                if title:
                    market_lines.append(f"- {title}" + (f" ({impact})" if impact else ""))
            market_context = "\nRelevant market trends:\n" + "\n".join(market_lines)
        market_impact = db.market_impacts.find_one({"organization_id": org_id})
        if market_impact and market_impact.get("impacts"):
            imp_lines = []
            for imp in market_impact["impacts"][:3]:
                imp_lines.append(f"- {imp.get('title')} ({imp.get('impact_level')} impact): {imp.get('investment_recommendation', '')}")
            if imp_lines:
                market_context += "\n\nMarket impact assessment:\n" + "\n".join(imp_lines)
    except Exception:
        pass

    prompt = (
        f"Generate 2-3 distinct strategic approaches for this business goal.\n\n"
        f"Goal: {goal.get('title')}\n"
        f"Description: {goal.get('description', '')}\n"
        f"Department: {goal.get('department', '')}\n"
        f"Priority: {goal.get('priority')}\n"
        f"Timeline: {goal.get('timeline', 'Not specified')}\n"
        f"Industry: {industry}\n"
        f"{market_context}\n\n"
        f"For each strategy provide: name (short), description (1-2 sentences), "
        f"estimated_timeline (e.g. '2-3 months'), key_risks (3-5 bullet points), "
        f"expected_impact (1 sentence), resources_needed (3-5 items), "
        f"market_aligned (boolean, true if this strategy aligns with any market trend listed above).\n\n"
        f"Return as a JSON array of objects. Only return valid JSON, no markdown."
    )

    try:
        response = await get_ai_response(prompt, temperature=0.5, max_tokens=3000)
        response = response.strip()
        if response.startswith("```"):
            response = response.split("\n", 1)[-1]
            response = response.rsplit("```", 1)[0]
        strategies = json.loads(response)
        if isinstance(strategies, dict) and "strategies" in strategies:
            strategies = strategies["strategies"]
        if not isinstance(strategies, list):
            strategies = [strategies]
    except Exception as e:
        logger = logging.getLogger("yesboss.goals")
        logger.warning(f"Strategy generation failed: {e}")
        strategies = []

    db.goals.update_one(
        {"_id": ObjectId(goal_id)},
        {"$set": {
            "strategies": strategies,
            "strategy_status": "generated",
            "updated_at": datetime.utcnow(),
        }}
    )

    return {"strategies": strategies}


@router.post("/{goal_id}/select-strategy")
async def select_strategy(
    goal_id: str,
    request: SelectStrategyRequest,
    current_user = Depends(get_current_user_optional)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    goal = db.goals.find_one({"_id": ObjectId(goal_id)})
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    strategies = goal.get("strategies", [])
    if not strategies or request.strategy_index >= len(strategies):
        raise HTTPException(status_code=400, detail="Invalid strategy index")

    selected = strategies[request.strategy_index]

    from ..core.ai_client import get_ai_response
    import json

    prompt = (
        f"Convert this selected strategy into actionable tasks.\n\n"
        f"Goal: {goal.get('title')}\n"
        f"Strategy: {selected.get('name')}\n"
        f"Description: {selected.get('description')}\n"
        f"Estimated timeline: {selected.get('estimated_timeline', '')}\n\n"
        f"Generate 3-7 specific tasks. For each task provide: "
        f"title, description (1 sentence), priority (low/medium/high/urgent), "
        f"suggested_department.\n\n"
        f"Return as a JSON array of objects. Only return valid JSON, no markdown."
    )

    try:
        response = await get_ai_response(prompt, temperature=0.4, max_tokens=3000)
        response = response.strip()
        if response.startswith("```"):
            response = response.split("\n", 1)[-1]
            response = response.rsplit("```", 1)[0]
        tasks_data = json.loads(response)
        if isinstance(tasks_data, dict) and "tasks" in tasks_data:
            tasks_data = tasks_data["tasks"]
        if not isinstance(tasks_data, list):
            tasks_data = [tasks_data]
    except Exception as e:
        logger = logging.getLogger("yesboss.goals")
        logger.warning(f"Strategy task generation failed: {e}")
        tasks_data = [
            {"title": f"Task for {selected.get('name', 'strategy')}", "description": "AI task generation failed", "priority": "medium", "suggested_department": goal.get("department", "")}
        ]

    org_id = goal.get("organization_id", "")
    created_tasks = []
    for i, td in enumerate(tasks_data[:10]):
        combined = f"{td.get('title', '')} {td.get('description', '')}"
        mention_emails = resolve_mentions(combined, db, org_id)
        task_doc = {
            "title": td.get("title", "Untitled Task"),
            "description": td.get("description", ""),
            "priority": td.get("priority", "medium"),
            "status": "pending",
            "goal_id": goal_id,
            "organization_id": org_id,
            "department": td.get("suggested_department", goal.get("department", "")),
            "assignee_id": mention_emails,
            "assignee_email": mention_emails[0] if mention_emails else None,
            "reviewers": [],
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "escalation_level": 0,
            "owner_escalated": False,
            "owner_escalated_at": None,
        }
        if td.get("due_date"):
            task_doc["due_date"] = td["due_date"]
        result = db.tasks.insert_one(task_doc)
        task_doc["_id"] = str(result.inserted_id)
        created_tasks.append(task_doc)

        from ..agents.frequency_agent import process_task as _freq_task
        asyncio.create_task(_freq_task(task_doc, org_id))

        if org_id:
            asyncio.create_task(ws_manager.broadcast_to_organization(
                {"type": "task_created", "data": task_doc},
                org_id
            ))
            from ..api.tasks import sync_task_to_zoho
            asyncio.create_task(sync_task_to_zoho(db, task_doc, org_id))

    db.goals.update_one(
        {"_id": ObjectId(goal_id)},
        {"$set": {
            "selected_strategy": {"index": request.strategy_index, "name": selected.get("name")},
            "strategy_status": "tasks_created",
            "updated_at": datetime.utcnow(),
        }}
    )

    if org_id:
        owner_id = goal.get("created_by") or goal.get("assignee_id", [None])[0]
        if owner_id:
            asyncio.create_task(create_notification(
                user_id=owner_id,
                org_id=org_id,
                type="strategy_tasks_created",
                title=f"Tasks Created: {selected.get('name')}",
                message=f"{len(created_tasks)} tasks created from the '{selected.get('name')}' strategy.",
                link=f"/goals/{goal_id}",
            ))

    return {"tasks": created_tasks, "strategy": selected}


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
    goal_assignee_ids = goal.get("assignee_id") or []
    goal_reviewer_ids = goal.get("reviewer_id") or []
    if isinstance(goal_assignee_ids, str): goal_assignee_ids = [goal_assignee_ids]
    if isinstance(goal_reviewer_ids, str): goal_reviewer_ids = [goal_reviewer_ids]

    created_tasks = []
    for i, task_data in enumerate(request.tasks):
        assign_person = (goal_assignee_ids or [None])[0] if i % 2 == 0 else (goal_reviewer_ids or [None])[0]
        task_doc = {
            "title": task_data.get("title", "Untitled Task"),
            "description": task_data.get("description", ""),
            "priority": task_data.get("priority", "medium"),
            "status": "pending",
            "goal_id": request.goal_id,
            "organization_id": org_id,
            "assignee_id": assign_person or (goal_assignee_ids[0] if goal_assignee_ids else None),
            "reviewers": [goal_reviewer_ids[0]] if goal_reviewer_ids else [],
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        result = db.tasks.insert_one(task_doc)
        task_doc["_id"] = str(result.inserted_id)
        created_tasks.append(task_doc)

        from ..agents.frequency_agent import process_task as _freq_task
        asyncio.create_task(_freq_task(task_doc, org_id))

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
    for f in ("assignee_id", "assignee_name", "reviewer_id", "reviewer_name"):
        raw = goal.get(f)
        if isinstance(raw, str):
            goal[f] = [raw]
        elif raw is None:
            goal[f] = []

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

    probing = []
    if not existing.get("success_criteria"):
        probing.append("What does success look like in numbers?")
    if not existing.get("kpis"):
        probing.append("What specific KPIs track progress?")
    if not existing.get("timeline_detail"):
        probing.append("What's the target deadline and milestones?")
    if not existing.get("dependencies"):
        probing.append("What teams or resources are needed?")

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

    # Check for delete/remove goal intent before calling AI
    import re as _re
    if request.message and _re.search(r"\b(delete|remove|get\s+rid\s+of|scrap|drop)\s+(this\s+)?(goal|task)\b", request.message.lower()):
        await delete_goal(goal_id, None)
        return {"response": f"✅ **{goal.get('title', 'Goal')}** has been deleted.", "probing_questions": [], "structured_update": {}, "task_suggestions": [], "goal": None}

    system_prompt = (
        "You are an Owner's Goal Assistant. Understand first, then recommend.\n\n"
        "FLOW:\n"
        "1. If context is lacking → ask ONE question at a time using ---QUESTION_OPTIONS--- "
        "with 3-5 selectable options. Never ask multiple questions at once. "
        "Wait for the owner to answer before asking the next question.\n"
        "2. If you have enough context → give recommendations via ---SUGGESTION_CHIPS--- "
        "(2-4 chips) + ---TASK_SUGGESTIONS---.\n\n"
        "FORMAT FOR ONE QUESTION (use this when you need clarification):\n"
        "Ask a single question as text, then:\n"
        "---QUESTION_OPTIONS---\n"
        '[{"value": "option_id", "label": "Clear option (6-10 words)"}, ...]\n'
        "---END_QUESTION_OPTIONS---\n"
        "Example: 'Which area should we focus on first?' then 3-5 option chips.\n\n"
        "FORMAT FOR RECOMMENDATIONS (use when context is sufficient):\n"
        "---SUGGESTION_CHIPS---\n"
        '[{"label": "Actionable decision (6-10 words)", "value": "action_id"}, '
        '{"label": "Something else?", "value": "open_ended"}]\n'
        "---END_SUGGESTION_CHIPS---\n\n"
        "Then sub-tasks:\n"
        "---TASK_SUGGESTIONS---\n"
        '[{"title": "Sub-task title", "description": "Short context", "priority": "high"}, ...]\n'
        "---END_TASK_SUGGESTIONS---\n\n"
        "RULES:\n"
        "- Focus ONLY on this goal. Don't mix others.\n"
        "- ONE question per response. Never list multiple questions.\n"
        "- Use real names, numbers, budgets from context.\n"
        "- Check history. Never repeat chips or ideas already discussed.\n"
        "- After recommendations, optionally include GOAL_UPDATE.\n\n"
        "---GOAL_UPDATE---\n"
        '{"success_criteria": "...", "kpis": "...", '
        '"timeline_detail": "...", "dependencies": "..."}\n'
        "---END_GOAL_UPDATE---\n\n"
        "Use empty string for unchanged fields.\n"
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
            temperature=0.4,
            max_tokens=500,
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

    # Parse suggestion chips and question options from AI response
    suggestion_chips = []
    chips_match = re.search(
        r"---SUGGESTION_CHIPS---\s*(\[.*?\])\s*(?:---END_SUGGESTION_CHIPS---)?",
        cleaned_response, re.DOTALL,
    )
    if chips_match:
        try:
            chips = json.loads(chips_match.group(1))
            if isinstance(chips, list):
                suggestion_chips = chips[:6]
                cleaned_response = cleaned_response.replace(chips_match.group(0), "").strip()
        except json.JSONDecodeError:
            pass

    question_options = []
    qopt_match = re.search(
        r"---QUESTION_OPTIONS---\s*(\[.*?\])\s*(?:---END_QUESTION_OPTIONS---)?",
        cleaned_response, re.DOTALL,
    )
    if qopt_match:
        try:
            parsed_qopts = json.loads(qopt_match.group(1))
            if isinstance(parsed_qopts, list):
                question_options = parsed_qopts[:6]
                cleaned_response = cleaned_response.replace(qopt_match.group(0), "").strip()
        except json.JSONDecodeError:
            pass

    # If no structured question_options, try parsing "Options: A, B, C" from free text
    if not question_options and "Options:" in cleaned_response:
        import re as _re_opts
        opt_match = _re_opts.search(r"(?:^|\n)(?:\d+[.)]\s*)?Options?:\s*(.+?)(?:\n|$)", cleaned_response)
        if opt_match:
            raw = opt_match.group(1)
            parts = [p.strip().rstrip(".") for p in raw.split(",") if p.strip()]
            if len(parts) >= 2:
                question_options = [{"value": p.lower().replace(" ", "_"), "label": p} for p in parts]

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
        for f in ("assignee_id", "assignee_name", "reviewer_id", "reviewer_name"):
            raw = updated_goal.get(f)
            if isinstance(raw, str):
                updated_goal[f] = [raw]
            elif raw is None:
                updated_goal[f] = []

    return {
        "response": cleaned_response,
        "probing_questions": probing,
        "structured_update": structured_update,
        "task_suggestions": task_suggestions,
        "suggestion_chips": suggestion_chips,
        "question_options": question_options,
        "goal": updated_goal,
    }