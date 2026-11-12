"""Phase 3: report numbers, commitments, the weekly review, its email and the opt-out (offline)."""
import asyncio
import email
from datetime import datetime, timedelta

import pandas as pd
import pytest
from bson import ObjectId
from fastapi import HTTPException
from fastapi.testclient import TestClient

import app.core.capture_analysis as ca
import app.core.capture_metrics as cm
import app.core.commitments as cmt
import app.core.email_service as email_service
import app.core.weekly_review as wr
from app.core.config import settings
from app.dependencies.auth import get_current_user
from app.main import app

API = "/api/v1/captures"
REVIEW = "/api/v1/weekly-review"
OWNER = ("owner-uid-1", "owner@test.local")
EMP = ("emp-uid", "emp@test.local")
MGR = ("mgr-uid", "mgr@test.local")
NOW = datetime.utcnow


def decoded(raw: str) -> str:
    """The readable text of a recorded mail (bodies with ₹ or curly quotes are base64 on the wire)."""
    msg = email.message_from_string(raw)
    return "\n".join(
        p.get_payload(decode=True).decode(p.get_content_charset() or "utf-8")
        for p in msg.walk() if p.get_content_type() in ("text/plain", "text/html"))


def review_mails(world):
    """Mails that are weekly reviews (a task assignment sends its own mail too)."""
    return [{**m, "text": decoded(m["msg"])} for m in world.mail if "Stop these emails" in decoded(m["msg"])]


class U:
    def __init__(self, uid, email):
        self.id = uid
        self.uid = uid
        self.email = email
        self.custom_claims = {}


@pytest.fixture
def world(offline_db, monkeypatch):
    o = offline_db
    monkeypatch.setattr(settings, "CAPTURE_AUTO_ANALYZE", False)
    monkeypatch.setattr(ca, "llm_available", lambda: False)
    for name, value in (("SMTP_HOST", "smtp.offline.test"), ("SMTP_USER", "offline"), ("SMTP_PASS", "offline")):
        monkeypatch.setattr(email_service, name, value)
    o.db.org_chart_members.update_one({"organization_id": o.org, "email": EMP[1]}, {"$set": {"full_name": "Emma Employee"}})
    o.db.org_chart_members.update_one({"organization_id": o.org, "email": MGR[1]}, {"$set": {"full_name": "Mark Manager"}})
    who = {"u": None}

    def current():
        if who["u"] is None:
            raise HTTPException(status_code=401, detail="Not authenticated")
        return who["u"]

    app.dependency_overrides[get_current_user] = current

    class W:
        db = o.db
        org = o.org
        mail = o.mail
        c = TestClient(app)

        @staticmethod
        def login(person):
            who["u"] = U(*person) if person else None

        @staticmethod
        def capture(text, **body):
            body.setdefault("organization_id", W.org)
            r = W.c.post(API, json={"text": text, **body})
            assert r.status_code == 201, r.text
            cid = r.json()["capture"]["id"]
            r = W.c.post(f"{API}/{cid}/analyze", params={"wait": "true"})
            assert r.status_code == 200, r.text
            return r.json()["capture"]

        @staticmethod
        def accept(cap, index=0, **body):
            r = W.c.post(f"{API}/{cap['id']}/suggestions/{cap['suggestions'][index]['id']}/accept", json=body)
            assert r.status_code == 200, r.text
            return r.json()["task_id"]

        @staticmethod
        def review(scope="personal"):
            r = W.c.get(REVIEW, params={"organization_id": W.org, "scope": scope})
            assert r.status_code == 200, r.text
            return r.json()["review"]

        @staticmethod
        def texts(review, section):
            return [i["text"] for i in review[section]]

        @staticmethod
        def backdate(cid, **fields):
            W.db.captures.update_one({"_id": ObjectId(cid)}, {"$set": fields})

        @staticmethod
        def complete(task_id, when=None):
            W.db.tasks.update_one({"_id": ObjectId(task_id)}, {"$set": {"status": "completed", "completed_at": when or NOW()}})

    yield W
    app.dependency_overrides.pop(get_current_user, None)


