import logging
import secrets
from datetime import datetime, timedelta
from typing import Any

import httpx

from ..config import settings

logger = logging.getLogger("yesboss.google.oauth")

SCOPE_OPENID = "openid"
SCOPE_EMAIL = "email"
SCOPE_PROFILE = "profile"
SCOPE_GMAIL_READONLY = "https://www.googleapis.com/auth/gmail.readonly"
SCOPE_TASKS = "https://www.googleapis.com/auth/tasks"
SCOPE_CALENDAR = "https://www.googleapis.com/auth/calendar"

FULL_SCOPE = " ".join([
    SCOPE_OPENID,
    SCOPE_EMAIL,
    SCOPE_PROFILE,
    SCOPE_GMAIL_READONLY,
    SCOPE_TASKS,
    SCOPE_CALENDAR,
])

_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_TOKEN_URL = "https://oauth2.googleapis.com/token"
_USERINFO_URL = "https://oauth2.googleapis.com/userinfo"

_GOOGLE_CLIENT_ID = settings.GOOGLE_CLIENT_ID
_GOOGLE_CLIENT_SECRET = settings.GOOGLE_CLIENT_SECRET
_GOOGLE_REDIRECT_URI = settings.GOOGLE_REDIRECT_URI or "http://localhost:8000/api/v1/google/callback"


