import json
import logging
import re
from datetime import datetime, timedelta

logger = logging.getLogger("yesboss.frequency_agent")

SYSTEM_PROMPT = """You are a work-pattern analyst. Given a task or goal description, extract:
1. work_category: what kind of work this is (e.g. "development", "design", "research", "meeting", "documentation", "sales", "support", "management", "planning", "marketing", "data_analysis", "testing", "deployment")
2. complexity_level: "beginner", "intermediate", or "advanced"
3. estimated_hours: estimated hours to complete (float, 0.5-80)
4. review_frequency_days: how often (in days, 1-30) the goal owner should review progress. Short urgent goals need 1-3 days. Long-term strategic goals can go 7-14 days.

Return ONLY valid JSON: {"work_category": "...", "complexity_level": "...", "estimated_hours": 0.0, "review_frequency_days": 3}"""


async def analyze_content(title: str, description: str = "", provider: str | None = None) -> dict:
    from ..core.ai_client import get_ai_response

    text = f"Title: {title}\nDescription: {description}" if description else f"Title: {title}"
    prompt = f"Analyze this work item:\n\n{text}"

    try:
        raw = await get_ai_response(
            prompt=prompt,
            system_prompt=SYSTEM_PROMPT,
            temperature=0.3,
            max_tokens=500,
            provider=provider,
        )
        json_match = re.search(r"\{[^}]+\}", raw, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group())
            return {
                "work_category": data.get("work_category", "general"),
                "complexity_level": data.get("complexity_level", "intermediate"),
                "estimated_hours": float(data.get("estimated_hours", 4)),
                "review_frequency_days": int(data.get("review_frequency_days", 7)),
            }
    except Exception as e:
        logger.warning(f"AI analysis failed for '{title[:50]}': {e}")

    return {"work_category": "general", "complexity_level": "intermediate", "estimated_hours": 4, "review_frequency_days": 7}


async def process_task(task_data: dict, org_id: str, provider: str | None = None):
    try:
        from ..core.database import get_database
        from ..core.learning import learning

        db = get_database()
        if db is None:
            return

        analysis = await analyze_content(
            title=task_data.get("title", ""),
            description=task_data.get("description", ""),
            provider=provider,
        )

        learning.record_employee_frequency(org_id, {
            "employee_role": (task_data.get("assignee_email") or [""])[0] if isinstance(task_data.get("assignee_email"), list) else task_data.get("assignee_email") or "unknown",
            "work_type": "task",
            "work_category": analysis["work_category"],
            "complexity_level": analysis["complexity_level"],
            "estimated_hours": analysis["estimated_hours"],
            "title": task_data.get("title", ""),
            "description": task_data.get("description", ""),
        })
    except Exception as e:
        logger.warning(f"Frequency agent task processing error: {e}")


async def process_goal(goal_data: dict, org_id: str, provider: str | None = None):
    try:
        from bson import ObjectId

        from ..core.database import get_database
        from ..core.learning import learning

        db = get_database()
        if db is None:
            return

        assignee = goal_data.get("assignee_email")
        if not assignee:
            assignee_list = goal_data.get("assignee_id") or []
            assignee = assignee_list[0] if assignee_list else goal_data.get("created_by")

        analysis = await analyze_content(
            title=goal_data.get("title", ""),
            description=goal_data.get("description", ""),
            provider=provider,
        )

        learning.record_employee_frequency(org_id, {
            "employee_role": assignee or "unknown",
            "work_type": "goal",
            "work_category": analysis["work_category"],
            "complexity_level": analysis["complexity_level"],
            "estimated_hours": analysis["estimated_hours"],
            "title": goal_data.get("title", ""),
            "description": goal_data.get("description", ""),
        })

        gid = goal_data.get("_id") or goal_data.get("id")
        if gid and ObjectId.is_valid(str(gid)):
            freq = analysis.get("review_frequency_days") or _fallback_frequency(goal_data)
            now = datetime.utcnow()
            db.goals.update_one(
                {"_id": ObjectId(str(gid))},
                {"$set": {
                    "review_frequency_days": freq,
                    "next_review_at": now + timedelta(days=freq),
                    "estimated_hours": analysis["estimated_hours"],
                    "complexity_level": analysis["complexity_level"],
                    "work_category": analysis["work_category"],
                }}
            )
    except Exception as e:
        logger.warning(f"Frequency agent goal processing error: {e}")


def _fallback_frequency(goal: dict) -> int:
    gt = goal.get("goal_type", "")
    dur = goal.get("duration", "")
    if gt == "short_term" and dur == "one_time":
        return 3
    if gt == "short_term":
        return 5
    return 7