# ---------------------------------------------------------------- numbers from text and tables
def test_numbers_are_read_from_report_text():
    rows = {r["metric"]: r for r in cm.metrics_from_text(
        "Weekly Sales - 3 Nov\nRevenue: Rs 4.1 crore\nSales up 5%\nOrders 120\nProfit down 2%\nThis leads to more work")}
    assert rows["revenue"]["value"] == pytest.approx(4.1e7) and rows["revenue"]["unit"] == "INR"
    assert rows["sales change"]["value"] == 5 and rows["sales change"]["unit"] == "%"
    assert rows["profit change"]["value"] == -2
    assert rows["orders"]["value"] == 120
    assert not any("3" in r["display"].split()[-1:] and r["metric"] == "sales" for r in rows.values())  # the heading is not a number
    assert "leads" not in rows


def test_numbers_are_read_from_a_metric_value_table():
    df = pd.DataFrame({"Metric": ["Revenue", "Orders", "Notes"], "Value": ["41000000", "120", "n/a"]})
    rows = {r["metric"]: r["value"] for r in cm.metrics_from_frame(df)}
    assert rows == {"revenue": 41000000, "orders": 120}


def test_numbers_are_read_from_a_table_with_one_row_per_week():
    df = pd.DataFrame({"Week": ["2026-10-26", "2026-11-02"], "Revenue": [40000000, 44000000], "Region": ["West", "West"]})
    rows = cm.metrics_from_frame(df)
    assert {(r["metric"], r["period"], r["value"]) for r in rows} == {
        ("revenue", "2026-10-26", 40000000), ("revenue", "2026-11-02", 44000000)}


def test_numbers_are_read_from_a_label_and_number_sheet_and_a_snapshot_row():
    assert [(r["metric"], r["value"]) for r in cm.metrics_from_frame(pd.DataFrame({"Item": ["Sales", "Leads"], "Q": [10, 20]}))] == [
        ("sales", 10), ("leads", 20)]
    assert {r["metric"]: r["value"] for r in cm.metrics_from_frame(pd.DataFrame({"Revenue": [5], "Orders": [7]}))} == {
        "revenue": 5, "orders": 7}
    assert cm.metrics_from_frame(pd.DataFrame()) == []


def test_values_read_the_way_people_write_them():
    assert cm.format_value(4.1e7, "INR") == "₹4.1 crore"
    assert cm.format_value(2.5e5, "INR") == "₹2.5 lakh"
    assert cm.format_value(120, "count") == "120" and cm.format_value(7, "%") == "7%" and cm.format_value(-3.5, "%") == "-3.5%"


def test_a_report_file_is_read_as_data(world, tmp_path):
    path = tmp_path / "weekly.csv"
    path.write_text("Week,Revenue,Orders\n2026-10-26,40000000,120\n2026-11-02,44000000,131\n")
    world.db.documents.insert_one({"file_id": "f1", "org_id": world.org, "user_id": EMP[0], "file_path": str(path), "text": "ignored"})
    world.login(EMP)
    cap = world.capture(None, source="file", kind="report", title="Weekly sales", visibility="org", raw_ref={"type": "file", "id": "f1"})
    rows = list(world.db.report_metrics.find({"capture_id": ObjectId(cap["id"])}))
    assert {(r["metric"], r["period_date"], r["value"]) for r in rows} == {
        ("revenue", "2026-10-26", 40000000), ("revenue", "2026-11-02", 44000000),
        ("orders", "2026-10-26", 120), ("orders", "2026-11-02", 131)}
    assert all(r["series_key"] == "weekly-sales" and r["org_id"] == world.org for r in rows)


def test_only_reports_have_numbers_and_a_journal_never_does(world):
    world.login(EMP)
    world.capture("Revenue: Rs 4.1 crore", kind="note")
    world.capture("Revenue: Rs 4.1 crore", kind="journal")
    assert world.db.report_metrics.count_documents({}) == 0
    cap = world.capture("Revenue: Rs 4.1 crore", kind="report")
    assert world.db.report_metrics.count_documents({"capture_id": ObjectId(cap["id"])}) == 1
    world.c.patch(f"{API}/{cap['id']}", json={"kind": "note"})
    assert world.db.report_metrics.count_documents({}) == 0
    world.c.patch(f"{API}/{cap['id']}", json={"kind": "report"})
    assert world.db.report_metrics.count_documents({}) == 1


