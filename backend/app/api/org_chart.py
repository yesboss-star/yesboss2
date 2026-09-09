import csv
import io
import logging
from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from ..core.database import get_database
from ..dependencies.auth import get_current_user

router = APIRouter()
logger = logging.getLogger("yesboss.org_chart")

def get_user_org_id(user) -> str | None:
    if hasattr(user, 'user_metadata') and user.user_metadata:
        return user.user_metadata.get("organization_id")
    return None

class OrgMemberCreate(BaseModel):
    email: str
    full_name: str
    role: str
    department: str
    manager_email: str | None = None
    title: str | None = None
    timezone: str = "Asia/Kolkata"
    working_hours_start: str = "09:00"
    working_hours_end: str = "18:00"

class OrgMemberUpdate(BaseModel):
    full_name: str | None = None
    role: str | None = None
    department: str | None = None
    manager_email: str | None = None
    title: str | None = None
    timezone: str | None = None
    working_hours_start: str | None = None
    working_hours_end: str | None = None

class BulkUploadResponse(BaseModel):
    inserted: int
    errors: list[str]

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
    organization_id: str | None = Form(None),
    current_user = Depends(get_current_user)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    from ..dependencies.scope import is_org_owner

    org_id = organization_id or get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

    if not await is_org_owner(db, org_id, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

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
    organization_id: str | None = None,
    current_user = Depends(get_current_user)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    from ..dependencies.scope import is_org_owner

    org_id = organization_id or get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

    if not await is_org_owner(db, org_id, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    doc = {
        "organization_id": org_id,
        "email": member.email,
        "full_name": member.full_name,
        "role": member.role,
        "department": member.department,
        "manager_email": member.manager_email,
        "title": member.title,
        "timezone": member.timezone or "Asia/Kolkata",
        "working_hours_start": member.working_hours_start or "09:00",
        "working_hours_end": member.working_hours_end or "18:00",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }

    result = db.org_chart_members.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return {"member": doc}

@router.get("/tree")
async def get_org_tree(organization_id: str | None = None, current_user = Depends(get_current_user)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    from ..dependencies.scope import is_org_member

    org_id = organization_id or get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

    if not await is_org_member(db, org_id, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

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

@router.get("/members/search")
async def search_org_members(
    q: str = "",
    organization_id: str | None = None,
    current_user = Depends(get_current_user)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    from ..dependencies.scope import is_org_member

    org_id = organization_id or get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

    if not await is_org_member(db, org_id, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    if not q:
        return {"members": []}

    import re
    regex = re.compile(re.escape(q), re.IGNORECASE)
    members = list(
        db.org_chart_members.find({
            "organization_id": org_id,
            "$or": [
                {"full_name": {"$regex": regex}},
                {"email": {"$regex": regex}},
            ]
        }).sort("full_name", 1).limit(20)
    )
    for m in members:
        m["_id"] = str(m["_id"])
    return {"members": members}

@router.get("/members")
async def list_org_members(organization_id: str | None = None, current_user = Depends(get_current_user)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    from ..dependencies.scope import is_org_member

    org_id = organization_id or get_user_org_id(current_user)
    if not org_id:
        return {"members": [], "total": 0}

    if not await is_org_member(db, org_id, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    members = list(db.org_chart_members.find({"organization_id": org_id}).sort("full_name", 1))
    for m in members:
        m["_id"] = str(m["_id"])
    return {"members": members, "total": len(members)}

@router.put("/members/{member_id}")
async def update_org_member(
    member_id: str,
    update: OrgMemberUpdate,
    current_user = Depends(get_current_user)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    from ..dependencies.scope import is_org_owner

    member = db.org_chart_members.find_one({"_id": ObjectId(member_id)})
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    if not await is_org_owner(db, member.get("organization_id"), current_user):
        raise HTTPException(status_code=403, detail="Access denied")

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
async def delete_org_member(member_id: str, current_user = Depends(get_current_user)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    from ..dependencies.scope import is_org_owner

    member = db.org_chart_members.find_one({"_id": ObjectId(member_id)})
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    if not await is_org_owner(db, member.get("organization_id"), current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    db.org_chart_members.delete_one({"_id": ObjectId(member_id)})
    return {"success": True}


# Common role titles used as fallback suggestions
COMMON_ROLES = [
    # C-Suite / Executive
    "Chief Executive Officer", "Chief Technology Officer", "Chief Financial Officer",
    "Chief Operating Officer", "Chief Marketing Officer", "Chief Product Officer",
    "Chief Information Officer", "Chief Revenue Officer", "Chief Data Officer",
    "Chief People Officer", "Chief Legal Officer", "Chief Strategy Officer",
    "Chief Compliance Officer", "Chief Innovation Officer", "Chief Growth Officer",
    "Chief Risk Officer", "Chief Security Officer", "Chief Analytics Officer",
    "Chief Customer Officer", "Chief Design Officer", "Chief Sustainability Officer",
    "EVP Engineering", "EVP Sales", "EVP Marketing", "EVP Product",
    "SVP Engineering", "SVP Technology", "SVP Sales", "SVP Marketing",
    "SVP Product Management", "SVP People", "SVP Finance", "SVP Operations",

    # VP Level
    "VP of Engineering", "VP of Sales", "VP of Marketing", "VP of Operations",
    "VP of Product", "VP of Design", "VP of Finance", "VP of People",
    "VP of Data Science", "VP of Machine Learning", "VP of Infrastructure",
    "VP of Customer Success", "VP of Business Development", "VP of Strategy",
    "VP of Growth", "VP of Brand", "VP of Communications", "VP of Legal",

    # Director Level
    "Director of Engineering", "Director of Product", "Director of Sales",
    "Director of Marketing", "Director of Design", "Director of Operations",
    "Director of Finance", "Director of HR", "Director of Data Science",
    "Director of Analytics", "Director of Machine Learning", "Director of Infrastructure",
    "Director of Security", "Director of Customer Success", "Director of Partnerships",
    "Director of Brand", "Director of Communications", "Director of Talent Acquisition",
    "Director of Learning & Development", "Director of Business Development",
    "Director of Program Management", "Director of Quality Assurance",

    # Engineering
    "Principal Engineer", "Principal Software Engineer", "Principal Architect",
    "Staff Engineer", "Staff Software Engineer", "Senior Staff Engineer",
    "Engineering Manager", "Senior Engineering Manager",
    "Lead Software Engineer", "Lead Developer", "Tech Lead",
    "Senior Software Engineer", "Senior Developer", "Senior Backend Engineer",
    "Senior Frontend Engineer", "Senior Full Stack Engineer",
    "Senior Systems Engineer", "Senior Platform Engineer", "Senior SRE",
    "Software Engineer", "Full Stack Developer", "Frontend Developer",
    "Backend Developer", "Systems Engineer", "Platform Engineer",
    "Site Reliability Engineer", "DevOps Engineer", "Infrastructure Engineer",
    "Cloud Engineer", "Security Engineer", "QA Engineer", "Test Engineer",
    "Junior Developer", "Junior Software Engineer", "Associate Engineer",
    "Mobile Developer", "iOS Developer", "Android Developer",
    "Embedded Engineer", "Game Developer", "Blockchain Developer",

    # Data & AI
    "Principal Data Scientist", "Lead Data Scientist", "Machine Learning Engineer",
    "Senior Data Scientist", "Data Scientist", "Junior Data Scientist",
    "Data Engineer", "Senior Data Engineer", "Data Analyst", "Business Analyst",
    "Senior Data Analyst", "Analytics Engineer", "AI Research Scientist",
    "ML Ops Engineer", "Data Architect", "Business Intelligence Analyst",
    "Quantitative Analyst", "Data Product Manager",

    # Product
    "Group Product Manager", "Senior Product Manager", "Product Manager",
    "Associate Product Manager", "Principal Product Manager",
    "Product Operations Manager", "Product Analyst", "Technical Product Manager",
    "Product Owner", "Program Manager", "Technical Program Manager",
    "Senior Program Manager", "Scrum Master", "Agile Coach",

    # Design
    "Head of Design", "Senior Product Designer", "Product Designer",
    "UX Designer", "UI Designer", "UX Researcher", "Design Researcher",
    "Senior UX Designer", "Lead Designer", "Visual Designer",
    "Interaction Designer", "Motion Designer", "Brand Designer",
    "Design Operations Manager", "Design System Designer", "Creative Director",
    "Art Director", "Graphic Designer",

    # Sales
    "VP of Sales", "Regional Sales Director", "Sales Director",
    "Senior Account Executive", "Account Executive", "Enterprise Account Executive",
    "SDR Manager", "Sales Development Representative", "BDR Manager",
    "Business Development Representative", "Sales Operations Manager",
    "Sales Operations Analyst", "Sales Engineer", "Solutions Engineer",
    "Customer Success Manager", "Senior Customer Success Manager",
    "Account Manager", "Senior Account Manager", "Key Account Manager",
    "Partnerships Manager", "Business Development Manager",

    # Marketing
    "Head of Growth", "Growth Manager", "Senior Marketing Manager",
    "Marketing Manager", "Brand Manager", "Content Marketing Manager",
    "SEO Manager", "SEM Manager", "Digital Marketing Manager",
    "Social Media Manager", "Product Marketing Manager",
    "Marketing Operations Manager", "Communications Manager",
    "PR Manager", "Content Writer", "Content Strategist",
    "Copywriter", "Marketing Analyst", "Growth Analyst",
    "Demand Generation Manager", "Email Marketing Manager",
    "Performance Marketing Manager", "Brand Strategist",

    # Finance & Legal
    "Chief Financial Officer", "VP of Finance", "Finance Director",
    "Finance Manager", "Senior Financial Analyst", "Financial Analyst",
    "Controller", "Accountant", "Staff Accountant", "Accounts Payable",
    "Accounts Receivable", "FP&A Manager", "FP&A Analyst",
    "Internal Auditor", "Tax Manager", "Treasury Manager",
    "General Counsel", "Corporate Counsel", "Legal Counsel",
    "Paralegal", "Compliance Officer", "Compliance Analyst",
    "Contracts Manager", "Risk Analyst",

    # HR / People
    "Chief People Officer", "VP of People", "HR Director",
    "HR Manager", "Senior HR Generalist", "HR Generalist",
    "HR Coordinator", "HR Operations Manager", "People Operations Manager",
    "People Operations Associate", "Talent Acquisition Manager",
    "Senior Recruiter", "Recruiter", "Talent Acquisition Specialist",
    "HR Business Partner", "L&D Manager", "Learning & Development Specialist",
    "Training Manager", "DEI Manager", "DEI Specialist",
    "Compensation & Benefits Manager", "Payroll Manager",
    "Employee Relations Manager", "Culture & Engagement Manager",
    "Onboarding Specialist", "HR Analyst",

    # Operations
    "Chief Operating Officer", "VP of Operations", "Operations Director",
    "Operations Manager", "Senior Operations Analyst", "Operations Analyst",
    "Supply Chain Manager", "Logistics Manager", "Procurement Manager",
    "Facilities Manager", "Office Manager", "Administrative Assistant",
    "Executive Assistant", "Business Operations Manager", "Strategy & Operations Manager",
    "Project Manager", "Senior Project Manager", "Project Coordinator",

    # Customer Support
    "VP of Customer Experience", "Customer Support Director",
    "Customer Support Manager", "Senior Support Engineer", "Support Engineer",
    "Customer Support Specialist", "Technical Support Engineer",
    "Customer Success Manager", "Onboarding Manager", "Solutions Consultant",
    "Support Team Lead", "Escalation Manager",

    # Intern / Entry Level
    "Intern", "Software Engineering Intern", "Data Science Intern",
    "Product Management Intern", "Design Intern", "Marketing Intern",
    "Sales Intern", "Finance Intern", "Associate Consultant",
    "Graduate Trainee", "Management Trainee", "Associate",
    "Junior Associate", "Analyst", "Junior Analyst",

    # Standalone Common Titles
    "Executive", "Officer", "Specialist", "Coordinator", "Lead",
    "Head", "Supervisor", "Clerk", "Agent", "Planner",
    "Scheduler", "Technician", "Operator", "Advisor", "Liaison",
    "Auditor", "Strategist", "Representative", "Consultant",
]


GENERIC_TITLES = {
    "employee", "staff", "team member", "member",
    "temp", "temporary", "contractor", "freelancer",
    "worker", "personnel", "new hire",
}


@router.post("/role-register")
async def register_custom_role(
    role: str,
    organization_id: str | None = None,
    current_user = Depends(get_current_user)
):
    """Save a custom role that wasn't in the common list so it appears in future suggestions."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    if organization_id:
        from ..dependencies.scope import is_org_member
        if not await is_org_member(db, organization_id, current_user):
            raise HTTPException(status_code=403, detail="Access denied")

    role = role.strip().lower()
    if not role or len(role) < 2:
        return {"saved": False}

    if role in GENERIC_TITLES:
        return {"saved": False, "reason": "generic title"}

    # Check if already in common list
    if any(r.lower() == role for r in COMMON_ROLES):
        return {"saved": False, "reason": "already in common list"}

    # Upsert to role_registry
    existing = db.role_registry.find_one({"role": role})
    if existing:
        db.role_registry.update_one(
            {"_id": existing["_id"]},
            {"$inc": {"count": 1}, "$set": {"updated_at": datetime.utcnow()}}
        )
    else:
        db.role_registry.insert_one({
            "role": role,
            "display_role": role.title(),
            "count": 1,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        })

    return {"saved": True}


class RemindRequest(BaseModel):
    organization_id: str | None = None
    emails: list[str] = []


@router.get("/members/status")
async def get_member_integration_status(
    organization_id: str | None = None,
    current_user = Depends(get_current_user)
):
    """Return per-member integration status (integrated vs not) for the org.

    Integrated = has a valid entry in the org's provider token collection
    (Google or Zoho, determined by the org's provider via providers.get_org_provider).
    No G/Z split — just boolean integrated, per clarification.
    """
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    from ..core.providers import get_org_provider

    org_id = organization_id or get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

    from ..dependencies.scope import is_org_member
    if not await is_org_member(db, org_id, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    members = list(db.org_chart_members.find({"organization_id": org_id}, {"email": 1, "full_name": 1}))
    # Normalize emails
    email_to_name = {}
    emails_lower = []
    for m in members:
        e = (m.get("email") or "").strip().lower()
        if not e:
            continue
        email_to_name[e] = m.get("full_name") or e
        emails_lower.append(e)

    # Determine org provider
    provider = None
    try:
        provider = get_org_provider(db, org_id)
    except Exception:
        provider = None

    # Collect integrated emails — robust: handles UID vs email mismatch via users/employees lookup
    integrated_set: set[str] = set()
    connected_map: dict[str, str] = {}
    try:
        # Build maps: member email -> uid, uid -> member email
        email_to_uid: dict[str, str] = {}
        uid_to_email: dict[str, str] = {}
        for u in db.users.find({"email": {"$in": emails_lower}}, {"email": 1, "uid": 1}):
            el = (u.get("email") or "").strip().lower()
            uid = (u.get("uid") or "").strip()
            if el in email_to_name and uid:
                email_to_uid[el] = uid
                uid_to_email[uid.lower()] = el
        for e in db.employees.find({"email": {"$in": emails_lower}}, {"email": 1, "uid": 1}):
            el = (e.get("email") or "").strip().lower()
            uid = (e.get("uid") or "").strip()
            if el in email_to_name and uid and el not in email_to_uid:
                email_to_uid[el] = uid
                uid_to_email[uid.lower()] = el

        # Helper to mark a token as integrated for a member email
        def mark_integrated(member_email: str, doc: dict):
            ml = member_email.strip().lower()
            if ml in email_to_name and ml not in integrated_set and doc.get("access_token"):
                integrated_set.add(ml)
                # Prefer stored connected_at, fallback to updated_at
                connected_map[ml] = str(doc.get("connected_at") or doc.get("updated_at") or "")

        # Check google_tokens — try 3 strategies: direct email, uid->email via map, uid lookup in users
        for doc in db.google_tokens.find({}, {"user_id": 1, "email": 1, "connected_at": 1, "access_token": 1, "updated_at": 1}):
            if not doc.get("access_token"):
                continue
            token_email = (doc.get("email") or "").strip().lower()
            token_uid = (doc.get("user_id") or "").strip()
            token_uid_lower = token_uid.lower()
            # Direct email match
            if token_email and token_email in email_to_name:
                mark_integrated(token_email, doc)
                continue
            # UID mapped via our prebuilt map
            if token_uid_lower in uid_to_email:
                mark_integrated(uid_to_email[token_uid_lower], doc)
                continue
            # Fallback: lookup user by uid in DB to get email
            if token_uid:
                u = db.users.find_one({"uid": token_uid}, {"email": 1})
                if u and (u.get("email") or "").strip().lower() in email_to_name:
                    mark_integrated((u.get("email") or "").strip().lower(), doc)
                    continue
                # Also try employees
                e = db.employees.find_one({"uid": token_uid}, {"email": 1})
                if e and (e.get("email") or "").strip().lower() in email_to_name:
                    mark_integrated((e.get("email") or "").strip().lower(), doc)
                    continue
        # Check zoho_tokens — same + zoho_mail_id
        for doc in db.zoho_tokens.find({}, {"user_id": 1, "email": 1, "zoho_mail_id": 1, "connected_at": 1, "access_token": 1, "updated_at": 1}):
            if not doc.get("access_token"):
                continue
            token_email = (doc.get("email") or "").strip().lower()
            token_zoho = (doc.get("zoho_mail_id") or "").strip().lower()
            token_uid = (doc.get("user_id") or "").strip()
            token_uid_lower = token_uid.lower()
            if token_email and token_email in email_to_name:
                mark_integrated(token_email, doc)
                continue
            if token_zoho and token_zoho in email_to_name:
                mark_integrated(token_zoho, doc)
                continue
            if token_uid_lower in uid_to_email:
                mark_integrated(uid_to_email[token_uid_lower], doc)
                continue
            if token_uid:
                u = db.users.find_one({"uid": token_uid}, {"email": 1})
                if u and (u.get("email") or "").strip().lower() in email_to_name:
                    mark_integrated((u.get("email") or "").strip().lower(), doc)
                    continue
                e = db.employees.find_one({"uid": token_uid}, {"email": 1})
                if e and (e.get("email") or "").strip().lower() in email_to_name:
                    mark_integrated((e.get("email") or "").strip().lower(), doc)
                    continue
    except Exception as e:
        logger.warning(f"member status lookup failed: {e}", exc_info=True)

    result = []
    for e in emails_lower:
        is_int = e in integrated_set
        result.append({
            "email": e,
            "full_name": email_to_name.get(e) or e,
            "integrated": is_int,
            "provider": provider if is_int else None,
            "connected_at": connected_map.get(e) if is_int else None,
        })

    return {
        "organization_id": org_id,
        "provider": provider,
        "total": len(result),
        "integrated_count": len([r for r in result if r["integrated"]]),
        "members": result,
    }


@router.post("/members/remind")
async def remind_members(
    body: RemindRequest,
    current_user = Depends(get_current_user)
):
    """Send reminder email to not-integrated members to connect their account.

    Body: { organization_id, emails: [...] }
    Only sends to members of the organization. Checks scope via is_org_owner or is_org_member.
    """
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = body.organization_id or get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

    from ..dependencies.scope import is_org_member

    if not await is_org_member(db, org_id, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    # Normalize requested emails to those that are members and not integrated
    # Reuse status logic
    members = list(db.org_chart_members.find({"organization_id": org_id}, {"email": 1}))
    member_emails = set((m.get("email") or "").strip().lower() for m in members if m.get("email"))

    requested = [(e or "").strip().lower() for e in body.emails if e]
    if not requested:
        raise HTTPException(status_code=400, detail="No emails provided")
    # Filter to members only
    target_emails = [e for e in requested if e in member_emails]
    if not target_emails:
        raise HTTPException(status_code=400, detail="No valid member emails")

    # Determine which are not integrated
    from ..core.providers import get_org_provider

    provider = None
    try:
        provider = get_org_provider(db, org_id)
    except Exception:
        provider = None

    # Robust integrated check via users/employees mapping (handles UID vs email mismatch for earlier integrated users)
    integrated_set: set[str] = set()
    try:
        target_lower = [e.lower() for e in target_emails]
        email_to_uid: dict[str, str] = {}
        uid_to_email: dict[str, str] = {}
        for u in db.users.find({"email": {"$in": target_lower}}, {"email": 1, "uid": 1}):
            el = (u.get("email") or "").strip().lower()
            uid = (u.get("uid") or "").strip()
            if el in member_emails and uid:
                email_to_uid[el] = uid
                uid_to_email[uid.lower()] = el
        for e in db.employees.find({"email": {"$in": target_lower}}, {"email": 1, "uid": 1}):
            el = (e.get("email") or "").strip().lower()
            uid = (e.get("uid") or "").strip()
            if el in member_emails and uid and el not in email_to_uid:
                email_to_uid[el] = uid
                uid_to_email[uid.lower()] = el

        def mark_target(member_email: str):
            ml = member_email.strip().lower()
            if ml in member_emails:
                integrated_set.add(ml)

        for doc in db.google_tokens.find({}, {"user_id": 1, "email": 1, "access_token": 1}):
            if not doc.get("access_token"):
                continue
            te = (doc.get("email") or "").strip().lower()
            tu = (doc.get("user_id") or "").strip().lower()
            if te and te in member_emails:
                mark_target(te)
                continue
            if tu in uid_to_email:
                mark_target(uid_to_email[tu])
                continue
            if tu:
                u = db.users.find_one({"uid": doc.get("user_id")}, {"email": 1})
                if u and (u.get("email") or "").strip().lower() in member_emails:
                    mark_target((u.get("email") or "").strip().lower())
                    continue
                ee = db.employees.find_one({"uid": doc.get("user_id")}, {"email": 1})
                if ee and (ee.get("email") or "").strip().lower() in member_emails:
                    mark_target((ee.get("email") or "").strip().lower())
                    continue
        for doc in db.zoho_tokens.find({}, {"user_id": 1, "email": 1, "zoho_mail_id": 1, "access_token": 1}):
            if not doc.get("access_token"):
                continue
            te = (doc.get("email") or "").strip().lower()
            tz = (doc.get("zoho_mail_id") or "").strip().lower()
            tu = (doc.get("user_id") or "").strip().lower()
            if te and te in member_emails:
                mark_target(te)
                continue
            if tz and tz in member_emails:
                mark_target(tz)
                continue
            if tu in uid_to_email:
                mark_target(uid_to_email[tu])
                continue
            if tu:
                u = db.users.find_one({"uid": doc.get("user_id")}, {"email": 1})
                if u and (u.get("email") or "").strip().lower() in member_emails:
                    mark_target((u.get("email") or "").strip().lower())
                    continue
                ee = db.employees.find_one({"uid": doc.get("user_id")}, {"email": 1})
                if ee and (ee.get("email") or "").strip().lower() in member_emails:
                    mark_target((ee.get("email") or "").strip().lower())
                    continue
        # Keep only those that were requested
        integrated_set = set(e for e in integrated_set if e in [x.lower() for x in target_emails])
    except Exception as e:
        logger.warning(f"remind status lookup failed: {e}", exc_info=True)

    not_integrated = [e for e in target_emails if e not in integrated_set]
    if not not_integrated:
        return {"sent": 0, "message": "All selected members are already integrated"}

    # Send email via notification_service / email_service
    try:
        from ..core.config import settings as cfg
        frontend_url = (getattr(cfg, "FRONTEND_URL", "") or "").strip().rstrip("/") or "http://localhost:3000"
        link = f"{frontend_url}/dashboard/settings"
        sent = 0
        for email in not_integrated:
            try:
                from ..core.notification_service import create_and_deliver
                # Find member name for personalization
                m = db.org_chart_members.find_one({"organization_id": org_id, "email": email})
                name = m.get("full_name") if m else email
                title = "Connect your account to YesBoss"
                message = f"Hi {name}, please connect your account in YesBoss Settings → Integrations so tasks and goals can sync. Open Settings to connect."
                await create_and_deliver(
                    user_id=email,
                    org_id=org_id,
                    type="integration_reminder",
                    title=title,
                    message=message,
                    link=link,
                    actor_id=getattr(current_user, "id", None) or getattr(current_user, "uid", None),
                )
                sent += 1
            except Exception as e:
                logger.warning(f"remind failed for {email}: {e}")
        return {"sent": sent, "requested": len(target_emails), "not_integrated": len(not_integrated)}
    except Exception as e:
        logger.error(f"remind error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/role-suggestions")
async def get_role_suggestions(
    q: str = "",
    organization_id: str | None = None,
    current_user = Depends(get_current_user)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    from ..dependencies.scope import is_org_member

    org_id = organization_id or get_user_org_id(current_user)
    if org_id and not await is_org_member(db, org_id, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    suggestions = []

    if not q:
        return {"suggestions": COMMON_ROLES[:15]}

    query_lower = q.strip().lower()
    if len(query_lower) < 1:
        return {"suggestions": []}

    # Get existing roles from org chart members
    existing_roles = set()
    if org_id:
        try:
            import re
            regex = re.compile(re.escape(query_lower), re.IGNORECASE)
            members = db.org_chart_members.find(
                {"organization_id": org_id, "role": {"$regex": regex}},
                {"role": 1}
            ).limit(20)
            for m in members:
                role = m.get("role", "").strip()
                if role:
                    existing_roles.add(role)
        except Exception:
            pass

    # Get user-entered roles from role_registry
    registry_roles = set()
    try:
        import re
        regex = re.compile(re.escape(query_lower), re.IGNORECASE)
        registry = db.role_registry.find(
            {"role": {"$regex": regex}},
            {"display_role": 1}
        ).sort("count", -1).limit(20)
        for r in registry:
            display = r.get("display_role", "").strip()
            if display:
                registry_roles.add(display)
    except Exception:
        pass

    # Match common roles
    matched_common = [r for r in COMMON_ROLES if query_lower in r.lower()]

    suggestions = list(existing_roles) + list(registry_roles) + matched_common
    suggestions = list(dict.fromkeys(suggestions))[:15]

    return {"suggestions": suggestions}
