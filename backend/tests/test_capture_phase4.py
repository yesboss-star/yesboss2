"""Phase 4: trends, Hindi / Hinglish, forwarded email, Cliq capture, and the analysis sweeper (offline)."""
import asyncio
import base64
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import app.core.capture_analysis as ca
import app.core.capture_intake as ci
import app.core.capture_metrics as cm
import app.core.commitments as cmt
import app.core.database as database
from app.api import zoho_cliq
from app.core.config import settings
from app.core.indic import ascii_digits, english_terms
from app.dependencies.auth import get_current_user
from app.main import app

API = "/api/v1/captures"
INBOX = "/api/v1/capture-inbox"
OWNER = ("owner-uid-1", "owner@test.local")
EMP = ("emp-uid", "emp@test.local")
MGR = ("mgr-uid", "mgr@test.local")
NOW = datetime.utcnow
SECRET = {"X-Capture-Secret": "s3cret"}


class U:
    def __init__(self, uid, email):
        self.id = uid
        self.uid = uid
        self.email = email
        self.custom_claims = {}


@pytest.fixture
def world(offline_db, monkeypatch, tmp_path):
    o = offline_db
    monkeypatch.chdir(tmp_path)  # attachments are saved under ./uploads
    monkeypatch.setattr(settings, "CAPTURE_AUTO_ANALYZE", False)
    monkeypatch.setattr(settings, "CAPTURE_INBOUND_SECRET", "s3cret")
    monkeypatch.setattr(settings, "CAPTURE_INBOUND_DOMAIN", "capture.test")
    monkeypatch.setattr(settings, "ZOHO_CLIQ_TEST_EMAILS", "")
    monkeypatch.setattr(ca, "llm_available", lambda: False)
    o.db.org_chart_members.update_one({"organization_id": o.org, "email": EMP[1]}, {"$set": {"full_name": "Emma Employee"}})
    who = {"u": None}

    def current():
        if who["u"] is None:
            raise HTTPException(status_code=401, detail="Not authenticated")
        return who["u"]

    app.dependency_overrides[get_current_user] = current

    class W:
        db = o.db
        org = o.org
        c = TestClient(app)
        tmp = tmp_path

        @staticmethod
        def login(person):
            who["u"] = U(*person) if person else None

        @staticmethod
        def token(person=EMP):
            W.login(person)
            r = W.c.get(f"{INBOX}/address")
            assert r.status_code == 200, r.text
            return r.json()["address"].split("+")[1].split("@")[0]

        @staticmethod
        def email(token, headers=SECRET, **fields):
            body = {"to": f"capture+{token}@capture.test", "from": "someone@example.test", "subject": "Fwd: Weekly sync",
                    "text": "Please remember the supplier call", **fields}
            return W.c.post(f"{INBOX}/email", json=body, headers=headers)

        @staticmethod
        def captures(person=EMP):
            return list(W.db.captures.find({"user_id": person[0]}).sort("created_at", 1))

    yield W
    app.dependency_overrides.pop(get_current_user, None)


# ================================================================ trends
def _series(world, values, *, visibility="org", user=EMP[0], series="weekly-sales", metric="revenue", unit="INR"):
    start = NOW() - timedelta(days=7 * len(values))
    for i, value in enumerate(values):
        when = start + timedelta(days=7 * i)
        cid = world.db.captures.insert_one({"org_id": world.org, "user_id": user, "kind": "report", "visibility": visibility,
                                            "title": f"Weekly Sales {i}", "series_key": series, "created_at": when,
                                            "shared_with_emails": []}).inserted_id
        world.db.report_metrics.insert_one({"org_id": world.org, "capture_id": cid, "series_key": series, "metric": metric,
                                            "unit": unit, "value": value, "period_date": when.date().isoformat(), "at": when})


def _trends(world, person=OWNER, scope="company"):
    world.login(person)
    r = world.c.get("/api/v1/weekly-review", params={"organization_id": world.org, "scope": scope})
    assert r.status_code == 200, r.text
    return r.json()["review"]["trends"]


