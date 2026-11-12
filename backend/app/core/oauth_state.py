"""Signed, expiring OAuth ``state`` values.

The Zoho / Google callbacks used to trust ``state`` as the raw user id, so anyone could
finish an OAuth flow with ``state=<victim uid>`` and bind their own Zoho/Google account to
the victim. ``state`` is now ``uid:issued_at:signature`` (HMAC-SHA256) and expires.
"""
import hashlib
import hmac
import os
import time

from .config import settings

STATE_MAX_AGE_SECONDS = 15 * 60


def _secret() -> bytes:
    explicit = os.getenv("OAUTH_STATE_SECRET", "")
    if explicit:
        return explicit.encode()
    # Derived from secrets that are always configured wherever OAuth works.
    material = f"{settings.ZOHO_CLIENT_SECRET}|{settings.GOOGLE_CLIENT_SECRET}|{settings.ADMIN_API_KEY}"
    return hashlib.sha256(material.encode()).digest()


def _sign(uid: str, issued_at: int) -> str:
    return hmac.new(_secret(), f"{uid}:{issued_at}".encode(), hashlib.sha256).hexdigest()


def sign_state(uid: str, now: float | None = None) -> str:
    issued_at = int(now if now is not None else time.time())
    return f"{uid}:{issued_at}:{_sign(uid, issued_at)}"


def verify_state(state: str | None, now: float | None = None) -> str | None:
    """Return the uid if ``state`` is authentic and fresh, else None."""
    if not state:
        return None
    try:
        uid, issued_raw, sig = state.rsplit(":", 2)
        issued_at = int(issued_raw)
    except ValueError:
        return None
    if not uid or not hmac.compare_digest(sig, _sign(uid, issued_at)):
        return None
    current = now if now is not None else time.time()
    if current - issued_at > STATE_MAX_AGE_SECONDS or issued_at - current > 60:
        return None
    return uid
