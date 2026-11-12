"""Zoho / Google task sync behaviour (offline; provider calls are stubbed)."""
import asyncio

import pytest

import app.api.tasks as tasks_api
import app.core.google as google_pkg
import app.core.providers as providers


class U:
    def __init__(self, uid, email):
        self.id = uid
        self.uid = uid
        self.email = email
        self.custom_claims = {}


def make_task(o, **extra):
    doc = {"title": "T", "status": "pending", "organization_id": o.org, "assignee_email": o.emp,
           "assignee_id": [o.emp], "created_by": o.owner_uid, "due_date": None}
    doc.update(extra)
    tid = o.db.tasks.insert_one(doc).inserted_id
    return o.db.tasks.find_one({"_id": tid})


def as_str_id(doc):
    doc = dict(doc)
    doc["_id"] = str(doc["_id"])
    return doc


class FakeGoogleTasks:
    created, updated = [], []

    def __init__(self, db=None):
        pass

    async def ensure_list(self, token):
        return "list-1"

    async def create_task(self, token, list_id, task_doc):
        FakeGoogleTasks.created.append(task_doc["title"])
        return "g-task-1"

    async def update_task(self, token, list_id, task_id, changes):
        FakeGoogleTasks.updated.append((task_id, changes))
        return True


@pytest.fixture
def google(monkeypatch):
    FakeGoogleTasks.created, FakeGoogleTasks.updated = [], []
    monkeypatch.setattr(google_pkg, "GoogleTasks", FakeGoogleTasks)

    async def _token(db, email, org_id=None, include_org_fallback=True):
        return "tok"

    monkeypatch.setattr(providers, "_resolve_google_token", _token)
    return FakeGoogleTasks


# ---------------------------------------------------------------- retry cap
async def test_missing_token_does_not_burn_the_retry_cap(offline_db):
    o = offline_db
    task = make_task(o)
    for _ in range(8):  # more than the cap of 5
        task = o.db.tasks.find_one({"_id": task["_id"]})
        await tasks_api.sync_task_to_google(o.db, as_str_id(task), o.org)
    final = o.db.tasks.find_one({"_id": task["_id"]})
    assert final["google_sync_status"] == "pending"
    assert "no connected Google token" in final["google_sync_error"]
    assert (final.get("google_sync_attempts") or 0) == 0, "token-less retries must not count as attempts"


async def test_late_connection_still_syncs_after_many_retries(offline_db, google):
    o = offline_db
    task = make_task(o, google_sync_status="pending", google_sync_attempts=0)
    result = await tasks_api.sync_task_to_google(o.db, as_str_id(task), o.org)
    assert result == "synced" and google.created == ["T"]


async def test_success_resets_attempt_counter(offline_db, google):
    o = offline_db
    task = make_task(o, google_sync_status="pending", google_sync_attempts=4)
    await tasks_api.sync_task_to_google(o.db, as_str_id(task), o.org)
    final = o.db.tasks.find_one({"_id": task["_id"]})
    assert final["google_sync_status"] == "synced" and final["google_sync_attempts"] == 0


async def test_edit_after_connecting_creates_the_missing_google_task(offline_db, google):
    o = offline_db
    old = make_task(o)  # never pushed (assignee had no token then)
    new = dict(old, title="T edited")
    result = await tasks_api.sync_task_to_google(o.db, as_str_id(new), o.org, old_data=as_str_id(old))
    assert result == "synced" and google.created == ["T edited"]


async def test_edit_updates_existing_google_task(offline_db, google):
    o = offline_db
    old = make_task(o, google_task_id="g-1", google_task_ids={o.emp: "g-1"}, google_task_list_id="list-1", status="pending")
    new = dict(old, status="completed")
    await tasks_api.sync_task_to_google(o.db, as_str_id(new), o.org, old_data=as_str_id(old))
    assert google.updated and google.updated[0][0] == "g-1" and google.updated[0][1]["status"] == "completed"


# ---------------------------------------------------------------- complete / approve push to providers
async def test_complete_task_schedules_provider_sync(offline_db, monkeypatch):
    """Call the handler directly so the background task runs on this test's loop."""
    o = offline_db
    task = make_task(o)
    calls = []

    async def fake_sync(db, task_doc, org_id, old_data=None):
        calls.append((task_doc["status"], (old_data or {}).get("status")))

    monkeypatch.setattr(tasks_api, "sync_task_to_provider", fake_sync)
    await tasks_api.complete_task(str(task["_id"]), current_user=U(o.owner_uid, o.owner_email))
    await asyncio.sleep(0.2)
    assert calls == [("completed", "pending")]


async def test_approve_task_schedules_provider_sync(offline_db, monkeypatch):
    o = offline_db
    task = make_task(o)
    calls = []

    async def fake_sync(db, task_doc, org_id, old_data=None):
        calls.append((task_doc["status"], (old_data or {}).get("status")))

    monkeypatch.setattr(tasks_api, "sync_task_to_provider", fake_sync)
    await tasks_api.approve_task(str(task["_id"]), current_user=U(o.owner_uid, o.owner_email))
    await asyncio.sleep(0.2)
    assert calls == [("approved", "pending")]
