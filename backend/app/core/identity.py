"""Central assignee-identity helpers.

YesBoss historically stored "who owns a task/goal" in three competing shapes:

  * assignee_id:  list of EMAILS (manual UI)  vs  list of Mongo ObjectId
                  strings (old assistant delegate)  vs  list of Firebase UIDs
  * assignee_email: scalar email (first assignee)  vs  list of emails
  * assigned_to:   legacy scalar email

That heterogeneity is why a person's tasks vanish for some filters (e.g. AI
Business Analytics finds Krisha because she is stored by email, but not Prince
because he is stored by an internal ID).

This module is the single source of truth for:

  * canonicalizing write payloads to EMAILS everywhere
  * scoping Mongo queries for "documents this user is involved in"
  * Python-level involvement checks (permission guards)
  * a backfill helper that migrates legacy ID-based records to email-based
"""

import logging
import re
from typing import Any, Iterable

from bson import ObjectId

logger = logging.getLogger("yesboss.identity")

_OBJECTID_RE = re.compile(r"^[0-9a-f]{24}$", re.IGNORECASE)
EMAILISH = re.compile(r"@")

MEMBER_COLLECTIONS = ("org_chart_members", "employees")


def normalize_email(value: Any) -> str:
    return str(value or "").strip().lower()


def is_email(value: Any) -> bool:
    v = str(value or "")
    return bool(v.strip()) and bool(EMAILISH.search(v))


def is_mongo_id(value: Any) -> bool:
    v = str(value or "").strip()
    return bool(_OBJECTID_RE.fullmatch(v))


def email_list(raw: Any) -> list[str]:
    """Coerce a scalar/list of emails into a lowercased, de-duplicated list."""
    if isinstance(raw, str):
        raw = [p for p in raw.split(",") if p.strip()]
    out: list[str] = []
    seen: set[str] = set()
    for item in raw or []:
        e = normalize_email(item)
        if e and e not in seen:
            seen.add(e)
            out.append(e)
    return out


def identities(user_id: Any, user_email: Any) -> list[str]:
    """Identity strings (uid + email) that may appear inside assignee fields."""
    vals: list[str] = []
    for v in (user_id, user_email):
        s = normalize_email(v) if v else ""
        if s and s not in vals:
            vals.append(s)
    return vals


def person_scope_query(user_id: Any, user_email: Any) -> dict[str, Any]:
    """Mongo query fragment scoping goals/tasks to one user (as creator, assignee, reviewer)."""
    ids = identities(user_id, user_email)
    email = normalize_email(user_email) if user_email else ""
    uid = str(user_id or "").strip() or (email if email else None)
    or_clauses: list[dict[str, Any]] = []
    if uid:
        or_clauses.append({"created_by": uid})
    if email:
        or_clauses.append({"assignee_email": email})
        or_clauses.append({"assigned_to": email})
        or_clauses.append({"reviewer_email": email})
    if ids:
        or_clauses.append({"assignee_id": {"$in": ids}})
        or_clauses.append({"reviewer_id": {"$in": ids}})
    if not or_clauses:
        return {"$or": [{"created_by": "__none__"}]}
    return {"$or": or_clauses}


def _assignee_values(doc: dict[str, Any]) -> list[str]:
    raw = doc.get("assignee_id")
    if isinstance(raw, str):
        raw = [raw]
    out: list[str] = []
    for v in raw or []:
        s = str(v or "").strip()
        if s:
            out.append(s)
    return out


