import re
import json
import logging
from typing import Optional
from urllib.parse import urljoin, urlparse

logger = logging.getLogger("yesboss.social_detector")

SOCIAL_PLATFORMS = {
    "linkedin": {
        "name": "LinkedIn",
        "patterns": [
            r"https?://(?:www\.)?linkedin\.com/company/([a-zA-Z0-9-]+)",
            r"https?://(?:www\.)?linkedin\.com/in/([a-zA-Z0-9-]+)",
            r"linkedin\.com/company/([a-zA-Z0-9-]+)",
            r"linkedin\.com/in/([a-zA-Z0-9-]+)",
        ],
        "icon": "linkedin",
    },
    "twitter": {
        "name": "Twitter / X",
        "patterns": [
            r"https?://(?:www\.)?(?:twitter|x)\.com/([a-zA-Z0-9_]+)",
            r"(?:twitter|x)\.com/([a-zA-Z0-9_]+)",
        ],
        "icon": "twitter",
    },
    "instagram": {
        "name": "Instagram",
        "patterns": [
            r"https?://(?:www\.)?instagram\.com/([a-zA-Z0-9_.]+)",
            r"instagram\.com/([a-zA-Z0-9_.]+)",
        ],
        "icon": "instagram",
    },
    "facebook": {
        "name": "Facebook",
        "patterns": [
            r"https?://(?:www\.)?facebook\.com/([a-zA-Z0-9._-]+)",
            r"https?://(?:www\.)?fb\.com/([a-zA-Z0-9._-]+)",
            r"(?:facebook|fb)\.com/([a-zA-Z0-9._-]+)",
        ],
        "icon": "facebook",
    },
    "youtube": {
        "name": "YouTube",
        "patterns": [
            r"https?://(?:www\.)?youtube\.com/@([a-zA-Z0-9_-]+)",
            r"https?://(?:www\.)?youtube\.com/channel/([a-zA-Z0-9_-]+)",
            r"https?://(?:www\.)?youtube\.com/c/([a-zA-Z0-9_-]+)",
            r"https?://youtu\.be/([a-zA-Z0-9_-]+)",
            r"youtube\.com/@([a-zA-Z0-9_-]+)",
            r"youtube\.com/channel/([a-zA-Z0-9_-]+)",
            r"youtu\.be/([a-zA-Z0-9_-]+)",
        ],
        "icon": "youtube",
    },
}


def normalize_url(url: str, platform: str) -> str:
    url = url.strip().rstrip("/")
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    if platform == "linkedin":
        m = re.search(r'linkedin\.com/(company|in|org)/([a-zA-Z0-9-]+)', url, re.I)
        if m:
            return f"https://www.linkedin.com/{m.group(1)}/{m.group(2)}"
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
    return url


def extract_handle_from_url(url: str, platform: str) -> Optional[str]:
    if not url:
        return None
    if platform == "linkedin":
        m = re.search(r'linkedin\.com/(company|in|org)/([a-zA-Z0-9-]+)', url)
        return m.group(2) if m else None
    elif platform == "twitter":
        m = re.search(r'(?:twitter|x)\.com/([a-zA-Z0-9_]+)', url)
        return m.group(1) if m else None
    elif platform == "instagram":
        m = re.search(r'instagram\.com/([a-zA-Z0-9_.]+)', url)
        return m.group(1) if m else None
    elif platform == "facebook":
        m = re.search(r'(?:facebook|fb)\.com/([a-zA-Z0-9._-]+)', url)
        return m.group(1) if m else None
    elif platform == "youtube":
        m = re.search(r'(?:youtube\.com/@|youtube\.com/channel/|youtu\.be/)([a-zA-Z0-9_-]+)', url)
        return m.group(1) if m else None
    return None


def _score_url(url: str, domain: str, company_name: str) -> int:
    domain_base = domain.split(".")[0].lower().replace("-", "").replace("_", "")
    name_base = company_name.lower().replace(" ", "").replace("-", "").replace("_", "").replace(".", "")
    url_lower = url.lower()
    score = 0
    if domain_base and domain_base in url_lower:
        score += 3
    if name_base and (name_base in url_lower or name_base[:5] in url_lower):
        score += 2
    if re.search(r'/(company|in|org|showcase)/', url_lower):
        score += 1
    if re.search(r'/channel/', url_lower):
        score += 1
    handle = url_lower.rstrip("/").split("/")[-1]
    if handle and len(handle) > 2 and not re.search(r'^(search|login|signup|home|feed|explore|pages|share|sharer|popup)$', handle):
        score += 1
    return score


