import re
import logging
from typing import Optional
from urllib.parse import urlparse, urljoin
import requests
from bs4 import BeautifulSoup

logger = logging.getLogger("yesboss.scraper")


SOCIAL_DOMAINS = {
    "linkedin": ["linkedin.com"],
    "twitter": ["twitter.com", "x.com", "t.co"],
    "instagram": ["instagram.com", "instagr.am"],
    "facebook": ["facebook.com", "fb.com", "fb.me"],
    "youtube": ["youtube.com", "youtu.be", "yt.be"],
}

SOCIAL_PATTERNS = {
    "linkedin": [
        r"https?://(?:www\.)?linkedin\.com/company/([a-zA-Z0-9-]+)",
        r"https?://(?:www\.)?linkedin\.com/in/([a-zA-Z0-9-]+)",
        r"https?://(?:www\.)?linkedin\.com/org/([a-zA-Z0-9-]+)",
        r"https?://(?:www\.)?linkedin\.com/showcase/([a-zA-Z0-9-]+)",
        r"linkedin\.com/company/([a-zA-Z0-9-]+)",
        r"linkedin\.com/in/([a-zA-Z0-9-]+)",
        r"linkedin\.com/showcase/([a-zA-Z0-9-]+)",
    ],
    "twitter": [
        r"https?://(?:www\.)?(?:twitter|x)\.com/([a-zA-Z0-9_]+)",
        r"(?:twitter|x)\.com/([a-zA-Z0-9_]+)",
    ],
    "instagram": [
        r"https?://(?:www\.)?instagram\.com/([a-zA-Z0-9_.]+)",
        r"instagram\.com/([a-zA-Z0-9_.]+)",
    ],
    "facebook": [
        r"https?://(?:www\.)?facebook\.com/([a-zA-Z0-9._-]+)",
        r"https?://(?:www\.)?fb\.com/([a-zA-Z0-9._-]+)",
        r"(?:facebook|fb)\.com/([a-zA-Z0-9._-]+)",
    ],
    "youtube": [
        r"https?://(?:www\.)?youtube\.com/@([a-zA-Z0-9_-]+)",
        r"https?://(?:www\.)?youtube\.com/channel/([a-zA-Z0-9_-]+)",
        r"https?://(?:www\.)?youtube\.com/c/([a-zA-Z0-9_-]+)",
        r"https?://youtu\.be/([a-zA-Z0-9_-]+)",
        r"youtube\.com/@([a-zA-Z0-9_-]+)",
        r"youtube\.com/channel/([a-zA-Z0-9_-]+)",
        r"youtu\.be/([a-zA-Z0-9_-]+)",
    ],
}


def normalize_social_url(url: str, platform: str) -> str:
    url = url.strip().rstrip("/")
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    
    if platform == "linkedin":
        m = re.search(r'linkedin\.com/(company|in|org|showcase)/([^?#]+)', url, re.I)
        if m:
            handle = re.sub(r'[^a-zA-Z0-9-]', '', m.group(2))[:50]
            return f"https://www.linkedin.com/{m.group(1)}/{handle}" if handle else url.split("?")[0].split("#")[0]
        if "linkedin.com" in url.lower():
            return url.split("?")[0].split("#")[0]
    elif platform == "twitter":
        m = re.search(r'(?:twitter|x)\.com/([a-zA-Z0-9_]+)', url, re.I)
        if m:
            return f"https://x.com/{m.group(1)}"
    elif platform == "instagram":
        m = re.search(r'instagram\.com/([a-zA-Z0-9_.]+)', url, re.I)
        if m:
            return f"https://www.instagram.com/{m.group(1)}"
    elif platform == "facebook":
        m = re.search(r'(?:facebook|fb)\.com/([a-zA-Z0-9._-]+)', url, re.I)
        if m:
            return f"https://www.facebook.com/{m.group(1)}"
    elif platform == "youtube":
        m = re.search(r'youtube\.com/@([a-zA-Z0-9_-]+)', url, re.I)
        if m:
            return f"https://www.youtube.com/@{m.group(1)}"
        m = re.search(r'youtube\.com/channel/([a-zA-Z0-9_-]+)', url, re.I)
        if m:
            return f"https://www.youtube.com/channel/{m.group(1)}"
        m = re.search(r'youtu\.be/([a-zA-Z0-9_-]+)', url, re.I)
        if m:
            return f"https://youtu.be/{m.group(1)}"
        if "youtube.com" in url.lower():
            return url
    return url.split("?")[0].split("#")[0]


