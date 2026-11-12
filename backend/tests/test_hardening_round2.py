"""OAuth state signing, SSRF guard, upload path safety, WebSocket relay, scheduler lease (offline)."""
import socket

import pytest
import requests
from fastapi.testclient import TestClient

import app.core.scheduler as sched
from app.core import url_guard
from app.core.oauth_state import STATE_MAX_AGE_SECONDS, sign_state, verify_state
from app.main import app
from app.utils.helpers import safe_filename, safe_path_segment


class U:
    def __init__(self, uid, email):
        self.id = uid
        self.uid = uid
        self.email = email
        self.custom_claims = {}


# ---------------------------------------------------------------- OAuth state
def test_state_roundtrip_and_tamper_detection():
    s = sign_state("user-1", now=1_000_000)
    assert verify_state(s, now=1_000_100) == "user-1"
    uid, ts, sig = s.rsplit(":", 2)
    assert verify_state(f"victim:{ts}:{sig}", now=1_000_100) is None  # swapped uid
    assert verify_state(f"{uid}:{ts}:{'0' * 64}", now=1_000_100) is None  # bad signature
    assert verify_state("victim-uid", now=1_000_100) is None  # the old raw-uid state
    assert verify_state(None) is None and verify_state("") is None


def test_state_expires():
    s = sign_state("user-1", now=1_000_000)
    assert verify_state(s, now=1_000_000 + STATE_MAX_AGE_SECONDS + 1) is None


@pytest.mark.parametrize("provider", ["zoho", "google"])
def test_oauth_callback_rejects_forged_or_missing_state(offline_db, provider):
    c = TestClient(app)
    assert c.get(f"/api/v1/{provider}/callback?code=abc&state=victim-uid").status_code == 400
    assert c.get(f"/api/v1/{provider}/callback?code=abc").status_code == 400


# ---------------------------------------------------------------- SSRF guard
@pytest.mark.parametrize("url", [
    "http://169.254.169.254/latest/meta-data/",
    "http://localhost:8000/api/v1/",
    "http://127.0.0.1/",
    "http://[::1]/",
    "http://10.0.0.5/",
    "http://192.168.1.1/",
    "http://0.0.0.0/",
    "ftp://example.com/x",
    "file:///etc/passwd",
    "http://metadata.internal/",
    "not a url",
])
def test_private_and_odd_urls_are_rejected(url):
    with pytest.raises(url_guard.UnsafeURLError):
        url_guard.assert_public_url(url)


def test_public_ip_literal_allowed():
    url_guard.assert_public_url("https://8.8.8.8/")


def test_hostname_resolving_to_private_ip_is_rejected(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **k: [(2, 1, 6, "", ("10.1.2.3", 80))])
    with pytest.raises(url_guard.UnsafeURLError):
        url_guard.assert_public_url("http://evil.example.com/")


def test_hostname_resolving_to_public_ip_is_allowed(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **k: [(2, 1, 6, "", ("93.184.216.34", 80))])
    url_guard.assert_public_url("http://example.com/")


def test_redirect_to_internal_address_is_blocked(monkeypatch):
    calls = []

    class R:
        status_code = 302
        headers = {"Location": "http://169.254.169.254/latest/meta-data/"}

    def fake_request(method, url, **kw):
        calls.append(url)
        return R()

    monkeypatch.setattr(requests, "request", fake_request)
    with pytest.raises(url_guard.UnsafeURLError):
        url_guard.safe_get("http://8.8.8.8/")
    assert calls == ["http://8.8.8.8/"], "the internal hop must never be requested"


def test_scrape_endpoint_never_fetches_internal_hosts(offline_db, bypass_guards, monkeypatch):
    def boom(*a, **k):
        raise AssertionError("an outbound request was made to an internal host")

    monkeypatch.setattr(requests, "request", boom)
    r = TestClient(app).post("/api/v1/scrape/scrape", json={"domain": "169.254.169.254"})
    assert r.status_code == 200
    assert not r.json()["homepage_content"]


# ---------------------------------------------------------------- upload path safety
@pytest.mark.parametrize("raw,expected", [
    ("../../app/main.py", "main.py"),
    ("..\\..\\windows\\evil.exe", "evil.exe"),
    ("/etc/passwd", "passwd"),
    ("report 2026.pdf", "report 2026.pdf"),
    ("", "upload"),
    (None, "upload"),
    ("....", "upload"),
])
def test_safe_filename(raw, expected):
    assert safe_filename(raw) == expected


def test_safe_path_segment():
    assert safe_path_segment("6a701c5f6183f425010e290d") == "6a701c5f6183f425010e290d"
    assert safe_path_segment("../../etc") == "temp"
    assert safe_path_segment("a/b") == "temp"
    assert safe_path_segment("") == "temp"


# ---------------------------------------------------------------- WebSocket relay
def test_clients_cannot_relay_notifications_to_other_users(offline_db, monkeypatch):
    import app.core.firebase_admin as fb
    from app.api.websocket import manager

    o = offline_db
    monkeypatch.setattr(fb, "verify_id_token", lambda token: U(o.owner_uid, o.owner_email))
    received = []

    class Victim:
        async def send_json(self, data):
            received.append(data)

    manager.user_connections["victim-uid"] = {Victim()}
    with TestClient(app).websocket_connect(f"/ws/{o.org}?token=t") as ws:
        ws.send_json({"type": "notification", "user_id": "victim-uid", "data": {"title": "phish"}})
        ws.send_json({"type": "task_update", "data": {"title": "fake"}})
        ws.send_json({"type": "ping"})
        assert ws.receive_json() == {"type": "pong"}
    assert received == []


# ---------------------------------------------------------------- scheduler leadership
def test_only_one_scheduler_holds_the_lease(offline_db, monkeypatch):
    db = offline_db.db
    from datetime import datetime, timedelta

    now = datetime(2026, 1, 1, 12, 0, 0)
    monkeypatch.setattr(sched, "_SCHEDULER_ID", "worker-a")
    assert sched.acquire_scheduler_lease(db, now) is True
    assert sched.acquire_scheduler_lease(db, now + timedelta(seconds=300)) is True  # renews

    monkeypatch.setattr(sched, "_SCHEDULER_ID", "worker-b")
    assert sched.acquire_scheduler_lease(db, now + timedelta(seconds=310)) is False  # a holds it

    later = now + timedelta(seconds=300 + sched.LEADER_LEASE_SECONDS + 5)  # a stopped renewing
    assert sched.acquire_scheduler_lease(db, later) is True
    monkeypatch.setattr(sched, "_SCHEDULER_ID", "worker-a")
    assert sched.acquire_scheduler_lease(db, later + timedelta(seconds=1)) is False
