"""Numbers from reports (Phase 3): turn a report capture into rows in ``report_metrics``.

A weekly sales sheet or a typed "Revenue 4.1 crore" becomes ``metric / period / value`` rows, so the
weekly review can say "revenue 4.1 crore -> 4.4 crore (+7%)" instead of searching text. Tables
(CSV / Excel) are read as data; everything else is read as text with a short list of business
terms. Nothing here is guessed by a model: a number is stored only if it is in the file.

Rows carry ``capture_id`` only. Who may see them is decided by the capture's visibility at read
time (see ``core/capture_access.py``), so a private report never leaks through its numbers.
"""
import asyncio
import logging
import os
import re
from datetime import date, datetime
from typing import Any

from .indic import english_terms

logger = logging.getLogger("yesboss.captures.metrics")

MAX_METRICS = 80
MAX_ROWS = 200

KPI_WORDS = ["revenue", "sales", "profit", "margin", "expenses", "expense", "cost", "orders", "leads", "customers",
             "churn", "conversion", "cac", "ltv", "nps", "headcount", "attrition", "collections", "receivables",
             "inventory", "pipeline", "retention", "enquiries", "bookings", "footfall", "ebitda"]
_SCALE = {"crore": 1e7, "cr": 1e7, "lakh": 1e5, "lac": 1e5, "k": 1e3, "mn": 1e6, "million": 1e6, "m": 1e6,
          "bn": 1e9, "billion": 1e9}
_CURRENCY = {"₹": "INR", "rs": "INR", "inr": "INR", "$": "USD", "usd": "USD"}

_TEXT_METRIC = re.compile(
    r"(?P<name>(?:[a-z]+\s){0,2}?(?:" + "|".join(KPI_WORDS) + r"))"
    r"\s*(?P<conn>was|is|of|at|stood at|up|down|rose|fell|:|=|-|–)?\s*(?:by\s+)?"
    r"(?P<cur>₹|rs\.?|inr|usd|\$)?\s?(?P<num>-?\d[\d,]*(?:\.\d+)?)\s?(?P<unit>crore|cr|lakh|lac|k|mn|million|bn|billion|m|%)?",
    re.I,
)
_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}")
_DATE_COLS = ("date", "period", "week", "month", "day", "as of", "as on")
_METRIC_COLS = ("metric", "kpi", "measure", "particulars", "item", "indicator", "name", "head", "description")
_VALUE_COLS = ("value", "amount", "actual", "current", "total", "this week", "this month", "result")


# ---------------------------------------------------------------- helpers
def _number(raw: Any) -> float | None:
    if raw is None or isinstance(raw, bool):
        return None
    try:
        text = str(raw).strip().replace(",", "").replace("₹", "").replace("$", "")
        if text.endswith("%"):
            text = text[:-1]
        if text in ("", "-", "nan", "NaN"):
            return None
        value = float(text)
        return value if value == value and abs(value) != float("inf") else None
    except (TypeError, ValueError):
        return None


def _name(raw: Any) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9%&/ ]+", " ", str(raw).lower())).strip()[:80]


