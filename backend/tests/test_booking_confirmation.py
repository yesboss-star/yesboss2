"""A chat request only ever PROPOSES a meeting time; pressing a time (or typing one) books it.

Booking writes into other people's calendars and sends them invites, so a message such as
"book a meeting with Krisha tomorrow at 9" must never create anything by itself. Everything here is
offline: calendar writes are recorded instead of sent.
"""
import asyncio
import json
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import app.api.assistant as a

DAY = "2099-01-05"
_REAL_BOOK_PROVIDER_EVENT = a._book_provider_event  # the fixture below swaps the module attribute for a recorder


@pytest.fixture
def cal(offline_db, monkeypatch):
    """A connected organizer with an empty calendar. `cal.calls` lists every calendar write that happened."""
    import app.core.notification_service as ns
    import app.core.providers as providers

    calls: list = []
    busy: list = []

    async def provider_token(db, user_id):
        return ("zoho", "tok-organizer")

    async def no_token(db, email, org_id):
        return None

    async def busy_blocks(db, org_id, ref_tz, day, emails, tokens):
        blocks = []
        for h, m in busy:
            start = datetime(day.year, day.month, day.day, h, m, tzinfo=ref_tz)
            blocks.append((start, start + timedelta(minutes=30)))
        return blocks

    async def book_event(db, org_id, organizer_email, organizer_token, is_google, ref_tz_name, slot, title, description, emails, tokens):
        calls.append({"slot": slot, "title": title, "attendees": list(emails)})
        return {"zoho": "evt-1"}

    async def deliver(*args, **kwargs):
        return None

    monkeypatch.setattr(providers, "get_provider_token", provider_token)
    monkeypatch.setattr(providers, "resolve_token_for_email", no_token)
    monkeypatch.setattr(a, "_collect_busy_blocks", busy_blocks)
    monkeypatch.setattr(a, "_book_provider_event", book_event)
    monkeypatch.setattr(ns, "create_and_deliver", deliver)
    offline_db.calls = calls
    offline_db.busy = busy
    return offline_db


def params(cal, **extra):
    return {"attendee_names": [cal.emp], "date": DAY, "title": "Sync", "duration_minutes": 30, **extra}


def run(cal, **extra):
    return asyncio.run(a.handle_meeting_booking(params(cal, **extra), cal.db, cal.org, cal.owner_email))


# ---------------------------------------------------------------- a request only proposes
def test_a_requested_time_is_proposed_not_booked(cal):
    result = run(cal, preferred_time="10:00")
    assert result["booked"] is False and result["needs_confirmation"] is True
    assert result["slot"]["start"] == "10:00" and result["available_slots"][0] == result["slot"]
    assert "Nothing is booked" in result["message"]
    assert cal.calls == [], "a calendar write happened before anyone confirmed"
    assert cal.db.meetings.count_documents({}) == 0


def test_let_me_pick_for_you_is_also_only_a_proposal(cal):
    result = run(cal, auto=True)
    assert result["needs_confirmation"] is True and result["slot"]["start"] == "09:00"
    assert cal.calls == [] and cal.db.meetings.count_documents({}) == 0


def test_the_proposal_offers_other_free_times_too(cal):
    result = run(cal, preferred_time="10:00")
    starts = [s["start"] for s in result["available_slots"]]
    assert starts[0] == "10:00" and len(starts) > 1 and starts.count("10:00") == 1


def test_a_recurring_request_says_how_many_times_it_repeats(cal):
    result = run(cal, preferred_time="10:00", recurrence={"frequency": "weekly", "count": 4})
    assert result["count"] == 4 and "repeating 4 times" in result["message"]
    assert cal.calls == []


def test_no_time_given_still_lists_slots_as_before(cal):
    result = run(cal)
    assert result["booked"] is False and "needs_confirmation" not in result
    assert len(result["available_slots"]) > 1 and cal.calls == []


# ---------------------------------------------------------------- confirming books
def test_a_confirmed_request_books_and_records_the_meeting(cal):
    result = run(cal, preferred_time="10:00", confirmed=True)
    assert result["booked"] is True and result["slot"]["start"] == "10:00"
    assert len(cal.calls) == 1 and cal.calls[0]["attendees"] == [cal.emp]
    assert cal.db.meetings.find_one({"title": "Sync"})["attendees"] == [cal.emp]


