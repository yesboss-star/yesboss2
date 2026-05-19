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
    size = scraped_data.get("size", "1-10")
    social_links = scraped_data.get("social_links", {})
    industry = ""
    micro_vertical = ""
    
    try:
        ai_prompt = f"""You are an expert business analyst. Analyze this company website.

DOMAIN: {domain}
WEBSITE CONTENT: {description[:2000] if description else "No description available"}
COMPANY NAME: {company_name}

IMPORTANT - Answer these 3 questions based ONLY on the information above:

1. INDUSTRY: What specific industry does this company operate in? Choose from:
   - IT Services / Software / Technology
   - Healthcare & Life Sciences
   - Financial Services & Banking
   - E-commerce & Retail
   - Manufacturing & Industrial
   - Education & EdTech
   - Media & Entertainment
   - Real Estate & Construction
   - Logistics & Supply Chain
   - Hospitality & Tourism
   - Automotive & Transport
   - Food & Beverage
   - Professional Services / Consulting
   - Marketing & Advertising
   - Legal Services
   - Non-profit / NGO
   OR if none match, provide a specific industry name

2. MICRO-VERTICAL: What specific niche/sub-category within that industry? Be very specific.
   Examples: If industry is "IT Services", micro-vertical could be "Custom Software Development", "Cloud Migration Services", "Cybersecurity Solutions", "Mobile App Development", etc.

3. DESCRIPTION: What exactly does this company do? (2 sentences max)

Respond ONLY with valid JSON:
{{
    "industry": "Specific industry name",
    "micro_vertical": "Specific niche/sub-category",
    "description": "What the company does"
}}"""
        
        response = await get_ai_response(
            prompt=ai_prompt,
            system_prompt="You are a precise business analyst. Return ONLY valid JSON, no extra text or explanation. The JSON must be parseable.",
            provider="gemini",
            temperature=0.1,
            max_tokens=500
        )
        
        logger.info(f"AI raw response: {response}")
        
        import json
        import re
        
        json_match = re.search(r'\{[^{}]*"industry"[^{}]*"micro_vertical"[^{}]*"description"[^{}]*\}', response, re.DOTALL)
        if json_match:
            ai_data = json.loads(json_match.group())
        else:
            ai_data = json.loads(response)
        
        if ai_data.get("industry"):
            industry = ai_data["industry"]
        if ai_data.get("micro_vertical"):
            micro_vertical = ai_data["micro_vertical"]
        if ai_data.get("description"):
            description = ai_data["description"]
            
        logger.info(f"Detected - Industry: {industry}, Micro-vertical: {micro_vertical}")
            
    except Exception as e:
        logger.error(f"AI enrichment failed: {e}")
    
    if not industry:
        industry = "Technology"
    
    return {
        "domain": domain,
        "website_url": f"https://{domain}",
        "company_name": company_name,
        "industry": industry,
        "micro_vertical": micro_vertical,
        "size": size,
        "description": description,
        "social_links": social_links,
        "confidence": 0.8,
        "source": "web_scraping + ai",
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
        ai_prompt = f"""You are an expert company researcher. Find detailed information about: "{company_name}"

IMPORTANT - Research and provide accurate information:

1. What is the exact company name?
2. What is their official website domain (e.g., www.example.com)?
3. What specific industry do they operate in? Choose from the list or specify:
   - IT Services / Software / Technology
   - Healthcare & Life Sciences
   - Financial Services & Banking
   - E-commerce & Retail
   - Manufacturing & Industrial
   - Education & EdTech
   - Media & Entertainment
   - Real Estate & Construction
   - Logistics & Supply Chain
   - Hospitality & Tourism
   - Automotive & Transport
   - Food & Beverage
   - Professional Services / Consulting
   - Marketing & Advertising
   - Legal Services
   - Non-profit / NGO
   
4. What is their micro-vertical/niche within that industry? (Be specific)
5. Approximate company size: 1-10, 11-50, 51-200, 201-500, or 500+
6. Brief description of what they do

Respond ONLY with valid JSON:
{{
    "name": "Exact company name",
    "domain": "www.company.com",
    "website_url": "https://www.company.com",
    "industry": "Specific industry",
    "micro_vertical": "Specific niche/sub-category",
    "size": "1-10 / 11-50 / 51-200 / 201-500 / 500+",
    "description": "What the company does",
    "found": true
}}

If you cannot find accurate information, return:
{{
    "name": "{company_name}",
    "found": false
}}"""

        response = await get_ai_response(
            prompt=ai_prompt,
            system_prompt="You are a precise company researcher. Return ONLY valid, parseable JSON. Be specific with industry and micro-vertical.",
            provider="gemini",
            temperature=0.1,
            max_tokens=600
        )
        
        logger.info(f"Company search raw response: {response}")
        
        import json
        try:
            result = json.loads(response)
        except json.JSONDecodeError:
            json_match = re.search(r'\{[^{}]*"name"[^{}]*\}', response, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group())
            else:
                result = {"name": company_name, "found": False}
        
        if result.get("found", True) and result.get("name") and result.get("name") != company_name:
            domain = result.get("domain", "")
            if domain:
                try:
                    domain_clean = domain.replace("https://", "").replace("http://", "").replace("www.", "").split("/")[0]
                    scraped_data = await scrape_company_data(domain_clean)
                    
                    if scraped_data.get("description"):
                        result["description"] = scraped_data["description"]
                    if scraped_data.get("social_links"):
                        result["social_links"] = scraped_data["social_links"]
                    if scraped_data.get("name") and not result.get("name"):
                        result["name"] = scraped_data.get("name")
                except Exception as e:
                    logger.warning(f"Scraping failed: {e}")
            
            if not result.get("website_url") and result.get("domain"):
                result["website_url"] = f"https://{result['domain']}"
        
        logger.info(f"Company search result: {result}")
        return result
        
    except Exception as e:
        logger.error(f"Error searching company: {e}")
        return {
            "name": company_name,
            "found": False,
            "error": str(e)
        }
