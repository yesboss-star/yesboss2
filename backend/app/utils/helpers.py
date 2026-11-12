import os
import re
from datetime import UTC, datetime
from typing import Any

from bson import ObjectId


def serialize_mongo_doc(doc: dict[str, Any]) -> dict[str, Any]:
    if doc is None:
        return {}
    if "_id" in doc and isinstance(doc["_id"], ObjectId):
        doc["_id"] = str(doc["_id"])
    return doc


def serialize_mongo_docs(docs: list) -> list:
    return [serialize_mongo_doc(doc) for doc in docs]


def utc_now() -> datetime:
    return datetime.now(UTC)


def extract_domain(email: str) -> str:
    if "@" in email:
        return email.split("@")[1].lower()
    return ""


_SEGMENT_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def safe_path_segment(value: str, default: str = "temp") -> str:
    """A client-supplied id used as a directory name: letters, digits, '-' and '_' only."""
    value = (value or "").strip()
    return value if _SEGMENT_RE.match(value) else default


def safe_filename(name: str | None, default: str = "upload") -> str:
    """Strip any directory part (both separators) and odd characters from an uploaded filename."""
    base = os.path.basename((name or "").replace("\\", "/")).strip().lstrip(".")
    base = re.sub(r"[^A-Za-z0-9._ -]", "_", base)[:120]
    return base or default
