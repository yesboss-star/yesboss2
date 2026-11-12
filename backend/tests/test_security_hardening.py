"""Regression tests for the auth / owner-request hardening (offline)."""
import pytest
from fastapi.testclient import TestClient

import app.api.auth as auth_api
from app.core.config import settings
from app.dependencies.auth import get_current_user
from app.main import app

AUTH = "/api/v1/auth"


class U:
    def __init__(self, uid, email):
        self.id = uid
        self.uid = uid
        self.email = email
        self.custom_claims = {}


@pytest.fixture
def client(offline_db):
    c = TestClient(app)
    yield c
    app.dependency_overrides.clear()


def login_as(uid, email):
    app.dependency_overrides[get_current_user] = lambda: U(uid, email)


# ---------------------------------------------------------------- /auth/login
def test_login_requires_authentication(client):
    r = client.post(f"{AUTH}/login", json={"email": "emp@test.local", "password": "whatever"})
    assert r.status_code == 401


def test_login_cannot_look_up_someone_elses_profile(client):
    login_as("attacker", "attacker@test.local")
    r = client.post(f"{AUTH}/login", json={"email": "emp@test.local", "password": "whatever"})
    assert r.status_code == 403


# ---------------------------------------------------------------- operator-only endpoints
def test_role_change_needs_admin_key(client, monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_API_KEY", "s3cret")
    assert client.put(f"{AUTH}/user/emp-uid/role?role=owner").status_code == 404
    assert client.put(f"{AUTH}/user/emp-uid/role?role=owner", headers={"X-Admin-Key": "wrong"}).status_code == 404


def test_role_change_works_with_admin_key(client, offline_db, monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_API_KEY", "s3cret")
    monkeypatch.setattr(auth_api, "set_custom_user_claims", lambda uid, claims: None)
    r = client.put(f"{AUTH}/user/emp-uid/role?role=owner", headers={"X-Admin-Key": "s3cret"})
    assert r.status_code == 200
    assert offline_db.db.users.find_one({"uid": "emp-uid"})["role"] == "owner"


def test_admin_endpoints_stay_dark_when_no_key_configured(client, monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_API_KEY", "")
    assert client.put(f"{AUTH}/user/emp-uid/role?role=owner", headers={"X-Admin-Key": ""}).status_code == 404
    assert client.delete(f"{AUTH}/user/by-email/emp@test.local", headers={"X-Admin-Key": ""}).status_code == 404


def test_delete_user_needs_admin_key(client, offline_db):
    assert client.delete(f"{AUTH}/user/by-email/emp@test.local").status_code == 404
    assert offline_db.db.users.find_one({"email": "emp@test.local"}) is not None


# ---------------------------------------------------------------- /auth/update-phone
def test_update_phone_only_for_own_uid(client, offline_db, monkeypatch):
    monkeypatch.setattr(auth_api, "update_user", lambda *a, **k: None)
    assert client.post(f"{AUTH}/update-phone", json={"uid": "emp-uid", "phone": "+911234567890"}).status_code == 401
    login_as("attacker", "attacker@test.local")
    r = client.post(f"{AUTH}/update-phone", json={"uid": "emp-uid", "phone": "+911234567890"})
    assert r.status_code == 403
    assert offline_db.db.users.find_one({"uid": "emp-uid"}).get("phone") is None
    login_as("emp-uid", "emp@test.local")
    assert client.post(f"{AUTH}/update-phone", json={"uid": "emp-uid", "phone": "+911234567890"}).status_code == 200


# ---------------------------------------------------------------- forgot-password OTP exposure
def _patch_forgot(monkeypatch):
    monkeypatch.setattr(auth_api, "get_user_by_email", lambda email: type("X", (), {"uid": "emp-uid"})())
    monkeypatch.setattr(auth_api, "generate_password_reset_link", lambda c: "link")


def test_forgot_password_does_not_leak_otp_in_production(client, monkeypatch):
    _patch_forgot(monkeypatch)
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    r = client.post(f"{AUTH}/forgot-password/send-otp", json={"email": "emp@test.local"})
    assert r.status_code == 200
    assert r.json()["debug_otp"] is None


def test_forgot_password_still_prefills_otp_in_development(client, monkeypatch):
    _patch_forgot(monkeypatch)
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    r = client.post(f"{AUTH}/forgot-password/send-otp", json={"email": "emp@test.local"})
    assert r.status_code == 200 and len(r.json()["debug_otp"]) == 6


def test_phone_password_reset_refused_in_production(client, monkeypatch):
    monkeypatch.setattr(auth_api, "get_user_by_phone", lambda p: type("X", (), {"uid": "emp-uid"})())
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    r = client.post(f"{AUTH}/forgot-password/send-otp", json={"phone": "+911234567890"})
    assert r.status_code == 400


# ---------------------------------------------------------------- owner (co-owner) requests
def test_owner_request_links_not_returned_in_production(client, offline_db, monkeypatch):
    o = offline_db
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    login_as("evil-uid", "evil@test.local")
    r = client.post(f"/api/v1/organizations/{o.org}/request-owner",
                    json={"uid": "evil-uid", "email": "evil@test.local", "full_name": "Evil"})
    assert r.status_code == 200
    body = r.json()
    assert "approve_link" not in body and "reject_link" not in body


def test_owner_requests_listing_is_owner_only_and_hides_tokens(client, offline_db):
    o = offline_db
    o.db.owner_requests.insert_one({"org_id": o.org, "requester_uid": "x", "status": "pending", "token": "TOP-SECRET"})
    url = f"/api/v1/organizations/{o.org}/owner-requests"
    assert client.get(url).status_code == 401
    login_as("emp-uid", "emp@test.local")
    assert client.get(url).status_code == 403
    login_as(o.owner_uid, o.owner_email)
    r = client.get(url)
    assert r.status_code == 200 and "TOP-SECRET" not in r.text


def test_owner_request_status_bad_id_is_404_not_500(client):
    assert client.get("/api/v1/owner-requests/not-an-object-id/status").status_code == 404
