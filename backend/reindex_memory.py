"""Rebuild the memory behind Let's Talk (and document and journal search) from MongoDB.

Usage (from the backend folder):
    python reindex_memory.py --user-email you@company.com --dry-run     # count only: nothing is embedded or stored
    python reindex_memory.py --user-email you@company.com               # one person's chats, notes, journal and documents
    python reindex_memory.py --all-users                                # everyone (sends their text to the embedding service)
    python reindex_memory.py --user-email you@company.com --kinds journal,note

Safe to run again: items are replaced, not duplicated. MongoDB is only read.
"""
import argparse
import asyncio
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from app.core import memory  # noqa: E402
from app.core.database import connect_mongodb, get_database  # noqa: E402
from app.core.qdrant import connect_qdrant  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(message)s")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    who = ap.add_mutually_exclusive_group(required=True)
    who.add_argument("--user-email", action="append", help="rebuild only this person's items (repeatable)")
    who.add_argument("--all-users", action="store_true", help="rebuild everyone's items")
    ap.add_argument("--kinds", default="journal,note,chat,document", help="comma-separated: journal, note, chat, document")
    ap.add_argument("--dry-run", action="store_true", help="count what would be indexed; embed and store nothing")
    args = ap.parse_args()

    connect_mongodb()
    db = get_database()
    if db is None:
        print("MongoDB is not configured")
        return 1
    if not args.dry_run and connect_qdrant() is None:
        print("Qdrant is not reachable: check QDRANT_URL and QDRANT_API_KEY in .env")
        return 1

    user_ids = None
    if args.user_email:
        user_ids = []
        for email in args.user_email:
            user = db.users.find_one({"email": email.strip().lower()}) or db.users.find_one({"email": email.strip()})
            uid = (user or {}).get("uid") or (user or {}).get("id")
            if not uid:
                print(f"No user found for {email}")
                return 1
            user_ids.append(str(uid))
    kinds = {k.strip() for k in args.kinds.split(",") if k.strip()}

    print(("DRY RUN: " if args.dry_run else "") + ("everyone" if user_ids is None else f"{len(user_ids)} person(s)"))
    report = memory.reindex(db, user_ids=user_ids, kinds=tuple(k for k in ("chat", "note", "journal") if k in kinds), dry_run=args.dry_run)
    for kind in ("journal", "note", "chat"):
        if kind in report:
            print(f"  {kind:<9}{report[kind]}")
    if "document" in kinds:
        print(f"  document {asyncio.run(memory.reindex_documents(db, user_ids=user_ids, dry_run=args.dry_run))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