def test_typing_a_time_after_the_booking_question_books_it(cal):
    pending = json.dumps({"attendee_names": [cal.emp], "date": DAY, "title": "Sync", "duration_minutes": 30})
    det = asyncio.run(a._try_deterministic_booking("11am", {"pending_booking": pending}, cal.db, cal.org, cal.owner_email))
    assert det["type"] == "answer" and "booked" in det["answer"]
    assert len(cal.calls) == 1 and cal.calls[0]["slot"]["start"] == "11:00"
    assert "confirmed" not in det["booking_params"], "the confirmation must not stay on the card"


def test_moving_a_named_meeting_is_an_explicit_request(cal):
    result = run(cal, preferred_time="10:00", confirmed=True, title="Board sync")
    assert result["booked"] is True


# ---------------------------------------------------------------- the confirm endpoint
def request_for(cal, start="10:00", **extra):
    return a.ConfirmBookingRequest(
        organization_id=cal.org,
        booking_params=a.BookingParams(attendee_emails=[cal.emp], title="Sync", duration_minutes=30, **extra),
        slot=a.BookingSlot(date=DAY, start=start, end="10:30"),
    )


def owner(cal):
    return SimpleNamespace(id=cal.owner_uid, uid=cal.owner_uid, email=cal.owner_email, custom_claims={"role": "owner"})


def test_pressing_a_time_books_exactly_that_slot(cal):
    out = asyncio.run(a.confirm_booking(request_for(cal), current_user=owner(cal)))
    assert out["type"] == "answer" and "booked" in out["answer"] and out["booking_result"]["booked"] is True
    assert len(cal.calls) == 1 and cal.calls[0]["slot"]["date"] == DAY and cal.calls[0]["slot"]["start"] == "10:00"


def test_the_confirm_endpoint_refuses_someone_outside_the_organization(cal):
    stranger = SimpleNamespace(id="x", uid="x", email="stranger@elsewhere.test", custom_claims={})
    with pytest.raises(HTTPException) as err:
        asyncio.run(a.confirm_booking(request_for(cal), current_user=stranger))
    assert err.value.status_code == 403 and cal.calls == []


def test_a_time_taken_in_the_meantime_is_not_booked_and_alternatives_come_back(cal):
    cal.busy.append((10, 0))
    out = asyncio.run(a.confirm_booking(request_for(cal), current_user=owner(cal)))
    assert out["type"] == "meeting_booking" and cal.calls == []
    starts = [s["start"] for s in out["booking_params"]["available_slots"]]
    assert "10:00" not in starts and starts
    assert "confirmed" not in out["booking_params"] and "attendee_names" not in out["booking_params"]


# ---------------------------------------------------------------- chat wording before a task is assigned
def test_the_task_preview_never_claims_it_is_done():
    text = a._delegate_preview_text({"title": "Write release notes", "assignee_name": "Krisha Suchak", "item_type": "task"})
    assert "Write release notes" in text and "Krisha Suchak" in text
    assert "Nothing is created yet" in text and "Assign" in text
    for claim in ("Done", "I've created", "assigned to"):
        assert claim not in text


def test_a_model_that_says_done_does_not_get_to_say_it(monkeypatch):
    async def fake_ai(*args, **kwargs):
        return '{"type":"delegate","assignee_name":"Krisha","title":"Write notes","answer":"Done! I\'ve created it. 🎉"}'

    async def fake_preview(parsed, db, org_id):
        return (
            {"title": parsed["title"], "assignee_name": "Krisha Suchak", "assignee_id": ["1"], "assignees": [],
             "priority": "medium", "item_type": "task", "description": None, "department": None},
            [],
            None,
        )

    monkeypatch.setattr(a, "get_ai_response", fake_ai)
    monkeypatch.setattr(a, "_build_delegate_preview", fake_preview)
    monkeypatch.setattr(a, "get_database", lambda: None)
    request = a.AskRequest(message="assign a task to Krisha to write notes", context=a.ChatContext(organization_id="org1"))
    resp = asyncio.run(a.smart_ask(request, current_user=None))
    assert resp.type == "delegate_preview"
    assert "Done" not in resp.answer and "created it" not in resp.answer and "Nothing is created yet" in resp.answer


# ---------------------------------------------------------------- every slot list must carry its attendees
# (the card sends them back to /assistant/confirm-booking, so a list without them could never be booked)
def test_a_plain_slot_list_carries_the_attendees(cal):
    result = run(cal)
    assert result["attendees"] == [cal.emp]


def test_a_busy_time_list_carries_the_attendees(cal):
    cal.busy.append((10, 0))
    result = run(cal, preferred_time="10:00")
    assert result["booked"] is False and "busy" in result["message"] and result["attendees"] == [cal.emp]


