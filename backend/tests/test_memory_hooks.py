"""Memory in Let's Talk: when it is used in an answer, and how chats, journals and notes feed it (offline)."""
import asyncio

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

import app.api.assistant as assistant
import app.core.memory as memory
from app.core.config import settings
from app.dependencies.auth import get_current_user
from app.main import app

OWNER_UID = "owner-uid-1"
HIT = {"kind": "journal", "source_id": "j1", "title": "A worry", "text": "I am worried about the Acme renewal", "ts": 1793700000, "score": 0.9}


class U:
    def __init__(self, uid, email):
        self.id = uid
        self.uid = uid
        self.email = email
        self.custom_claims = {}


@pytest.fixture
def calls(monkeypatch):
    """Records what the memory is asked to do, without touching Qdrant or an embedding service."""
    rec = {"recall": [], "index": [], "forget": []}

    async def arecall(user_id, org_id, query, **kw):
        rec["recall"].append({"user": user_id, "org": org_id, "query": query, **kw})
        return [HIT]

    async def index_session_by_id(db, session_id, tail_only=True):
        rec["index"].append(("chat", str(session_id)))

    async def aforget(kind, source_id):
        rec["forget"].append((kind, str(source_id)))

    async def aindex(items):
        rec["index"].extend((i["kind"], i["source_id"]) for i in items)
        return {"indexed": len(items), "failed": 0}

    monkeypatch.setattr(memory, "arecall", arecall)
    monkeypatch.setattr(memory, "index_session_by_id", index_session_by_id)
    monkeypatch.setattr(memory, "aforget", aforget)
    monkeypatch.setattr(memory, "aindex", aindex)
    monkeypatch.setattr(settings, "MEMORY_ENABLED", True)
    return rec


def build(text, **kw):
    args = dict(text=text, ctx=assistant.ChatContext(), org_id="org-1", db=None, session_context={}, conversation_history=[],
                proactive=False, user_id="uid-1", user_email="a@test.local")
    args.update(kw)
    return asyncio.run(assistant._build_ask_prompt(**args))


# ---------------------------------------------------------------- when memory is used in an answer
def test_an_ordinary_question_gets_the_persons_memories(calls):
    prompt, _, _ = build("How should I handle the Acme renewal conversation next week?", session_id="sess-9")
    assert "A worry" in prompt and "private to them" in prompt
    assert calls["recall"][0]["user"] == "uid-1" and calls["recall"][0]["org"] == "org-1"
    assert calls["recall"][0]["exclude_sources"] == {"sess-9"}  # the chat's own history is not recalled back at it


@pytest.mark.parametrize("text", [
    "yes", "3pm", "Priya",                                              # an answer to a question: nothing to recall
    "Assign the Acme renewal follow-up to Priya by Friday",            # ends up in a task someone else reads
    "Ask Rahul to prepare the quotation for the Acme renewal",
    "Book a meeting with the Acme team about the renewal tomorrow",    # ends up in an invite someone else reads
    "Create a task to review the Acme renewal contract this week",
])
def test_messages_that_reach_other_people_never_use_memory(calls, text):
    prompt, _, _ = build(text)
    assert "A worry" not in prompt and calls["recall"] == []


def test_a_pending_booking_never_uses_memory(calls):
    build("Thursday at four works for the Acme renewal discussion", session_context={"pending_booking": "{}"})
    assert calls["recall"] == []


def test_journal_mode_keeps_its_own_context(calls):
    prompt, _, _ = build("I felt anxious about the Acme renewal today and could not sleep", journal_mode=True)
    assert calls["recall"] == [] and "A worry" not in prompt


def test_memory_can_be_switched_off(calls, monkeypatch):
    monkeypatch.setattr(settings, "MEMORY_ENABLED", False)
    prompt, _, _ = build("How should I handle the Acme renewal conversation next week?")
    assert calls["recall"] == [] and "A worry" not in prompt


def test_no_memory_means_an_unchanged_prompt(monkeypatch):
    async def none(*a, **kw):
        return []

    monkeypatch.setattr(memory, "arecall", none)
    monkeypatch.setattr(settings, "MEMORY_ENABLED", True)
    prompt, _, _ = build("How should I handle the Acme renewal conversation next week?")
    assert "private to them" not in prompt


