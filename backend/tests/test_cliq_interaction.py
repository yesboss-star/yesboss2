"""Phase 1 — Communication / Task Interaction Agent tests (additive).

Uses a tiny in-memory fake Mongo so the agent can be exercised without a live DB
and without any Zoho Cliq bot configured (stub mode).
"""

import asyncio
from datetime import datetime, timedelta

import pytest

from app.agents import task_interaction_agent as tia
from app.agents.communication_agent import (
    extract_sender_email,
    normalize_input,
    resolve_identity,
    route,
)

# ── fake Mongo ──────────────────────────────────────────────────────────────


class _Result:
    def __init__(self, inserted_id=None):
        self.inserted_id = inserted_id
        self.modified_count = 1


class _Collection:
    def __init__(self):
        self.docs = []

    def _match(self, doc, flt):
        for k, v in flt.items():
            if k == "$or":
                if not any(self._match(doc, f) for f in v):
                    return False
                continue
            if isinstance(v, dict):
                if "$nin" in v and doc.get(k) in v["$nin"]:
                    return False
                if "$in" in v and doc.get(k) not in v["$in"]:
                    return False
                continue
            if doc.get(k) != v:
                return False
        return True

    def find_one(self, flt, *args, **kwargs):
        matches = [d for d in self.docs if self._match(d, flt)]
        sort = kwargs.get("sort")
        if sort:
            for key, direction in reversed(list(sort)):
                matches.sort(key=lambda d: (d.get(key) is None, d.get(key)), reverse=direction < 0)
        return matches[0] if matches else None

    def find(self, flt=None, *args, **kwargs):
        flt = flt or {}
        return [d for d in self.docs if self._match(d, flt)]

    def insert_one(self, doc):
        doc = dict(doc)
        doc.setdefault("_id", f"id{len(self.docs) + 1}")
        self.docs.append(doc)
        return _Result(doc["_id"])

    def update_one(self, flt, update, upsert=False):
        for d in self.docs:
            if self._match(d, flt):
                d.update(update.get("$set", {}))
                return _Result()
        if upsert:
            new = dict(flt)
            new.update(update.get("$set", {}))
            self.docs.append(new)
        return _Result()


class FakeDB:
    def __init__(self):
        self._c = {}

    def __getitem__(self, name):
        return self._c.setdefault(name, _Collection())

    def __getattr__(self, name):
        return self[name]


def _task(title="Ship release", due_days=3, priority="medium", org="org1"):
    return {
        "_id": "t1",
        "title": title,
        "organization_id": org,
        "priority": priority,
        "due_date": (datetime.utcnow() + timedelta(days=due_days)).isoformat(),
    }


# ── classification ──────────────────────────────────────────────────────────


def test_classify_reply_intents():
    assert tia.classify_reply("Done, shipped it")["intent"] == "completed"
    assert tia.classify_reply("I'm blocked by the API keys")["intent"] == "blocked"
    assert tia.classify_reply("Can I get an extension?")["intent"] == "extension_requested"
    assert tia.classify_reply("Started working on it")["intent"] == "started"
    assert tia.classify_reply("Making progress, halfway there")["intent"] == "progress"
    assert tia.classify_reply("hmm ok sure")["intent"] == "unclear"


def test_classify_reply_negated_start_is_unclear():
    assert tia.classify_reply("I have not started yet")["intent"] == "unclear"


def test_classify_blocked_severity_high():
    c = tia.classify_reply("blocked")
    assert c["blocker_severity"] == "high"
    assert c["suggested_criticality"] == "high"


# ── criticality + cadence ───────────────────────────────────────────────────


def test_evaluate_criticality_overdue_critical_priority():
    task = {
        "priority": "critical",
        "due_date": (datetime.utcnow() - timedelta(days=2)).isoformat(),
    }
    crit = tia.evaluate_criticality(task, {"status": "blocked", "nudge_count": 1})
    assert crit["criticality"] == "critical"
    assert crit["risk_score"] >= 80


def test_evaluate_criticality_low_for_calm_task():
    task = {"priority": "low", "due_date": (datetime.utcnow() + timedelta(days=10)).isoformat()}
    crit = tia.evaluate_criticality(task, {"status": "in_progress", "nudge_count": 0})
    assert crit["criticality"] == "low"


def test_compute_next_followup_clamped_to_due_window():
    now = datetime.utcnow()
    due = now + timedelta(hours=3)
    nxt = tia.compute_next_followup("critical", "in_progress", due.isoformat(), 0, now)
    # critical would be +2h, but cap is due-2h = +1h.
    assert abs((nxt - (now + timedelta(hours=1))).total_seconds()) < 5


def test_compute_next_followup_defaults():
    now = datetime.utcnow()
    assert tia.compute_next_followup("low", "in_progress", None, 0, now) - now == timedelta(hours=48)
    assert tia.compute_next_followup("critical", "in_progress", None, 0, now) - now == timedelta(hours=2)


