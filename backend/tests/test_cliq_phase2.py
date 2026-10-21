"""Phase 2 — criticality hybrid, follow-up scheduler, privacy, buttons."""

import asyncio
from datetime import datetime, timedelta

import app.core.notification_service as ns
from app.agents import task_interaction_agent as tia
from app.api.zoho_cliq import _thread_out
from app.core import scheduler as sched


class _Result:
    def __init__(self, inserted_id=None):
        self.inserted_id = inserted_id
        self.modified_count = 1


class _Cursor:
    def __init__(self, docs):
        self._docs = docs

    def limit(self, n):
        return self._docs[:n]

    def __iter__(self):
        return iter(self._docs)


class _Collection:
    def __init__(self):
        self.docs = []

    def _match(self, doc, flt):
        for key, want in flt.items():
            if isinstance(want, dict):
                if "$nin" in want and doc.get(key) in want["$nin"]:
                    return False
                if "$lte" in want:
                    value = doc.get(key)
                    if value is None or value > want["$lte"]:
                        return False
                continue
            if doc.get(key) != want:
                return False
        return True

    def find_one(self, flt, *args, **kwargs):
        for doc in self.docs:
            if self._match(doc, flt):
                return doc
        return None

    def find(self, flt=None, *args, **kwargs):
        return _Cursor([d for d in self.docs if self._match(d, flt or {})])

    def insert_one(self, doc):
        doc = dict(doc)
        doc.setdefault("_id", f"id{len(self.docs) + 1}")
        self.docs.append(doc)
        return _Result(doc["_id"])

    def update_one(self, flt, update, upsert=False):
        for doc in self.docs:
            if self._match(doc, flt):
                for op, values in update.items():
                    if op == "$set":
                        doc.update(values)
                    elif op == "$max":
                        for key, value in values.items():
                            if doc.get(key) is None or value > doc.get(key):
                                doc[key] = value
                return _Result()
        return _Result()


class FakeDB:
    def __init__(self):
        self._c = {}

    def __getitem__(self, name):
        return self._c.setdefault(name, _Collection())

    def __getattr__(self, name):
        return self[name]


def _task(due_days=-3, priority="low"):
    return {
        "_id": "t1",
        "title": "Ship release",
        "priority": priority,
        "due_date": (datetime.utcnow() + timedelta(days=due_days)).isoformat(),
        "organization_id": "org1",
    }


def _thread(**overrides):
    base = {
        "_id": "th1",
        "task_id": "t1",
        "org_id": "org1",
        "assignee_email": "dev@x.com",
        "status": "assigned",
        "criticality": "low",
        "risk_score": 0,
        "risk_notes": "",
        "next_followup_at": datetime.utcnow() - timedelta(minutes=1),
        "nudge_count": 0,
        "last_reply_at": None,
        "last_nudge_at": None,
        "last_send_error": "",
        "messages": [],
        "summarized": False,
        "escalated_at": None,
    }
    base.update(overrides)
    return base


# ── notification fan-out ────────────────────────────────────────────────────


def test_cliq_fanout_skips_assignment_but_sends_other_types(monkeypatch):
    sent = []

    async def fake_send(self, email, text, buttons=None, org_id=""):
        sent.append((email, text))
        return {"chat_id": "z1"}

    monkeypatch.setattr("app.core.zoho.cliq.ZohoCliq.send_dm", fake_send)
    db = FakeDB()
    monkeypatch.setattr(ns, "get_database", lambda: db)
    monkeypatch.setattr(ns, "is_email_configured", lambda: False)

    async def run():
        await ns.create_and_deliver(
            "dev@x.com", "org1", "task_assigned", "Assigned", "card already sent",
            email="dev@x.com",
        )
        await asyncio.sleep(0)
        await ns.create_and_deliver(
            "dev@x.com", "org1", "task_deadline", "Due", "due tomorrow",
            email="dev@x.com",
        )
        await asyncio.sleep(0)

    asyncio.run(run())

    assert len(sent) == 1
    assert "Due" in sent[0][1]


# ── criticality hybrid (§9) ─────────────────────────────────────────────────


