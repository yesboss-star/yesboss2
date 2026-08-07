import asyncio
import logging
import threading
from datetime import datetime, timedelta

logger = logging.getLogger("yesboss.scheduler")

CHECK_INTERVAL = 300  # 5 min base — Zoho syncs use this; other jobs use counters

_scheduler_thread: threading.Thread | None = None
_scheduler_stop = threading.Event()


def _days_overdue(due_date):
    """Parse a due_date string safely; returns days overdue or None."""
    if not due_date:
        return 0
    try:
        v = str(due_date).strip().replace("Z", "").replace("+00:00", "")
        return (datetime.utcnow() - datetime.fromisoformat(v)).days
    except Exception:
        return None


def _first_assignee(task) -> str:
    """Return a single assignee identifier (email preferred, else first uid)."""
    email = task.get("assignee_email")
    if email:
        return email
    aids = task.get("assignee_id")
    if isinstance(aids, str) and aids:
        return aids
    if isinstance(aids, list) and aids:
        first = aids[0]
        return first if isinstance(first, str) else str(first)
    return ""


def start_scheduler() -> threading.Thread:
    """Run the scheduler on its own daemon thread + event loop.

    The scheduler does synchronous pymongo / network work (list(db.*.find(...)),
    SMTP sends, etc.). Running it on the uvicorn event loop would block HTTP
    handling for the duration of every cycle (including the heavy first one at
    startup), causing browser requests to hang and fail. A dedicated thread keeps
    the API responsive.
    """
    global _scheduler_thread
    if _scheduler_thread is not None and _scheduler_thread.is_alive():
        return _scheduler_thread

    def _run() -> None:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(scheduler_loop())
        except Exception:
            logger.exception("Scheduler loop crashed")
        finally:
            try:
                for task in asyncio.all_tasks(loop):
                    task.cancel()
            finally:
                loop.close()

    _scheduler_thread = threading.Thread(
        target=_run, daemon=True, name="yesboss-scheduler"
    )
    _scheduler_thread.start()
    return _scheduler_thread


def stop_scheduler() -> None:
    _scheduler_stop.set()


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


async def check_mom_reminders(db):
    try:
        from ..core.notification_service import create_and_deliver
        from ..core.zoho.taz import send_reminder as taz_send

        now = datetime.utcnow()
        two_hours_ago = now - timedelta(hours=2)

        ended_meetings = list(db.meetings.find({
            "end_dt": {"$gte": two_hours_ago, "$lte": now},
            "mom_uploaded": False,
            "reminder_sent": {"$ne": True},
        }))

        for mt in ended_meetings:
            title = mt.get("title", "Untitled")
            atts = mt.get("attendees", [])
            org_id = mt.get("organization_id", "")
            event_id = mt.get("zoho_event_id", "")

            for att in atts:
                await create_and_deliver(
                    user_id=att, org_id=org_id,
                    type="mom_reminder",
                    title="Upload MoM for " + title,
                    message=f"Meeting '{title}' just ended — please upload your Minutes of Meeting",
                    link=f"/dashboard?zoho_event_id={event_id}",
                    metadata={"zoho_event_id": event_id},
                )
                asyncio.create_task(taz_send(
                    message=f"Meeting '{title}' just ended — upload MoM now",
                    assignee_email=att,
                ))

            db.meetings.update_one(
                {"_id": mt["_id"]},
                {"$set": {"reminder_sent": True, "updated_at": now}},
            )
            logger.info("MoM reminders sent for meeting '%s' to %d attendees", title, len(atts))
    except Exception as e:
        logger.warning("MoM reminder check failed: %s", e)