# ── lifecycle ───────────────────────────────────────────────────────────────


def test_on_task_assigned_creates_thread_and_links_task():
    db = FakeDB()
    db.tasks.insert_one(_task())
    thread_id = asyncio.run(tia.on_task_assigned(db, db.tasks.docs[0], "Dev@X.com"))
    assert thread_id == "id1"
    assert len(db.task_followups.docs) == 1
    thread = db.task_followups.docs[0]
    assert thread["assignee_email"] == "dev@x.com"
    assert thread["status"] == "assigned"
    assert db.tasks.docs[0]["cliq_thread_id"] == "id1"


def test_on_task_assigned_opens_ack_window():
    db = FakeDB()
    db.tasks.insert_one(_task())
    asyncio.run(tia.on_task_assigned(db, db.tasks.docs[0], "dev@x.com"))
    thread = db.task_followups.docs[0]
    delta = thread["next_followup_at"] - datetime.utcnow()
    assert timedelta(hours=3, minutes=58) < delta < timedelta(hours=4, minutes=2)


def test_on_task_assigned_idempotent():
    db = FakeDB()
    db.tasks.insert_one(_task())
    a = asyncio.run(tia.on_task_assigned(db, db.tasks.docs[0], "dev@x.com"))
    b = asyncio.run(tia.on_task_assigned(db, db.tasks.docs[0], "dev@x.com"))
    assert a == b
    assert len(db.task_followups.docs) == 1


def test_on_task_assigned_skips_bad_email():
    db = FakeDB()
    db.tasks.insert_one(_task())
    assert asyncio.run(tia.on_task_assigned(db, db.tasks.docs[0], "not-an-email")) is None
    assert len(db.task_followups.docs) == 0


def test_on_task_assigned_records_send_failure_and_notifies():
    db = FakeDB()
    db.tasks.insert_one(_task())
    asyncio.run(tia.on_task_assigned(db, db.tasks.docs[0], "dev@x.com"))
    thread = db.task_followups.docs[0]
    # No OAuth token in the fake DB -> Cliq DM is skipped and surfaced on the thread.
    assert thread["last_send_error"] == "send_failed"
    notifs = db.notifications.docs
    assert len(notifs) == 1
    assert notifs[0]["type"] == "cliq_followup"
    assert "dev@x.com" == notifs[0]["user_id"]


# ── ZohoCliq ZUID resolution ────────────────────────────────────────────────


class _FakeResp:
    def __init__(self, status_code=200, json_data=None, text=""):
        self.status_code = status_code
        self._json = json_data or {}
        self.text = text

    def json(self):
        return self._json


class _FakeAsyncClient:
    last_get = {}
    last_post = {}

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, url, params=None, headers=None):
        _FakeAsyncClient.last_get = {"url": url, "params": params, "headers": headers}
        return _FakeResp(200, {"data": [{"id": "zuid-123", "email": "dev@x.com"}]})

    async def post(self, url, json=None, headers=None):
        _FakeAsyncClient.last_post = {"url": url, "json": json, "headers": headers}
        return _FakeResp(200, {"chat_id": "c1", "message_id": "m1"})


def test_send_dm_resolves_email_to_zuid(monkeypatch):
    from app.core.zoho import cliq as cliq_mod

    cliq_mod._ZUID_CACHE.clear()
    monkeypatch.setattr(cliq_mod.httpx, "AsyncClient", lambda *a, **k: _FakeAsyncClient())
    monkeypatch.setattr(cliq_mod.settings, "ZOHO_CLIQ_BOT_ID", "yesboss")
    monkeypatch.setattr(cliq_mod.settings, "ZOHO_CLIQ_ENABLED", True)

    db = FakeDB()
    db.zoho_tokens.insert_one({
        "user_id": "owner",
        "org_id": "org1",
        "access_token": "tok",
        "expires_at": (datetime.utcnow() + timedelta(hours=1)).isoformat(),
    })
    res = asyncio.run(cliq_mod.ZohoCliq(db).send_dm("dev@x.com", "hi", org_id="org1"))
    assert res and res["chat_id"] == "c1"
    assert _FakeAsyncClient.last_post["json"]["userids"] == "zuid-123"


