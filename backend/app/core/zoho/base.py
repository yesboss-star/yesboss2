import json
import logging
import secrets
import time
from datetime import datetime, timedelta
from typing import Any, Dict, Optional
import httpx

from ..config import settings

logger = logging.getLogger("yesboss.zoho.oauth")

SCOPE_MAIL_TASKS = "ZohoMail.tasks.ALL"
SCOPE_CALENDAR_EVENTS = "ZohoCalendar.event.ALL"
SCOPE_CALENDAR_FREEBUSY = "ZohoCalendar.freebusy.ALL"

FULL_SCOPE = f"{SCOPE_MAIL_TASKS},{SCOPE_CALENDAR_EVENTS},{SCOPE_CALENDAR_FREEBUSY}"

# Use settings for accounts URL (defaults to India DC: accounts.zoho.in)
# so OAuth tokens match the API data center (mail.zoho.in, calendar.zoho.in)
print("*** ZOHO BASE LOADED ***")
_ZOHO_ACCOUNTS_URL = settings.ZOHO_ACCOUNTS_URL.rstrip("/")  # e.g. https://accounts.zoho.in
_ZOHO_CLIENT_ID = settings.ZOHO_CLIENT_ID or "1000.BDDTALKCJ6V1S6WFV4GIYQI22LB9FF"
_ZOHO_CLIENT_SECRET = settings.ZOHO_CLIENT_SECRET or "317dba2c9d35bb8bfd6c37085351ed3093304a6d6d"
_ZOHO_REDIRECT_URI = settings.ZOHO_REDIRECT_URI or "http://localhost:8000/api/v1/zoho/callback"


class ZohoOAuth:
    def __init__(self, db=None):
        self.db = db

    # ── Public helpers ──────────────────────────────────────────────

    def get_auth_url(self, state: Optional[str] = None) -> str:
        state = state or secrets.token_urlsafe(32)
        params = (
            f"client_id={_ZOHO_CLIENT_ID}"
            f"&redirect_uri={_ZOHO_REDIRECT_URI}"
            f"&scope={FULL_SCOPE}"
            f"&response_type=code"
            f"&access_type=offline"
            f"&state={state}"
            f"&prompt=consent"
        )
        url = f"{_ZOHO_ACCOUNTS_URL}/oauth/v2/auth?{params}"
        logger.info("Zoho auth URL: %s", url)
        return url

    async def _post_token(self, data: Dict[str, str]) -> Optional[Dict[str, Any]]:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{_ZOHO_ACCOUNTS_URL}/oauth/v2/token",
                    data=data,
                )
                if resp.status_code != 200:
                    logger.error("Zoho token request failed: %s %s", resp.status_code, resp.text)
                    return None
                return resp.json()
        except Exception as e:
            logger.error("Zoho token request error: %s", e)
            return None

    async def exchange_code(self, code: str) -> Optional[Dict[str, Any]]:
        return await self._post_token({
            "code": code,
            "client_id": _ZOHO_CLIENT_ID,
            "client_secret": _ZOHO_CLIENT_SECRET,
            "redirect_uri": _ZOHO_REDIRECT_URI,
            "grant_type": "authorization_code",
        })

    async def refresh_access_token(self, refresh_token: str) -> Optional[Dict[str, Any]]:
        return await self._post_token({
            "refresh_token": refresh_token,
            "client_id": _ZOHO_CLIENT_ID,
            "client_secret": _ZOHO_CLIENT_SECRET,
            "grant_type": "refresh_token",
        })

    # ── Token storage helpers ───────────────────────────────────────

    async def save_token(self, user_id: str, org_id: str, token_data: Dict[str, Any], zoho_mail_id: str = "") -> bool:
        if self.db is None:
            logger.warning("No database available for token storage")
            return False
        expires_in = token_data.get("expires_in", 3600)
        doc = {
            "user_id": user_id,
            "org_id": org_id,
            "access_token": token_data.get("access_token", ""),
            "refresh_token": token_data.get("refresh_token", ""),
            "expires_at": (datetime.utcnow() + timedelta(seconds=expires_in)).isoformat(),
            "zoho_mail_id": zoho_mail_id,
            "scope": token_data.get("scope", FULL_SCOPE),
            "connected_at": datetime.utcnow().isoformat(),
        }
        try:
            existing = self.db.zoho_tokens.find_one({"user_id": user_id})
            if existing:
                doc["connected_at"] = existing.get("connected_at", doc["connected_at"])
                self.db.zoho_tokens.update_one({"_id": existing["_id"]}, {"$set": doc})
            else:
                self.db.zoho_tokens.insert_one(doc)
            return True
        except Exception as e:
            logger.error("Failed to save Zoho token: %s", e)
            return False

    async def get_token(self, user_id: str) -> Optional[Dict[str, Any]]:
        if self.db is None:
            return None
        try:
            doc = self.db.zoho_tokens.find_one({"user_id": user_id})
            if not doc:
                return None
            return doc
        except Exception as e:
            logger.error("Failed to get Zoho token: %s", e)
            return None

    async def get_valid_token(self, user_id: str) -> Optional[str]:
        doc = await self.get_token(user_id)
        if not doc:
            logger.warning("get_valid_token: no token doc found for user_id=%s", user_id)
            return None
        if not doc.get("access_token"):
            logger.warning("get_valid_token: token doc has no access_token for user_id=%s", user_id)
            return None

        logger.info("get_valid_token: token found for user_id=%s, expires_at=%s, has_refresh=%s",
                     user_id, doc.get("expires_at",""), bool(doc.get("refresh_token")))

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
                            self.db.zoho_tokens.update_one({"_id": doc["_id"]}, {"$set": update})
                            logger.info("get_valid_token: token refreshed successfully for user_id=%s", user_id)
                            return result["access_token"]
                        logger.warning("get_valid_token: token refresh failed for user %s — refresh returned None", user_id)
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
            result = self.db.zoho_tokens.delete_one({"user_id": user_id})
            return result.deleted_count > 0
        except Exception as e:
            logger.error("Failed to disconnect Zoho: %s", e)
            return False

    async def get_connected_users(self, org_id: Optional[str] = None) -> list:
        if self.db is None:
            return []
        query = {}
        if org_id:
            query["org_id"] = org_id
        try:
            return list(self.db.zoho_tokens.find(query))
        except Exception as e:
            logger.error("Failed to list connected users: %s", e)
            return []

    async def get_zoho_mail_id(self, access_token: str) -> str:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    f"{settings.ZOHO_MAIL_API_URL}/accounts",
                    headers={"Authorization": f"Zoho-oauthtoken {access_token}"},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    accounts = data.get("data", {}).get("accounts", [])
                    if accounts:
                        return accounts[0].get("mailboxId", "")
        except Exception as e:
            logger.warning("Failed to fetch Zoho mail ID: %s", e)
        return ""
