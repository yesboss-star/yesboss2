"""Deleting a meeting from the history.

It used to remove only the app's record: the calendar event stayed, other people were never told, any member
could delete anyone's meeting, and the tasks made from an upload were left behind without a word.
Now a meeting that is still ahead is cancelled in the calendar (attendees told), tasks are kept and counted,
and only the person who made the meeting or an owner may delete it. All offline.
"""
import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from bson import ObjectId
from fastapi import HTTPException

import app.api.assistant as assistant
import app.api.meetings as meetings


def stamp(delta_days: int) -> str:
    """A start time in the format booked meetings store: 20261121T090000+0530."""
    ist = timezone(timedelta(hours=5, minutes=30))
    return (datetime.now(ist) + timedelta(days=delta_days)).strftime("%Y%m%dT%H%M%S%z")


def person(uid, email, claims=None):
    return SimpleNamespace(id=uid, uid=uid, email=email, custom_claims=claims or {})


@pytest.fixture
def world(offline_db, monkeypatch):
    """`world.cancelled` lists every calendar cancel that was requested; `world.removed` is what the calendar answers."""
    cancelled: list = []
    state = {"removed": True}

    async def fake_cancel(db, org_id, meta):
        cancelled.append(meta["meeting_id"])
        return {"title": "t", "meeting_id": meta["meeting_id"], "calendar_removed": state["removed"]}

    monkeypatch.setattr(assistant, "_cancel_meeting", fake_cancel)
    offline_db.cancelled = cancelled
    offline_db.state = state
    offline_db.owner = person(offline_db.owner_uid, offline_db.owner_email, {"role": "owner"})
    return offline_db


def add(world, **doc):
    base = {"organization_id": world.org, "title": "Sync", "created_at": datetime.utcnow()}
    return str(world.db.meetings.insert_one({**base, **doc}).inserted_id)


def delete(world, meeting_id, user=None):
    return asyncio.run(meetings.delete_meeting(meeting_id, organization_id=world.org, current_user=user or world.owner))


# ---------------------------------------------------------------- uploads: the tasks stay
def test_deleting_an_upload_keeps_its_tasks_and_says_how_many(world):
    ids = [world.db.tasks.insert_one({"organization_id": world.org, "title": f"T{i}"}).inserted_id for i in range(2)]
    mid = add(world, tasks_created=[str(i) for i in ids], task_count=2, created_by="emp-uid")
    out = delete(world, mid)
    assert out["deleted"] is True and out["tasks_kept"] == 2 and out["calendar_cancelled"] is False
    assert world.db.meetings.count_documents({}) == 0
    assert world.db.tasks.count_documents({}) == 2, "the tasks made from the upload must not be deleted"
    assert world.cancelled == []


# ---------------------------------------------------------------- booked meetings: the calendar is cancelled
def test_a_meeting_still_ahead_is_cancelled_in_the_calendar(world):
    mid = add(world, zoho_event_id="evt-1", attendees=[world.emp, world.mgr], start_dt=stamp(2), status="booked",
              created_by=world.owner_email)
    out = delete(world, mid)
    assert world.cancelled == [mid]
    assert out["calendar_cancelled"] is True and out["attendees_told"] == 2
    assert world.db.meetings.count_documents({}) == 0


def test_it_does_not_claim_a_cancel_the_calendar_did_not_confirm(world):
    world.state["removed"] = False
    mid = add(world, zoho_event_id="evt-1", attendees=[world.emp], start_dt=stamp(2), status="booked", created_by=world.owner_email)
    out = delete(world, mid)
    assert out["calendar_cancelled"] is False and out["attendees_told"] == 0


def test_a_meeting_that_already_happened_is_not_cancelled(world):
    mid = add(world, zoho_event_id="evt-1", attendees=[world.emp], start_dt=stamp(-3), status="booked", created_by=world.owner_email)
    out = delete(world, mid)
    assert world.cancelled == [] and out["calendar_cancelled"] is False and out["attendees_told"] == 0


def test_a_meeting_with_no_readable_start_is_not_cancelled(world):
    mid = add(world, zoho_event_id="evt-1", attendees=[world.emp], start_dt="not a date", status="booked", created_by=world.owner_email)
    delete(world, mid)
    assert world.cancelled == []


def test_an_already_cancelled_meeting_is_not_cancelled_twice(world):
    mid = add(world, zoho_event_id="evt-1", attendees=[world.emp], start_dt=stamp(2), status="cancelled", created_by=world.owner_email)
    delete(world, mid)
    assert world.cancelled == []


# ---------------------------------------------------------------- who may delete
def test_a_colleague_cannot_delete_someone_elses_meeting(world):
    mid = add(world, zoho_event_id="evt-1", attendees=[world.mgr], start_dt=stamp(2), created_by=world.owner_email)
    with pytest.raises(HTTPException) as err:
        delete(world, mid, user=person("emp-uid", world.emp))
    assert err.value.status_code == 403
    assert world.db.meetings.count_documents({}) == 1 and world.cancelled == []


def test_the_person_who_made_it_can_delete_it_by_email_or_by_id(world):
    by_email = add(world, created_by=world.emp)
    by_uid = add(world, created_by="emp-uid")
    delete(world, by_email, user=person("emp-uid", world.emp))
    delete(world, by_uid, user=person("emp-uid", world.emp))
    assert world.db.meetings.count_documents({}) == 0


def test_a_meeting_from_another_organization_is_not_found(world):
    other = str(world.db.meetings.insert_one({"organization_id": str(ObjectId()), "title": "x"}).inserted_id)
    with pytest.raises(HTTPException) as err:
        delete(world, other)
    assert err.value.status_code == 404


# ---------------------------------------------------------------- the cancel helper reports honestly
@pytest.mark.parametrize("answer", [True, False])
def test_cancel_meeting_reports_whether_the_calendar_confirmed(world, monkeypatch, answer):
    import app.core.providers as providers
    from app.core.zoho import ZohoCalendar

    async def token(db, who):
        return ("zoho", "tok")

    async def cal(t):
        return "cal-1"

    async def gone(t, c, e):
        return answer

    async def no_deliver(*a, **k):
        return None

    import app.core.notification_service as ns

    monkeypatch.undo()  # use the real _cancel_meeting, not the recorder
    monkeypatch.setattr(providers, "get_provider_token", token)
    monkeypatch.setattr(ZohoCalendar, "get_default_calendar_uid", staticmethod(cal))
    monkeypatch.setattr(ZohoCalendar, "delete_event", staticmethod(gone))
    monkeypatch.setattr(ns, "create_and_deliver", no_deliver)
    mid = add(world, zoho_event_id="evt-1", attendees=[world.emp], created_by=world.owner_email)
    out = asyncio.run(assistant._cancel_meeting(world.db, world.org, {"meeting_id": mid}))
    assert out["calendar_removed"] is answer
    assert world.db.meetings.find_one({"_id": ObjectId(mid)})["status"] == "cancelled"