def test_send_card_includes_three_buttons(monkeypatch):
    from app.core.zoho import cliq as cliq_mod

    cliq_mod._ZUID_CACHE.clear()
    monkeypatch.setattr(cliq_mod.httpx, "AsyncClient", lambda *a, **k: _FakeAsyncClient())
    monkeypatch.setattr(cliq_mod.settings, "ZOHO_CLIQ_BOT_ID", "yesboss")
    monkeypatch.setattr(cliq_mod.settings, "ZOHO_CLIQ_ENABLED", True)
    monkeypatch.setattr(cliq_mod.settings, "ZOHO_CLIQ_BUTTON_FUNCTION", "yesboss_task_action")

    db = FakeDB()
    db.zoho_tokens.insert_one({
        "user_id": "owner",
        "org_id": "org1",
        "access_token": "tok",
        "expires_at": (datetime.utcnow() + timedelta(hours=1)).isoformat(),
    })
    res = asyncio.run(
        cliq_mod.ZohoCliq(db).send_card("dev@x.com", "Title", "Body", task_id="t1", org_id="org1")
    )
    assert res and res["chat_id"] == "c1"
    buttons = _FakeAsyncClient.last_post["json"]["buttons"]
    assert [b["arguments"]["action"] for b in buttons] == ["started", "blocked", "extension"]
    assert all(b["action"]["type"] == "invoke.function" for b in buttons)
    assert all(b["action"]["data"]["name"] == "yesboss_task_action" for b in buttons)
    assert all(b["arguments"]["task_id"] == "t1" for b in buttons)


def test_send_dm_without_token_is_skipped(monkeypatch):
    from app.core.zoho import cliq as cliq_mod

    monkeypatch.setattr(cliq_mod.settings, "ZOHO_CLIQ_BOT_ID", "yesboss")
    monkeypatch.setattr(cliq_mod.settings, "ZOHO_CLIQ_ENABLED", True)
    assert asyncio.run(cliq_mod.ZohoCliq(FakeDB()).send_dm("dev@x.com", "hi", org_id="")) is None


def test_extract_send_result_shapes():
    from app.core.zoho import cliq as cliq_mod

    nested = cliq_mod._extract_send_result({"data": {"chat_id": "c9", "message_id": "m9"}})
    assert nested == {"chat_id": "c9", "message_id": "m9"}
    assert cliq_mod._extract_send_result({"chat_id": "flat"})["chat_id"] == "flat"
    # Real Cliq bot-DM 200 body: no chat id, just delivered recipients.
    assert cliq_mod._extract_send_result({"user_ids": ["931"], "users": ["931"]})["chat_id"] == "931"
    assert cliq_mod._extract_send_result(None) == {"chat_id": "", "message_id": ""}


def test_on_reply_updates_status_and_risk():
    db = FakeDB()
    db.tasks.insert_one(_task(priority="critical", due_days=-1, org=""))
    thread_id = asyncio.run(tia.on_task_assigned(db, db.tasks.docs[0], "dev@x.com"))
    thread = db.task_followups.docs[0]
    res = asyncio.run(tia.on_reply(db, thread, "I'm blocked by API keys", cliq_msg_id="m1"))
    assert res["intent"] == "blocked"
    assert res["status"] == "blocked"
    assert res["criticality"] in ("high", "critical")
    assert thread["next_followup_at"] is not None
    assert len(thread["messages"]) == 1
    assert thread_id


@pytest.mark.parametrize(
    "text,expected_status",
    [
        ("Started working on it", tia.STATUS_IN_PROGRESS),
        ("Making progress, halfway there", tia.STATUS_IN_PROGRESS),
        ("I'm blocked by the API keys", tia.STATUS_BLOCKED),
        ("Can I get an extension?", tia.STATUS_EXTENSION),
        ("Done, shipped it", tia.STATUS_COMPLETED),
        ("hmm ok sure", tia.STATUS_ACKNOWLEDGED),
    ],
)
def test_on_reply_intent_lifecycle(text, expected_status):
    db = FakeDB()
    db.tasks.insert_one(_task(org=""))
    asyncio.run(tia.on_task_assigned(db, db.tasks.docs[0], "dev@x.com"))
    thread = db.task_followups.docs[0]
    res = asyncio.run(tia.on_reply(db, thread, text, cliq_msg_id=f"m-{expected_status}"))
    assert res["deduped"] is False
    assert res["status"] == expected_status
    assert res["criticality"] in ("low", "medium", "high", "critical")
    assert thread["next_followup_at"] is not None
    assert thread["last_reply_at"] is not None
    assert len(thread["messages"]) == 1


def test_on_reply_dedupes_by_cliq_msg_id():
    db = FakeDB()
    db.tasks.insert_one(_task(org=""))
    asyncio.run(tia.on_task_assigned(db, db.tasks.docs[0], "dev@x.com"))
    thread = db.task_followups.docs[0]
    asyncio.run(tia.on_reply(db, thread, "started", cliq_msg_id="dup1"))
    again = asyncio.run(tia.on_reply(db, thread, "started", cliq_msg_id="dup1"))
    assert again["deduped"] is True
    assert len(thread["messages"]) == 1


