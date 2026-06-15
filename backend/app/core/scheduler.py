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


async def get_org_owner_info(db, org_id: str) -> tuple[str | None, str | None]:
    from bson import ObjectId
    org = None
    try:
        org = db.organizations.find_one({"_id": ObjectId(org_id)})
    except Exception:
        org = db.organizations.find_one({"owner_id": org_id})
    if not org:
        return None, None
    owner_id = org.get("owner_id")
    if not owner_id:
        return None, None
    from ..core.notification_service import get_user_email
    email = get_user_email(owner_id)
    return owner_id, email


async def check_deadline_reminders():
    try:
        from ..core.database import get_database
        from ..core.notification_service import create_and_deliver
        from ..core.email_service import send_notification_email

        db = get_database()
        if db is None:
            return

        now = datetime.utcnow()
        tomorrow = now + timedelta(days=1)
        in_3_days = now + timedelta(days=3)
        yesterday = now - timedelta(days=1)
        days_3_ago = now - timedelta(days=3)
        days_7_ago = now - timedelta(days=7)

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

        tasks_3d_overdue = list(db.tasks.find({
            "due_date": {"$lt": days_3_ago},
            "status": {"$nin": ["completed", "approved"]},
            "escalation_level": {"$lt": 2},
        }))

        for task in tasks_3d_overdue:
            assignee_id = task.get("assignee_id") or task.get("assignee_email")
            org_id = task.get("organization_id", "")
            if not assignee_id or not org_id:
                continue
            owner_id, owner_email = await get_org_owner_info(db, org_id)
            if owner_id:
                task_title = task.get("title", "Unknown")
                days_overdue = (now - datetime.fromisoformat(str(task.get("due_date", now)))).days if task.get("due_date") else 0
                await create_and_deliver(
                    user_id=owner_id,
                    org_id=org_id,
                    type="escalation_owner",
                    title="Task Escalated - Overdue",
                    message=f"Task '{task_title}' assigned to {assignee_id} is {days_overdue} days overdue and requires your attention.",
                    link=f"/tasks/{task.get('_id')}",
                    email=owner_email,
                )
                if owner_email:
                    asyncio.create_task(asyncio.to_thread(
                        send_notification_email,
                        owner_email,
                        f"Escalation - Task Overdue ({days_overdue}d)",
                        f"Task '{task_title}' assigned to {assignee_id} is {days_overdue} days overdue.",
                        link=f"/tasks/{task.get('_id')}",
                        template_name="escalation_owner",
                        template_data={
                            "task_name": task_title,
                            "assignee": str(assignee_id),
                            "days_overdue": days_overdue,
                        },
                    ))
            db.tasks.update_one(
                {"_id": task["_id"]},
                {"$set": {"escalation_level": 2, "owner_escalated": True, "owner_escalated_at": now}},
            )

        tasks_7d_overdue = list(db.tasks.find({
            "due_date": {"$lt": days_7_ago},
            "status": {"$nin": ["completed", "approved"]},
            "escalation_level": {"$lt": 3},
        }))

        org_groups = {}
        for task in tasks_7d_overdue:
            oid = task.get("organization_id", "")
            if oid:
                org_groups.setdefault(oid, []).append(task)

        for org_id, org_tasks in org_groups.items():
            owner_id, owner_email = await get_org_owner_info(db, org_id)
            if not owner_id or not owner_email:
                continue
            all_overdue = list(db.tasks.find({
                "organization_id": org_id,
                "due_date": {"$lt": now},
                "status": {"$nin": ["completed", "approved"]},
            }).sort("due_date", 1))
            summary_lines = []
            for t in all_overdue:
                t_title = t.get("title", "Unknown")
                t_assignee = t.get("assignee_email") or (t.get("assignee_id") or [""])[0] or "Unassigned"
                t_due = str(t.get("due_date", ""))[:10]
                t_days = (now - datetime.fromisoformat(str(t.get("due_date", now)))).days if t.get("due_date") else 0
                summary_lines.append(f"• {t_title} — {t_assignee} (due {t_due}, {t_days}d overdue)")
            summary_text = "\n".join(summary_lines[:20])
            if len(summary_lines) > 20:
                summary_text += f"\n... and {len(summary_lines) - 20} more"
            await create_and_deliver(
                user_id=owner_id,
                org_id=org_id,
                type="escalation_owner",
                title="7-Day Overdue Alert - Action Required",
                message=f"{len(org_tasks)} tasks have been overdue for 7+ days. {len(all_overdue)} total overdue tasks in your organization.",
                link="/dashboard",
                email=owner_email,
            )
            if owner_email:
                from ..core.email_service import send_email
                html_body = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,sans-serif;background:#f5f5f5;padding:32px">
  <table style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden">
    <tr><td style="padding:24px 32px;background:linear-gradient(135deg,#dc2626,#ef4444)">
      <h1 style="color:white;margin:0;font-size:20px">YESBOSS — Overdue Summary</h1>
    </td></tr>
    <tr><td style="padding:32px">
      <h2 style="margin:0 0 8px;font-size:18px;color:#1e293b">Overdue Task Summary</h2>
      <p style="color:#555;line-height:1.5">{len(all_overdue)} task(s) are currently overdue in your organization.</p>
      <pre style="background:#f8fafc;padding:16px;border-radius:8px;font-size:13px;line-height:1.6;white-space:pre-wrap">{summary_text}</pre>
      <p style="margin-top:16px;font-size:12px;color:#999">This is an automated alert from YESBOSS. Please review and take action.</p>
    </td></tr>
  </table>
</body>
</html>"""
                asyncio.create_task(asyncio.to_thread(
                    send_email, owner_email,
                    f"Urgent: {len(all_overdue)} Overdue Tasks Need Attention",
                    html_body, summary_text
                ))
            for task in org_tasks:
                db.tasks.update_one(
                    {"_id": task["_id"]},
                    {"$set": {"escalation_level": 3, "owner_escalated_at": now}},
                )

        logger.info(f"Deadline check done: {len(tasks_due_soon)} due tomorrow, {len(tasks_due_3)} due in 3 days, {len(tasks_overdue)} overdue, {len(tasks_3d_overdue)} escalated to owner, {len(tasks_7d_overdue)} at 7d alert")
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
