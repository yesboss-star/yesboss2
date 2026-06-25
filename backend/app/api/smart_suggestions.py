import hashlib
import logging
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from ..core.database import get_database
from ..core.ai_client import get_ai_response
from ..dependencies.auth import get_current_user_optional
from ..agents.frequency_agent import analyze_content

logger = logging.getLogger("yesboss.smart_suggestions")
router = APIRouter()


def _get_org_ref(org_id: str) -> str:
    return hashlib.sha256(org_id.encode()).hexdigest()[:16]


@router.post("/suggest-assignees")
async def suggest_assignees(
    title: str,
    description: Optional[str] = "",
    department: Optional[str] = None,
    organization_id: Optional[str] = None,
    current_user = Depends(get_current_user_optional),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    org_id = organization_id
    if not org_id:
        if hasattr(current_user, 'user_metadata') and current_user.user_metadata:
            org_id = current_user.user_metadata.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

    org_ref = _get_org_ref(org_id)

    analysis = await analyze_content(title=title, description=description or "")
    target_category = analysis.get("work_category", "general")

    freqs = list(db.employee_frequencies.find({"org_ref": org_ref}))

    if not freqs:
        return {"suggestions": [], "analysis": analysis}

    category_freqs = [f for f in freqs if f.get("work_category") == target_category]
    others = [f for f in freqs if f.get("work_category") != target_category]

    scored = []
    active_counts = {}
    try:
        active_pipeline = [
            {"$match": {"organization_id": org_id, "status": {"$in": ["pending", "in_progress"]}}},
            {"$unwind": "$assignee_id"},
            {"$group": {"_id": "$assignee_id", "count": {"$sum": 1}}}
        ]
        for row in db.tasks.aggregate(active_pipeline):
            active_counts[row["_id"]] = row["count"]
    except Exception:
        pass

    for f in category_freqs:
        emp = f.get("employee_role", "")
        experience = min(f.get("frequency_per_week", 1) / 5, 1.0) * 40
        workload = max(0, 30 - (active_counts.get(emp, 0) * 10))
        speed = max(0, 20 - (f.get("avg_completion_hours", 4) / 80 * 20))
        dept_match = 10 if department and f.get("department", "").lower() == department.lower() else 0
        score = experience + workload + speed + dept_match
        scored.append({
            "email": emp,
            "category": f.get("work_category", "general"),
            "level": f.get("level", "intermediate"),
            "frequency_per_week": f.get("frequency_per_week", 0),
            "avg_completion_hours": f.get("avg_completion_hours", 0),
            "active_tasks": active_counts.get(emp, 0),
            "match_percent": round(score, 0),
            "reason": f"Matched on {target_category}",
        })

    for f in others:
        emp = f.get("employee_role", "")
        if any(s["email"] == emp for s in scored):
            continue
        experience = min(f.get("frequency_per_week", 1) / 5, 1.0) * 20
        workload = max(0, 30 - (active_counts.get(emp, 0) * 10))
        dept_match = 10 if department and f.get("department", "").lower() == department.lower() else 0
        score = experience + workload + dept_match
        scored.append({
            "email": emp,
            "category": f.get("work_category", "general"),
            "level": f.get("level", "intermediate"),
            "frequency_per_week": f.get("frequency_per_week", 0),
            "avg_completion_hours": f.get("avg_completion_hours", 0),
            "active_tasks": active_counts.get(emp, 0),
            "match_percent": round(score, 0),
            "reason": f"Available in {f.get('work_category', 'other')}",
        })

    scored.sort(key=lambda x: x["match_percent"], reverse=True)
    return {"suggestions": scored[:5], "analysis": analysis}


class DeadlineSuggestionRequest(BaseModel):
    title: str
    description: Optional[str] = ""


@router.post("/suggest-deadline")
async def suggest_deadline(request: DeadlineSuggestionRequest):
    analysis = await analyze_content(title=request.title, description=request.description or "")
    hours = analysis.get("estimated_hours", 4)
    if hours <= 4:
        suggested = "1 day"
        days = 1
    elif hours <= 8:
        suggested = "2 days"
        days = 2
    elif hours <= 20:
        suggested = "3-5 days"
        days = 5
    elif hours <= 40:
        suggested = "1 week"
        days = 7
    else:
        suggested = "2 weeks"
        days = 14

    from datetime import datetime, timedelta
    suggested_date = (datetime.utcnow() + timedelta(days=days)).strftime("%Y-%m-%d")

    return {
        "estimated_hours": hours,
        "suggested_text": suggested,
        "suggested_date": suggested_date,
        "category": analysis.get("work_category", "general"),
        "complexity": analysis.get("complexity_level", "intermediate"),
    }


@router.get("/check-workload/{org_id}/{email}")
async def check_workload(org_id: str, email: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    active = list(db.tasks.find({
        "organization_id": org_id,
        "assignee_id": email,
        "status": {"$in": ["pending", "in_progress"]},
    }))
    org_ref = _get_org_ref(org_id)
    freqs = list(db.employee_frequencies.find({"org_ref": org_ref, "employee_role": email}))
    total_hours = sum(f.get("avg_completion_hours", 4) for f in freqs) if freqs else 0
    return {
        "active_tasks": len(active),
        "is_overloaded": len(active) > 2,
        "warning": f"{email} already has {len(active)} active tasks" + (f" (~{total_hours:.0f}h workload)" if total_hours else ""),
        "frequencies": len(freqs),
    }


@router.get("/skill-gaps/{org_id}")
async def skill_gaps(org_id: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    org_ref = _get_org_ref(org_id)

    employees = list(db.employee_frequencies.find({"org_ref": org_ref}))
    emp_categories = {}
    for f in employees:
        emp = f.get("employee_role", "unknown")
        if emp not in emp_categories:
            emp_categories[emp] = []
        emp_categories[emp].append({
            "category": f.get("work_category"),
            "level": f.get("level"),
            "frequency": f.get("frequency_per_week", 0),
        })

    goals = list(db.goals.find({"organization_id": org_id, "status": "active"}))
    tasks = list(db.tasks.find({"organization_id": org_id, "status": {"$in": ["pending", "in_progress"]}}))

    goal_categories = set()
    for g in goals:
        analysis = await analyze_content(title=g.get("title", ""), description=g.get("description", ""))
        goal_categories.add(analysis.get("work_category", "general"))
    for t in tasks:
        analysis = await analyze_content(title=t.get("title", ""), description=t.get("description", ""))
        goal_categories.add(analysis.get("work_category", "general"))

    all_proven = set()
    for emp, cats in emp_categories.items():
        for c in cats:
            all_proven.add(c["category"])

    gaps = [c for c in goal_categories if c not in all_proven]

    overloaded = []
    for emp, cats in emp_categories.items():
        total_freq = sum(c.get("frequency", 0) for c in cats)
        distinct = len(cats)
        if total_freq > 5 or distinct > 4:
            overloaded.append({
                "email": emp,
                "categories": distinct,
                "total_weekly_frequency": total_freq,
            })

    return {
        "goal_level_gaps": [{"category": g, "description": f"Goals require '{g}' but no one has proven this category"} for g in gaps],
        "overloaded_employees": overloaded,
        "department_level_gaps": [],
        "total_employees_with_patterns": len(emp_categories),
    }