def test_on_button_sets_in_progress():
    db = FakeDB()
    db.tasks.insert_one(_task(org=""))
    asyncio.run(tia.on_task_assigned(db, db.tasks.docs[0], "dev@x.com"))
    thread = db.task_followups.docs[0]
    res = asyncio.run(tia.on_button(db, thread, "started"))
    assert res["status"] == "in_progress"
    assert thread["status"] == "in_progress"


def test_escalate_risk_summary_noop_without_db():
    assert asyncio.run(tia.escalate_risk_summary(None, {})) is None


# ── communication agent ─────────────────────────────────────────────────────


def test_normalize_input_cliq_reply():
    n = normalize_input({"sender": {"email": "a@x.com"}, "message": {"text": "done", "id": "m9"}})
    assert n["text"] == "done"
    assert n["modality"] == "text"
    assert n["cliq_msg_id"] == "m9"


def test_normalize_input_button():
    n = normalize_input({"button": {"payload": {"task_id": "t1", "action": "blocked"}}})
    assert n["modality"] == "button"
    assert n["button_action"] == "blocked"
    assert n["button_task_id"] == "t1"


def test_extract_sender_email():
    assert extract_sender_email({"sender": {"email": "a@x.com"}}) == "a@x.com"
    assert extract_sender_email({}) == ""


def test_resolve_identity_unknown_sender():
    ident = resolve_identity(FakeDB(), "ghost@x.com")
    assert ident["email"] == "ghost@x.com"
    assert ident["org_id"] == ""


def test_route_button_to_open_thread():
    db = FakeDB()
    db.tasks.insert_one(_task(org=""))
    asyncio.run(tia.on_task_assigned(db, db.tasks.docs[0], "dev@x.com"))
    normalized = normalize_input({"button": {"payload": {"task_id": "t1", "action": "blocked"}}})
    ident = {"uid": "dev@x.com", "email": "dev@x.com", "org_id": ""}
    res = asyncio.run(route(db, normalized, ident))
    assert res["routed"] is True
    assert res["kind"] == "button"
    assert db.task_followups.docs[0]["status"] == "blocked"


def test_route_reply_without_thread_is_not_routed():
    db = FakeDB()
    normalized = normalize_input({"sender": {"email": "nobody@x.com"}, "message": {"text": "hello"}})
    ident = {"uid": "nobody@x.com", "email": "nobody@x.com", "org_id": ""}
    res = asyncio.run(route(db, normalized, ident))
    assert res["routed"] is False


def test_route_text_reply_targets_latest_open_thread():
    db = FakeDB()
    older = _task(title="Older task", org="")
    older["_id"] = "ta"
    newer = _task(title="Newer task", org="")
    newer["_id"] = "tb"
    db.tasks.insert_one(older)
    db.tasks.insert_one(newer)
    asyncio.run(tia.on_task_assigned(db, db.tasks.docs[0], "dev@x.com"))
    asyncio.run(tia.on_task_assigned(db, db.tasks.docs[1], "dev@x.com"))
    old_thread, new_thread = db.task_followups.docs
    old_thread["updated_at"] = datetime.utcnow() - timedelta(minutes=5)
    new_thread["updated_at"] = datetime.utcnow()

    normalized = normalize_input(
        {"sender": {"email": "dev@x.com"}, "message": {"text": "started", "id": "m-latest"}}
    )
    ident = {"uid": "dev@x.com", "email": "dev@x.com", "org_id": ""}
    res = asyncio.run(route(db, normalized, ident))
    assert res["routed"] is True
    assert res["kind"] == "reply"
    assert new_thread["status"] == tia.STATUS_IN_PROGRESS
    assert old_thread["status"] == tia.STATUS_ASSIGNED


def test_notify_cliq_assignments_dispatches_only_emails(monkeypatch):
    calls = []

    async def _fake(db, task_doc, email):
        calls.append(email)
        return "tid"

    monkeypatch.setattr(tia, "on_task_assigned", _fake)

    async def _run():
        tia.notify_cliq_assignments(
            object(),
            {
                "_id": "1",
                "assignee_id": ["A@x.com", "not-an-email", "a@x.com", None],
                "assignee_email": "b@x.com",
            },
        )
        await asyncio.sleep(0)

    asyncio.run(_run())
    assert sorted(calls) == ["a@x.com", "b@x.com"]


def test_notify_cliq_assignments_noop_without_db_or_assignee(monkeypatch):
    calls = []

    async def _fake(db, task_doc, email):
        calls.append(email)

    monkeypatch.setattr(tia, "on_task_assigned", _fake)

    async def _run():
        tia.notify_cliq_assignments(None, {"_id": "1", "assignee_email": "a@x.com"})
        tia.notify_cliq_assignments(object(), {"_id": "2", "assignee_id": ["uuid-123"]})
        await asyncio.sleep(0)

    asyncio.run(_run())
    assert calls == []