def test_deleting_a_capture_deletes_its_commitments_and_numbers(world):
    world.login(EMP)
    mom = world.capture("Action: Order laptops")
    rep = world.capture("Revenue: Rs 4.1 crore", kind="report")
    assert world.db.commitments.count_documents({"capture_id": ObjectId(mom["id"])}) == 1
    assert world.c.delete(f"{API}/{mom['id']}").status_code == 200 and world.c.delete(f"{API}/{rep['id']}").status_code == 200
    assert world.db.commitments.count_documents({}) == 0 and world.db.report_metrics.count_documents({}) == 0


# ---------------------------------------------------------------- commitments
def test_what_a_note_promises_becomes_commitments_and_a_journal_makes_none(world):
    world.login(EMP)
    world.capture("Action: Send the quote by 2026-12-05\nAction: Book the venue")
    world.capture("Action: Quietly quit my job", kind="journal")
    assert sorted(c["text"] for c in world.db.commitments.find({})) == ["Book the venue", "Send the quote"]
    first = world.db.commitments.find_one({"text": "Send the quote"})
    assert first["due_date"] == "2026-12-05T23:59:59" and first["owner_email"] == EMP[1] and first["dropped"] is False


def test_dismissing_a_suggestion_drops_its_commitment_and_accepting_links_the_task(world):
    world.login(EMP)
    cap = world.capture("Action: Send the quote\nAction: Book the venue")
    world.c.post(f"{API}/{cap['id']}/suggestions/{cap['suggestions'][1]['id']}/dismiss")
    task_id = world.accept(cap, 0)
    quote = world.db.commitments.find_one({"text": "Send the quote"})
    venue = world.db.commitments.find_one({"text": "Book the venue"})
    assert quote["task_id"] == task_id and venue["dropped"] is True


def test_a_rerun_does_not_duplicate_commitments(world):
    world.login(EMP)
    cap = world.capture("Action: Send the quote")
    world.c.post(f"{API}/{cap['id']}/analyze", params={"wait": "true"})
    world.c.post(f"{API}/{cap['id']}/analyze", params={"wait": "true"})
    assert world.db.commitments.count_documents({}) == 1


def test_metric_goals_are_understood():
    assert cmt.infer_metric_goal("Raise sales by 10%") == ("sales", "up")
    assert cmt.infer_metric_goal("Reduce costs next quarter") == ("cost", "down")
    assert cmt.infer_metric_goal("Call the supplier") == (None, None)
    assert cmt.infer_metric_goal("Review the sales deck") == (None, None)  # no direction, so no goal


def _commit(world, **fields):
    cap_id = ObjectId()
    world.db.captures.insert_one({"_id": cap_id, "org_id": world.org, "user_id": EMP[0], "kind": "mom", "visibility": "org",
                                  "created_at": NOW()})
    doc = {"capture_id": cap_id, "suggestion_id": "s", "org_id": world.org, "text": "Do it", "owner_email": EMP[1],
           "due_date": None, "task_id": None, "metric": None, "direction": None, "baseline": None, "dropped": False,
           "manual_done_at": None, "created_by": EMP[0], "created_at": NOW()}
    doc.update(fields)
    doc["_id"] = world.db.commitments.insert_one(doc).inserted_id
    return doc


def _task(world, status="pending", **fields):
    return str(world.db.tasks.insert_one({"title": "The task", "organization_id": world.org, "status": status, **fields}).inserted_id)


def _state(world, doc):
    return cmt.evaluate(world.db, [world.db.commitments.find_one({"_id": doc["_id"]})])[0]


