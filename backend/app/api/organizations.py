import asyncio
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
    industries: Optional[list] = None
    micro_vertical: Optional[str] = ""
    micro_verticals: Optional[list] = None
    size: Optional[str] = None
    owner_id: Optional[str] = None
    co_owners: Optional[list] = []
    social_links: Optional[dict] = None
    persona_answers: Optional[list] = None
    check_in_frequency_days: Optional[int] = 7

class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    domain: Optional[str] = None
    website_url: Optional[str] = None
    industry: Optional[str] = None
    industries: Optional[list] = None
    micro_vertical: Optional[str] = None
    micro_verticals: Optional[list] = None
    size: Optional[str] = None
    social_links: Optional[dict] = None
    persona_answers: Optional[list] = None
    check_in_frequency_days: Optional[int] = None

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
        "industries": request.industries or ([request.industry] if request.industry else []),
        "micro_vertical": request.micro_vertical,
        "micro_verticals": request.micro_verticals or ([request.micro_vertical] if request.micro_vertical else []),
        "size": request.size,
        "owner_id": request.owner_id,
        "co_owners": request.co_owners or [],
        "social_links": request.social_links or {},
        "persona_answers": request.persona_answers or [],
        "check_in_frequency_days": request.check_in_frequency_days or 7,
        "last_check_in": None,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    result = db.organizations.insert_one(org_doc)
    org_doc["_id"] = str(result.inserted_id)

    # Fire-and-forget: generate default goals for the new org
    async def _gen_defaults():
        try:
            from ..agents.default_goals_agent import generate_default_goals as _gen
            industry = request.industry or "General"
            micro_vertical = request.micro_vertical or ""
            owner_id = request.owner_id
            goals = await _gen(industry, micro_vertical, count=5)
            for g in goals:
                goal_doc = {
                    "title": g["title"],
                    "description": g.get("description", ""),
                    "priority": g.get("priority", "medium"),
                    "timeline": g.get("suggested_timeline"),
                    "department": g.get("department"),
                    "organization_id": org_doc["_id"],
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
                db.goals.insert_one(goal_doc)
        except Exception as e:
            logger = __import__("logging").getLogger("yesboss.orgs")
            logger.warning(f"Failed to generate default goals: {e}")

    asyncio.create_task(_gen_defaults())
    
    return {"organization": org_doc}

@router.get("/me")
async def get_my_organization(current_user = Depends(get_current_user_optional)):
    """Return the organization for the current user by looking up owner_id or co_owners."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    user_id = getattr(current_user, 'id', None) if current_user else None
    user_email = getattr(current_user, 'email', None) if current_user else None

    if not user_id and not user_email:
        raise HTTPException(status_code=401, detail="Authentication required")

    query = {"$or": []}
    if user_id:
        query["$or"].append({"owner_id": user_id})
        query["$or"].append({"co_owners": user_id})
    if user_email:
        query["$or"].append({"owner_id": user_email})
        query["$or"].append({"co_owners": user_email})

    if not query["$or"]:
        raise HTTPException(status_code=401, detail="Authentication required")

    org = db.organizations.find_one(query)
    if not org:
        raise HTTPException(status_code=404, detail="No organization found for this user")

    org["_id"] = str(org["_id"])
    return {"organization": org}

@router.get("/{org_id}")
async def get_organization(org_id: str):
    db = get_database()
    if db is None:
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
    if db is None:
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
    if db is None:
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
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    domain = domain.lower()
    org = db.organizations.find_one({"domain": {"$regex": f"^{domain}$", "$options": "i"}})
    
    if not org:
        return {"organization": None, "domain": domain}
    
    org["_id"] = str(org["_id"])

    primary_owner = None
    owner_id = org.get("owner_id")
    if owner_id:
        user_doc = db.users.find_one({"uid": owner_id}, {"full_name": 1, "email": 1})
        if user_doc:
            primary_owner = {
                "full_name": user_doc.get("full_name", ""),
                "email": user_doc.get("email", ""),
            }

    return {"organization": org, "primary_owner": primary_owner}

class AddOwnerRequest(BaseModel):
    uid: str

@router.post("/{org_id}/add-owner")
async def add_owner(org_id: str, request: AddOwnerRequest):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    from bson import ObjectId
    org = db.organizations.find_one({"_id": ObjectId(org_id)})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    existing_co_owners = org.get("co_owners", []) or []
    if request.uid not in existing_co_owners and request.uid != org.get("owner_id"):
        existing_co_owners.append(request.uid)
        db.organizations.update_one(
            {"_id": ObjectId(org_id)},
            {"$set": {"co_owners": existing_co_owners, "updated_at": datetime.utcnow()}}
        )
    
    org = db.organizations.find_one({"_id": ObjectId(org_id)})
    org["_id"] = str(org["_id"])
    return {"organization": org}

class GenerateDefaultGoalsRequest(BaseModel):
    industry: Optional[str] = None
    micro_vertical: Optional[str] = None
    count: int = 5
    owner_id: Optional[str] = None
    provider: Optional[str] = None


@router.post("/{org_id}/generate-default-goals")
async def generate_default_goals(
    org_id: str,
    request: GenerateDefaultGoalsRequest,
    current_user = Depends(get_current_user_optional)
):
    from bson import ObjectId
    from ..agents.default_goals_agent import generate_default_goals as _gen_goals

    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org = db.organizations.find_one({"_id": ObjectId(org_id)})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    industry = request.industry or org.get("industry", "General")
    micro_vertical = request.micro_vertical or org.get("micro_vertical", "")
    owner_id = request.owner_id or org.get("owner_id")
    user_id = getattr(current_user, 'id', None) if current_user else owner_id

    goals = await _gen_goals(
        industry=industry,
        micro_vertical=micro_vertical,
        count=request.count,
        provider=request.provider,
    )

    inserted = []
    for g in goals:
        goal_doc = {
            "title": g["title"],
            "description": g.get("description", ""),
            "priority": g.get("priority", "medium"),
            "timeline": g.get("suggested_timeline"),
            "department": g.get("department"),
            "organization_id": org_id,
            "created_by": user_id,
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
        inserted.append(goal_doc)

    return {"goals": inserted, "count": len(inserted)}


@router.get("/{org_id}/owners")
async def get_organization_owners(org_id: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    from bson import ObjectId
    org = db.organizations.find_one({"_id": ObjectId(org_id)})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    owner_ids = []
    primary_owner_id = org.get("owner_id")
    if primary_owner_id:
        owner_ids.append(primary_owner_id)

    co_owners = org.get("co_owners", []) or []
    for uid in co_owners:
        if uid not in owner_ids:
            owner_ids.append(uid)

    users = list(db.users.find({"uid": {"$in": owner_ids}}))
    users_map = {u["uid"]: u for u in users}

    owners_list = []
    for uid in owner_ids:
        user = users_map.get(uid, {})
        owners_list.append({
            "uid": uid,
            "email": user.get("email", ""),
            "full_name": user.get("full_name", ""),
            "role": "primary_owner" if uid == primary_owner_id else "co_owner",
        })

    return {"owners": owners_list}


@router.get("/{org_id}/employees")
async def get_organization_employees(org_id: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    from bson import ObjectId
    employees = list(db.employees.find({"organization_id": org_id}))
    
    for emp in employees:
        emp["_id"] = str(emp["_id"])
    
    return {"employees": employees}

@router.delete("/{org_id}")
async def delete_organization(org_id: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    from bson import ObjectId
    db.organizations.delete_one({"_id": ObjectId(org_id)})
    
    return {"success": True, "message": "Organization deleted"}