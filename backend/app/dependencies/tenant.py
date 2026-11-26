"""Tenant isolation guards applied at router level.

Most data routers accepted ``get_current_user_optional`` and trusted a client-supplied
``organization_id`` (query, path, JSON body or form field), checking membership only inside
``if current_user:`` blocks, so an anonymous caller skipped every check and any signed-in user
could read or write any other company's data by changing one id.

Two dependencies fix that centrally:

* ``require_auth``   - a valid Firebase token is mandatory (401 otherwise).
* ``require_tenant`` - the above, plus: every organization id the request carries must be an
  organization the caller belongs to (403 otherwise).

Routes that look a record up by its own id (goal, task, session...) must still verify the
record's organization with ``assert_org_access`` / ``assert_goal_access``.
"""
import json
import logging
from typing import Any

from bson import ObjectId
from fastapi import Depends, HTTPException, Request, status

from ..core.database import get_database
from .auth import get_current_user
from .scope import is_org_member

logger = logging.getLogger("yesboss.tenant")

ORG_KEYS = ("organization_id", "org_id", "organizationId", "orgId")
# Values that mean "no organization supplied" (frontend races send these as strings).
_EMPTY = {"", "undefined", "null", "none"}
# Shared, unscoped bucket used by pre-signup document uploads.
_SHARED = {"temp"}


async def require_auth(current_user=Depends(get_current_user)):
    return current_user


def _clean(value: Any) -> str | None:
    if value is None or isinstance(value, (dict, list, bool)):
        return None
    text = str(value).strip()
    if text.lower() in _EMPTY or text.lower() in _SHARED:
        return None
    return text


def _collect_org_ids(node: Any, found: set[str], max_nodes: int = 5000, max_depth: int = 8) -> None:
    """Every organization id anywhere in a JSON body, however deeply it is nested (for example
    ``{"context": {"organization_id": ...}}`` or a list of items that each carry one). Looking only at the top
    level let a caller put another company's id one level down and skip the membership check."""
    stack: list[tuple[Any, int]] = [(node, 0)]
    seen = 0
    while stack and seen < max_nodes:
        current, depth = stack.pop()
        seen += 1
        if isinstance(current, dict):
            for key, value in current.items():
                if key in ORG_KEYS:
                    cleaned = _clean(value)
                    if cleaned:
                        found.add(cleaned)
                if isinstance(value, (dict, list)) and depth < max_depth:
                    stack.append((value, depth + 1))
        elif isinstance(current, list) and depth < max_depth:
            for item in current:
                if isinstance(item, (dict, list)):
                    stack.append((item, depth + 1))


async def _requested_org_ids(request: Request) -> set[str]:
    found: set[str] = set()
    for key in ORG_KEYS:
        for source in (request.query_params, request.path_params):
            value = _clean(source.get(key))
            if value:
                found.add(value)

    content_type = (request.headers.get("content-type") or "").lower()
    try:
        if "multipart/form-data" in content_type or "application/x-www-form-urlencoded" in content_type:
            form = await request.form()
            for key in ORG_KEYS:
                value = _clean(form.get(key))
                if value:
                    found.add(value)
        else:
            # JSON, or a body whose content type does not say so: read it either way, so the check cannot be
            # skipped by sending a different Content-Type header.
            raw = await request.body()
            if raw:
                _collect_org_ids(json.loads(raw), found)
    except (ValueError, UnicodeDecodeError):
        pass  # malformed body: the route's own validation will reject it
    return found


async def require_tenant(request: Request, current_user=Depends(get_current_user)):
    org_ids = await _requested_org_ids(request)
    if org_ids:
        db = get_database()
        if db is None:
            raise HTTPException(status_code=500, detail="Database not configured")
        for org_id in org_ids:
            if not await is_org_member(db, org_id, current_user):
                logger.warning("Tenant guard: user %s denied org %s on %s %s",
                               getattr(current_user, "id", "?"), org_id, request.method, request.url.path)
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return current_user


# ---------------------------------------------------------------- per-record checks
async def assert_org_access(db, org_id: str | None, user) -> None:
    if not org_id or not await is_org_member(db, str(org_id), user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


def _oid(value: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=404, detail="Not found")
    return ObjectId(value)


async def assert_goal_access(db, goal_id: str, user) -> dict:
    goal = db.goals.find_one({"_id": _oid(goal_id)}, {"organization_id": 1, "created_by": 1})
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    await assert_org_access(db, goal.get("organization_id"), user)
    return goal


async def assert_task_access(db, task_id: str, user) -> dict:
    task = db.tasks.find_one({"_id": _oid(task_id)}, {"organization_id": 1, "created_by": 1})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    await assert_org_access(db, task.get("organization_id"), user)
    return task
