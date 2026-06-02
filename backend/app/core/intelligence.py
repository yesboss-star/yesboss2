import logging
from typing import Optional

logger = logging.getLogger("yesboss.intelligence")


async def analyze_company_from_email(email: str) -> dict:
    domain = email.split("@")[1] if "@" in email else ""
    return await analyze_company_from_domain(domain)


def _derive_company_name_from_domain(domain: str) -> str:
    """Best-effort human-readable company name from a domain (e.g. 'bluepeaksystems.com' -> 'Bluepeak Systems')."""
    if not domain:
        return ""
    cleaned = domain.strip().lower()
    cleaned = cleaned.replace("https://", "").replace("http://", "").replace("www.", "")
    cleaned = cleaned.split("/")[0].split("?")[0].split("#")[0]
    if not cleaned or "." not in cleaned:
        return ""
    parts = cleaned.split(".")
    if parts[-1] in ("com", "co", "io", "ai", "net", "org", "app", "dev", "tech", "in", "us", "uk", "de", "fr", "jp", "cn", "au", "ca", "eu"):
        parts = parts[:-1]
    if not parts:
        return ""
    name_part = parts[0]
    if not name_part:
        return ""

    words: list[str] = []
    current = ""
    for ch in name_part:
        if ch in "-_":
            if current:
                words.append(current)
                current = ""
        else:
            current += ch
    if current:
        words.append(current)
    if not words:
        return ""

    common_suffixes = [
        "systems", "system", "solutions", "solution", "technologies", "technology",
        "tech", "labs", "lab", "group", "global", "industries", "industry",
        "services", "service", "consulting", "consultants", "software", "apps",
        "digital", "media", "studios", "studio", "works", "workshop", "co",
        "inc", "llc", "ltd", "corp", "company",
    ]
    common_prefixes = [
        "the", "my", "our", "pro", "smart", "next", "open", "meta", "neo",
        "cloud", "data", "deep", "auto", "bio", "eco", "fin", "edge", "quantum",
    ]
    all_hints = set(common_suffixes + common_prefixes)

    final_words: list[str] = []
    for w in words:
        if len(w) >= 8:
            split_done = False
            for hint in common_suffixes:
                if w.endswith(hint) and len(w) - len(hint) >= 3:
                    prefix = w[: -len(hint)]
                    final_words.append(prefix)
                    final_words.append(hint)
                    split_done = True
                    break
            if not split_done:
                for hint in common_prefixes:
                    if w.startswith(hint) and len(w) - len(hint) >= 3 and hint not in ("the", "my", "our", "pro", "co", "inc", "llc", "ltd", "corp"):
                        rest = w[len(hint):]
                        final_words.append(hint)
                        final_words.append(rest)
                        split_done = True
                        break
            if not split_done:
                final_words.append(w)
        else:
            final_words.append(w)
    return " ".join(w[0].upper() + w[1:] if w else "" for w in final_words)