def _period(raw: Any) -> str | None:
    """A column value that is a date, as ``YYYY-MM-DD``; anything else is not a period."""
    if isinstance(raw, (datetime, date)):
        return raw.date().isoformat() if isinstance(raw, datetime) else raw.isoformat()
    text = str(raw or "").strip()
    if _ISO_DATE.match(text):
        return text[:10]
    m = re.match(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$", text)
    if m:
        d, mo, y = (int(x) for x in m.groups())
        try:
            return date(y, mo, d).isoformat()
        except ValueError:
            return None
    try:
        from datetime import datetime as _dt
        return _dt.strptime(text, "%d %b %Y").date().isoformat()
    except ValueError:
        return None


def _row(metric: str, value: float, unit: str, display: str, origin: str, period: str | None, source: str) -> dict[str, Any]:
    return {"metric": metric, "value": value, "unit": unit, "display": display[:60], "origin": origin,
            "period": period, "source": source[:80]}


# ---------------------------------------------------------------- from text
def metrics_from_text(text: str) -> list[dict[str, Any]]:
    """``Revenue: Rs 4.1 crore`` / ``Sales up 5%`` -> rows. A change is stored as ``<name> change``."""
    found: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for line_no, line in enumerate(english_terms(text or "").splitlines(), start=1):
        for m in _TEXT_METRIC.finditer(line):
            number = _number(m.group("num"))
            if number is None:
                continue
            unit_word = (m.group("unit") or "").lower()
            currency = _CURRENCY.get((m.group("cur") or "").lower().rstrip("."), "")
            name = _name(m.group("name"))
            conn = (m.group("conn") or "").lower()
            if not name or (conn in ("-", "–") and not (currency or unit_word)):
                continue  # "Sales - 3 Nov" is a heading, not a number
            display = m.group(0).strip()
            if unit_word == "%":
                value, unit = number, "%"
                if conn in ("up", "down", "rose", "fell"):
                    name, value = f"{name} change", (-number if conn in ("down", "fell") else number)
            else:
                value, unit = number * _SCALE.get(unit_word, 1.0), currency or ("count" if not unit_word else "")
            key = (name, unit)
            if key in seen:
                continue
            seen.add(key)
            found.append(_row(name, value, unit, display, "text", None, f"line {line_no}"))
            if len(found) >= MAX_METRICS:
                return found
    return found


# ---------------------------------------------------------------- from tables
def _is_numeric_col(series) -> bool:
    values = [_number(v) for v in series.tolist()]
    present = [v for v in values if v is not None]
    return len(present) >= max(1, int(0.6 * len([v for v in series.tolist() if str(v).strip() not in ("", "nan")]) or 1))


def metrics_from_frame(df) -> list[dict[str, Any]]:
    """One sheet -> rows. Handles a metric/value list, one row per period, or a single snapshot row."""
    if df is None or df.empty:
        return []
    df = df.dropna(how="all").dropna(axis=1, how="all").head(MAX_ROWS)
    if df.empty:
        return []
    cols = {str(c).strip().lower(): c for c in df.columns}
    rows: list[dict[str, Any]] = []

    def pick(options):
        return next((cols[c] for c in cols if any(c == o or c.startswith(o) for o in options)), None)

    metric_col, value_col, date_col = pick(_METRIC_COLS), pick(_VALUE_COLS), pick(_DATE_COLS)

    # 1. metric / value list (optionally with a date)
    if metric_col is not None and value_col is not None and metric_col != value_col:
        for idx, rec in df.iterrows():
            value = _number(rec[value_col])
            name = _name(rec[metric_col])
            if value is None or not name:
                continue
            period = _period(rec[date_col]) if date_col is not None else None
            rows.append(_row(name, value, "%" if str(rec[value_col]).strip().endswith("%") else "", str(rec[value_col]),
                             "table", period, f"row {idx + 2}"))
    # 2. one row per period, one column per metric
    elif date_col is not None or (len(df) > 1 and _period(df.iloc[0, 0]) is not None):
        pcol = date_col if date_col is not None else df.columns[0]
        for idx, rec in df.tail(8).iterrows():
            period = _period(rec[pcol])
            if period is None:
                continue
            for col in df.columns:
                if col == pcol or not _is_numeric_col(df[col]):
                    continue
                value = _number(rec[col])
                if value is not None:
                    rows.append(_row(_name(col), value, "", str(rec[col]), "table", period, f"row {idx + 2}, {col}"))
    # 3. a two-column label / number sheet, or a single snapshot row
    elif len(df.columns) == 2 and _is_numeric_col(df.iloc[:, 1]) and not _is_numeric_col(df.iloc[:, 0]):
        for idx, rec in df.iterrows():
            value, name = _number(rec.iloc[1]), _name(rec.iloc[0])
            if value is not None and name:
                rows.append(_row(name, value, "", str(rec.iloc[1]), "table", None, f"row {idx + 2}"))
    elif len(df) == 1:
        rec = df.iloc[0]
        for col in df.columns:
            value = _number(rec[col])
            if value is not None:
                rows.append(_row(_name(col), value, "", str(rec[col]), "table", None, f"column {col}"))
    return rows[:MAX_METRICS]


def metrics_from_file(path: str) -> list[dict[str, Any]]:
    """Read a CSV / Excel file from disk. Anything unreadable gives no rows, never an error."""
    ext = os.path.splitext(path)[1].lower()
    if ext not in (".csv", ".xlsx", ".xls") or not os.path.exists(path):
        return []
    try:
        import pandas as pd

        if ext == ".csv":
            frames = [pd.read_csv(path, dtype=object, keep_default_na=False)]
        else:
            frames = list(pd.read_excel(path, sheet_name=None, dtype=object, keep_default_na=False).values())[:3]
        rows: list[dict[str, Any]] = []
        for frame in frames:
            frame = frame.replace("", float("nan"))
            rows.extend(metrics_from_frame(frame))
        return rows[:MAX_METRICS]
    except Exception as e:
        logger.warning("Could not read %s as a table: %s", path, e)
        return []


# ---------------------------------------------------------------- store
def _file_record(db, capture: dict[str, Any]) -> dict[str, Any] | None:
    ref = capture.get("raw_ref") or {}
    if ref.get("type") != "file":
        return None
    from bson import ObjectId

    doc = db.documents.find_one({"file_id": ref["id"], "org_id": capture["org_id"]})
    if doc is None and ObjectId.is_valid(ref["id"]):
        doc = db.files.find_one({"_id": ObjectId(ref["id"]), "organization_id": capture["org_id"]})
    return doc


def _period_of(capture: dict[str, Any]) -> str:
    created = capture.get("created_at")
    return (created.date() if isinstance(created, datetime) else datetime.utcnow().date()).isoformat()


async def store_metrics(db, capture: dict[str, Any]) -> int:
    """Replace this capture's rows. Safe to run again after a re-analysis."""
    doc = _file_record(db, capture)
    rows: list[dict[str, Any]] = []
    if doc and doc.get("file_path"):
        rows = await asyncio.to_thread(metrics_from_file, doc["file_path"])
    if not rows:
        text = (doc or {}).get("text") or capture.get("text") or ""
        rows = metrics_from_text(text)

    db.report_metrics.delete_many({"capture_id": capture["_id"]})
    if not rows or capture.get("kind") == "journal":
        return 0
    default_period = _period_of(capture)
    db.report_metrics.insert_many([
        {**r, "org_id": capture["org_id"], "capture_id": capture["_id"], "series_key": capture.get("series_key"),
         "period_date": r["period"] or default_period, "at": capture.get("created_at") or datetime.utcnow()}
        for r in rows
    ])
    return len(rows)


def format_value(value: float, unit: str) -> str:
    """4.1e7 INR -> '₹4.1 crore'. Used by the weekly review so numbers read the way people write them."""
    sign = "-" if value < 0 else ""
    v = abs(value)
    if unit == "%":
        return f"{sign}{v:g}%"
    prefix = {"INR": "₹", "USD": "$"}.get(unit, "")
    if v >= 1e7 and unit in ("INR", ""):
        return f"{sign}{prefix}{v / 1e7:g} crore"
    if v >= 1e5 and unit in ("INR", ""):
        return f"{sign}{prefix}{v / 1e5:g} lakh"
    if v >= 1e6:
        return f"{sign}{prefix}{v / 1e6:g}M"
    return f"{sign}{prefix}{v:,.0f}" if v >= 1000 or float(v).is_integer() else f"{sign}{prefix}{v:g}"