# ---------------------------------------------------------------- chats feed it, deleting forgets it
@pytest.fixture
def client(offline_db):
    app.dependency_overrides[get_current_user] = lambda: U(OWNER_UID, "owner@test.local")
    yield TestClient(app)
    app.dependency_overrides.pop(get_current_user, None)


def make_session(client, org):
    return client.post("/api/v1/assistant/sessions", json={"title": "Plan", "organization_id": org, "kind": "assistant"}).json()["_id"]


def test_only_a_finished_assistant_reply_is_added_to_memory(offline_db, calls):
    async def run():
        for m in ({"role": "user", "content": "How is the pipeline?"},
                  {"role": "assistant", "content": "", "is_loading": True},
                  {"role": "assistant", "content": "   "}):
            assistant._remember_session(offline_db.db, "s1", m)
        await asyncio.sleep(0.01)
        assert calls["index"] == []
        assistant._remember_session(offline_db.db, "s1", {"role": "assistant", "content": "The pipeline looks healthy."})
        await asyncio.sleep(0.01)

    asyncio.run(run())
    assert calls["index"] == [("chat", "s1")]


def test_nothing_is_remembered_when_memory_is_off(offline_db, calls, monkeypatch):
    monkeypatch.setattr(settings, "MEMORY_ENABLED", False)

    async def run():
        assistant._remember_session(offline_db.db, "s1", {"role": "assistant", "content": "A finished reply"})
        await asyncio.sleep(0.01)

    asyncio.run(run())
    assert calls["index"] == []


def test_saving_messages_through_the_endpoint_still_works(client, offline_db, calls):
    sid = make_session(client, offline_db.org)
    post = lambda m: client.post(f"/api/v1/assistant/sessions/{sid}/messages", json={"message": m})
    assert post({"role": "user", "content": "How is the pipeline?"}).status_code == 200
    assert post({"role": "assistant", "content": "The pipeline looks healthy."}).status_code == 200


def test_deleting_a_chat_forgets_it(client, offline_db, calls):
    sid = make_session(client, offline_db.org)
    assert client.delete(f"/api/v1/assistant/sessions/{sid}").status_code == 200
    assert ("chat", sid) in calls["forget"]


def test_deleting_a_journal_entry_forgets_it(client, offline_db, calls):
    entry = offline_db.db.journal_entries.insert_one({"user_id": OWNER_UID, "org_id": offline_db.org, "content": "private", "messages": []})
    eid = str(entry.inserted_id)
    assert client.delete(f"/api/v1/journal/{eid}").status_code == 200
    assert ("journal", eid) in calls["forget"]


def test_deleting_someone_elses_journal_entry_forgets_nothing(client, offline_db, calls):
    entry = offline_db.db.journal_entries.insert_one({"user_id": "someone-else", "org_id": offline_db.org, "content": "theirs", "messages": []})
    assert client.delete(f"/api/v1/journal/{entry.inserted_id}").status_code == 404
    assert calls["forget"] == []


def test_deleting_a_note_forgets_it(client, offline_db, calls):
    cap = offline_db.db.captures.insert_one({"user_id": OWNER_UID, "org_id": offline_db.org, "text": "Minutes", "kind": "mom", "visibility": "private",
                                             "status": "done", "source": "text", "title": "t", "created_at": __import__("datetime").datetime.utcnow()})
    cid = str(cap.inserted_id)
    assert client.delete(f"/api/v1/captures/{cid}").status_code == 200
    assert ("note", cid) in calls["forget"]


# ---------------------------------------------------------------- analysed notes feed it
def test_an_analysed_note_is_added_to_memory_but_a_journal_capture_is_not(offline_db, calls):
    from app.core.capture_analysis import _remember_note
    import datetime as dt

    note = offline_db.db.captures.insert_one({"user_id": OWNER_UID, "org_id": offline_db.org, "text": "Minutes: send the quotation", "kind": "mom",
                                              "title": "Minutes", "created_at": dt.datetime.utcnow(), "analysis": {}})
    jour = offline_db.db.captures.insert_one({"user_id": OWNER_UID, "org_id": offline_db.org, "text": "dear diary", "kind": "journal",
                                              "title": "Diary", "created_at": dt.datetime.utcnow(), "analysis": {}})
    asyncio.run(_remember_note(offline_db.db, note.inserted_id))
    asyncio.run(_remember_note(offline_db.db, jour.inserted_id))
    assert calls["index"] == [("note", str(note.inserted_id))]
