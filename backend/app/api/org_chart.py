import csv
import io
import logging
from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from ..core.database import get_database
from ..dependencies.auth import get_current_user_optional

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

class OrgMemberUpdate(BaseModel):
    full_name: str | None = None
    role: str | None = None
    department: str | None = None
    manager_email: str | None = None
    title: str | None = None

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
    organization_id: str | None = None,
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
async def get_org_tree(organization_id: str | None = None, current_user = Depends(get_current_user_optional)):
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

@router.get("/members/search")
async def search_org_members(
    q: str = "",
    organization_id: str | None = None,
    current_user = Depends(get_current_user_optional)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = organization_id or get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

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
async def list_org_members(organization_id: str | None = None, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = organization_id or get_user_org_id(current_user)
    if not org_id:
        return {"members": [], "total": 0}

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
    organization_id: str | None = None
):
    """Save a custom role that wasn't in the common list so it appears in future suggestions."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

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


@router.get("/role-suggestions")
async def get_role_suggestions(
    q: str = "",
    organization_id: str | None = None,
    current_user = Depends(get_current_user_optional)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = organization_id or get_user_org_id(current_user)
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
