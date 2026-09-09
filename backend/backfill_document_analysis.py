"""Backfill: deep-analyze uploaded documents that were never analyzed.

Root cause fixed in code: uploads made via the "Uploaded Data" page / Let's Talk
/ KPI card (strategy-chat upload-and-analyze) used to skip the deep-analysis
step, so the AI could only see their filenames. This script re-runs that step
on existing documents so 1-month-old files become readable.

Run from the backend directory with the venv active:

    python backfill_document_analysis.py                    # all orgs
    python backfill_document_analysis.py <organization_id>  # one org only

It is idempotent: it skips documents that already have insights_status=completed
unless --force is given.
"""

import asyncio
import sys

from app.core.database import get_database


async def analyze_doc(db, doc) -> str:
    from bson import ObjectId

    from app.core.file_processor import _run_deep_analysis

    file_id = doc.get("file_id")
    filename = doc.get("filename") or "document"
    file_type = doc.get("file_type") or "other"
    org_id = doc.get("org_id") or doc.get("organization_id")
    if not file_id or not org_id:
        return "skipped (no file_id/org_id)"

    chunks = doc.get("chunks") or []
    if chunks:
        full_text = "\n".join(str(c) for c in chunks)
    else:
        full_text = doc.get("text") or ""
    if not full_text:
        return "skipped (no text)"

    org_name = industry = micro_vertical = ""
    try:
        org = db.organizations.find_one({"_id": ObjectId(org_id) if ObjectId.is_valid(org_id) else org_id})
        if org:
            org_name = org.get("name") or ""
            industry = org.get("industry") or ""
            micro_vertical = org.get("micro_vertical") or ""
    except Exception:
        pass

    # NOTE: This step only ADDS the AI analysis (insights/summary). It does NOT
    # delete or modify any existing file, chunk, vector or embedding data.
    await _run_deep_analysis(
        file_id=file_id,
        org_id=org_id,
        filename=filename,
        file_type=file_type,
        text=full_text,
        company_name=org_name,
        industry=industry,
        micro_vertical=micro_vertical,
    )
    return "analyzed"


async def main() -> None:
    db = get_database()
    if db is None:
        print("No database configured — aborting.")
        sys.exit(1)

    force = "--force" in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith("--")]

    query: dict = {}
    if args:
        query["org_id"] = args[0]

    docs = list(db.documents.find(query).sort("created_at", -1))
    print(f"Found {len(docs)} document(s) to inspect.")

    done = skipped = failed = 0
    for doc in docs:
        status = doc.get("insights_status")
        if not force and status == "completed" and doc.get("insights"):
            skipped += 1
            continue
        try:
            result = await analyze_doc(db, doc)
            if result == "analyzed":
                done += 1
                print(f"  [+] {doc.get('filename')} ({doc.get('file_id')})")
            else:
                skipped += 1
                print(f"  [-] {doc.get('filename')}: {result}")
        except Exception as e:
            failed += 1
            print(f"  [!] {doc.get('filename')}: {e}")

    print(f"\nDone. analyzed={done}, skipped={skipped}, failed={failed}")


if __name__ == "__main__":
    asyncio.run(main())