def is_person_involved(doc: dict[str, Any], user_id: Any, user_email: Any) -> bool:
    """Python-level involvement check for permission guards.

    Handles assignee_id as emails, UIDs or ObjectIds, assignee_email as scalar
    or array, plus legacy assigned_to.
    """
    uid = str(user_id or "").strip()
    email = normalize_email(user_email) if user_email else ""
    wanted = set()
    if uid:
        wanted.add(uid)
        wanted.add(uid.lower())
    if email:
        wanted.add(email)

    def hit(value: Any) -> bool:
        if value is None:
            return False
        if isinstance(value, (list, tuple)):
            return any(hit(v) for v in value)
        s = str(value).strip().lower()
        return s in wanted

    if doc.get("created_by") is not None and str(doc.get("created_by")).strip() in wanted:
        return True
    for field in ("assignee_email", "assigned_to", "reviewer_email"):
        if hit(doc.get(field)):
            return True
    for field in ("assignee_id", "reviewer_id"):
        vals = doc.get(field)
        if isinstance(vals, str):
            vals = [vals]
        for v in vals or []:
            if str(v or "").strip().lower() in wanted:
                return True
    return False


# ---------------------------------------------------------------------------
# Email resolution
# ---------------------------------------------------------------------------

def _member_record(db, org_id: str, value: Any) -> dict[str, Any] | None:
    """Resolve one raw value to a member record {'email','full_name'}.

    Tries, in order: direct email in org member collections, Mongo _id,
    Firebase uid, and finally falls back to treating an email-like string
    verbatim.
    """
    v = str(value or "").strip()
    if not v:
        return None
    low = v.lower()

    # 1) Direct email match
    if is_email(v):
        for col in MEMBER_COLLECTIONS:
            m = db[col].find_one({"organization_id": org_id, "email": v})
            if m:
                return {"email": normalize_email(m.get("email") or v),
                        "full_name": m.get("full_name") or m.get("name") or v}
        # Fall back to verbatim (already an email, just canonicalize)
        return {"email": low, "full_name": v}

    # 2) Mongo ObjectId
    oid = None
    if is_mongo_id(low):
        try:
            oid = ObjectId(low)
        except Exception:
            oid = None
    if oid is not None:
        for col in MEMBER_COLLECTIONS:
            m = db[col].find_one({"_id": oid})
            if m:
                em = normalize_email(m.get("email"))
                if em:
                    return {"email": em, "full_name": m.get("full_name") or m.get("name") or em}
        m = db["users"].find_one({"_id": oid})
        if m:
            em = normalize_email(m.get("email"))
            if em:
                return {"email": em, "full_name": m.get("full_name") or m.get("display_name") or em}

    # 3) Firebase uid in users / employees / org_chart_members
    for col in ("users", "employees", "org_chart_members"):
        m = db[col].find_one({"uid": v})
        if m:
            em = normalize_email(m.get("email"))
            if em:
                return {"email": em, "full_name": m.get("full_name") or m.get("name") or m.get("display_name") or em}
    return None


def resolve_emails(db, org_id: str, values: Iterable[Any], fallback_emails: Iterable[str] | None = None) -> list[str]:
    """Map raw id/uid/name values + fallback emails into canonical email list."""
    out: list[str] = []
    seen: set[str] = set()
    for raw in values:
        if raw is None:
            continue
        rec = _member_record(db, org_id, raw)
        if rec and rec["email"]:
            if rec["email"] not in seen:
                seen.add(rec["email"])
                out.append(rec["email"])
    for e in email_list(fallback_emails):
        if e not in seen:
            seen.add(e)
            out.append(e)
    return out


def names_for_emails(db, org_id: str, emails: list[str]) -> list[str]:
    """Return display names aligned with the emails list (best effort)."""
    names: list[str] = []
    for e in emails:
        name = ""
        for col in MEMBER_COLLECTIONS:
            m = db[col].find_one({"organization_id": org_id, "email": e})
            if m:
                name = m.get("full_name") or m.get("name") or e
                break
        names.append(name or e)
    return names


