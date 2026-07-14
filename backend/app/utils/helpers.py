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