async def check_deadline_reminders():
    try:
        from ..core.database import get_database
        from ..core.email_service import send_notification_email
        from ..core.notification_service import create_and_deliver

        db = get_database()
        if db is None:
            return

        now_dt = datetime.utcnow()
        now = now_dt.replace(microsecond=0).isoformat()
        tomorrow = (now_dt + timedelta(days=1)).replace(microsecond=0).isoformat()
        in_3_days = (now_dt + timedelta(days=3)).replace(microsecond=0).isoformat()
        days_3_ago = (now_dt - timedelta(days=3)).replace(microsecond=0).isoformat()
        days_7_ago = (now_dt - timedelta(days=7)).replace(microsecond=0).isoformat()

        tasks_due_soon = list(db.tasks.find({
            "due_date": {"$gte": now, "$lte": tomorrow},
            "status": {"$nin": ["completed", "approved"]},
            "deadline_reminded_1day": {"$ne": True},
        }))

        for task in tasks_due_soon:
            assignee_id = _first_assignee(task)
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
            from ..core.zoho.taz import send_task_reminder as taz_remind
            asyncio.create_task(taz_remind(
                task_title=task.get("title", ""), due_date=str(task.get("due_date", ""))[:10],
                assignee_email=assignee_id, task_id=str(task.get("_id", "")), reminder_type="upcoming",
            ))
            mgr = await find_manager_email(db, assignee_id)
            if mgr:
                await create_and_deliver(
                    user_id=mgr,
                    org_id=task.get("organization_id", ""),
                    type="task_deadline",
                    title="Team member's task due tomorrow",
                    message=f"'{task.get('title')}' assigned to {assignee_id} is due tomorrow",
                    link=f"/tasks/{task.get('_id')}",
                    metadata={"task_id": str(task.get("_id", "")), "assignee": assignee_id},
                )

            db.tasks.update_one(
                {"_id": task["_id"]},
                {"$set": {"deadline_reminded_1day": True}},
            )

        tasks_due_3 = list(db.tasks.find({
            "due_date": {"$gte": tomorrow, "$lte": in_3_days},
            "status": {"$nin": ["completed", "approved"]},
            "deadline_reminded_3day": {"$ne": True},
        }))

        for task in tasks_due_3:
            assignee_id = _first_assignee(task)
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
            from ..core.zoho.taz import send_task_reminder as taz_remind
            asyncio.create_task(taz_remind(
                task_title=task.get("title", ""), due_date=str(task.get("due_date", ""))[:10],
                assignee_email=assignee_id, task_id=str(task.get("_id", "")), reminder_type="upcoming",
            ))
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
                    title="Team member's task due in 3 days",
                    message=f"'{task.get('title')}' assigned to {assignee_id} is due in 3 days",
                    link=f"/tasks/{task.get('_id')}",
                    metadata={"task_id": str(task.get("_id", "")), "assignee": assignee_id},
                )

        tasks_overdue = list(db.tasks.find({
            "due_date": {"$gt": "", "$lt": now},
            "status": {"$nin": ["completed", "approved"]},
            "overdue_notified": {"$ne": True},
        }))

        for task in tasks_overdue:
            assignee_id = _first_assignee(task)
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
            from ..core.zoho.taz import send_task_reminder as taz_remind
            asyncio.create_task(taz_remind(
                task_title=task.get("title", ""), due_date=str(task.get("due_date", ""))[:10],
                assignee_email=assignee_id, task_id=str(task.get("_id", "")), reminder_type="overdue",
            ))
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
                    title="Task Overdue — team member",
                    message=f"'{task.get('title')}' assigned to {assignee_id} is overdue!",
                    link=f"/tasks/{task.get('_id')}",
                    metadata={"task_id": str(task.get("_id", "")), "assignee": assignee_id},
                )

        tasks_3d_overdue = list(db.tasks.find({
            "due_date": {"$gt": "", "$lt": days_3_ago},
            "status": {"$nin": ["completed", "approved"]},
            "escalation_level": {"$lt": 2},
        }))

        for task in tasks_3d_overdue:
            assignee_id = _first_assignee(task)
            org_id = task.get("organization_id", "")
            if not assignee_id or not org_id:
                continue
            owner_id, owner_email = await get_org_owner_info(db, org_id)
            if owner_id:
                task_title = task.get("title", "Unknown")
                days_overdue = _days_overdue(task.get("due_date"))
                if days_overdue is not None:
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
            from ..core.zoho.taz import send_task_reminder as taz_remind
            asyncio.create_task(taz_remind(
                task_title=task.get("title", ""), due_date=str(task.get("due_date", ""))[:10],
                assignee_email=assignee_id, task_id=str(task.get("_id", "")), reminder_type="overdue",
            ))
            db.tasks.update_one(
                {"_id": task["_id"]},
                {"$set": {"escalation_level": 2, "owner_escalated": True, "owner_escalated_at": now_dt}},
            )

        tasks_7d_overdue = list(db.tasks.find({
            "due_date": {"$gt": "", "$lt": days_7_ago},
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
                "due_date": {"$gt": "", "$lt": now},
                "status": {"$nin": ["completed", "approved"]},
            }).sort("due_date", 1))
            summary_lines = []
            for t in all_overdue:
                t_title = t.get("title", "Unknown")
                t_assignee = t.get("assignee_email") or (t.get("assignee_id") or [""])[0] or "Unassigned"
                t_due = str(t.get("due_date", ""))[:10]
                t_days = _days_overdue(t.get("due_date"))
                if t_days is None:
                    continue
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
                from ..core.zoho.taz import send_task_reminder as taz_remind
                asyncio.create_task(taz_remind(
                    task_title=task.get("title", ""), due_date=str(task.get("due_date", ""))[:10],
                    assignee_email=_first_assignee(task),
                    task_id=str(task.get("_id", "")), reminder_type="overdue",
                ))
                db.tasks.update_one(
                    {"_id": task["_id"]},
                    {"$set": {"escalation_level": 3, "owner_escalated_at": now_dt}},
                )

        await check_mom_reminders(db)
        logger.info(f"Deadline check done: {len(tasks_due_soon)} due tomorrow, {len(tasks_due_3)} due in 3 days, {len(tasks_overdue)} overdue, {len(tasks_3d_overdue)} escalated to owner, {len(tasks_7d_overdue)} at 7d alert")
    except Exception as e:
        logger.error(f"Deadline check failed: {e}")


