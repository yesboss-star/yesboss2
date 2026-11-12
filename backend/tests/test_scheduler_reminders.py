"""Deadline / meeting / goal reminders and notification delivery (offline, in-memory DB)."""
import asyncio
import json
from datetime import UTC, datetime, timedelta, timezone

import app.core.notification_service as ns
import app.core.scheduler as sched
from app.api.websocket import manager as ws_manager
from app.utils.dates import normalize_due_date, parse_meeting_dt


def iso(dt):
    return dt.replace(microsecond=0).isoformat()


def notifs(db, **q):
    return list(db.notifications.find(q))


async def settle():
    await asyncio.sleep(0.3)  # let create_task / to_thread fan-outs finish


def add_task(o, title, due, **extra):
    doc = {"title": title, "status": "pending", "organization_id": o.org, "assignee_email": o.emp,
           "assignee_id": [o.emp], "due_date": due, "escalation_level": 0}
    doc.update(extra)
    return o.db.tasks.insert_one(doc).inserted_id


# ------------------------------------------------------------------ normalisation / parsing
def test_normalize_due_date_shapes():
    assert normalize_due_date("2026-10-31") == "2026-10-31T23:59:59"
    assert normalize_due_date("2026-10-31T00:00:00") == "2026-10-31T23:59:59"
    assert normalize_due_date("2026-10-31T00:00:00.000Z") == "2026-10-31T23:59:59"
    assert normalize_due_date("2026-10-31 00:00:00") == "2026-10-31T23:59:59"
    assert normalize_due_date("31/10/2026") == "2026-10-31T23:59:59"
    assert normalize_due_date("1-2-2026") == "2026-02-01T23:59:59"
    assert normalize_due_date("2026-10-31T14:30:00") == "2026-10-31T14:30:00"  # real time kept
    assert normalize_due_date("") == "" and normalize_due_date(None) is None


def test_parse_meeting_dt_shapes():
    assert parse_meeting_dt("2026-10-31T10:00:00+05:30") == datetime(2026, 10, 31, 4, 30, tzinfo=UTC)
    assert parse_meeting_dt("2026-10-31T10:00:00Z") == datetime(2026, 10, 31, 10, 0, tzinfo=UTC)
    assert parse_meeting_dt("20261031T100000+0530") == datetime(2026, 10, 31, 4, 30, tzinfo=UTC)
    assert parse_meeting_dt("2026-10-31T10:00:00") == datetime(2026, 10, 31, 10, 0, tzinfo=UTC)
    assert parse_meeting_dt("nonsense") is None and parse_meeting_dt("") is None


# ------------------------------------------------------------------ delivery channels
async def test_assignment_notification_and_email(offline_db):
    o = offline_db
    await ns.create_and_deliver(o.emp, o.org, "task_assigned", "New task", "Do it", "/tasks/1", email=o.emp)
    await settle()
    assert len(notifs(o.db, type="task_assigned")) == 1
    assert any(o.emp in m["to"] for m in o.mail)


async def test_email_respects_user_preference_off(offline_db):
    o = offline_db
    o.db.notification_preferences.insert_one({"user_id": o.emp, "organization_id": o.org, "email": {"task_assigned": False}})
    await ns.create_and_deliver(o.emp, o.org, "task_assigned", "New task", "Do it", "/tasks/1", email=o.emp)
    await settle()
    assert not o.mail


async def test_websocket_notification_is_json_serializable(offline_db):
    o = offline_db
    received, errors = [], []

    class FakeWS:
        async def send_json(self, data):
            try:
                received.append(json.dumps(data, allow_nan=False))  # what starlette does
            except TypeError as e:
                errors.append(str(e))
                raise

    ws_manager.user_connections["emp-uid"] = {FakeWS()}
    await ns.create_and_deliver(o.emp, o.org, "task_assigned", "New task", "Do it", "/tasks/1", email=o.emp)
    await settle()
    assert received and not errors, errors
    assert isinstance(json.loads(received[0])["data"]["created_at"], str)


# ------------------------------------------------------------------ deadline reminders
async def test_due_tomorrow_reminder_sent_once(offline_db):
    o = offline_db
    add_task(o, "Due tomorrow", iso(datetime.utcnow() + timedelta(hours=12)))
    await sched.check_deadline_reminders()
    await sched.check_deadline_reminders()
    await settle()
    assert len(notifs(o.db, title="Task Due Tomorrow")) == 1


async def test_overdue_notification_fires_for_iso_due_date(offline_db):
    o = offline_db
    add_task(o, "Late", iso(datetime.utcnow() - timedelta(hours=5)))
    await sched.check_deadline_reminders()
    await settle()
    assert len(notifs(o.db, title="Task Overdue")) == 1


async def test_date_only_task_is_not_overdue_on_its_due_day(offline_db):
    o = offline_db
    today = datetime.utcnow().strftime("%Y-%m-%d")
    add_task(o, "Due today", normalize_due_date(today))
    await sched.check_deadline_reminders()
    await settle()
    assert not notifs(o.db, title="Task Overdue")


async def test_imported_dd_mm_yyyy_task_becomes_overdue(offline_db):
    o = offline_db
    past = (datetime.utcnow() - timedelta(days=10)).strftime("%d/%m/%Y")
    add_task(o, "Imported", normalize_due_date(past))
    await sched.check_deadline_reminders()
    await settle()
    assert notifs(o.db, title="Task Overdue")


