import logging
from typing import Optional

logger = logging.getLogger("yesboss.intelligence")


async def analyze_company_from_email(email: str) -> dict:
    domain = email.split("@")[1] if "@" in email else ""
    return await analyze_company_from_domain(domain)


async def analyze_company_from_domain(domain: str) -> dict:
    logger.info("Analyzing domain: %s", domain)
    
    from .scraper import scrape_company_data
    from .ai_client import get_ai_response
    
    scraped_data = await scrape_company_data(domain)
    
    company_name = scraped_data.get("name", domain.split(".")[0].title())
    description = scraped_data.get("description", "")
    social_links = scraped_data.get("social_links", {})
    detected_industry = scraped_data.get("industry", "")
    detected_micro = scraped_data.get("micro_vertical", "")
    
    industry = "Technology"
    micro_vertical = ""
    
    try:
        ai_prompt = f"""Analyze this company website for industry detection.

DOMAIN: {domain}
WEBSITE CONTENT: {description[:3000] if description else "No description available"}
COMPANY NAME: {company_name}

IMPORTANT: Look at the website content and determine the actual industry.
Do NOT guess or assume. Only use what you see in the content.

Look for keywords like:
- "fintech", "banking", "payment" → Finance
- "health", "medical", "hospital", "doctor" → Healthcare
- "retail", "shop", "store", "ecommerce" → Retail
- "manufacturing", "factory", "production" → Manufacturing
- "education", "learning", "school", "course" → Education
- "software", "app", "saas", "cloud", "tech" → Technology
- etc.

Return ONLY valid JSON:
{{
    "industry": "The actual industry based on content",
    "micro_vertical": "Specific focus area"
}}"""
        
        response = await get_ai_response(
            prompt=ai_prompt,
            system_prompt="You are a business analyst. Be conservative - only return industry if you see clear evidence in content. Return valid JSON only.",
            provider="gemini",
            temperature=0.1,
            max_tokens=400
        )
        
        logger.info(f"AI raw response: {response}")
        
        import json
        import re
        
        json_str = response.strip()
        
        if '{' in json_str and '}' in json_str:
            start = json_str.find('{')
            end = json_str.rfind('}') + 1
            json_str = json_str[start:end]
            
            try:
                ai_data = json.loads(json_str)
                if ai_data.get("industry"):
                    industry = ai_data["industry"]
                if ai_data.get("micro_vertical"):
                    micro_vertical = ai_data["micro_vertical"]
            except json.JSONDecodeError:
                logger.warning("Failed to parse AI response")
            
        if not industry or industry == "Technology":
            if detected_industry:
                industry = detected_industry
                
        if not micro_vertical and detected_micro:
            micro_vertical = detected_micro
            
        logger.info(f"Detected - Industry: {industry}, Micro-vertical: {micro_vertical}")
            
    except Exception as e:
        logger.error(f"AI enrichment failed: {e}")
        industry = detected_industry or "Technology"
        micro_vertical = detected_micro or ""
    
    return {
        "domain": domain,
        "website_url": f"https://{domain}",
        "company_name": company_name,
        "industry": industry,
        "micro_vertical": micro_vertical,
        "size": "1-10",
        "description": description,
        "social_links": social_links,
        "confidence": 0.6,
        "source": scraped_data.get("scraper", "unknown"),
    }


async def enrich_profile_with_ai(profile: dict, provider: str = "openai") -> dict:
    logger.info("Enriching profile with %s", provider)
    profile["enriched"] = True
    profile["ai_provider"] = provider
    return profile


def build_pre_org_profile(domain: str) -> dict:
    return {
        "domain": domain,
        "company_name": "",
        "industry": "",
        "size": "",
        "description": "",
        "social_links": {},
    }


async def generate_tasks_from_goal(goal_title: str, goal_description: str, count: int = 5) -> list:
    logger.info("Generating tasks for goal: %s", goal_title)
    
    task_templates = [
        f"Research and analyze current market trends for {goal_title}",
        f"Create initial draft of project plan for {goal_title}",
        f"Identify key stakeholders and their requirements for {goal_title}",
        f"Set up monitoring and metrics tracking for {goal_title}",
        f"Prepare documentation and status reporting templates",
        f"Coordinate with team members on task assignments",
        f"Review and validate initial deliverables",
        f"Schedule regular check-in meetings for progress updates",
        f"Document risks and mitigation strategies",
        f"Create user guides or training materials if applicable",
    ]
    
    tasks = []
    for i in range(min(count, len(task_templates))):
        tasks.append({
            "title": task_templates[i],
            "description": f"Task {i+1} related to goal: {goal_title}. {goal_description}",
            "priority": "medium" if i < count - 1 else "high",
        })
    
    return tasks


async def search_company_info(company_name: str) -> dict:
    logger.info("Searching for company: %s", company_name)
    
    from .ai_client import get_ai_response
    from .scraper import scrape_company_data
    import re
    
    try:
        ai_prompt = f"""You are a company research assistant. Find information about: "{company_name}"

IMPORTANT RULES:
- Only return real, verified companies that you are confident about
- If you are not sure about a company, return found: false
- Do NOT make up or guess company names, domains, or details
- Be extremely careful about giving false information

If you find a real company, return:
{{
    "name": "Exact verified company name",
    "domain": "www.realcompany.com",
    "website_url": "https://www.realcompany.com",
    "industry": "What industry they actually work in",
    "micro_vertical": "Their specific niche or focus",
    "description": "What they actually do",
    "found": true
}}

If you cannot find verified information:
{{
    "name": "{company_name}",
    "found": false
}}"""

        response = await get_ai_response(
            prompt=ai_prompt,
            system_prompt="You are a precise company researcher. Return ONLY valid, parseable JSON. Be extremely conservative - only return found:true if you are 100% confident about the company. Do NOT make up companies.",
            provider="gemini",
            temperature=0.1,
            max_tokens=600
        )
        
        logger.info(f"Company search raw response: {response}")
        
        import json
        result = {"name": company_name, "found": False}
        
        try:
            json_str = response.strip()
            if '{' in json_str and '}' in json_str:
                start = json_str.find('{')
                end = json_str.rfind('}') + 1
                json_str = json_str[start:end]
                result = json.loads(json_str)
        except json.JSONDecodeError:
            logger.warning("Failed to parse JSON from company search")
            result = {"name": company_name, "found": False}
        
        if result.get("found") and result.get("domain"):
            try:
                domain_clean = result.get("domain", "").replace("https://", "").replace("http://", "").replace("www.", "").split("/")[0]
                if domain_clean and "." in domain_clean:
                    scraped_data = await scrape_company_data(domain_clean)
                    
                    if scraped_data.get("description"):
                        result["description"] = scraped_data["description"]
                    if scraped_data.get("social_links"):
                        result["social_links"] = scraped_data["social_links"]
                    if scraped_data.get("name") and scraped_data.get("name") != result.get("name"):
                        result["name"] = scraped_data["name"]
                    if scraped_data.get("micro_vertical") and not result.get("micro_vertical"):
                        result["micro_vertical"] = scraped_data["micro_vertical"]
            except Exception as e:
                logger.warning(f"Scraping failed: {e}")
        
        logger.info(f"Company search result: {result}")
        return result
        
    except Exception as e:
        logger.error(f"Error searching company: {e}")
        return {
            "name": company_name,
            "found": False,
            "error": str(e)
        }
