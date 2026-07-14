import json
import logging
from datetime import datetime

from ..core.ai_client import get_ai_response
from ..core.database import get_database

logger = logging.getLogger("yesboss.journal_agent")

SYSTEM_PROMPT = """You are a business analysis AI that analyzes journal entries, ideas, and reflections.

Analyze the given entry and return a JSON object with:
{
  "summary": "1-2 sentence summary of the entry",
  "actionable_items": [
    {"text": "specific actionable task description", "priority": "high|medium|low"}
  ],
  "suggested_assignee_emails": [],
  "suggested_goal_titles": [],
  "category": "product|operations|sales|marketing|hr|finance|strategy|general",
  "mood_analysis": "brief mood interpretation",
  "should_create_tasks": true/false,
  "should_link_goals": true/false
}

Rules:
- Extract specific, actionable items from ideas and reflections
- For journal entries about daily work, identify follow-up tasks
- suggested_goal_titles should match actual business goals (be specific)
- Category must be one of the listed options
- urgency_create_tasks: true only if there are clear action items
- Be concise and practical"""


async def analyze_entry(entry_id: str, content: str, entry_type: str, org_id: str) -> dict | None:
    try:
        prompt = f"Type: {entry_type}\n\nContent: {content}"
        response = await get_ai_response(prompt, SYSTEM_PROMPT)
        analysis = json.loads(response)

        result = {
            "summary": analysis.get("summary", ""),
            "actionable_items": analysis.get("actionable_items", []),
            "suggested_assignee_emails": analysis.get("suggested_assignee_emails", []),
            "suggested_goal_titles": analysis.get("suggested_goal_titles", []),
            "category": analysis.get("category", "general"),
            "mood_analysis": analysis.get("mood_analysis", ""),
            "urgency_create_tasks": analysis.get("urgency_create_tasks", False),
            "urgency_link_goals": analysis.get("urgency_link_goals", False),
        }

        from bson import ObjectId
        db = get_database()
        if db is not None:
            update: dict = {"ai_analysis": result, "updated_at": datetime.utcnow()}

            goal_ids = []
            suggested_titles = analysis.get("suggested_goal_titles", [])
            if suggested_titles:
                for title in suggested_titles:
                    goal = db.goals.find_one(
                        {"organization_id": org_id, "title": {"$regex": title, "$options": "i"}},
                        {"_id": 1},
                    )
                    if goal:
                        goal_ids.append(str(goal["_id"]))
            if goal_ids:
                update["linked_goals"] = goal_ids

            db.journal_entries.update_one(
                {"_id": ObjectId(entry_id)},
                {"$set": update},
            )

        return result
    except json.JSONDecodeError:
        logger.warning("Failed to parse AI response for entry %s", entry_id)
        return None
    except Exception as e:
        logger.error("Journal analysis error for entry %s: %s", entry_id, e)
        return None
