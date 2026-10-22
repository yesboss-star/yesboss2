"""Optional speech-to-text (Phase 3).

Provider is selected with `STT_PROVIDER`:
  * `none`    → feature disabled (callers should surface a 501)
  * `whisper` → OpenAI Whisper (`OPENAI_API_KEY`)
  * `gemini`  → Google Gemini generateContent (`GEMINI_API_KEY`)

Browser SpeechRecognition remains the default voice path; this module only
backs the optional server-side `/assistant/transcribe` endpoint and Cliq
voice-note transcription.
"""

import base64
import logging
from typing import Any

import httpx

from .config import settings

logger = logging.getLogger("yesboss.stt")

_PROMPT = "Transcribe this audio verbatim. Return only the transcript text."
_MAX_BYTES = 25 * 1024 * 1024


class SttNotConfigured(Exception):
    """STT is disabled or the selected provider has no credentials."""


class SttProviderError(Exception):
    """The provider rejected the audio or returned nothing."""


def _mime_for(filename: str) -> str:
    name = (filename or "").lower()
    if name.endswith(".mp3"):
        return "audio/mpeg"
    if name.endswith(".wav"):
        return "audio/wav"
    if name.endswith(".ogg") or name.endswith(".oga"):
        return "audio/ogg"
    if name.endswith(".m4a"):
        return "audio/mp4"
    if name.endswith(".mp4"):
        return "video/mp4"
    return "audio/webm"


def _provider() -> str:
    return (getattr(settings, "STT_PROVIDER", "none") or "none").strip().lower()


async def transcribe_bytes(
    audio: bytes,
    filename: str = "audio.webm",
    language: str = "en-US",
) -> str:
    provider = _provider()
    if provider in ("", "none", "disabled", "off"):
        raise SttNotConfigured("Speech-to-text is not configured (STT_PROVIDER=none).")
    if not audio:
        raise SttProviderError("Empty audio payload.")
    if len(audio) > _MAX_BYTES:
        raise SttProviderError("Audio exceeds the 25 MB limit.")
    if provider == "whisper":
        text = await _whisper(audio, filename, language)
    elif provider == "gemini":
        text = await _gemini(audio, filename)
    else:
        raise SttNotConfigured(f"Unsupported STT_PROVIDER '{provider}'.")
    text = (text or "").strip()
    if not text:
        raise SttProviderError("Transcription returned no text.")
    return text


async def _whisper(audio: bytes, filename: str, language: str) -> str:
    key = getattr(settings, "OPENAI_API_KEY", "") or ""
    if not key:
        raise SttNotConfigured("OPENAI_API_KEY is required when STT_PROVIDER=whisper.")
    data: dict[str, Any] = {"model": "whisper-1"}
    if language:
        data["language"] = language.split("-")[0]
    files = {"file": (filename or "audio.webm", audio, _mime_for(filename))}
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {key}"},
                data=data,
                files=files,
            )
        if resp.status_code >= 400:
            raise SttProviderError(f"Whisper failed ({resp.status_code}): {resp.text[:200]}")
        return str((resp.json() or {}).get("text") or "")
    except SttProviderError:
        raise
    except Exception as e:
        raise SttProviderError(f"Whisper request failed: {e}") from e


async def _gemini(audio: bytes, filename: str) -> str:
    key = getattr(settings, "GEMINI_API_KEY", "") or ""
    if not key:
        raise SttNotConfigured("GEMINI_API_KEY is required when STT_PROVIDER=gemini.")
    payload = {
        "contents": [{
            "parts": [
                {"text": _PROMPT},
                {"inline_data": {
                    "mime_type": _mime_for(filename),
                    "data": base64.b64encode(audio).decode(),
                }},
            ],
        }],
    }
    model = getattr(settings, "GEMINI_STT_MODEL", "gemini-3.8-flash") or "gemini-3.8-flash"
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent"
    )
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(url, params={"key": key}, json=payload)
        if resp.status_code >= 400:
            raise SttProviderError(f"Gemini STT failed ({resp.status_code}): {resp.text[:200]}")
        data = resp.json() or {}
        parts = (((data.get("candidates") or [{}])[0].get("content") or {}).get("parts") or [])
        return "".join(str(p.get("text") or "") for p in parts if isinstance(p, dict))
    except SttProviderError:
        raise
    except Exception as e:
        raise SttProviderError(f"Gemini request failed: {e}") from e
