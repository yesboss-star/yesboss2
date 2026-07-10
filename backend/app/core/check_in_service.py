import asyncio
import logging
from datetime import datetime, timedelta

logger = logging.getLogger("yesboss.check_in")

async def check_org_due_for_check_in(db, org) -> bool:
    from bson import ObjectId
    org_id = str(org["_id"]) if isinstance(org["_id"], ObjectId) else org["_id"]
    last = org.get("last_check_in")
    frequency = org.get("check_in_frequency_days", 7)
    if not last:
        return True
    if isinstance(last, str):
        try:
            last = datetime.fromisoformat(last.replace("Z", "+00:00"))
        except Exception:
            return True
    return (datetime.utcnow() - last).days >= frequency


async def generate_check_in(db, org_id: str, owner_id: str) -> dict:
    now = datetime.utcnow()
    active_goals = list(db.goals.find({
        "organization_id": org_id,
        "created_by": owner_id,
        "status": "active",
        "$or": [
            {"next_review_at": {"$lte": now}},
            {
                "next_review_at": {"$exists": False},
                "last_reviewed_at": {"$exists": False},
            }
        ]
    }))

    if not active_goals:
        return {"should_send": False, "reason": "no_active_goals"}

    goal_entries = []
    behind_count = 0
    stale_count = 0

    task_pipeline = [
        {"$match": {"organization_id": org_id}},
        {"$group": {
            "_id": None,
            "total": {"$sum": 1},
            "completed": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}},
            "overdue": {"$sum": {"$cond": [
                {"$and": [
                    {"$ne": ["$status", "completed"]},
                    {"$ne": ["$status", "approved"]},
                    {"$lt": ["$due_date", now]},
                ]}, 1, 0
            ]}},
            "escalated": {"$sum": {"$cond": [{"$gt": ["$escalation_level", 0]}, 1, 0]}},
            "pending_deadline": {"$sum": {"$cond": [{"$eq": ["$status", "pending_deadline"]}, 1, 0]}},
        }},
    ]
    task_agg = list(db.tasks.aggregate(task_pipeline))
    ts = task_agg[0] if task_agg else {"total": 0, "completed": 0, "overdue": 0, "escalated": 0, "pending_deadline": 0}

    assignee_stats = list(db.tasks.aggregate([
        {"$match": {"organization_id": org_id}},
        {"$group": {
            "_id": {"$ifNull": ["$assignee_email", {"$ifNull": ["$assignee_id", "unassigned"]}]},
            "total": {"$sum": 1},
            "completed": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}},
            "overdue": {"$sum": {"$cond": [
                {"$and": [
                    {"$ne": ["$status", "completed"]},
                    {"$ne": ["$status", "approved"]},
                    {"$lt": ["$due_date", now]},
                ]}, 1, 0
            ]}},
            "escalated": {"$sum": {"$cond": [{"$gt": ["$escalation_level", 0]}, 1, 0]}},
        }},
        {"$sort": {"overdue": -1}},
    ]))
    behind_assignees = [a["_id"] for a in assignee_stats if a.get("overdue", 0) > 0]

    for g in active_goals:
        gid = str(g["_id"])
        progress = g.get("progress", 0)
        last_update = g.get("updated_at") or g.get("created_at")
        days_since_update = 0
        if last_update:
            if isinstance(last_update, str):
                try:
                    last_update = datetime.fromisoformat(last_update.replace("Z", "+00:00"))
                except Exception:
                    last_update = now
            days_since_update = (now - last_update).days

        status_label = "on_track"
        if g.get("due_date"):
            try:
                due = datetime.fromisoformat(str(g["due_date"]).replace("Z", "+00:00"))
                if due < now:
                    status_label = "behind"
                    behind_count += 1
            except Exception:
                pass
        if days_since_update >= 7:
            status_label = "stale"
            stale_count += 1

        goal_entries.append({
            "goal_id": gid,
            "title": g.get("title", "Untitled"),
            "progress": progress,
            "last_update_days": days_since_update,
            "status": status_label,
            "priority": g.get("priority", "medium"),
            "department": g.get("department", ""),
        })

    return {
        "should_send": True,
        "org_id": org_id,
        "owner_id": owner_id,
        "total_active": len(active_goals),
        "behind_count": behind_count,
        "stale_count": stale_count,
        "goals": goal_entries,
        "task_health": {
            "total": ts["total"],
            "completed": ts["completed"],
            "overdue": ts["overdue"],
            "escalated": ts["escalated"],
            "pending_deadline": ts["pending_deadline"],
            "completion_rate": round(ts["completed"] / ts["total"] * 100, 1) if ts["total"] > 0 else 0.0,
        },
        "assignee_stats": assignee_stats,
        "behind_assignees": behind_assignees,
    }