def test_a_rising_number_is_called_out_with_its_points(world):
    _series(world, [4.0e7, 4.1e7, 4.2e7, 4.4e7])
    (t,) = _trends(world)
    assert (t["metric"], t["direction"], t["streak"], t["note"]) == ("revenue", "up", 3, "Highest of the last 4 reports")
    assert [p["display"] for p in t["points"]] == ["₹4 crore", "₹4.1 crore", "₹4.2 crore", "₹4.4 crore"]
    assert t["change_pct"] == pytest.approx(0.10) and t["points"][-1]["capture"]["title"] == "Weekly Sales 3"


def test_streaks_lows_and_flat_lines(world):
    _series(world, [5, 4, 3], metric="orders", unit="count")
    _series(world, [4, 6, 5, 3], metric="leads", unit="count")
    _series(world, [4, 4, 4], metric="visits", unit="count")
    rows = {t["metric"]: t for t in _trends(world)}
    assert rows["orders"]["note"] == "Down 2 reports in a row" and rows["orders"]["direction"] == "down"
    assert rows["leads"]["note"] == "Lowest of the last 4 reports"
    assert rows["visits"]["direction"] == "flat" and rows["visits"]["note"] is None and rows["visits"]["streak"] == 0


def test_a_trend_needs_three_reports_and_shows_the_last_eight(world):
    _series(world, [1, 2], metric="short", unit="count")
    _series(world, list(range(1, 13)), metric="long", unit="count")
    rows = {t["metric"]: t for t in _trends(world)}
    assert "short" not in rows and len(rows["long"]["points"]) == 8 and rows["long"]["points"][0]["value"] == 5


def test_private_reports_make_trends_only_for_their_author(world):
    _series(world, [1, 2, 3, 4], visibility="private")
    assert _trends(world, OWNER, "company") == []
    assert _trends(world, MGR, "personal") == []
    assert len(_trends(world, EMP, "personal")) == 1


# ================================================================ Hindi and Hinglish
def test_hindi_and_hinglish_business_words_are_read_as_english_for_matching_only():
    assert english_terms("बिक्री ₹2.5 करोड़") == "sales ₹2.5 crore"
    assert english_terms("Bikri kyun gir gayi?") == "sales why gir gayi?"
    assert english_terms("कार्य सूची") == "action items"
    assert ascii_digits("०५/१२/२०२६") == "05/12/2026"
    assert english_terms("") == "" and english_terms("plain English stays") == "plain english stays"


HINDI_MOM = """मीटिंग के मिनट्स
उपस्थित: प्रिया, राहुल
एजेंडा: बिक्री की समीक्षा
निर्णय: बिक्री ₹2.5 करोड़ तक बढ़ाना
कार्य: ग्राहक को कोटेशन भेजना 05/12/2026 तक
- [ ] रिपोर्ट भेजना ०९/१२/२०२६ तक
"""


def test_hindi_meeting_notes_are_recognised_and_their_actions_found():
    ctx = {"goals": [], "tasks": [], "members": [], "captures": []}
    result = ca.rules_analyze({"text": HINDI_MOM, "title": None, "source": "text", "kind": "note"}, ctx)
    assert result["kind"] == "mom" and result["kind_confidence"] >= 0.7
    titles = {s["title"]: s["due_date"] for s in result["suggestions"]}
    assert titles == {"ग्राहक को कोटेशन भेजना": "2026-12-05T23:59:59", "रिपोर्ट भेजना": "2026-12-09T23:59:59"}
    assert "₹2.5 crore" in result["entities"]["amounts"] and "sales" in result["entities"]["kpis"]


def test_a_currency_word_inside_another_word_is_not_an_amount():
    ctx = {"goals": [], "tasks": [], "members": [], "captures": []}
    text = "Columns: Week Revenue Orders 0 2026-10-19 39000000 and Rs 2.5 crore"
    amounts = ca.rules_analyze({"text": text, "title": None, "source": "text", "kind": "note"}, ctx)["entities"]["amounts"]
    assert amounts == ["rs 2.5 crore"]


