import re
import requests
from typing import Optional
from urllib.parse import urljoin, urlparse


SOCIAL_PLATFORMS = {
    "linkedin": {
        "name": "LinkedIn",
        "pattern": r"linkedin\.com/(company|org)/([a-zA-Z0-9-]+)",
        "icon": "linkedin",
        "verified_patterns": ["linkedin.com/company/"]
    },
    "twitter": {
        "name": "Twitter / X",
        "pattern": r"(twitter\.com|x\.com)/([a-zA-Z0-9_]+)",
        "icon": "twitter",
        "verified_patterns": ["twitter.com/", "x.com/"]
    },
    "instagram": {
        "name": "Instagram",
        "pattern": r"instagram\.com/([a-zA-Z0-9_.]+)",
        "icon": "instagram",
        "verified_patterns": ["instagram.com/"]
    },
    "facebook": {
        "name": "Facebook",
        "pattern": r"facebook\.com/([a-zA-Z0-9._-]+)",
        "icon": "facebook",
        "verified_patterns": ["facebook.com/"]
    },
    "youtube": {
        "name": "YouTube",
        "pattern": r"(youtube\.com/@|youtube\.com/channel/|youtu\.be/)([a-zA-Z0-9_-]+)",
        "icon": "youtube",
        "verified_patterns": ["youtube.com/@", "youtube.com/channel/", "youtu.be/"]
    },
    "tiktok": {
        "name": "TikTok",
        "pattern": r"tiktok\.com/@([a-zA-Z0-9_.]+)",
        "icon": "tiktok",
        "verified_patterns": ["tiktok.com/@"]
    }
}


async def detect_social_presence(domain: str) -> dict:
    base_url = f"https://{domain}" if not domain.startswith(("http://", "https://")) else domain
    
    detected = {}
    
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        
        response = requests.get(base_url, headers=headers, timeout=10)
        html = response.text
        
        for platform, config in SOCIAL_PLATFORMS.items():
            matches = re.findall(config["pattern"], html, re.IGNORECASE)
            if matches:
                handle = matches[0][-1] if isinstance(matches[0], tuple) else matches[0]
                
                if platform == "linkedin":
                    url = f"https://linkedin.com/company/{handle}"
                elif platform == "twitter":
                    url = f"https://twitter.com/{handle}"
                elif platform == "instagram":
                    url = f"https://instagram.com/{handle}"
                elif platform == "facebook":
                    url = f"https://facebook.com/{handle}"
                elif platform == "youtube":
                    if "youtu.be" in str(matches[0]):
                        url = f"https://youtu.be/{handle}"
                    else:
                        url = f"https://youtube.com/{handle}"
                elif platform == "tiktok":
                    url = f"https://tiktok.com/@{handle}"
                
                detected[platform] = {
                    "url": url,
                    "handle": handle,
                    "name": config["name"],
                    "detected": True,
                    "verified": False
                }
        
        footer_links = re.findall(r'href=["\']([^"\']+)["\']', html)
        footer_section = re.search(r'<footer[^>]*>(.*?)</footer>', html, re.DOTALL | re.IGNORECASE)
        
        if footer_section:
            footer_html = footer_section.group(1)
            for platform, config in SOCIAL_PLATFORMS.items():
                if platform not in detected:
                    for pattern in config["verified_patterns"]:
                        if pattern in footer_html:
                            match = re.search(config["pattern"], footer_html, re.IGNORECASE)
                            if match:
                                handle = match.group(1) if match.lastindex else match.group(0)
                                detected[platform] = {
                                    "url": urljoin(base_url, match.group(0)),
                                    "handle": handle,
                                    "name": config["name"],
                                    "detected": True,
                                    "verified": False,
                                    "source": "footer"
                                }
                                break
        
    except Exception as e:
        pass
    
    for platform in SOCIAL_PLATFORMS:
        if platform not in detected:
            detected[platform] = {
                "url": "",
                "handle": "",
                "name": SOCIAL_PLATFORMS[platform]["name"],
                "detected": False,
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
            
            if platform == "linkedin":
                if "linkedin.com/company" in url:
                    result["valid"] = True
            
            elif platform == "twitter" or platform == "x":
                if response.url and ("twitter.com" in response.url or "x.com" in response.url):
                    result["valid"] = True
                    
        elif response.status_code == 404:
            result["error"] = "Page not found"
        elif response.status_code == 301 or response.status_code == 302:
            result["valid"] = True
            
    except requests.RequestException as e:
        result["error"] = str(e)
    
    return result


def extract_handle_from_url(url: str, platform: str) -> Optional[str]:
    if not url:
        return None
    
    if platform == "linkedin":
        match = re.search(r'linkedin\.com/company/([a-zA-Z0-9-]+)', url)
        return match.group(1) if match else None
    elif platform == "twitter":
        match = re.search(r'(twitter\.com|x\.com)/([a-zA-Z0-9_]+)', url)
        return match.group(2) if match else None
    elif platform == "instagram":
        match = re.search(r'instagram\.com/([a-zA-Z0-9_.]+)', url)
        return match.group(1) if match else None
    elif platform == "facebook":
        match = re.search(r'facebook\.com/([a-zA-Z0-9._-]+)', url)
        return match.group(1) if match else None
    elif platform == "youtube":
        match = re.search(r'(youtube\.com/@|youtube\.com/channel/|youtu\.be/)([a-zA-Z0-9_-]+)', url)
        return match.group(2) if match else None
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
        except:
            continue
    
    for platform in SOCIAL_PLATFORMS:
        if platform not in results:
            results[platform] = {
                "url": "",
                "handle": "",
                "name": SOCIAL_PLATFORMS[platform]["name"],
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