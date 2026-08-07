import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from ..core.database import get_database
from ..core.financial_parser import compute_trend, extract_financial_metrics
from ..dependencies.auth import get_current_user_optional

logger = logging.getLogger("yesboss.finance")
router = APIRouter()


@router.post("/extract")
async def extract_metrics(
    organization_id: str,
    file_id: str | None = None,
    current_user = Depends(get_current_user_optional),
):
    """Extract financial metrics from a document and store them."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    if not organization_id:
        raise HTTPException(status_code=400, detail="organization_id required")

    doc = None
    if file_id:
        doc = db.documents.find_one({"file_id": file_id})
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
    else:
        doc = db.documents.find_one(
            {"org_id": organization_id},
            sort=[("created_at", -1)],
        )
        if not doc:
            raise HTTPException(status_code=404, detail="No documents found for this org")

    text = doc.get("text") or doc.get("summary") or ""
    filename = doc.get("filename", "unknown")

    metrics = await extract_financial_metrics(text, filename)
    if metrics.get("document_type") == "other":
        return {
            "extracted": False,
            "document_type": "other",
            "notes": metrics.get("notes", "No financial data found"),
        }

    stored = {
        "organization_id": organization_id,
        "file_id": doc.get("file_id"),
        "filename": filename,
        "extracted_at": datetime.utcnow(),
        "metrics": metrics,
    }
    db.financial_metrics.insert_one(stored)
    current_id = stored["_id"]  # ObjectId from insert
    stored["_id"] = str(stored["_id"])

    # Compute trend vs previous entry (exclude current by ObjectId)
    prev = db.financial_metrics.find_one(
        {"organization_id": organization_id, "_id": {"$ne": current_id}},
        sort=[("extracted_at", -1)],
    )
    trend = {}
    if prev:
        trend = compute_trend(metrics, prev.get("metrics", {}))

    return {
        "extracted": True,
        "file_id": doc.get("file_id"),
        "filename": filename,
        "metrics": metrics,
        "trend": trend,
    }


@router.get("/metrics/{organization_id}")
async def get_financial_metrics(
    organization_id: str,
    limit: int = 5,
    current_user = Depends(get_current_user_optional),
):
    """Return the latest financial metrics with historical comparison."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    records = list(
        db.financial_metrics.find({"organization_id": organization_id})
        .sort("extracted_at", -1)
        .limit(limit)
    )

    if not records:
        return {"metrics": None, "history": [], "trend": {}}

    latest = records[0].get("metrics", {})
    history = []
    for r in records:
        history.append({
            "id": str(r["_id"]),
            "filename": r.get("filename"),
            "extracted_at": r.get("extracted_at").isoformat() if r.get("extracted_at") else None,
            "metrics": r.get("metrics", {}),
        })

    trend = {}
    if len(records) >= 2:
        prev = records[1].get("metrics", {})
        trend = compute_trend(latest, prev)

    return {
        "metrics": latest,
        "history": history,
        "trend": trend,
        "extracted_at": records[0].get("extracted_at").isoformat() if records[0].get("extracted_at") else None,
        "filename": records[0].get("filename"),
    }
