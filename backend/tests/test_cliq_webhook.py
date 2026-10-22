"""Phase 0 — Zoho Cliq webhook skeleton tests (additive only)."""

import asyncio
import hashlib
import hmac
import json
import time

from app.api.zoho_cliq import _run_and_drain
from app.core.config import settings
from app.core.zoho.cliq import ZohoCliq, verify_webhook_signature


def _sig(raw: bytes, token: str) -> str:
    return hmac.new(token.encode(), raw, hashlib.sha256).hexdigest()


def test_bot_capabilities(client):
    resp = client.get("/api/v1/zoho/cliq/bot/capabilities")
    assert resp.status_code == 200
    data = resp.json()
    assert data["bot"] == "YesBoss"
    assert data["dc"] == "zoho.com"
    assert data["inputs"] == ["text", "button", "voice-note"]
    assert data["followups"] == "cliq-only"


def test_webhook_invalid_signature_acks(client):
    raw = json.dumps({"sender": {"email": "a@x.com"}}).encode()
    start = time.monotonic()
    resp = client.post(
        "/api/v1/zoho/cliq/webhook",
        content=raw,
        headers={"Content-Type": "application/json", "X-Cliq-Signature": "bad"},
    )
    assert time.monotonic() - start < 2
    assert resp.status_code == 200
    assert resp.json() == {"ok": True, "verified": False}


def test_webhook_valid_signature_acks(client, monkeypatch):
    monkeypatch.setattr(settings, "ZOHO_CLIQ_VERIFY_TOKEN", "test-secret")
    body = {"sender": {"email": "a@x.com"}, "button": {"payload": {"task_id": "t1", "action": "started"}}}
    raw = json.dumps(body).encode()
    start = time.monotonic()
    resp = client.post(
        "/api/v1/zoho/cliq/webhook",
        content=raw,
        headers={"Content-Type": "application/json", "X-Cliq-Signature": _sig(raw, "test-secret")},
    )
    assert time.monotonic() - start < 2
    assert resp.status_code == 200
    assert resp.json() == {"ok": True, "verified": True}


def test_verify_helper_fail_closed(monkeypatch):
    monkeypatch.setattr(settings, "ZOHO_CLIQ_VERIFY_TOKEN", "")
    assert verify_webhook_signature(b"{}", "anything") is False


def test_verify_helper_accepts_plain_token(monkeypatch):
    # Deluge handler forwards the shared secret verbatim (no HMAC possible).
    monkeypatch.setattr(settings, "ZOHO_CLIQ_VERIFY_TOKEN", "s3cr3t-token")
    assert verify_webhook_signature(b'{"a":1}', "s3cr3t-token") is True
    assert verify_webhook_signature(b'{"a":1}', "wrong") is False


def test_webhook_plain_token_acks_verified(client, monkeypatch):
    monkeypatch.setattr(settings, "ZOHO_CLIQ_VERIFY_TOKEN", "s3cr3t-token")
    raw = json.dumps({"sender": {"email": "a@x.com"}}).encode()
    resp = client.post(
        "/api/v1/zoho/cliq/webhook",
        content=raw,
        headers={"Content-Type": "application/json", "X-Cliq-Signature": "s3cr3t-token"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"ok": True, "verified": True}


def test_webhook_runner_drains_fire_and_forget_tasks():
    completed = []

    async def child():
        await asyncio.sleep(0.05)
        completed.append(True)

    async def parent():
        asyncio.create_task(child())

    asyncio.run(_run_and_drain(parent(), timeout=2))

    assert completed == [True]


def test_cliq_stub_returns_none_when_unconfigured(monkeypatch):
    monkeypatch.setattr(settings, "ZOHO_CLIQ_ENABLED", True)
    monkeypatch.setattr(settings, "ZOHO_CLIQ_BOT_ID", "")
    result = asyncio.run(ZohoCliq(db=None).send_dm("a@x.com", "hello"))
    assert result is None


def test_cliq_disabled_returns_none(monkeypatch):
    monkeypatch.setattr(settings, "ZOHO_CLIQ_ENABLED", False)
    monkeypatch.setattr(settings, "ZOHO_CLIQ_BOT_ID", "bot123")
    result = asyncio.run(ZohoCliq(db=None).send_dm("a@x.com", "hello"))
    assert result is None