def test_a_spreadsheet_is_a_report_even_before_its_text_is_read():
    ctx = {"goals": [], "tasks": [], "members": [], "captures": []}
    sheet = {"text": "", "title": "weekly.xlsx", "source": "file", "kind": "note"}
    assert ca.rules_analyze(sheet, ctx)["kind"] == "report"
    assert ca.rules_analyze({**sheet, "title": "photo.png"}, ctx)["kind"] == "note"  # no rule for pictures


def test_hinglish_text_is_sorted_and_questions_are_spotted():
    ctx = {"goals": [], "tasks": [], "members": [], "captures": []}
    def kind(text):
        return ca.rules_analyze({"text": text, "title": None, "source": "text", "kind": "note"}, ctx)["kind"]
    assert kind("Meeting ke minutes: attendees Priya, agenda bikri review, decisions neeche") == "mom"
    assert kind("Bikri kyun gir gayi is mahine?") == "question"
    assert kind("क्या हम अगले महीने नया ऑफिस ले सकते हैं") == "question"


def test_hindi_numbers_and_units_are_read_from_reports():
    rows = {r["metric"]: r for r in cm.metrics_from_text("बिक्री: ₹4.1 करोड़\nखर्च 80 लाख\nराजस्व 5 प्रतिशत बढ़ा")}
    assert rows["sales"]["value"] == pytest.approx(4.1e7) and rows["sales"]["unit"] == "INR"
    assert rows["expenses"]["value"] == pytest.approx(8e6)


def test_hindi_goals_and_titles_link_and_the_stored_text_is_untouched():
    assert cmt.infer_metric_goal("बिक्री बढ़ाना") == ("sales", "up")
    assert cmt.infer_metric_goal("खर्च कम करना") == ("expenses", "down")
    assert "बिक्री" in ca._tokens("बिक्री पाइपलाइन समीक्षा") and ca._tokens("यह एक है") == set()
    ctx = {"goals": [{"id": "g1", "title": "बिक्री पाइपलाइन समीक्षा"}], "tasks": [], "members": [], "captures": []}
    result = ca.rules_analyze({"text": "आज बिक्री पाइपलाइन समीक्षा पूरी हुई", "title": None, "source": "text", "kind": "note"}, ctx)
    assert [lk["id"] for lk in result["links"]] == ["g1"]


def test_a_hindi_capture_goes_through_the_whole_flow_with_its_text_unchanged(world):
    world.login(EMP)
    r = world.c.post(API, json={"organization_id": world.org, "text": HINDI_MOM, "source": "voice"})
    cid = r.json()["capture"]["id"]
    cap = world.c.post(f"{API}/{cid}/analyze", params={"wait": "true"}).json()["capture"]
    assert cap["kind"] == "mom" and cap["text"] == HINDI_MOM.strip() and len(cap["suggestions"]) == 2


# ================================================================ forwarded email
def test_the_email_webhook_is_off_without_a_secret_and_refuses_the_wrong_one(world, monkeypatch):
    token = world.token()
    assert world.email(token, headers={}).status_code == 403
    assert world.email(token, headers={"X-Capture-Secret": "nope"}).status_code == 403
    assert world.c.post(f"{INBOX}/email?secret=s3cret", json={"to": f"capture+{token}@capture.test", "text": "via query"}).status_code == 200
    monkeypatch.setattr(settings, "CAPTURE_INBOUND_SECRET", "")
    assert world.email(token).status_code == 404


def test_everyone_gets_their_own_stable_address_and_can_replace_it(world):
    mine = world.token(EMP)
    assert world.token(EMP) == mine and world.token(MGR) != mine
    world.login(EMP)
    info = world.c.get(f"{INBOX}/address").json()
    assert info["enabled"] is True and info["address"] == f"capture+{mine}@capture.test" and info["needs_domain"] is False
    new = world.c.post(f"{INBOX}/address/regenerate").json()["address"].split("+")[1].split("@")[0]
    assert new != mine
    assert world.email(mine).json()["captured"] == 0 and world.email(new).json()["captured"] == 1  # the old one is dead