def test_done_needs_evidence_not_a_guess(world):
    task = _task(world, "completed", completed_at=NOW())
    item = _state(world, _commit(world, task_id=task))
    assert item["state"] == "done" and item["evidence"][0]["kind"] == "task_completed" and item["evidence"][0]["strength"] == "hard"
    assert _state(world, _commit(world, manual_done_at=NOW()))["evidence"][0]["strength"] == "manual"
    assert _state(world, _commit(world, task_id=_task(world, "approved")))["state"] == "done"
    assert _state(world, _commit(world, task_id=_task(world, "pending")))["state"] == "open"


def test_past_due_is_missed_with_a_task_and_unknown_without_one(world):
    past = (NOW() - timedelta(days=3)).isoformat()
    future = (NOW() + timedelta(days=3)).isoformat()
    assert _state(world, _commit(world, task_id=_task(world), due_date=past))["state"] == "missed"
    assert _state(world, _commit(world, due_date=past))["state"] == "no_evidence"
    assert _state(world, _commit(world, due_date=future))["state"] == "open"
    assert _state(world, _commit(world))["state"] == "open"
    assert _state(world, _commit(world, created_at=NOW() - timedelta(days=10)))["state"] == "no_evidence"


def _report(world, text, when, visibility="org", series="weekly-sales"):
    world.login(EMP)
    cap = world.capture(text, kind="report", visibility=visibility, title="Weekly Sales")
    world.db.report_metrics.update_many({"capture_id": ObjectId(cap["id"])}, {"$set": {"at": when, "period_date": when.date().isoformat()}})
    world.backdate(cap["id"], created_at=when, series_key=series)
    return cap


def test_a_later_report_moving_the_metric_is_soft_evidence(world):
    first = _report(world, "Revenue: Rs 4.0 crore", NOW() - timedelta(days=9))
    commitment = _commit(world, text="Raise revenue by 10%", metric="revenue", direction="up", created_at=NOW() - timedelta(days=5),
                         baseline={"value": 4.0e7, "unit": "INR", "capture_id": first["id"]})
    assert _state(world, commitment)["state"] == "open"  # nothing newer yet
    _report(world, "Revenue: Rs 4.4 crore", NOW() - timedelta(days=1))
    item = _state(world, commitment)
    assert item["state"] == "done" and item["evidence"][0]["strength"] == "soft"
    assert "₹4 crore → ₹4.4 crore (+10%)" in item["evidence"][0]["note"]


def test_a_metric_that_barely_moved_or_moved_the_wrong_way_is_not_evidence(world):
    first = _report(world, "Revenue: Rs 4.0 crore", NOW() - timedelta(days=9))
    base = {"value": 4.0e7, "unit": "INR", "capture_id": first["id"]}
    up = _commit(world, metric="revenue", direction="up", created_at=NOW() - timedelta(days=5), baseline=base)
    down = _commit(world, metric="revenue", direction="down", created_at=NOW() - timedelta(days=5), baseline=base)
    _report(world, "Revenue: Rs 4.01 crore", NOW() - timedelta(days=1))
    assert _state(world, up)["state"] == "open"  # +0.25% is noise
    _report(world, "Revenue: Rs 4.4 crore", NOW() - timedelta(hours=2))
    assert _state(world, up)["state"] == "done" and _state(world, down)["state"] == "open"


def test_private_reports_are_never_evidence_for_company_commitments(world):
    first = _report(world, "Revenue: Rs 4.0 crore", NOW() - timedelta(days=9))
    commitment = _commit(world, metric="revenue", direction="up", created_at=NOW() - timedelta(days=5),
                         baseline={"value": 4.0e7, "unit": "INR", "capture_id": first["id"]})
    _report(world, "Revenue: Rs 9 crore", NOW() - timedelta(days=1), visibility="private")
    assert _state(world, commitment)["state"] == "open"