def extract_social_from_href(href: str, base_url: str) -> dict:
    result = {}
    if not href:
        return result
    
    full_url = href if href.startswith(("http://", "https://")) else urljoin(base_url, href)
    
    for platform, patterns in SOCIAL_PATTERNS.items():
        for pattern in patterns:
            m = re.search(pattern, full_url, re.IGNORECASE)
            if m:
                result[platform] = normalize_social_url(full_url, platform)
                return result
    
    for platform, domains in SOCIAL_DOMAINS.items():
        for domain in domains:
            if domain in href.lower() or domain in full_url.lower():
                result[platform] = normalize_social_url(full_url, platform)
                return result
    
    return result


def extract_social_from_text(text: str) -> dict:
    result = {}
    
    for platform, patterns in SOCIAL_PATTERNS.items():
        if platform in result:
            continue
        for pattern in patterns:
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                url = m.group(0)
                if not url.startswith(("http://", "https://")):
                    url = "https://" + url
                result[platform] = normalize_social_url(url, platform)
                break
    
    return result


def search_social_profiles(company_name: str, domain: str) -> dict:
    """Search for social profiles using DuckDuckGo HTML search"""
    result = {}
    if not company_name:
        return result
    
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        
        clean_name = company_name.replace("&", "and").replace("  ", " ").strip()
        domain_name = domain.split(".")[0]
        
        searches = [
            (f"{clean_name} linkedin company site:linkedin.com", "linkedin"),
            (f"{domain_name} linkedin site:linkedin.com", "linkedin"),
            (f"{clean_name} twitter OR x.com site:x.com OR site:twitter.com", "twitter"),
            (f"{clean_name} instagram site:instagram.com", "instagram"),
            (f"{clean_name} facebook site:facebook.com", "facebook"),
        ]
        
        for query, target_platform in searches:
            if target_platform in result:
                continue
            
            try:
                search_url = f"https://html.duckduckgo.com/html/?q={query.replace(' ', '+')}"
                resp = requests.get(search_url, headers=headers, timeout=5)
                
                if resp.status_code == 200:
                    soup = BeautifulSoup(resp.text, "html.parser")
                    
                    for a in soup.find_all("a", href=True):
                        href = a.get("href", "")
                        social = extract_social_from_href(href, "")
                        if social:
                            for p, url in social.items():
                                if p not in result:
                                    result[p] = url
                    
                    if len(result) >= 4:
                        break
                        
            except Exception:
                continue
                
    except Exception:
        pass
    
    return result


