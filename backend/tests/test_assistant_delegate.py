"""Tests for the AI delegate (task/goal assignment) flow — single and multiple assignees.

Uses a fake MongoDB alongside the real FastAPI router so no real DB/AI/Zoho is touched.
"""

import asyncio
import re

import pytest
from bson import ObjectId

import app.api.assistant as assistant
from app.api.assistant import ChatContext, DelegateRequest, _build_delegate_preview
from app.main import app


class _InsertResult:
    def __init__(self, oid):
        self.inserted_id = oid


class _Cursor:
    def __init__(self, docs):
        self._docs = docs

    def limit(self, n):
        return self._docs

    def sort(self, *args, **kwargs):
        return self

    def __iter__(self):
        return iter(self._docs)


class _Coll:
    def __init__(self, docs):
        self._docs = list(docs)
        self.inserted = []

    def find_one(self, filt):
        org = filt.get("organization_id")
        for d in self._docs:
            if org and d.get("organization_id") != org:
                continue
            clauses = filt.get("$or")
            if clauses:
                matched = False
                for clause in clauses:
                    if "_id" in clause:
                        if clause["_id"] == d.get("_id"):
                            matched = True
                        continue
                    for field, pat in clause.items():
                        if isinstance(pat, dict) and "$regex" in pat:
                            if re.search(pat["$regex"], d.get(field, "") or "", re.IGNORECASE):
                                matched = True
                if matched:
                    return dict(d)
            else:
                if all(d.get(k) == v for k, v in filt.items()):
                    return dict(d)
        return None

    def find(self, filt):
        return _Cursor(
            [
                dict(d)
                for d in self._docs
                if not filt.get("organization_id") or d.get("organization_id") == filt["organization_id"]
            ]
        )

    def insert_one(self, doc):
        oid = ObjectId()
        out = dict(doc)
        out["_id"] = oid
        self.inserted.append(out)
        return _InsertResult(oid)


class _FakeDB:
    def __init__(self, employees=None, org_members=None):
        self.employees = _Coll(employees or [])
        self.org_chart_members = _Coll(org_members or [])
        self.goals = _Coll([])
        self.tasks = _Coll([])


ORG_ID = "org-1"

PRINCE = {
    "_id": ObjectId("000000000000000000000001"),
    "full_name": "Prince Pandey",
    "email": "prince@value-score.co.in",
    "role": "employee",
    "department": "Engineering",
    "organization_id": ORG_ID,
}
KRISHA = {
    "_id": ObjectId("000000000000000000000002"),
    "full_name": "Krisha Suchak",
    "email": "krisha@value-score.co.in",
    "role": "employee",
    "department": "Product",
    "organization_id": ORG_ID,
}


async def _no_subtasks(**kwargs):
    return []


@pytest.fixture
def fake_env(monkeypatch):
    db = _FakeDB(employees=[PRINCE, KRISHA])
    monkeypatch.setattr(assistant, "get_database", lambda: db)
    monkeypatch.setattr(
        "app.core.intelligence.generate_tasks_from_goal",
        _no_subtasks,
    )

    notifications = []

    class FakeManager:
        async def broadcast_to_organization(self, message, org_id):
            pass

        async def send_personal_message(self, message, email):
            notifications.append(("ws", message.get("type"), email))

    async def fake_notify(**kwargs):
        notifications.append(("notify", kwargs.get("type"), kwargs.get("email")))

    async def fake_sync(*args, **kwargs):
        return None

    monkeypatch.setattr(assistant, "ws_manager", FakeManager())
    monkeypatch.setattr(assistant, "create_notification", fake_notify)
    monkeypatch.setattr("app.api.tasks.sync_task_to_provider", fake_sync)
    return db, notifications


def _delegate_body(**overrides):
    body = {
        "title": "Integrate Microsoft Teams in YesBoss",
        "description": "Integrate Microsoft Teams into the YesBoss platform",
        "assignee_name": "Prince Pandey, Krisha Suchak",
        "priority": "medium",
        "item_type": "task",
        "department": "Engineering",
        "context": {"user_email": "owner@value-score.co.in", "organization_id": ORG_ID},
    }
    body.update(overrides)
    return body


# ---------------------------------------------------------------------------
# HTTP: single assignee (the case that already worked)
# ---------------------------------------------------------------------------


def test_delegate_single_assignee_via_http(fake_env):
    db, _ = fake_env
    body = _delegate_body(assignee_name="Prince")

    resp = _client().post("/api/v1/assistant/delegate", json=body)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["success"] is True
    task = data["task"]
    assert task["assignee_name"] == [PRINCE["full_name"]]
    assert task["assignee_id"] == [str(PRINCE["_id"])]
    assert task["assignee_email"] == [PRINCE["email"]]
    assert len(db.tasks.inserted) == 1


# ---------------------------------------------------------------------------
# HTTP: multiple assignees — the exact failing case from the user
# ---------------------------------------------------------------------------


