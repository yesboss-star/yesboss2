from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from ..core.social_detector import (
    detect_social_presence,
    verify_social_url,
    detect_from_company_name,
    format_social_data
)

router = APIRouter()


class DetectSocialRequest(BaseModel):
    domain: str
    company_name: Optional[str] = None


class VerifyUrlRequest(BaseModel):
    url: str
    platform: str


class CompanyNameRequest(BaseModel):
    company_name: str
    existing_domains: Optional[list] = None


@router.post("/detect")
async def detect_social_links(request: DetectSocialRequest):
    if not request.domain:
        raise HTTPException(status_code=400, detail="Domain is required")
    
    domain = request.domain.replace("https://", "").replace("http://", "").split("/")[0]
    
    social_data = await detect_social_presence(domain)
    formatted = format_social_data(social_data)
    
    return {
        "domain": domain,
        "social_links": formatted,
        "detected_count": sum(1 for s in formatted if s.get("detected"))
    }


@router.post("/verify")
async def verify_url(request: VerifyUrlRequest):
    if not request.url or not request.platform:
        raise HTTPException(status_code=400, detail="url and platform are required")
    
    result = await verify_social_url(request.url, request.platform)
    return result


@router.post("/detect-by-name")
async def detect_by_company_name(request: CompanyNameRequest):
    if not request.company_name:
        raise HTTPException(status_code=400, detail="company_name is required")
    
    social_data = await detect_from_company_name(
        request.company_name,
        request.existing_domains
    )
    formatted = format_social_data(social_data)
    
    return {
        "company_name": request.company_name,
        "social_links": formatted,
        "detected_count": sum(1 for s in formatted if s.get("detected"))
    }


@router.get("/platforms")
async def get_platforms():
    from ..core.social_detector import SOCIAL_PLATFORMS
    
    return {
        "platforms": [
            {
                "id": platform,
                "name": config["name"],
                "icon": config["icon"]
            }
            for platform, config in SOCIAL_PLATFORMS.items()
        ]
    }