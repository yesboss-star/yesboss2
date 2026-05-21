import re
import requests
from typing import Optional
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup


SOCIAL_PLATFORMS = {
    "linkedin": {
        "name": "LinkedIn",
        "patterns": [
            r"https?://(?:www\.)?linkedin\.com/company/([a-zA-Z0-9-]+)",
            r"https?://(?:www\.)?linkedin\.com/in/([a-zA-Z0-9-]+)",
            r"linkedin\.com/company/([a-zA-Z0-9-]+)",
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
            r"https?://youtu\.be/([a-zA-Z0-9_-]+)",
            r"youtube\.com/@([a-zA-Z0-9_-]+)",
            r"youtube\.com/channel/([a-zA-Z0-9_-]+)",
            r"youtu\.be/([a-zA-Z0-9_-]+)",
        ],
        "icon": "youtube",
    },
    "tiktok": {
        "name": "TikTok",
        "patterns": [
            r"https?://(?:www\.)?tiktok\.com/@([a-zA-Z0-9_.]+)",
            r"tiktok\.com/@([a-zA-Z0-9_.]+)",
        ],
        "icon": "tiktok",
    }
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
    elif platform == "tiktok":
        m = re.search(r'tiktok\.com/@([a-zA-Z0-9_.]+)', url, re.I)
        if m:
            return f"https://www.tiktok.com/@{m.group(1)}"
    
    return url


def find_social_in_html(html: str, base_url: str) -> dict:
    detected = {}
    
    try:
        soup = BeautifulSoup(html, "html.parser")
        
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
        
        for meta in soup.find_all("meta", content=True):
            content = meta.get("content", "")
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
        
        page_text = soup.get_text()
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
                    
    except Exception:
        pass
    
    return detected


async def detect_social_presence(domain: str) -> dict:
    base_url = f"https://{domain}" if not domain.startswith(("http://", "https://")) else domain
    
    detected = {}
    
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        
        response = requests.get(base_url, headers=headers, timeout=10)
        html = response.text
        
        detected = find_social_in_html(html, base_url)
        
    except Exception:
        pass
    
    for platform, config in SOCIAL_PLATFORMS.items():
        if platform not in detected:
            detected[platform] = {
                "url": "",
                "handle": "",
                "name": config["name"],
                "detected": False,
                "verified": False
            }
        else:
            url = detected[platform]
            handle = ""
            for pattern in config["patterns"]:
                m = re.search(pattern, url, re.IGNORECASE)
                if m:
                    handle = m.group(1) if m.lastindex else m.group(0)
                    break
            detected[platform] = {
                "url": url,
                "handle": handle,
                "name": config["name"],
                "detected": True,
                "verified": False
            }
    
    return detected


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
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        
        response = requests.get(url, headers=headers, timeout=10, allow_redirects=True)
        
        if response.status_code == 200:
            result["valid"] = True
            result["exists"] = True
        elif response.status_code == 404:
            result["error"] = "Page not found"
        elif response.status_code in [301, 302]:
            result["valid"] = True
            
    except requests.RequestException as e:
        result["error"] = str(e)
    
    return result


def extract_handle_from_url(url: str, platform: str) -> Optional[str]:
    if not url:
        return None
    
    if platform == "linkedin":
        match = re.search(r'linkedin\.com/(company|in|org)/([a-zA-Z0-9-]+)', url)
        return match.group(2) if match else None
    elif platform == "twitter":
        match = re.search(r'(?:twitter|x)\.com/([a-zA-Z0-9_]+)', url)
        return match.group(1) if match else None
    elif platform == "instagram":
        match = re.search(r'instagram\.com/([a-zA-Z0-9_.]+)', url)
        return match.group(1) if match else None
    elif platform == "facebook":
        match = re.search(r'(?:facebook|fb)\.com/([a-zA-Z0-9._-]+)', url)
        return match.group(1) if match else None
    elif platform == "youtube":
        match = re.search(r'(?:youtube\.com/@|youtube\.com/channel/|youtu\.be/)([a-zA-Z0-9_-]+)', url)
        return match.group(1) if match else None
    elif platform == "tiktok":
        match = re.search(r'tiktok\.com/@([a-zA-Z0-9_.]+)', url)
        return match.group(1) if match else None
    
    return None


async def detect_from_company_name(company_name: str, existing_domains: list = None) -> dict:
    results = {}
    search_domains = existing_domains or []
    
    if not search_domains and company_name:
        name_parts = company_name.lower().replace(" ", "").replace("-", "")
        search_domains = [f"{name_parts}.com"]
    
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
