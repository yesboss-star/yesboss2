import logging
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from ..core.database import get_database
from ..dependencies.auth import get_current_user_optional
from bson import ObjectId
import csv
import io

router = APIRouter()
logger = logging.getLogger("yesboss.org_chart")

def get_user_org_id(user) -> Optional[str]:
    if hasattr(user, 'user_metadata') and user.user_metadata:
        return user.user_metadata.get("organization_id")
    return None

class OrgMemberCreate(BaseModel):
    email: str
    full_name: str
    role: str
    department: str
    manager_email: Optional[str] = None
    title: Optional[str] = None

class OrgMemberUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    manager_email: Optional[str] = None
    title: Optional[str] = None

class BulkUploadResponse(BaseModel):
    inserted: int
    errors: List[str]

COLUMN_ALIASES = {
    "email": ["email", "email id", "email_id", "e-mail", "mail", "email address", "email_address"],
    "full_name": ["full_name", "full name", "name", "employee name", "fullname", "employee_name"],
    "role": ["role", "designation", "job title", "position", "job_title"],
    "department": ["department", "dept", "team", "business unit", "business_unit", "function"],
    "manager_email": ["manager_email", "manager email", "reports to", "reporting to", "manager", "manager_mail", "supervisor", "reporting_to"],
    "title": ["title", "sub department", "sub_department", "subdept", "team name", "team_name", "subdept"],
}

def normalize_columns(row: dict) -> dict:
    """Map varied column names to standard field names."""
    row_lower = {str(k).strip().lower(): str(v).strip() for k, v in row.items()}
    normalized = {}
    for standard, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            if alias in row_lower:
                normalized[standard] = row_lower[alias]
                break
    # Combine first name + last name if no full_name found
    if "full_name" not in normalized or not normalized["full_name"]:
        first = row_lower.get("first name", row_lower.get("first_name", ""))
        last = row_lower.get("last name", row_lower.get("last_name", ""))
        if first or last:
            normalized["full_name"] = f"{first} {last}".strip()
    return normalized

@router.post("/upload")
async def upload_org_chart(
    file: UploadFile = File(...),
    organization_id: Optional[str] = Form(None),
    current_user = Depends(get_current_user_optional)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = organization_id or get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

    content = await file.read()
    errors = []
    inserted = 0

    try:
        if file.filename.endswith('.csv'):
            reader = csv.DictReader(io.StringIO(content.decode('utf-8-sig')))
            members = []
            for row in reader:
                data = normalize_columns(row)
                email = data.get('email', '').strip()
                if not email:
                    errors.append(f"Row {reader.line_num}: email is required")
                    continue
                full_name = data.get('full_name', '').strip()
                members.append({
                    "organization_id": org_id,
                    "email": email,
                    "full_name": full_name or email.split('@')[0],
                    "role": data.get('role', 'employee').strip().lower(),
                    "department": data.get('department', '').strip(),
                    "manager_email": data.get('manager_email', '').strip() or None,
                    "title": data.get('title', '').strip(),
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                })
            if members:
                result = db.org_chart_members.insert_many(members)
                inserted = len(result.inserted_ids)
        elif file.filename.endswith(('.xlsx', '.xls')):
            import pandas as pd
            df = pd.read_excel(io.BytesIO(content))
            members = []
            for idx, row in df.iterrows():
                data = normalize_columns(row)
                email = data.get('email', '').strip()
                if not email:
                    errors.append(f"Row {idx + 2}: email is required")
                    continue
                full_name = data.get('full_name', '').strip()
                members.append({
                    "organization_id": org_id,
                    "email": email,
                    "full_name": full_name or email.split('@')[0],
                    "role": data.get('role', 'employee').strip().lower(),
                    "department": data.get('department', '').strip(),
                    "manager_email": data.get('manager_email', '').strip() or None,
                    "title": data.get('title', '').strip(),
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                })
            if members:
                result = db.org_chart_members.insert_many(members)
                inserted = len(result.inserted_ids)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Use CSV or Excel files.")
    except Exception as e:
        logger.error(f"Org chart upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process file: {str(e)}")

    return {"inserted": inserted, "errors": errors, "total": inserted + len(errors)}

@router.post("/members")
async def add_org_member(
    member: OrgMemberCreate,
    organization_id: Optional[str] = None,
    current_user = Depends(get_current_user_optional)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = organization_id or get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

    doc = {
        "organization_id": org_id,
        "email": member.email,
        "full_name": member.full_name,
        "role": member.role,
        "department": member.department,
        "manager_email": member.manager_email,
        "title": member.title,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }

    result = db.org_chart_members.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return {"member": doc}

@router.get("/tree")
async def get_org_tree(organization_id: Optional[str] = None, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = organization_id or get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

    members = list(db.org_chart_members.find({"organization_id": org_id}))
    for m in members:
        m["_id"] = str(m["_id"])

    member_map = {}
    name_map = {}
    for m in members:
        email = m["email"].strip().lower()
        member_map[email] = {
            "id": m["_id"],
            "email": m["email"],
            "full_name": m["full_name"],
            "role": m["role"],
            "department": m["department"],
            "title": m.get("title", ""),
            "manager_email": m.get("manager_email"),
            "children": []
        }
        name_key = m["full_name"].strip().lower()
        if name_key not in name_map:
            name_map[name_key] = email

    roots = []
    for m_data in member_map.values():
        mgr_raw = m_data["manager_email"]
        if mgr_raw:
            mgr_clean = mgr_raw.strip().lower()
            if mgr_clean in member_map:
                member_map[mgr_clean]["children"].append(m_data)
            else:
                matched = False
                # Try matching by full_name
                for name_key, email_key in name_map.items():
                    if mgr_clean in name_key or name_key in mgr_clean:
                        member_map[email_key]["children"].append(m_data)
                        matched = True
                        break
                if not matched:
                    # Try matching by extracting name before org suffix
                    mgr_name_part = mgr_clean.split(" vsllp")[0].split(" -")[0].strip()
                    if mgr_name_part != mgr_clean:
                        for name_key, email_key in name_map.items():
                            if mgr_name_part in name_key or name_key in mgr_name_part:
                                member_map[email_key]["children"].append(m_data)
                                matched = True
                                break
                if not matched:
                    roots.append(m_data)
        else:
            roots.append(m_data)

    def sort_tree(nodes):
        nodes.sort(key=lambda n: n["full_name"])
        for n in nodes:
            sort_tree(n["children"])

    sort_tree(roots)

    return {
        "tree": roots,
        "members": list(member_map.values()),
        "total": len(members)
    }

@router.get("/members")
async def list_org_members(organization_id: Optional[str] = None, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = organization_id or get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

    members = list(db.org_chart_members.find({"organization_id": org_id}).sort("full_name", 1))
    for m in members:
        m["_id"] = str(m["_id"])
    return {"members": members, "total": len(members)}

@router.put("/members/{member_id}")
async def update_org_member(
    member_id: str,
    update: OrgMemberUpdate,
    current_user = Depends(get_current_user_optional)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()

    db.org_chart_members.update_one(
        {"_id": ObjectId(member_id)},
        {"$set": update_data}
    )

    member = db.org_chart_members.find_one({"_id": ObjectId(member_id)})
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    member["_id"] = str(member["_id"])
    return {"member": member}

@router.delete("/members/{member_id}")
async def delete_org_member(member_id: str, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    db.org_chart_members.delete_one({"_id": ObjectId(member_id)})
    return {"success": True}
