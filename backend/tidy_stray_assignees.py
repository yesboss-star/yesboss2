"""Tidy stray assignee tokens (UIDs / Mongo ObjectIds) → real emails. No deletions.

Some old tasks/goals were created with assignee values that are NOT emails:
  * a Firebase UID (e.g. 4hLcriUASlcpQCqtkU5PZHjySH53) — the owner,
  * a Mongo ObjectId string (e.g. 6a7052e2f209f870f673fdcd) — old delegate path.

Those never match an employee's email-based dashboard, so assigned work stays
invisible to the person. This script maps every resolvable non-email token to
the member/user email (kept lower-case) and rewrites only the assignee fields.
Unresolvable tokens and the rest of the document are left untouched.

Run from backend/ with the venv active:

    python tidy_stray_assignees.py                     # all orgs
    python tidy_stray_assignees.py <organization_id>   # one org
"""

import asyncio
import sys

from app.core.database import get_database


def _is_email(v):
    return "@" in str(v)


def _build_resolver(db, org_id):
    """email-by-token map: token (uid/_id/email) -> canonical lowercase email."""
    resolver: dict[str, str] = {}
    # Org members (org_chart_members + employees) keyed by _id and uid
    for col in ("org_chart_members", "employees"):
        for m in db[col].find({"organization_id": org_id}, {"email": 1, "uid": 1}):
            em = str(m.get("email") or "").strip().lower()
            if not em:
                continue
            resolver.setdefault(str(m["_id"]).lower(), em)
            if m.get("uid"):
                resolver.setdefault(str(m["uid"]).lower(), em)
    # users keyed by uid (global)
    for u in db["users"].find({}, {"email": 1, "uid": 1}):
        em = str(u.get("email") or "").strip().lower()
        uid = u.get("uid")
        if em and uid:
            resolver.setdefault(str(uid).lower(), em)
    return resolver


def _rewrite_assignees(doc, resolver):
    raw = doc.get("assignee_id")
    ids = raw if isinstance(raw, list) else ([raw] if raw else [])
    if not ids:
        return None

    new_ids: list[str] = []
    changed = False
    for v in ids:
        s = str(v or "").strip()
        if not s:
            continue
        if _is_email(s):
            new_ids.append(s.lower())
        else:
            mapped = resolver.get(s.lower())
            if mapped:
                new_ids.append(mapped)
                changed = True
            else:
                # Can't resolve — keep it untouched (never drop the assignment)
                new_ids.append(s)

    ae = doc.get("assignee_email")
    ae_list = ae if isinstance(ae, list) else ([ae] if isinstance(ae, str) and ae else [])
    new_ae = [e.lower() for e in ae_list if _is_email(e)]
    for v in ids:
        s = str(v or "").strip().lower()
        if s and resolver.get(s) and resolver[s] not in new_ae:
            new_ae.append(resolver[s])

    if not changed:
        return None

    patch: dict = {"assignee_id": new_ids}
    if new_ae:
        patch["assignee_email"] = new_ae
    return patch


async def main() -> None:
    db = get_database()
    if db is None:
        print("No database configured — aborting.")
        sys.exit(1)

    from bson import ObjectId

    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    orgs = []
    if args:
        oid = ObjectId(args[0]) if ObjectId.is_valid(args[0]) else args[0]
        org = db.organizations.find_one({"_id": oid})
        if not org:
            print(f"Organization {args[0]} not found.")
            sys.exit(1)
        orgs = [org]
    else:
        orgs = list(db.organizations.find({}))

    total_t = total_g = 0
    for org in orgs:
        org_id = str(org.get("_id"))
        resolver = _build_resolver(db, org_id)
        t = g = 0
        for col in ("tasks", "goals"):
            for doc in db[col].find({"organization_id": org_id}, {"assignee_id": 1, "assignee_email": 1}):
                patch = _rewrite_assignees(doc, resolver)
                if patch:
                    db[col].update_one({"_id": doc["_id"]}, {"$set": patch})
                    if col == "tasks":
                        t += 1
                    else:
                        g += 1
        if t or g:
            print(f"[{org.get('name', org_id)}] tasks updated {t}, goals updated {g}")
        total_t += t
        total_g += g

    # Orphan docs (no organization_id / empty) can't be matched to an org, but
    # their UID assignees often still resolve to real users. Map those too so
    # nothing stays as an unreadable internal id if it is ever attached later.
    resolver_global: dict[str, str] = {}
    for u in db["users"].find({}, {"email": 1, "uid": 1}):
        em = str(u.get("email") or "").strip().lower()
        if em and u.get("uid"):
            resolver_global.setdefault(str(u["uid"]).lower(), em)
    for col in ("employees", "org_chart_members"):
        for m in db[col].find({}, {"email": 1, "uid": 1}):
            em = str(m.get("email") or "").strip().lower()
            if not em:
                continue
            resolver_global.setdefault(str(m["_id"]).lower(), em)
            if m.get("uid"):
                resolver_global.setdefault(str(m["uid"]).lower(), em)
    ot = og = 0
    for col in ("tasks", "goals"):
        for doc in db[col].find(
            {"$or": [{"organization_id": None}, {"organization_id": ""}, {"organization_id": {"$exists": False}}]},
            {"assignee_id": 1, "assignee_email": 1},
        ):
            patch = _rewrite_assignees(doc, resolver_global)
            if patch:
                db[col].update_one({"_id": doc["_id"]}, {"$set": patch})
                if col == "tasks":
                    ot += 1
                else:
                    og += 1
    if ot or og:
        print(f"[orphans/no-org] tasks updated {ot}, goals updated {og}")
    total_t += ot
    total_g += og

    print(f"Done. tasks updated={total_t}, goals updated={total_g}")


if __name__ == "__main__":
    asyncio.run(main())
