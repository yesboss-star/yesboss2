"""Commitments (Phase 3): what people said they would do, and whether there is evidence they did.

A commitment is created for every task suggestion found in a capture (see ``capture_analysis``).
Its state is *worked out each time it is read* from evidence, never stored:

  done         a linked task was completed (hard), the person marked it done (manual), or a later
               report moved the named metric in the intended direction (soft: labelled as such)
  open         still has time, or has a task in progress
  missed       it has a task and the due date passed without it being completed
  no_evidence  we cannot tell: no task, and the due date passed (or it is a week old with no date)

"Done" is never claimed from a model's opinion alone. Journal captures never produce commitments.
"""
import logging
import re
from datetime import datetime, timedelta
from typing import Any

from bson import ObjectId

from .capture_metrics import format_value
from .indic import english_terms

logger = logging.getLogger("yesboss.commitments")

DONE_TASK_STATES = ("completed", "approved")
SOFT_MOVE = 0.02  # a metric must move at least 2% in the intended direction
STALE_AFTER = timedelta(days=7)

_UP = ("increase", "raise", "grow", "improve", "boost", "lift", "expand", "reach", "hit", "achieve")
_DOWN = ("reduce", "cut", "lower", "decrease", "trim", "shrink", "bring down")
_METRIC_WORDS = ("revenue", "sales", "profit", "margin", "expenses", "cost", "orders", "leads", "customers", "churn",
                 "conversion", "retention", "collections", "receivables", "pipeline", "bookings", "enquiries")


def infer_metric_goal(text: str) -> tuple[str | None, str | None]:
    """"Raise sales by 10%" -> ("sales", "up"); anything vaguer -> (None, None)."""
    lower = english_terms(text or "")
    word = next((w for w in _METRIC_WORDS if re.search(rf"\b{w}s?\b", lower)), None)
    if not word:
        return None, None
    if any(re.search(rf"\b{v}\b", lower) for v in _UP):
        return word, "up"
    if any(re.search(rf"\b{v}\b", lower) for v in _DOWN):
        return word, "down"
    return None, None


# ---------------------------------------------------------------- report series for soft evidence
def metric_series(db, org_id: str, word: str) -> list[dict[str, Any]]:
    """Points for the best-matching metric across the company's *shared* reports (never private ones)."""
    ids = [c["_id"] for c in db.captures.find({"org_id": org_id, "kind": "report", "visibility": "org"}, {"_id": 1})]
    if not ids:
        return []
    groups: dict[tuple, list[dict]] = {}
    for m in db.report_metrics.find({"org_id": org_id, "capture_id": {"$in": ids},
                                     "metric": {"$regex": rf"\b{re.escape(word)}\b", "$options": "i"}}):
        if m.get("unit") == "%" and m["metric"].endswith("change"):
            continue  # a change figure is not a level
        groups.setdefault((m.get("series_key"), m["metric"]), []).append(m)
    if not groups:
        return []
    best = max(groups.values(), key=lambda pts: (len(pts), max(p["at"] for p in pts)))
    return sorted(best, key=lambda p: (p["period_date"], p["at"]))


def _point(p: dict[str, Any]) -> dict[str, Any]:
    return {"value": p["value"], "unit": p.get("unit", ""), "capture_id": str(p["capture_id"])}