# ---------------------------------------------------------------- the review
def test_the_personal_review_shows_decided_done_open_missed_and_unclear(world):
    world.login(EMP)
    cap = world.capture("Action: Send the quote\nAction: Fix the invoice\nAction: Call Acme\nAction: Plan the offsite")
    done_task = world.accept(cap, 0)
    missed_task = world.accept(cap, 1, due_date="2026-01-05")
    open_task = world.accept(cap, 2)
    world.complete(done_task)
    world.db.commitments.update_one({"text": "Fix the invoice"}, {"$set": {"due_date": (NOW() - timedelta(days=2)).isoformat()}})
    world.db.commitments.update_one({"text": "Plan the offsite"}, {"$set": {"created_at": NOW() - timedelta(days=10)}})
    review = world.review()
    assert world.texts(review, "done") == ["Send the quote"]
    assert world.texts(review, "missed") == ["Fix the invoice"]
    assert world.texts(review, "open") == ["Call Acme"]
    assert world.texts(review, "no_evidence") == ["Plan the offsite"]
    done = review["done"][0]
    assert done["evidence"][0]["kind"] == "task_completed" and done["task"]["id"] == done_task
    assert done["capture"]["id"] == cap["id"] and done["decided_this_week"] is True
    assert review["counts"]["decided"] == 3 and review["counts"]["done"] == 1 and review["scope"] == "personal"
    assert missed_task and open_task


def test_finished_long_ago_is_not_news(world):
    world.login(EMP)
    cap = world.capture("Action: Send the quote")
    world.complete(world.accept(cap), NOW() - timedelta(days=12))
    review = world.review()
    assert review["done"] == [] and review["counts"]["done"] == 0


def test_manual_done_and_drop(world):
    world.login(EMP)
    cap = world.capture("Action: Send the quote\nAction: Book the venue")
    ids = {c["text"]: str(c["_id"]) for c in world.db.commitments.find({})}
    assert world.c.post(f"{REVIEW}/commitments/{ids['Send the quote']}/done").status_code == 200
    assert world.c.post(f"{REVIEW}/commitments/{ids['Book the venue']}/drop").status_code == 200
    review = world.review()
    assert world.texts(review, "done") == ["Send the quote"] and review["done"][0]["evidence"][0]["kind"] == "manual"
    assert world.texts(review, "open") == [] and cap


def test_only_the_owner_the_author_or_an_owner_can_act_on_a_commitment(world):
    world.login(EMP)
    cap = world.capture("Action: Send the quote", visibility="members", shared_with=[MGR[1]])
    cid = str(world.db.commitments.find_one({})["_id"])
    world.login(MGR)  # can read the capture, but the commitment is Emma's
    assert world.c.post(f"{REVIEW}/commitments/{cid}/done").status_code == 403
    world.login(OWNER)  # owners may act on shared work
    assert world.c.post(f"{REVIEW}/commitments/{cid}/drop").status_code == 200
    world.login(("third-uid", "third@test.local"))
    world.db.users.insert_one({"uid": "third-uid", "email": "third@test.local", "organization_id": world.org})
    assert world.c.post(f"{REVIEW}/commitments/{cid}/done").status_code == 404 and cap


def test_a_private_capture_stays_out_of_everyone_elses_review_and_the_company_review(world):
    world.login(EMP)
    world.capture("Action: Secret plan for my own career")
    world.capture("Action: Public plan for the team", visibility="org")
    assert sorted(world.texts(world.review(), "open")) == ["Public plan for the team", "Secret plan for my own career"]
    world.login(OWNER)
    assert world.texts(world.review("company"), "open") == ["Public plan for the team"]
    assert world.texts(world.review("personal"), "open") == []
    world.login(MGR)
    assert world.texts(world.review(), "open") == []  # not Mark's, and he cannot read the private one


def test_work_assigned_to_me_from_a_capture_i_can_read_is_in_my_review(world):
    world.login(EMP)
    world.capture("Action: Mark to approve the budget", visibility="members", shared_with=[MGR[1]])
    world.login(MGR)
    review = world.review()
    assert world.texts(review, "open") == ["Approve the budget"] and review["open"][0]["owner_name"] == "Mark Manager"


def test_only_owners_get_the_company_review(world):
    world.login(EMP)
    assert world.c.get(REVIEW, params={"organization_id": world.org, "scope": "company"}).status_code == 403
    world.login(OWNER)
    assert world.c.get(REVIEW, params={"organization_id": world.org, "scope": "company"}).json()["can_see_company"] is True
    world.login(("other-uid", "other@other.test"))
    world.db.users.insert_one({"uid": "other-uid", "email": "other@other.test", "organization_id": "someone-elses-org"})
    assert world.c.get(REVIEW, params={"organization_id": world.org}).status_code == 403


