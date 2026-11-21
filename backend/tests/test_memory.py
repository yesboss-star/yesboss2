"""Long-term memory: what is indexed, who can recall it, and what happens when things fail (offline).

Qdrant runs in its in-memory mode and embeddings are a stand-in (hashed words), so nothing here reaches the
real cluster or the embedding service.
"""
import asyncio
import hashlib
import math
import re
from datetime import datetime

import pytest
from bson import ObjectId
from qdrant_client import QdrantClient

import app.core.memory as memory
import app.core.qdrant as qdrant
from app.core.qdrant import EmbeddingUnavailable

ORG, OTHER_ORG = "org-1", "org-2"
ALICE, BOB = "uid-alice", "uid-bob"


def fake_embedding(text: str) -> list[float]:
    vec = [0.0] * 1536
    for token in re.findall(r"[a-z0-9]{3,}", text.lower()):
        vec[int(hashlib.md5(token.encode()).hexdigest()[:8], 16) % 1536] += 1.0
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


@pytest.fixture(autouse=True)
def store(monkeypatch):
    monkeypatch.setattr(qdrant, "client", QdrantClient(":memory:"))
    monkeypatch.setattr(memory, "_ready", False)
    monkeypatch.setattr(memory, "get_embedding_strict", fake_embedding)
    monkeypatch.setattr(qdrant, "get_embedding_strict", fake_embedding)
    yield qdrant.client


def count():
    return qdrant.client.count(memory.COLLECTION).count


def recall(user, org, query, **kw):
    """The stand-in embedding scores short matches lower than a real one, so the cut-off is lower here."""
    kw.setdefault("min_score", 0.3)
    return memory.recall(user, org, query, **kw)


def session(messages, user=ALICE, org=ORG, kind="assistant", title="Chat"):
    return {"_id": ObjectId(), "user_id": user, "organization_id": org, "kind": kind, "title": title,
            "updated_at": datetime(2026, 11, 3), "messages": [{"role": r, "content": c, "timestamp": 1793700000000 + i} for i, (r, c) in enumerate(messages)]}


def note(text, user=ALICE, org=ORG, title="Minutes"):
    return {"_id": ObjectId(), "user_id": user, "org_id": org, "title": title, "text": text, "created_at": datetime(2026, 11, 2),
            "analysis": {"provider": "llm", "summary": ""}}


def journal(text, user=ALICE, org=ORG):
    return {"_id": ObjectId(), "user_id": user, "org_id": org, "content": text, "created_at": datetime(2026, 11, 1),
            "messages": [{"role": "user", "content": text}], "ai_analysis": {"summary": "A reflection about " + text[:30]}}


# ---------------------------------------------------------------- what becomes a memory
def test_a_long_chat_becomes_windows_of_a_few_turns():
    msgs = [("user" if i % 2 == 0 else "assistant", f"message number {i}") for i in range(13)]
    items = memory.chat_items(session(msgs))
    assert [i["part"] for i in items] == [0, 1, 2]
    assert items[0]["text"].startswith("You: message number 0") and "Assistant: message number 1" in items[0]["text"]
    assert {i["user_id"] for i in items} == {ALICE} and {i["org_id"] for i in items} == {ORG}


def test_empty_and_loading_messages_and_journal_page_sessions_are_not_remembered():
    s = session([("user", "hello there"), ("assistant", ""), ("user", "  ")])
    s["messages"].append({"role": "assistant", "content": "thinking", "is_loading": True})
    assert len(memory.chat_items(s)) == 1 and "thinking" not in memory.chat_items(s)[0]["text"]
    assert memory.chat_items(session([("user", "dear diary")], kind="journal")) == []


def test_records_without_an_owner_or_organization_are_never_remembered():
    assert memory.note_items({"_id": ObjectId(), "text": "orphan", "org_id": ORG}) == []
    assert memory.journal_items({"_id": ObjectId(), "user_id": ALICE, "content": "no org"}) == []


