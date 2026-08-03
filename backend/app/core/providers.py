"""Provider dispatch between Zoho and Google.

Each client picks ONE provider (either/or). This module is the single place
that decides which provider a user/org is connected to and resolves valid
tokens by email.
"""
import logging
import re

from bson import ObjectId

from .google import GoogleOAuth
from .zoho import ZohoOAuth

logger = logging.getLogger("yesboss.providers")


def get_connected_provider(db, user_id: str | None) -> str | None:
    """Return 'google', 'zoho', or None for a user."""
    if db is None or not user_id:
        return None
    if db.google_tokens.find_one({"user_id": user_id}):
        return "google"
    if db.zoho_tokens.find_one({"user_id": user_id}):
        return "zoho"
    return None


def get_org_provider(db, org_id: str | None) -> str | None:
    """Return the org's connected provider ('google' | 'zoho'), or None.

    The owner's connected provider decides the whole org's provider (per-org
    either/or model). Falls back to a token doc stored with the org_id.
    """
    if db is None or not org_id:
        return None
    try:
        org = db.organizations.find_one(
            {"_id": ObjectId(org_id) if ObjectId.is_valid(org_id) else org_id},
            {"owner_id": 1},
        )
        if org and org.get("owner_id"):
            provider = get_connected_provider(db, org["owner_id"])
            if provider:
                return provider
        if db.google_tokens.find_one({"org_id": str(org_id)}) or db.google_tokens.find_one({"org_id": org_id}):
            return "google"
        if db.zoho_tokens.find_one({"org_id": str(org_id)}) or db.zoho_tokens.find_one({"org_id": org_id}):
            return "zoho"
    except Exception:
        logger.warning("get_org_provider: error resolving provider for org %s", org_id, exc_info=True)
    return None


async def get_provider_token(db, user_id: str | None):
    """Return (provider, valid_token) for a user, or None."""
    if db is None or not user_id:
        return None
    if db.google_tokens.find_one({"user_id": user_id}):
        token = await GoogleOAuth(db).get_valid_token(user_id)
        return ("google", token) if token else None
    if db.zoho_tokens.find_one({"user_id": user_id}):
        token = await ZohoOAuth(db).get_valid_token(user_id)
        return ("zoho", token) if token else None
    return None


async def _resolve_google_token(
    db,
    email: str,
    org_id: str | None = None,
    include_org_fallback: bool = True,
) -> str | None:
    goauth = GoogleOAuth(db)
    gdoc = db.google_tokens.find_one({
        "$or": [
            {"email": {"$regex": f"^{re.escape(email)}$", "$options": "i"}},
            {"user_id": email},
            {"google_id": email},
        ]
    })
    if gdoc and gdoc.get("user_id"):
        token = await goauth.get_valid_token(gdoc["user_id"])
        if token:
            return token
    if org_id and include_org_fallback:
        gorg = db.google_tokens.find_one({"org_id": str(org_id)})
        if gorg and gorg.get("user_id"):
            token = await goauth.get_valid_token(gorg["user_id"])
            if token:
                return token
    return None


async def _resolve_zoho_token(db, email: str, org_id: str | None = None) -> str | None:
    zoauth = ZohoOAuth(db)
    zdoc = db.zoho_tokens.find_one({
        "$or": [
            {"zoho_mail_id": {"$regex": f"^{re.escape(email)}$", "$options": "i"}},
            {"email": {"$regex": f"^{re.escape(email)}$", "$options": "i"}},
            {"user_id": email},
        ]
    })
    if zdoc and zdoc.get("user_id"):
        token = await zoauth.get_valid_token(zdoc["user_id"])
        if token:
            return token
    if org_id:
        zorg = db.zoho_tokens.find_one({"org_id": str(org_id)})
        if zorg and zorg.get("user_id"):
            token = await zoauth.get_valid_token(zorg["user_id"])
            if token:
                return token
    return None


async def resolve_token_for_email(db, email: str, org_id: str | None = None):
    """Return (provider, valid_token) for an attendee by email, or None."""
    if db is None or not email:
        return None
    gtoken = await _resolve_google_token(db, email, org_id)
    if gtoken:
        return ("google", gtoken)
    ztoken = await _resolve_zoho_token(db, email, org_id)
    if ztoken:
        return ("zoho", ztoken)
    return None