def test_evaluate_criticality_llm_adjusts_one_level():
    task = {
        "priority": "medium",
        "due_date": (datetime.utcnow() + timedelta(days=2)).isoformat(),
    }
    base = tia.evaluate_criticality(task, {"status": "in_progress", "nudge_count": 0})
    assert base["criticality"] == "low"
    adjusted = tia.evaluate_criticality(
        task,
        {"status": "in_progress"},
        {"confidence": 0.9, "suggested_criticality": "critical"},
    )
    assert adjusted["criticality"] == "medium"


def test_evaluate_criticality_llm_low_confidence_ignored():
    task = {"priority": "low", "due_date": (datetime.utcnow() + timedelta(days=10)).isoformat()}
    result = tia.evaluate_criticality(
        task,
        {"status": "in_progress"},
        {"confidence": 0.5, "suggested_criticality": "critical"},
    )
    assert result["criticality"] == "low"


def test_parse_llm_json_tolerates_code_fences():
    parsed = tia._parse_llm_json(
        '```json\n{"intent":"blocked","confidence":0.9,'
        '"suggested_criticality":"high","risk_summary":"API keys missing"}\n```'
    )
    assert parsed["intent"] == "blocked"
    assert parsed["suggested_criticality"] == "high"


def test_merge_classification_llm_resolves_unclear():
    rules = tia.classify_reply("hmm ok sure")
    merged = tia._merge_classification(
        rules, {"intent": "blocked", "confidence": 0.9, "risk_summary": "blocked"}
    )
    assert merged["intent"] == "blocked"


def test_merge_classification_keeps_rule_intent():
    rules = tia.classify_reply("done")
    merged = tia._merge_classification(rules, {"intent": "blocked", "confidence": 0.99})
    assert merged["intent"] == "completed"


def test_on_reply_uses_llm_when_enabled(monkeypatch):
    async def fake_llm(text, task):
        return {
            "intent": "blocked",
            "confidence": 0.9,
            "suggested_criticality": "high",
            "risk_summary": "API keys missing",
        }

    monkeypatch.setattr(tia, "classify_reply_llm", fake_llm)
    db = FakeDB()
    db.tasks.insert_one(_task())
    asyncio.run(tia.on_task_assigned(db, db.tasks.docs[0], "dev@x.com"))
    thread = db.task_followups.docs[0]
    result = asyncio.run(
        tia.on_reply(db, thread, "hmm ok sure", cliq_msg_id="m1", use_llm=True)
    )
    assert result["intent"] == "blocked"
    assert thread["risk_notes"] == "API keys missing"


# ── escalation privacy (§10) ────────────────────────────────────────────────


def test_rule_risk_notes_are_manager_safe():
    db = FakeDB()
    db.tasks.insert_one(_task(due_days=5))
    asyncio.run(tia.on_task_assigned(db, db.tasks.docs[0], "dev@x.com"))
    thread = db.task_followups.docs[0]
    asyncio.run(
        tia.on_reply(db, thread, "blocked because SECRET_TRANSCRIPT is leaking")
    )
    assert "SECRET_TRANSCRIPT" not in thread["risk_notes"]


def test_escalation_never_includes_transcript(monkeypatch):
    captured = []

    async def fake_find(db, email):
        return "mgr@x.com"

    async def fake_owner(db, org):
        return "owner1", "owner@x.com"

    async def fake_deliver(**kwargs):
        captured.append(kwargs)

    monkeypatch.setattr(sched, "find_manager_email", fake_find)
    monkeypatch.setattr(sched, "get_org_owner_info", fake_owner)
    monkeypatch.setattr(ns, "create_and_deliver", fake_deliver)

    db = FakeDB()
    thread = _thread(
        status="blocked",
        criticality="high",
        risk_notes="API keys missing",
        messages=[{"dir": "in", "text": "SECRET_TRANSCRIPT do not share"}],
    )
    asyncio.run(tia.escalate_risk_summary(db, thread))

    assert len(captured) == 2
    for call in captured:
        assert "SECRET_TRANSCRIPT" not in call["message"]
        assert "API keys missing" in call["message"]
    assert thread["escalated_at"] is not None