def test_journal_captures_are_never_in_any_review(world):
    world.login(EMP)
    world.capture("Action: Tell my boss how I feel", kind="journal")
    review = world.review()
    assert review["counts"]["open"] == 0 and review["counts"]["new_captures"] == 0


def test_reports_show_what_changed_since_the_previous_one_in_the_series(world):
    _report(world, "Revenue: Rs 4.1 crore\nOrders 120", NOW() - timedelta(days=8))
    _report(world, "Revenue: Rs 4.4 crore\nOrders 120", NOW() - timedelta(days=1))
    world.login(OWNER)
    rows = {r["metric"]: r for r in world.review("company")["reports"]}
    assert set(rows) == {"revenue", "orders"}
    rev = rows["revenue"]
    assert (rev["previous"]["display"], rev["latest"]["display"], rev["direction"]) == ("₹4.1 crore", "₹4.4 crore", "up")
    assert rev["change_pct"] == pytest.approx(0.0732, abs=1e-3) and rev["series"] == "weekly-sales"
    assert rev["latest"]["capture"]["title"] == "Weekly Sales" and rows["orders"]["direction"] == "flat"


def test_private_reports_only_appear_for_their_author(world):
    _report(world, "Revenue: Rs 4.1 crore", NOW() - timedelta(days=8), visibility="private")
    _report(world, "Revenue: Rs 4.4 crore", NOW() - timedelta(days=1), visibility="private")
    assert len(world.review()["reports"]) == 1
    world.login(OWNER)
    assert world.review("company")["reports"] == []


def test_an_old_series_with_nothing_new_this_week_is_left_out(world):
    _report(world, "Revenue: Rs 4.1 crore", NOW() - timedelta(days=20))
    _report(world, "Revenue: Rs 4.4 crore", NOW() - timedelta(days=15))
    assert world.review()["reports"] == []


# ---------------------------------------------------------------- the email
def _with_work(world):
    world.login(EMP)
    cap = world.capture('Action: Send the <b>quote</b> to "Acme" & co')
    world.complete(world.accept(cap))
    return cap


def test_a_person_can_email_themselves_their_review(world):
    _with_work(world)
    r = world.c.post(f"{REVIEW}/email-me", params={"organization_id": world.org})
    assert r.json() == {"sent": True, "reason": None}
    (mail,) = review_mails(world)
    assert mail["to"] == EMP[1]
    body = mail["text"]
    page = body[body.index("<!DOCTYPE"):]  # the HTML version; the plain-text version is not markup
    assert "Done this week" in page and "&lt;b&gt;quote&lt;/b&gt;" in page and "<b>quote</b>" not in page
    assert "/weekly-review/unsubscribe?token=" in page and "Stop these emails" in page
    assert "Stop these emails: http" in body[: body.index("<!DOCTYPE")]  # and the text version has the link too


def test_nothing_is_emailed_when_there_is_nothing_to_say_or_no_mail_server(world, monkeypatch):
    world.login(EMP)
    assert world.c.post(f"{REVIEW}/email-me", params={"organization_id": world.org}).json()["reason"] == "Nothing to report yet."
    _with_work(world)
    monkeypatch.setattr(email_service, "SMTP_HOST", "")
    assert world.c.post(f"{REVIEW}/email-me", params={"organization_id": world.org}).json()["sent"] is False
    assert review_mails(world) == []
    assert world.c.post(f"{REVIEW}/email-me", params={"organization_id": world.org, "scope": "company"}).status_code == 403


def test_the_unsubscribe_link_works_without_signing_in_and_needs_a_click(world):
    world.login(None)
    token = wr.sign_unsubscribe(EMP[0])
    page = world.c.get(f"{REVIEW}/unsubscribe", params={"token": token})
    assert page.status_code == 200 and "Stop the emails" in page.text
    assert world.db.users.find_one({"uid": EMP[0]}).get("weekly_review_email") is None  # a GET changes nothing
    done = world.c.post(f"{REVIEW}/unsubscribe", data={"token": token})
    assert "You are unsubscribed" in done.text
    assert world.db.users.find_one({"uid": EMP[0]})["weekly_review_email"] is False
    assert wr.wants_email(world.db, EMP[0]) is False and wr.wants_email(world.db, MGR[0]) is True


