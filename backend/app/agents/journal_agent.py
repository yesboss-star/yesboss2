import logging
from datetime import datetime, timedelta

from bson import ObjectId

from ..core import journal_intel as intel
from ..core.database import get_database

logger = logging.getLogger("yesboss.journal_agent")

# A chat entry is re-analysed only after this many new user turns / this much time,
# so one conversation costs a handful of AI calls, not one per message.
REANALYZE_MIN_NEW_TURNS = 2
REANALYZE_MIN_MINUTES = 3


def _user_turns(entry: dict) -> int:
    return sum(1 for m in (entry.get("messages") or []) if m.get("role") == "user")


async def analyze_entry(entry_id: str, content: str, entry_type: str, org_id: str) -> dict | None:
    """Analyse one entry (v2 schema), store it, index it for search and refresh the idea vault."""
    try:
        db = get_database()
        if db is None:
            return None
        entry = db.journal_entries.find_one({"_id": ObjectId(entry_id)})
        text = intel.entry_text(entry, 4000) if entry else (content or "")
        analysis = await intel.analyze_content(text or content, entry_type)
        if not analysis:
            return None
        if entry:
            analysis["turns_analyzed"] = _user_turns(entry)

        update: dict = {"ai_analysis": analysis, "updated_at": datetime.utcnow()}
        goal_ids = []
        for title in analysis.get("suggested_goal_titles", []):
            goal = db.goals.find_one({"organization_id": org_id, "title": {"$regex": title, "$options": "i"}}, {"_id": 1})
            if goal:
                goal_ids.append(str(goal["_id"]))
        if goal_ids:
            update["linked_goals"] = goal_ids
        db.journal_entries.update_one({"_id": ObjectId(entry_id)}, {"$set": update})

        # Only fill a missing mood; never overwrite the writer's own choice.
        mood_score = (analysis.get("signals") or {}).get("mood")
        if mood_score:
            mood = "great" if mood_score >= 5 else "good" if mood_score == 4 else "okay" if mood_score == 3 else "bad"
            db.journal_entries.update_one(
                {"_id": ObjectId(entry_id), "$or": [{"mood": {"$exists": False}}, {"mood": None}, {"mood": ""}]},
                {"$set": {"mood": mood}},
            )

        fresh = db.journal_entries.find_one({"_id": ObjectId(entry_id)})
        if fresh:
            await intel.index_entry(fresh)
            await intel.sync_idea(db, fresh, analysis)
        return analysis
    except Exception as e:
        logger.error("Journal analysis error for entry %s: %s", entry_id, e)
        return None


async def maybe_reanalyze(entry_id: str, org_id: str) -> bool:
    """Re-run the analysis when a chat entry has grown enough since the last one."""
    try:
        db = get_database()
        entry = db.journal_entries.find_one({"_id": ObjectId(entry_id)}) if db is not None else None
        if not entry:
            return False
        analysis = entry.get("ai_analysis") or {}
        turns = _user_turns(entry)
        if analysis:
            if turns < int(analysis.get("turns_analyzed", 0)) + REANALYZE_MIN_NEW_TURNS:
                return False
            try:
                analyzed_at = datetime.fromisoformat(analysis.get("analyzed_at", ""))
                if datetime.utcnow() - analyzed_at < timedelta(minutes=REANALYZE_MIN_MINUTES):
                    return False
            except ValueError:
                pass
        await analyze_entry(entry_id, entry.get("content", ""), entry.get("type", "journal"), org_id)
        return True
    except Exception as e:
        logger.warning("Journal re-analysis skipped for %s: %s", entry_id, e)
        return False
