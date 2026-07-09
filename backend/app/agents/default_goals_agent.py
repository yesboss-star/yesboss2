"""AI agent that generates default goals for a new organization based on industry and micro-vertical."""

import json
import logging
from typing import Optional, List, Dict, Any
from ..core.ai_client import get_ai_response

logger = logging.getLogger("yesboss.default_goals_agent")

SYSTEM_PROMPT = """You are a business strategy expert specializing in organizational goal-setting across industries.
Generate realistic, actionable default goals that a company in the given industry and micro-vertical would typically need."""


def _build_prompt(industry: str, micro_vertical: str, count: int = 5) -> str:
    mv = micro_vertical or "general"
    return f"""Generate {count} default goals for a {industry} / {mv} company.

Return a JSON array ONLY — no markdown, no commentary, no extra text.
Each goal must have these exact fields:
  - "title": str (clear, actionable title)
  - "description": str (2-3 sentence description)
  - "goal_type": "short_term" | "long_term"
  - "duration": "one_time" | "continuous"
  - "priority": "high" | "medium" | "low"
  - "department": str (REAL department name — one of: Sales, Marketing, Engineering, Product, Operations, Finance, Human Resources, Customer Support, Legal, R&D, Design, Supply Chain)
  - "suggested_timeline": str (e.g. "3 months", "Q3 2026", "ongoing")

IMPORTANT: The "department" field MUST be a real department name from the list above. NEVER leave it empty and NEVER set it to "auto-assign" or any generic placeholder.

Make each goal specific to {industry} companies in the {mv} vertical.
Include a mix of short-term and long-term goals, and a mix of one-time and continuous goals.

Example:
[
  {{
    "title": "Increase customer acquisition by 25%",
    "description": "Run targeted marketing campaigns across LinkedIn and Google Ads to attract new enterprise customers in the fintech space.",
    "goal_type": "short_term",
    "duration": "one_time",
    "priority": "high",
    "department": "Marketing",
    "suggested_timeline": "Q3 2026"
  }}
]"""


def _infer_department(title: str, description: str = "") -> str:
    """Infer the most likely department from goal title/description."""
    text = (title + " " + description).lower()
    keywords = {
        "Sales": ["revenue", "sales", "acquisition", "pipeline", "lead", "deal", "quota", "upsell", "cross-sell", "client", "booking", "ARR", "MRR", "subscription"],
        "Marketing": ["marketing", "campaign", "brand", "seo", "social media", "content", "lead generation", "traffic", "awareness", "promotion", "advertising", "PR", "public relations"],
        "Engineering": ["engineering", "develop", "deploy", "code", "software", "architecture", "technical debt", "infrastructure", "devops", "CI/CD", "automation", "platform", "system", "uptime", "latency", "performance", "tech"],
        "Product": ["product", "feature", "roadmap", "launch", "user experience", "ux", "product-market", "mvp", "backlog"],
        "Operations": ["operation", "process", "efficiency", "logistics", "supply chain", "workflow", "optimization", "cost reduction", "waste", "downtime", "quality", "compliance", "certification", "audit", "safety", "incident"],
        "Finance": ["finance", "revenue", "profit", "margin", "budget", "funding", "investment", "ROI", "cost", "pricing", "financial", "capital", "valuation"],
        "Human Resources": ["hire", "recruit", "talent", "people", "employee", "team", "culture", "retention", "turnover", "training", "onboarding", "workforce", "hr", "human resource"],
        "Customer Support": ["support", "customer satisfaction", "csat", "nps", "ticket", "response time", "resolution", "service", "retention", "churn", "help"],
        "Legal": ["legal", "compliance", "regulatory", "patent", "ip", "intellectual property", "contract", "licensing", "soc 2", "hipaa", "gdpr", "certification"],
        "R&D": ["research", "innovation", "patent", "prototype", "r&d", "experiment", "new technology", "ip"],
        "Design": ["design", "ui", "user interface", "visual", "creative", "brand identity", "graphic"],
        "Supply Chain": ["supply chain", "inventory", "procurement", "vendor", "logistics", "warehouse", "distribution", "fulfillment"],
    }
    for dept, words in keywords.items():
        if any(w in text for w in words):
            return dept
    return "Operations"