async def check_goal_deadlines(db):
    try:
        from ..core.email_service import send_notification_email
        from ..core.notification_service import create_and_deliver
        from ..core.zoho.taz import send_task_reminder as taz_remind

        now_dt = datetime.utcnow()
        now = now_dt.replace(microsecond=0).isoformat()
        tomorrow = (now_dt + timedelta(days=1)).replace(microsecond=0).isoformat()
        in_3_days = (now_dt + timedelta(days=3)).replace(microsecond=0).isoformat()
        days_3_ago = (now_dt - timedelta(days=3)).replace(microsecond=0).isoformat()
        days_7_ago = (now_dt - timedelta(days=7)).replace(microsecond=0).isoformat()

        def _first_assignee(g):
            aids = g.get("assignee_id") or []
            return aids[0] if aids else (g.get("assignee_email") or None)

        goals_due_soon = list(db.goals.find({
            "due_date": {"$gte": now, "$lte": tomorrow},
            "status": {"$ne": "completed"},
        }))

        for g in goals_due_soon:
            aid = _first_assignee(g)
            if not aid:
                continue
            await create_and_deliver(
                user_id=aid,
                org_id=g.get("organization_id", ""),
                type="goal_deadline",
                title="Goal Due Tomorrow",
                message=f"Goal '{g.get('title')}' is due tomorrow",
                link=f"/goals/{g.get('_id')}",
                metadata={"goal_id": str(g.get("_id", "")), "due_date": str(g.get("due_date", ""))},
            )
            asyncio.create_task(taz_remind(
                task_title=g.get("title", ""), due_date=str(g.get("due_date", ""))[:10],
                assignee_email=aid, task_id=str(g.get("_id", "")), reminder_type="upcoming",
            ))
            mgr = await find_manager_email(db, aid)
            if mgr:
                await create_and_deliver(
                    user_id=mgr,
                    org_id=g.get("organization_id", ""),
                    type="goal_deadline",
                    title="Team member's goal due tomorrow",
                    message=f"Goal '{g.get('title')}' assigned to {aid} is due tomorrow",
                    link=f"/goals/{g.get('_id')}",
                    metadata={"goal_id": str(g.get("_id", "")), "assignee": aid},
                )

        goals_due_3 = list(db.goals.find({
            "due_date": {"$gte": tomorrow, "$lte": in_3_days},
            "status": {"$ne": "completed"},
            "goal_deadline_reminded_3day": {"$ne": True},
        }))

        for g in goals_due_3:
            aid = _first_assignee(g)
            if not aid:
                continue
            await create_and_deliver(
                user_id=aid,
                org_id=g.get("organization_id", ""),
                type="goal_deadline",
                title="Goal Due in 3 Days",
                message=f"Goal '{g.get('title')}' is due in 3 days",
                link=f"/goals/{g.get('_id')}",
                metadata={"goal_id": str(g.get("_id", "")), "due_date": str(g.get("due_date", ""))},
            )
            asyncio.create_task(taz_remind(
                task_title=g.get("title", ""), due_date=str(g.get("due_date", ""))[:10],
                assignee_email=aid, task_id=str(g.get("_id", "")), reminder_type="upcoming",
            ))
            db.goals.update_one(
                {"_id": g["_id"]},
                {"$set": {"goal_deadline_reminded_3day": True}},
            )
            mgr = await find_manager_email(db, aid)
            if mgr:
                await create_and_deliver(
                    user_id=mgr,
                    org_id=g.get("organization_id", ""),
                    type="goal_deadline",
                    title="Team member's goal due in 3 days",
                    message=f"Goal '{g.get('title')}' assigned to {aid} is due in 3 days",
                    link=f"/goals/{g.get('_id')}",
                    metadata={"goal_id": str(g.get("_id", "")), "assignee": aid},
                )

        goals_overdue = list(db.goals.find({
            "due_date": {"$gt": "", "$lt": now},
            "status": {"$ne": "completed"},
            "goal_overdue_notified": {"$ne": True},
        }))

        for g in goals_overdue:
            aid = _first_assignee(g)
            if not aid:
                continue
            await create_and_deliver(
                user_id=aid,
                org_id=g.get("organization_id", ""),
                type="goal_deadline",
                title="Goal Overdue",
                message=f"Goal '{g.get('title')}' is overdue!",
                link=f"/goals/{g.get('_id')}",
                metadata={"goal_id": str(g.get("_id", "")), "due_date": str(g.get("due_date", ""))},
            )
            asyncio.create_task(taz_remind(
                task_title=g.get("title", ""), due_date=str(g.get("due_date", ""))[:10],
                assignee_email=aid, task_id=str(g.get("_id", "")), reminder_type="overdue",
            ))
            db.goals.update_one(
                {"_id": g["_id"]},
                {"$set": {"goal_overdue_notified": True}},
            )
            mgr = await find_manager_email(db, aid)
            if mgr:
                await create_and_deliver(
                    user_id=mgr,
                    org_id=g.get("organization_id", ""),
                    type="goal_deadline",
                    title="Goal Overdue — team member",
                    message=f"Goal '{g.get('title')}' assigned to {aid} is overdue!",
                    link=f"/goals/{g.get('_id')}",
                    metadata={"goal_id": str(g.get("_id", "")), "assignee": aid},
                )

        goals_3d_overdue = list(db.goals.find({
            "due_date": {"$gt": "", "$lt": days_3_ago},
            "status": {"$ne": "completed"},
            "goal_escalation_level": {"$lt": 2},
        }))

        for g in goals_3d_overdue:
            aid = _first_assignee(g)
            org_id = g.get("organization_id", "")
            if not aid or not org_id:
                continue
            owner_id, owner_email = await get_org_owner_info(db, org_id)
            if owner_id:
                g_title = g.get("title", "Unknown")
                days_overdue = _days_overdue(g.get("due_date"))
                if days_overdue is not None:
                    await create_and_deliver(
                        user_id=owner_id,
                        org_id=org_id,
                        type="escalation_owner",
                        title="Goal Escalated - Overdue",
                        message=f"Goal '{g_title}' assigned to {aid} is {days_overdue} days overdue and requires your attention.",
                        link=f"/goals/{g.get('_id')}",
                        email=owner_email,
                    )
                    if owner_email:
                        asyncio.create_task(asyncio.to_thread(
                            send_notification_email,
                            owner_email,
                            f"Escalation - Goal Overdue ({days_overdue}d)",
                            f"Goal '{g_title}' assigned to {aid} is {days_overdue} days overdue.",
                            link=f"/goals/{g.get('_id')}",
                            template_name="escalation_owner",
                            template_data={
                                "task_name": g_title,
                                "assignee": str(aid),
                                "days_overdue": days_overdue,
                            },
                        ))
            asyncio.create_task(taz_remind(
                task_title=g.get("title", ""), due_date=str(g.get("due_date", ""))[:10],
                assignee_email=aid, task_id=str(g.get("_id", "")), reminder_type="overdue",
            ))
            db.goals.update_one(
                {"_id": g["_id"]},
                {"$set": {"goal_escalation_level": 2, "goal_owner_escalated": True, "goal_owner_escalated_at": now_dt}},
            )

        goals_7d_overdue = list(db.goals.find({
            "due_date": {"$gt": "", "$lt": days_7_ago},
            "status": {"$ne": "completed"},
            "goal_escalation_level": {"$lt": 3},
        }))

        org_groups = {}
        for g in goals_7d_overdue:
            oid = g.get("organization_id", "")
            if oid:
                org_groups.setdefault(oid, []).append(g)

        for org_id, org_goals in org_groups.items():
            owner_id, owner_email = await get_org_owner_info(db, org_id)
            if not owner_id or not owner_email:
                continue
            all_overdue = list(db.goals.find({
                "organization_id": org_id,
                "due_date": {"$gt": "", "$lt": now},
                "status": {"$ne": "completed"},
            }).sort("due_date", 1))
            summary_lines = []
            for g in all_overdue:
                g_title = g.get("title", "Unknown")
                g_assignee = _first_assignee(g) or "Unassigned"
                g_due = str(g.get("due_date", ""))[:10]
                g_days = _days_overdue(g.get("due_date"))
                if g_days is None:
                    continue
                summary_lines.append(f"• {g_title} — {g_assignee} (due {g_due}, {g_days}d overdue)")
            summary_text = "\n".join(summary_lines[:20])
            if len(summary_lines) > 20:
                summary_text += f"\n... and {len(summary_lines) - 20} more"
            await create_and_deliver(
                user_id=owner_id,
                org_id=org_id,
                type="escalation_owner",
                title="7-Day Overdue Goals Alert - Action Required",
                message=f"{len(org_goals)} goals have been overdue for 7+ days. {len(all_overdue)} total overdue goals in your organization.",
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
      <h1 style="color:white;margin:0;font-size:20px">YESBOSS — Overdue Goals Summary</h1>
    </td></tr>
    <tr><td style="padding:32px">
      <h2 style="margin:0 0 8px;font-size:18px;color:#1e293b">Overdue Goal Summary</h2>
      <p style="color:#555;line-height:1.5">{len(all_overdue)} goal(s) are currently overdue in your organization.</p>
      <pre style="background:#f8fafc;padding:16px;border-radius:8px;font-size:13px;line-height:1.6;white-space:pre-wrap">{summary_text}</pre>
      <p style="margin-top:16px;font-size:12px;color:#999">This is an automated alert from YESBOSS. Please review and take action.</p>
    </td></tr>
  </table>
</body>
</html>"""
                asyncio.create_task(asyncio.to_thread(
                    send_email, owner_email,
                    f"Urgent: {len(all_overdue)} Overdue Goals Need Attention",
                    html_body, summary_text
                ))
            for g in org_goals:
                asyncio.create_task(taz_remind(
                    task_title=g.get("title", ""), due_date=str(g.get("due_date", ""))[:10],
                    assignee_email=_first_assignee(g) or "",
                    task_id=str(g.get("_id", "")), reminder_type="overdue",
                ))
                db.goals.update_one(
                    {"_id": g["_id"]},
                    {"$set": {"goal_escalation_level": 3, "goal_owner_escalated_at": now_dt}},
                )

        if goals_due_soon or goals_due_3 or goals_overdue or goals_3d_overdue or goals_7d_overdue:
            logger.info(f"Goal deadline check: {len(goals_due_soon)} due tomorrow, {len(goals_due_3)} due in 3d, {len(goals_overdue)} overdue, {len(goals_3d_overdue)} escalated, {len(goals_7d_overdue)} at 7d alert")
    except Exception as e:
        logger.error(f"Goal deadline check failed: {e}")


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


async def send_morning_journal_prompts():
    try:
        from ..core.database import get_database
        from ..core.notification_service import create_and_deliver

        db = get_database()
        if db is None:
            return

        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        users = list(db.users.find({"organization_id": {"$ne": None}}))
        sent = 0
        for user in users:
            uid = user.get("uid")
            org_id = user.get("organization_id")
            if not uid or not org_id:
                continue
            existing = db.journal_entries.find_one({
                "user_id": uid,
                "created_at": {"$gte": today_start},
            })
            if existing:
                continue
            try:
                await create_and_deliver(
                    user_id=uid,
                    org_id=org_id,
                    type="journal_prompt",
                    title="Good morning!",
                    message="Start your day with a quick journal entry. Capture your thoughts, ideas, or reflections.",
                    link="/dashboard/ideas",
                )
                sent += 1
            except Exception:
                pass

        if sent:
            logger.info(f"Morning journal prompts sent to {sent} users")
    except Exception as e:
        logger.error(f"Morning journal prompt send failed: {e}")


async def send_auto_reports():
    try:
        from ..core.database import get_database
        from ..core.notification_service import create_and_deliver
        from ..core.report_generator import generate_employee_report, generate_org_health

        db = get_database()
        if db is None:
            return

        now = datetime.utcnow()
        is_monday = now.weekday() == 0
        is_first_of_month = now.day == 1
        hour = now.hour

        if not is_monday and not is_first_of_month:
            return
        if hour != 9:
            return

        orgs = list(db.organizations.find({}))
        for org in orgs:
            org_id = str(org["_id"])
            owner_id = org.get("owner_id")
            if not owner_id:
                continue

            try:
                if is_monday:
                    # Determine recipient: owner first, fallback to root org chart member
                    _, recipient_email = await get_org_owner_info(db, org_id)
                    if not recipient_email:
                        root = db.org_chart_members.find_one(
                            {"organization_id": org_id, "manager_email": {"$in": [None, ""]}}
                        )
                        if root:
                            recipient_email = root.get("email")
                    if not recipient_email:
                        logger.warning(f"No owner or root user found for org {org_id}, skipping reports")
                        continue

                    members = list(db.org_chart_members.find({"organization_id": org_id}))
                    for m in members:
                        emp_email = m.get("email", "")
                        if not emp_email:
                            continue
                        report = await generate_employee_report(db, org_id, emp_email, "weekly")
                        await create_and_deliver(
                            user_id=recipient_email,
                            org_id=org_id,
                            type="report_weekly",
                            title=f"Weekly Performance Report — {m.get('name', emp_email)}",
                            message=f"Report for {m.get('name', emp_email)} — {report['metrics']['completion_rate']}% completion rate.",
                            link="/dashboard/reports",
                            email=recipient_email,
                        )
                    logger.info(f"Weekly reports sent to {recipient_email} for org {org_id} ({len(members)} employees)")

                if is_first_of_month:
                    health = await generate_org_health(db, org_id)
                    await create_and_deliver(
                        user_id=owner_id,
                        org_id=org_id,
                        type="report_monthly",
                        title=f"Monthly Org Health: {health['health_label']}",
                        message=f"Organization health score: {health['health_score']}/100 ({health['health_label']}). {len(health.get('departments', {}))} departments analyzed.",
                        link="/dashboard/reports",
                    )
                    logger.info(f"Monthly health report sent for org {org_id}")
            except Exception as e:
                logger.error(f"Auto-report failed for org {org_id}: {e}")
    except Exception as e:
        logger.error(f"Auto-report send failed: {e}")


async def sync_zoho_tasks():
    try:
        from datetime import datetime

        from ..core.database import get_database
        from ..core.zoho import ZohoMailTasks, ZohoOAuth

        db = get_database()
        if db is None:
            return
        zmt = ZohoMailTasks(db)
        zoho = ZohoOAuth(db)
        now_iso = datetime.utcnow().isoformat()

        users = list(db.zoho_tokens.find({"scope": {"$regex": "ZohoMail"}}))
        for token_doc in users:
            user_id = token_doc.get("user_id", "")
            org_id = token_doc.get("org_id", "")
            if not user_id:
                continue
            token = await zoho.get_valid_token(user_id)
            if not token:
                continue
            last_sync = token_doc.get("last_task_sync_at", "")
            if not last_sync:
                last_sync = "2000-01-01T00:00:00+05:30"

            zoho_tasks = await zmt.list_personal_tasks(token, since=last_sync)
            for zt in zoho_tasks:
                zoho_id = zt.get("id")
                existing = db.tasks.find_one({"zoho_personal_task_id": zoho_id})
                if existing:
                    updates = {}
                    zoho_status = zt.get("status", "")
                    mapped = ZohoMailTasks.map_zoho_status(zoho_status)
                    if mapped != existing.get("status"):
                        updates["status"] = mapped
                    new_title = zt.get("title", "")
                    if new_title and new_title != existing.get("title"):
                        updates["title"] = new_title
                    if updates:
                        updates["updated_at"] = datetime.utcnow()
                        db.tasks.update_one({"_id": existing["_id"]}, {"$set": updates})
                else:
                    new_task = {
                        "title": zt.get("title", "Untitled"),
                        "description": zt.get("description", ""),
                        "priority": zt.get("priority", "normal").lower().replace("high", "high").replace("low", "low"),
                        "status": ZohoMailTasks.map_zoho_status(zt.get("status", "")),
                        "assignee_id": [user_id],
                        "assignee_email": user_id,
                        "organization_id": org_id,
                        "due_date": ZohoMailTasks.parse_zoho_date(zt.get("dueDate", "")),
                        "zoho_personal_task_id": zoho_id,
                        "zoho_sync_status": "synced",
                        "zoho_last_synced_at": now_iso,
                        "source": "zoho_sync",
                        "created_at": datetime.utcnow(),
                        "updated_at": datetime.utcnow(),
                        "escalation_level": 0,
                        "owner_escalated": False,
                        "owner_escalated_at": None,
                        "reviewers": [],
                        "dependencies": [],
                    }
                    result = db.tasks.insert_one(new_task)
                    new_task["_id"] = str(result.inserted_id)
                    from ..core.notification_service import create_and_deliver
                    await create_and_deliver(
                        user_id=user_id, org_id=org_id, type="task_assigned",
                        title="New Task from Zoho Sync",
                        message=f"Task '{new_task['title']}' synced from your Zoho Mail",
                        link=f"/tasks/{new_task['_id']}",
                    )

            db.zoho_tokens.update_one(
                {"user_id": user_id},
                {"$set": {"last_task_sync_at": now_iso}},
            )
    except Exception as e:
        logger.warning(f"Zoho task sync error: {e}")


async def sync_zoho_calendar():
    try:
        from datetime import datetime, timedelta

        from ..core.database import get_database
        from ..core.zoho import ZohoCalendar, ZohoOAuth

        db = get_database()
        if db is None:
            return
        zoho = ZohoOAuth(db)

        users = list(db.zoho_tokens.find({"scope": {"$regex": "ZohoCalendar"}}))
        for token_doc in users:
            user_id = token_doc.get("user_id", "")
            org_id = token_doc.get("org_id", "")
            token = await zoho.get_valid_token(user_id)
            if not token:
                continue

            cal_uid = await ZohoCalendar.get_default_calendar_uid(token)
            if not cal_uid:
                continue

            now = datetime.utcnow()
            range_start = now.strftime("%Y%m%d")
            range_end = (now + timedelta(days=30)).strftime("%Y%m%d")

            events = await ZohoCalendar.get_events(token, cal_uid, range_start, range_end)
            for ev in events:
                zoho_id = ev.get("uid")
                if not zoho_id:
                    continue
                dt = ev.get("dateandtime", {})
                doc = {
                    "zoho_event_id": zoho_id,
                    "calendar_uid": cal_uid,
                    "organization_id": org_id,
                    "user_email": user_id,
                    "title": ev.get("title", ""),
                    "description": ev.get("description", ""),
                    "start": dt.get("start", ""),
                    "end": dt.get("end", ""),
                    "attendees": [a.get("email") for a in ev.get("attendees", []) if a.get("email")],
                    "location": ev.get("location", ""),
                    "raw_data": ev,
                    "synced_at": datetime.utcnow().isoformat(),
                }
                existing = db.calendar_events.find_one({"zoho_event_id": zoho_id})
                if existing:
                    db.calendar_events.update_one({"_id": existing["_id"]}, {"$set": doc})
                else:
                    db.calendar_events.insert_one(doc)
    except Exception as e:
        logger.warning(f"Zoho calendar sync error: {e}")


async def sync_google_tasks():
    try:
        from datetime import datetime

        from ..core.database import get_database
        from ..core.google import GoogleOAuth, GoogleTasks

        db = get_database()
        if db is None:
            return
        google = GoogleOAuth(db)
        now_iso = datetime.utcnow().isoformat()

        users = list(db.google_tokens.find({"scope": {"$regex": "tasks"}}))
        for token_doc in users:
            user_id = token_doc.get("user_id", "")
            org_id = token_doc.get("org_id", "")
            if not user_id:
                continue
            token = await google.get_valid_token(user_id)
            if not token:
                continue

            gtasks = GoogleTasks(db)

            # Reverse sync: scan all of this user's lists so a task completed in any
            # Google list reflects back in yesboss as completed.
            from ..api.tasks import sync_google_completions
            email = token_doc.get("email", "")
            await sync_google_completions(db, email or user_id, token=token, org_id=org_id)

            # Forward-ish: pull in tasks created directly in Google Tasks (not pushed by
            # yesboss), limited to the 'YesBoss' list to avoid importing unrelated tasks.
            list_id = await gtasks.ensure_list(token)
            if not list_id:
                continue

            google_tasks = await gtasks.list_tasks(token, list_id, show_completed=True)
            for gt in google_tasks:
                gtask_id = gt.get("id")
                existing = db.tasks.find_one({"google_task_id": gtask_id})
                if existing:
                    updates = {}
                    google_status = gt.get("status", "")
                    mapped = GoogleTasks.map_google_status(google_status)
                    if mapped not in ("completed", "") and mapped != existing.get("status"):
                        updates["status"] = mapped
                    new_title = gt.get("title", "")
                    if new_title and new_title != existing.get("title"):
                        updates["title"] = new_title
                    if updates:
                        updates["updated_at"] = datetime.utcnow()
                        db.tasks.update_one({"_id": existing["_id"]}, {"$set": updates})
                else:
                    # Only pull in tasks created directly in Google Tasks (not pushed by yesboss).
                    notes = gt.get("notes", "") or ""
                    if "YesBoss" in notes or "yesboss" in notes.lower():
                        continue
                    new_task = {
                        "title": gt.get("title", "Untitled"),
                        "description": notes,
                        "priority": "medium",
                        "status": GoogleTasks.map_google_status(gt.get("status", "")),
                        "assignee_id": [user_id],
                        "assignee_email": user_id,
                        "organization_id": org_id,
                        "due_date": (gt.get("due") or "")[:10] or None,
                        "google_task_id": gtask_id,
                        "google_task_list_id": list_id,
                        "google_sync_status": "synced",
                        "google_last_synced_at": now_iso,
                        "source": "google_sync",
                        "created_at": datetime.utcnow(),
                        "updated_at": datetime.utcnow(),
                        "escalation_level": 0,
                        "owner_escalated": False,
                        "owner_escalated_at": None,
                        "reviewers": [],
                        "dependencies": [],
                    }
                    result = db.tasks.insert_one(new_task)
                    new_task["_id"] = str(result.inserted_id)
                    from ..core.notification_service import create_and_deliver
                    await create_and_deliver(
                        user_id=user_id, org_id=org_id, type="task_assigned",
                        title="New Task from Google Sync",
                        message=f"Task '{new_task['title']}' synced from your Google Tasks",
                        link=f"/tasks/{new_task['_id']}",
                    )

            db.google_tokens.update_one(
                {"user_id": user_id},
                {"$set": {"last_task_sync_at": now_iso}},
            )
    except Exception as e:
        logger.warning(f"Google task sync error: {e}")


async def sync_pending_google_tasks(limit: int = 50):
    """Retry tasks that failed to push to Google Tasks (google_sync_status is
    'pending' or 'error'). Each sync_task_to_google call honours its own max-attempts
    cap via the task's google_sync_attempts field, so retries are bounded."""
    try:
        from ..api.tasks import sync_task_to_google
        from ..core.database import get_database as _gd

        db = _gd()
        if db is None:
            return
        pending = list(
            db.tasks.find(
                {
                    "google_sync_status": {"$in": ["pending", "error"]},
                    "google_sync_attempts": {"$lt": 5},
                }
            ).limit(limit)
        )
        for task_doc in pending:
            task_doc["_id"] = str(task_doc["_id"])
            org_id = task_doc.get("organization_id", "")
            try:
                await sync_task_to_google(db, task_doc, org_id)
            except Exception as e:
                logger.warning("Retry of pending google task %s failed: %s", task_doc["_id"], e)
        if pending:
            logger.info("Retried %s pending google tasks", len(pending))
    except Exception as e:
        logger.warning(f"sync_pending_google_tasks error: {e}")


async def sync_google_calendar():
    try:
        from datetime import datetime, timedelta

        from ..core.database import get_database
        from ..core.google import GoogleCalendar, GoogleOAuth

        db = get_database()
        if db is None:
            return
        google = GoogleOAuth(db)

        users = list(db.google_tokens.find({"scope": {"$regex": "calendar"}}))
        for token_doc in users:
            user_id = token_doc.get("user_id", "")
            org_id = token_doc.get("org_id", "")
            token = await google.get_valid_token(user_id)
            if not token:
                continue

            cal_id = await GoogleCalendar.get_primary_calendar_id(token)
            if not cal_id:
                continue

            now = datetime.utcnow()
            time_min = now.isoformat()
            time_max = (now + timedelta(days=30)).isoformat()

            events = await GoogleCalendar.list_events(token, cal_id, time_min, time_max)
            for ev in events:
                gid = ev.get("id")
                if not gid:
                    continue
                doc = {
                    "google_event_id": gid,
                    "calendar_uid": cal_id,
                    "organization_id": org_id,
                    "user_email": user_id,
                    "title": ev.get("summary", ""),
                    "description": ev.get("description", ""),
                    "start": (ev.get("start") or {}).get("dateTime", ""),
                    "end": (ev.get("end") or {}).get("dateTime", ""),
                    "attendees": [a.get("email") for a in ev.get("attendees", []) if a.get("email")],
                    "location": ev.get("location", ""),
                    "raw_data": ev,
                    "synced_at": datetime.utcnow().isoformat(),
                }
                existing = db.calendar_events.find_one({"google_event_id": gid})
                if existing:
                    db.calendar_events.update_one({"_id": existing["_id"]}, {"$set": doc})
                else:
                    db.calendar_events.insert_one(doc)
    except Exception as e:
        logger.warning(f"Google calendar sync error: {e}")


async def check_owner_check_ins():
    try:
        from ..core.check_in_service import (
            check_org_due_for_check_in,
            generate_check_in,
            send_check_in_notification,
            store_check_in,
        )
        from ..core.database import get_database

        db = get_database()
        if db is None:
            return

        orgs = list(db.organizations.find({}))
        checked = 0
        for org in orgs:
            org_id = str(org["_id"])
            due = await check_org_due_for_check_in(db, org)
            if not due:
                continue
            owner_ids = set()
            if org.get("owner_id"):
                owner_ids.add(org["owner_id"])
            for co in (org.get("co_owners") or []):
                owner_ids.add(co)
            org_checked = False
            for owner_id in owner_ids:
                if not owner_id:
                    continue
                check_in_data = await generate_check_in(db, org_id, owner_id)
                if not check_in_data.get("should_send"):
                    continue
                await store_check_in(db, check_in_data)
                await send_check_in_notification(db, check_in_data)
                checked += 1
                org_checked = True

            if org_checked:
                db.organizations.update_one(
                    {"_id": org["_id"]},
                    {"$set": {"last_check_in": datetime.utcnow()}}
                )

        if checked:
            logger.info(f"Check-in reminders sent to {checked} owner(s)")
    except Exception as e:
        logger.error(f"Check-in check failed: {e}")


async def aggregate_cross_company_patterns():
    try:
        from ..core.learning import learning
        logger.info("Running cross-company pattern aggregation...")
        result = learning.aggregate_industry_patterns()
        if result.get("success"):
            logger.info(f"Aggregated {result.get('aggregated', 0)} industry/vertical patterns")
    except Exception as e:
        logger.error(f"Pattern aggregation failed: {e}")


async def record_performance_snapshots():
    try:
        from ..core.database import get_database as _gd
        from ..core.learning import learning
        db = _gd()
        if db is None:
            return
        orgs = list(db.organizations.find({}, {"_id": 1}))
        for org in orgs:
            org_id = str(org["_id"])
            await asyncio.to_thread(learning.record_performance_snapshot, org_id)
        logger.info(f"Recorded performance snapshots for {len(orgs)} orgs")
    except Exception as e:
        logger.error(f"Performance snapshot recording failed: {e}")


async def generate_weekly_owner_briefings():
    try:
        from ..core.database import get_database as _gd
        from ..core.learning import learning
        from ..core.notification_service import create_and_deliver
        db = _gd()
        if db is None:
            return
        import hashlib

        orgs = list(db.organizations.find({}, {"_id": 1, "name": 1, "owner_id": 1}))
        for org in orgs:
            org_id = str(org["_id"])
            owner_id = org.get("owner_id")
            if not owner_id:
                continue

            org_ref = hashlib.sha256(org_id.encode()).hexdigest()[:16]
            trends = learning.get_performance_trends(org_id, weeks=8)
            freqs = list(db.employee_frequencies.find({"org_ref": org_ref}))
            goals = list(db.goals.find({"organization_id": org_id, "status": "active"}))
            tasks = list(db.tasks.find({"organization_id": org_id}))

            overloaded = []
            top_performers = []
            emp_patterns = {}
            for f in freqs:
                emp = f.get("employee_role", "")
                if emp not in emp_patterns:
                    emp_patterns[emp] = {"categories": set(), "total_freq": 0, "total_hours": 0}
                emp_patterns[emp]["categories"].add(f.get("work_category", ""))
                emp_patterns[emp]["total_freq"] += f.get("frequency_per_week", 0)
                emp_patterns[emp]["total_hours"] += f.get("avg_completion_hours", 0)

            for emp, data in emp_patterns.items():
                if data["total_freq"] > 5 or len(data["categories"]) > 4:
                    overloaded.append(emp)

            for t in trends:
                if t.get("direction") == "improving":
                    top_performers.append(t["email"])

            completed_count = len([t for t in tasks if t.get("status") == "completed"])
            overdue_count = len([t for t in tasks if t.get("status") in ("pending", "in_progress") and t.get("due_date") and t["due_date"] < datetime.utcnow().isoformat()])
            escalation_count = len([t for t in tasks if t.get("escalation_level", 0) >= 1])
            completion_rate = round((completed_count / len(tasks) * 100) if tasks else 0, 1)

            skill_gaps = []
            goal_cats = set()
            for g in goals:
                goal_cats.add(g.get("department", "general"))
            all_proven = set()
            for f in freqs:
                all_proven.add(f.get("work_category", ""))
            for c in goal_cats:
                if c.lower() not in [p.lower() for p in all_proven]:
                    skill_gaps.append(c)

            briefing_lines = [
                f"--- Weekly Owner Briefing for {org.get('name', 'Your Org')} ---",
                f"Active Goals: {len(goals)}",
                f"Tasks: {len(tasks)} total, {completion_rate}% completion",
                f"Overdue: {overdue_count} | Escalated: {escalation_count}",
            ]
            if overloaded:
                briefing_lines.append(f"Overloaded Employees: {', '.join(overloaded[:5])}")
            if top_performers:
                briefing_lines.append(f"Top Performers (improving): {', '.join(top_performers[:5])}")
            if skill_gaps:
                briefing_lines.append(f"Skill Gaps: {', '.join(skill_gaps[:5])}")
            briefing_lines.append(f"--- Generated {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC ---")

            briefing_text = "\n".join(briefing_lines)
            db.owner_briefings.insert_one({
                "organization_id": org_id,
                "owner_id": owner_id,
                "content": briefing_text,
                "generated_at": datetime.utcnow(),
            })

            await create_and_deliver(
                user_id=owner_id,
                org_id=org_id,
                type="weekly_briefing",
                title="Weekly Owner Briefing",
                message=f"Your weekly briefing is ready. {len(goals)} active goals, {completion_rate}% task completion.",
                link="/dashboard/reports",
            )

        logger.info(f"Generated weekly briefings for {len(orgs)} orgs")
    except Exception as e:
        logger.error(f"Weekly briefing generation failed: {e}")


async def send_weekly_idea_digest():
    try:
        from ..core.database import get_database
        from ..core.notification_service import create_and_deliver

        db = get_database()
        if db is None:
            return

        now = datetime.utcnow()
        week_ago = now - timedelta(days=7)
        orgs = list(db.organizations.find({}))
        for org in orgs:
            org_id = str(org["_id"])
            owner_id = org.get("owner_id")
            if not owner_id:
                continue
            new_ideas = db.journal_entries.count_documents({
                "org_id": org_id,
                "created_at": {"$gte": week_ago},
            })
            total_ideas = db.journal_entries.count_documents({"org_id": org_id})
            unworked = db.journal_entries.count_documents({
                "org_id": org_id,
                "$or": [
                    {"linked_tasks": {"$exists": False}},
                    {"linked_tasks": []},
                    {"linked_goals": {"$exists": False}},
                    {"linked_goals": []},
                ],
            })
            await create_and_deliver(
                user_id=owner_id,
                org_id=org_id,
                type="weekly_idea_digest",
                title="Your Weekly Ideas Digest",
                message=f"You had {new_ideas} new idea(s) this week. {total_ideas} total ideas, {unworked} still unlinked.",
                link="/dashboard/ideas",
            )
            members = list(db.users.find({"organization_id": org_id, "uid": {"$ne": owner_id}}))
            for member in members:
                uid = member.get("uid")
                if not uid:
                    continue
                member_ideas = db.journal_entries.count_documents({
                    "org_id": org_id,
                    "user_id": uid,
                    "created_at": {"$gte": week_ago},
                })
                if member_ideas > 0:
                    await create_and_deliver(
                        user_id=uid,
                        org_id=org_id,
                        type="weekly_idea_digest",
                        title="Your Weekly Ideas Digest",
                        message=f"You logged {member_ideas} idea(s) this week. Keep them coming!",
                        link="/dashboard/ideas",
                    )
        logger.info("Weekly idea digest sent")
    except Exception as e:
        logger.error(f"Weekly idea digest failed: {e}")


async def scheduler_loop():
    logger.info("Scheduler started")
    deadline_counter = 0
    cal_sync_counter = 0
    google_sync_counter = 0
    import os
    is_dev = os.getenv("ENVIRONMENT", "development").lower() in ("development", "dev", "")
    google_sync_every = 1 if is_dev else 6  # every 60s in dev, every ~5 min in prod
    # Defer the first heavy cycle so the API is responsive right after startup.
    await asyncio.sleep(30)
    while not _scheduler_stop.is_set():
        try:
            if deadline_counter % 12 == 0:  # every ~60 min
                await check_deadline_reminders()
                db = None
                try:
                    from ..core.database import get_database as _gd
                    db = _gd()
                except Exception:
                    pass
                if db is not None:
                    await check_goal_deadlines(db)
                hour = datetime.utcnow().hour
                if hour == 8:
                    await send_digests()
                    await send_morning_journal_prompts()
                if hour == 9:
                    await send_auto_reports()
                    await send_weekly_idea_digest()
                    await record_performance_snapshots()
                    await generate_weekly_owner_briefings()
                if hour == 3:
                    await aggregate_cross_company_patterns()
                await check_owner_check_ins()

            await sync_zoho_tasks()
            if google_sync_counter % google_sync_every == 0:
                await sync_google_tasks()
                await sync_pending_google_tasks()
                google_sync_counter = 0

            if cal_sync_counter % 3 == 0:  # every ~15 min (stub until G3)
                await sync_zoho_calendar()
                await sync_google_calendar()

            deadline_counter += 1
            google_sync_counter += 1
            cal_sync_counter += 1
        except Exception as e:
            logger.error(f"Scheduler cycle error: {e}")
        await asyncio.sleep(CHECK_INTERVAL)

