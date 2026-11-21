"""The inbox summary is private, read-only, opt-in, and never invents anything (offline)."""
from datetime import datetime, timedelta, timezone

import pytest

import app.core.ai_client as ai_client
import app.core.mail_digest as md
from app.core.zoho.base import FULL_SCOPE, MAIL_SCOPE, ZohoOAuth, has_mail_scope
from app.core.zoho.mail_inbox import MailReadError, ZohoInbox, normalize_message, webmail_link


def _ms(hours_ago: float) -> str:
    return str(int((datetime.now(timezone.utc) - timedelta(hours=hours_ago)).timestamp() * 1000))


def _row(i: int, hours_ago: float = 1, **over):
    row = {"messageId": f"id{i}", "folderId": "f1", "sender": f"Sender {i}", "fromAddress": f"s{i}@x.com",
           "subject": f"Subject {i}", "summary": f"preview {i}", "receivedTime": _ms(hours_ago), "hasAttachment": "0"}
    row.update(over)
    return row


def _mail(i: int, hours_ago: float = 1):
    return normalize_message(_row(i, hours_ago))


# ---------------------------------------------------------------- reading Zoho (facts only)
def test_a_message_keeps_only_who_what_when_and_a_short_preview():
    m = normalize_message(_row(1, summary="x " * 400, hasAttachment="1"))
    assert m["sender"] == "Sender 1" and m["subject"] == "Subject 1" and m["has_attachment"] is True
    assert len(m["snippet"]) <= 300
    assert set(m) == {"id", "folder_id", "sender", "from_address", "subject", "snippet", "received_at", "has_attachment", "link"}  # no body field


def test_rows_without_an_id_or_a_time_are_dropped():
    assert normalize_message({"subject": "x", "receivedTime": _ms(1)}) is None
    assert normalize_message({"messageId": "a", "subject": "x", "receivedTime": "soon"}) is None


def test_the_link_opens_the_message_in_zoho_mail(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "ZOHO_MAIL_API_URL", "https://mail.zoho.in/api")
    assert webmail_link("42", "7") == "https://mail.zoho.in/zm/#mail/folder/7/p/42"


async def test_only_mail_inside_the_window_is_returned_newest_first(monkeypatch):
    async def fake_get(self, path, params=None):
        if path == "/accounts":
            return {"data": [{"accountId": "A1"}]}
        assert path == "/accounts/A1/messages/view"
        return {"data": [_row(1, 30), _row(2, 2), _row(3, 5), {"junk": True}]}

    monkeypatch.setattr(ZohoInbox, "_get", fake_get)
    got = await ZohoInbox("tok").recent(hours=24)
    assert [m["id"] for m in got] == ["id2", "id3"]  # the 30-hour-old one and the junk row are left out


# ---------------------------------------------------------------- joining Zoho's facts with the model's wording
def test_unknown_ids_are_dropped_and_missing_ones_are_still_listed():
    mails = [_mail(1), _mail(2)]
    out = md.assemble(mails, {"mails": [{"id": "m1", "category": "reply", "line": "Wants a quote"}, {"id": "m99", "category": "money", "line": "ghost"}]})
    assert [(i["id"], i["category"]) for i in out["items"]] == [("id1", "reply"), ("id2", "fyi")]
    assert out["items"][1]["line"] == ""  # nothing is made up for a mail the model did not describe


def test_skipped_mail_is_counted_not_shown():
    out = md.assemble([_mail(1), _mail(2)], {"mails": [{"id": "m1", "category": "skip", "line": "promo"}, {"id": "m2", "category": "fyi", "line": "ok"}]})
    assert out["skipped"] == 1 and [i["id"] for i in out["items"]] == ["id2"]


def test_a_task_must_point_at_a_shown_mail_and_dates_must_be_real():
    mails = [_mail(1), _mail(2), _mail(3)]
    ai = {"mails": [{"id": "m1", "category": "reply", "line": "a"}, {"id": "m2", "category": "skip", "line": "b"}, {"id": "m3", "category": "reply", "line": "c"}],
          "actions": [{"mail": "m1", "title": "Send the quote", "due_date": "2026-11-27"},
                      {"mail": "m3", "title": "Call back", "due_date": "next friday"},
                      {"mail": "m2", "title": "On a skipped mail", "due_date": None},
                      {"mail": "m77", "title": "On no mail", "due_date": None}]}
    actions = md.assemble(mails, ai)["actions"]
    assert [(a["title"], a["due_date"]) for a in actions] == [("Send the quote", "2026-11-27"), ("Call back", None)]
    assert actions[0]["link"].endswith("/p/id1") and actions[0]["from"] == "Sender 1"