async def test_escalation_to_owner_after_3_days(offline_db):
    o = offline_db
    add_task(o, "3d late", iso(datetime.utcnow() - timedelta(days=4)))
    await sched.check_deadline_reminders()
    await settle()
    esc = notifs(o.db, type="escalation_owner")
    assert len(esc) == 1 and esc[0]["user_id"] == o.owner_uid
    assert any(o.owner_email in m["to"] for m in o.mail)


async def test_old_overdue_task_escalated_once(offline_db):
    o = offline_db
    add_task(o, "10d late", iso(datetime.utcnow() - timedelta(days=10)))
    await sched.check_deadline_reminders()
    await settle()
    assert len(notifs(o.db, type="escalation_owner")) == 1


async def test_escalation_for_task_without_escalation_level(offline_db):
    o = offline_db
    tid = add_task(o, "legacy", iso(datetime.utcnow() - timedelta(days=5)))
    o.db.tasks.update_one({"_id": tid}, {"$unset": {"escalation_level": ""}})
    await sched.check_deadline_reminders()
    await settle()
    assert notifs(o.db, type="escalation_owner")


async def test_escalation_for_due_date_with_offset(offline_db):
    o = offline_db
    due = (datetime.now(timezone(timedelta(hours=5, minutes=30))) - timedelta(days=5)).replace(microsecond=0).isoformat()
    add_task(o, "IST offset", due)
    await sched.check_deadline_reminders()
    await settle()
    assert notifs(o.db, type="escalation_owner")


async def test_completed_task_never_reminded(offline_db):
    o = offline_db
    add_task(o, "done", iso(datetime.utcnow() - timedelta(days=5)), status="completed")
    await sched.check_deadline_reminders()
    await settle()
    assert not notifs(o.db, title="Task Overdue") and not notifs(o.db, type="escalation_owner")


# ------------------------------------------------------------------ goals
async def test_goal_due_tomorrow_reminder_sent_once(offline_db):
    o = offline_db
    o.db.goals.insert_one({"title": "Goal X", "status": "active", "organization_id": o.org,
                           "assignee_email": o.emp, "created_by": o.owner_uid,
                           "due_date": iso(datetime.utcnow() + timedelta(hours=10))})
    await sched.check_goal_deadlines(o.db)
    first = o.db.notifications.count_documents({})
    await sched.check_goal_deadlines(o.db)
    await settle()
    assert first > 0 and o.db.notifications.count_documents({}) == first


# ------------------------------------------------------------------ meetings
def add_meeting(o, start, end=None, **extra):
    doc = {"title": "Sync", "organization_id": o.org, "attendees": [o.emp], "status": "scheduled",
           "start_dt": start, "end_dt": end or start, "mom_uploaded": False, "remind_before_minutes": 30}
    doc.update(extra)
    return o.db.meetings.insert_one(doc).inserted_id


async def test_meeting_reminder_for_aware_start(offline_db):
    o = offline_db
    mid = add_meeting(o, (datetime.now(UTC) + timedelta(minutes=20)).replace(microsecond=0).isoformat())
    await sched.check_meeting_reminders()
    await settle()
    assert notifs(o.db, type="meeting_reminder")
    assert o.db.meetings.find_one({"_id": mid})["reminder_sent"] is True


async def test_meeting_reminder_for_naive_start(offline_db):
    o = offline_db
    add_meeting(o, iso(datetime.utcnow() + timedelta(minutes=20)))
    await sched.check_meeting_reminders()
    await settle()
    assert notifs(o.db, type="meeting_reminder")


async def test_meeting_reminder_for_zoho_compact_start(offline_db):
    o = offline_db
    add_meeting(o, (datetime.now(UTC) + timedelta(minutes=20)).strftime("%Y%m%dT%H%M%S") + "+0000")
    await sched.check_meeting_reminders()
    await settle()
    assert notifs(o.db, type="meeting_reminder")


async def test_meeting_reminder_sent_once_and_not_too_early(offline_db):
    o = offline_db
    add_meeting(o, iso(datetime.utcnow() + timedelta(minutes=20)))
    add_meeting(o, iso(datetime.utcnow() + timedelta(hours=5)), title="Far away")
    await sched.check_meeting_reminders()
    await sched.check_meeting_reminders()
    await settle()
    msgs = notifs(o.db, type="meeting_reminder")
    assert len(msgs) == 1 and "Far away" not in msgs[0]["title"]


async def test_mom_reminder_for_ended_meeting(offline_db):
    o = offline_db
    end = iso(datetime.utcnow() - timedelta(minutes=10))
    mid = add_meeting(o, end, end)
    await sched.check_mom_reminders(o.db)
    await sched.check_mom_reminders(o.db)
    await settle()
    assert len(notifs(o.db, type="mom_reminder")) == 1
    assert o.db.meetings.find_one({"_id": mid})["mom_reminder_sent"] is True


async def test_pre_meeting_reminder_does_not_suppress_mom_reminder(offline_db):
    o = offline_db
    start = iso(datetime.utcnow() - timedelta(hours=1))
    end = iso(datetime.utcnow() - timedelta(minutes=5))
    add_meeting(o, start, end, reminder_sent=True)  # pre-meeting reminder already went out
    await sched.check_mom_reminders(o.db)
    await settle()
    assert notifs(o.db, type="mom_reminder")


async def test_old_ended_meeting_gets_no_mom_reminder_and_is_retired(offline_db):
    o = offline_db
    end = iso(datetime.utcnow() - timedelta(hours=5))
    mid = add_meeting(o, end, end)
    await sched.check_mom_reminders(o.db)
    await settle()
    assert not notifs(o.db, type="mom_reminder")
    assert o.db.meetings.find_one({"_id": mid})["mom_reminder_sent"] is True  # no endless re-scan
