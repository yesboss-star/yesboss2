"""Zoho Cliq Bot client — Communication Agent.

Single org-wide YesBoss bot, in the SAME data center as OAuth (zoho.com).
Mirrors the TAZ pattern (core/zoho/taz.py): never raises to callers, logs +
returns None on any misconfiguration or API failure so existing task/scheduler
flows keep working.

send_dm stub (logs when BOT_ID empty, real POST when set), send_card button
wrapper, HMAC webhook signature verify.
"""

import hashlib
import hmac
import logging
from typing import Any

import httpx

from ..config import settings
from .base import ZohoOAuth

logger = logging.getLogger("yesboss.zoho.cliq")

# email(lower) -> ZUID. ZUIDs are stable per user, so a process-wide cache is safe.
_ZUID_CACHE: dict[str, str] = {}


def _extract_zuid(data: Any) -> str:
    """Pull a user id out of a Cliq /users response (shape varies by API version)."""
    if not isinstance(data, dict):
        return ""
    for node in (data.get("data"), data.get("users")):
        if isinstance(node, list) and node and isinstance(node[0], dict):
            for k in ("id", "user_id", "zuid"):
                if node[0].get(k):
                    return str(node[0][k])
        if isinstance(node, dict):
            for k in ("id", "user_id", "zuid"):
                if node.get(k):
                    return str(node[k])
    for k in ("id", "user_id", "zuid"):
        if data.get(k):
            return str(data[k])
    return ""


def _extract_send_result(data: Any) -> dict[str, str]:
    """Pull chat_id/message_id out of a Cliq send response (shape varies)."""
    if not isinstance(data, dict):
        return {"chat_id": "", "message_id": ""}
    node = data
    inner = data.get("data")
    if isinstance(inner, dict):
        node = inner
    elif isinstance(inner, list) and inner and isinstance(inner[0], dict):
        node = inner[0]
    chat_id = node.get("chat_id") or node.get("chat") or data.get("chat_id") or ""
    msg_id = node.get("message_id") or node.get("id") or data.get("message_id") or data.get("id") or ""
    # Cliq bot DMs answer 200 with {"user_ids":[...],"users":[...]} and no chat id;
    # fall back to the delivered recipient so callers have a stable handle.
    if not chat_id:
        for k in ("user_ids", "users"):
            v = data.get(k) if data.get(k) is not None else node.get(k)
            if isinstance(v, list) and v:
                chat_id = str(v[0])
                break
            if isinstance(v, str) and v:
                chat_id = v
                break
    return {"chat_id": str(chat_id), "message_id": str(msg_id)}


def _cliq_enabled() -> bool:
    return bool(getattr(settings, "ZOHO_CLIQ_ENABLED", True))


def verify_webhook_signature(raw_body: bytes, signature_header: str) -> bool:
    """Verify Cliq bot webhook authenticity.

    Accepts either:
    - HMAC-SHA256 hex of the raw body with ZOHO_CLIQ_VERIFY_TOKEN, or
    - an exact plain-token match (Cliq Deluge handlers cannot easily compute
      HMAC, so the Message Handler forwards the shared secret verbatim in
      the X-Cliq-Signature header).

    Fail-closed: False when no verify token is configured or on mismatch.
    """
    token = getattr(settings, "ZOHO_CLIQ_VERIFY_TOKEN", "")
    if not token:
        return False
    if not signature_header:
        return False
    header = signature_header.strip()
    if hmac.compare_digest(header, token):
        return True
    expected = hmac.new(token.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header)