def test_delegate_multi_assignee_via_http(fake_env):
    db, _ = fake_env

    resp = _client().post(
        "/api/v1/assistant/delegate",
        json=_delegate_body(assignee_name="Prince Pandey, Krisha Suchak"),
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["success"] is True
    task = data["task"]
    assert sorted(task["assignee_name"]) == [KRISHA["full_name"], PRINCE["full_name"]]
    assert sorted(task["assignee_email"]) == [KRISHA["email"], PRINCE["email"]]
    assert len(task["assignee_id"]) == 2
    # Both ids are in the org record set
    org_ids = {str(PRINCE["_id"]), str(KRISHA["_id"])}
    assert set(task["assignee_id"]) == org_ids
    # The stored document matches what we return
    assert len(db.tasks.inserted) == 1
    assert sorted(db.tasks.inserted[0]["assignee_name"]) == [KRISHA["full_name"], PRINCE["full_name"]]


def test_delegate_multi_assignee_and_separator_via_http(fake_env):
    # " and " separator + first names only (user typed "Prince,krisha")
    resp = _client().post(
        "/api/v1/assistant/delegate",
        json=_delegate_body(assignee_name="Prince and Krisha"),
    )
    assert resp.status_code == 200, resp.text
    task = resp.json()["task"]
    assert sorted(task["assignee_name"]) == [KRISHA["full_name"], PRINCE["full_name"]]


def test_delegate_multi_assignee_list_via_http(fake_env):
    # LLM array-form output
    resp = _client().post(
        "/api/v1/assistant/delegate",
        json=_delegate_body(assignee_name=["Prince Pandey", "Krisha Suchak"]),
    )
    assert resp.status_code == 200, resp.text
    task = resp.json()["task"]
    assert sorted(task["assignee_name"]) == [KRISHA["full_name"], PRINCE["full_name"]]


def test_delegate_goal_gets_multi_assignees_via_http(fake_env):
    resp = _client().post(
        "/api/v1/assistant/delegate",
        json=_delegate_body(assignee_name="Prince Pandey, Krisha Suchak", item_type="both"),
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    goal = data["goal"]
    assert sorted(goal["assignee_name"]) == [KRISHA["full_name"], PRINCE["full_name"]]
    assert sorted(data["task"]["assignee_name"]) == [KRISHA["full_name"], PRINCE["full_name"]]
    assert goal["assignee_id"] == data["task"]["assignee_id"]


def test_delegate_unresolved_person_reports_name(fake_env):
    body = _delegate_body(assignee_name="Prince Pandey, Nobody Here")
    resp = _client().post("/api/v1/assistant/delegate", json=body)
    assert resp.status_code == 404
    assert "Nobody Here" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# Preview (smart_ask delegate path) — no creation
# ---------------------------------------------------------------------------


def test_build_delegate_preview_multi(fake_env):
    db, _ = fake_env
    parsed = {
        "type": "delegate",
        "assignee_name": "Prince Pandey, Krisha Suchak",
        "title": "Integrate Microsoft Teams in YesBoss",
        "priority": "medium",
        "item_type": "task",
    }
    delegate_params, sub_tasks, error = asyncio.run(_build_delegate_preview(parsed, db, ORG_ID))
    assert error is None
    assert len(delegate_params["assignees"]) == 2
    assert delegate_params["assignee_name"] == "Prince Pandey, Krisha Suchak"
    assert set(delegate_params["assignee_id"]) == {str(PRINCE["_id"]), str(KRISHA["_id"])}
    assert sorted(a["name"] for a in delegate_params["assignees"]) == [
        KRISHA["full_name"],
        PRINCE["full_name"],
    ]
    assert len(sub_tasks) == 0


def test_build_delegate_preview_array_form(fake_env):
    db, _ = fake_env
    parsed = {
        "type": "delegate",
        "assignee_name": ["Prince Pandey", "Krisha Suchak"],
        "title": "Teams integration",
        "item_type": "task",
    }
    delegate_params, _, error = asyncio.run(_build_delegate_preview(parsed, db, ORG_ID))
    assert error is None
    assert len(delegate_params["assignees"]) == 2


# ---------------------------------------------------------------------------
# Notifications / WS pushes per assignee (background tasks)
# ---------------------------------------------------------------------------


def test_delegate_notifications_fire_per_assignee(fake_env):
    db, notifications = fake_env
    request = DelegateRequest(
        title="Integrate Microsoft Teams in YesBoss",
        description="Integrate Microsoft Teams into the YesBoss platform",
        assignee_name="Prince Pandey, Krisha Suchak",
        priority="medium",
        item_type="task",
        department="Engineering",
        context=ChatContext(user_email="owner@value-score.co.in", organization_id=ORG_ID),
    )

    async def run():
        await assistant.delegate_task(request)
        # Flush the background create_task coroutines deterministically
        current = asyncio.current_task()
        pending = [t for t in asyncio.all_tasks() if t is not current]
        if pending:
            await asyncio.gather(*pending)

    asyncio.run(run())

    notify = [n for n in notifications if n[0] == "notify"]
    ws = [n for n in notifications if n[0] == "ws"]
    # One task_assigned notification + one ws task_assigned per assignee
    assigned_emails = {n[2] for n in notify if n[1] == "task_assigned"}
    assert assigned_emails == {PRINCE["email"], KRISHA["email"]}
    assert {n[2] for n in ws} == {PRINCE["email"], KRISHA["email"]}
    # Goal branch not created here (item_type=task), so no goal_assigned notifications
    assert "goal_assigned" not in {n[1] for n in notify}


def _client():
    from fastapi.testclient import TestClient

    return TestClient(app)
