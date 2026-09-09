"""One-time migration: rewrite legacy ObjectId/UID-based assignee_id values to emails.

Why: tasks/goals created through the old AI delegate path stored assignee_id as
Mongo ObjectId strings (or Firebase UIDs) instead of emails. Every per-person
view (employee dashboard, KPI, AI Business Analytics) looks people up by email,
so those records were invisible to the person they were assigned to.

Run from the backend/ directory with the venv active:

    python backfill_assignee_emails.py                     # all orgs
    python backfill_assignee_emails.py <organization_id>   # one org only

Safe: only rewrites documents that contain a NON-email value in assignee_id
and that we can map to an email via org_chart_members / employees / users.
"""

import sys

from app.core.database import get_database


def main() -> None:
    db = get_database()
    if db is None:
        print("No database configured — aborting.")
        sys.exit(1)

    orgs: list[dict] = []
    if len(sys.argv) > 1:
        org_id = sys.argv[1]
        org = db.organizations.find_one({"_id": org_id}) if org_id else None
        if not org:
            print(f"Organization {org_id} not found.")
            sys.exit(1)
        orgs = [org]
    else:
        orgs = list(db.organizations.find({}))

    if not orgs:
        print("No organizations found.")
        return

    from app.core.identity import backfill_org_assignee_emails

    total = {"goals_updated": 0, "tasks_updated": 0, "orgs": 0}
    for org in orgs:
        org_id = str(org.get("_id") or org.get("id"))
        if not org_id:
            continue
        print(f"\n[{org.get('name', org_id)}] ({org_id})")
        res = backfill_org_assignee_emails(db, org_id)
        total["goals_updated"] += res["goals_updated"]
        total["tasks_updated"] += res["tasks_updated"]
        total["orgs"] += 1
        print(f"  goals updated: {res['goals_updated']}, tasks updated: {res['tasks_updated']}")

    print("\nDone.", total)


if __name__ == "__main__":
    main()