class ZohoCliq:
    """1-1 DM sender via the single YesBoss Cliq bot (zoho.com)."""

    def __init__(self, db=None):
        self.db = db
        self.oauth = ZohoOAuth(db)

    def _base(self) -> str:
        return (getattr(settings, "ZOHO_CLIQ_API_BASE", "https://cliq.zoho.com/api/v2") or "").rstrip("/")

    def _bot_id(self) -> str:
        return getattr(settings, "ZOHO_CLIQ_BOT_ID", "") or ""

    async def _resolve_token(self, org_id: str = "") -> str | None:
        """Resolve any connected Zoho user token for org (owner preferred)."""
        if self.db is None:
            return None
        try:
            users = await self.oauth.get_connected_users(org_id or None)
        except Exception as e:
            logger.warning("cliq token resolve failed: %s", e)
            return None
        if not users:
            logger.warning("cliq: no connected Zoho users (org_id=%s) — skipping", org_id)
            return None
        for doc in users:
            token = await self.oauth.get_valid_token(doc.get("user_id", ""))
            if token:
                return token
        return None

    async def _resolve_zuid(self, email: str, token: str, org_id: str = "") -> str | None:
        """Resolve an email to a Cliq ZUID (the `userids` field requires ZUIDs)."""
        key = email.lower()
        cached = _ZUID_CACHE.get(key)
        if cached:
            return cached
        url = f"{self._base()}/users/{email}"
        headers: dict[str, str] = {"Authorization": f"Zoho-oauthtoken {token}"}
        org_id_hdr = getattr(settings, "ZOHO_CLIQ_ORG_ID", "") or ""
        if org_id_hdr:
            headers["orgId"] = org_id_hdr
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(url, params={"fields": "all"}, headers=headers)
            if resp.status_code != 200:
                logger.warning("cliq zuid lookup failed %s for %s: %s", resp.status_code, email, resp.text[:200])
                return None
            zuid = _extract_zuid(resp.json())
        except Exception as e:
            logger.warning("cliq zuid lookup error for %s: %s", email, e)
            return None
        if not zuid:
            logger.warning("cliq zuid not found for %s", email)
            return None
        _ZUID_CACHE[key] = zuid
        logger.info("cliq zuid resolved %s -> %s", email, zuid)
        return zuid

    async def send_dm(
        self,
        to_email: str,
        text: str,
        buttons: list[dict[str, Any]] | None = None,
        org_id: str = "",
    ) -> dict[str, Any] | None:
        """Send a 1-1 DM from the YesBoss bot. Never raises; None on skip/fail."""
        if not _cliq_enabled():
            logger.info("cliq disabled (ZOHO_CLIQ_ENABLED=false) — skipping DM to %s", to_email)
            return None
        bot_id = self._bot_id()
        if not bot_id:
            logger.info("cliq stub: BOT_ID empty — would DM %s: %s", to_email, text[:120])
            return None
        if not to_email or not text:
            logger.warning("cliq send_dm missing to_email/text — skipping")
            return None
        token = await self._resolve_token(org_id)
        if not token:
            logger.warning("cliq send_dm: no OAuth token for org=%s — cannot DM %s", org_id or "?", to_email)
            return None

        # Zoho Cliq v2 bot-message body: {"text": ..., "userids": "<zuid>"}.
        # `userids` expects ZUIDs, not emails — resolve first, fall back to email.
        userid = to_email
        if "@" in to_email:
            zuid = await self._resolve_zuid(to_email, token, org_id)
            if zuid:
                userid = zuid
            else:
                logger.warning("cliq: ZUID unresolved for %s — falling back to raw email", to_email)
        # Buttons (when present) go as a top-level array with an accompanying "card".
        payload: dict[str, Any] = {"text": text, "userids": userid}
        if buttons:
            payload["card"] = {"title": "YesBoss"}
            payload["buttons"] = buttons
        url = f"{self._base()}/bots/{bot_id}/message"
        headers: dict[str, str] = {"Authorization": f"Zoho-oauthtoken {token}"}
        org_id_hdr = getattr(settings, "ZOHO_CLIQ_ORG_ID", "") or ""
        if org_id_hdr:
            headers["orgId"] = org_id_hdr
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    url,
                    json=payload,
                    headers=headers,
                )
                if resp.status_code in (200, 201, 204):
                    logger.info("cliq DM sent to %s", to_email)
                    try:
                        data = resp.json()
                    except Exception:
                        data = {}
                    return _extract_send_result(data)
                logger.warning("cliq DM failed %s: %s", resp.status_code, resp.text[:200])
                return None
        except Exception as e:
            logger.warning("cliq DM error: %s", e)
            return None

    async def send_card(
        self,
        to_email: str,
        title: str,
        text: str,
        task_id: str = "",
        org_id: str = "",
    ) -> dict[str, Any] | None:
        """Assignment card with Started/Blocked/Extension buttons."""
        buttons = [
            {"label": "Started ✅", "action": {"type": "invoke.function", "data": {"task_id": task_id, "action": "started"}}},
            {"label": "Blocked ⛔", "action": {"type": "invoke.function", "data": {"task_id": task_id, "action": "blocked"}}},
            {"label": "Extension 📅", "action": {"type": "invoke.function", "data": {"task_id": task_id, "action": "extension"}}},
        ]
        return await self.send_dm(to_email, f"*{title}*\n{text}", buttons=buttons, org_id=org_id)
