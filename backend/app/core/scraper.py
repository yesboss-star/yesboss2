import re
import logging
from typing import Optional
from urllib.parse import urlparse, urljoin
import requests
from bs4 import BeautifulSoup

logger = logging.getLogger("yesboss.scraper")


SOCIAL_PLATFORMS = {
    "linkedin": r"linkedin\.com/company/",
    "twitter": r"(twitter\.com|x\.com)/",
    "instagram": r"instagram\.com/",
    "facebook": r"facebook\.com/",
    "youtube": r"youtube\.com/@|youtube\.com/channel/",
    "tiktok": r"tiktok\.com/@",
}


async def scrape_company(domain: str) -> dict:
    base_url = f"https://{domain}" if not domain.startswith(("http://", "https://")) else domain
    
    result = {
        "domain": domain,
        "name": "",
        "homepage_content": "",
        "about": "",
        "services": [],
        "social_links": {},
        "error": None
    }
    
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        
        response = requests.get(base_url, headers=headers, timeout=15)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, "html.parser")
        
        title = soup.find("title")
        if title:
            result["name"] = title.get_text(strip=True).split("|")[0].split("-")[0].strip()
        
        og_title = soup.find("meta", property="og:title")
        if og_title and og_title.get("content"):
            result["name"] = og_title["content"].strip()
        
        h1_tag = soup.find("h1")
        if h1_tag and not result["name"]:
            result["name"] = h1_tag.get_text(strip=True)
        
        for script in soup(["script", "style"]):
            script.decompose()
        
        text = soup.get_text(separator=" ", strip=True)
        text = re.sub(r'\s+', ' ', text)
        result["homepage_content"] = text[:5000]
        
        about_keywords = ["about", "about us", "who we are", "our story", "company", "mission", "vision", "values"]
        for link in soup.find_all("a", href=True):
            href = link.get("href", "").lower()
            if any(kw in href for kw in about_keywords):
                about_url = urljoin(base_url, href)
                try:
                    about_response = requests.get(about_url, headers=headers, timeout=10)
                    about_soup = BeautifulSoup(about_response.text, "html.parser")
                    for script in about_soup(["script", "style"]):
                        script.decompose()
                    about_text = about_soup.get_text(separator=" ", strip=True)
                    result["about"] = re.sub(r'\s+', ' ', about_text)[:3000]
                    break
                except Exception:
                    continue
        
        services_keywords = ["services", "solutions", "what we do", "offerings", "products"]
        for link in soup.find_all("a", href=True):
            href = link.get("href", "").lower()
            if any(kw in href for kw in services_keywords):
                services_url = urljoin(base_url, href)
                try:
                    services_response = requests.get(services_url, headers=headers, timeout=10)
                    services_soup = BeautifulSoup(services_response.text, "html.parser")
                    
                    service_items = []
                    for header in services_soup.find_all(["h2", "h3", "h4"]):
                        text = header.get_text(strip=True)
                        if text and len(text) > 3:
                            service_items.append(text)
                    
                    result["services"] = service_items[:10]
                    break
                except Exception:
                    continue
        
        for platform, pattern in SOCIAL_PLATFORMS.items():
            links = soup.find_all("a", href=True)
            for link in links:
                href = link.get("href", "")
                if re.search(pattern, href, re.IGNORECASE):
                    full_url = href if href.startswith("http") else urljoin(base_url, href)
                    result["social_links"][platform] = full_url
                    break
        
        if not result["about"]:
            about_section = soup.find(["section", "div"], class_=re.compile("about", re.I))
            if about_section:
                result["about"] = about_section.get_text(separator=" ", strip=True)[:3000]
        
        if not result["services"]:
            services_section = soup.find(["section", "div"], class_=re.compile("service|solution", re.I))
            if services_section:
                for header in services_section.find_all(["h2", "h3", "h4"]):
                    text = header.get_text(strip=True)
                    if text:
                        result["services"].append(text)
                result["services"] = result["services"][:10]
        
    except requests.RequestException as e:
        result["error"] = f"Request failed: {str(e)}"
    except Exception as e:
        result["error"] = f"Scraping failed: {str(e)}"
    
    return result


