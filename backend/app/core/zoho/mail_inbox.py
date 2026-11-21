"""Read-only view of a person's Zoho inbox: who wrote, the subject, when, and the short preview Zoho
itself provides. Message bodies and attachments are never downloaded, and nothing is sent, moved or
deleted. Used only for the person's own private summary (see core/mail_digest.py)."""
import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlparse

import httpx

from ..config import settings

logger = logging.getLogger("yesboss.zoho.mail_inbox")

SNIPPET_CHARS = 300


class MailReadError(Exception):
    """Zoho refused or failed; ``permission`` is True when the token lacks the mail permission."""

    def __init__(self, message: str, permission: bool = False):
        super().__init__(message)
        self.permission = permission


def webmail_link(message_id: str, folder_id: str = "") -> str:
    """Link that opens the message in Zoho Mail's own web app (same data centre as the API)."""
    host = urlparse(settings.ZOHO_MAIL_API_URL).netloc or "mail.zoho.com"
    return f"https://{host}/zm/#mail/folder/{folder_id or 'inbox'}/p/{message_id}"


def _received(row: dict[str, Any]) -> datetime | None:
    """Zoho gives milliseconds since the epoch, as a string."""
    for key in ("receivedTime", "sentDateInGMT"):
        raw = row.get(key)
        try:
            return datetime.fromtimestamp(int(str(raw)) / 1000, tz=UTC)
        except (TypeError, ValueError, OSError, OverflowError):
            continue
    return None


def normalize_message(row: dict[str, Any]) -> dict[str, Any] | None:
    message_id = str(row.get("messageId") or "").strip()
    when = _received(row)
    if not message_id or when is None:
        return None
    sender = str(row.get("sender") or "").strip()
    address = str(row.get("fromAddress") or "").strip()
    return {
        "id": message_id,
        "folder_id": str(row.get("folderId") or ""),
        "sender": sender or address,
        "from_address": address,
        "subject": str(row.get("subject") or "").strip() or "(no subject)",
        "snippet": " ".join(str(row.get("summary") or "").split())[:SNIPPET_CHARS],
        "received_at": when.isoformat(),
        "has_attachment": str(row.get("hasAttachment") or "0") not in ("0", "false", "False", ""),
        "link": webmail_link(message_id, str(row.get("folderId") or "")),
    }


class ZohoInbox:
    def __init__(self, token: str):
        self._headers = {"Authorization": f"Zoho-oauthtoken {token}"}

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.get(f"{settings.ZOHO_MAIL_API_URL}{path}", headers=self._headers, params=params)
        except httpx.HTTPError as e:
            raise MailReadError(f"Could not reach Zoho Mail: {e.__class__.__name__}") from e
        if resp.status_code in (401, 403):
            raise MailReadError("Zoho did not allow reading this mailbox", permission=True)
        if resp.status_code != 200:
            logger.warning("Zoho mail %s -> %s", path, resp.status_code)  # never log the body: it can hold mail text
            raise MailReadError(f"Zoho Mail answered {resp.status_code}")
        try:
            return resp.json()
        except ValueError as e:
            raise MailReadError("Zoho Mail sent an unreadable answer") from e

    async def account_id(self) -> str:
        data = await self._get("/accounts")
        rows = data.get("data") if isinstance(data, dict) else None
        if isinstance(rows, dict):
            rows = rows.get("accounts")
        for row in rows or []:
            if isinstance(row, dict) and row.get("accountId"):
                return str(row["accountId"])
        raise MailReadError("No Zoho Mail account was found for this login")

    async def recent(self, hours: int = 24, limit: int = 40) -> list[dict[str, Any]]:
        """Inbox messages received in the last ``hours`` hours, newest first (at most ``limit``)."""
        account = await self.account_id()
        data = await self._get(
            f"/accounts/{account}/messages/view",
            {"limit": max(1, min(limit, 100)), "start": 1, "sortBy": "date", "sortorder": "false"},
        )
        rows = data.get("data") if isinstance(data, dict) else None
        cutoff = datetime.now(UTC) - timedelta(hours=max(1, hours))
        out = []
        for row in rows or []:
            msg = normalize_message(row) if isinstance(row, dict) else None
            if msg and datetime.fromisoformat(msg["received_at"]) >= cutoff:
                out.append(msg)
        out.sort(key=lambda m: m["received_at"], reverse=True)
        return out[:limit]