def test_the_address_is_only_shown_when_the_server_is_set_up(world, monkeypatch):
    world.login(EMP)
    monkeypatch.setattr(settings, "CAPTURE_INBOUND_SECRET", "")
    assert world.c.get(f"{INBOX}/address").json() == {"enabled": False, "address": None, "needs_domain": False}
    assert world.c.post(f"{INBOX}/address/regenerate").status_code == 404
    monkeypatch.setattr(settings, "CAPTURE_INBOUND_SECRET", "s3cret")
    monkeypatch.setattr(settings, "CAPTURE_INBOUND_DOMAIN", "")
    info = world.c.get(f"{INBOX}/address").json()
    assert info["address"] is None and info["needs_domain"] is True


def test_a_forwarded_email_becomes_a_private_note_for_the_right_person(world):
    token = world.token(EMP)
    r = world.email(token, **{"from": OWNER[1], "message-id": "<m1@mail>"})  # the From header is ignored
    assert r.json() == {"ok": True, "captured": 1, "skipped": []}
    (cap,) = world.captures(EMP)
    assert (cap["title"], cap["text"], cap["source"], cap["visibility"], cap["org_id"]) == (
        "Weekly sync", "Please remember the supplier call", "email", "private", world.org)
    assert world.captures(OWNER) == [] and cap["kind"] == "note" and cap["shared_with"] == []
    world.login(MGR)
    assert world.c.get(f"{API}/{cap['_id']}").status_code == 404  # private means private


def test_unknown_or_malformed_addresses_capture_nothing_but_do_not_error(world):
    world.token(EMP)
    for to in ("capture+" + "0" * 32 + "@capture.test", "someone@capture.test", "", "capture+short@capture.test"):
        assert world.c.post(f"{INBOX}/email", json={"to": to, "text": "hello"}, headers=SECRET).json() == {"ok": True, "captured": 0}
    assert world.db.captures.count_documents({}) == 0


def test_the_same_email_delivered_twice_is_saved_once(world):
    token = world.token(EMP)
    assert world.email(token, **{"message-id": "<dup@mail>"}).json()["captured"] == 1
    assert world.email(token, **{"message-id": "<dup@mail>"}).json()["captured"] == 0
    assert world.email(token, **{"message-id": "<other@mail>"}).json()["captured"] == 1
    assert len(world.captures(EMP)) == 2


def test_an_email_with_only_html_is_turned_into_text(world):
    token = world.token(EMP)
    body = {"to": f"capture+{token}@capture.test", "subject": "RE: FW: Plan", "html":
            "<style>p{color:red}</style><p>Call <b>Acme</b> &amp; confirm</p><script>alert(1)</script><div>Thanks</div>"}
    world.c.post(f"{INBOX}/email", json=body, headers=SECRET)
    (cap,) = world.captures(EMP)
    assert cap["title"] == "Plan" and cap["text"] == "Call Acme & confirm\nThanks" and "<" not in cap["text"]


def test_a_report_attached_to_an_email_is_stored_analysed_and_read_as_data(world):
    token = world.token(EMP)
    csv = b"Week,Revenue\n2026-10-26,40000000\n2026-11-02,44000000\n"
    r = world.c.post(f"{INBOX}/email", headers=SECRET,
                     data={"to": f"capture+{token}@capture.test", "subject": "Weekly sales", "text": "", "message-id": "<a1@mail>"},
                     files=[("attachment-1", ("weekly sales.csv", csv, "text/csv"))])
    assert r.json()["captured"] == 1, r.text
    (cap,) = world.captures(EMP)
    assert cap["source"] == "file" and cap["title"] == "weekly sales.csv" and cap["raw_ref"]["type"] == "file"
    doc = world.db.documents.find_one({"file_id": cap["raw_ref"]["id"]})
    assert doc["org_id"] == world.org and doc["user_id"] == EMP[0] and "Revenue" in doc["text"]
    assert "Revenue" in cap["text"]  # the capture keeps the same preview of the file the app keeps for uploads
    assert (world.tmp / doc["file_path"]).read_bytes() == csv

    world.login(EMP)
    analysed = world.c.post(f"{API}/{cap['_id']}/analyze", params={"wait": "true"}).json()["capture"]
    assert analysed["kind"] == "report"
    values = {m["value"] for m in world.db.report_metrics.find({"capture_id": cap["_id"]})}
    assert values == {40000000, 44000000}


