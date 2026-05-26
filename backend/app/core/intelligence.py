import logging
from typing import Optional

logger = logging.getLogger("yesboss.intelligence")


async def analyze_company_from_email(email: str) -> dict:
    domain = email.split("@")[1] if "@" in email else ""
    return await analyze_company_from_domain(domain)


async def analyze_company_from_domain(domain: str) -> dict:
    logger.info("Analyzing domain: %s", domain)

    from .ai_client import get_ai_response
    from .scraper import scrape_company_data
    import json, re

    scraped = None
    try:
        scraped = await scrape_company_data(domain)
    except Exception as e:
        logger.warning("Scrape failed for %s: %s", domain, e)

    company_name = domain.split(".")[0].title()
    industry = "Technology"
    micro_verticals = []
    description = ""
    website_url = f"https://{domain}"

    homepage_text = (scraped.get("description") or "") if scraped else ""
    if not homepage_text and scraped:
        homepage_text = scraped.get("description", "")

    try:
        ctx = f"Domain: {domain}"
        if scraped:
            scraped_name = scraped.get("name") or ""
            scraped_desc = (scraped.get("description") or "")[:2000]
            ctx = f"""Domain: {domain}
Scraped company name: {scraped_name}
Website content: {scraped_desc}"""

        ai_prompt = f"""{ctx}

Based on the above, return JSON with EXACT company details:
{{
    "company_name": "Full legal company name (with Pvt Ltd, Inc, LLC, GmbH etc if present). If only short name found, just the short name.",
    "industry": "One primary industry category",
    "micro_verticals": ["List", "of", "specific", "niche", "verticals", "within", "this", "industry"],
    "website_url": "Full website URL"
}}

Rules:
- company_name: Extract from scraped title/h1/og:title first. Fallback to domain name.
- industry: Be specific (e.g. 'Automotive & Electric Vehicles', 'Fintech & Payment Solutions', 'SaaS / Cloud Computing')
- micro_verticals: Array of 1-5 specific sub-niches based on industry (e.g. for Automotive: ['Auto Parts Manufacturing', 'EV Charging Infrastructure', 'Fleet Management'])
- Use the exact industry names from the standard list provided."""

        response = await get_ai_response(
            prompt=ai_prompt,
            system_prompt="You are an industry analyst. Return ONLY valid JSON. No markdown.",
            temperature=0.1,
            max_tokens=500
        )

        json_str = response.strip()
        json_str = re.sub(r'^```(?:json)?\s*', '', json_str)
        json_str = re.sub(r'\s*```$', '', json_str)

        if '{' in json_str and '}' in json_str:
            start = json_str.find('{')
            end = json_str.rfind('}') + 1
            json_str = json_str[start:end]

        parsed = json.loads(json_str) if json_str else {}
        if isinstance(parsed, dict):
            ai_name = parsed.get("company_name", "")
            if ai_name and ai_name.lower() != domain.replace("www.", "").split(".")[0].lower():
                company_name = ai_name
            industry = parsed.get("industry", industry) or industry
            micro_verticals = parsed.get("micro_verticals", [])
            if not isinstance(micro_verticals, list):
                micro_verticals = [micro_verticals] if micro_verticals else []
            website_url = parsed.get("website_url", website_url) or website_url

        logger.info("Detected - Name: %s, Industry: %s, Verticals: %s", company_name, industry, micro_verticals)
    except Exception as e:
        logger.error("AI domain analysis failed: %s", e)
        if scraped and scraped.get("name"):
            company_name = scraped["name"]
        if scraped and scraped.get("industry"):
            industry = scraped["industry"]
        if scraped and scraped.get("micro_vertical"):
            mv = scraped["micro_vertical"]
            micro_verticals = [mv] if isinstance(mv, str) else (mv if isinstance(mv, list) else [])

    return {
        "company_name": company_name,
        "industry": industry,
        "micro_verticals": micro_verticals,
        "micro_vertical": micro_verticals[0] if micro_verticals else "",
        "website_url": website_url,
        "description": description or (scraped.get("description") if scraped else ""),
    }


async def enrich_profile_with_ai(profile: dict, provider: Optional[str] = None) -> dict:
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


