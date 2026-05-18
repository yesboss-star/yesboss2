from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..core.scraper import scrape_company, scrape_with_firecrawl

router = APIRouter()


class ScrapeRequest(BaseModel):
    domain: str
    use_firecrawl: bool = False


class ScrapeResponse(BaseModel):
    domain: str
    homepage_content: str
    about: str
    services: list[str]
    social_links: dict
    error: str | None = None


@router.post("/scrape", response_model=ScrapeResponse)
async def scrape_website(request: ScrapeRequest):
    if not request.domain:
        raise HTTPException(status_code=400, detail="Domain is required")
    
    domain = request.domain.replace("https://", "").replace("http://", "").split("/")[0]
    
    if request.use_firecrawl:
        result = await scrape_with_firecrawl(domain)
    else:
        result = await scrape_company(domain)
    
    return ScrapeResponse(**result)


@router.get("/social-detect")
async def detect_social_links(url: str):
    from ..core.scraper import extract_social_links_from_text
    links = extract_social_links_from_text(url)
    return {"url": url, "social_links": links}