def try_common_social_urls(company_name: str, domain: str) -> dict:
    """Try common social URL patterns based on company name"""
    result = {}
    if not company_name:
        return result
    
    # Clean company name: remove special chars, keep only alphanumeric and spaces
    clean_name = re.sub(r'[^a-zA-Z0-9\s]', '', company_name).lower().strip()
    clean_name = clean_name.replace(" ", "").replace("-", "").replace("&", "and").replace(".", "")
    clean_name = clean_name[:30]  # Limit length
    domain_name = domain.split(".")[0].lower().replace("-", "").replace("_", "")[:30]
    
    handles = list(set([clean_name, domain_name]))
    
    for handle in handles:
        if not handle or len(handle) < 2:
            continue
        
        # LinkedIn - always add since LinkedIn blocks automated checks (returns 999)
        if "linkedin" not in result:
            result["linkedin"] = f"https://www.linkedin.com/company/{handle}"
        
        candidates = {
            "twitter": [f"https://x.com/{handle}"],
            "instagram": [f"https://www.instagram.com/{handle}"],
            "facebook": [f"https://www.facebook.com/{handle}"],
            "youtube": [f"https://www.youtube.com/@{handle}"],
        }
        
        for platform, urls in candidates.items():
            if platform in result:
                continue
            
            for url in urls:
                try:
                    resp = requests.head(url, timeout=3, allow_redirects=True)
                    if resp.status_code in [200, 301, 302]:
                        final_url = resp.url
                        if "not found" not in final_url.lower() and "blocked" not in final_url.lower() and resp.status_code != 404:
                            result[platform] = normalize_social_url(final_url, platform)
                            break
                except Exception:
                    pass
        
        if len(result) >= 5:
            break
    
    return result


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
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
    }
    
    soup = None
    company_name = domain.split(".")[0].replace("-", " ").replace("_", " ").title()
    
    try:
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
        
        company_name = result["name"] or company_name
        
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
        
        # === AGGRESSIVE SOCIAL LINK DETECTION ===
        
        # Strategy 1: All href attributes on the page
        for tag in soup.find_all(href=True):
            href = tag.get("href", "")
            social = extract_social_from_href(href, base_url)
            result["social_links"].update(social)
            if len(result["social_links"]) >= 6:
                break
        
        # Strategy 2: Meta tags
        for meta in soup.find_all("meta", content=True):
            content = meta.get("content", "")
            prop = (meta.get("property") or meta.get("name") or "").lower()
            
            if "twitter:site" in prop or "twitter:creator" in prop:
                handle = content.strip().lstrip("@")
                if handle:
                    result["social_links"]["twitter"] = f"https://x.com/{handle}"
            
            social = extract_social_from_text(content)
            result["social_links"].update(social)
        
        # Strategy 3: Link tags
        for link_tag in soup.find_all("link", rel=True, href=True):
            href = link_tag.get("href", "")
            social = extract_social_from_href(href, base_url)
            result["social_links"].update(social)
        
        # Strategy 4: Footer section
        footer = soup.find("footer")
        if footer:
            for a in footer.find_all("a", href=True):
                social = extract_social_from_href(a.get("href", ""), base_url)
                result["social_links"].update(social)
            
            for svg in footer.find_all("svg"):
                parent_a = svg.find_parent("a", href=True)
                if parent_a:
                    social = extract_social_from_href(parent_a.get("href", ""), base_url)
                    result["social_links"].update(social)
            
            social = extract_social_from_text(footer.get_text())
            result["social_links"].update(social)
        
        # Strategy 5: Entire page text
        if len(result["social_links"]) < 3:
            social = extract_social_from_text(soup.get_text())
            result["social_links"].update(social)
        
        # Strategy 6: Check common social pages
        social_pages = ["/social", "/connect", "/follow-us", "/contact", "/about"]
        for page in social_pages:
            if len(result["social_links"]) >= 4:
                break
            try:
                page_url = urljoin(base_url, page)
                resp = requests.get(page_url, headers=headers, timeout=5)
                if resp.status_code == 200:
                    page_soup = BeautifulSoup(resp.text, "html.parser")
                    for a in page_soup.find_all("a", href=True):
                        social = extract_social_from_href(a.get("href", ""), page_url)
                        result["social_links"].update(social)
            except Exception:
                continue
        
    except requests.RequestException as e:
        result["error"] = f"Request failed: {str(e)}"
    except Exception as e:
        result["error"] = f"Scraping failed: {str(e)}"
    
    # === FALLBACK STRATEGIES (always run, even if main scrape failed) ===
    
    # Strategy 7: DuckDuckGo search for social profiles
    missing = [p for p in SOCIAL_DOMAINS.keys() if p not in result["social_links"]]
    if missing and company_name:
        try:
            search_results = search_social_profiles(company_name, domain)
            for platform, url in search_results.items():
                if platform not in result["social_links"]:
                    result["social_links"][platform] = url
        except Exception:
            pass
    
    # Strategy 8: Try common URL patterns
    missing = [p for p in SOCIAL_DOMAINS.keys() if p not in result["social_links"]]
    if missing and company_name:
        try:
            common_results = try_common_social_urls(company_name, domain)
            for platform, url in common_results.items():
                if platform not in result["social_links"]:
                    result["social_links"][platform] = url
        except Exception:
            pass
    
    if soup and not result["about"]:
        try:
            about_section = soup.find(["section", "div"], class_=re.compile("about", re.I))
            if about_section:
                result["about"] = about_section.get_text(separator=" ", strip=True)[:3000]
        except Exception:
            pass
    
    if soup and not result["services"]:
        try:
            services_section = soup.find(["section", "div"], class_=re.compile("service|solution", re.I))
            if services_section:
                for header in services_section.find_all(["h2", "h3", "h4"]):
                    text = header.get_text(strip=True)
                    if text:
                        result["services"].append(text)
                result["services"] = result["services"][:10]
        except Exception:
            pass
    
    return result


async def scrape_with_searapi(domain: str, api_key: str) -> dict:
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
    return extract_social_from_text(text)


async def scrape_company_data(domain: str) -> dict:
    from ..core.config import settings
    
    searapi_key = getattr(settings, 'SEAR_API_KEY', None)
    
    if searapi_key:
        searapi_result = await scrape_with_searapi(domain, searapi_key)
        if searapi_result:
            content = searapi_result.get("homepage_content", "") + " " + searapi_result.get("about", "")
            name = searapi_result.get("name") or domain.split(".")[0].replace("-", " ").replace("_", " ").title()
            
            mv = searapi_result.get("micro_verticals") or searapi_result.get("micro_vertical", "")
            micro_verticals = mv if isinstance(mv, list) else ([mv] if mv else [])
            return {
                "name": searapi_result.get("name") or name,
                "description": content[:500],
                "industry": searapi_result.get("industry", "Technology"),
                "micro_vertical": micro_verticals[0] if micro_verticals else "",
                "micro_verticals": micro_verticals,
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
        
        micro_verticals = result.get("services", [])[:3] if result.get("services") else []
        return {
            "name": result.get("name") or name,
            "description": content[:500],
            "industry": industry,
            "micro_vertical": micro_verticals[0] if micro_verticals else "",
            "micro_verticals": micro_verticals,
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
            "micro_verticals": [],
            "size": "1-10",
            "social_links": {},
            "scraper": "fallback"
        }
