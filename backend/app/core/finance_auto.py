"""Keep the Financial Metrics card in step with the company's latest financial document.

When an owner uploads a file that really looks financial (a P&L, budget, balance sheet...), its figures
are read right away, so nobody has to press "Extract". The same rules as the button apply: the AI only
reads figures that are written in the document, the currency is the one the document uses, and a file
without financial figures stores nothing.

Only the company's owners trigger this. An employee's personal upload is never read into the
company-wide figures on its own; an owner can still press the button for any file.
"""
import logging
import re
from datetime import datetime
from types import SimpleNamespace
from typing import Any

from .database import get_database
from .financial_parser import compute_trend, extract_financial_metrics

logger = logging.getLogger("yesboss.finance_auto")

# Words that show up in financial statements. Two different ones are needed before the AI is asked to read the
# file, so ordinary documents (meeting notes, plans, contracts) cost nothing and are never read as accounts.
_CUES = re.compile(
    r"\b(revenue|turnover|net profit|gross profit|operating profit|profit and loss|p\s*&\s*l|income statement|balance sheet|"
    r"cash ?flow|ebitda|expenses?|expenditure|burn rate|budget|profit margin|total sales)\b",
    re.IGNORECASE,
)


def looks_financial(text: str | None, filename: str = "") -> bool:
    found = {m.group(1).lower() for m in _CUES.finditer(f"{filename}\n{(text or '')[:20000]}")}
    return len(found) >= 2


def save_metrics(db, org_id: str, doc: dict[str, Any], metrics: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """Store the figures read from ``doc`` (one record per file: reading the same file again updates its record)
    and return (record, trend against the previous different file)."""
    now = datetime.utcnow()
    filename = doc.get("filename", "unknown")
    existing = db.financial_metrics.find_one({"organization_id": org_id, "file_id": doc.get("file_id")}) if doc.get("file_id") else None
    if existing:
        db.financial_metrics.update_one({"_id": existing["_id"]}, {"$set": {"metrics": metrics, "extracted_at": now, "filename": filename}})
        current_id = existing["_id"]
    else:
        inserted = db.financial_metrics.insert_one({
            "organization_id": org_id, "file_id": doc.get("file_id"), "filename": filename, "extracted_at": now, "metrics": metrics,
        })
        current_id = inserted.inserted_id
    prev = db.financial_metrics.find_one({"organization_id": org_id, "_id": {"$ne": current_id}}, sort=[("extracted_at", -1)])
    trend = compute_trend(metrics, prev.get("metrics", {})) if prev else {}
    return {"file_id": doc.get("file_id"), "filename": filename, "metrics": metrics}, trend


async def auto_extract_after_upload(file_id: str, org_id: str, uploader: Any) -> None:
    """Background step after an upload. Never raises: a failure here must not affect the upload."""
    try:
        from ..dependencies.scope import is_org_owner

        db = get_database()
        if db is None or not file_id or not org_id:
            return
        if not await is_org_owner(db, org_id, uploader):
            return
        doc = db.documents.find_one({"file_id": file_id, "org_id": org_id})
        text = (doc or {}).get("text") or ""
        if not doc or not looks_financial(text, doc.get("filename", "")):
            return
        metrics = await extract_financial_metrics(text, doc.get("filename", "unknown"))
        if metrics.get("document_type") == "other":
            return
        save_metrics(db, org_id, doc, metrics)
        logger.info("Financial figures read from %s", doc.get("filename"))
    except Exception as e:
        logger.warning("Automatic financial extraction skipped: %s", e.__class__.__name__)


def uploader_from_id(user_id: str | None) -> Any:
    """A minimal user object for the owner check when only an id is known."""
    return SimpleNamespace(id=user_id, email=None)