async def analyze_company_from_domain(domain: str) -> dict:
    logger.info("Analyzing domain: %s", domain)

    from .ai_client import get_ai_response
    from .scraper import scrape_company_data
    import json, re

    derived_name = _derive_company_name_from_domain(domain)

    scraped = None
    try:
        scraped = await scrape_company_data(domain)
    except Exception as e:
        logger.warning("Scrape failed for %s: %s", domain, e)

    company_name = derived_name
    industry = ""
    micro_verticals = []
    description = ""
    website_url = ""
    confidence = 0.1 if derived_name else 0.0

    homepage_text = (scraped.get("description") or "") if scraped else ""
    if not homepage_text and scraped:
        homepage_text = scraped.get("description", "")

    scraped_has_content = bool(scraped and (scraped.get("name") or scraped.get("description")))

    if not scraped_has_content and not derived_name:
        return {
            "company_name": "",
            "industry": "",
            "micro_verticals": [],
            "micro_vertical": "",
            "website_url": website_url,
            "description": "",
            "confidence": 0.0,
            "auto_filled": False,
        }

    try:
        ctx = f"Domain: {domain}"
        if scraped:
            scraped_name = scraped.get("name") or ""
            scraped_desc = (scraped.get("description") or "")[:1500]
            ctx = f"""Domain: {domain}
Scraped company name: {scraped_name}
Website content: {scraped_desc}"""

        ai_prompt = f"""{ctx}

Return ONLY this JSON (no markdown, no extra text):
{{"company_name": "string", "industry": "string", "micro_verticals": ["string"]}}

Rules:
- company_name: Best full name (or short name). Empty string if unknown.
- industry: ONE category, e.g. "SaaS / Cloud Computing", "Fintech & Payment Solutions". Empty if unsure.
- micro_verticals: 1-3 specific niches, or [] if unsure.
- Be terse. Don't invent data."""

        from .prompt_engine import PERSONA_INSTRUCTIONS
        company_analyst_persona = PERSONA_INSTRUCTIONS.get("company_analyst", "You are an industry analyst. Return ONLY valid JSON. No markdown.")

        response = await get_ai_response(
            prompt=ai_prompt,
            system_prompt=company_analyst_persona,
            temperature=0.1,
            max_tokens=200
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
            ai_name = (parsed.get("company_name") or "").strip()
            if ai_name and len(ai_name) > 1 and ai_name.lower() != derived_name.lower():
                company_name = ai_name
                confidence += 0.3
            elif ai_name and len(ai_name) > 1:
                confidence += 0.1
            ai_industry = (parsed.get("industry") or "").strip()
            if ai_industry and ai_industry != "Technology":
                industry = ai_industry
                confidence += 0.4
            elif ai_industry:
                industry = ai_industry
                confidence += 0.1
            company_name = parsed.get("company_name") or company_name
            industry = parsed.get("industry") or industry
            micro_verticals = parsed.get("micro_verticals", micro_verticals)
            if not isinstance(micro_verticals, list):
                micro_verticals = [micro_verticals] if micro_verticals else []

        if scraped and scraped.get("description"):
            description = scraped["description"]
            confidence += 0.05

        confidence = min(1.0, confidence)
        logger.info("Detected - Name: %s, Industry: %s, Verticals: %s, Confidence: %.2f", company_name, industry, micro_verticals, confidence)
    except Exception as e:
        logger.error("AI domain analysis failed: %s", e)
        if scraped and scraped.get("name"):
            company_name = scraped["name"]
            confidence = 0.3
        if scraped and scraped.get("industry") and scraped.get("industry") != "Technology":
            industry = scraped["industry"]
            confidence = max(confidence, 0.4)
        elif scraped and scraped.get("industry"):
            industry = scraped["industry"]
            confidence = max(confidence, 0.2)
        if scraped and scraped.get("micro_vertical"):
            mv = scraped["micro_vertical"]
            micro_verticals = [mv] if isinstance(mv, str) else (mv if isinstance(mv, list) else [])
            confidence = max(confidence, 0.5)

    social_links: dict = {}
    if scraped and isinstance(scraped.get("social_links"), dict):
        social_links = {k: v for k, v in scraped["social_links"].items() if v}

    return {
        "company_name": company_name,
        "industry": industry,
        "micro_verticals": micro_verticals,
        "micro_vertical": micro_verticals[0] if micro_verticals else "",
        "website_url": website_url,
        "description": description or (scraped.get("description") if scraped else ""),
        "social_links": social_links,
        "confidence": round(confidence, 2),
        "auto_filled": confidence >= 0.5,
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

    from .prompt_engine import PERSONA_INSTRUCTIONS
    dept_persona = PERSONA_INSTRUCTIONS.get("department_classifier", "You classify goals into departments. Reply with ONE department word only.")
    response = await get_ai_response(
        prompt=prompt,
        system_prompt=dept_persona,
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

    from .prompt_engine import PERSONA_INSTRUCTIONS
    suggester_persona = PERSONA_INSTRUCTIONS.get("goal_suggester", "You are a business consultant. Return ONLY valid JSON array. No markdown.")
    response = await get_ai_response(
        prompt=prompt,
        system_prompt=suggester_persona,
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


async def suggest_industries(query: str, limit: int = 50) -> list:
    """Suggest industries based on user-typed query using Grok AI.

    Industries and micro-verticals can be of ANY type. Returns AI-generated
    results for both empty and non-empty queries. Limit is the maximum cap
    requested by the caller; the function does not silently truncate below it.
    """
    logger.info("Suggesting industries for query: %s", query)
    from .ai_client import get_ai_response
    import json
    import re

    try:
        if not query or len(query.strip()) < 1:
            prompt = """The user is opening an industry dropdown in a business onboarding form and has not typed anything yet.

List up to 100 distinct industry names spanning EVERY sector — technology, software, IT, e-commerce, retail, fintech, banking, insurance, crypto, healthcare, pharma, biotech, education, manufacturing, automotive, aerospace, construction, real estate, hospitality, restaurants, food, travel, tourism, legal, accounting, HR, consulting, media, entertainment, advertising, marketing, logistics, shipping, energy, utilities, oil & gas, renewables, agriculture, fishing, mining, telecom, fashion, beauty, fitness, sports, gaming, gambling, government, non-profit, security, cleaning, repair, automotive services, child care, elder care, pet care, photography, event planning, printing, publishing, import/export, coworking, and many more.

The user could be from ANY type of business. Be exhaustive and varied. Return ONLY a JSON array of strings, no markdown."""
        else:
            prompt = f"""The user is typing: "{query}" while selecting their industry in a business onboarding form.

The user can be from ANY type of business — large enterprise, small business, freelancer, agency, government, non-profit, creative, professional services, hospitality, manufacturing, retail, healthcare, education, transportation, construction, real estate, agriculture, energy, and many more.

Suggest up to {limit} matching industry names based on what the user typed. Be flexible with partial matches, abbreviations, synonyms, and translations.
- Include BOTH literal matches AND closely related industries.
- If query is generic (e.g. "shop", "service", "tech", "food"), suggest the 10-15 most likely categories spanning many sectors.
- Cover ANY industry type — don't restrict to common tech categories.
- Be specific, descriptive, and use proper industry naming conventions (e.g. "Fintech & Payment Solutions" not "Finance").
- The user could be from any country, culture, or business model — be globally inclusive.

Return ONLY a JSON array of strings, e.g. ["Technology & Software", "SaaS / Cloud Computing"].
No markdown, no explanation, no commentary."""

        response = await get_ai_response(
            prompt=prompt,
            system_prompt="You are a business taxonomy assistant with comprehensive knowledge of every industry worldwide. Return ONLY a JSON array of industry name strings. No markdown, no commentary.",
            temperature=0.3,
            max_tokens=2000
        )

        json_str = response.strip()
        json_str = re.sub(r'^```(?:json)?\s*', '', json_str)
        json_str = re.sub(r'\s*```$', '', json_str)
        if '[' in json_str and ']' in json_str:
            start = json_str.find('[')
            end = json_str.rfind(']') + 1
            json_str = json_str[start:end]

        try:
            result = json.loads(json_str)
            if isinstance(result, list):
                cleaned = [str(s).strip() for s in result if s and str(s).strip()]
                return cleaned[:limit]
        except json.JSONDecodeError:
            matches = re.findall(r'"([^"]+)"', response)
            return [m.strip() for m in matches if m.strip()][:limit]

        return []
    except Exception as e:
        logger.error("Industry suggestion failed: %s", e)
        return []


async def suggest_micro_verticals(query: str, industry: str = "", limit: int = 50) -> list:
    """Suggest micro-verticals based on user-typed query and (optional) industry using Grok AI.

    Micro-verticals can be of ANY type. Returns AI-generated results for both
    empty and non-empty queries. Limit is the maximum cap requested by the
    caller; the function does not silently truncate below it.
    """
    logger.info("Suggesting micro-verticals for query=%s industry=%s", query, industry)
    from .ai_client import get_ai_response
    import json
    import re

    try:
        if not query or len(query.strip()) < 1:
            industry_context = f" within the {industry} industry" if industry else ""
            prompt = f"""The user is opening a micro-vertical dropdown in a business onboarding form{industry_context} and has not typed anything yet.

List up to 100 distinct micro-vertical (specific niche) names spanning EVERY sector — software development, mobile apps, web development, cloud, DevOps, AI/ML, data analytics, cybersecurity, e-commerce platforms, payment processing, fintech, blockchain, healthcare tech, telemedicine, edtech, logistics, supply chain, last-mile delivery, EV charging, IoT, digital marketing, SEO, CRM, ERP, video streaming, gaming, social media, clean energy, agtech, food tech, B2B services, B2C services, consulting, marketplace, managed services, HR software, robotics, automation, hospitality services, legal services, accounting, advertising, content creation, manufacturing services, automotive services, real estate services, travel services, education services, financial services, professional services, creative services, and many more.

The user could specialize in ANY niche. Be exhaustive and varied. Return ONLY a JSON array of strings, no markdown."""
        else:
            industry_context = f" within the {industry} industry" if industry else ""
            prompt = f"""The user is typing: "{query}" while selecting micro-verticals (specific niches) for their business{industry_context}.

The user can specialize in ANY niche — software, hardware, services, products, creative, hospitality, manufacturing, retail, professional, healthcare, education, government, energy, finance, and many more.

Suggest up to {limit} matching micro-vertical names based on what the user typed. Be flexible with partial matches, abbreviations, synonyms, and translations.
- Include BOTH literal matches AND closely related sub-niches.
- If query is generic, suggest the 10-15 most likely specializations spanning many sectors.
- Cover ANY micro-vertical type — don't restrict to common tech categories.
- Use clear, specific, professional micro-vertical names (e.g. "Mobile App Development", "Telehealth & Remote Care").
- The user could be from any country, culture, or business model — be globally inclusive.

Return ONLY a JSON array of strings, e.g. ["Mobile App Development", "Custom Software Development"].
No markdown, no explanation, no commentary."""

        response = await get_ai_response(
            prompt=prompt,
            system_prompt="You are a business taxonomy assistant with comprehensive knowledge of every micro-vertical worldwide. Return ONLY a JSON array of micro-vertical name strings. No markdown, no commentary.",
            temperature=0.3,
            max_tokens=2000
        )

        json_str = response.strip()
        json_str = re.sub(r'^```(?:json)?\s*', '', json_str)
        json_str = re.sub(r'\s*```$', '', json_str)
        if '[' in json_str and ']' in json_str:
            start = json_str.find('[')
            end = json_str.rfind(']') + 1
            json_str = json_str[start:end]

        try:
            result = json.loads(json_str)
            if isinstance(result, list):
                cleaned = [str(s).strip() for s in result if s and str(s).strip()]
                return cleaned[:limit]
        except json.JSONDecodeError:
            matches = re.findall(r'"([^"]+)"', response)
            return [m.strip() for m in matches if m.strip()][:limit]

        return []
    except Exception as e:
        logger.error("Micro-vertical suggestion failed: %s", e)
        return []


async def suggest_company_names(query: str, industry: str = "", limit: int = 20) -> list:
    """Suggest company names powered by Grok AI.

    Behaves like a Google-suggest for company names: given a partial query
    (and optional industry context), returns a list of plausible real-world
    company names. Returns [] on failure — never falls back to a hardcoded list.
    """
    logger.info("Suggesting company names for query=%s industry=%s", query, industry)
    from .ai_client import get_ai_response
    import json
    import re

    try:
        if not query or len(query.strip()) < 1:
            industry_ctx = f" in the {industry} industry" if industry else ""
            prompt = f"""The user is opening a 'company name' field in a business onboarding form{industry_ctx}.

List up to 30 well-known real company names from various industries worldwide (technology, retail, finance, healthcare, manufacturing, services, hospitality, etc.). Return ONLY a JSON array of strings, no markdown."""
        else:
            industry_ctx = f" in the {industry} industry" if industry else ""
            prompt = f"""The user is typing: "{query}" into a 'company name' field in a business onboarding form{industry_ctx}.

Suggest up to {limit} real-world company names that match or relate to what the user typed. Be flexible with partial matches, abbreviations, and synonyms.
- Include BOTH literal matches AND closely related / well-known companies in the same space.
- Cover companies of all sizes — global enterprises, regional players, and notable startups.
- The user could be searching for any company worldwide — be globally inclusive.
- If the query is generic, suggest the 10-15 most well-known companies in the space.

Return ONLY a JSON array of strings, e.g. ["Google", "Microsoft", "Stripe"].
No markdown, no explanation, no commentary."""

        response = await get_ai_response(
            prompt=prompt,
            system_prompt="You are a company-name lookup assistant with comprehensive knowledge of companies worldwide. Return ONLY a JSON array of company name strings. No markdown, no commentary.",
            temperature=0.2,
            max_tokens=1000
        )

        json_str = response.strip()
        json_str = re.sub(r'^```(?:json)?\s*', '', json_str)
        json_str = re.sub(r'\s*```$', '', json_str)
        if '[' in json_str and ']' in json_str:
            start = json_str.find('[')
            end = json_str.rfind(']') + 1
            json_str = json_str[start:end]

        try:
            result = json.loads(json_str)
            if isinstance(result, list):
                cleaned = [str(s).strip() for s in result if s and str(s).strip()]
                return cleaned[:limit]
        except json.JSONDecodeError:
            matches = re.findall(r'"([^"]+)"', response)
            return [m.strip() for m in matches if m.strip()][:limit]

        return []
    except Exception as e:
        logger.error("Company-name suggestion failed: %s", e)
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

        from .prompt_engine import PERSONA_INSTRUCTIONS
        researcher_persona = PERSONA_INSTRUCTIONS.get("company_researcher", "You are a precise company researcher. Return ONLY valid, parseable JSON.")
        response = await get_ai_response(
            prompt=ai_prompt,
            system_prompt=researcher_persona,
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


async def extract_document_insights(
    text: str,
    filename: str,
    file_type: str,
    company_name: str = "",
    industry: str = "",
    micro_vertical: str = "",
    max_chars: int = 12000,
) -> dict:
    """Deep analysis of an uploaded document. Returns structured insights that
    power the dashboard widgets and the AI assistant's question answering.
    """
    if not text or not text.strip():
        return {
            "summary": "",
            "document_category": "unknown",
            "key_entities": {"people": [], "companies": [], "products": [], "amounts": []},
            "key_metrics": [],
            "decisions": [],
            "action_items": [],
            "qa_pairs": [],
        }

    from .ai_client import get_ai_response
    from .prompt_engine import PERSONA_INSTRUCTIONS
    import json
    import re

    snippet = text.strip()[:max_chars]
    context_line = ""
    if company_name:
        context_line += f"\nCompany: {company_name}"
    if industry:
        context_line += f"\nIndustry: {industry}"
    if micro_vertical:
        context_line += f"\nMicro-vertical: {micro_vertical}"

    prompt = f"""Analyze this business document and return ONLY valid JSON (no markdown, no commentary).

Document filename: {filename}
Document type: {file_type}{context_line}

Document content:
\"\"\"
{snippet}
\"\"\"

Return a JSON object with EXACTLY these fields:

{{
  "summary": "2-3 sentence summary of what this document is and its main takeaway for the business owner",
  "document_category": "one of: financial_report, sales_data, marketing_report, customer_data, product_roadmap, hr_legal, contracts, inventory, operations, strategy, pitch_deck, other",
  "key_entities": {{
    "people": ["names of people mentioned"],
    "companies": ["company names mentioned"],
    "products": ["product or service names mentioned"],
    "amounts": ["dollar amounts or numbers with units, e.g. '$45,000 MRR'"]
  }},
  "key_metrics": [
    {{"name": "Metric name", "value": "the value (with unit if applicable)", "context": "brief context"}}
  ],
  "decisions": [
    "Decisions made or proposed in this document (1 sentence each)"
  ],
  "action_items": [
    "Concrete next steps mentioned (1 sentence each)"
  ],
  "qa_pairs": [
    {{"question": "Question an owner might ask about this document", "answer": "The answer extracted from the document"}}
  ]
}}

CRITICAL RULES:
1. summary MUST be 2-3 sentences max.
2. key_metrics should include 3-8 of the most important numerical/quantitative findings. Skip if no numbers exist.
3. decisions and action_items should each have 0-5 items. If none, return [].
4. qa_pairs should have 5-10 useful question/answer pairs that an owner could ask later.
5. Be CONCISE in every field. Do not write long paragraphs anywhere.
6. Return ONLY the JSON object. No markdown code fences. No preamble."""

    persona = PERSONA_INSTRUCTIONS.get(
        "document_analyst",
        "You are a precise business document analyst. Extract insights concisely. Return ONLY valid JSON.",
    )
    try:
        response = await get_ai_response(
            prompt=prompt,
            system_prompt=persona,
            temperature=0.1,
            max_tokens=3000,
        )
    except Exception as e:
        logger.error("Insight extraction AI call failed for %s: %s", filename, e)
        return {
            "summary": text[:500].strip(),
            "document_category": "other",
            "key_entities": {"people": [], "companies": [], "products": [], "amounts": []},
            "key_metrics": [],
            "decisions": [],
            "action_items": [],
            "qa_pairs": [],
            "error": str(e),
        }

    json_str = response.strip()
    if "```" in json_str:
        json_str = re.sub(r"```(?:json)?", "", json_str)
        json_str = json_str.replace("```", "").strip()
    if "{" in json_str:
        start = json_str.find("{")
        end = json_str.rfind("}") + 1
        json_str = json_str[start:end]

    empty = {
        "summary": "",
        "document_category": "other",
        "key_entities": {"people": [], "companies": [], "products": [], "amounts": []},
        "key_metrics": [],
        "decisions": [],
        "action_items": [],
        "qa_pairs": [],
    }
    try:
        parsed = json.loads(json_str)
    except json.JSONDecodeError:
        logger.warning("Insight extraction returned non-JSON for %s: %s", filename, response[:200])
        return {
            **empty,
            "summary": (response or text[:500]).strip()[:500],
        }

    return {
        "summary": str(parsed.get("summary") or "").strip()[:1000],
        "document_category": str(parsed.get("document_category") or "other").strip().lower()[:50],
        "key_entities": {
            "people": [str(x).strip() for x in (parsed.get("key_entities") or {}).get("people", []) if str(x).strip()][:20],
            "companies": [str(x).strip() for x in (parsed.get("key_entities") or {}).get("companies", []) if str(x).strip()][:20],
            "products": [str(x).strip() for x in (parsed.get("key_entities") or {}).get("products", []) if str(x).strip()][:20],
            "amounts": [str(x).strip() for x in (parsed.get("key_entities") or {}).get("amounts", []) if str(x).strip()][:20],
        },
        "key_metrics": [
            {
                "name": str(m.get("name") or "").strip()[:120],
                "value": str(m.get("value") or "").strip()[:120],
                "context": str(m.get("context") or "").strip()[:200],
            }
            for m in (parsed.get("key_metrics") or [])
            if isinstance(m, dict) and (m.get("name") or m.get("value"))
        ][:15],
        "decisions": [str(d).strip() for d in (parsed.get("decisions") or []) if str(d).strip()][:10],
        "action_items": [str(a).strip() for a in (parsed.get("action_items") or []) if str(a).strip()][:10],
        "qa_pairs": [
            {
                "question": str(qa.get("question") or "").strip()[:200],
                "answer": str(qa.get("answer") or "").strip()[:500],
            }
            for qa in (parsed.get("qa_pairs") or [])
            if isinstance(qa, dict) and qa.get("question") and qa.get("answer")
        ][:15],
    }


async def suggest_growth_documents(
    domain: str = "",
    company_name: str = "",
    industry: str = "",
    micro_vertical: str = "",
    size: str = "",
    existing_documents: Optional[list] = None,
    count: int = 10,
) -> dict:
    """Suggest documents that will help this specific business grow.
    Returns business context summary + categorized document suggestions.
    """
    from .ai_client import get_ai_response
    from .prompt_engine import PERSONA_INSTRUCTIONS
    import json
    import re

    existing = existing_documents or []
    existing_titles = []
    for d in existing[:30]:
        if isinstance(d, dict):
            t = d.get("filename") or d.get("name") or d.get("title")
            if t:
                existing_titles.append(str(t))

    context_block = ""
    if company_name:
        context_block += f"\nCompany: {company_name}"
    if domain:
        context_block += f"\nDomain: {domain}"
    if industry:
        context_block += f"\nIndustry: {industry}"
    if micro_vertical:
        context_block += f"\nMicro-vertical: {micro_vertical}"
    if size:
        context_block += f"\nCompany size: {size}"
    if existing_titles:
        context_block += f"\nDocuments already uploaded: {', '.join(existing_titles)}"

    prompt = f"""You are a growth advisor for a business owner. Recommend {count} SPECIFIC documents this business should upload to drive growth.{context_block}

Think about this company's stage, model, and goals. The documents they upload will be:
- Extracted for key metrics, entities, and decisions
- Used to power the AI dashboard and answer owner questions
- Used to identify growth opportunities, bottlenecks, and risks

Return ONLY valid JSON in this exact shape:
{{
  "business_context": {{
    "stage": "one of: pre_seed, seed, early_growth, scaling, mature",
    "business_model": "e.g. B2B SaaS, D2C e-commerce, marketplace, services, manufacturing, etc.",
    "primary_growth_lever": "the single biggest growth lever for this type of business",
    "key_risks": ["3-5 risks this business likely faces"]
  }},
  "suggestions": [
    {{
      "title": "Specific document name (e.g. 'Monthly Recurring Revenue Report')",
      "category": "one of: financial, sales, marketing, customer, product, operations, hr_legal, strategy, fundraising, other",
      "why_it_helps": "1-2 sentences: how this doc enables growth and what decisions it unlocks",
      "example_contents": "What kind of content should be in this document (1 sentence)",
      "priority": "high | medium | low"
    }}
  ]
}}

CRITICAL RULES:
1. Suggestions must be SPECIFIC to this company's industry and stage — no generic boilerplate.
2. Mix of priorities (at least 3 high-priority items).
3. Each suggestion's `why_it_helps` must explain the GROWTH impact, not just describe the doc.
4. Sort suggestions by priority (high first).
5. Include at least 2 financial docs and 1 customer-related doc unless the business is pre-revenue.
6. Do NOT suggest any document already in 'Documents already uploaded'.
7. Return ONLY JSON. No markdown. No preamble."""

    persona = PERSONA_INSTRUCTIONS.get(
        "growth_advisor",
        "You are a sharp business growth advisor. Recommend specific, high-leverage documents. Return ONLY valid JSON.",
    )
    try:
        response = await get_ai_response(
            prompt=prompt,
            system_prompt=persona,
            temperature=0.3,
            max_tokens=3500,
        )
    except Exception as e:
        logger.error("Growth doc suggestions AI call failed: %s", e)
        return {
            "business_context": {
                "stage": "early_growth",
                "business_model": "Unknown",
                "primary_growth_lever": "Customer acquisition",
                "key_risks": ["Insufficient data on file"],
            },
            "suggestions": _fallback_growth_docs(industry, micro_vertical)[:count],
            "error": str(e),
        }

    json_str = response.strip()
    if "```" in json_str:
        json_str = re.sub(r"```(?:json)?", "", json_str)
        json_str = json_str.replace("```", "").strip()
    if "{" in json_str:
        start = json_str.find("{")
        end = json_str.rfind("}") + 1
        json_str = json_str[start:end]

    try:
        parsed = json.loads(json_str)
    except json.JSONDecodeError:
        logger.warning("Growth doc suggestions returned non-JSON: %s", response[:200])
        return {
            "business_context": {
                "stage": "early_growth",
                "business_model": industry or "General business",
                "primary_growth_lever": "Customer acquisition",
                "key_risks": ["Insufficient data on file"],
            },
            "suggestions": _fallback_growth_docs(industry, micro_vertical)[:count],
        }

    ctx = parsed.get("business_context") or {}
    raw_suggestions = parsed.get("suggestions") or []
    suggestions = []
    for s in raw_suggestions:
        if not isinstance(s, dict):
            continue
        title = str(s.get("title") or "").strip()
        if not title or title in existing_titles:
            continue
        suggestions.append({
            "title": title[:200],
            "category": str(s.get("category") or "other").strip().lower()[:50],
            "why_it_helps": str(s.get("why_it_helps") or "").strip()[:500],
            "example_contents": str(s.get("example_contents") or "").strip()[:200],
            "priority": str(s.get("priority") or "medium").strip().lower()[:10],
        })
        if len(suggestions) >= count:
            break

    if not suggestions:
        suggestions = _fallback_growth_docs(industry, micro_vertical)[:count]

    return {
        "business_context": {
            "stage": str(ctx.get("stage") or "early_growth").strip()[:30],
            "business_model": str(ctx.get("business_model") or industry or "General business").strip()[:100],
            "primary_growth_lever": str(ctx.get("primary_growth_lever") or "Customer acquisition").strip()[:200],
            "key_risks": [str(r).strip() for r in (ctx.get("key_risks") or []) if str(r).strip()][:8],
        },
        "suggestions": suggestions,
    }


def _fallback_growth_docs(industry: str, micro_vertical: str) -> list:
    """Generic but reasonable defaults if AI call fails."""
    return [
        {
            "title": "Monthly Revenue & Expense Report",
            "category": "financial",
            "why_it_helps": "Shows your financial trajectory so you can spot cash crunches early and plan growth investments.",
            "example_contents": "Revenue, COGS, operating expenses, profit/loss for the last 3-12 months",
            "priority": "high",
        },
        {
            "title": "Customer Acquisition Cost (CAC) Breakdown",
            "category": "marketing",
            "why_it_helps": "Identifies which channels are profitable so you can double down on the best-performing ones.",
            "example_contents": "CAC by channel, conversion rates, cost per lead",
            "priority": "high",
        },
        {
            "title": "Top 10 Customer Profiles",
            "category": "customer",
            "why_it_helps": "Reveals your ideal customer so marketing, sales, and product all target the same high-value segments.",
            "example_contents": "Customer demographics, company size, use cases, contract value",
            "priority": "high",
        },
        {
            "title": "Product Roadmap (Next 2 Quarters)",
            "category": "product",
            "why_it_helps": "Aligns the team on priorities and lets customers and investors see where you're headed.",
            "example_contents": "Quarterly themes, major features, target dates",
            "priority": "medium",
        },
        {
            "title": "Churn & Retention Analysis",
            "category": "customer",
            "why_it_helps": "Cuts churn by 5-10% — finding why customers leave often unlocks the biggest growth gains.",
            "example_contents": "Monthly churn rate, reasons for cancellation, retention cohort table",
            "priority": "high",
        },
        {
            "title": "Sales Pipeline Snapshot",
            "category": "sales",
            "why_it_helps": "Forecasts revenue and surfaces deals that need intervention to close this month.",
            "example_contents": "Open deals by stage, expected close dates, deal sizes",
            "priority": "medium",
        },
        {
            "title": "Team Org Chart & Key Hires Plan",
            "category": "operations",
            "why_it_helps": "Reveals hiring gaps that could block growth and clarifies who owns what.",
            "example_contents": "Current team, reporting lines, planned roles for the next 6 months",
            "priority": "medium",
        },
        {
            "title": "Competitor Battle Card",
            "category": "strategy",
            "why_it_helps": "Sharpens your positioning so sales can win against the top 3 competitors.",
            "example_contents": "Competitor strengths, weaknesses, pricing, your differentiators",
            "priority": "low",
        },
    ]
