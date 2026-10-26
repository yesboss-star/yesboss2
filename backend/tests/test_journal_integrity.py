"""Journal integrity: private entries, route order, and journal-mode privacy.

These tests cover the regressions the journal review found:
  * `/journal/mood-trends` must not be shadowed by `/{entry_id}`,
  * personal journal entries stay author-only (owners only see ideas),
  * the assistant's journal mode never loads org data, and
  * the journal page mirrors one conversation into one `journal_entries` doc.
"""

import asyncio
from types import SimpleNamespace

import app.agents.journal_agent as journal_agent
from app.api import assistant, journal


class _Collection:
    def __init__(self, docs=None):
        self.docs = list(docs or [])

    def find_one(self, query, *args, **kwargs):
        for doc in self.docs:
            if all(doc.get(k) == v for k, v in query.items()):
                return doc
        return None

    def insert_one(self, doc):
        self.docs.append(doc)
        return SimpleNamespace(inserted_id=f"id-{len(self.docs)}")

    def update_one(self, query, update):
        doc = self.find_one(query)
        if doc is None:
            return SimpleNamespace(matched_count=0)
        doc.update(update.get("$set", {}))
        return SimpleNamespace(matched_count=1)

    def count_documents(self, query):
        return sum(1 for doc in self.docs if all(doc.get(k) == v for k, v in query.items()))


class _DB:
    def __init__(self):
        self.journal_entries = _Collection()
        self.organizations = _Collection([{"_id": "org-1", "owner_id": "owner-1"}])
        self.users = _Collection([{"uid": "u1", "organization_id": "org-1"}])
        self.org_chart_members = _Collection()


def _user(uid, email=None):
    return SimpleNamespace(
        uid=uid,
        id=uid,
        email=email or f"{uid}@example.com",
        user_metadata={"organization_id": "org-1"},
    )


def test_mood_trends_is_registered_before_dynamic_entry_route():
    paths = [route.path for route in journal.router.routes]
    assert paths.index("/mood-trends") < paths.index("/{entry_id}")


def test_journal_entry_is_private_even_to_owner_but_ideas_stay_visible():
    db = _DB()
    entry = {"user_id": "u1", "org_id": "org-1", "type": "journal"}
    idea = {"user_id": "u1", "org_id": "org-1", "type": "idea"}

    assert asyncio.run(journal._can_read_entry(db, entry, _user("u1")))
    assert not asyncio.run(journal._can_read_entry(db, entry, _user("owner-1")))
    assert asyncio.run(journal._can_read_entry(db, idea, _user("owner-1")))
    assert not asyncio.run(journal._can_read_entry(db, idea, _user("u2")))


def test_personal_scope_never_exposes_other_peoples_journals():
    owner_query = journal._personal_scope("org-1", "owner-1", True)
    assert owner_query["$or"] == [{"type": {"$nin": ["journal"]}}, {"user_id": "owner-1"}]

    member_query = journal._personal_scope("org-1", "u2", False)
    assert member_query["user_id"] == "u2"
    assert "$or" not in member_query


def test_journal_mode_prompt_skips_all_org_data(monkeypatch):
    async def fail_snapshot(*args, **kwargs):
        raise AssertionError("journal mode must not gather the org snapshot")

    monkeypatch.setattr(assistant, "_gather_org_snapshot", fail_snapshot)
    prompt, system, snap = asyncio.run(
        assistant._build_ask_prompt(
            text="I felt tired after the launch",
            ctx=assistant.ChatContext(organization_id="org-1", organization_name="Acme"),
            org_id="org-1",
            db=_DB(),
            session_context={},
            conversation_history=[{"role": "user", "content": "hello"}],
            proactive=False,
            journal_mode=True,
        )
    )

    assert system == assistant.JOURNAL_SYSTEM
    assert snap == {}
    assert "Acme" not in prompt
    assert "I felt tired after the launch" in prompt


def test_sync_upserts_one_entry_per_session(monkeypatch):
    db = _DB()
    monkeypatch.setattr(journal, "get_database", lambda: db)

    async def fake_analyze(**kwargs):
        return None

    monkeypatch.setattr(journal_agent, "analyze_entry", fake_analyze)
    user = _user("u1")

    first = asyncio.run(
        journal.sync_journal_entry(
            journal.JournalSyncRequest(
                session_id="s1",
                organization_id="org-1",
                messages=[{"role": "user", "content": "First thought", "timestamp": 1}],
            ),
            current_user=user,
            org_id="org-1",
        )
    )
    second = asyncio.run(
        journal.sync_journal_entry(
            journal.JournalSyncRequest(
                session_id="s1",
                organization_id="org-1",
                messages=[
                    {"role": "user", "content": "First thought", "timestamp": 1},
                    {"role": "assistant", "content": "That sounds heavy.", "timestamp": 2},
                    {"role": "user", "content": "Yes, and tired", "timestamp": 3},
                ],
            ),
            current_user=user,
            org_id="org-1",
        )
    )

    assert first["created"] is True
    assert second["created"] is False
    assert len(db.journal_entries.docs) == 1
    assert db.journal_entries.docs[0]["type"] == "journal"
    assert db.journal_entries.docs[0]["content"] == "First thought"
    assert len(db.journal_entries.docs[0]["messages"]) == 3
