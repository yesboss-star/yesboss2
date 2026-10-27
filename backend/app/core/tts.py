"""Text-to-speech for the journal, backed by Gemini TTS (GEMINI_API_KEY).

Returns WAV bytes (24 kHz mono 16-bit). Results are cached in memory so replaying
the same reply costs no extra API usage.
"""

import base64
import hashlib
import logging
from collections import OrderedDict

import httpx

from .config import settings

logger = logging.getLogger("yesboss.tts")

_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions"
_MAX_CHARS = 2500
_CACHE_MAX = 64
_cache: "OrderedDict[str, bytes]" = OrderedDict()


class TtsNotConfigured(Exception):
    """No Gemini API key is available."""


class TtsProviderError(Exception):
    """Gemini rejected the request or returned no audio."""


def _model() -> str:
    return getattr(settings, "GEMINI_TTS_MODEL", "") or "gemini-3.8-flash-lite-tts"


def _voice() -> str:
    return getattr(settings, "GEMINI_TTS_VOICE", "") or "Kore"


async def synthesize(text: str, voice: str | None = None, style: str | None = None) -> bytes:
    key = getattr(settings, "GEMINI_API_KEY", "") or ""
    if not key:
        raise TtsNotConfigured("GEMINI_API_KEY is not set.")
    text = (text or "").strip()
    if not text:
        raise TtsProviderError("Nothing to speak.")
    text = text[:_MAX_CHARS]
    voice = voice or _voice()
    style = (style or "warm, calm and natural, like a supportive friend").strip()

    cache_key = hashlib.sha256(f"{_model()}|{voice}|{style}|{text}".encode()).hexdigest()
    cached = _cache.get(cache_key)
    if cached is not None:
        _cache.move_to_end(cache_key)
        return cached

    payload = {
        "model": _model(),
        "input": [{
            "type": "user_input",
            "content": [{
                "type": "text",
                "text": text,
                "annotations": [{"type": "speech_metadata", "style": style}],
            }],
        }],
        "response_format": {"type": "audio"},
        "generation_config": {"speech_config": [{"voice": voice}]},
    }
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(_ENDPOINT, headers={"x-goog-api-key": key}, json=payload)
    except Exception as e:
        raise TtsProviderError(f"Gemini TTS request failed: {e}") from e
    if resp.status_code >= 400:
        raise TtsProviderError(f"Gemini TTS failed ({resp.status_code}): {resp.text[:200]}")

    data = _find_audio(resp.json())
    if not data:
        raise TtsProviderError("Gemini TTS returned no audio.")
    audio = base64.b64decode(data)
    _cache[cache_key] = audio
    while len(_cache) > _CACHE_MAX:
        _cache.popitem(last=False)
    return audio


def _find_audio(node) -> str | None:
    """Locate the base64 audio payload (steps[].content[].data) in the response."""
    if isinstance(node, dict):
        if node.get("type") == "audio" and isinstance(node.get("data"), str):
            return node["data"]
        for value in node.values():
            found = _find_audio(value)
            if found:
                return found
    elif isinstance(node, list):
        for item in node:
            found = _find_audio(item)
            if found:
                return found
    return None
