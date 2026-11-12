"""Co-owner request flow end to end (offline): identity, e-mail, approval, expiry, injection."""
from datetime import datetime, timedelta

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from app.core.config import settings
from app.dependencies.auth import get_current_user
from app.dependencies.scope import is_org_owner
from app.main import app

REQ_UID, REQ_EMAIL = "req-uid", "req@test.local"


class U:
    def __init__(self, uid, email):
        self.id = uid
        self.uid = uid
        self.email = email
        self.custom_claims = {}


@pytest.fixture
def flow(offline_db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    who = {"u": None}

    def current():
        if who["u"] is None:
            from fastapi import HTTPException
            raise HTTPException(status_code=401, detail="Not authenticated")
        return who["u"]

    app.dependency_overrides[get_current_user] = current

    class F:
        o = offline_db
        c = TestClient(app)
        url = f"/api/v1/organizations/{offline_db.org}/request-owner"

        @staticmethod
        def login(uid=REQ_UID, email=REQ_EMAIL):
            who["u"] = U(uid, email)

        @staticmethod
        def logout():
            who["u"] = None

        @staticmethod
        def request(**body):
            payload = {"uid": REQ_UID, "email": REQ_EMAIL, "full_name": "Req User"}
            payload.update(body)
            return F.c.post(F.url, json=payload)

        @staticmethod
        def doc():
            return offline_db.db.owner_requests.find_one({})

        @staticmethod
        def token():
            return F.doc()["token"]

        @staticmethod
        def co_owners():
            return offline_db.db.organizations.find_one({"_id": ObjectId(offline_db.org)}).get("co_owners") or []

    F.login()
    yield F
    app.dependency_overrides.pop(get_current_user, None)


def owner_mails(f):
    return [m for m in f.o.mail if f.o.owner_email in m["to"]]


def mail_text(m):
    return m["msg"].replace("=\n", "")


# ---------------------------------------------------------------- creating the request
def test_request_requires_login(flow):
    flow.logout()
    assert flow.request().status_code == 401


def test_request_uses_the_authenticated_identity_not_the_body(flow):
    r = flow.request(uid="someone-else", email="ceo@victim.test", full_name="Real Name")
    assert r.status_code == 200, r.text
    doc = flow.doc()
    assert doc["requester_uid"] == REQ_UID and doc["requester_email"] == REQ_EMAIL


def test_owner_receives_an_email_with_working_links(flow):
    flow.request()
    mails = owner_mails(flow)
    assert mails, "the primary owner was not emailed"
    text = mail_text(mails[0])
    assert f"/owner-requests/{flow.token()}/approve" in text and f"/owner-requests/{flow.token()}/reject" in text


def test_requester_name_is_html_escaped_in_the_owner_email(flow):
    flow.request(full_name='<script>alert(1)</script><img src=x onerror=y>')
    html = html_part(owner_mails(flow)[0])  # the plain-text alternative is not rendered as HTML
    assert "<script>alert(1)</script>" not in html and "<img src=x" not in html
    assert "&lt;script&gt;" in html


def test_status_endpoint_reports_pending(flow):
    flow.request()
    rid = str(flow.doc()["_id"])
    assert flow.c.get(f"/api/v1/owner-requests/{rid}/status").json()["status"] == "pending"


# ---------------------------------------------------------------- approving / rejecting
def test_opening_the_emailed_link_does_not_approve(flow):
    """Mail scanners and link previewers open every link in an email; a GET must be harmless."""
    flow.request()
    r = flow.c.get(f"/api/v1/owner-requests/{flow.token()}/approve")
    assert r.status_code == 200
    assert flow.doc()["status"] == "pending" and REQ_UID not in flow.co_owners()
    r = flow.c.get(f"/api/v1/owner-requests/{flow.token()}/reject")
    assert flow.doc()["status"] == "pending"


def test_confirming_approves_once_and_notifies_the_requester(flow):
    flow.request()
    page = flow.c.get(f"/api/v1/owner-requests/{flow.token()}/approve").text
    assert 'method="post"' in page.lower()
    ok = flow.c.post(f"/api/v1/owner-requests/{flow.token()}/approve")
    assert ok.status_code == 200
    assert flow.doc()["status"] == "approved"
    assert REQ_UID in flow.co_owners()
    assert any(REQ_EMAIL in m["to"] for m in flow.o.mail), "requester was not told"
    import asyncio
    assert asyncio.run(is_org_owner(flow.o.db, flow.o.org, U(REQ_UID, REQ_EMAIL)))
    assert flow.c.post(f"/api/v1/owner-requests/{flow.token()}/approve").status_code == 400  # single use


def test_rejecting_does_not_grant_access(flow):
    flow.request()
    assert flow.c.post(f"/api/v1/owner-requests/{flow.token()}/reject").status_code == 200
    assert flow.doc()["status"] == "rejected" and REQ_UID not in flow.co_owners()
    assert flow.c.post(f"/api/v1/owner-requests/{flow.token()}/approve").status_code == 400


def test_unknown_token_is_404(flow):
    assert flow.c.post("/api/v1/owner-requests/not-a-real-token/approve").status_code == 404
    assert flow.c.get("/api/v1/owner-requests/not-a-real-token/approve").status_code == 404


def test_old_requests_expire(flow):
    flow.request()
    flow.o.db.owner_requests.update_one({}, {"$set": {"created_at": (datetime.utcnow() - timedelta(days=30)).isoformat()}})
    r = flow.c.post(f"/api/v1/owner-requests/{flow.token()}/approve")
    assert r.status_code == 410
    assert REQ_UID not in flow.co_owners()


def test_resending_a_request_issues_a_new_token_and_keeps_one_record(flow):
    flow.request()
    first = flow.token()
    flow.request()
    assert flow.o.db.owner_requests.count_documents({}) == 1
    assert flow.token() != first
    assert flow.c.post(f"/api/v1/owner-requests/{first}/approve").status_code == 404


def test_existing_owner_is_not_added_as_co_owner(flow):
    flow.login(flow.o.owner_uid, flow.o.owner_email)
    flow.request(uid=flow.o.owner_uid, email=flow.o.owner_email)
    flow.c.post(f"/api/v1/owner-requests/{flow.token()}/approve")
    assert flow.o.owner_uid not in flow.co_owners()


def html_part(m) -> str:
    import email

    msg = email.message_from_string(m["msg"])
    for part in msg.walk():
        if part.get_content_type() == "text/html":
            return part.get_payload(decode=True).decode("utf-8")
    return ""
