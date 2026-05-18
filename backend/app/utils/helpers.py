from bson import ObjectId
from datetime import datetime, timezone
from typing import Any, Dict


def serialize_mongo_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    if doc is None:
        return {}
    if "_id" in doc and isinstance(doc["_id"], ObjectId):
        doc["_id"] = str(doc["_id"])
    return doc


def serialize_mongo_docs(docs: list) -> list:
    return [serialize_mongo_doc(doc) for doc in docs]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def extract_domain(email: str) -> str:
    if "@" in email:
        return email.split("@")[1].lower()
    return ""
