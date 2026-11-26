"""Journal-intelligence API + reminder job (offline, in-memory DB, LLM stubbed)."""
import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

import app.core.journal_intel as intel
from app.dependencies.auth import get_current_user
from app.main import app

P = "/api/v1/journal-intel"
ORG = "org-1"


class U:
    def __init__(self, uid, email):
        self.id = uid
        self.uid = uid
        self.email = email
        self.custom_claims = {}


A, B = U("uid-a", "a@test.local"), U("uid-b", "b@test.local")


@pytest.fixture
def api(offline_db, monkeypatch):
    who = {"u": A}
    app.dependency_overrides[get_current_user] = lambda: who["u"]

    async def no_llm(content, entry_type="journal"):
        return None  # LLM unavailable offline -> code must degrade gracefully

    async def no_index(entry):
        return False

    monkeypatch.setattr(intel, "analyze_content", no_llm)
    monkeypatch.setattr(intel, "index_entry", no_index)
    # the journal routes now check company membership, so the two test people really belong to the test company
    offline_db.db.organizations.insert_one({"_id": ORG, "name": "Org One", "owner_id": "uid-owner"})
    offline_db.db.users.insert_many([
        {"uid": A.uid, "email": A.email, "organization_id": ORG},
        {"uid": B.uid, "email": B.email, "organization_id": ORG},
    ])
    client = TestClient(app)
    client.as_user = lambda u: who.__setitem__("u", u)
    client.db = offline_db.db
    yield client
    app.dependency_overrides.clear()


def q(extra=""):
    return f"?organization_id={ORG}{extra}"


def test_requires_authentication(offline_db):
    app.dependency_overrides.clear()
    assert TestClient(app).get(f"{P}/checkins{q()}").status_code == 401


def test_checkin_validation_and_upsert(api):
    assert api.post(f"{P}/checkins{q()}", json={}).status_code == 400
    r = api.post(f"{P}/checkins{q()}", json={"mood": 4, "energy": 3, "reasons": ["bogus"]})
    assert r.status_code == 200 and r.json()["checkin"]["mood"] == 4
    assert api.post(f"{P}/checkins{q()}", json={"mood": 9}).status_code == 422
    assert len(api.get(f"{P}/checkins{q()}").json()["checkins"]) == 1


def test_users_cannot_see_or_touch_each_others_journal_data(api):
    rid = api.post(f"{P}/reminders{q()}", json={"text": "call X", "type": "after_days", "days": 2}).json()["reminder"]["_id"]
    did = api.post(f"{P}/decisions{q()}", json={"question": "Hire?"}).json()["decision"]["_id"]
    iid = api.post(f"{P}/ideas{q()}", json={"title": "Idea one", "note": "n"}).json()["idea"]["_id"]
    api.as_user(B)
    assert api.get(f"{P}/reminders{q()}").json()["reminders"] == []
    assert api.get(f"{P}/decisions{q()}").json()["decisions"] == []
    assert api.get(f"{P}/ideas{q()}").json()["ideas"] == []
    assert api.delete(f"{P}/reminders/{rid}{q()}").status_code == 404
    assert api.put(f"{P}/decisions/{did}{q()}", json={"question": "hijack"}).status_code == 404
    assert api.delete(f"{P}/ideas/{iid}{q()}").status_code == 404
    api.as_user(A)
    assert len(api.get(f"{P}/reminders{q()}").json()["reminders"]) == 1
    # another company's id is now refused outright (it used to come back as an empty list)
    assert api.get(f"{P}/reminders?organization_id=other-org").status_code == 403


def test_bad_ids_and_dates_do_not_500(api):
    assert api.post(f"{P}/reminders/not-an-oid/done{q()}").status_code == 404
    assert api.post(f"{P}/reminders{q()}", json={"text": "x", "type": "date", "due_at": "not-a-date"}).status_code == 400
    assert api.post(f"{P}/reminders{q()}", json={"text": " ", "type": "date", "due_at": "2030-01-01"}).status_code == 400
    assert api.post(f"{P}/decisions{q()}", json={"question": "q", "review_on": "garbage"}).status_code == 400


def test_idea_created_when_llm_is_down(api):
    r = api.post(f"{P}/ideas{q()}", json={"title": "Offline idea"})
    assert r.status_code == 200 and r.json()["idea"]


def test_changing_decision_review_date_replaces_reminder(api):
    d = api.post(f"{P}/decisions{q()}", json={"question": "Switch vendor?", "review_on": "2030-01-10"}).json()["decision"]
    assert api.db.journal_reminders.count_documents({"decision_id": d["_id"], "status": "active"}) == 1
    api.put(f"{P}/decisions/{d['_id']}{q()}", json={"question": "Switch vendor?", "review_on": "2030-02-10"})
    assert api.db.journal_reminders.count_documents({"decision_id": d["_id"], "status": "active"}) == 1


async def test_date_reminder_fires_once(api):
    api.post(f"{P}/reminders{q()}", json={"text": "ping me", "type": "date", "due_at": "2020-01-01"})
    n1 = await intel.check_journal_reminders(api.db)
    n2 = await intel.check_journal_reminders(api.db)
    await asyncio.sleep(0.3)
    assert (n1, n2) == (1, 0)
    assert api.db.notifications.count_documents({"type": "journal_reminder"}) == 1


async def test_future_reminder_does_not_fire(api):
    api.post(f"{P}/reminders{q()}", json={"text": "later", "type": "date", "due_at": "2099-01-01"})
    assert await intel.check_journal_reminders(api.db) == 0


def _after_meeting(api, end_dt):
    r = api.post(f"{P}/reminders{q()}", json={"text": "send notes", "type": "after_meeting", "match": "budget"})
    assert r.status_code == 200
    api.db.meetings.insert_one({"organization_id": ORG, "title": "Budget review", "status": "scheduled",
                                "attendees": ["a@test.local"], "created_by": "uid-a", "end_dt": end_dt, "start_dt": end_dt})


async def test_after_meeting_fires_for_zoho_compact_format(api):
    _after_meeting(api, (datetime.now(UTC) - timedelta(minutes=5)).strftime("%Y%m%dT%H%M%S") + "+0000")
    assert await intel.check_journal_reminders(api.db) == 1


async def test_after_meeting_fires_for_iso_format_from_google_and_assistant(api):
    _after_meeting(api, (datetime.now(UTC) - timedelta(minutes=5)).replace(microsecond=0).isoformat())
    assert await intel.check_journal_reminders(api.db) == 1


async def test_after_meeting_waits_until_the_meeting_has_ended(api):
    _after_meeting(api, (datetime.now(UTC) + timedelta(hours=1)).replace(microsecond=0).isoformat())
    assert await intel.check_journal_reminders(api.db) == 0


class _Cursor(list):
    def limit(self, n):
        return self


async def test_reminder_not_delivered_twice_when_two_workers_scan_the_same_row(api):
    api.post(f"{P}/reminders{q()}", json={"text": "once", "type": "date", "due_at": "2020-01-01"})
    stale = list(api.db.journal_reminders.find({"status": "active"}))  # both workers read this snapshot
    real_find = api.db.journal_reminders.find
    api.db.journal_reminders.find = lambda *a, **k: _Cursor(stale)
    try:
        await asyncio.gather(intel.check_journal_reminders(api.db), intel.check_journal_reminders(api.db))
    finally:
        api.db.journal_reminders.find = real_find
    await asyncio.sleep(0.3)
    assert api.db.notifications.count_documents({"type": "journal_reminder"}) == 1
