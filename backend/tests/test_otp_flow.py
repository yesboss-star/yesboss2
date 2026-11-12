"""Signup + password-reset OTP flows: delivery, expiry and brute-force limits (offline)."""
import re
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

import app.api.auth as auth_api
from app.core.config import settings
from app.main import app

AUTH = "/api/v1/auth"
EMAIL = "newuser@test.local"


@pytest.fixture
def client(offline_db):
    return TestClient(app)


def otp_in_db(offline_db, coll="signup_otps", **q):
    return offline_db.db[coll].find_one(q)["otp"]


def wrong_code(real: str) -> str:
    return "000000" if real != "000000" else "111111"


# ---------------------------------------------------------------- signup OTP
def test_signup_otp_is_emailed_to_the_user(client, offline_db):
    r = client.post(f"{AUTH}/send-otp", json={"email": EMAIL})
    assert r.status_code == 200, r.text
    code = otp_in_db(offline_db, email=EMAIL)
    assert re.fullmatch(r"\d{6}", code)
    mails = [m for m in offline_db.mail if EMAIL in m["to"]]
    assert mails, "no OTP email was sent"
    assert code in mails[0]["msg"] or code in mails[0]["msg"].replace("=\n", "")


def test_signup_otp_response_never_contains_the_code(client, offline_db, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    r = client.post(f"{AUTH}/send-otp", json={"email": EMAIL})
    assert otp_in_db(offline_db, email=EMAIL) not in r.text


def test_signup_otp_verify_happy_path_and_wrong_code(client, offline_db):
    client.post(f"{AUTH}/send-otp", json={"email": EMAIL})
    code = otp_in_db(offline_db, email=EMAIL)
    assert client.post(f"{AUTH}/verify-otp", json={"email": EMAIL, "code": wrong_code(code)}).status_code == 400
    ok = client.post(f"{AUTH}/verify-otp", json={"email": EMAIL, "code": code})
    assert ok.status_code == 200 and ok.json()["success"] is True


def test_signup_otp_expires(client, offline_db):
    client.post(f"{AUTH}/send-otp", json={"email": EMAIL})
    code = otp_in_db(offline_db, email=EMAIL)
    offline_db.db.signup_otps.update_one({"email": EMAIL}, {"$set": {"expires_at": datetime.utcnow() - timedelta(seconds=1)}})
    assert client.post(f"{AUTH}/verify-otp", json={"email": EMAIL, "code": code}).status_code == 400


def test_signup_otp_cannot_be_brute_forced(client, offline_db):
    client.post(f"{AUTH}/send-otp", json={"email": EMAIL})
    code = otp_in_db(offline_db, email=EMAIL)
    bad = wrong_code(code)
    for _ in range(6):
        client.post(f"{AUTH}/verify-otp", json={"email": EMAIL, "code": bad})
    r = client.post(f"{AUTH}/verify-otp", json={"email": EMAIL, "code": code})
    assert r.status_code in (400, 429), "the correct code still verified after 6 wrong guesses"
    assert not r.json().get("success")


def test_signup_otp_new_code_resets_the_attempt_counter(client, offline_db, monkeypatch):
    monkeypatch.setattr(auth_api, "OTP_RESEND_COOLDOWN_SECONDS", 0, raising=False)
    client.post(f"{AUTH}/send-otp", json={"email": EMAIL})
    bad = wrong_code(otp_in_db(offline_db, email=EMAIL))
    for _ in range(6):
        client.post(f"{AUTH}/verify-otp", json={"email": EMAIL, "code": bad})
    client.post(f"{AUTH}/send-otp", json={"email": EMAIL})
    code = otp_in_db(offline_db, email=EMAIL)
    assert client.post(f"{AUTH}/verify-otp", json={"email": EMAIL, "code": code}).status_code == 200


def test_signup_otp_resend_is_rate_limited(client, offline_db):
    assert client.post(f"{AUTH}/send-otp", json={"email": EMAIL}).status_code == 200
    again = client.post(f"{AUTH}/send-otp", json={"email": EMAIL})
    assert again.status_code == 429, "an email address can be spammed with unlimited OTP mails"


# ---------------------------------------------------------------- password reset OTP
def _patch_user(monkeypatch):
    monkeypatch.setattr(auth_api, "get_user_by_email", lambda email: type("X", (), {"uid": "emp-uid"})())
    monkeypatch.setattr(auth_api, "generate_password_reset_link", lambda c: "link")


def test_password_reset_otp_is_emailed_and_verifies(client, offline_db, monkeypatch):
    _patch_user(monkeypatch)
    r = client.post(f"{AUTH}/forgot-password/send-otp", json={"email": "emp@test.local"})
    assert r.status_code == 200
    code = otp_in_db(offline_db, "password_reset_codes", contact="emp@test.local")
    assert any("emp@test.local" in m["to"] for m in offline_db.mail)
    ok = client.post(f"{AUTH}/forgot-password/verify-otp", json={"email": "emp@test.local", "otp": code})
    assert ok.status_code == 200 and ok.json()["reset_token"]


def test_password_reset_otp_cannot_be_brute_forced(client, offline_db, monkeypatch):
    _patch_user(monkeypatch)
    client.post(f"{AUTH}/forgot-password/send-otp", json={"email": "emp@test.local"})
    code = otp_in_db(offline_db, "password_reset_codes", contact="emp@test.local")
    bad = wrong_code(code)
    for _ in range(6):
        client.post(f"{AUTH}/forgot-password/verify-otp", json={"email": "emp@test.local", "otp": bad})
    r = client.post(f"{AUTH}/forgot-password/verify-otp", json={"email": "emp@test.local", "otp": code})
    assert r.status_code in (400, 429), "the reset code still verified after 6 wrong guesses"


def test_password_reset_with_unverified_token_is_refused(client, offline_db, monkeypatch):
    _patch_user(monkeypatch)
    client.post(f"{AUTH}/forgot-password/send-otp", json={"email": "emp@test.local"})
    token = offline_db.db.password_reset_codes.find_one({"contact": "emp@test.local"})["reset_token"]
    r = client.post(f"{AUTH}/forgot-password/reset", json={"email": "emp@test.local", "reset_token": token, "new_password": "newpass123"})
    assert r.status_code in (400, 403)