def _url_exists(url: str, company_name: str = "", domain: str = "") -> bool:
    """Strict existence check: only confirm a URL if the resolved page actually
    appears to belong to the company. Pure 200 OK is not enough — many platforms
    return 200 with a generic landing page even for non-existent profiles."""
    try:
        import requests
        resp = requests.get(url, timeout=8, allow_redirects=True, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        })
        if resp.status_code in [404, 410]:
            return False

        body_lower = resp.text.lower()[:5000]
        final_url = (resp.url or url).lower()

        not_found_indicators = [
            "page not found", "this page doesn't exist", "this page isn't available",
            "sorry, this page isn't available", "link is broken", "no results found",
            "this profile doesn't exist", "page doesn't exist", "can't find this page",
            "the page you requested was not found", "this account is suspended",
            "account suspended", "this account has been suspended", "user not found",
            "this user is deactivated", "hmm... this page didn't load", "page not available",
        ]
        if any(indicator in body_lower for indicator in not_found_indicators):
            return False

        # If we have a company hint, require the page to actually look like it belongs
        # to the company. Otherwise we'd accept any 200 page.
        hints: list[str] = []
        if company_name:
            cleaned = re.sub(r"[^a-z0-9]", "", company_name.lower())
            if cleaned:
                hints.append(cleaned)
        if domain:
            base = domain.split(".")[0].lower()
            base_clean = re.sub(r"[^a-z0-9]", "", base)
            if base_clean and len(base_clean) >= 2:
                hints.append(base_clean)

        if hints and not any(h in body_lower or h in final_url for h in hints):
            return False

        return True
    except Exception:
        return False


# ============================================================
# SOURCE 1: SearAPI
# ============================================================
async def _source_searapi(domain: str, base_url: str, api_key: str) -> dict:
    detected = {}
    try:
        import requests as sync_req
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        resp = sync_req.post(
            "https://api.searapi.com/scrape",
            headers=headers,
            json={"url": base_url, "extract": ["title", "description", "content", "social"]},
            timeout=30
        )
        if resp.status_code == 200:
            data = resp.json()
            social = data.get("social_links", data.get("data", {}).get("social_links", {}))
            for platform, config in SOCIAL_PLATFORMS.items():
                url = social.get(platform, "")
                if url:
                    detected[platform] = normalize_url(url, platform)
            content = data.get("content", data.get("data", {}).get("content", ""))
            if isinstance(content, str):
                for platform, config in SOCIAL_PLATFORMS.items():
                    if platform in detected:
                        continue
                    for pattern in config["patterns"]:
                        m = re.search(pattern, content, re.IGNORECASE)
                        if m:
                            url = m.group(0)
                            if not url.startswith(("http://", "https://")):
                                url = "https://" + url
                            detected[platform] = normalize_url(url, platform)
                            break
            logger.info(f"SearAPI found {len(detected)} social links for {domain}")
    except Exception as e:
        logger.warning(f"SearAPI failed for {domain}: {e}")
    return detected


# ============================================================
# SOURCE 2: Firecrawl
# ============================================================
async def _source_firecrawl(domain: str, base_url: str, api_key: str) -> dict:
    detected = {}
    try:
        from firecrawl import FirecrawlApp
        app = FirecrawlApp(api_key=api_key)
        result = app.scrape_url(url=base_url)
        raw = ""
        if hasattr(result, "content") and result.content:
            raw = result.content
        elif isinstance(result, dict):
            d = result.get("data", result)
            raw = d.get("content", d.get("markdown", ""))
        if raw:
            for platform, config in SOCIAL_PLATFORMS.items():
                for pattern in config["patterns"]:
                    m = re.search(pattern, raw, re.IGNORECASE)
                    if m:
                        url = m.group(0)
                        if not url.startswith(("http://", "https://")):
                            url = "https://" + url
                        detected[platform] = normalize_url(url, platform)
                        break
            logger.info(f"Firecrawl found {len(detected)} social links for {domain}")
    except Exception as e:
        logger.warning(f"Firecrawl failed for {domain}: {e}")
    return detected


