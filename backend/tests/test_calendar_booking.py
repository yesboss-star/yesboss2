"""Booking a meeting: whose calendars get written, and which organization owns the meeting."""
import asyncio

import pytest

import app.api.google_calendar as gcal_api
import app.api.zoho_calendar as zcal_api


class U:
    def __init__(self, uid, email):
        self.id = uid
        self.uid = uid
        self.email = email
        self.custom_claims = {}


STRANGER_EMAIL = "stranger@other-company.test"


@pytest.fixture
def zoho(offline_db, monkeypatch):
    """Organizer is an employee (their token record has no org id, as the OAuth callback leaves it),
    one attendee is a colleague, one is a connected user of a different company."""
    o = offline_db
    o.db.zoho_tokens.insert_many([
        {"user_id": "emp-uid", "email": o.emp, "org_id": "", "access_token": "x"},
        {"user_id": "mgr-uid", "email": o.mgr, "org_id": "", "access_token": "x"},
        {"user_id": "stranger-uid", "email": STRANGER_EMAIL, "org_id": "other-org", "access_token": "x"},
    ])
    written = []

    async def valid_token(self, user_id):
        return f"tok-{user_id}"

    async def cal_uid(token):
        return f"cal-{token}"

    async def create_event(**kw):
        written.append(kw["user_token"])
        return f"evt-{kw['user_token']}"

    monkeypatch.setattr(zcal_api.ZohoOAuth, "get_valid_token", valid_token)
    monkeypatch.setattr(zcal_api.ZohoCalendar, "get_default_calendar_uid", staticmethod(cal_uid))
    monkeypatch.setattr(zcal_api.ZohoCalendar, "create_event", staticmethod(create_event))
    o.written = written
    return o


@pytest.fixture
def google(offline_db, monkeypatch):
    o = offline_db
    o.db.google_tokens.insert_many([
        {"user_id": "emp-uid", "email": o.emp, "org_id": "", "access_token": "x"},
        {"user_id": "mgr-uid", "email": o.mgr, "org_id": "", "access_token": "x"},
        {"user_id": "stranger-uid", "email": STRANGER_EMAIL, "org_id": "other-org", "access_token": "x"},
    ])
    written = []

    async def valid_token(self, user_id):
        return f"tok-{user_id}"

    async def cal_id(token):
        return f"cal-{token}"

    async def create_event(**kw):
        written.append(kw["user_token"])
        return f"evt-{kw['user_token']}"

    monkeypatch.setattr(gcal_api.GoogleOAuth, "get_valid_token", valid_token)
    monkeypatch.setattr(gcal_api.GoogleCalendar, "get_primary_calendar_id", staticmethod(cal_id))
    monkeypatch.setattr(gcal_api.GoogleCalendar, "create_event", staticmethod(create_event))
    o.written = written
    return o


def booking(module, o):
    return module.BookEventRequest(
        title="Budget review", description="d", start="2026-11-05T10:00:00+05:30", end="2026-11-05T11:00:00+05:30",
        attendees=[{"email": o.mgr}, {"email": STRANGER_EMAIL}],
    )


async def settle():
    await asyncio.sleep(0.3)


@pytest.mark.parametrize("which", ["zoho", "google"])
async def test_events_are_only_written_into_colleagues_calendars(which, request):
    o = request.getfixturevalue(which)
    module = zcal_api if which == "zoho" else gcal_api
    await module.book_event(booking(module, o), current_user=U("emp-uid", o.emp))
    await settle()
    assert "tok-emp-uid" in o.written and "tok-mgr-uid" in o.written
    assert "tok-stranger-uid" not in o.written, "an event was written into another company's calendar"


@pytest.mark.parametrize("which", ["zoho", "google"])
async def test_the_meeting_belongs_to_the_organizers_org_even_for_employees(which, request):
    o = request.getfixturevalue(which)
    module = zcal_api if which == "zoho" else gcal_api
    await module.book_event(booking(module, o), current_user=U("emp-uid", o.emp))
    await settle()
    meeting = o.db.meetings.find_one({"title": "Budget review"})
    assert meeting["organization_id"] == o.org, "employee-booked meetings lose their organization"
    assert o.db.calendar_events.find_one({"title": "Budget review"})["organization_id"] == o.org


@pytest.mark.parametrize("which", ["zoho", "google"])
async def test_attendees_are_notified_in_app(which, request):
    o = request.getfixturevalue(which)
    module = zcal_api if which == "zoho" else gcal_api
    await module.book_event(booking(module, o), current_user=U("emp-uid", o.emp))
    await settle()
    assert o.db.notifications.count_documents({"type": "meeting_scheduled"}) >= 1


# ---------------------------------------------------------------- free/busy and people search
async def test_zoho_freebusy_never_reads_other_companies_calendars(zoho, monkeypatch):
    o = zoho
    probed = []

    async def fake_fb(token, email, start, end):
        probed.append(email)
        return []

    monkeypatch.setattr(zcal_api.ZohoCalendar, "check_freebusy", staticmethod(fake_fb))
    res = await zcal_api.check_freebusy(emails=f"{o.mgr},{STRANGER_EMAIL}", date="2026-11-05",
                                        from_time="09:00", to_time="18:00", current_user=U("emp-uid", o.emp))
    assert probed == [o.mgr]
    assert STRANGER_EMAIL in str(res)  # reported as not checked


async def test_google_freebusy_never_reads_other_companies_calendars(google, monkeypatch):
    o = google
    probed = []

    async def fake_fb(token, emails, start, end):
        probed.extend(emails)
        return []

    monkeypatch.setattr(gcal_api.GoogleCalendar, "get_freebusy", staticmethod(fake_fb))
    await gcal_api.check_freebusy(emails=f"{o.mgr},{STRANGER_EMAIL}", date="2026-11-05", from_time="09:00",
                                  to_time="18:00", timezone="Asia/Kolkata", current_user=U("emp-uid", o.emp))
    assert probed == [o.mgr]


@pytest.mark.parametrize("which", ["zoho", "google"])
async def test_people_search_is_limited_to_the_callers_organization(which, request):
    o = request.getfixturevalue(which)
    module = zcal_api if which == "zoho" else gcal_api
    o.db.employees.insert_many([
        {"email": "alice@test.local", "full_name": "Alice Mine", "organization_id": o.org},
        {"email": "alice@other-company.test", "full_name": "Alice Theirs", "organization_id": "other-org"},
    ])
    res = await module.search_users(q="alice", limit=10, current_user=U("emp-uid", o.emp))
    emails = {u["email"] for u in res["users"]}
    assert "alice@test.local" in emails and "alice@other-company.test" not in emails