def canonical_assignee_payload(db, org_id: str, assignee_id: Any = None, assignee_email: Any = None, assignee_name: Any = None) -> dict[str, Any]:
    """Build the canonical assignee fields for a NEW task/goal write.

    Returns {"assignee_id": [emails], "assignee_email": [emails], "assignee_name": [names]}.
    """
    raw_ids = assignee_id if isinstance(assignee_id, list) else ([assignee_id] if assignee_id else [])
    emails = resolve_emails(db, org_id, raw_ids, fallback_emails=assignee_email)
    names = names_for_emails(db, org_id, emails)
    # Merge any caller-supplied names (kept when no lookup match)
    supplied = assignee_name if isinstance(assignee_name, list) else ([assignee_name] if assignee_name else [])
    if len(supplied) >= len(emails):
        merged = []
        for i, e in enumerate(emails):
            nm = (str(supplied[i] or "")).strip() if i < len(supplied) else e
            merged.append(nm or e)
        names = merged
    if not emails:
        return {"assignee_id": [], "assignee_email": None, "assignee_name": names}
    # Keep assignee_email as the PRIMARY (first) email — scalar, like the rest of
    # the app expects. Multi-assignee visibility relies on assignee_id (array).
    return {"assignee_id": list(emails), "assignee_email": emails[0], "assignee_name": names or list(emails)}


# ---------------------------------------------------------------------------
# Backfill
# ---------------------------------------------------------------------------

def backfill_org_assignee_emails(db, org_id: str) -> dict[str, int]:
    """Migrate legacy ObjectId/UID-based assignee_id entries to emails.

    Only touches documents whose assignee_id contains at least one non-email
    value, and rewrites assignee_email (scalar or array) to the canonical
    email list so every read path (list, KPI, AI analytics, permission guard)
    sees the same identity.
    """
    id_to_email: dict[str, str] = {}
    # Build a mapping from _id and uid to email for every org member.
    for col in ("org_chart_members", "employees"):
        try:
            for m in db[col].find({"organization_id": org_id}, {"email": 1, "uid": 1}):
                em = normalize_email(m.get("email"))
                if not em:
                    continue
                for k in ("_id", "uid"):
                    v = m.get(k)
                    if v:
                        id_to_email[str(v).lower()] = em
        except Exception as e:
            logger.warning("backfill: index %s failed: %s", col, e)
    try:
        for m in db["users"].find({}, {"email": 1, "uid": 1}):
            em = normalize_email(m.get("email"))
            uid = m.get("uid")
            if em and uid:
                id_to_email[str(uid).lower()] = em
    except Exception as e:
        logger.warning("backfill: users failed: %s", e)

    def fix(doc: dict[str, Any]) -> dict[str, Any] | None:
        old = _assignee_values(doc)
        if not old:
            return None
        emails: list[str] = []
        seen: set[str] = set()
        changed = False
        for v in old:
            s = str(v).strip()
            if is_email(s):
                e = normalize_email(s)
            else:
                e = id_to_email.get(s.lower())
                if e:
                    changed = True
                else:
                    # Unknown id — leave untouched, do not rewrite whole doc
                    return None
            if e and e not in seen:
                seen.add(e)
                emails.append(e)
        if not changed:
            return None
        patch = {
            "assignee_id": emails,
            "assignee_email": emails,
            "updated_at": doc.get("updated_at"),
        }
        return patch

    g_touched = 0
    t_touched = 0
    try:
        for doc in db.goals.find({"organization_id": org_id}, {"assignee_id": 1, "assignee_email": 1, "updated_at": 1}):
            patch = fix(doc)
            if patch:
                db.goals.update_one({"_id": doc["_id"]}, {"$set": patch})
                g_touched += 1
    except Exception as e:
        logger.warning("backfill goals failed: %s", e)
    try:
        for doc in db.tasks.find({"organization_id": org_id}, {"assignee_id": 1, "assignee_email": 1, "updated_at": 1}):
            patch = fix(doc)
            if patch:
                db.tasks.update_one({"_id": doc["_id"]}, {"$set": patch})
                t_touched += 1
    except Exception as e:
        logger.warning("backfill tasks failed: %s", e)

    return {"goals_updated": g_touched, "tasks_updated": t_touched}
