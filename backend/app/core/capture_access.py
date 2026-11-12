"""Who may read a capture. One definition, used by the captures API, the analysis and the weekly review.

  private  - the author only. Nobody else, owners included.
  members  - the author, the people named in ``shared_with_emails``, and the organization's owners.
  org      - every member of the organization.
A journal capture is readable by its author alone, whatever its stored visibility says.
"""
from typing import Any

from ..dependencies.scope import is_org_member, is_org_owner, user_email, user_id


def is_author(capture: dict[str, Any], user) -> bool:
    uid = user_id(user)
    return bool(uid) and capture.get("user_id") == uid


async def can_read(db, capture: dict[str, Any], user) -> bool:
    if is_author(capture, user):
        return True
    if capture.get("kind") == "journal" or capture.get("visibility") == "private":
        return False
    org_id = capture.get("org_id") or ""
    if capture.get("visibility") == "org":
        return await is_org_member(db, org_id, user)
    if await is_org_owner(db, org_id, user):
        return True
    email = user_email(user)
    return bool(email) and email in (capture.get("shared_with_emails") or [])


async def visible_query(db, org_id: str, user) -> dict[str, Any]:
    """Mongo filter for every capture of ``org_id`` the user may read."""
    uid, email = user_id(user), user_email(user)
    clauses: list[dict[str, Any]] = [{"user_id": uid}]
    not_journal = {"kind": {"$ne": "journal"}}
    clauses.append({**not_journal, "visibility": "org"})
    if email:
        clauses.append({**not_journal, "visibility": "members", "shared_with_emails": email})
    if await is_org_owner(db, org_id, user):
        clauses.append({**not_journal, "visibility": "members"})
    return {"org_id": org_id, "$or": clauses}


def company_query(org_id: str) -> dict[str, Any]:
    """Captures that belong to the company's shared picture: never private, never a journal."""
    return {"org_id": org_id, "visibility": {"$in": ["org", "members"]}, "kind": {"$ne": "journal"}}