def test_the_same_item_always_gets_the_same_id():
    assert memory.point_id("chat", "abc", 1) == memory.point_id("chat", "abc", 1) != memory.point_id("chat", "abc", 2)


# ---------------------------------------------------------------- recall: only your own
def test_recall_finds_what_the_person_said_before():
    memory.index_items(memory.note_items(note("Priya will send the Acme quotation revision by Friday")))
    memory.index_items(memory.journal_items(journal("I felt proud after the board presentation went well")))
    hits = recall(ALICE, ORG, "what did we decide about the Acme quotation")
    assert hits and hits[0]["kind"] == "note" and "Acme" in hits[0]["text"]
    assert all(h["kind"] != "journal" for h in hits)  # the unrelated journal entry is below the cut


def test_nobody_recalls_someone_elses_memories():
    memory.index_items(memory.journal_items(journal("My private worry about the Acme quotation", user=ALICE)))
    memory.index_items(memory.note_items(note("Acme quotation follow up", user=ALICE)))
    assert recall(BOB, ORG, "Acme quotation worry") == []
    assert recall(ALICE, OTHER_ORG, "Acme quotation worry") == []
    assert recall(ALICE, ORG, "Acme quotation worry")


def test_an_owner_does_not_get_an_employees_journal():
    """The owner is just another user here: their recall is filtered to their own id."""
    memory.index_items(memory.journal_items(journal("Employee private reflection on the Acme quotation", user=BOB)))
    assert recall("uid-owner", ORG, "Acme quotation reflection") == []


def test_the_current_chat_can_be_left_out_and_weak_matches_are_dropped():
    s = session([("user", "Let us plan the Acme quotation revision"), ("assistant", "Sure, here is a plan")])
    memory.index_items(memory.chat_items(s))
    assert recall(ALICE, ORG, "Acme quotation revision")
    assert recall(ALICE, ORG, "Acme quotation revision", exclude_sources={str(s["_id"])}) == []
    assert recall(ALICE, ORG, "completely unrelated football fixtures") == []


def test_only_the_best_part_of_each_source_is_returned():
    msgs = [("user" if i % 2 == 0 else "assistant", f"Acme quotation detail {i}") for i in range(12)]
    memory.index_items(memory.chat_items(session(msgs)))
    hits = recall(ALICE, ORG, "Acme quotation detail")
    assert len(hits) == 1


# ---------------------------------------------------------------- keeping it in step
def test_indexing_again_replaces_instead_of_duplicating():
    items = memory.note_items(note("Budget review on Tuesday"))
    memory.index_items(items)
    memory.index_items(items)
    assert count() == 1


def test_forget_removes_a_records_memories_and_only_those():
    a, b = note("Budget review on Tuesday"), note("Hiring plan for sales")
    memory.index_items(memory.note_items(a) + memory.note_items(b))
    memory.forget("note", a["_id"])
    assert count() == 1 and recall(ALICE, ORG, "hiring plan sales")


def test_a_failed_embedding_is_skipped_never_stored_as_a_made_up_vector(monkeypatch):
    def flaky(text):
        if "broken" in text:
            raise EmbeddingUnavailable("rate limited")
        return fake_embedding(text)

    monkeypatch.setattr(memory, "get_embedding_strict", flaky)
    result = memory.index_items(memory.note_items(note("broken note")) + memory.note_items(note("good note about pricing")))
    assert result == {"indexed": 1, "failed": 1} and count() == 1


def test_recall_for_the_chat_never_raises_even_when_embedding_is_down(monkeypatch):
    def down(text):
        raise EmbeddingUnavailable("no key")

    monkeypatch.setattr(memory, "get_embedding_strict", down)
    assert asyncio.run(memory.arecall(ALICE, ORG, "anything at all")) == []
    assert asyncio.run(memory.arecall(None, ORG, "anything")) == []


# ---------------------------------------------------------------- what the AI is shown
def test_the_prompt_block_carries_the_privacy_guard_and_stays_short():
    hits = [{"kind": "journal", "source_id": str(i), "title": "t", "text": "word " * 200, "ts": 1793700000, "score": 0.9} for i in range(10)]
    block = memory.format_block(hits)
    assert "Never copy it into a task" in block and len(block) < 3200 and block.count("\n- ") <= 8
    assert memory.format_block([]) == ""