async def scrape_with_searapi(domain: str, api_key: str) -> dict:
    """Scrape using SearAPI"""
    try:
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        base_url = f"https://{domain}"
        
        response = requests.post(
            "https://api.searapi.com/scrape",
            headers=headers,
            json={"url": base_url, "extract": ["title", "description", "content", "social"]},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            return {
                "domain": domain,
                "name": data.get("title", ""),
                "homepage_content": data.get("content", ""),
                "about": data.get("description", ""),
                "services": data.get("services", []),
                "social_links": data.get("social_links", {}),
                "searapi_result": True
            }
        else:
            logger.warning(f"SearAPI failed with status {response.status_code}")
            return None
    except Exception as e:
        logger.error(f"SearAPI error: {e}")
        return None


async def scrape_with_firecrawl(domain: str, api_key: Optional[str] = None) -> dict:
    if not api_key:
        return await scrape_company(domain)
    
    try:
        from firecrawl import FirecrawlApp
        
        app = FirecrawlApp(api_key=api_key)
        scrape_result = app.scrape_url(url=f"https://{domain}")
        
        return {
            "domain": domain,
            "homepage_content": scrape_result.content if hasattr(scrape_result, "content") else "",
            "about": "",
            "services": [],
            "social_links": {},
            "firecrawl_result": True
        }
    except Exception as e:
        return await scrape_company(domain)


def extract_social_links_from_text(text: str) -> dict:
    social_links = {}
    
    for platform, pattern in SOCIAL_PLATFORMS.items():
        matches = re.findall(r'https?://[^\s<>"]*' + pattern.replace("\\", "") + r'[^\s<>"]*', text, re.IGNORECASE)
        if matches:
            social_links[platform] = matches[0]
    
    return social_links


async def scrape_company_data(domain: str) -> dict:
    """Scrape company data for industry detection - uses multiple sources"""
    from ..core.config import settings
    
    searapi_key = getattr(settings, 'SEAR_API_KEY', None)
    
    if searapi_key:
        searapi_result = await scrape_with_searapi(domain, searapi_key)
        if searapi_result:
            content = searapi_result.get("homepage_content", "") + " " + searapi_result.get("about", "")
            name = searapi_result.get("name") or domain.split(".")[0].replace("-", " ").replace("_", " ").title()
            
            return {
                "name": searapi_result.get("name") or name,
                "description": content[:500],
                "industry": searapi_result.get("industry", "Technology"),
                "micro_vertical": searapi_result.get("micro_vertical", ""),
                "size": searapi_result.get("size", "1-10"),
                "social_links": searapi_result.get("social_links", {}),
                "scraper": "searapi"
            }
    
    try:
        result = await scrape_company(domain)
        
        content = result.get("homepage_content", "") + " " + result.get("about", "")
        content_lower = content.lower()
        
        name = result.get("name") or domain.split(".")[0].replace("-", " ").replace("_", " ").title()
        
        industry = "Technology"
        industry_patterns = {
            "fintech": "Finance", "banking": "Finance", "payment": "Finance", "investment": "Finance",
            "health": "Healthcare", "medical": "Healthcare", "hospital": "Healthcare", "pharma": "Healthcare",
            "retail": "Retail", "shop": "Retail", "store": "Retail", "e-commerce": "Retail",
            "manufactur": "Manufacturing", "factory": "Manufacturing", "production": "Manufacturing",
            "consulting": "Consulting", "advisory": "Consulting",
            "education": "Education", "learning": "Education", "school": "Education",
            "real estate": "Real Estate", "property": "Real Estate",
            "logistics": "Logistics", "shipping": "Logistics", "delivery": "Logistics",
            "food": "Food & Beverage", "restaurant": "Food & Beverage",
            "media": "Media & Entertainment", "entertainment": "Media & Entertainment",
            "automotive": "Manufacturing", "car": "Manufacturing",
            "software": "Technology", "app": "Technology", "cloud": "Technology", "saas": "Technology",
            "ai": "Technology", "ml": "Technology", "data": "Technology",
        }
        
        for pattern, ind in industry_patterns.items():
            if pattern in content_lower:
                industry = ind
                break
        
        return {
            "name": result.get("name") or name,
            "description": content[:500],
            "industry": industry,
            "micro_vertical": result.get("services", [])[:3] if result.get("services") else "",
            "size": "1-10",
            "social_links": result.get("social_links", {}),
            "scraper": "beautifulsoup"
        }
    except Exception as e:
        logger.error(f"Failed to scrape company data: {e}")
        return {
            "name": domain.split(".")[0].title(),
            "description": "",
            "industry": "Technology",
            "micro_vertical": "",
            "size": "1-10",
            "social_links": {},
            "scraper": "fallback"
        }