# ============================================================
# SOURCE 3: BeautifulSoup (href + meta + full page text)
# ============================================================
async def _source_beautifulsoup(domain: str, base_url: str) -> dict:
    detected = {}
    try:
        import requests as sync_req
        from bs4 import BeautifulSoup
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        resp = sync_req.get(base_url, headers=headers, timeout=10)
        html = resp.text
        soup = BeautifulSoup(html, "html.parser")

        # Pass 1: <a href> tags
        for tag in soup.find_all(href=True):
            href = tag.get("href", "")
            full_url = href if href.startswith(("http://", "https://")) else urljoin(base_url, href)
            for platform, config in SOCIAL_PLATFORMS.items():
                if platform in detected:
                    continue
                for pattern in config["patterns"]:
                    m = re.search(pattern, full_url, re.IGNORECASE)
                    if m:
                        detected[platform] = normalize_url(full_url, platform)
                        break

        # Pass 2: <meta> tags (og:url, twitter:site, etc.)
        for meta in soup.find_all("meta", content=True):
            content = meta.get("content", "")
            prop = (meta.get("property") or meta.get("name") or "").lower()
            if "twitter:site" in prop or "twitter:creator" in prop:
                handle = content.strip().lstrip("@")
                if handle and "twitter" not in detected:
                    detected["twitter"] = normalize_url(f"https://x.com/{handle}", "twitter")
            for platform, config in SOCIAL_PLATFORMS.items():
                if platform in detected:
                    continue
                for pattern in config["patterns"]:
                    m = re.search(pattern, content, re.IGNORECASE)
                    if m:
                        url = m.group(0)
                        if not url.startswith(("http://", "https://")):
                            url = "https://" + url
                        detected[platform] = normalize_url(url, platform)
                        break

        # Pass 3: Full page text (companies often list social as plain text)
        page_text = soup.get_text(separator=" ", strip=True)
        for platform, config in SOCIAL_PLATFORMS.items():
            if platform in detected:
                continue
            for pattern in config["patterns"]:
                m = re.search(pattern, page_text, re.IGNORECASE)
                if m:
                    url = m.group(0)
                    if not url.startswith(("http://", "https://")):
                        url = "https://" + url
                    detected[platform] = normalize_url(url, platform)
                    break

        logger.info(f"BeautifulSoup found {len(detected)} social links for {domain}")
    except Exception as e:
        logger.warning(f"BeautifulSoup failed for {domain}: {e}")
    return detected


# ============================================================
# SOURCE 4: DuckDuckGo search
# ============================================================
async def _source_duckduckgo(company_name: str, domain: str) -> dict:
    detected = {}
    if not company_name:
        return detected
    try:
        import requests as sync_req
        from bs4 import BeautifulSoup
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        clean_name = company_name.replace("&", "and").replace("  ", " ").strip()
        domain_name = domain.split(".")[0]

        searches = [
            (f"{clean_name} linkedin", "linkedin"),
            (f"{domain_name} linkedin", "linkedin"),
            (f"{clean_name} twitter OR x.com", "twitter"),
            (f"{domain_name} twitter OR x.com", "twitter"),
            (f"{clean_name} instagram", "instagram"),
            (f"{clean_name} facebook", "facebook"),
            (f"{clean_name} youtube", "youtube"),
        ]

        for query_text, target in searches:
            if target in detected:
                continue
            try:
                search_url = f"https://html.duckduckgo.com/html/?q={query_text.replace(' ', '+')}"
                resp = sync_req.get(search_url, headers=headers, timeout=5)
                if resp.status_code == 200:
                    soup = BeautifulSoup(resp.text, "html.parser")
                    for a in soup.find_all("a", href=True):
                        href = a.get("href", "")
                        for pattern in SOCIAL_PLATFORMS[target]["patterns"]:
                            m = re.search(pattern, href, re.IGNORECASE)
                            if m:
                                url = m.group(0)
                                if not url.startswith(("http://", "https://")):
                                    url = "https://" + url
                                detected[target] = normalize_url(url, target)
                                break
                        if target in detected:
                            break
            except Exception:
                continue

        logger.info(f"DuckDuckGo found {len(detected)} social links for {domain}")
    except Exception as e:
        logger.warning(f"DuckDuckGo failed: {e}")
    return detected


# ============================================================
# SOURCE 5: Common URL patterns
# ============================================================
# NOTE: This source was previously responsible for hallucinated links — it would
# guess handles from the company/domain name and accept any 200 response as a
# match. It is intentionally disabled; we only return URLs that were explicitly
# observed on the company's website or returned by a real search index.
def _source_common_patterns(company_name: str, domain: str) -> dict:
    return {}


