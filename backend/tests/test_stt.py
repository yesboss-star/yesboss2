import asyncio

import pytest

from app.core import stt


def test_stt_none_provider_is_not_configured(monkeypatch):
    monkeypatch.setattr(stt.settings, "STT_PROVIDER", "none")
    with pytest.raises(stt.SttNotConfigured):
        asyncio.run(stt.transcribe_bytes(b"audio"))


def test_stt_unknown_provider_is_not_configured(monkeypatch):
    monkeypatch.setattr(stt.settings, "STT_PROVIDER", "carrier-pigeon")
    with pytest.raises(stt.SttNotConfigured):
        asyncio.run(stt.transcribe_bytes(b"audio"))


def test_stt_empty_audio_fails(monkeypatch):
    monkeypatch.setattr(stt.settings, "STT_PROVIDER", "whisper")
    with pytest.raises(stt.SttProviderError):
        asyncio.run(stt.transcribe_bytes(b""))


def test_stt_whisper_stub(monkeypatch):
    async def fake_whisper(audio, filename, language):
        return "hello world"

    monkeypatch.setattr(stt, "_whisper", fake_whisper)
    monkeypatch.setattr(stt.settings, "STT_PROVIDER", "whisper")
    assert asyncio.run(stt.transcribe_bytes(b"audio", "clip.webm")) == "hello world"


def test_stt_gemini_stub(monkeypatch):
    async def fake_gemini(audio, filename):
        return "bonjour"

    monkeypatch.setattr(stt, "_gemini", fake_gemini)
    monkeypatch.setattr(stt.settings, "STT_PROVIDER", "gemini")
    assert asyncio.run(stt.transcribe_bytes(b"audio")) == "bonjour"


def test_gemini_stt_uses_configured_model(monkeypatch):
    captured = {}

    class FakeResponse:
        status_code = 200

        def json(self):
            return {"candidates": [{"content": {"parts": [{"text": "blocked"}]}}]}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, params=None, json=None):
            captured["url"] = url
            return FakeResponse()

    monkeypatch.setattr(stt.httpx, "AsyncClient", FakeClient)
    monkeypatch.setattr(stt.settings, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(stt.settings, "STT_PROVIDER", "gemini")
    monkeypatch.setattr(stt.settings, "GEMINI_STT_MODEL", "gemini-3.8-flash")

    assert asyncio.run(stt.transcribe_bytes(b"audio")) == "blocked"
    assert "gemini-3.8-flash" in captured["url"]
    assert "gemini-2.5-flash" not in captured["url"]


def test_transcribe_endpoint_returns_501_when_disabled(client, monkeypatch):
    monkeypatch.setattr(stt.settings, "STT_PROVIDER", "none")
    resp = client.post(
        "/api/v1/assistant/transcribe",
        files={"file": ("clip.webm", b"audio-bytes", "audio/webm")},
        data={"language": "en-US"},
    )
    assert resp.status_code == 501
    assert "not configured" in resp.json()["detail"]


def test_transcribe_endpoint_stubbed_provider(client, monkeypatch):
    async def fake_transcribe(audio, filename="audio.webm", language="en-US"):
        assert audio == b"audio-bytes"
        return "send the report today"

    monkeypatch.setattr(stt.settings, "STT_PROVIDER", "whisper")
    monkeypatch.setattr(stt, "transcribe_bytes", fake_transcribe)
    resp = client.post(
        "/api/v1/assistant/transcribe",
        files={"file": ("clip.webm", b"audio-bytes", "audio/webm")},
    )
    assert resp.status_code == 200
    assert resp.json() == {"text": "send the report today", "provider": "whisper"}
