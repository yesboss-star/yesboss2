from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from ..core.database import get_database

router = APIRouter()

class EmployeeCreate(BaseModel):
    email: str
    full_name: str
    phone: Optional[str] = None
    role: str
    department: Optional[str] = None
    manager_id: Optional[str] = None
    organization_id: str

class EmployeeUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    manager_id: Optional[str] = None

@router.get("")
async def list_employees(org_id: Optional[str] = None, search: Optional[str] = None):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    query = {}
    if org_id:
        query["organization_id"] = org_id
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
async def get_employee_tasks(org_id: str, email: str | None = None):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    query = {"organization_id": org_id}
    if email:
        query["$or"] = [
            {"assignee_email": email},
            {"assigned_to": email},
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
async def find_employee_by_email(email: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    clean_email = email.lower().strip()
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
            "role": org_member.get("role", ""),
        }}
    
    return {"employee": None}

@router.get("/by-domain/{domain}")
async def find_employee_by_domain(domain: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    employees = list(db.employees.find({"email": {"$regex": f"@{domain}$"}}))
    
    for emp in employees:
        emp["_id"] = str(emp["_id"])
    
    return {"employees": employees, "domain": domain}

@router.get("/{employee_id}")
async def get_employee(employee_id: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    from bson import ObjectId
    employee = db.employees.find_one({"_id": ObjectId(employee_id)})
    
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    employee["_id"] = str(employee["_id"])
    return {"employee": employee}

@router.post("")
async def create_employee(request: EmployeeCreate):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
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
async def update_employee(employee_id: str, request: EmployeeUpdate):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    from bson import ObjectId
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
async def delete_employee(employee_id: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    from bson import ObjectId
    db.employees.delete_one({"_id": ObjectId(employee_id)})
    
    return {"success": True, "message": "Employee deleted"}


class EmployeePersonaRequest(BaseModel):
    email: str | None = None
    organization_id: str | None = None
    department: str | None = None
    role: str | None = None
    manager_id: str | None = None
    subordinate_ids: list[str] | None = None
    preferences: list[str] | None = None
    communication_style: str | None = None
    workflow_challenges: str | None = None
    tools_preferred: str | None = None


@router.post("/persona")
async def save_employee_persona(request: EmployeePersonaRequest):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    if not request.email:
        raise HTTPException(status_code=400, detail="Email is required")
    
    existing = db.employees.find_one({"email": request.email})
    
    if existing:
        db.employees.update_one(
            {"email": request.email},
            {"$set": {
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
            }}
        )
        existing["_id"] = str(existing["_id"])
        return {"employee": existing, "message": "Persona updated"}
    else:
        emp_doc = {
            "email": request.email,
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
        
        result = db.employees.insert_one(emp_doc)
        emp_doc["_id"] = str(result.inserted_id)
        
        return {"employee": emp_doc, "message": "Persona saved"}