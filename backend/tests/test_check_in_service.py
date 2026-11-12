"""Weekly owner check-in: due-ness, overdue counts and goal health (offline)."""
from datetime import datetime, timedelta

import app.core.check_in_service as cis


def iso(dt):
    return dt.replace(microsecond=0).isoformat()


def add_goal(o, **extra):
    doc = {"title": "G", "status": "active", "organization_id": o.org, "created_by": o.owner_uid}
    doc.update(extra)
    return o.db.goals.insert_one(doc).inserted_id


def add_task(o, due, status="pending", **extra):
    doc = {"title": "T", "status": status, "organization_id": o.org, "assignee_email": o.emp, "due_date": due}
    doc.update(extra)
    return o.db.tasks.insert_one(doc).inserted_id


async def test_overdue_counts_only_genuinely_overdue_open_tasks(offline_db):
    o = offline_db
    add_goal(o)
    add_task(o, iso(datetime.utcnow() - timedelta(days=2)))                       # overdue
    add_task(o, iso(datetime.utcnow() + timedelta(days=2)))                       # not yet due
    add_task(o, iso(datetime.utcnow() - timedelta(days=9)), status="completed")   # done
    add_task(o, iso(datetime.utcnow() - timedelta(days=9)), status="approved")    # done
    add_task(o, None)                                                             # no deadline
    add_task(o, "")                                                               # blank deadline
    data = await cis.generate_check_in(o.db, o.org, o.owner_uid)
    assert data["should_send"] is True
    assert data["task_health"]["overdue"] == 1
    assert data["task_health"]["total"] == 6
    assert data["behind_assignees"] == [o.emp]


async def test_assignee_without_overdue_work_is_not_listed_as_behind(offline_db):
    o = offline_db
    add_goal(o)
    add_task(o, iso(datetime.utcnow() + timedelta(days=5)))
    data = await cis.generate_check_in(o.db, o.org, o.owner_uid)
    assert data["task_health"]["overdue"] == 0 and data["behind_assignees"] == []


async def test_goal_with_a_past_utc_deadline_counts_as_behind(offline_db):
    o = offline_db
    add_goal(o, due_date="2020-01-01T00:00:00Z", updated_at=datetime.utcnow())
    data = await cis.generate_check_in(o.db, o.org, o.owner_uid)
    assert data["behind_count"] == 1


async def test_timezone_aware_timestamps_do_not_crash_the_check_in(offline_db):
    o = offline_db
    old = iso(datetime.utcnow() - timedelta(days=20)) + "+00:00"
    add_goal(o, updated_at=old)
    data = await cis.generate_check_in(o.db, o.org, o.owner_uid)
    assert data["stale_count"] == 1


async def test_check_in_is_due_logic(offline_db):
    org = {"_id": "x", "check_in_frequency_days": 7}
    assert await cis.check_org_due_for_check_in(offline_db.db, dict(org)) is True              # never sent
    recent = datetime.utcnow() - timedelta(days=1)
    assert await cis.check_org_due_for_check_in(offline_db.db, dict(org, last_check_in=recent)) is False
    old = datetime.utcnow() - timedelta(days=9)
    assert await cis.check_org_due_for_check_in(offline_db.db, dict(org, last_check_in=old)) is True


async def test_check_in_due_logic_accepts_aware_strings(offline_db):
    org = {"_id": "x", "check_in_frequency_days": 7}
    recent = iso(datetime.utcnow() - timedelta(days=1)) + "+00:00"
    assert await cis.check_org_due_for_check_in(offline_db.db, dict(org, last_check_in=recent)) is False
    old = iso(datetime.utcnow() - timedelta(days=9)) + "Z"
    assert await cis.check_org_due_for_check_in(offline_db.db, dict(org, last_check_in=old)) is True


async def test_check_in_notification_reaches_the_owner(offline_db):
    import asyncio

    o = offline_db
    add_goal(o)
    add_task(o, iso(datetime.utcnow() - timedelta(days=2)))
    data = await cis.generate_check_in(o.db, o.org, o.owner_uid)
    await cis.send_check_in_notification(o.db, data)
    await asyncio.sleep(0.5)
    notes = list(o.db.notifications.find({"type": "check_in_reminder"}))
    assert len(notes) == 1 and notes[0]["user_id"] == o.owner_uid
    assert "1 overdue" in notes[0]["message"]