def test_attachments_in_json_and_unsupported_or_oversized_ones(world, monkeypatch):
    token = world.token(EMP)
    monkeypatch.setattr(ci, "MAX_ATTACHMENT_BYTES", 50)
    good = {"filename": "notes.txt", "content_base64": base64.b64encode(b"minutes of meeting: attendees, agenda").decode()}
    big = {"filename": "big.txt", "content_base64": base64.b64encode(b"x" * 200).decode()}
    bad = {"filename": "setup.exe", "content_base64": base64.b64encode(b"MZ").decode()}
    r = world.email(token, text="", attachments=[good, big, bad, "junk", {"filename": "x.txt", "content_base64": "!!"}]).json()
    assert r["captured"] == 1
    assert sorted(s.split(":")[0] for s in r["skipped"]) == ["big.txt", "setup.exe"]
    assert world.db.documents.count_documents({}) == 1


def test_only_the_first_three_attachments_are_read(world):
    token = world.token(EMP)
    files = [{"filename": f"n{i}.txt", "content_base64": base64.b64encode(f"note {i}".encode()).decode()} for i in range(5)]
    r = world.email(token, text="", attachments=files).json()
    assert r["captured"] == 3 and len(r["skipped"]) == 2


def test_a_forwarding_loop_cannot_flood_an_inbox(world, monkeypatch):
    token = world.token(EMP)
    monkeypatch.setattr(ci, "PER_HOUR_LIMIT", 2)
    results = [world.email(token, **{"message-id": f"<m{i}>"}).json()["captured"] for i in range(4)]
    assert results == [1, 1, 0, 0]


def test_someone_with_no_organization_cannot_capture_by_email(world):
    world.db.users.insert_one({"uid": "loner", "email": "loner@nowhere.test", "role": "employee", "capture_token": "a" * 32})
    assert world.email("a" * 32).json()["captured"] == 0
    assert world.db.captures.count_documents({}) == 0


def test_forwarded_mail_is_analysed_like_any_other_capture(world, monkeypatch):
    monkeypatch.setattr(settings, "CAPTURE_AUTO_ANALYZE", True)
    token = world.token(EMP)
    world.email(token, text="Minutes of meeting\nAttendees: Emma\nAgenda: budget\nDecisions: ok\nAction: Order laptops")
    (cap,) = world.captures(EMP)
    assert cap["status"] in ("queued", "processing", "done")  # the background run may already have finished
    asyncio.run(ca.analyze_capture(str(cap["_id"])))
    done = world.db.captures.find_one({"_id": cap["_id"]})
    assert done["status"] == "done" and done["kind"] == "mom" and [s["title"] for s in done["suggestions"]] == ["Order laptops"]


# ================================================================ Cliq
def test_capture_commands_are_understood():
    assert ci.parse_capture_command("capture: call Acme tomorrow") == "call Acme tomorrow"
    assert ci.parse_capture_command("  /capture  call Acme") == "call Acme"
    assert ci.parse_capture_command("#Capture - ship the report\nby friday") == "ship the report\nby friday"
    for text in ("capture", "capture:", "/capture", "Note that I will be late", "please capture this", "recapture: no", "", None):
        assert ci.parse_capture_command(text) is None


class Dms:
    def __init__(self, monkeypatch):
        self.sent = []

        async def send_dm(_self, to_email, text, buttons=None, org_id=""):
            self.sent.append((to_email, text))

        from app.core.zoho.cliq import ZohoCliq

        monkeypatch.setattr(ZohoCliq, "send_dm", send_dm)


def cliq(world, text, sender=EMP[1], msg_id="m1", **extra):
    body = {"sender": {"email": sender}, "message": {"text": text, "id": msg_id}, **extra}
    asyncio.run(zoho_cliq._process_inbound(body))


