import asyncio
from datetime import UTC, datetime, timedelta

from bson import ObjectId

from app.core import journal_intel as intel


def _entry(day_offset=0, analysis=None, text="entry", uid="u1"):
    return {
        "_id": ObjectId(), "user_id": uid, "org_id": "o1", "content": text,
        "created_at": datetime.utcnow() - timedelta(days=day_offset), "ai_analysis": analysis,
    }


def test_normalize_analysis_clamps_and_filters():
    a = intel.normalize_analysis({
        "kind": "WEIRD", "summary": "x" * 900, "takeaways": ["a", "a", "b"],
        "signals": {"mood": 9, "stress": "4", "energy": None, "triggers": ["money", "bogus"]},
        "themes": ["Sales Decline!", ""], "entities": {"problems": ["Late deliveries"]},
    })
    assert a["kind"] == "reflection" and len(a["summary"]) == 400
    assert a["takeaways"] == ["a", "b"]
    assert a["signals"]["mood"] == 5 and a["signals"]["stress"] == 4 and a["signals"]["energy"] is None
    assert a["signals"]["triggers"] == ["money"] and a["signals"]["inferred"] is True
    assert a["themes"] == ["sales decline"] and a["analysis_version"] == 2


def test_analyze_content_uses_ai_and_handles_garbage(monkeypatch):
    async def good(*args, **kwargs):
        return '{"kind":"concern","summary":"Sales are dropping","hypotheses":["Marketing targets the wrong audience"],"follow_up_questions":["What changed?"]}'

    monkeypatch.setattr(intel, "get_ai_response", good)
    result = asyncio.run(intel.analyze_content("Our sales have been dropping", "journal"))
    assert result["kind"] == "concern" and result["hypotheses"] and result["follow_up_questions"] == ["What changed?"]

    async def bad(*args, **kwargs):
        return "not json at all"

    monkeypatch.setattr(intel, "get_ai_response", bad)
    assert asyncio.run(intel.analyze_content("hello", "journal")) is None
    assert asyncio.run(intel.analyze_content("   ", "journal")) is None


def test_mood_insights_pattern_is_hedged_and_counted():
    entries = [
        _entry(d, {"signals": {"stress": 5, "mood": 2, "triggers": ["customers"]}, "entities": {"problems": ["delayed client deliveries"]}})
        for d in (1, 2, 3)
    ] + [_entry(4, {"signals": {"stress": 1, "mood": 5, "triggers": []}, "entities": {"problems": []}})]
    result = intel.compute_mood_insights([], entries)
    texts = [p["text"] for p in result["patterns"]]
    assert any("3 days" in t and "delayed client deliveries" in t for t in texts)
    assert all("not a proven cause" in t for t in texts)
    assert result["weekly"] and result["series"][0]["source"] == "inferred"


def test_checkin_overrides_inferred_values():
    today = intel.day_ist(datetime.utcnow())
    entries = [_entry(0, {"signals": {"stress": 5, "mood": 1}, "entities": {}})]
    out = intel.compute_mood_insights([{"date": today, "mood": 4, "stress": 2, "reasons": ["team"]}], entries)
    row = next(r for r in out["series"] if r["date"] == today)
    assert row["source"] == "checkin" and row["mood"] == 4 and row["stress"] == 2 and "team" in row["triggers"]


def test_detect_patterns_threshold_and_wording():
    base = {"themes": ["delegation"], "entities": {}, "signals": {}, "kind": "concern"}
    entries = [_entry(d, dict(base)) for d in (1, 3, 5)]
    found = intel.detect_patterns(entries, [])
    assert found and found[0]["theme"] == "delegation" and found[0]["count"] == 3
    assert "Would you like to explore" in found[0]["text"]
    assert intel.detect_patterns(entries[:2], []) == []


def test_stalled_ideas_pattern():
    ideas = [{"entry_id": str(i), "status": "thought", "created_at": datetime.utcnow() - timedelta(days=20)} for i in range(3)]
    found = intel.detect_patterns([], ideas)
    assert found and found[0]["type"] == "stalled_ideas" and found[0]["count"] == 3


def test_detect_window_phrases():
    assert intel.detect_window("what was I worried about last month?")[0] is not None
    assert intel.detect_window("pichle hafte kya hua")[0] is not None
    assert intel.detect_window("what did I decide about expanding")[0] is None


def test_recap_range_keys():
    _, _, daily = intel.recap_range("daily")
    _, _, weekly = intel.recap_range("weekly")
    assert len(daily) == 10 and ".." in weekly


class _Cursor(list):
    def limit(self, *a, **k):
        return self

    def sort(self, *a, **k):
        return self


class _Col:
    def __init__(self, docs=None, count=0):
        self.docs, self.count = docs or [], count

    def find(self, *a, **k):
        return _Cursor(self.docs)

    def count_documents(self, *a, **k):
        return self.count


class _Db:
    def __init__(self, meetings=None, goals_active=0):
        self.meetings = _Col(meetings)
        self.goals = _Col(count=goals_active)


def test_reminder_due_by_date():
    past = {"trigger": {"type": "date", "due_at": datetime.utcnow() - timedelta(hours=1)}}
    future = {"trigger": {"type": "date", "due_at": datetime.utcnow() + timedelta(days=2)}}
    assert intel.reminder_is_due(_Db(), past) and not intel.reminder_is_due(_Db(), future)


