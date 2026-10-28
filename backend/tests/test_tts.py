import asyncio
import base64

import pytest

from app.api.assistant import _journal_language_rule
from app.core import tts


def test_tts_requires_api_key(monkeypatch):
    monkeypatch.setattr(tts.settings, "GEMINI_API_KEY", "")
    with pytest.raises(tts.TtsNotConfigured):
        asyncio.run(tts.synthesize("hello"))


def test_tts_rejects_empty_text(monkeypatch):
    monkeypatch.setattr(tts.settings, "GEMINI_API_KEY", "test-key")
    with pytest.raises(tts.TtsProviderError):
        asyncio.run(tts.synthesize("   "))


def test_find_audio_locates_nested_payload():
    payload = {"steps": [{"content": [{"type": "text", "text": "x"}, {"type": "audio", "data": "QUJD"}]}]}
    assert tts._find_audio(payload) == "QUJD"
    assert tts._find_audio({"steps": []}) is None


def test_tts_caches_audio(monkeypatch):
    monkeypatch.setattr(tts.settings, "GEMINI_API_KEY", "test-key")
    tts._cache.clear()
    calls = []

    class FakeResponse:
        status_code = 200

        def json(self):
            return {"steps": [{"content": [{"type": "audio", "data": base64.b64encode(b"RIFFwav").decode()}]}]}

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, *a, **k):
            calls.append(1)
            return FakeResponse()

    monkeypatch.setattr(tts.httpx, "AsyncClient", FakeClient)
    first = asyncio.run(tts.synthesize("Hello there"))
    second = asyncio.run(tts.synthesize("Hello there"))
    assert first == second == b"RIFFwav"
    assert len(calls) == 1


def test_journal_language_rules():
    assert "Devanagari" in _journal_language_rule("hi")
    assert "Roman" in _journal_language_rule("hinglish")
    assert "language and script" in _journal_language_rule(None)


def test_journal_reply_parser_handles_broken_and_plain_output():
    from app.api.assistant import _parse_journal_reply

    ok = '{"type":"answer","answer":"Sounds heavy.","follow_up":"What helps?"}'
    assert _parse_journal_reply(ok) == ("Sounds heavy.", "What helps?")
    broken = '{"type":"answer":"Aapne poocha.","follow_up":"Kya sukoon dega?"}'
    assert _parse_journal_reply(broken) == ("Aapne poocha.", "Kya sukoon dega?")
    fenced = '```json\n{"answer":"Hi \\"there\\"","follow_up":""}\n```'
    assert _parse_journal_reply(fenced) == ('Hi "there"', None)
    assert _parse_journal_reply("Just plain text reply.") == ("Just plain text reply.", None)
    assert _parse_journal_reply("") == ("", None)


def test_journal_work_context_trigger_and_length_cap():
    from app.api.assistant import _shorten_reply, _wants_work_context

    assert _wants_work_context("what should be done today", None)
    assert _wants_work_context("mujhe aaj kya karna chahiye", None)
    assert _wants_work_context("mera pending dance batao", None)
    assert not _wants_work_context("I felt really low after talking to mom", None)

    long_text = ("This is a sentence. " * 40).strip()
    short = _shorten_reply(long_text, 30)
    assert len(short.split()) <= 30 and short.endswith(".")
    assert _shorten_reply("Short one.", 30) == "Short one."