def test_a_slot_from_a_plain_list_can_be_booked_from_the_card(cal):
    listed = run(cal)
    card = a.BookingParams(attendee_emails=listed["attendees"], title="Sync", duration_minutes=30)
    pressed = listed["available_slots"][2]
    req = a.ConfirmBookingRequest(organization_id=cal.org, booking_params=card, slot=a.BookingSlot(**pressed))
    out = asyncio.run(a.confirm_booking(req, current_user=owner(cal)))
    assert out["type"] == "answer" and len(cal.calls) == 1 and cal.calls[0]["slot"]["start"] == pressed["start"]


def test_a_day_with_no_free_time_also_names_its_attendees(cal):
    cal.busy.extend((h, m) for h in range(9, 18) for m in (0, 30))
    result = run(cal)
    assert result["available_slots"] == [] and result["attendees"] == [cal.emp]


# ---------------------------------------------------------------- the meeting remembers every calendar copy
def test_a_booking_remembers_each_attendees_own_calendar_copy(cal, monkeypatch):
    async def book_event(db, org_id, organizer, token, is_google, tz, slot, title, description, emails, tokens):
        return {"zoho": "evt-organizer", emails[0]: "evt-attendee"}

    monkeypatch.setattr(a, "_book_provider_event", book_event)
    run(cal, preferred_time="10:00", confirmed=True)
    meeting = cal.db.meetings.find_one({"title": "Sync"})
    assert meeting["zoho_event_id"] == "evt-organizer"
    assert meeting["event_ids"] == {cal.emp: "evt-attendee"}, "cancelling later could not reach the attendee's own copy"


# ---------------------------------------------------------------- found by booking for real: the calendar said no, and the app said yes
def test_a_calendar_that_refuses_the_event_means_nothing_is_booked_or_announced(cal, monkeypatch):
    import app.core.notification_service as ns

    announced = []

    async def deliver(*args, **kwargs):
        announced.append(kwargs)

    async def refuse(*args, **kwargs):
        return {}

    monkeypatch.setattr(ns, "create_and_deliver", deliver)
    monkeypatch.setattr(a, "_book_provider_event", refuse)
    result = run(cal, preferred_time="10:00", confirmed=True)
    assert "error" in result and "booked" not in result
    assert "nothing was booked" in result["error"] and "nobody was invited" in result["error"]
    assert cal.db.meetings.count_documents({}) == 0, "a meeting was recorded that is not on anyone's calendar"
    assert announced == [], "attendees were told about a meeting that does not exist"


def test_the_confirm_endpoint_reports_a_refusal_instead_of_claiming_success(cal, monkeypatch):
    async def refuse(*args, **kwargs):
        return {}

    monkeypatch.setattr(a, "_book_provider_event", refuse)
    out = asyncio.run(a.confirm_booking(request_for(cal), current_user=owner(cal)))
    assert out["type"] == "answer" and "couldn't book" in out["answer"] and "booking_result" not in out


def test_a_missing_description_or_title_is_not_passed_on_as_null(cal):
    asyncio.run(a.handle_meeting_booking(
        {"attendee_names": [cal.emp], "date": DAY, "preferred_time": "10:00", "duration_minutes": 30,
         "title": None, "description": None, "confirmed": True},
        cal.db, cal.org, cal.owner_email))
    booked = cal.calls[0]
    assert booked["title"] == "Meeting"
    assert cal.db.meetings.find_one({})["description"] == "", "Zoho answers a null description with a 500"


def test_one_refused_occurrence_of_a_series_is_reported_not_hidden(cal, monkeypatch):
    seen = []

    async def book_event(db, org_id, organizer, token, is_google, tz, slot, title, description, emails, tokens):
        seen.append(slot["date"])
        return {} if len(seen) == 2 else {"zoho": f"evt-{len(seen)}"}

    monkeypatch.setattr(a, "_book_provider_event", book_event)
    result = run(cal, preferred_time="10:00", confirmed=True, recurrence={"frequency": "weekly", "count": 3})
    assert result["booked"] is True and result["count"] == 2 and result["not_booked"] == 1
    assert "2 of 3" in result["message"] and cal.db.meetings.count_documents({}) == 2


