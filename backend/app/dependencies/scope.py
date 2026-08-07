"""Shared authorization / org-scoping helpers.

The app historically derived scoping from client-supplied ``organization_id`` and only
enforced per-user filters *inside* ``if current_user:`` guards, which let:

  * unauthenticated callers read org-wide data by passing an arbitrary org id, and
  * employees read other employees' personal data.

These helpers centralize (1) resolving which org(s) a user actually belongs to and
(2) deciding whether a user is an org owner. Routers should use them instead of
trusting client-supplied ids.
"""
import logging
from typing import Iterable

from bson import ObjectId

logger = logging.getLogger("yesboss.scope")


def _obj_org_id(org_id: str) -> str | ObjectId:
    return ObjectId(org_id) if ObjectId.is_valid(org_id) else org_id


def user_id(user) -> str | None:
    if user is None:
        return None
    return getattr(user, "id", None) or getattr(user, "uid", None)


def user_email(user) -> str | None:
    if user is None:
        return None
    email = getattr(user, "email", None) or ""
    return email.strip().lower() or None


def org_matches_client_org(org_id: str, user_org_ids: Iterable[str]) -> bool:
    """True if org_id equals one of the user's own org ids (case-insensitive match)."""
    ids = {str(o).lower() for o in (user_org_ids or [])}
    return org_id.strip().lower() in ids


async def resolve_user_org_ids(db, user) -> set[str]:
    """Return every organization id the user belongs to (owner, co-owner, member).

    This is the authoritative source of truth for org membership, replacing
    client-supplied org ids. It consults:
      * ``organizations.owner_id`` / ``co_owners`` (by uid or email),
      * ``users.organization_id``,
      * ``org_chart_members.organization_id`` (by email).
    """
    org_ids: set[str] = set()
    if user is None:
        return org_ids

    uid = user_id(user)
    email = user_email(user)

    try:
        if db is None:
            return org_ids

        # Owner / co-owner
        if uid or email:
            q: dict = {"$or": []}
            if uid:
                q["$or"].append({"owner_id": uid})
                q["$or"].append({"co_owners": uid})
            if email:
                q["$or"].append({"owner_id": email})
                q["$or"].append({"co_owners": email})
            for org in db.organizations.find(q, {"_id": 1}):
                org_ids.add(str(org["_id"]))

        # users.organization_id
        if uid:
            u = db.users.find_one({"uid": uid}, {"organization_id": 1})
            if u and u.get("organization_id"):
                org_ids.add(str(u["organization_id"]))

        # org_chart_members (by email)
        if email:
            for m in db.org_chart_members.find({"email": email}, {"organization_id": 1}):
                if m.get("organization_id"):
                    org_ids.add(str(m["organization_id"]))
    except Exception as e:  # pragma: no cover - defensive
        logger.warning("resolve_user_org_ids failed: %s", e)

    return org_ids


async def is_org_owner(db, org_id: str, user) -> bool:
    """Is the user the primary owner or a co-owner of org_id?"""
    if user is None or not org_id:
        return False
    org = db.organizations.find_one({"_id": _obj_org_id(org_id)}, {"owner_id": 1, "co_owners": 1})
    if not org:
        return False
    uid = user_id(user)
    email = user_email(user)
    owner = org.get("owner_id")
    if owner and (owner == uid or (owner and email and owner.strip().lower() == email)):
        return True
    for co in org.get("co_owners") or []:
        if co == uid or (co and email and co.strip().lower() == email):
            return True
    return False


async def is_org_member(db, org_id: str, user) -> bool:
    """Is the user an owner or a member of org_id?"""
    if user is None or not org_id:
        return False
    if await is_org_owner(db, org_id, user):
        return True
    uid = user_id(user)
    email = user_email(user)
    if uid:
        u = db.users.find_one({"uid": uid}, {"organization_id": 1})
        if u and u.get("organization_id") and str(u.get("organization_id")) == str(org_id):
            return True
    if email:
        if db.org_chart_members.find_one({"organization_id": str(org_id), "email": email}):
            return True
    return False