def test_unsubscribe_tokens_cannot_be_forged_reused_for_someone_else_or_kept_forever(world):
    world.login(None)
    good = wr.sign_unsubscribe(EMP[0])
    uid, issued, sig = good.rsplit(":", 2)
    for bad in (f"{MGR[0]}:{issued}:{sig}", f"{uid}:{issued}:{'0' * 64}", "garbage", "", f"{uid}:x:{sig}"):
        world.c.post(f"{REVIEW}/unsubscribe", data={"token": bad})
    assert world.db.users.find_one({"uid": EMP[0]}).get("weekly_review_email") is None
    assert world.db.users.find_one({"uid": MGR[0]}).get("weekly_review_email") is None
    assert wr.verify_unsubscribe(good) == EMP[0]
    assert wr.verify_unsubscribe(wr.sign_unsubscribe(EMP[0], now=0)) is None  # older than the limit
    assert "expired" in world.c.get(f"{REVIEW}/unsubscribe", params={"token": "garbage"}).text


def test_the_email_setting_can_be_read_and_changed_by_the_person(world):
    world.login(EMP)
    assert world.c.get(f"{REVIEW}/preferences").json() == {"weekly_review_email": True}
    assert world.c.put(f"{REVIEW}/preferences", json={"weekly_review_email": False}).json() == {"weekly_review_email": False}
    assert world.c.get(REVIEW, params={"organization_id": world.org}).json()["email_enabled"] is False
    world.login(MGR)
    assert world.c.get(f"{REVIEW}/preferences").json()["weekly_review_email"] is True  # not Emma's setting


# ---------------------------------------------------------------- the Monday job
def run_job(world, **kw):
    return asyncio.run(wr.send_weekly_reviews(world.db, **kw))


def test_the_weekly_job_sends_once_per_person_per_week_to_those_who_opted_in(world):
    _with_work(world)
    monday_8_ist = datetime(2026, 11, 2, 2, 30)  # 08:00 IST on Monday 2 Nov 2026
    assert run_job(world, now_utc=datetime(2026, 11, 3, 2, 30))["sent"] == 0  # Tuesday: not the day
    first = run_job(world, now_utc=monday_8_ist)
    assert first["sent"] == 1 and [m["to"] for m in review_mails(world)] == [EMP[1]]
    assert run_job(world, now_utc=monday_8_ist)["sent"] == 0 and len(review_mails(world)) == 1  # same week: no repeat
    assert run_job(world, now_utc=monday_8_ist + timedelta(days=7))["sent"] == 1  # next week: again


def test_people_who_opted_out_or_have_nothing_to_report_get_no_email(world):
    _with_work(world)
    world.db.users.update_one({"uid": EMP[0]}, {"$set": {"weekly_review_email": False}})
    result = run_job(world, force=True)
    assert result["sent"] == 0 and result["opted_out"] >= 1 and review_mails(world) == []


def test_owners_get_the_company_review_and_others_their_own(world):
    world.login(EMP)
    cap = world.capture("Action: Send the quote", visibility="org")
    world.accept(cap)
    run_job(world, force=True)
    by_to = {m["to"]: m["text"] for m in review_mails(world)}
    assert "Your company this week" in by_to[OWNER[1]] and "Your week" in by_to[EMP[1]]


def test_a_failed_send_is_retried_and_no_mail_server_means_no_claim(world, monkeypatch):
    _with_work(world)
    monkeypatch.setattr(wr, "send_review_email", lambda *a, **k: False)
    assert run_job(world, force=True)["sent"] == 0 and world.db.weekly_review_sent.count_documents({}) == 0
    monkeypatch.undo()
    monkeypatch.setattr(email_service, "SMTP_HOST", "")
    assert run_job(world, force=True) == {"sent": 0, "skipped": 0, "opted_out": 0}
