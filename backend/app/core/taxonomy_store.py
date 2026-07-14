"""Simple file-backed store for user-contributed custom taxonomies.

When a user types an industry / micro-vertical / company name that wasn't in
the AI suggestions, we save it here. Future suggest calls merge these
community-sourced values into the dropdown so the catalog grows over time.
"""
import json
import logging
import os
import threading
import time
from pathlib import Path

logger = logging.getLogger("yesboss.taxonomy")

_LOCK = threading.Lock()
_DATA_DIR = Path(os.environ.get("YESBOSS_DATA_DIR", str(Path(__file__).resolve().parents[3] / "data")))
_STORE_FILE = _DATA_DIR / "custom_taxonomies.json"
_VALID_TYPES = {"industries", "micro_verticals", "company_names"}


def _ensure_store() -> None:
    try:
        _DATA_DIR.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        logger.warning("Cannot create data dir %s: %s", _DATA_DIR, e)


def _load() -> dict:
    _ensure_store()
    if not _STORE_FILE.exists():
        return {t: [] for t in _VALID_TYPES}
    try:
        with _STORE_FILE.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        for t in _VALID_TYPES:
            data.setdefault(t, [])
        return data
    except Exception as e:
        logger.warning("Failed to load taxonomy store: %s", e)
        return {t: [] for t in _VALID_TYPES}


def _save(data: dict) -> None:
    _ensure_store()
    tmp = _STORE_FILE.with_suffix(".tmp")
    try:
        with tmp.open("w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=2)
        tmp.replace(_STORE_FILE)
    except Exception as e:
        logger.warning("Failed to save taxonomy store: %s", e)


def save_custom(taxonomy_type: str, value: str, context: dict | None = None) -> dict:
    """Save a user-typed custom value into the taxonomy store.

    Returns {"saved": True, "value": ..., "type": ...} or {"saved": False, "error": ...}.
    """
    if taxonomy_type not in _VALID_TYPES:
        return {"saved": False, "error": f"type must be one of {sorted(_VALID_TYPES)}"}
    cleaned = (value or "").strip()
    if len(cleaned) < 1:
        return {"saved": False, "error": "value is empty"}
    if len(cleaned) > 200:
        cleaned = cleaned[:200]

    with _LOCK:
        data = _load()
        existing = data.get(taxonomy_type, [])
        norm = cleaned.lower()
        for entry in existing:
            if entry.get("value", "").lower() == norm:
                entry["uses"] = entry.get("uses", 0) + 1
                entry["last_used"] = int(time.time())
                _save(data)
                return {"saved": True, "value": cleaned, "type": taxonomy_type, "duplicate": True}
        entry = {
            "value": cleaned,
            "uses": 1,
            "created_at": int(time.time()),
            "last_used": int(time.time()),
        }
        if context:
            for k, v in context.items():
                if isinstance(v, (str, int, float, bool)) and len(str(v)) < 200:
                    entry[k] = v
        existing.append(entry)
        data[taxonomy_type] = existing
        _save(data)
    return {"saved": True, "value": cleaned, "type": taxonomy_type}


def get_custom_matches(taxonomy_type: str, query: str, limit: int = 50) -> list[str]:
    """Return user-contributed values for a given type, optionally filtered by query.

    Sorted by usage count (desc) then by last_used (desc) so the most popular
    community values appear first. Matches are case-insensitive substring on
    `query`. When `query` is empty, returns the top entries by usage.
    """
    if taxonomy_type not in _VALID_TYPES:
        return []
    with _LOCK:
        data = _load()
        entries = list(data.get(taxonomy_type, []))
    if not entries:
        return []
    q = (query or "").strip().lower()
    if q:
        matches = [e for e in entries if q in e.get("value", "").lower()]
    else:
        matches = entries
    matches.sort(key=lambda e: (-int(e.get("uses", 0)), -int(e.get("last_used", 0))))
    out: list[str] = []
    seen: set[str] = set()
    for e in matches:
        v = e.get("value", "").strip()
        if not v:
            continue
        key = v.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(v)
        if len(out) >= limit:
            break
    return out