def test_a_refused_organizer_event_leaves_no_copies_on_other_calendars(cal):
    from app.core.zoho import ZohoCalendar

    made = []

    async def cal_uid(token):
        return "cal-1"

    async def create(**kw):
        made.append(kw["user_token"])
        return None if kw["user_token"] == "tok-organizer" else "evt-copy"

    ZohoCalendar_create, ZohoCalendar_uid = ZohoCalendar.create_event, ZohoCalendar.get_default_calendar_uid
    ZohoCalendar.create_event, ZohoCalendar.get_default_calendar_uid = staticmethod(create), staticmethod(cal_uid)
    try:
        ids = asyncio.run(_REAL_BOOK_PROVIDER_EVENT(
            cal.db, cal.org, cal.owner_email, "tok-organizer", False, "Asia/Kolkata",
            {"date": DAY, "start": "10:00", "end": "10:30"}, "Sync", "", [cal.emp], {cal.emp: ("zoho", "tok-attendee")}))
    finally:
        ZohoCalendar.create_event, ZohoCalendar.get_default_calendar_uid = ZohoCalendar_create, ZohoCalendar_uid
    assert ids == {} and made == ["tok-organizer"], "a copy was made on an attendee's calendar for a meeting that was never created"


def test_zoho_event_data_leaves_out_an_empty_attendee_list_and_an_empty_description(monkeypatch):
    import app.core.zoho.calendar as zc

    sent = []

    class Response:
        status_code = 200

        def json(self):
            return {"events": [{"uid": "u1"}]}

    class Client:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, params=None, headers=None):
            sent.append(json.loads(params["eventdata"]))
            return Response()

    monkeypatch.setattr(zc.httpx, "AsyncClient", Client)
    create = zc.ZohoCalendar.create_event
    asyncio.run(create("tok", "cal", "T", "", "20990105T100000+0530", "20990105T103000+0530", "Asia/Kolkata", []))
    asyncio.run(create("tok", "cal", "T", "Agenda", "20990105T100000+0530", "20990105T103000+0530", "Asia/Kolkata", [{"email": "x@test.local"}]))
    bare, full = sent
    assert "attendees" not in bare and "richtext_description" not in bare, "Zoho rejects an empty attendee list (400) and a null description (500)"
    assert full["attendees"] == [{"email": "x@test.local", "status": "NEEDS-ACTION"}] and full["richtext_description"] == "Agenda"


# ---------------------------------------------------------------- a database object is not a yes/no value
def test_no_code_uses_the_database_object_as_a_truth_value():
    """pymongo refuses `if db:` / `db or x` (NotImplementedError), which made the Zoho calendar events route answer 500."""
    import pathlib
    import re

    pattern = re.compile(r"\bif db else\b|\bif not db\b|\bif db:|\bdb or \w|\bnot db\b|\bif db and\b")
    offenders = []
    for path in pathlib.Path(a.__file__).resolve().parents[1].rglob("*.py"):
        for number, line in enumerate(path.read_text(encoding="utf8").splitlines(), 1):
            if pattern.search(line) and "is not None" not in line:
                offenders.append(f"{path.name}:{number}: {line.strip()}")
    assert offenders == [], offenders


# ---------------------------------------------------------------- found by cancelling for real: Zoho answers a delete with 400 unless it carries the etag
def _fake_zoho_client(monkeypatch, *, etag="E1", delete_status=200, get_status=200):
    import app.core.zoho.calendar as zc

    calls = []

    class Response:
        def __init__(self, status, body=None):
            self.status_code, self._body, self.text = status, body or {}, "x"

        def json(self):
            return self._body

    class Client:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def get(self, url, headers=None, params=None):
            calls.append(("GET", url, dict(headers or {})))
            return Response(get_status, {"events": [{"etag": etag}]} if etag else {"events": [{}]})

        async def delete(self, url, headers=None):
            calls.append(("DELETE", url, dict(headers or {})))
            return Response(delete_status)

    monkeypatch.setattr(zc.httpx, "AsyncClient", Client)
    return zc.ZohoCalendar, calls


def test_deleting_a_zoho_event_sends_its_current_etag(monkeypatch):
    zoho, calls = _fake_zoho_client(monkeypatch, etag="E1")
    assert asyncio.run(zoho.delete_event("tok", "cal", "evt@zoho.com")) is True
    assert [c[0] for c in calls] == ["GET", "DELETE"]
    assert calls[1][2].get("etag") == "E1", "Zoho refuses a delete without the etag (400), so the event never went away"


def test_a_zoho_delete_that_is_refused_is_reported_as_not_deleted(monkeypatch):
    zoho, _ = _fake_zoho_client(monkeypatch, delete_status=400)
    assert asyncio.run(zoho.delete_event("tok", "cal", "evt@zoho.com")) is False


def test_an_event_that_cannot_even_be_read_is_not_claimed_as_deleted(monkeypatch):
    zoho, calls = _fake_zoho_client(monkeypatch, get_status=404, delete_status=404)
    assert asyncio.run(zoho.delete_event("tok", "cal", "evt@zoho.com")) is False
    assert "etag" not in calls[-1][2]