# ---------------------------------------------------------------- rebuilding from MongoDB
def seed(db):
    db.journal_entries.insert_many([journal("Reflection on the Acme deal", user=ALICE), journal("Bob private thoughts about hiring", user=BOB)])
    db.captures.insert_one(note("Minutes: send the revised quotation", user=ALICE))
    db.assistant_sessions.insert_many([session([("user", "How is the pipeline?"), ("assistant", "Looks healthy")], user=ALICE),
                                       session([("user", "diary"), ("assistant", "tell me more")], user=ALICE, kind="journal")])


def test_reindex_dry_run_counts_but_stores_nothing(offline_db):
    seed(offline_db.db)
    report = memory.reindex(offline_db.db, dry_run=True)
    assert report["journal"]["records"] == 2 and report["note"]["records"] == 1 and report["chat"]["records"] == 1
    assert count() == 0 if qdrant.client.collection_exists(memory.COLLECTION) else True


def test_documents_are_rebuilt_from_their_stored_chunks_without_duplicates(offline_db, monkeypatch):
    import app.core.file_processor as fp

    async def fake_batch(texts, **kw):
        return [fake_embedding(t) for t in texts]

    monkeypatch.setattr(fp, "_gemini_embed_batch", fake_batch)
    offline_db.db.documents.insert_one({"file_id": "f1", "filename": "sales.xlsx", "org_id": ORG, "user_id": ALICE, "file_type": "xlsx",
                                        "chunks": ["Q4 revenue by region", "Pipeline stage totals"]})
    offline_db.db.documents.insert_one({"file_id": "f2", "filename": "empty.pdf", "org_id": ORG, "user_id": ALICE, "chunks": []})
    first = asyncio.run(memory.reindex_documents(offline_db.db, user_ids=[ALICE]))
    second = asyncio.run(memory.reindex_documents(offline_db.db, user_ids=[ALICE]))
    assert first["documents"] == 1 and first["chunks"] == 2 and first["replaced"] == 1 and first["failed"] == 0
    assert second["replaced"] == 1 and qdrant.client.count("documents").count == 2


def test_a_document_whose_embedding_fails_keeps_its_old_vectors(offline_db, monkeypatch):
    import app.core.file_processor as fp

    async def good(texts, **kw):
        return [fake_embedding(t) for t in texts]

    async def broken(texts, **kw):
        raise RuntimeError("rate limited")

    offline_db.db.documents.insert_one({"file_id": "f1", "filename": "a.pdf", "org_id": ORG, "user_id": ALICE, "chunks": ["alpha beta gamma"]})
    monkeypatch.setattr(fp, "_gemini_embed_batch", good)
    asyncio.run(memory.reindex_documents(offline_db.db))
    monkeypatch.setattr(fp, "_gemini_embed_batch", broken)
    report = asyncio.run(memory.reindex_documents(offline_db.db))
    assert report["failed"] == 1 and report["replaced"] == 0 and qdrant.client.count("documents").count == 1


def test_api_keys_are_hidden_in_embedding_error_messages():
    msg = "Client error '429' for url 'https://x.googleapis.com/v1beta/models/m:batchEmbedContents?key=AIzaSECRET123&alt=json'"
    assert "SECRET" not in qdrant.redact_secrets(msg) and "key=***" in qdrant.redact_secrets(msg)
    assert qdrant.redact_secrets("plain message") == "plain message"


def test_a_rate_limited_batch_is_retried_after_a_wait(monkeypatch):
    import httpx

    calls = {"n": 0}

    async def flaky(texts):
        calls["n"] += 1
        if calls["n"] < 3:
            raise httpx.HTTPStatusError("429", request=httpx.Request("POST", "https://x"), response=httpx.Response(429))
        return [fake_embedding(t) for t in texts]

    async def no_wait(seconds):
        return None

    monkeypatch.setattr(memory.asyncio, "sleep", no_wait)
    vectors = asyncio.run(memory._embed_batch_patiently(flaky, ["alpha"]))
    assert calls["n"] == 3 and len(vectors) == 1