def test_reminder_after_meeting_and_project_active():
    now = datetime.utcnow()
    ended = (now.replace(tzinfo=UTC).astimezone(intel.IST) - timedelta(hours=3)).strftime("%Y%m%dT%H%M%S")
    rem = {"user_id": "u1", "org_id": "o1", "created_at": now - timedelta(days=1), "trigger": {"type": "after_meeting", "match": "Acme"}}
    assert intel.reminder_is_due(_Db(meetings=[{"end_dt": "20200101T100000+0530"}]), rem) is False  # ended before the reminder existed
    rem_ok = {**rem, "created_at": now - timedelta(days=400)}
    assert intel.reminder_is_due(_Db(meetings=[{"end_dt": ended + "+0530"}]), rem_ok) is True
    transition = {"org_id": "o1", "trigger": {"type": "project_active", "goal_title": "Launch", "baseline_active": False}}
    assert intel.reminder_is_due(_Db(goals_active=1), transition) is True
    already = {"org_id": "o1", "trigger": {"type": "project_active", "goal_title": "Launch", "baseline_active": True}}
    assert intel.reminder_is_due(_Db(goals_active=1), already) is False


def test_what_if_labels_fact_vs_estimate(monkeypatch):
    async def fake(*args, **kwargs):
        return ('{"summary":"Drop small clients","benefits":[{"text":"Higher margin","basis":"fact"},{"text":"Less support load"}],'
                '"costs":[],"risks":[{"text":"Revenue dip","basis":"estimate"}],"assumptions":["Enterprise demand exists"],'
                '"info_needed":["Revenue by client size"],"first_step":"Pilot with 3 clients"}')

    monkeypatch.setattr(intel, "get_ai_response", fake)
    out = asyncio.run(intel.what_if("What if I stop serving small clients?", "Team size: 10"))
    assert out["benefits"][0]["basis"] == "fact" and out["benefits"][1]["basis"] == "estimate"
    assert out["info_needed"] and out["first_step"]


def test_keyword_rank_prefers_matching_entries():
    entries = [_entry(1, None, "We discussed hiring two salespeople"), _entry(2, None, "Lunch was nice")]
    ranked = intel._keyword_rank(entries, "hiring salespeople", 5)
    assert len(ranked) == 1 and "salespeople" in ranked[0]["content"]


# ---------------------------------------------------------------------------
# Privacy: one author's journal data is never readable by another user
# ---------------------------------------------------------------------------

class _FakeCol:
    def __init__(self, docs):
        self.docs = docs

    def find_one(self, query, *a, **k):
        for doc in self.docs:
            if all(doc.get(key) == value for key, value in query.items()):
                return dict(doc)
        return None

    def find(self, query, *a, **k):
        rows = [dict(d) for d in self.docs if all(d.get(key) == value for key, value in query.items() if not isinstance(value, dict))]
        return _Cursor(rows)


class _FakeDb:
    def __init__(self):
        self.entry_id = ObjectId()
        self.cols = {
            "journal_entries": _FakeCol([{"_id": self.entry_id, "user_id": "owner-1", "org_id": "org1", "content": "private thoughts", "created_at": datetime.utcnow()}]),
            "journal_decisions": _FakeCol([{"_id": ObjectId(), "user_id": "owner-1", "org_id": "org1", "question": "Hire?", "created_at": datetime.utcnow()}]),
        }

    def __getitem__(self, name):
        return self.cols.setdefault(name, _FakeCol([]))

    def __getattr__(self, name):
        return self[name]


def _client(monkeypatch, uid, db=None):
    from types import SimpleNamespace

    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app.api import journal_intel as api
    from app.dependencies.auth import get_current_user

    db = db or _FakeDb()
    monkeypatch.setattr(api, "get_database", lambda: db)
    app = FastAPI()
    app.include_router(api.router, prefix="/api/v1/journal-intel")
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(uid=uid, email=f"{uid}@x.com")
    return TestClient(app), db


def test_other_users_cannot_read_an_authors_entry(monkeypatch):
    client, db = _client(monkeypatch, "intruder-2")
    res = client.get(f"/api/v1/journal-intel/entries/{db.entry_id}", params={"organization_id": "org1"})
    assert res.status_code == 404
    assert client.get("/api/v1/journal-intel/decisions", params={"organization_id": "org1"}).json()["decisions"] == []


def test_author_can_read_their_own_entry(monkeypatch):
    client, db = _client(monkeypatch, "owner-1")
    res = client.get(f"/api/v1/journal-intel/entries/{db.entry_id}", params={"organization_id": "org1"})
    assert res.status_code == 200 and res.json()["entry"]["content"] == "private thoughts"
    assert len(client.get("/api/v1/journal-intel/decisions", params={"organization_id": "org1"}).json()["decisions"]) == 1


def test_org_id_is_part_of_the_scope(monkeypatch):
    client, db = _client(monkeypatch, "owner-1")
    res = client.get(f"/api/v1/journal-intel/entries/{db.entry_id}", params={"organization_id": "another-org"})
    assert res.status_code == 404


def test_session_summary_is_private_and_reports_readiness(monkeypatch):
    client, db = _client(monkeypatch, "owner-1")
    db.cols["journal_entries"].docs[0].update({"session_id": "s1", "ai_analysis": {"analysis_version": 2, "kind": "idea", "signals": {"mood": 4}}})
    db.cols["journal_ideas"] = _FakeCol([{"user_id": "owner-1", "entry_id": str(db.entry_id), "connection_note": "Related"}])
    ok = client.get("/api/v1/journal-intel/sessions/s1", params={"organization_id": "org1"}).json()
    assert ok["ready"] and ok["kind"] == "idea" and ok["idea_saved"] and ok["mood_noted"]

    other, _ = _client(monkeypatch, "intruder-2", db)
    assert other.get("/api/v1/journal-intel/sessions/s1", params={"organization_id": "org1"}).json() == {"ready": False}