def test_the_preview_text_is_not_kept_in_the_summary():
    out = md.assemble([_mail(1)], {"mails": [{"id": "m1", "category": "reply", "line": "x"}]})
    assert "snippet" not in out["items"][0]  # it was shown to the model once; only the one-line gist is stored


def test_a_no_reply_sender_is_never_a_mail_that_needs_a_reply():
    mails = [normalize_message(_row(1, fromAddress="no-reply-claude@mail.anthropic.com")), normalize_message(_row(2, fromAddress="noreply@zohoaccounts.com")),
             normalize_message(_row(3, fromAddress="rahul@client.com"))]
    ai = {"mails": [{"id": f"m{i}", "category": "reply", "line": ""} for i in (1, 2, 3)]}
    assert {i["id"]: i["category"] for i in md.assemble(mails, ai)["items"]} == {"id1": "fyi", "id2": "fyi", "id3": "reply"}


def test_one_suggested_task_per_mail():
    ai = {"mails": [{"id": "m1", "category": "reply", "line": ""}],
          "actions": [{"mail": "m1", "title": "First", "due_date": None}, {"mail": "m1", "title": "Second", "due_date": None}]}
    assert [a["title"] for a in md.assemble([_mail(1)], ai)["actions"]] == ["First"]


def test_without_model_output_every_mail_is_still_listed():
    out = md.assemble([_mail(1), _mail(2)], None)
    assert len(out["items"]) == 2 and out["summarised"] is False and out["overview"] == "" and out["actions"] == []


def test_groups_come_in_a_fixed_order_with_newest_first_inside_each():
    mails = [_mail(1, 5), _mail(2, 1), _mail(3, 3)]
    ai = {"mails": [{"id": "m1", "category": "fyi", "line": ""}, {"id": "m2", "category": "reply", "line": ""}, {"id": "m3", "category": "reply", "line": ""}]}
    assert [i["id"] for i in md.assemble(mails, ai)["items"]] == ["id2", "id3", "id1"]


# ---------------------------------------------------------------- permission and privacy
def test_reading_mail_is_a_separate_opt_in_permission():
    url_default = ZohoOAuth().get_auth_url(state="s", redirect_uri="http://localhost/cb")
    url_mail = ZohoOAuth().get_auth_url(state="s", redirect_uri="http://localhost/cb", with_mail=True)
    assert "messages.READ" not in url_default and "messages.READ" in url_mail
    assert not has_mail_scope(FULL_SCOPE) and has_mail_scope(f"{FULL_SCOPE},{MAIL_SCOPE}") and has_mail_scope("ZohoMail.messages.READ ZohoMail.accounts.READ")


def _connect(db, uid="u1", mail=True):
    db.zoho_tokens.insert_one({"user_id": uid, "access_token": "tok", "refresh_token": "r", "expires_at": (datetime.utcnow() + timedelta(hours=1)).isoformat(),
                               "scope": f"{FULL_SCOPE},{MAIL_SCOPE}" if mail else FULL_SCOPE, "mail_enabled": mail})


@pytest.fixture
def inbox(monkeypatch):
    state = {"mails": [_mail(1), _mail(2)], "calls": 0, "error": None}

    async def recent(self, hours=24, limit=40):
        state["calls"] += 1
        if state["error"]:
            raise state["error"]
        return state["mails"]

    monkeypatch.setattr(ZohoInbox, "recent", recent)
    return state


@pytest.fixture
def model(monkeypatch):
    state = {"calls": 0, "reply": '{"overview": "Two mails.", "mails": [{"id": "m1", "category": "reply", "line": "Wants a quote"}], "actions": []}', "fail": False}

    async def fake(prompt, *a, **k):
        state["calls"] += 1
        if state["fail"]:
            raise RuntimeError("model down")
        state["prompt"] = prompt
        return state["reply"]

    monkeypatch.setattr(ai_client, "get_ai_response", fake)
    return state


async def test_not_connected_and_not_enabled_read_nothing(offline_db, inbox, model):
    assert (await md.get_digest(offline_db.db, "u1"))["state"] == "not_connected"
    _connect(offline_db.db, mail=False)  # Zoho connected for tasks/calendar only
    assert (await md.get_digest(offline_db.db, "u1"))["state"] == "needs_permission"
    assert inbox["calls"] == 0 and model["calls"] == 0  # no mailbox read, no model call


async def test_a_summary_is_built_from_the_inbox_and_belongs_to_one_person(offline_db, inbox, model):
    _connect(offline_db.db, "u1")
    _connect(offline_db.db, "u2")
    mine = await md.get_digest(offline_db.db, "u1")
    assert mine["state"] == "ok" and mine["total"] == 2 and mine["overview"] == "Two mails."
    assert mine["items"][0]["line"] == "Wants a quote" and mine["items"][0]["sender"] == "Sender 1"
    assert offline_db.db.mail_digests.count_documents({"user_id": "u2"}) == 0  # u2's own summary is separate and was never built
    assert offline_db.db.mail_digests.count_documents({"user_id": "u1"}) == 1