# ============================================================
# SOURCE 6: xAI Grok validation
# ============================================================
async def _source_ai_validation(domain: str, company_name: str, all_candidates: dict, page_content: str) -> dict:
    validated = {}
    try:
        from .ai_client import get_ai_response
        from .prompt_engine import PERSONA_INSTRUCTIONS

        candidates_json = {}
        for platform, url in sorted(all_candidates.items()):
            candidates_json[platform] = url

        if not candidates_json:
            return validated

        content_preview = page_content[:2500] if page_content else ""

        prompt = f"""I need to VERIFY social media URLs for a company. My job is ONLY to check if the provided candidate URLs actually belong to this company.

Company domain: {domain}
Company name: {company_name}

Candidate social URLs found on the website:
{json.dumps(candidates_json, indent=2)}

Website content:
{content_preview}

For each platform (linkedin, twitter, instagram, facebook, youtube), return the URL ONLY if it is CONFIRMED to belong to this company based on the website content. Return empty string if unsure.

CRITICAL RULES:
1. NEVER invent or guess a URL. Only return URLs that were provided as candidates.
2. If a URL is provided and it CORRECTLY matches the company → return it
3. If a URL is provided but WRONG → return ""
4. If a URL is NOT provided → return ""
5. Be CONSERVATIVE - only confirm URLs you are highly confident about

Example:
{{"linkedin": "https://www.linkedin.com/company/realcompany", "twitter": "", "instagram": "", "facebook": "", "youtube": ""}}

Return ONLY valid JSON. No markdown. No explanation. NO extra URLs."""

        social_persona = PERSONA_INSTRUCTIONS.get("social_verifier", "You are a strict social media verifier. NEVER guess or invent URLs. Return ONLY valid JSON.")
        response = await get_ai_response(
            prompt=prompt,
            system_prompt=social_persona,
            temperature=0.1,
            max_tokens=400
        )

        json_str = response.strip()
        if '{' in json_str:
            start = json_str.find('{')
            end = json_str.rfind('}') + 1
            json_str = json_str[start:end]
            try:
                ai_result = json.loads(json_str)
                for platform in SOCIAL_PLATFORMS.keys():
                    url = ai_result.get(platform, "")
                    if url and isinstance(url, str) and url.startswith(("http://", "https://")):
                        validated[platform] = normalize_url(url, platform)
                logger.info(f"AI validated {len(validated)} social links for {domain}")
            except json.JSONDecodeError:
                logger.warning(f"AI returned invalid JSON for {domain}: {response[:200]}")
    except Exception as e:
        logger.warning(f"AI validation failed for {domain}: {e}")
    return validated


