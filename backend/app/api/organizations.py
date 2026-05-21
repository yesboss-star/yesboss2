from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from ..core.database import get_database
from ..core.supabase_client import get_supabase
from ..dependencies.auth import get_current_user, get_current_user_optional

router = APIRouter()

class OrganizationCreate(BaseModel):
    name: str
    domain: Optional[str] = None
    website_url: Optional[str] = None
    industry: Optional[str] = None
    micro_vertical: Optional[str] = ""
    size: Optional[str] = None
    owner_id: Optional[str] = None
    social_links: Optional[dict] = None
    persona_answers: Optional[list] = None

class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    domain: Optional[str] = None
    website_url: Optional[str] = None
    industry: Optional[str] = None
    micro_vertical: Optional[str] = None
    size: Optional[str] = None
    social_links: Optional[dict] = None
    persona_answers: Optional[list] = None

@router.post("")
async def create_organization(request: OrganizationCreate, current_user: Optional[dict] = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    org_doc = {
        "name": request.name,
        "domain": request.domain,
        "website_url": request.website_url,
        "industry": request.industry,
        "micro_vertical": request.micro_vertical,
        "size": request.size,
        "owner_id": request.owner_id,
        "social_links": request.social_links or {},
        "persona_answers": request.persona_answers or [],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    result = db.organizations.insert_one(org_doc)
    org_doc["_id"] = str(result.inserted_id)
    
    return {"organization": org_doc}

@router.get("/{org_id}")
async def get_organization(org_id: str):
    db = get_database()
    if not db:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    from bson import ObjectId
    org = db.organizations.find_one({"_id": ObjectId(org_id)})
    
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    org["_id"] = str(org["_id"])
    return {"organization": org}

@router.put("/{org_id}")
async def update_organization(org_id: str, request: OrganizationUpdate):
    db = get_database()
    if not db:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    from bson import ObjectId
    update_data = {k: v for k, v in request.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    
    db.organizations.update_one(
        {"_id": ObjectId(org_id)},
        {"$set": update_data}
    )
    
    org = db.organizations.find_one({"_id": ObjectId(org_id)})
    org["_id"] = str(org["_id"])
    
    return {"organization": org}


@router.get("")
async def list_organizations(search: Optional[str] = None, limit: int = 20):
    db = get_database()
    if not db:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    query = {}
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"domain": {"$regex": search, "$options": "i"}},
            {"industry": {"$regex": search, "$options": "i"}},
        ]
    
    organizations = list(db.organizations.find(query).limit(limit))
    
    for org in organizations:
        org["_id"] = str(org["_id"])
    
    return {"organizations": organizations}


@router.get("/by-domain/{domain}")
async def get_organization_by_domain(domain: str):
    db = get_database()
    if not db:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    domain = domain.lower()
    org = db.organizations.find_one({"domain": {"$regex": f"^{domain}$", "$options": "i"}})
    
    if not org:
        return {"organization": None, "domain": domain}
    
    org["_id"] = str(org["_id"])
    return {"organization": org}

@router.get("/{org_id}/employees")
async def get_organization_employees(org_id: str):
    db = get_database()
    if not db:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    from bson import ObjectId
    employees = list(db.employees.find({"organization_id": org_id}))
    
    for emp in employees:
        emp["_id"] = str(emp["_id"])
    
    return {"employees": employees}

@router.delete("/{org_id}")
async def delete_organization(org_id: str):
    db = get_database()
    if not db:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    from bson import ObjectId
    db.organizations.delete_one({"_id": ObjectId(org_id)})
    
    return {"success": True, "message": "Organization deleted"}