async def test_the_model_is_only_shown_sender_subject_and_a_short_preview(offline_db, inbox, model):
    _connect(offline_db.db)
    await md.get_digest(offline_db.db, "u1")
    assert "Sender 1" in model["prompt"] and "Subject 1" in model["prompt"] and "preview 1" in model["prompt"]
    assert "refresh_token" not in model["prompt"] and "tok" not in model["prompt"].replace("token", "")


async def test_a_fresh_summary_is_reused_until_the_person_asks_for_a_new_one(offline_db, inbox, model):
    _connect(offline_db.db)
    await md.get_digest(offline_db.db, "u1")
    again = await md.get_digest(offline_db.db, "u1")
    assert again["cached"] is True and inbox["calls"] == 1 and model["calls"] == 1
    await md.get_digest(offline_db.db, "u1", refresh=True)
    assert inbox["calls"] == 2


async def test_an_empty_inbox_says_so_without_asking_the_model(offline_db, inbox, model):
    inbox["mails"] = []
    _connect(offline_db.db)
    out = await md.get_digest(offline_db.db, "u1")
    assert out["state"] == "empty" and model["calls"] == 0


async def test_when_the_model_fails_the_mail_is_still_listed_and_nothing_is_made_up(offline_db, inbox, model):
    model["fail"] = True
    _connect(offline_db.db)
    out = await md.get_digest(offline_db.db, "u1")
    assert out["state"] == "ok" and out["summarised"] is False and len(out["items"]) == 2
    assert all(i["line"] == "" for i in out["items"]) and out["overview"] == ""


async def test_if_zoho_withdraws_permission_the_person_is_asked_to_allow_it_again(offline_db, inbox, model):
    inbox["error"] = MailReadError("denied", permission=True)
    _connect(offline_db.db)
    assert (await md.get_digest(offline_db.db, "u1"))["state"] == "needs_permission"
    assert offline_db.db.zoho_tokens.find_one({"user_id": "u1"})["mail_enabled"] is False


async def test_other_zoho_failures_are_reported_not_hidden(offline_db, inbox, model):
    inbox["error"] = MailReadError("Zoho Mail answered 500")
    _connect(offline_db.db)
    out = await md.get_digest(offline_db.db, "u1")
    assert out["state"] == "error" and "500" in out["message"]


async def test_stopping_erases_the_summary_and_turns_reading_off(offline_db, inbox, model):
    _connect(offline_db.db)
    await md.get_digest(offline_db.db, "u1")
    await md.stop_reading(offline_db.db, "u1")
    assert offline_db.db.mail_digests.count_documents({"user_id": "u1"}) == 0
    assert (await md.get_digest(offline_db.db, "u1"))["state"] == "needs_permission"
    assert offline_db.db.zoho_tokens.count_documents({"user_id": "u1"}) == 1  # tasks and calendar stay connected


# ---------------------------------------------------------------- the routes
def _client(offline_db, uid):
    from fastapi.testclient import TestClient

    from app.dependencies.auth import get_current_user
    from app.main import app

    class U:
        id = uid
        email = f"{uid}@test.local"
        custom_claims: dict = {}

    app.dependency_overrides[get_current_user] = lambda: U()
    return TestClient(app), app, get_current_user


def test_routes_need_sign_in(offline_db):
    from fastapi.testclient import TestClient

    from app.main import app

    c = TestClient(app)
    assert c.get("/api/v1/mail/digest").status_code == 401
    assert c.get("/api/v1/mail/status").status_code == 401
    assert c.post("/api/v1/mail/stop").status_code == 401


def test_the_routes_work_on_the_callers_own_mailbox_only(offline_db, inbox, model):
    _connect(offline_db.db, "owner-uid-1")
    client, app, dep = _client(offline_db, "emp-uid")
    try:
        assert client.get("/api/v1/mail/status").json() == {"zoho_connected": False, "mail_enabled": False, "needs_permission": False}
        assert client.get("/api/v1/mail/digest", params={"user_id": "owner-uid-1"}).json()["state"] == "not_connected"  # a user id in the query is ignored
    finally:
        app.dependency_overrides.pop(dep, None)
    client, app, dep = _client(offline_db, "owner-uid-1")
    try:
        assert client.get("/api/v1/mail/digest").json()["state"] == "ok"
        assert client.post("/api/v1/mail/stop").json() == {"stopped": True}
    finally:
        app.dependency_overrides.pop(dep, None)