async def generate_default_goals(
    industry: str,
    micro_vertical: Optional[str] = None,
    count: int = 5,
    provider: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Generate default goals for an organization using AI."""
    prompt = _build_prompt(industry, micro_vertical, count)

    try:
        raw = await get_ai_response(
            prompt=prompt,
            system_prompt=SYSTEM_PROMPT,
            temperature=0.7,
            max_tokens=2500,
            provider=provider,
        )

        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
            cleaned = cleaned.rsplit("```", 1)[0] if "```" in cleaned else cleaned

        goals = json.loads(cleaned)
        if not isinstance(goals, list):
            raise ValueError("AI response was not a list")

        valid_departments = {"Sales", "Marketing", "Engineering", "Product", "Operations", "Finance", "Human Resources", "Customer Support", "Legal", "R&D", "Design", "Supply Chain"}

        for g in goals:
            g.setdefault("is_default", True)
            dept = (g.get("department") or "").strip()
            if dept not in valid_departments:
                dept = _infer_department(g.get("title", ""), g.get("description", ""))
            g["department"] = dept

        logger.info(f"Generated {len(goals)} default goals for {industry}/{micro_vertical}")
        return goals

    except Exception as e:
        logger.error(f"AI goal generation failed: {e}. Using fallback templates.")
        return _fallback_goals(industry, micro_vertical, count)


def _fallback_goals(industry: str, micro_vertical: str, count: int = 5) -> List[Dict[str, Any]]:
    """Fallback goals when AI fails — template-based for common industries."""
    templates = {
        "saas": [
            {"title": "Increase Monthly Recurring Revenue by 20%", "description": "Focus on upselling existing customers and reducing churn through improved onboarding and support.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Sales", "suggested_timeline": "Q3 2026", "is_default": True},
            {"title": "Launch new product feature for enterprise tier", "description": "Develop and release an enterprise-grade feature set to attract larger clients and increase ARPU.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Product", "suggested_timeline": "4 months", "is_default": True},
            {"title": "Reduce customer churn rate to under 5%", "description": "Implement proactive customer success outreach, improve onboarding flow, and gather feedback loops.", "goal_type": "long_term", "duration": "continuous", "priority": "high", "department": "Customer Success", "suggested_timeline": "ongoing", "is_default": True},
            {"title": "Build and train high-performing engineering team", "description": "Hire 3 senior engineers, establish coding standards, and implement CI/CD pipeline.", "goal_type": "long_term", "duration": "one_time", "priority": "medium", "department": "Engineering", "suggested_timeline": "6 months", "is_default": True},
            {"title": "Achieve SOC 2 Type II certification", "description": "Prepare documentation, implement security controls, and pass audit for SOC 2 compliance.", "goal_type": "short_term", "duration": "one_time", "priority": "medium", "department": "Operations", "suggested_timeline": "6 months", "is_default": True},
        ],
        "fintech": [
            {"title": "Reduce payment processing failure rate", "description": "Optimize payment gateway integrations and implement retry logic to minimize failed transactions.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Engineering", "suggested_timeline": "2 months", "is_default": True},
            {"title": "Achieve regulatory compliance for new market", "description": "Research and implement compliance requirements for expanding into a new geographic market.", "goal_type": "long_term", "duration": "one_time", "priority": "high", "department": "Legal", "suggested_timeline": "6 months", "is_default": True},
            {"title": "Increase user adoption of digital wallet features", "description": "Launch marketing campaigns and referral incentives to drive adoption of digital wallet and P2P payments.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Marketing", "suggested_timeline": "Q3 2026", "is_default": True},
            {"title": "Improve fraud detection accuracy to 99.5%", "description": "Deploy ML-based fraud detection models and reduce false positive rate while maintaining low fraud loss.", "goal_type": "long_term", "duration": "continuous", "priority": "high", "department": "Engineering", "suggested_timeline": "ongoing", "is_default": True},
            {"title": "Secure Series A funding", "description": "Prepare pitch deck, financial models, and meet with 20+ VCs in the fintech space.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Finance", "suggested_timeline": "6 months", "is_default": True},
        ],
        "healthcare": [
            {"title": "Achieve HIPAA compliance certification", "description": "Implement required security measures, train staff, and complete audit for HIPAA compliance.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Operations", "suggested_timeline": "3 months", "is_default": True},
            {"title": "Reduce patient no-show rate by 20%", "description": "Implement automated appointment reminders via SMS and email, and offer telemedicine options.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Operations", "suggested_timeline": "2 months", "is_default": True},
            {"title": "Improve patient satisfaction score to 4.5+", "description": "Deploy post-visit surveys, reduce wait times, and enhance bedside manner training.", "goal_type": "long_term", "duration": "continuous", "priority": "high", "department": "Operations", "suggested_timeline": "ongoing", "is_default": True},
            {"title": "Launch telemedicine platform", "description": "Develop and deploy a HIPAA-compliant telemedicine platform for remote consultations.", "goal_type": "short_term", "duration": "one_time", "priority": "medium", "department": "Product", "suggested_timeline": "6 months", "is_default": True},
            {"title": "Reduce readmission rate by 15%", "description": "Implement post-discharge follow-up program and care coordination to reduce 30-day readmissions.", "goal_type": "long_term", "duration": "continuous", "priority": "high", "department": "Operations", "suggested_timeline": "ongoing", "is_default": True},
        ],
        "ecommerce": [
            {"title": "Reduce cart abandonment rate by 15%", "description": "Optimize checkout flow, add guest checkout option, and implement cart recovery emails.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Product", "suggested_timeline": "2 months", "is_default": True},
            {"title": "Increase average order value by 10%", "description": "Implement product recommendations, bundle deals, and cross-sell at checkout.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Sales", "suggested_timeline": "Q3 2026", "is_default": True},
            {"title": "Expand to 3 new product categories", "description": "Research and launch in complementary categories to increase market share and customer lifetime value.", "goal_type": "long_term", "duration": "one_time", "priority": "medium", "department": "Product", "suggested_timeline": "6 months", "is_default": True},
            {"title": "Improve delivery ETA accuracy to 95%", "description": "Integrate real-time logistics tracking and improve last-mile delivery coordination.", "goal_type": "short_term", "duration": "one_time", "priority": "medium", "department": "Operations", "suggested_timeline": "3 months", "is_default": True},
            {"title": "Achieve 4.5+ star rating across all marketplaces", "description": "Improve product quality, respond to all reviews within 24 hours, and implement quality control.", "goal_type": "long_term", "duration": "continuous", "priority": "high", "department": "Customer Support", "suggested_timeline": "ongoing", "is_default": True},
        ],
        "technology": [
            {"title": "Increase Monthly Recurring Revenue by 25%", "description": "Focus on upselling existing customers, expanding to new markets, and optimizing pricing tiers.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Sales", "suggested_timeline": "Q3 2026", "is_default": True},
            {"title": "Achieve 99.9% platform uptime", "description": "Implement redundancy, monitoring, and incident response processes to meet SLA commitments.", "goal_type": "long_term", "duration": "continuous", "priority": "high", "department": "Engineering", "suggested_timeline": "ongoing", "is_default": True},
            {"title": "Reduce customer acquisition cost by 20%", "description": "Optimize ad spend, improve organic SEO, and build referral program to lower CAC.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Marketing", "suggested_timeline": "3 months", "is_default": True},
            {"title": "Hire 10 top-tier engineers", "description": "Build employer brand, streamline technical interview process, and expand recruiting channels.", "goal_type": "long_term", "duration": "one_time", "priority": "medium", "department": "Human Resources", "suggested_timeline": "6 months", "is_default": True},
            {"title": "Launch AI-powered feature for core product", "description": "Integrate ML capabilities into the product to deliver personalized experiences and insights.", "goal_type": "short_term", "duration": "one_time", "priority": "medium", "department": "Product", "suggested_timeline": "4 months", "is_default": True},
        ],
        "education": [
            {"title": "Increase student enrollment by 30%", "description": "Launch targeted digital marketing campaigns and partnerships with schools and universities.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Marketing", "suggested_timeline": "Q3 2026", "is_default": True},
            {"title": "Improve student completion rate to 85%", "description": "Implement mentorship program, progress tracking, and personalized learning pathways.", "goal_type": "long_term", "duration": "continuous", "priority": "high", "department": "Operations", "suggested_timeline": "ongoing", "is_default": True},
            {"title": "Develop 5 new course offerings", "description": "Research market demand and create courses in high-growth fields like AI, data science, and sustainability.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Product", "suggested_timeline": "6 months", "is_default": True},
            {"title": "Achieve accreditation for flagship program", "description": "Prepare documentation and undergo review process for formal accreditation.", "goal_type": "long_term", "duration": "one_time", "priority": "medium", "department": "Operations", "suggested_timeline": "12 months", "is_default": True},
            {"title": "Increase Net Promoter Score to 60+", "description": "Gather student feedback, improve content quality, and enhance support responsiveness.", "goal_type": "long_term", "duration": "continuous", "priority": "medium", "department": "Customer Support", "suggested_timeline": "ongoing", "is_default": True},
        ],
        "manufacturing": [
            {"title": "Reduce production downtime by 20%", "description": "Implement predictive maintenance using IoT sensors and real-time monitoring systems.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Operations", "suggested_timeline": "3 months", "is_default": True},
            {"title": "Achieve ISO 9001 certification", "description": "Document processes, implement quality management system, and pass certification audit.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Operations", "suggested_timeline": "6 months", "is_default": True},
            {"title": "Reduce material waste by 15%", "description": "Optimize cutting patterns, improve inventory management, and implement lean manufacturing.", "goal_type": "long_term", "duration": "continuous", "priority": "high", "department": "Operations", "suggested_timeline": "ongoing", "is_default": True},
            {"title": "Automate 3 key production line processes", "description": "Evaluate and deploy robotic automation for repetitive tasks to improve throughput and quality.", "goal_type": "short_term", "duration": "one_time", "priority": "medium", "department": "Engineering", "suggested_timeline": "6 months", "is_default": True},
            {"title": "Reduce workplace safety incidents by 50%", "description": "Implement comprehensive safety training, install monitoring systems, and conduct regular audits.", "goal_type": "long_term", "duration": "continuous", "priority": "high", "department": "Human Resources", "suggested_timeline": "ongoing", "is_default": True},
        ],
        "real.estate": [
            {"title": "Increase property portfolio by 25%", "description": "Identify and acquire undervalued properties in high-growth areas through data-driven analysis.", "goal_type": "long_term", "duration": "one_time", "priority": "high", "department": "Sales", "suggested_timeline": "12 months", "is_default": True},
            {"title": "Reduce vacancy rate to under 5%", "description": "Improve property marketing, offer move-in incentives, and enhance tenant experience.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Marketing", "suggested_timeline": "3 months", "is_default": True},
            {"title": "Implement digital property management system", "description": "Deploy cloud-based PMS for lease tracking, maintenance requests, and tenant communications.", "goal_type": "short_term", "duration": "one_time", "priority": "medium", "department": "Operations", "suggested_timeline": "4 months", "is_default": True},
            {"title": "Improve tenant satisfaction score to 4.0+", "description": "Implement regular surveys, faster maintenance response, and community-building events.", "goal_type": "long_term", "duration": "continuous", "priority": "medium", "department": "Operations", "suggested_timeline": "ongoing", "is_default": True},
            {"title": "Achieve 15% ROI on property renovations", "description": "Identify high-ROI renovation projects and manage contractors to maximize property value.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Operations", "suggested_timeline": "6 months", "is_default": True},
        ],
        "retail": [
            {"title": "Increase same-store sales by 10%", "description": "Optimize product placement, run promotional campaigns, and improve in-store experience.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Sales", "suggested_timeline": "Q3 2026", "is_default": True},
            {"title": "Launch omnichannel shopping experience", "description": "Integrate online and in-store inventory, enable click-and-collect, and unify loyalty program.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Product", "suggested_timeline": "6 months", "is_default": True},
            {"title": "Reduce inventory carrying cost by 15%", "description": "Implement demand forecasting and just-in-time inventory management to optimize stock levels.", "goal_type": "long_term", "duration": "continuous", "priority": "high", "department": "Operations", "suggested_timeline": "ongoing", "is_default": True},
            {"title": "Increase customer loyalty program membership by 40%", "description": "Launch sign-up incentives, partner with complementary brands, and improve rewards structure.", "goal_type": "short_term", "duration": "one_time", "priority": "medium", "department": "Marketing", "suggested_timeline": "3 months", "is_default": True},
            {"title": "Reduce employee turnover to under 20%", "description": "Improve training programs, offer career growth paths, and implement competitive compensation.", "goal_type": "long_term", "duration": "continuous", "priority": "medium", "department": "Human Resources", "suggested_timeline": "ongoing", "is_default": True},
        ],
        "construction": [
            {"title": "Complete all projects within 5% of budget", "description": "Improve cost estimation, track expenses in real-time, and implement variance reporting.", "goal_type": "long_term", "duration": "continuous", "priority": "high", "department": "Operations", "suggested_timeline": "ongoing", "is_default": True},
            {"title": "Reduce project completion time by 15%", "description": "Implement project management software, optimize crew scheduling, and streamline material procurement.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Operations", "suggested_timeline": "6 months", "is_default": True},
            {"title": "Achieve zero safety violations for 12 months", "description": "Implement daily safety briefings, mandatory PPE compliance checks, and incident reporting system.", "goal_type": "long_term", "duration": "continuous", "priority": "high", "department": "Human Resources", "suggested_timeline": "ongoing", "is_default": True},
            {"title": "Win 5 new commercial project bids", "description": "Build proposal templates, develop client relationships, and showcase past project portfolio.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Sales", "suggested_timeline": "6 months", "is_default": True},
            {"title": "Implement sustainable building practices", "description": "Adopt green building materials, achieve LEED certification, and reduce construction waste.", "goal_type": "long_term", "duration": "continuous", "priority": "medium", "department": "Operations", "suggested_timeline": "ongoing", "is_default": True},
        ],
        "hospitality": [
            {"title": "Increase average occupancy rate to 85%", "description": "Optimize dynamic pricing, improve online presence, and partner with travel agencies.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Sales", "suggested_timeline": "3 months", "is_default": True},
            {"title": "Improve guest satisfaction rating to 4.5+", "description": "Enhance staff training, upgrade amenities, and implement post-stay feedback collection.", "goal_type": "long_term", "duration": "continuous", "priority": "high", "department": "Operations", "suggested_timeline": "ongoing", "is_default": True},
            {"title": "Increase direct booking revenue by 25%", "description": "Launch loyalty program, improve website booking experience, and offer best-rate guarantees.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Marketing", "suggested_timeline": "Q3 2026", "is_default": True},
            {"title": "Reduce energy costs by 15%", "description": "Implement smart HVAC controls, LED lighting, and energy management system across all properties.", "goal_type": "short_term", "duration": "one_time", "priority": "medium", "department": "Operations", "suggested_timeline": "4 months", "is_default": True},
            {"title": "Achieve Green Key certification", "description": "Implement sustainable practices across operations and apply for environmental certification.", "goal_type": "long_term", "duration": "one_time", "priority": "medium", "department": "Operations", "suggested_timeline": "12 months", "is_default": True},
        ],
        "logistics": [
            {"title": "Reduce average delivery time by 20%", "description": "Optimize route planning, implement real-time tracking, and expand warehouse locations.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Operations", "suggested_timeline": "3 months", "is_default": True},
            {"title": "Achieve 99% on-time delivery rate", "description": "Improve dispatch coordination, implement SLA monitoring, and build carrier performance scorecards.", "goal_type": "long_term", "duration": "continuous", "priority": "high", "department": "Operations", "suggested_timeline": "ongoing", "is_default": True},
            {"title": "Reduce fleet fuel costs by 12%", "description": "Implement route optimization software, driver training programs, and transition to fuel-efficient vehicles.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Operations", "suggested_timeline": "4 months", "is_default": True},
            {"title": "Implement warehouse automation system", "description": "Deploy automated sorting, barcode scanning, and inventory management robots.", "goal_type": "long_term", "duration": "one_time", "priority": "medium", "department": "Engineering", "suggested_timeline": "12 months", "is_default": True},
            {"title": "Expand to 3 new service regions", "description": "Research demand, establish hub operations, and hire regional teams in target geographies.", "goal_type": "short_term", "duration": "one_time", "priority": "medium", "department": "Sales", "suggested_timeline": "6 months", "is_default": True},
        ],
        "consulting": [
            {"title": "Increase billable utilization rate to 80%", "description": "Improve resource allocation, reduce non-billable work, and optimize team scheduling.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Operations", "suggested_timeline": "3 months", "is_default": True},
            {"title": "Acquire 10 new enterprise clients", "description": "Build business development pipeline, create case studies, and attend industry conferences.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Sales", "suggested_timeline": "6 months", "is_default": True},
            {"title": "Achieve 90% client retention rate", "description": "Implement quarterly business reviews, client health scoring, and proactive account management.", "goal_type": "long_term", "duration": "continuous", "priority": "high", "department": "Customer Success", "suggested_timeline": "ongoing", "is_default": True},
            {"title": "Launch 2 new service offerings", "description": "Identify market gaps and develop consulting practices in high-demand areas like AI and sustainability.", "goal_type": "short_term", "duration": "one_time", "priority": "medium", "department": "Product", "suggested_timeline": "6 months", "is_default": True},
            {"title": "Improve employee satisfaction score to 4.0+", "description": "Implement mentorship programs, flexible work policies, and professional development budgets.", "goal_type": "long_term", "duration": "continuous", "priority": "medium", "department": "Human Resources", "suggested_timeline": "ongoing", "is_default": True},
        ],
        "media": [
            {"title": "Increase monthly active users by 30%", "description": "Optimize content distribution, launch social media campaigns, and improve SEO.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Marketing", "suggested_timeline": "Q3 2026", "is_default": True},
            {"title": "Grow advertising revenue by 25%", "description": "Build programmatic ad platform, attract premium advertisers, and improve ad targeting.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Sales", "suggested_timeline": "6 months", "is_default": True},
            {"title": "Increase subscriber conversion rate by 15%", "description": "Optimize paywall strategy, improve content personalization, and launch targeted promotions.", "goal_type": "long_term", "duration": "continuous", "priority": "high", "department": "Product", "suggested_timeline": "ongoing", "is_default": True},
            {"title": "Launch original content series", "description": "Produce 3 original series or podcasts to differentiate brand and attract new audiences.", "goal_type": "short_term", "duration": "one_time", "priority": "medium", "department": "Product", "suggested_timeline": "6 months", "is_default": True},
            {"title": "Achieve 4x return on content production spend", "description": "Analyze content performance metrics and optimize production budget allocation.", "goal_type": "long_term", "duration": "continuous", "priority": "medium", "department": "Marketing", "suggested_timeline": "ongoing", "is_default": True},
        ],
        "nonprofit": [
            {"title": "Increase annual donor base by 25%", "description": "Launch digital fundraising campaigns, host events, and build corporate partnership program.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Marketing", "suggested_timeline": "6 months", "is_default": True},
            {"title": "Reduce administrative overhead to under 15%", "description": "Automate processes, streamline operations, and leverage volunteer talent.", "goal_type": "long_term", "duration": "continuous", "priority": "high", "department": "Operations", "suggested_timeline": "ongoing", "is_default": True},
            {"title": "Increase program impact reach by 40%", "description": "Expand to new geographies, partner with local organizations, and scale proven programs.", "goal_type": "long_term", "duration": "one_time", "priority": "high", "department": "Operations", "suggested_timeline": "12 months", "is_default": True},
            {"title": "Achieve 90% donor retention rate", "description": "Implement donor stewardship program, regular impact reports, and personalized communications.", "goal_type": "long_term", "duration": "continuous", "priority": "high", "department": "Marketing", "suggested_timeline": "ongoing", "is_default": True},
            {"title": "Secure 3 major grant fundings", "description": "Research grant opportunities, develop compelling proposals, and build relationships with foundations.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Sales", "suggested_timeline": "6 months", "is_default": True},
        ],
        "banking": [
            {"title": "Increase digital banking adoption to 60%", "description": "Promote mobile app features, simplify onboarding, and incentivize digital transactions.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Marketing", "suggested_timeline": "6 months", "is_default": True},
            {"title": "Reduce non-performing assets ratio by 2%", "description": "Strengthen credit assessment, improve collection processes, and offer restructuring options.", "goal_type": "long_term", "duration": "continuous", "priority": "high", "department": "Operations", "suggested_timeline": "ongoing", "is_default": True},
            {"title": "Improve Net Promoter Score to 70+", "description": "Enhance branch experience, reduce call wait times, and personalize banking services.", "goal_type": "long_term", "duration": "continuous", "priority": "high", "department": "Operations", "suggested_timeline": "ongoing", "is_default": True},
            {"title": "Launch 3 new digital banking products", "description": "Develop savings goals, budgeting tools, and micro-investment features for retail customers.", "goal_type": "short_term", "duration": "one_time", "priority": "medium", "department": "Product", "suggested_timeline": "6 months", "is_default": True},
            {"title": "Achieve 100% regulatory compliance across all branches", "description": "Implement compliance management system, regular audits, and staff training programs.", "goal_type": "long_term", "duration": "continuous", "priority": "high", "department": "Legal", "suggested_timeline": "ongoing", "is_default": True},
        ],
        "telecommunications": [
            {"title": "Reduce customer churn rate to under 3%", "description": "Implement proactive customer outreach, loyalty programs, and competitive pricing adjustments.", "goal_type": "long_term", "duration": "continuous", "priority": "high", "department": "Customer Success", "suggested_timeline": "ongoing", "is_default": True},
            {"title": "Expand 5G coverage to 10 new cities", "description": "Secure permits, deploy infrastructure, and partner with local governments for tower placements.", "goal_type": "long_term", "duration": "one_time", "priority": "high", "department": "Operations", "suggested_timeline": "12 months", "is_default": True},
            {"title": "Increase fiber broadband subscribers by 20%", "description": "Run targeted marketing campaigns, offer installation promotions, and expand fiber footprint.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Sales", "suggested_timeline": "Q3 2026", "is_default": True},
            {"title": "Improve network uptime to 99.99%", "description": "Implement redundant systems, proactive monitoring, and faster incident response protocols.", "goal_type": "long_term", "duration": "continuous", "priority": "high", "department": "Engineering", "suggested_timeline": "ongoing", "is_default": True},
            {"title": "Reduce average trouble ticket resolution time by 30%", "description": "Deploy AI-powered ticketing system, automate diagnostics, and empower field technicians with mobile tools.", "goal_type": "short_term", "duration": "one_time", "priority": "medium", "department": "Operations", "suggested_timeline": "4 months", "is_default": True},
        ],
    }

    ind = (industry or "").lower()
    for key in templates:
        if key in ind:
            return templates[key][:count]

    return [
        {"title": f"Increase revenue by 20% in the next quarter", "description": f"Drive growth through targeted sales and marketing initiatives for the {industry} vertical.", "goal_type": "short_term", "duration": "one_time", "priority": "high", "department": "Sales", "suggested_timeline": "Q3 2026", "is_default": True},
        {"title": f"Build a strong team culture and processes", "description": "Establish regular team meetings, OKR tracking, and performance reviews.", "goal_type": "long_term", "duration": "continuous", "priority": "medium", "department": "Human Resources", "suggested_timeline": "ongoing", "is_default": True},
        {"title": f"Improve customer satisfaction score", "description": "Implement feedback surveys, reduce response times, and enhance product based on user input.", "goal_type": "short_term", "duration": "continuous", "priority": "medium", "department": "Customer Support", "suggested_timeline": "ongoing", "is_default": True},
        {"title": f"Develop thought leadership in {industry}", "description": "Publish whitepapers, speak at conferences, and build brand authority in the industry.", "goal_type": "long_term", "duration": "continuous", "priority": "low", "department": "Marketing", "suggested_timeline": "ongoing", "is_default": True},
        {"title": f"Streamline internal operations and reduce costs", "description": "Audit current operational expenses and implement automation where possible.", "goal_type": "short_term", "duration": "one_time", "priority": "medium", "department": "Operations", "suggested_timeline": "3 months", "is_default": True},
    ][:count]