async def send_check_in_notification(db, check_in_data: dict):
    from ..core.notification_service import create_and_deliver

    owner_id = check_in_data["owner_id"]
    org_id = check_in_data["org_id"]
    total = check_in_data["total_active"]
    behind = check_in_data["behind_count"]
    stale = check_in_data["stale_count"]
    th = check_in_data.get("task_health", {})
    behind_assignees = check_in_data.get("behind_assignees", [])

    message_parts = [f"You have {total} active goal{'s' if total != 1 else ''}"]
    if behind:
        message_parts.append(f"{behind} behind schedule")
    if stale:
        message_parts.append(f"{stale} with no updates in 7+ days")
    if th:
        parts = []
        if th.get("overdue", 0):
            parts.append(f"{th['overdue']} overdue")
        if th.get("escalated", 0):
            parts.append(f"{th['escalated']} escalated")
        if th.get("pending_deadline", 0):
            parts.append(f"{th['pending_deadline']} missing deadlines")
        if parts:
            message_parts.append(f"Tasks: {', '.join(parts)}")
    if behind_assignees:
        names = behind_assignees[:3]
        message_parts.append(f"Members behind: {', '.join(names[:3])}{'...' if len(behind_assignees) > 3 else ''}")
    message = ". ".join(message_parts) + ". Review now?"

    await create_and_deliver(
        user_id=owner_id,
        org_id=org_id,
        type="check_in_reminder",
        title=f"Weekly Check-In",
        message=message,
        link="/dashboard?checkin=true",
    )


async def store_check_in(db, check_in_data: dict) -> dict:
    doc = {
        "org_id": check_in_data["org_id"],
        "owner_id": check_in_data["owner_id"],
        "check_in_date": datetime.utcnow(),
        "total_active": check_in_data["total_active"],
        "goals_behind": check_in_data["behind_count"],
        "goals_stale": check_in_data["stale_count"],
        "goals_reviewed": 0,
        "goals_flagged": 0,
        "goals_adjusted": 0,
        "notes": [],
        "goals_snapshot": check_in_data["goals"],
        "task_health": check_in_data.get("task_health", {}),
        "behind_assignees": check_in_data.get("behind_assignees", []),
        "assignee_stats": check_in_data.get("assignee_stats", []),
    }
    result = db.check_ins.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


def _fallback_frequency(goal: dict) -> int:
    gt = goal.get("goal_type", "")
    dur = goal.get("duration", "")
    if gt == "short_term" and dur == "one_time":
        return 3
    if gt == "short_term":
        return 5
    return 7


async def record_check_in_response(db, check_in_id: str, org_id: str, owner_id: str, notes: list = None):
    from bson import ObjectId
    from ..core.learning import learning

    check_in = db.check_ins.find_one({"_id": ObjectId(check_in_id)})
    if not check_in:
        return {"success": False, "error": "Check-in not found"}

    updates = {
        "goals_reviewed": len(notes or []),
        "goals_flagged": sum(1 for n in (notes or []) if n.get("action_taken") == "flag"),
        "goals_adjusted": sum(1 for n in (notes or []) if n.get("action_taken") in ("adjust_deadline", "reassign")),
        "notes": notes or [],
        "responded_at": datetime.utcnow(),
    }
    db.check_ins.update_one(
        {"_id": ObjectId(check_in_id)},
        {"$set": updates},
    )

    db.organizations.update_one(
        {"_id": ObjectId(org_id)},
        {"$set": {"last_check_in": datetime.utcnow()}},
    )

    for note in (notes or []):
        if note.get("action_taken") == "flag" and note.get("note"):
            learning.record_pattern(org_id, {
                "type": "bottleneck_flag",
                "name": f"owner_flag_{note.get('goal_id', 'unknown')}",
                "description": note["note"],
                "frequency": 1,
                "context": {"goal_id": note.get("goal_id"), "source": "check_in"},
                "triggers": [],
                "confidence": 0.7,
            })

        gid = note.get("goal_id")
        if gid:
            goal = db.goals.find_one({"_id": ObjectId(gid)})
            if goal:
                freq = goal.get("review_frequency_days") or _fallback_frequency(goal)
                db.goals.update_one(
                    {"_id": ObjectId(gid)},
                    {"$set": {
                        "last_reviewed_at": datetime.utcnow(),
                        "next_review_at": datetime.utcnow() + timedelta(days=freq),
                    }}
                )

    return {"success": True, "check_in": str(check_in_id)}