def test_a_batch_that_keeps_failing_gives_up(monkeypatch):
    import httpx

    async def always(texts):
        raise httpx.HTTPStatusError("429", request=httpx.Request("POST", "https://x"), response=httpx.Response(429))

    async def no_wait(seconds):
        return None

    monkeypatch.setattr(memory.asyncio, "sleep", no_wait)
    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(memory._embed_batch_patiently(always, ["alpha"], attempts=3))


class FakePoint:
    def __init__(self, source, score, kind="journal"):
        self.score = score
        self.payload = {"kind": kind, "source_id": source, "title": source, "text": "text", "ts": 1793700000}


def test_the_default_cut_off_comes_from_settings_and_weak_hits_are_dropped(monkeypatch):
    monkeypatch.setattr(memory, "vector_search", lambda *a, **k: [FakePoint("strong", 0.80), FakePoint("weak", 0.60)])
    memory.index_items(memory.note_items(note("anything")))  # makes sure the collection exists
    monkeypatch.setattr(memory.settings, "MEMORY_MIN_SCORE", 0.68)
    assert [h["source_id"] for h in memory.recall(ALICE, ORG, "a question")] == ["strong"]
    monkeypatch.setattr(memory.settings, "MEMORY_MIN_SCORE", 0.95)
    assert memory.recall(ALICE, ORG, "a question") == []


def test_a_hit_far_below_the_best_one_is_dropped_even_if_it_clears_the_cut_off(monkeypatch):
    monkeypatch.setattr(memory, "vector_search", lambda *a, **k: [FakePoint("best", 0.90), FakePoint("close", 0.84), FakePoint("far", 0.72)])
    memory.index_items(memory.note_items(note("anything")))
    monkeypatch.setattr(memory.settings, "MEMORY_MIN_SCORE", 0.68)
    assert [h["source_id"] for h in memory.recall(ALICE, ORG, "a question")] == ["best", "close"]


def test_a_dry_run_of_documents_stores_nothing(offline_db):
    offline_db.db.documents.insert_one({"file_id": "f1", "filename": "a.pdf", "org_id": ORG, "user_id": ALICE, "chunks": ["alpha"]})
    report = asyncio.run(memory.reindex_documents(offline_db.db, dry_run=True))
    assert report["documents"] == 1 and report["replaced"] == 0


def test_reindex_can_be_limited_to_one_person_and_run_twice(offline_db):
    seed(offline_db.db)
    first = memory.reindex(offline_db.db, user_ids=[ALICE])
    assert first["journal"]["records"] == 1 and first["note"]["records"] == 1 and first["chat"]["records"] == 1
    before = count()
    memory.reindex(offline_db.db, user_ids=[ALICE])
    assert count() == before
    assert recall(BOB, ORG, "hiring private thoughts") == []


def test_a_deleted_documents_vectors_are_removed_so_it_cannot_be_quoted():
    from qdrant_client.models import PointStruct

    qdrant.create_collection("documents", 1536)
    keep, gone = "file-keep", "file-gone"
    for fid in (keep, gone):
        for i in range(3):
            qdrant.client.upsert("documents", points=[PointStruct(id=int(hashlib.md5(f"{fid}{i}".encode()).hexdigest()[:8], 16), vector=fake_embedding(f"{fid} chunk {i}"),
                                                                payload={"file_id": fid, "chunk_text": f"{fid} chunk {i}"})])
    assert qdrant.client.count("documents").count == 6
    memory.forget_document(gone)
    assert qdrant.client.count("documents").count == 3
    remaining = {p.payload["file_id"] for p in qdrant.client.scroll("documents", limit=10)[0]}
    assert remaining == {keep}
    memory.forget_document(None)  # nothing to do, and no error
    memory.forget_document("never-existed")
    assert qdrant.client.count("documents").count == 3
