"""Cross-user scoping tests for the AI business-analytics assistant.

These exercises verify that:
  1. session insights are scoped to the owning user (not shared org-wide), and
  2. the org snapshot (business analytics) can be gathered without any LLM call.

They run entirely against an in-memory fake DB — no network, no AI provider, no
hardcoded provider mock.
"""

import asyncio
from types import SimpleNamespace

from app.api import assistant
from app.core import file_processor


class _FakeQuery:
    def __init__(self, docs):
        self._docs = docs

    def sort(self, key, direction):
        self._docs.sort(
            key=lambda d: (d.get(key) is None, d.get(key)),
            reverse=(direction == -1),
        )
        return self

    def limit(self, n):
        self._docs = self._docs[:n]
        return self

    def __iter__(self):
        return iter(self._docs)


class _FakeCollection:
    def __init__(self, docs):
        self._docs = docs

    def find(self, query, **kwargs):
        matched = []
        for d in self._docs:
            if all(d.get(k) == v for k, v in query.items()):
                matched.append(dict(d))
        return _FakeQuery(matched)

    def insert_one(self, doc, **kwargs):
        self._docs.append(dict(doc))
        return SimpleNamespace(inserted_id="fake-id")

    def update_many(self, query, update):
        count = 0
        for d in self._docs:
            if all(d.get(k) == v for k, v in query.items()):
                d.update(update["$set"])
                count += 1
        return SimpleNamespace(matched_count=count)


class _FakeDB:
    def __init__(self, insights=None):
        self.session_insights = _FakeCollection(list(insights or []))
        self.organizations = _FakeCollection([])
        self.goals = _FakeCollection([])
        self.tasks = _FakeCollection([])
        self.employees = _FakeCollection([])
        self.team_updates = _FakeCollection([])


def _insight(user_id=None, user_email=None, summary="summary"):
    from datetime import datetime

    doc = {
        "organization_id": "org-1",
        "status": "open",
        "summary": summary,
        "created_at": datetime.utcnow(),
    }
    if user_id is not None:
        doc["user_id"] = user_id
    if user_email is not None:
        doc["user_email"] = user_email
    return doc


def test_snapshot_insights_scoped_by_user_id(monkeypatch):
    db = _FakeDB(
        insights=[
            _insight(user_id="user-a", summary="A's private insight"),
            _insight(user_id="user-b", summary="B's private insight"),
        ]
    )
    monkeypatch.setattr(file_processor, "get_org_document_context", lambda *a, **k: None)
    monkeypatch.setattr(file_processor, "search_documents", lambda *a, **k: None)

    snap = asyncio.run(
        assistant._gather_org_snapshot(db, "org-1", user_id="user-a", user_email="a@x.com")
    )

    summaries = [i["summary"] for i in snap["recent_insights"]]
    assert "A's private insight" in summaries
    assert "B's private insight" not in summaries


def test_snapshot_insights_scoped_by_email_when_no_uid(monkeypatch):
    db = _FakeDB(
        insights=[
            _insight(user_email="a@x.com", summary="A insight"),
            _insight(user_email="b@x.com", summary="B insight"),
        ]
    )
    monkeypatch.setattr(file_processor, "get_org_document_context", lambda *a, **k: None)
    monkeypatch.setattr(file_processor, "search_documents", lambda *a, **k: None)

    snap = asyncio.run(
        assistant._gather_org_snapshot(db, "org-1", user_id=None, user_email="a@x.com")
    )

    summaries = [i["summary"] for i in snap["recent_insights"]]
    assert "A insight" in summaries
    assert "B insight" not in summaries


def test_snapshot_no_identity_returns_no_insights(monkeypatch):
    db = _FakeDB(
        insights=[
            _insight(user_id="user-a", summary="A's private insight"),
        ]
    )
    monkeypatch.setattr(file_processor, "get_org_document_context", lambda *a, **k: None)
    monkeypatch.setattr(file_processor, "search_documents", lambda *a, **k: None)

    snap = asyncio.run(assistant._gather_org_snapshot(db, "org-1", user_id=None, user_email=None))

    assert snap["recent_insights"] == []


def test_store_session_insight_records_owner():
    db = _FakeDB()
    asyncio.run(
        assistant._store_session_insight(
            db,
            "org-1",
            "sess-1",
            "Here is a really long AI answer that exceeds the minimum length",
            user_id="user-a",
            user_email="a@x.com",
        )
    )

    stored = db.session_insights._docs[0]
    assert stored["user_id"] == "user-a"
    assert stored["user_email"] == "a@x.com"


def test_store_session_insight_defaults_no_owner():
    db = _FakeDB()
    asyncio.run(
        assistant._store_session_insight(
            db, "org-1", "sess-1", "Here is a really long AI answer that exceeds the minimum length"
        )
    )

    stored = db.session_insights._docs[0]
    assert stored.get("user_id") is None
    assert stored.get("user_email") is None
