import asyncio
import logging
from datetime import datetime, timedelta

logger = logging.getLogger("yesboss.scheduler")

CHECK_INTERVAL = 300  # 5 min base — Zoho syncs use this; other jobs use counters


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
            from ..core.zoho.taz import send_task_reminder as taz_remind
            asyncio.create_task(taz_remind(
                task_title=task.get("title", ""), due_date=str(task.get("due_date", ""))[:10],
                assignee_email=assignee_id, task_id=str(task.get("_id", "")), reminder_type="overdue",
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
                from ..core.zoho.taz import send_task_reminder as taz_remind
                asyncio.create_task(taz_remind(
                    task_title=task.get("title", ""), due_date=str(task.get("due_date", ""))[:10],
                    assignee_email=task.get("assignee_id") or task.get("assignee_email", ""),
                    task_id=str(task.get("_id", "")), reminder_type="overdue",
                ))
                db.tasks.update_one(
                    {"_id": task["_id"]},
                    {"$set": {"escalation_level": 3, "owner_escalated_at": now}},
                )

        await check_mom_reminders(db)
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


async def send_auto_reports():
    try:
        from ..core.database import get_database
        from ..core.report_generator import generate_employee_report, generate_org_health
        from ..core.notification_service import create_and_deliver

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
                    members = list(db.org_chart_members.find({"organization_id": org_id}))
                    for m in members:
                        email = m.get("email", "")
                        if not email:
                            continue
                        report = await generate_employee_report(db, org_id, email, "weekly")
                        await create_and_deliver(
                            user_id=email,
                            org_id=org_id,
                            type="report_weekly",
                            title="Weekly Performance Report",
                            message=f"Your weekly report is ready — {report['metrics']['completion_rate']}% completion rate.",
                            link="/dashboard/reports",
                            email=email,
                        )
                    logger.info(f"Weekly reports sent for org {org_id} ({len(members)} employees)")

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
        from ..core.database import get_database
        from ..core.zoho import ZohoMailTasks, ZohoOAuth
        from ..api.tasks import sync_task_to_zoho
        from datetime import datetime

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
        from ..core.database import get_database
        from ..core.zoho import ZohoCalendar, ZohoOAuth
        from datetime import datetime, timedelta

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


async def check_owner_check_ins():
    try:
        from ..core.database import get_database
        from ..core.check_in_service import check_org_due_for_check_in, generate_check_in, send_check_in_notification, store_check_in

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
            for owner_id in owner_ids:
                if not owner_id:
                    continue
                check_in_data = await generate_check_in(db, org_id, owner_id)
                if not check_in_data.get("should_send"):
                    continue
                await store_check_in(db, check_in_data)
                await send_check_in_notification(db, check_in_data)
                checked += 1

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


async def scheduler_loop():
    logger.info("Scheduler started")
    deadline_counter = 0
    cal_sync_counter = 0
    while True:
        try:
            if deadline_counter % 12 == 0:  # every ~60 min
                await check_deadline_reminders()
                hour = datetime.utcnow().hour
                if hour == 8:
                    await send_digests()
                if hour == 9:
                    await send_auto_reports()
                if hour == 3:
                    await aggregate_cross_company_patterns()
                await check_owner_check_ins()

            await sync_zoho_tasks()

            if cal_sync_counter % 3 == 0:  # every ~15 min (stub until G3)
                await sync_zoho_calendar()

            deadline_counter += 1
            cal_sync_counter += 1
        except Exception as e:
            logger.error(f"Scheduler cycle error: {e}")
        await asyncio.sleep(CHECK_INTERVAL)