async def analyze_goal_department(title: str, description: str = "", industry: str = "") -> str:
    logger.info("Analyzing department for goal: %s", title)
    from .ai_client import get_ai_response

    prompt = f"""Given a business goal, determine the most appropriate department responsible for it.

Goal title: {title}
Goal description: {description or title}
Company industry: {industry or 'General'}

Examples:
- "Increase monthly recurring revenue by 25%" → Sales
- "Reduce customer churn rate below 5%" → Customer Support
- "Launch new mobile app version with offline mode" → Engineering
- "Improve brand awareness in APAC region" → Marketing
- "Reduce operational costs by 15%" → Operations
- "Implement new payroll compliance system" → Finance
- "Hire 10 senior engineers by Q3" → Human Resources
- "Redesign user onboarding flow to improve conversion" → Product
- "Rebuild company website and design system" → Design
- "File 5 new patents for core technology" → R&D

Return ONLY the department name, nothing else."""

    response = await get_ai_response(
        prompt=prompt,
        system_prompt="You classify goals into departments. Reply with ONE department word only: Engineering, Marketing, Sales, Operations, Finance, Human Resources, Product, Design, Customer Support, R&D, Supply Chain, or Legal. Do not add any explanation.",
        temperature=0.2,
        max_tokens=30
    )

    department = response.strip().replace('"', "").replace("'", "").replace(".", "").replace("\n", "").strip()
    valid = {"Engineering", "Marketing", "Sales", "Operations", "Finance", "Human Resources", "Product", "Design", "Customer Support", "R&D", "Supply Chain", "Legal"}
    return department if department in valid else ""


async def generate_goal_suggestions(industry: str, micro_vertical: str, count: int = 4) -> list:
    logger.info("Generating goal suggestions for industry=%s micro_vertical=%s", industry, micro_vertical)
    from .ai_client import get_ai_response

    prompt = f"List {count} goals for {industry} {micro_vertical or ''}. Return JSON array: [{{title,description,department,priority}}]"

    response = await get_ai_response(
        prompt=prompt,
        system_prompt="You are a business consultant. Return ONLY valid JSON array. No markdown.",
        temperature=0.3,
        max_tokens=800
    )

    import json
    import re

    try:
        json_str = response.strip()
        json_str = re.sub(r'^```(?:json)?\s*', '', json_str)
        json_str = re.sub(r'\s*```$', '', json_str)
        if '[' in json_str and ']' in json_str:
            start = json_str.find('[')
            end = json_str.rfind(']') + 1
            json_str = json_str[start:end]
        elif '{' in json_str and '}' in json_str:
            start = json_str.find('{')
            end = json_str.rfind('}') + 1
            json_str = json_str[start:end]
        data = json.loads(json_str, strict=False)
        if isinstance(data, list):
            goals = data
        else:
            goals = data.get("goals", data.get("suggestions", []))
        if not isinstance(goals, list):
            goals = []
        logger.info(f"Generated {len(goals)} goal suggestions")
        return goals[:count]
    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error: {e}, raw: {response[:200]}")
        import ast
        try:
            parsed = ast.literal_eval(json_str)
            if isinstance(parsed, list):
                return parsed[:count]
            if isinstance(parsed, dict):
                return (parsed.get("goals") or parsed.get("suggestions") or [])[:count]
        except:
            pass
        goal_re = re.findall(r'"title"\s*:\s*"([^"]+)"', response)
        dept_re = re.findall(r'"department"\s*:\s*"([^"]+)"', response)
        desc_re = re.findall(r'"description"\s*:\s*"([^"]+)"', response)
        prio_re = re.findall(r'"priority"\s*:\s*"([^"]+)"', response)
        if goal_re:
            return [
                {"title": goal_re[i], "description": desc_re[i] if i < len(desc_re) else "", "department": dept_re[i] if i < len(dept_re) else "", "priority": prio_re[i] if i < len(prio_re) else "medium"}
                for i in range(min(len(goal_re), count))
            ]
        return []
    except Exception as e:
        logger.error(f"Failed to parse goal suggestions: {e}")
        return []


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
    "name": "Exact verified company name (with Pvt Ltd, Inc, LLC, GmbH etc if applicable)",
    "domain": "www.realcompany.com",
    "website_url": "https://www.realcompany.com",
    "industry": "What industry they actually work in",
    "micro_verticals": ["Their specific niches or focus areas (1-5 items)"],
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
                    if scraped_data.get("micro_verticals") and not result.get("micro_verticals"):
                        result["micro_verticals"] = scraped_data["micro_verticals"]
                    elif scraped_data.get("micro_vertical") and not result.get("micro_vertical"):
                        result["micro_vertical"] = scraped_data["micro_vertical"]
            except Exception as e:
                logger.warning(f"Scraping failed: {e}")
        
        micro_verticals = result.get("micro_verticals", [])
        if not isinstance(micro_verticals, list) and result.get("micro_vertical"):
            micro_verticals = [result["micro_vertical"]]
        if isinstance(micro_verticals, list) and len(micro_verticals) > 0:
            result["micro_verticals"] = micro_verticals
            result["micro_vertical"] = micro_verticals[0]
        
        logger.info(f"Company search result: {result}")
        return result
        
    except Exception as e:
        logger.error(f"Error searching company: {e}")
        return {
            "name": company_name,
            "found": False,
            "error": str(e)
        }