# ---------------------------------------------------------------- keep commitments in step with a capture
def sync_from_capture(db, capture: dict[str, Any]) -> None:
    """Create / refresh one commitment per suggestion; drop the ones the author dismissed."""
    cid = capture["_id"]
    if capture.get("kind") == "journal":
        db.commitments.delete_many({"capture_id": cid})
        return

    suggestions = capture.get("suggestions") or []
    now = datetime.utcnow()
    author = db.users.find_one({"uid": capture.get("user_id")}, {"email": 1}) or {}
    author_email = (author.get("email") or "").strip().lower()

    for s in suggestions:
        if s.get("status") == "dismissed":
            db.commitments.update_many({"capture_id": cid, "suggestion_id": s["id"]}, {"$set": {"dropped": True}})
            continue
        owner = (s.get("assignee_email") or author_email or "").strip().lower()
        metric, direction = infer_metric_goal(s.get("title", ""))
        baseline = None
        if metric:
            points = [p for p in metric_series(db, capture["org_id"], metric) if p["at"] <= now]
            baseline = _point(points[-1]) if points else None
        db.commitments.update_one(
            {"capture_id": cid, "suggestion_id": s["id"]},
            {"$set": {"text": s.get("title", ""), "due_date": s.get("due_date"), "owner_email": owner,
                      "task_id": s.get("task_id") or None},
             "$setOnInsert": {"org_id": capture["org_id"], "created_by": capture.get("user_id"), "dropped": False,
                              "metric": metric, "direction": direction, "baseline": baseline, "created_at": now,
                              "manual_done_at": None}},
            upsert=True,
        )

    # A re-run replaces still-pending suggestions with new ones: forget commitments of the old ones.
    current = [s["id"] for s in suggestions]
    db.commitments.delete_many({"capture_id": cid, "suggestion_id": {"$nin": current},
                                "task_id": None, "manual_done_at": None})


def forget_capture(db, capture_id) -> None:
    """Deleting a capture deletes what was derived from it."""
    db.commitments.delete_many({"capture_id": capture_id})
    db.report_metrics.delete_many({"capture_id": capture_id})


# ---------------------------------------------------------------- state from evidence
def evaluate(db, commitments: list[dict[str, Any]], now: datetime | None = None) -> list[dict[str, Any]]:
    """Add ``state``, ``evidence`` and the linked ``task`` to each commitment (a new list of dicts)."""
    now = now or datetime.utcnow()
    now_iso = now.isoformat()

    task_ids = [ObjectId(c["task_id"]) for c in commitments if c.get("task_id") and ObjectId.is_valid(str(c["task_id"]))]
    tasks = {str(t["_id"]): t for t in db.tasks.find({"_id": {"$in": task_ids}}, {"title": 1, "status": 1, "completed_at": 1,
                                                                                  "updated_at": 1})} if task_ids else {}
    series_cache: dict[tuple[str, str], list[dict]] = {}

    out = []
    for c in commitments:
        task = tasks.get(str(c.get("task_id"))) if c.get("task_id") else None
        evidence: list[dict[str, Any]] = []
        state = None

        if c.get("manual_done_at"):
            state = "done"
            evidence.append({"kind": "manual", "strength": "manual", "at": c["manual_done_at"],
                             "note": "Marked done by the person who owns it"})
        if task and task.get("status") in DONE_TASK_STATES:
            state = "done"
            evidence.append({"kind": "task_completed", "strength": "hard", "ref": str(task["_id"]),
                             "at": task.get("completed_at") or task.get("updated_at"),
                             "note": f"Task “{task.get('title', '')}” was completed"})

        if c.get("metric") and c.get("direction") and c.get("baseline") and c["baseline"].get("value"):
            key = (c["org_id"], c["metric"])
            if key not in series_cache:
                series_cache[key] = metric_series(db, c["org_id"], c["metric"])
            later = [p for p in series_cache[key] if p["at"] > c["created_at"]]
            if later:
                base, last = c["baseline"], later[-1]
                change = (last["value"] - base["value"]) / abs(base["value"])
                if (c["direction"] == "up" and change >= SOFT_MOVE) or (c["direction"] == "down" and change <= -SOFT_MOVE):
                    state = "done"
                    evidence.append({
                        "kind": "metric_moved", "strength": "soft", "ref": str(last["capture_id"]), "at": last["at"],
                        "note": f"{c['metric'].capitalize()} {format_value(base['value'], base.get('unit', ''))} → "
                                f"{format_value(last['value'], last.get('unit', ''))} ({change:+.0%}) in a later report",
                    })

        if state is None:
            due = c.get("due_date")
            if due and due < now_iso:
                state = "missed" if task else "no_evidence"
            elif task:
                state = "open"
            elif not due and c["created_at"] < now - STALE_AFTER:
                state = "no_evidence"
            else:
                state = "open"

        out.append({**c, "state": state, "evidence": evidence,
                    "task": {"id": str(task["_id"]), "title": task.get("title"), "status": task.get("status")} if task else None})
    return out