# ============================================================
# MAIN: Detect social presence using all sources
# ============================================================
async def detect_social_presence(domain: str, company_name: str = "") -> dict:
    base_url = f"https://{domain}" if not domain.startswith(("http://", "https://")) else domain
    if not company_name:
        company_name = domain.split(".")[0].replace("-", " ").replace("_", " ").title()
    page_content = ""

    # Get page content for AI validation
    try:
        import requests as sync_req
        from bs4 import BeautifulSoup
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        resp = sync_req.get(base_url, headers=headers, timeout=10)
        soup = BeautifulSoup(resp.text, "html.parser")
        for s in soup(["script", "style"]):
            s.decompose()
        page_content = soup.get_text(separator=" ", strip=True)[:3000]
    except Exception:
        pass

    # Collect from all sources
    from .config import settings

    all_sources = {}  # {platform: {url, sources_count, source_names}}

    def _add(platform, url, source_name):
        if not url:
            return
        if platform not in all_sources:
            all_sources[platform] = {"url": url, "count": 0, "sources": []}
        if all_sources[platform]["url"] != url:
            existing_score = _score_url(all_sources[platform]["url"], domain, company_name)
            new_score = _score_url(url, domain, company_name)
            if new_score > existing_score:
                all_sources[platform]["url"] = url
        all_sources[platform]["count"] += 1
        if source_name not in all_sources[platform]["sources"]:
            all_sources[platform]["sources"].append(source_name)

    # Source 1: SearAPI
    if settings.SEAR_API_KEY:
        searapi = await _source_searapi(domain, base_url, settings.SEAR_API_KEY)
        for p, url in searapi.items():
            _add(p, url, "searapi")

    # Source 2: Firecrawl
    if settings.FIRECRAWL_API_KEY:
        firecrawl = await _source_firecrawl(domain, base_url, settings.FIRECRAWL_API_KEY)
        for p, url in firecrawl.items():
            _add(p, url, "firecrawl")

    # Source 3: BeautifulSoup
    bs4 = await _source_beautifulsoup(domain, base_url)
    for p, url in bs4.items():
        _add(p, url, "beautifulsoup")

    # Source 4: DuckDuckGo
    ddg = await _source_duckduckgo(company_name, domain)
    for p, url in ddg.items():
        _add(p, url, "duckduckgo")

    # Build merged candidates for AI (only from actual sources, no guessing)
    merged_candidates = {}
    for p, data in all_sources.items():
        merged_candidates[p] = data["url"]

    logger.info(f"Total candidates before AI: {len(merged_candidates)} for {domain}")

    # Source 6: AI validation (final say)
    if merged_candidates:
        ai_validated = await _source_ai_validation(domain, company_name, merged_candidates, page_content)

        # AI takes priority
        for platform in SOCIAL_PLATFORMS.keys():
            if platform in ai_validated:
                if platform in all_sources:
                    all_sources[platform]["url"] = ai_validated[platform]
                    all_sources[platform]["count"] += 1
                    all_sources[platform]["sources"].append("ai")
                else:
                    all_sources[platform] = {
                        "url": ai_validated[platform],
                        "count": 1,
                        "sources": ["ai"]
                    }

    # Build final result — only show URLs that passed verification
    result = {}
    for platform, config in SOCIAL_PLATFORMS.items():
        data = all_sources.get(platform)
        url = ""
        verified = False
        sources = []

        if data and data["url"]:
            candidate_url = data["url"]
            has_ai = "ai" in data.get("sources", [])
            sources = data.get("sources", [])

            # Verified: found by 2+ sources OR confirmed by AI OR strict single-source
            # content check that matches the company hint
            if has_ai or data["count"] >= 2:
                url = candidate_url
                verified = True
            elif data["count"] == 1:
                if _url_exists(candidate_url, company_name, domain):
                    url = candidate_url
                    verified = True

        if url:
            result[platform] = {
                "url": normalize_url(url, platform),
                "handle": extract_handle_from_url(url, platform) or "",
                "name": config["name"],
                "detected": True,
                "verified": verified,
                "sources": sources
            }
        else:
            result[platform] = {
                "url": "",
                "handle": "",
                "name": config["name"],
                "detected": False,
                "verified": False,
                "sources": []
            }

    return result


async def verify_social_url(url: str, platform: str) -> dict:
    result = {
        "url": url,
        "platform": platform,
        "valid": False,
        "exists": False,
        "followers": None,
        "error": None
    }
    if not url:
        return result
    try:
        import requests
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        response = requests.get(url, headers=headers, timeout=10, allow_redirects=True)
        if response.status_code == 200:
            result["valid"] = True
            result["exists"] = True
        elif response.status_code == 404:
            result["error"] = "Page not found"
        elif response.status_code in [301, 302, 303]:
            result["valid"] = True
    except requests.RequestException as e:
        result["error"] = str(e)
    return result


async def detect_from_company_name(company_name: str, existing_domains: list = None) -> dict:
    results = {}
    search_domains = existing_domains or []
    if not search_domains and company_name:
        name_parts = company_name.lower().replace(" ", "").replace("-", "")
        search_domains = [f"{name_parts}.com", f"{name_parts}.ai", f"{name_parts}.io", f"{name_parts}.org"]

    for domain in search_domains[:3]:
        try:
            detected = await detect_social_presence(domain)
            for platform, data in detected.items():
                if data.get("detected") and platform not in results:
                    results[platform] = data
        except Exception:
            continue

    for platform, config in SOCIAL_PLATFORMS.items():
        if platform not in results:
            results[platform] = {
                "url": "",
                "handle": "",
                "name": config["name"],
                "detected": False,
                "verified": False
            }
    return results


def format_social_data(social_data: dict) -> list:
    formatted = []
    for platform, data in social_data.items():
        formatted.append({
            "platform": platform,
            "name": data.get("name", platform),
            "url": data.get("url", ""),
            "handle": data.get("handle", ""),
            "detected": data.get("detected", False),
            "verified": data.get("verified", False)
        })
    return formatted
