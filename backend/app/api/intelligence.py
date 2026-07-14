
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..core.intelligence import (
    analyze_company_from_domain,
    analyze_company_from_email,
    build_pre_org_profile,
    enrich_profile_with_ai,
    suggest_growth_documents,
    suggest_industries,
    suggest_micro_verticals,
)
from ..core.taxonomy_store import get_custom_matches
from ..core.taxonomy_store import save_custom as save_custom_taxonomy

router = APIRouter()


class AnalyzeFromEmailRequest(BaseModel):
    email: str
    enrich_with_ai: bool = False
    ai_provider: str | None = None


class AnalyzeFromDomainRequest(BaseModel):
    domain: str
    enrich_with_ai: bool = False
    ai_provider: str | None = None


class SuggestRequest(BaseModel):
    query: str = ""
    industry: str | None = None
    type: str = "industries"
    limit: int = 8


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
async def get_profile(domain: str, enrich: bool = False, provider: str | None = None):
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


@router.post("/suggest")
async def suggest_taxonomy(request: SuggestRequest):
    """Suggest industry or micro-vertical names powered by Grok AI.

    Results are merged with community-contributed custom values so the catalog
    grows over time as users type their own industries/verticals.
    """
    if request.type not in ("industries", "micro_verticals"):
        raise HTTPException(status_code=400, detail="type must be 'industries' or 'micro_verticals'")

    try:
        limit = max(1, min(request.limit or 50, 100))
        if request.type == "industries":
            suggestions = await suggest_industries(request.query or "", limit=limit)
        else:
            suggestions = await suggest_micro_verticals(
                request.query or "",
                industry=request.industry or "",
                limit=limit,
            )
        customs = get_custom_matches(request.type, request.query or "", limit=limit)
        merged: list[str] = []
        seen: set[str] = set()
        for s in list(customs) + list(suggestions):
            if not s:
                continue
            key = s.strip().lower()
            if not key or key in seen:
                continue
            seen.add(key)
            merged.append(s)
            if len(merged) >= limit:
                break
        return {"type": request.type, "query": request.query, "suggestions": merged}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class SaveCustomTaxonomyRequest(BaseModel):
    type: str
    value: str
    industry: str | None = None


@router.post("/taxonomy/save")
async def save_custom(request: SaveCustomTaxonomyRequest):
    """Persist a user-typed custom industry / micro-vertical / company name.

    Used when the user types something that's not in the AI suggestions —
    we store it as 'Other' so the catalog expands over time.
    """
    if request.type not in ("industries", "micro_verticals", "company_names"):
        raise HTTPException(
            status_code=400,
            detail="type must be 'industries', 'micro_verticals', or 'company_names'",
        )
    if not request.value or len(request.value.strip()) < 1:
        raise HTTPException(status_code=400, detail="value is required")
    context = {}
    if request.industry:
        context["industry"] = request.industry
    result = save_custom_taxonomy(request.type, request.value, context=context or None)
    if not result.get("saved"):
        raise HTTPException(status_code=400, detail=result.get("error", "Could not save"))
    return result


class SuggestCompanyNamesRequest(BaseModel):
    query: str = ""
    industry: str | None = None
    limit: int = 20


@router.post("/company-name-suggest")
async def suggest_company_names(request: SuggestCompanyNamesRequest):
    """Suggest company names powered by Grok AI (Google-like suggestions).

    Returns AI-generated company name ideas plus community-contributed ones.
    """
    from ..core.intelligence import suggest_company_names as _suggest_company_names

    try:
        limit = max(1, min(request.limit or 20, 50))
        ai_suggestions = await _suggest_company_names(
            request.query or "",
            industry=request.industry or "",
            limit=limit,
        )
        customs = get_custom_matches("company_names", request.query or "", limit=limit)
        merged: list[str] = []
        seen: set[str] = set()
        for s in list(customs) + list(ai_suggestions):
            if not s:
                continue
            key = s.strip().lower()
            if not key or key in seen:
                continue
            seen.add(key)
            merged.append(s)
            if len(merged) >= limit:
                break
        return {"query": request.query, "suggestions": merged}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
    if request.email and "@" in request.email:
        request.email.split("@")[1]

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


class DocumentSuggestionsRequest(BaseModel):
    domain: str | None = None
    company_name: str | None = None
    industry: str | None = None
    micro_vertical: str | None = None
    size: str | None = None
    existing_documents: list | None = None
    count: int = 10


@router.post("/document-suggestions")
async def get_growth_document_suggestions(request: DocumentSuggestionsRequest):
    """Suggest growth-driving documents for this specific business.
    Returns a business context summary + categorized recommendations."""
    return await suggest_growth_documents(
        domain=request.domain or "",
        company_name=request.company_name or "",
        industry=request.industry or "",
        micro_vertical=request.micro_vertical or "",
        size=request.size or "",
        existing_documents=request.existing_documents or [],
        count=request.count,
    )