class GoogleOAuth:
    def __init__(self, db=None):
        self.db = db

    # ── Public helpers ──────────────────────────────────────────────

    def _creds_configured(self) -> bool:
        return bool(_GOOGLE_CLIENT_ID and _GOOGLE_CLIENT_SECRET)

    def get_auth_url(self, state: str | None = None, redirect_uri: str | None = None) -> str:
        if not self._creds_configured():
            raise RuntimeError("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set in environment variables")
        state = state or secrets.token_urlsafe(32)
        from urllib.parse import quote
        rd = redirect_uri or _GOOGLE_REDIRECT_URI
        params = (
            f"client_id={_GOOGLE_CLIENT_ID}"
            f"&redirect_uri={quote(rd, safe='')}"
            f"&scope={quote(FULL_SCOPE, safe='')}"
            f"&response_type=code"
            f"&access_type=offline"
            f"&prompt=consent"
            f"&state={state}"
        )
        url = f"{_AUTH_URL}?{params}"
        logger.info("Google auth URL: %s", url)
        return url

    async def _post_token(self, data: dict[str, str]) -> dict[str, Any] | None:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(_TOKEN_URL, data=data)
                if resp.status_code != 200:
                    logger.error("Google token request failed: status=%s body=%s", resp.status_code, resp.text)
                    return {"error": True, "status_code": resp.status_code, "detail": resp.text}
                result = resp.json()
                if not isinstance(result, dict):
                    logger.error("Google token response was not a dict: type=%s, body=%s", type(result).__name__, resp.text)
                    return {"error": True, "detail": f"Response was {type(result).__name__}"}
                return result
        except Exception as e:
            logger.error("Google token request error: %s", e)
            return None

    async def exchange_code(self, code: str, redirect_uri: str | None = None) -> dict[str, Any] | None:
        return await self._post_token({
            "code": code,
            "client_id": _GOOGLE_CLIENT_ID,
            "client_secret": _GOOGLE_CLIENT_SECRET,
            "redirect_uri": redirect_uri or _GOOGLE_REDIRECT_URI,
            "grant_type": "authorization_code",
        })

    async def refresh_access_token(self, refresh_token: str) -> dict[str, Any] | None:
        return await self._post_token({
            "refresh_token": refresh_token,
            "client_id": _GOOGLE_CLIENT_ID,
            "client_secret": _GOOGLE_CLIENT_SECRET,
            "grant_type": "refresh_token",
        })

    # ── Token storage helpers ───────────────────────────────────────

    async def save_token(self, user_id: str, org_id: str, token_data: dict[str, Any], email: str = "", google_id: str = "") -> bool:
        if self.db is None:
            logger.warning("No database available for token storage")
            return False
        access_token = token_data.get("access_token", "")
        if not access_token:
            logger.warning("save_token: token_data has no access_token for user_id=%s — keys=%s",
                           user_id, list(token_data.keys()))
            return False
        expires_in = token_data.get("expires_in", 3600)
        doc = {
            "user_id": user_id,
            "org_id": org_id,
            "email": email,
            "access_token": access_token,
            "refresh_token": token_data.get("refresh_token", ""),
            "expires_at": (datetime.utcnow() + timedelta(seconds=expires_in)).isoformat(),
            "google_id": google_id,
            "scope": token_data.get("scope", FULL_SCOPE),
            "connected_at": datetime.utcnow().isoformat(),
            "provider": "google",
        }
        try:
            existing = self.db.google_tokens.find_one({"user_id": user_id})
            if existing:
                doc["connected_at"] = existing.get("connected_at", doc["connected_at"])
                self.db.google_tokens.update_one({"_id": existing["_id"]}, {"$set": doc})
            else:
                self.db.google_tokens.insert_one(doc)
            return True
        except Exception as e:
            logger.error("Failed to save Google token: %s", e)
            return False

    async def get_token(self, user_id: str) -> dict[str, Any] | None:
        if self.db is None:
            return None
        try:
            doc = self.db.google_tokens.find_one({"user_id": user_id})
            if not doc:
                return None
            return doc
        except Exception as e:
            logger.error("Failed to get Google token: %s", e)
            return None

    async def get_valid_token(self, user_id: str) -> str | None:
        doc = await self.get_token(user_id)
        if not doc:
            logger.warning("get_valid_token: no token doc found for user_id=%s", user_id)
            return None
        if not doc.get("access_token"):
            logger.warning("get_valid_token: token doc has no access_token for user_id=%s", user_id)
            return None

        expires_at = doc.get("expires_at", "")
        if expires_at:
            try:
                expiry = datetime.fromisoformat(expires_at)
                now = datetime.utcnow()
                if now + timedelta(minutes=5) >= expiry:
                    logger.info("get_valid_token: token expired or expiring soon for user_id=%s (expiry=%s)", user_id, expires_at)
                    if doc.get("refresh_token"):
                        result = await self.refresh_access_token(doc["refresh_token"])
                        if result and result.get("access_token"):
                            new_expires_in = result.get("expires_in", 3600)
                            update = {
                                "access_token": result["access_token"],
                                "expires_at": (datetime.utcnow() + timedelta(seconds=new_expires_in)).isoformat(),
                            }
                            if result.get("refresh_token"):
                                update["refresh_token"] = result["refresh_token"]
                            self.db.google_tokens.update_one({"_id": doc["_id"]}, {"$set": update})
                            logger.info("get_valid_token: token refreshed successfully for user_id=%s", user_id)
                            return result["access_token"]
                        if result and result.get("error"):
                            logger.error("get_valid_token: token refresh failed for user %s — %s", user_id, result.get("detail", "unknown error"))
                        else:
                            logger.warning("get_valid_token: token refresh returned no access_token for user %s", user_id)
                        return None
                    logger.warning("get_valid_token: token expired but no refresh_token available for user_id=%s", user_id)
                    return None
            except Exception as e:
                logger.error("get_valid_token: expiry check/refresh error for user_id=%s: %s", user_id, e, exc_info=True)

        return doc["access_token"]

    async def disconnect(self, user_id: str) -> bool:
        if self.db is None:
            return False
        try:
            result = self.db.google_tokens.delete_one({"user_id": user_id})
            return result.deleted_count > 0
        except Exception as e:
            logger.error("Failed to disconnect Google: %s", e)
            return False

    async def get_connected_users(self, org_id: str | None = None) -> list:
        if self.db is None:
            return []
        query = {}
        if org_id:
            query["org_id"] = org_id
        try:
            return list(self.db.google_tokens.find(query))
        except Exception as e:
            logger.error("Failed to list connected users: %s", e)
            return []

    async def get_user_email(self, access_token: str) -> str:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    _USERINFO_URL,
                    params={"alt": "json"},
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    email = data.get("email", "")
                    if email:
                        return email
                    logger.warning("get_user_email: no email in response: %s", str(data)[:500])
                else:
                    logger.warning("get_user_email: non-200 response: %s %s", resp.status_code, resp.text)
        except Exception as e:
            logger.warning("get_user_email: error: %s", e)
        return ""
