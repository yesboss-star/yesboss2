from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from ..core.intelligence import (
    analyze_company_from_email,
    analyze_company_from_domain,
    enrich_profile_with_ai,
    build_pre_org_profile
)

router = APIRouter()


class AnalyzeFromEmailRequest(BaseModel):
    email: str
    enrich_with_ai: bool = False
    ai_provider: Optional[str] = None


class AnalyzeFromDomainRequest(BaseModel):
    domain: str
    enrich_with_ai: bool = False
    ai_provider: Optional[str] = None


@router.post("/analyze/email")
async def analyze_from_email(request: AnalyzeFromEmailRequest):
    if not request.email or "@" not in request.email:
        raise HTTPException(status_code=400, detail="Valid email is required")
    
    profile = await analyze_company_from_email(request.email)
    
    if request.enrich_with_ai:
        profile = await enrich_profile_with_ai(profile, request.ai_provider)
    
    return {"profile": profile}


@router.post("/analyze/domain")
async def analyze_from_domain(request: AnalyzeFromDomainRequest):
    if not request.domain:
        raise HTTPException(status_code=400, detail="Domain is required")
    
    domain = request.domain.replace("https://", "").replace("http://", "").split("/")[0]
    profile = await analyze_company_from_domain(domain)
    
    if request.enrich_with_ai:
        profile = await enrich_profile_with_ai(profile, request.ai_provider)
    
    return {"profile": profile}


@router.get("/profile/{domain}")
async def get_profile(domain: str, enrich: bool = False, provider: Optional[str] = None):
    domain = domain.replace("https://", "").replace("http://", "").split("/")[0]
    profile = await build_pre_org_profile(domain)
    
    if enrich:
        profile = await enrich_profile_with_ai(profile, provider)
    
    return {"profile": profile}


@router.post("/company/search")
async def search_company(request: AnalyzeFromEmailRequest):
    if not request.email or len(request.email) < 2:
        raise HTTPException(status_code=400, detail="Company name must be at least 2 characters")
    
    from ..core.intelligence import search_company_info
    
    try:
        result = await search_company_info(request.email)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class DepartmentSuggestionsRequest(BaseModel):
    email: str | None = None
    role: str | None = None
    industry: str | None = None


DEPARTMENTS_BY_INDUSTRY = {
    "tech": ["Engineering", "Product", "Design", "Data Science", "DevOps", "Security", "IT", "Marketing", "Sales", "Operations"],
    "finance": ["Finance", "Accounting", "Risk", "Compliance", "Investment", "Auditing", "Legal", "Operations", "Technology"],
    "healthcare": ["Medical", "Nursing", "Pharmacy", "Lab", "Administration", "HR", "Finance", "Operations", "IT"],
    "retail": ["Merchandising", "Store Operations", "Supply Chain", "Marketing", "Sales", "Finance", "HR", "IT"],
    "manufacturing": ["Production", "Engineering", "Quality", "Supply Chain", "R&D", "Safety", "Finance", "HR", "IT"],
    "education": ["Teaching", "Curriculum", "Research", "Administration", "Admissions", "Finance", "IT", "HR"],
    "consulting": ["Strategy", "Implementation", "Analytics", "Finance", "Marketing", "HR", "IT", "Legal"],
    "default": ["Engineering", "Marketing", "Sales", "Operations", "Finance", "Human Resources", "Product", "Design", "Support", "Legal"],
}


@router.post("/department-suggestions")
async def get_department_suggestions(request: DepartmentSuggestionsRequest):
    domain = ""
    if request.email and "@" in request.email:
        domain = request.email.split("@")[1]
    
    industry = request.industry or "default"
    industry_key = next((k for k in DEPARTMENTS_BY_INDUSTRY.keys() if k in industry.lower()), "default")
    suggestions = DEPARTMENTS_BY_INDUSTRY.get(industry_key, DEPARTMENTS_BY_INDUSTRY["default"])
    
    if request.role:
        role_lower = request.role.lower()
        priority_depts = []
        if any(w in role_lower for w in ["engineer", "developer", "tech", "software"]):
            priority_depts = ["Engineering", "Product", "Data Science"]
        elif any(w in role_lower for w in ["market", "brand", "content"]):
            priority_depts = ["Marketing", "Content"]
        elif any(w in role_lower for w in ["sale", "account", "revenue"]):
            priority_depts = ["Sales", "Business Development"]
        elif any(w in role_lower for w in ["finance", "account", "budget"]):
            priority_depts = ["Finance", "Accounting"]
        elif any(w in role_lower for w in ["oper", "process", "project"]):
            priority_depts = ["Operations", "Project Management"]
        
        if priority_depts:
            suggestions = priority_depts + [s for s in suggestions if s not in priority_depts]
    
    return {"suggestions": suggestions[:8]}