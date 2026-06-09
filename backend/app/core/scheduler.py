import asyncio
import logging
from datetime import datetime, timedelta

logger = logging.getLogger("yesboss.scheduler")

CHECK_INTERVAL = 3600


async def find_manager_email(db, assignee_id: str) -> str | None:
    member = db.org_chart_members.find_one({"email": assignee_id.lower()})
    if member:
        mgr_email = member.get("manager_email")
        if mgr_email:
            return mgr_email.strip().lower()
    return None


async def get_direct_report_emails(db, manager_email: str) -> list[str]:
    members = db.org_chart_members.find({"manager_email": {"$regex": manager_email, "$options": "i"}})
    return [m["email"] for m in members]


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
        yesterday = now - timedelta(days=1)

        tasks_due_soon = list(db.tasks.find({
            "due_date": {"$gte": now, "$lte": tomorrow},
            "status": {"$nin": ["completed", "approved"]},
        }))

        for task in tasks_due_soon:
            assignee_id = task.get("assignee_id") or task.get("assignee_email")
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
            mgr = await find_manager_email(db, assignee_id)
            if mgr:
                await create_and_deliver(
                    user_id=mgr,
                    org_id=task.get("organization_id", ""),
                    type="task_deadline",
                    title=f"Team member's task due tomorrow",
                    message=f"'{task.get('title')}' assigned to {assignee_id} is due tomorrow",
                    link=f"/tasks/{task.get('_id')}",
                    metadata={"task_id": str(task.get("_id", "")), "assignee": assignee_id},
                )

        tasks_due_3 = list(db.tasks.find({
            "due_date": {"$gte": tomorrow, "$lte": in_3_days},
            "status": {"$nin": ["completed", "approved"]},
            "deadline_reminded_3day": {"$ne": True},
        }))

        for task in tasks_due_3:
            assignee_id = task.get("assignee_id") or task.get("assignee_email")
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
            mgr = await find_manager_email(db, assignee_id)
            if mgr:
                await create_and_deliver(
                    user_id=mgr,
                    org_id=task.get("organization_id", ""),
                    type="task_deadline",
                    title=f"Team member's task due in 3 days",
                    message=f"'{task.get('title')}' assigned to {assignee_id} is due in 3 days",
                    link=f"/tasks/{task.get('_id')}",
                    metadata={"task_id": str(task.get("_id", "")), "assignee": assignee_id},
                )

        tasks_overdue = list(db.tasks.find({
            "due_date": {"$lt": now},
            "status": {"$nin": ["completed", "approved"]},
            "overdue_notified": {"$ne": True},
        }))

        for task in tasks_overdue:
            assignee_id = task.get("assignee_id") or task.get("assignee_email")
            if not assignee_id:
                continue
            await create_and_deliver(
                user_id=assignee_id,
                org_id=task.get("organization_id", ""),
                type="task_deadline",
                title="Task Overdue",
                message=f"Task '{task.get('title')}' is overdue!",
                link=f"/tasks/{task.get('_id')}",
                metadata={"task_id": str(task.get("_id", "")), "due_date": str(task.get("due_date", ""))},
            )
            db.tasks.update_one(
                {"_id": task["_id"]},
                {"$set": {"overdue_notified": True}},
            )
            mgr = await find_manager_email(db, assignee_id)
            if mgr:
                await create_and_deliver(
                    user_id=mgr,
                    org_id=task.get("organization_id", ""),
                    type="task_deadline",
                    title=f"Task Overdue — team member",
                    message=f"'{task.get('title')}' assigned to {assignee_id} is overdue!",
                    link=f"/tasks/{task.get('_id')}",
                    metadata={"task_id": str(task.get("_id", "")), "assignee": assignee_id},
                )

        logger.info(f"Deadline check done: {len(tasks_due_soon)} due tomorrow, {len(tasks_due_3)} due in 3 days, {len(tasks_overdue)} overdue")
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