@pytest.fixture
def bot(world, monkeypatch):
    monkeypatch.setattr(database, "db", world.db)
    return Dms(monkeypatch)


def test_a_cliq_message_starting_with_capture_is_saved_privately_and_confirmed(world, bot):
    cliq(world, "capture: call the supplier about the shipment")
    (cap,) = world.captures(EMP)
    assert (cap["text"], cap["source"], cap["visibility"], cap["title"]) == ("call the supplier about the shipment", "cliq", "private", None)
    assert bot.sent and bot.sent[0][0] == EMP[1] and "Only you can see it" in bot.sent[0][1]


def test_ordinary_cliq_replies_are_not_captured(world, bot):
    cliq(world, "Done, I sent the file")
    cliq(world, "note that I will be late")
    cliq(world, "capture:")
    assert world.db.captures.count_documents({}) == 0 and bot.sent == []


def test_the_same_cliq_message_is_not_saved_twice_and_strangers_are_ignored(world, bot):
    cliq(world, "capture: one thing", msg_id="same")
    cliq(world, "capture: one thing", msg_id="same")
    cliq(world, "capture: from a stranger", sender="stranger@nowhere.test", msg_id="x")
    assert [c["text"] for c in world.captures(EMP)] == ["one thing"] and world.db.captures.count_documents({}) == 1


def test_a_voice_note_with_no_open_task_conversation_is_saved_but_a_reply_is_not(world, bot, monkeypatch):
    body = {"sender": {"email": EMP[1]}, "message": {"text": "remember to renew the licence", "id": "v1"},
            "files": [{"name": "voice.webm", "url": "https://files.test/voice.webm"}]}
    asyncio.run(zoho_cliq._process_inbound(body))
    assert [c["text"] for c in world.captures(EMP)] == ["remember to renew the licence"]
    # with an open task conversation the same voice note is a reply, not a capture
    async def fake_route(*a, **k):
        return {"routed": True, "kind": "reply"}
    monkeypatch.setattr("app.agents.communication_agent.route", fake_route)
    body["message"]["id"] = "v2"
    asyncio.run(zoho_cliq._process_inbound(body))
    assert world.db.captures.count_documents({}) == 1


def test_a_cliq_capture_is_analysed_later_even_if_the_short_lived_loop_closes(world, bot, monkeypatch):
    monkeypatch.setattr(settings, "CAPTURE_AUTO_ANALYZE", True)
    cliq(world, "capture: Action: Book the venue")
    (cap,) = world.captures(EMP)
    assert cap["status"] in ("queued", "done")  # either the loop got to it, or the sweeper will


# ================================================================ the sweeper
def _stale(world, status, **fields):
    return world.db.captures.insert_one({
        "org_id": world.org, "user_id": EMP[0], "kind": "note", "kind_source": "default", "visibility": "private",
        "text": "Action: Order laptops", "source": "text", "status": status, "created_at": NOW() - timedelta(hours=1),
        "updated_at": fields.pop("updated_at", NOW() - timedelta(hours=1)), **fields}).inserted_id


def test_the_sweeper_picks_up_forgotten_captures_but_not_fresh_or_busy_ones(world):
    forgotten = _stale(world, "queued")
    fresh = _stale(world, "queued", updated_at=NOW())
    stuck = _stale(world, "processing", processing_since=NOW() - timedelta(minutes=30))
    busy = _stale(world, "processing", processing_since=NOW())
    assert asyncio.run(ca.sweep_pending_captures()) == 2
    status = lambda cid: world.db.captures.find_one({"_id": cid})["status"]  # noqa: E731
    assert (status(forgotten), status(stuck)) == ("done", "done")
    assert (status(fresh), status(busy)) == ("queued", "processing")


def test_a_cancelled_analysis_goes_back_in_the_queue(world, monkeypatch):
    cid = _stale(world, "queued")

    async def cancelled(*a, **k):
        raise asyncio.CancelledError()

    monkeypatch.setattr(ca, "build_context", cancelled)
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(ca.analyze_capture(str(cid)))
    stored = world.db.captures.find_one({"_id": cid})
    assert stored["status"] == "queued" and "processing_since" not in stored
