import logging
from typing import Optional

logger = logging.getLogger("yesboss.intelligence")


async def analyze_company_from_email(email: str) -> dict:
    domain = email.split("@")[1] if "@" in email else ""
    return await analyze_company_from_domain(domain)


async def analyze_company_from_domain(domain: str) -> dict:
    logger.info("Analyzing domain: %s", domain)
    
    from .scraper import scrape_company_data
    
    scraped_data = await scrape_company_data(domain)
    
    company_name = scraped_data.get("name", domain.split(".")[0].title())
    description = scraped_data.get("description", "")
    industry = scraped_data.get("industry", "Technology")
    size = scraped_data.get("size", "1-10")
    social_links = scraped_data.get("social_links", {})
    
    industry_keywords = {
        "fintech": "Finance",
        "bank": "Finance", 
        "insurance": "Finance",
        "health": "Healthcare",
        "medical": "Healthcare",
        "pharma": "Healthcare",
        "retail": "Retail",
        "shop": "Retail",
        "manufacturing": "Manufacturing",
        "tech": "Technology",
        "software": "Technology",
        "ai": "Technology",
        "data": "Technology",
        "consulting": "Consulting",
        "education": "Education",
        "learning": "Education",
    }
    
    desc_lower = description.lower()
    for keyword, ind in industry_keywords.items():
        if keyword in desc_lower:
            industry = ind
            break
    
    suggested_industries = list(set([
        industry,
        "Technology",
        "Finance",
        "Healthcare",
        "Retail",
        "Manufacturing",
        "Education",
        "Consulting",
    ]))
    
    micro_vertical = ""
    if industry == "Technology":
        micro_vertical = "Software Development"
    elif industry == "Finance":
        micro_vertical = "Fintech"
    elif industry == "Healthcare":
        micro_vertical = "Healthcare IT"
    elif industry == "Retail":
        micro_vertical = "E-commerce"
    
    return {
        "domain": domain,
        "company_name": company_name,
        "industry": industry,
        "micro_vertical": micro_vertical,
        "size": size,
        "description": description,
        "social_links": social_links,
        "confidence": 0.75,
        "suggested_industries": suggested_industries[:4],
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
