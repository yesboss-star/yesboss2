"""Invite-only beta switch.

While ``INVITE_ONLY=true`` only people who were invited can create a NEW account. Turn the switch off (the default) and
sign-up is open again. Nobody who already has an account is ever locked out by it.

A person counts as invited when any of these is true:

* their e-mail is in ``INVITED_EMAILS`` (comma separated),
* their e-mail's domain is in ``INVITED_DOMAINS`` (comma separated, for example ``acme.com``),
* a company owner already added them as an employee or to the org chart (the owner invited them),
* an account with that e-mail already exists.
"""
import logging
import re

from fastapi import HTTPException, status

from .config import settings

logger = logging.getLogger("yesboss.invites")

INVITE_ONLY_MESSAGE = (
    "YesBoss is invite-only right now. Ask the person who invited you to use the same email address, "
    "or contact us to get an invite."
)


def _csv(value: str | None) -> set[str]:
    return {part.strip().lower().lstrip("@") for part in (value or "").split(",") if part.strip()}


def invite_only() -> bool:
    return bool(getattr(settings, "INVITE_ONLY", False))


def _exists(db, collection: str, email: str) -> bool:
    try:
        return db[collection].find_one({"email": {"$regex": f"^{re.escape(email)}$", "$options": "i"}}, {"_id": 1}) is not None
    except Exception:  # pragma: no cover - a database hiccup must not decide who is invited
        return False


def is_invited(email: str | None, db=None) -> bool:
    """True if this e-mail may create a new account."""
    if not invite_only():
        return True
    address = (email or "").strip().lower()
    if not address or "@" not in address:
        return False
    if address in _csv(getattr(settings, "INVITED_EMAILS", "")):
        return True
    if address.rsplit("@", 1)[1] in _csv(getattr(settings, "INVITED_DOMAINS", "")):
        return True
    if db is not None and any(_exists(db, name, address) for name in ("users", "employees", "org_chart_members")):
        return True
    return False


def require_invite(email: str | None, db=None) -> None:
    """Refuse (403) a new account for an e-mail that was not invited. Does nothing while the switch is off."""
    if not is_invited(email, db):
        logger.info("Invite-only: refused a new account for %s", (email or "").strip().lower() or "(no email)")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=INVITE_ONLY_MESSAGE)
