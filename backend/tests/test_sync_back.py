"""Sync-back tests: a task assigned by YesBoss to Google Tasks / Zoho and
later marked completed EXTERNALLY there should update the YesBoss task to
completed.

Exercises sync_google_tasks() / sync_zoho_tasks() against an in-memory fake DB
and fake external clients — no network, no live Google/Zoho accounts.
"""

import asyncio
from types import SimpleNamespace

from app.core import scheduler
from app.core import database as _database
from app.core import google as _google
from app.core import zoho as _zoho
from app.core import notification_service as _notifications


class _FakeTaskColl:
    def __init__(self, items):
        self._items = items

    def find(self, query, *a, **k):
        out = []
        for t in self._items:
            ok = True
            for key, val in query.items():
                if isinstance(val, dict) and set(val) == {"$ne"}:
                    if t.get(key) is None:
                        ok = False
                        break
                elif t.get(key) != val:
                    ok = False
                    break
            if ok:
                out.append(dict(t))
        return out

    def find_one(self, query, *a, **k):
        for t in self._items:
            if all(t.get(k) == v for k, v in query.items()):
                return dict(t)
        return None

    def update_one(self, query, update, *a, **k):
        for t in self._items:
            if all(t.get(k) == v for k, v in query.items()):
                t.update(update["$set"])
                return SimpleNamespace(matched_count=1)
        return SimpleNamespace(matched_count=0)

    def insert_one(self, doc, *a, **k):
        self._items.append(dict(doc))
        return SimpleNamespace(inserted_id="x")


class _TokensColl:
    def __init__(self, tokens):
        self._tokens = tokens

    def find(self, query, *a, **k):
        return list(self._tokens)

    def update_one(self, query, update, *a, **k):
        for t in self._tokens:
            if t.get("user_id") == query.get("user_id"):
                t.update(update["$set"])
        return SimpleNamespace(matched_count=1)


class _FakeDB:
    def __init__(self, tasks, tokens_key, tokens):
        self.tasks = _FakeTaskColl(tasks)
        setattr(self, tokens_key, _TokensColl(tokens))
        self.organizations = None


def _make_task(status="pending", **extra):
    t = {
        "_id": "t1",
        "title": "task",
        "description": "",
        "status": status,
        "priority": "medium",
        "assignee_id": ["user-1"],
        "assignee_email": "user-1@x.com",
        "organization_id": "org-1",
        "due_date": None,
        "escalation_level": 0,
        "owner_escalated": False,
        "owner_escalated_at": None,
        "reviewers": [],
        "dependencies": [],
    }
    t.update(extra)
    return t


def _noop_notification(**kwargs):
    return None


# --------------------------------------------------------------------------- #
# Google Tasks sync-back
# --------------------------------------------------------------------------- #


class _FakeGoogleOAuth:
    async def get_valid_token(self, user_id):
        return "fake-token"


def _patch_google(monkeypatch, db, external):
    class _Client:
        def __init__(self, db):
            pass

        async def ensure_list(self, token):
            return "list-1"

        async def list_tasks(self, token, list_id, show_completed=True):
            return external

        async def list_all_task_lists(self, token):
            return [{"id": "list-1", "title": "YesBoss"}]

        async def list_tasks_in_list(self, token, list_id, show_completed=True):
            return external

        @staticmethod
        def map_google_status(google_status):
            return "completed" if google_status == "completed" else "pending"

    monkeypatch.setattr(_database, "get_database", lambda: db)
    monkeypatch.setattr(_google, "GoogleOAuth", lambda db: _FakeGoogleOAuth())
    monkeypatch.setattr(_google, "GoogleTasks", _Client)


def test_google_task_completed_externally_updates_yesboss(monkeypatch):
    db = _FakeDB(
        [_make_task(status="pending", google_task_id="g1")],
        "google_tokens",
        [{"user_id": "user-1", "org_id": "org-1", "scope": "tasks"}],
    )
    external = [{"id": "g1", "title": "task", "status": "completed"}]
    _patch_google(monkeypatch, db, external)

    asyncio.run(scheduler.sync_google_tasks())

    assert db.tasks._items[0]["status"] == "completed"


def test_google_task_still_pending_no_status_change(monkeypatch):
    db = _FakeDB(
        [_make_task(status="pending", google_task_id="g1")],
        "google_tokens",
        [{"user_id": "user-1", "org_id": "org-1", "scope": "tasks"}],
    )
    external = [{"id": "g1", "title": "task", "status": "needsAction"}]
    _patch_google(monkeypatch, db, external)

    asyncio.run(scheduler.sync_google_tasks())

    assert db.tasks._items[0]["status"] == "pending"


def test_google_completion_matches_per_assignee_map(monkeypatch):
    db = _FakeDB(
        [_make_task(status="pending", google_task_ids={"user-1@x.com": "g2"})],
        "google_tokens",
        [{"user_id": "user-1", "org_id": "org-1", "scope": "tasks"}],
    )
    external = [{"id": "g2", "title": "task", "status": "completed"}]
    _patch_google(monkeypatch, db, external)

    asyncio.run(scheduler.sync_google_tasks())

    assert db.tasks._items[0]["status"] == "completed"


# --------------------------------------------------------------------------- #
# Zoho sync-back
# --------------------------------------------------------------------------- #


class _FakeZohoOAuth:
    async def get_valid_token(self, user_id):
        return "fake-token"


class _FakeZohoMailTasks:
    def __init__(self, db):
        pass

    async def list_personal_tasks(self, user_token, since=None):
        return external_zoho_tasks

    @staticmethod
    def map_zoho_status(status):
        if status == "Completed":
            return "completed"
        if status == "In Progress":
            return "in_progress"
        return "pending"

    @staticmethod
    def parse_zoho_date(date_str):
        return date_str or None


external_zoho_tasks = []


def _patch_zoho(monkeypatch, db, external):
    global external_zoho_tasks
    external_zoho_tasks = external
    monkeypatch.setattr(_database, "get_database", lambda: db)
    monkeypatch.setattr(_zoho, "ZohoOAuth", lambda db: _FakeZohoOAuth())
    monkeypatch.setattr(_zoho, "ZohoMailTasks", _FakeZohoMailTasks)
    monkeypatch.setattr(_notifications, "create_and_deliver", _noop_notification)


def test_zoho_task_completed_externally_updates_yesboss(monkeypatch):
    db = _FakeDB(
        [_make_task(status="pending", zoho_personal_task_id="z1")],
        "zoho_tokens",
        [{"user_id": "user-1", "org_id": "org-1", "scope": "ZohoMail"}],
    )
    _patch_zoho(monkeypatch, db, [{"id": "z1", "title": "task", "status": "Completed"}])

    asyncio.run(scheduler.sync_zoho_tasks())

    assert db.tasks._items[0]["status"] == "completed"


def test_zoho_untracked_task_not_overwritten(monkeypatch):
    db = _FakeDB(
        [_make_task(status="in_progress")],  # no zoho_personal_task_id
        "zoho_tokens",
        [{"user_id": "user-1", "org_id": "org-1", "scope": "ZohoMail"}],
    )
    # External task NOT linked to any yesboss task (new external task -> insert), ensure no crash
    _patch_zoho(monkeypatch, db, [{"id": "z9", "title": "external-only", "status": "In Progress"}])

    asyncio.run(scheduler.sync_zoho_tasks())

    # the original task must remain untouched (still in_progress), and external-only created
    assert db.tasks._items[0]["status"] == "in_progress"
    created = [t for t in db.tasks._items if t.get("title") == "external-only"]
    assert len(created) == 1
    assert created[0]["status"] == "in_progress"