def test_gather_my_work_only_queries_own_items():
    from app.api.assistant import _gather_my_work

    class Cursor(list):
        def sort(self, *a, **k):
            return self

        def limit(self, *a, **k):
            return self

    class Col:
        def __init__(self, docs, log):
            self.docs, self.log = docs, log

        def find(self, query, *a, **k):
            self.log.append(query)
            return Cursor(self.docs)

    log: list = []

    class Db:
        tasks = Col([{"title": "Ship report", "priority": "high", "status": "pending", "due_date": "2026-10-30T00:00"}], log)
        goals = Col([{"title": "Grow revenue"}], log)

        def __getitem__(self, name):
            return Col([], log)

    block = _gather_my_work(Db(), "org1", "uid1", "Me@Example.com")
    assert "Ship report (high, pending, due 2026-10-30)" in block and "Goal: Grow revenue" in block
    task_query = next(q for q in log if "status" in q)
    ids = task_query["$or"][0]["assignee_id"]["$in"]
    assert "uid1" in ids and "me@example.com" in ids
    assert task_query["organization_id"] == "org1"


def test_gather_my_meetings_formats_and_scopes():
    from app.api.assistant import _fmt_event_time, _gather_my_meetings

    assert _fmt_event_time("20261023T150000+0530") == "Fri 23 Oct, 15:00"

    class Cursor(list):
        def sort(self, *a, **k):
            return self

        def limit(self, *a, **k):
            return self

    queries: list = []

    class Col:
        def __init__(self, docs):
            self.docs = docs

        def find(self, query, *a, **k):
            queries.append(query)
            return Cursor(self.docs)

    class Db:
        meetings = Col([{"title": "Board sync", "start_dt": "20271023T150000+0530", "attendees": ["a@x.com"]}])
        calendar_events = Col([{"title": "Dentist", "start": "20271024T100000+0530"}])

    block = _gather_my_meetings(Db(), "org1", "uid1", "Me@X.com")
    assert "Board sync (with a@x.com)" in block and "Dentist" in block
    assert queries[0]["organization_id"] == "org1"
    assert "uid1" in queries[0]["$or"][0]["created_by"]["$in"]


def _run_journal_ask(monkeypatch, ai_reply: str, message: str):
    from app.api import assistant as a

    async def fake_ai(*args, **kwargs):
        return ai_reply

    async def fake_preview(parsed, db, org_id):
        return (
            {"title": parsed["title"], "assignee_name": "Me", "assignee_id": ["1"], "assignees": [],
             "priority": "medium", "item_type": "task", "description": None, "department": None},
            [],
            None,
        )

    monkeypatch.setattr(a, "get_ai_response", fake_ai)
    monkeypatch.setattr(a, "_build_delegate_preview", fake_preview)
    monkeypatch.setattr(a, "get_database", lambda: None)
    request = a.AskRequest(message=message, mode="journal", context=a.ChatContext(organization_id="org1"))
    return asyncio.run(a.smart_ask(request, current_user=None))


def test_journal_task_request_returns_confirm_preview(monkeypatch):
    reply = '{"type":"delegate","item_type":"task","assignee_name":"Me","title":"Send invoice","answer":"Ready."}'
    resp = _run_journal_ask(monkeypatch, reply, "create a task to send the invoice")
    assert resp.type == "delegate_preview"
    assert resp.delegate_params["title"] == "Send invoice"


def test_journal_without_task_intent_never_delegates(monkeypatch):
    reply = '{"type":"delegate","item_type":"task","assignee_name":"Me","title":"Sneaky","answer":"Hi there."}'
    resp = _run_journal_ask(monkeypatch, reply, "I felt tired today")
    assert resp.type == "answer"
    assert resp.delegate_params is None


def test_journal_task_intent_with_plain_reply_still_answers(monkeypatch):
    resp = _run_journal_ask(monkeypatch, '{"type":"answer","answer":"Which task did you mean?"}', "assign this to someone")
    assert resp.type == "answer" and "Which task" in resp.answer


def test_task_intent_does_not_match_nouns():
    from app.api.assistant import _wants_task_creation

    assert _wants_task_creation("Assign the vendor report to Krisha")
    assert _wants_task_creation("mujhe task bana do invoice bhejna")
    assert _wants_task_creation("remind me to call Rahul")
    assert not _wants_task_creation("the assignment was hard")
    assert not _wants_task_creation("I felt low today")
