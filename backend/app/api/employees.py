import logging
import os
from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ..core.database import get_database
from ..dependencies.auth import get_current_user
from ..dependencies.scope import is_org_member, is_org_owner

router = APIRouter()
logger = logging.getLogger("yesboss.employees")

class EmployeeCreate(BaseModel):
    email: str
    full_name: str
    phone: str | None = None
    role: str
    department: str | None = None
    manager_id: str | None = None
    organization_id: str

class EmployeeUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    department: str | None = None
    manager_id: str | None = None

@router.get("")
async def list_employees(
    org_id: str | None = None,
    search: str | None = None,
    current_user = Depends(get_current_user),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    from ..dependencies.scope import resolve_user_org_ids

    user_org_ids = await resolve_user_org_ids(db, current_user)
    if not user_org_ids:
        raise HTTPException(status_code=403, detail="Access denied")

    query = {}
    if org_id:
        if str(org_id) not in {str(o) for o in user_org_ids}:
            raise HTTPException(status_code=403, detail="Access denied")
        query["organization_id"] = org_id
    else:
        query["organization_id"] = {"$in": [str(o) for o in user_org_ids]}
    if search:
        query["$or"] = [
            {"full_name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"role": {"$regex": search, "$options": "i"}},
            {"department": {"$regex": search, "$options": "i"}},
        ]

    employees = list(db.employees.find(query).limit(20))

    for emp in employees:
        emp["_id"] = str(emp["_id"])

    return {"employees": employees}

@router.get("/tasks")
async def get_employee_tasks(
    org_id: str,
    email: str | None = None,
    current_user = Depends(get_current_user),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    # Non-owners may only view their own task list.
    if not await is_org_owner(db, org_id, current_user):
        own_email = getattr(current_user, "email", None)
        if not own_email or not email or email.lower().strip() != own_email.lower().strip():
            raise HTTPException(status_code=403, detail="Access denied")

    query = {"organization_id": org_id}
    if email:
        query["$or"] = [
            {"assignee_email": email},
            {"assigned_to": email},
            {"assignee_id": email},
        ]

    try:
        tasks = list(db.tasks.find(query).sort("due_date", 1).limit(20))

        for task in tasks:
            task["id"] = str(task.pop("_id"))

        pending_reviews = list(db.approval_requests.find(
            {"reviewer_email": email, "status": "pending"}
        ).limit(10))

        for review in pending_reviews:
            review["id"] = str(review.pop("_id"))

        team_updates = list(db.team_updates.find(
            {"organization_id": org_id}
        ).sort("created_at", -1).limit(10))

        for update in team_updates:
            update["id"] = str(update.pop("_id"))

        return {
            "tasks": tasks,
            "pending_reviews": pending_reviews,
            "team_updates": team_updates
        }
    except Exception:
        return {"tasks": [], "pending_reviews": [], "team_updates": []}

@router.get("/by-email/{email}")
async def find_employee_by_email(email: str, current_user = Depends(get_current_user)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    clean_email = email.lower().strip()

    # Look up the org for this employee and require membership.
    from ..dependencies.scope import resolve_user_org_ids

    user_org_ids = {str(o).lower() for o in await resolve_user_org_ids(db, current_user)}
    emp_org_ids: set[str] = set()
    for org_id in db.employees.distinct("organization_id", {"email": clean_email}):
        emp_org_ids.add(str(org_id).lower())
    for org_id in db.org_chart_members.distinct("organization_id", {"email": clean_email}):
        emp_org_ids.add(str(org_id).lower())
    if not emp_org_ids & user_org_ids:
        raise HTTPException(status_code=403, detail="Access denied")

    employee = db.employees.find_one({"email": clean_email})

    if employee:
        employee["_id"] = str(employee["_id"])
        return {"employee": employee}

    org_member = db.org_chart_members.find_one({"email": clean_email})
    if org_member:
        org_member["_id"] = str(org_member["_id"])
        return {"employee": {
            "full_name": org_member.get("full_name", ""),
            "email": org_member.get("email", ""),
            "department": org_member.get("department", ""),
            "role": org_member.get("role") or org_member.get("title") or "",
        }}

    return {"employee": None}

@router.get("/by-domain/{domain}")
async def find_employee_by_domain(domain: str, current_user = Depends(get_current_user)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    from ..dependencies.scope import resolve_user_org_ids

    user_org_ids = {str(o) for o in await resolve_user_org_ids(db, current_user)}
    if not user_org_ids:
        raise HTTPException(status_code=403, detail="Access denied")

    employees = list(db.employees.find({
        "email": {"$regex": f"@{domain}$"},
        "organization_id": {"$in": list(user_org_ids)},
    }))

    for emp in employees:
        emp["_id"] = str(emp["_id"])

    return {"employees": employees, "domain": domain}

@router.get("/{employee_id}")
async def get_employee(employee_id: str, current_user = Depends(get_current_user)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    from bson import ObjectId
    employee = db.employees.find_one({"_id": ObjectId(employee_id)})

    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    if not await is_org_member(db, employee.get("organization_id"), current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    employee["_id"] = str(employee["_id"])
    return {"employee": employee}

@router.post("")
async def create_employee(request: EmployeeCreate, current_user = Depends(get_current_user)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    # Only owners can add employees to the org.
    if not await is_org_owner(db, request.organization_id, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    emp_doc = {
        "email": request.email,
        "full_name": request.full_name,
        "phone": request.phone,
        "role": request.role,
        "department": request.department,
        "manager_id": request.manager_id,
        "organization_id": request.organization_id,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }

    result = db.employees.insert_one(emp_doc)
    emp_doc["_id"] = str(result.inserted_id)

    return {"employee": emp_doc}

@router.put("/{employee_id}")
async def update_employee(employee_id: str, request: EmployeeUpdate, current_user = Depends(get_current_user)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    from bson import ObjectId
    employee = db.employees.find_one({"_id": ObjectId(employee_id)})
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Only owners can edit employee records.
    if not await is_org_owner(db, employee.get("organization_id"), current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    update_data = {k: v for k, v in request.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()

    db.employees.update_one(
        {"_id": ObjectId(employee_id)},
        {"$set": update_data}
    )

    employee = db.employees.find_one({"_id": ObjectId(employee_id)})
    employee["_id"] = str(employee["_id"])

    return {"employee": employee}

@router.delete("/{employee_id}")
async def delete_employee(employee_id: str, current_user = Depends(get_current_user)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    from bson import ObjectId
    employee = db.employees.find_one({"_id": ObjectId(employee_id)})
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Only owners can delete employee records.
    if not await is_org_owner(db, employee.get("organization_id"), current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    db.employees.delete_one({"_id": ObjectId(employee_id)})

    return {"success": True, "message": "Employee deleted"}


class EmployeePersonaRequest(BaseModel):
    email: str | None = None
    full_name: str | None = None
    organization_id: str | None = None
    department: str | None = None
    role: str | None = None
    manager_id: str | None = None
    subordinate_ids: list[str] | None = None
    preferences: list[str] | None = None
    communication_style: str | None = None
    workflow_challenges: str | None = None
    tools_preferred: str | None = None
    avatar_style: str | None = None


def _resolve_manager_email(db, manager_id: str | None) -> str | None:
    """Resolve the reporting manager's email from org_chart_members or employees."""
    if not manager_id:
        return None
    try:
        if ObjectId.is_valid(manager_id):
            mgr = db.org_chart_members.find_one({"_id": ObjectId(manager_id)})
            if not mgr:
                mgr = db.employees.find_one({"_id": ObjectId(manager_id)})
            if mgr:
                return mgr.get("email")
        if "@" in manager_id:
            return manager_id
    except Exception:
        pass
    return None


def _sync_to_org_chart(db, request: EmployeePersonaRequest) -> None:
    """Keep org_chart_members in sync with the employee's onboarding data so the
    selected reporting manager shows up in the organization chart."""
    if not request.email or not request.organization_id:
        return
    try:
        manager_email = _resolve_manager_email(db, request.manager_id)
        now = datetime.utcnow()
        doc = {
            "organization_id": request.organization_id,
            "email": request.email,
            "full_name": request.full_name or request.email.split("@")[0],
            "role": (request.role or "employee").strip().lower(),
            "department": request.department or "",
            "manager_email": manager_email,
            "title": request.role or "",
            "updated_at": now,
        }
        db.org_chart_members.update_one(
            {"organization_id": request.organization_id, "email": request.email},
            {"$set": doc, "$setOnInsert": {"created_at": now}},
            upsert=True,
        )
    except Exception as e:
        logger.warning("Failed to sync employee %s to org chart: %s", request.email, e)


@router.post("/persona")
async def save_employee_persona(request: EmployeePersonaRequest, current_user = Depends(get_current_user)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    if not request.email:
        raise HTTPException(status_code=400, detail="Email is required")

    # Non-owners may only save their own persona.
    if request.organization_id and not await is_org_owner(db, request.organization_id, current_user):
        own_email = getattr(current_user, "email", None)
        if not own_email or request.email.lower().strip() != own_email.lower().strip():
            raise HTTPException(status_code=403, detail="Access denied")

    existing = db.employees.find_one({"email": request.email})

    if existing:
        update_doc = {
            "department": request.department,
            "role": request.role,
            "manager_id": request.manager_id,
            "subordinate_ids": request.subordinate_ids,
            "persona": {
                "communication_style": request.communication_style,
                "workflow_challenges": request.workflow_challenges,
                "tools_preferred": request.tools_preferred,
                "preferences": request.preferences,
                "updated_at": datetime.utcnow(),
            },
            "onboarding_completed": True,
            "updated_at": datetime.utcnow(),
        }
        if request.full_name:
            update_doc["full_name"] = request.full_name
        if request.avatar_style:
            update_doc["avatar_style"] = request.avatar_style
        db.employees.update_one(
            {"email": request.email},
            {"$set": update_doc}
        )
        existing["_id"] = str(existing["_id"])
        _sync_to_org_chart(db, request)
        return {"employee": existing, "message": "Persona updated"}
    else:
        emp_doc = {
            "email": request.email,
            "full_name": request.full_name,
            "organization_id": request.organization_id,
            "department": request.department,
            "role": request.role,
            "manager_id": request.manager_id,
            "subordinate_ids": request.subordinate_ids or [],
            "persona": {
                "communication_style": request.communication_style,
                "workflow_challenges": request.workflow_challenges,
                "tools_preferred": request.tools_preferred,
                "preferences": request.preferences,
            },
            "onboarding_completed": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        if request.avatar_style:
            emp_doc["avatar_style"] = request.avatar_style

        result = db.employees.insert_one(emp_doc)
        emp_doc["_id"] = str(result.inserted_id)

        _sync_to_org_chart(db, request)

        return {"employee": emp_doc, "message": "Persona saved"}


AVATAR_DIR = "uploads/avatars"
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
MAX_AVATAR_SIZE = 2 * 1024 * 1024  # 2MB


@router.post("/avatar")
async def upload_avatar(
    email: str = Form(...),
    file: UploadFile = File(...),
    current_user = Depends(get_current_user),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    clean_email = email.lower().strip()
    own_email = getattr(current_user, "email", None)

    # Anyone may set their own avatar; owners/admins may set any avatar in their org.
    is_self = bool(own_email and clean_email == own_email.lower().strip())
    target_org = db.employees.find_one({"email": clean_email}, {"organization_id": 1})
    is_admin = bool(target_org and await is_org_owner(db, target_org.get("organization_id"), current_user))
    if not (is_self or is_admin):
        raise HTTPException(status_code=403, detail="Access denied")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")

    contents = await file.read()
    if len(contents) > MAX_AVATAR_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Max 2MB")

    os.makedirs(AVATAR_DIR, exist_ok=True)

    for old_ext in ALLOWED_EXTENSIONS:
        old_path = os.path.join(AVATAR_DIR, f"{clean_email}{old_ext}")
        if os.path.exists(old_path):
            os.remove(old_path)

    file_path = os.path.join(AVATAR_DIR, f"{clean_email}{ext}").replace("\\", "/")

    with open(file_path, "wb") as f:
        f.write(contents)

    avatar_url = f"/employees/avatar/{clean_email}"

    db.employees.update_one(
        {"email": clean_email},
        {"$set": {"avatar_url": avatar_url, "avatar_path": file_path, "updated_at": datetime.utcnow()}},
        upsert=False,
    )
    db.org_chart_members.update_one(
        {"email": clean_email},
        {"$set": {"avatar_url": avatar_url, "updated_at": datetime.utcnow()}},
        upsert=False,
    )

    return {"avatar_url": avatar_url}


@router.get("/avatar/{email}")
async def get_avatar(email: str):
    clean_email = email.lower().strip()

    for ext in ALLOWED_EXTENSIONS:
        file_path = os.path.join(AVATAR_DIR, f"{clean_email}{ext}").replace("\\", "/")
        if os.path.exists(file_path):
            media_type = {
                ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                ".png": "image/png", ".gif": "image/gif",
                ".webp": "image/webp",
            }.get(ext, "application/octet-stream")
            return FileResponse(file_path, media_type=media_type, headers={"Cache-Control": "no-cache, private"})

    raise HTTPException(status_code=404, detail="Avatar not found")