def test_thread_out_hides_transcript_from_manager():
    doc = {
        "_id": "th1",
        "task_id": "t1",
        "messages": [{"dir": "in", "text": "secret"}],
        "cliq_chat_id": "c1",
        "status": "blocked",
        "criticality": "high",
        "risk_notes": "blocked",
        "next_followup_at": datetime.utcnow(),
    }
    risk = _thread_out(doc, True)
    assert "messages" not in risk
    assert "cliq_chat_id" not in risk
    assert risk["reply_count"] == 1
    full = _thread_out(doc, False)
    assert full["messages"] and full["cliq_chat_id"] == "c1"


# ── scheduler follow-ups (§8.4 / §11) ───────────────────────────────────────


def test_check_cliq_followups_nudges_and_reschedules(monkeypatch):
    sent = []

    async def fake_send(self, email, text, buttons=None, org_id=""):
        sent.append(email)
        return {"chat_id": "z1"}

    monkeypatch.setattr("app.core.zoho.cliq.ZohoCliq.send_dm", fake_send)
    db = FakeDB()
    db.tasks.insert_one(_task(due_days=5))
    db.task_followups.insert_one(_thread())

    asyncio.run(sched.check_cliq_followups(db))

    thread = db.task_followups.docs[0]
    assert sent == ["dev@x.com"]
    assert thread["nudge_count"] == 1
    assert thread["last_send_error"] == ""
    assert thread["next_followup_at"] > datetime.utcnow()


def test_check_cliq_followups_survives_send_failure(monkeypatch):
    async def fake_send(self, email, text, buttons=None, org_id=""):
        return None

    monkeypatch.setattr("app.core.zoho.cliq.ZohoCliq.send_dm", fake_send)
    db = FakeDB()
    db.tasks.insert_one(_task(due_days=5))
    db.task_followups.insert_one(_thread())

    asyncio.run(sched.check_cliq_followups(db))

    thread = db.task_followups.docs[0]
    assert thread["nudge_count"] == 0
    assert thread["last_send_error"] == "send_failed"
    assert thread["next_followup_at"] > datetime.utcnow()


def test_check_cliq_followups_bumps_overdue_escalation(monkeypatch):
    async def fake_send(self, email, text, buttons=None, org_id=""):
        return {"chat_id": "z1"}

    monkeypatch.setattr("app.core.zoho.cliq.ZohoCliq.send_dm", fake_send)
    db = FakeDB()
    db.tasks.insert_one(_task(due_days=-3, priority="low"))
    db.task_followups.insert_one(_thread())

    asyncio.run(sched.check_cliq_followups(db))

    assert db.tasks.docs[0]["escalation_level"] == 2
    assert db.task_followups.docs[0]["status"] == "overdue"


def test_check_cliq_followups_noop_when_disabled(monkeypatch):
    sent = []

    async def fake_send(self, email, text, buttons=None, org_id=""):
        sent.append(email)
        return {"chat_id": "z1"}

    monkeypatch.setattr("app.core.zoho.cliq.ZohoCliq.send_dm", fake_send)
    monkeypatch.setattr("app.core.zoho.cliq.settings.ZOHO_CLIQ_ENABLED", False)
    db = FakeDB()
    db.tasks.insert_one(_task(due_days=-3, priority="high"))
    db.task_followups.insert_one(_thread())

    asyncio.run(sched.check_cliq_followups(db))

    thread = db.task_followups.docs[0]
    assert sent == []
    assert thread["nudge_count"] == 0
    assert thread["last_nudge_at"] is None
    assert thread["status"] == "assigned"
    assert db.tasks.docs[0].get("escalation_level") is None


# ── summarize ───────────────────────────────────────────────────────────────


def test_summarize_thread_marks_summarized(monkeypatch):
    async def fake_send(self, email, text, buttons=None, org_id=""):
        return {"chat_id": "z1"}

    monkeypatch.setattr("app.core.zoho.cliq.ZohoCliq.send_dm", fake_send)
    db = FakeDB()
    db.task_followups.insert_one(
        _thread(messages=[{"dir": "in", "text": "blocked", "intent": "blocked"}])
    )

    result = asyncio.run(tia.summarize_thread(db, "th1"))

    thread = db.task_followups.docs[0]
    assert result["summarized"] is True
    assert thread["summarized"] is True
    assert any(m.get("intent") == "summary" for m in thread["messages"])
