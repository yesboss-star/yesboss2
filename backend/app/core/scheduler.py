import asyncio
import logging
from datetime import datetime, timedelta

logger = logging.getLogger("yesboss.scheduler")

CHECK_INTERVAL = 3600


async def check_deadline_reminders():
    try:
        from ..core.database import get_database
        from ..core.notification_service import create_and_deliver

        db = get_database()
        if db is None:
            return

        now = datetime.utcnow()
        tomorrow = now + timedelta(days=1)
        in_3_days = now + timedelta(days=3)

        tasks_due_soon = list(db.tasks.find({
            "due_date": {"$gte": now, "$lte": tomorrow},
            "status": {"$nin": ["completed", "approved"]},
        }))

        for task in tasks_due_soon:
            assignee_id = task.get("assignee_id")
            if not assignee_id:
                continue
            await create_and_deliver(
                user_id=assignee_id,
                org_id=task.get("organization_id", ""),
                type="task_deadline",
                title="Task Due Tomorrow",
                message=f"Task '{task.get('title')}' is due tomorrow",
                link=f"/tasks/{task.get('_id')}",
                metadata={"task_id": str(task.get("_id", "")), "due_date": str(task.get("due_date", ""))},
            )

        tasks_due_3 = list(db.tasks.find({
            "due_date": {"$gte": tomorrow, "$lte": in_3_days},
            "status": {"$nin": ["completed", "approved"]},
            "deadline_reminded_3day": {"$ne": True},
        }))

        for task in tasks_due_3:
            assignee_id = task.get("assignee_id")
            if not assignee_id:
                continue
            await create_and_deliver(
                user_id=assignee_id,
                org_id=task.get("organization_id", ""),
                type="task_deadline",
                title="Task Due in 3 Days",
                message=f"Task '{task.get('title')}' is due in 3 days",
                link=f"/tasks/{task.get('_id')}",
                metadata={"task_id": str(task.get("_id", "")), "due_date": str(task.get("due_date", ""))},
            )
            db.tasks.update_one(
                {"_id": task["_id"]},
                {"$set": {"deadline_reminded_3day": True}},
            )

        logger.info(f"Deadline check done: {len(tasks_due_soon)} due tomorrow, {len(tasks_due_3)} due in 3 days")
    except Exception as e:
        logger.error(f"Deadline check failed: {e}")


async def send_digests():
    try:
        from ..core.database import get_database
        from ..core.notification_service import send_digest

        db = get_database()
        if db is None:
            return

        prefs = list(db["notification_preferences"].find({
            "digest.enabled": True,
            "digest.frequency": "daily",
        }))

        for pref in prefs:
            user_id = pref.get("user_id", "")
            org_id = pref.get("organization_id", "")
            if user_id and org_id:
                await send_digest(user_id, org_id, "daily")

        logger.info(f"Daily digests sent to {len(prefs)} users")
    except Exception as e:
        logger.error(f"Digest send failed: {e}")


async def scheduler_loop():
    logger.info("Scheduler started")
    deadline_counter = 0
    while True:
        try:
            if deadline_counter % 24 == 0:
                await check_deadline_reminders()
            if deadline_counter % 24 == 0:
                hour = datetime.utcnow().hour
                if hour == 8:
                    await send_digests()
            deadline_counter += 1
        except Exception as e:
            logger.error(f"Scheduler cycle error: {e}")
        await asyncio.sleep(CHECK_INTERVAL)
