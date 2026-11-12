"""Long-term memory for Let's Talk: what a person said before, in chats, saved notes and the journal.

Each item is embedded once and stored in one Qdrant collection, tagged with its owner. Anything read back is
filtered to the person asking, so memory never crosses from one user to another (an owner does not get an
employee's journal). MongoDB stays the source of truth: every vector here can be rebuilt from it with
``reindex``, and deleting the source record deletes its vectors (``forget``).

A failed embedding is skipped, never replaced by a made-up vector, and every read path degrades to "no
memory" rather than failing the chat.
"""
import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from .config import settings
from .qdrant import (
    EmbeddingUnavailable, create_collection, ensure_payload_indexes, get_embedding_strict, get_qdrant_client, redact_secrets,
    vector_search,
)

logger = logging.getLogger("yesboss.memory")

COLLECTION = "memory"
DIM = 1536
KINDS = ("chat", "note", "journal")
WINDOW = 6  # messages per chat chunk
MAX_EMBED_CHARS = 6000
MAX_SHOWN_CHARS = 700
MARGIN = 0.10  # a hit this far below the best one is dropped, however high it scores
_INDEXED = ("user_id", "org_id", "kind", "source_id")
_ready = False


# ---------------------------------------------------------------- items (pure: no network, easy to test)
def _epoch(value: Any) -> float:
    """Seconds since 1970 from a datetime, an ISO string or a millisecond timestamp."""
    if isinstance(value, datetime):
        return (value if value.tzinfo else value.replace(tzinfo=timezone.utc)).timestamp()
    if isinstance(value, (int, float)):
        return value / 1000 if value > 1e11 else float(value)
    if isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).timestamp()
        except ValueError:
            pass
    return datetime.now(timezone.utc).timestamp()


def point_id(kind: str, source_id: str, part: int = 0) -> str:
    """The same item always gets the same id, so indexing it again replaces it instead of duplicating it."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"memory:{kind}:{source_id}:{part}"))


def _item(kind: str, source_id: Any, part: int, user_id: Any, org_id: Any, ts: Any, title: str, text: str) -> dict[str, Any] | None:
    text = (text or "").strip()
    if not text or not user_id or not org_id:
        return None
    return {
        "kind": kind, "source_id": str(source_id), "part": part, "user_id": str(user_id), "org_id": str(org_id),
        "ts": _epoch(ts), "title": (title or "").strip()[:120], "text": text[:MAX_EMBED_CHARS],
    }


def chat_items(session: dict[str, Any]) -> list[dict[str, Any]]:
    """A conversation as windows of a few turns each. The old Journal page's sessions are skipped: those are
    journal entries, which are indexed as such."""
    if session.get("kind") == "journal":
        return []
    msgs = [m for m in (session.get("messages") or []) if (m.get("content") or "").strip() and not m.get("is_loading")]
    out = []
    for i in range(0, len(msgs), WINDOW):
        chunk = msgs[i:i + WINDOW]
        lines = [f"{'You' if m.get('role') == 'user' else 'Assistant'}: {str(m.get('content')).strip()[:700]}" for m in chunk]
        item = _item("chat", session.get("_id"), i // WINDOW, session.get("user_id"), session.get("organization_id") or session.get("org_id"),
                     chunk[-1].get("timestamp") or session.get("updated_at"), session.get("title") or "Chat", "\n".join(lines))
        if item:
            out.append(item)
    return out


def note_items(capture: dict[str, Any]) -> list[dict[str, Any]]:
    analysis = capture.get("analysis") or {}
    summary = analysis.get("summary") if analysis.get("provider") == "llm" else ""
    text = "\n".join(p for p in (summary, (capture.get("text") or capture.get("preview") or "")[:3500]) if p)
    item = _item("note", capture.get("_id"), 0, capture.get("user_id"), capture.get("org_id"), capture.get("created_at"), capture.get("title") or "Note", text)
    return [item] if item else []


def journal_items(entry: dict[str, Any]) -> list[dict[str, Any]]:
    from .journal_intel import entry_text

    summary = ((entry.get("ai_analysis") or {}).get("summary") or "").strip()
    text = "\n".join(p for p in (summary, entry_text(entry)) if p)
    item = _item("journal", entry.get("_id"), 0, entry.get("user_id"), entry.get("org_id"), entry.get("created_at"), summary[:80] or "Journal entry", text)
    return [item] if item else []


# ---------------------------------------------------------------- the store
def ensure_collection() -> bool:
    global _ready
    if _ready:
        return True
    if not create_collection(COLLECTION, DIM):
        return False
    ensure_payload_indexes(COLLECTION, keyword=_INDEXED)  # the cloud refuses filters on fields without an index
    _ready = True
    return True


def index_items(items: list[dict[str, Any]]) -> dict[str, int]:
    """Embed and store items. An item whose embedding fails is counted and skipped, never stored as junk."""
    from qdrant_client.models import PointStruct

    result = {"indexed": 0, "failed": 0}
    if not items:
        return result
    client = get_qdrant_client()
    if client is None or not ensure_collection():
        result["failed"] = len(items)
        return result
    points = []
    for it in items:
        try:
            vector = get_embedding_strict(f"{it['title']}\n{it['text']}")
        except EmbeddingUnavailable as e:
            logger.warning("memory: embedding unavailable for %s %s: %s", it["kind"], it["source_id"], redact_secrets(e))
            result["failed"] += 1
            continue
        payload = {k: it[k] for k in ("kind", "source_id", "part", "user_id", "org_id", "ts", "title")}
        payload["text"] = it["text"][:MAX_SHOWN_CHARS]
        points.append(PointStruct(id=point_id(it["kind"], it["source_id"], it["part"]), vector=vector, payload=payload))
    for start in range(0, len(points), 32):
        client.upsert(collection_name=COLLECTION, points=points[start:start + 32])
    result["indexed"] = len(points)
    return result


def forget(kind: str, source_id: Any) -> None:
    """Remove everything remembered from one record (it was deleted, or is being re-indexed)."""
    from qdrant_client.models import FieldCondition, Filter, FilterSelector, MatchValue

    client = get_qdrant_client()
    if client is None:
        return
    try:
        client.delete(
            collection_name=COLLECTION,
            points_selector=FilterSelector(filter=Filter(must=[
                FieldCondition(key="kind", match=MatchValue(value=kind)),
                FieldCondition(key="source_id", match=MatchValue(value=str(source_id))),
            ])),
        )
    except Exception as e:
        logger.warning("memory: forget %s %s failed: %s", kind, source_id, e)


def recall(user_id: str, org_id: str, query: str, k: int = 5, kinds: tuple[str, ...] | None = None,
           exclude_sources: set[str] | None = None, min_score: float | None = None) -> list[dict[str, Any]]:
    """The few things this person said before that best match ``query``. Only their own, only in this
    organization. Raises EmbeddingUnavailable if the query cannot be embedded."""
    from qdrant_client.models import FieldCondition, Filter, MatchAny, MatchValue

    client = get_qdrant_client()
    if client is None or not user_id or not org_id or not (query or "").strip():
        return []
    if min_score is None:
        min_score = settings.MEMORY_MIN_SCORE
    must = [FieldCondition(key="user_id", match=MatchValue(value=str(user_id))), FieldCondition(key="org_id", match=MatchValue(value=str(org_id)))]
    if kinds:
        must.append(FieldCondition(key="kind", match=MatchAny(any=list(kinds))))
    vector = get_embedding_strict(query[:MAX_EMBED_CHARS])
    best: dict[tuple[str, str], dict[str, Any]] = {}
    for p in vector_search(client, COLLECTION, vector, max(k * 4, 12), Filter(must=must)):
        pl = p.payload or {}
        key = (pl.get("kind", ""), pl.get("source_id", ""))
        if p.score < min_score or pl.get("source_id") in (exclude_sources or set()):
            continue
        if key not in best or p.score > best[key]["score"]:
            best[key] = {"kind": pl.get("kind"), "source_id": pl.get("source_id"), "title": pl.get("title", ""),
                         "text": pl.get("text", ""), "ts": pl.get("ts"), "score": float(p.score)}
    top = sorted(best.values(), key=lambda h: h["score"], reverse=True)[:k]
    return [h for h in top if h["score"] >= top[0]["score"] - MARGIN]


_GUARD = ("From this person's own earlier chats, saved notes and journal. It is private to them: use it only to "
          "understand their situation and answer better. Never copy it into a task, a message, a meeting invite or "
          "anything another person will see, and do not quote it unless they ask what they said before.")


def format_block(hits: list[dict[str, Any]], limit: int = 2400) -> str:
    """The memories as a short block for the AI's prompt, or an empty string when there are none."""
    if not hits:
        return ""
    lines, used = [], 0
    for h in hits:
        when = datetime.fromtimestamp(h["ts"], timezone.utc).strftime("%d %b %Y") if h.get("ts") else ""
        line = f"- [{h['kind']} {when}] {h['title']}: {' '.join((h.get('text') or '').split())[:360]}"
        if used + len(line) > limit:
            break
        lines.append(line)
        used += len(line)
    return f"{_GUARD}\n" + "\n".join(lines) + "\n" if lines else ""


# ---------------------------------------------------------------- safe wrappers for the request path
async def arecall(user_id: str | None, org_id: str | None, query: str, **kw: Any) -> list[dict[str, Any]]:
    """recall() for use while answering: off the event loop, time-limited, and never an error."""
    if not user_id or not org_id:
        return []
    try:
        return await asyncio.wait_for(asyncio.to_thread(recall, user_id, org_id, query, **kw), timeout=4)
    except Exception as e:  # no memory is better than a failed or slow answer
        logger.info("memory recall skipped (%s)", type(e).__name__)
        return []


async def aindex(items: list[dict[str, Any]]) -> dict[str, int]:
    try:
        return await asyncio.to_thread(index_items, items)
    except Exception as e:
        logger.warning("memory indexing failed: %s", e)
        return {"indexed": 0, "failed": len(items)}


async def aforget(kind: str, source_id: Any) -> None:
    try:
        await asyncio.to_thread(forget, kind, source_id)
    except Exception as e:
        logger.warning("memory forget failed: %s", e)


async def index_session_by_id(db, session_id: Any, tail_only: bool = True) -> dict[str, int]:
    """Index a conversation after a reply. Windows are fixed blocks of turns, so only the newest one can have
    changed: with ``tail_only`` that is all that is embedded."""
    from bson import ObjectId

    try:
        sid = ObjectId(str(session_id))
    except Exception:
        return {"indexed": 0, "failed": 0}
    session = db.assistant_sessions.find_one({"_id": sid})
    if not session:
        return {"indexed": 0, "failed": 0}
    items = chat_items(session)
    return await aindex(items[-1:] if tail_only else items)


# ---------------------------------------------------------------- rebuilding from MongoDB
def reindex(db, *, user_ids: list[str] | None = None, kinds: tuple[str, ...] = KINDS, dry_run: bool = False) -> dict[str, Any]:
    """Fill the memory (and the journal search) from MongoDB. Safe to run again: items are replaced, not duplicated."""
    from .journal_intel import _index_entry_sync

    def owned(field: str) -> dict[str, Any]:
        return {field: {"$in": user_ids}} if user_ids else {}

    report: dict[str, Any] = {"dry_run": dry_run}
    for kind, collection, query, make in (
        ("journal", "journal_entries", owned("user_id"), journal_items),
        ("note", "captures", owned("user_id"), note_items),
        ("chat", "assistant_sessions", {**owned("user_id"), "kind": {"$ne": "journal"}}, chat_items),
    ):
        if kind not in kinds:
            continue
        records, items = 0, []
        for rec in db[collection].find(query):
            records += 1
            items.extend(make(rec))
            if kind == "journal" and not dry_run:
                rec["_id"] = str(rec["_id"])
                try:
                    _index_entry_sync(rec)  # keeps "Ask your journal" search in step
                except Exception as e:
                    logger.warning("journal search index failed for %s: %s", rec["_id"], e)
        stats = {"records": records, "items": len(items)}
        if not dry_run:
            stats.update(index_items(items))
        report[kind] = stats
    return report


async def _embed_batch_patiently(embed, texts: list[str], attempts: int = 6):
    """One embedding batch, waiting and retrying when the service says "too many requests" or is busy."""
    import httpx

    for attempt in range(attempts):
        try:
            return await embed(texts)
        except httpx.HTTPStatusError as e:
            if e.response.status_code not in (429, 500, 502, 503) or attempt == attempts - 1:
                raise
            await asyncio.sleep(min(2 ** (attempt + 1), 30))


async def reindex_documents(db, *, user_ids: list[str] | None = None, dry_run: bool = False, batch_size: int = 24) -> dict[str, Any]:
    """Rebuild the vectors of uploaded documents from the chunks stored in MongoDB.

    The original upload gave every chunk a random id, so re-running it would duplicate them: each document's
    old points are removed first. A document whose embedding fails is left as it was, never half-replaced."""
    from qdrant_client.models import FieldCondition, Filter, FilterSelector, MatchValue, PointStruct

    from .file_processor import _gemini_embed_batch

    report = {"documents": 0, "chunks": 0, "replaced": 0, "failed": 0, "dry_run": dry_run}
    client = get_qdrant_client()
    if not dry_run and (client is None or not create_collection("documents", DIM)):
        report["failed"] = -1
        return report
    if not dry_run:
        ensure_payload_indexes("documents", keyword=("file_id", "org_id", "user_id"))
    query = {"user_id": {"$in": user_ids}} if user_ids else {}
    for doc in db.documents.find(query):
        chunks = [c for c in (doc.get("chunks") or []) if str(c).strip()]
        if not chunks or not doc.get("file_id"):
            continue
        report["documents"] += 1
        report["chunks"] += len(chunks)
        if dry_run:
            continue
        try:
            vectors: list[list[float]] = []
            for start in range(0, len(chunks), batch_size):
                vectors.extend(await _embed_batch_patiently(_gemini_embed_batch, chunks[start:start + batch_size]))
                await asyncio.sleep(0.5)  # stay under the embedding service's request limit
            if len(vectors) != len(chunks) or any(not any(v) for v in vectors):
                raise EmbeddingUnavailable("incomplete embeddings")
        except Exception as e:
            logger.warning("document %s not re-indexed: %s", doc.get("file_id"), redact_secrets(e))
            report["failed"] += 1
            continue
        client.delete(collection_name="documents", points_selector=FilterSelector(filter=Filter(
            must=[FieldCondition(key="file_id", match=MatchValue(value=doc["file_id"]))])))
        points = [
            PointStruct(
                id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"document:{doc['file_id']}:{i}")), vector=vec,
                payload={"file_id": doc["file_id"], "filename": doc.get("filename"), "org_id": doc.get("org_id"), "user_id": doc.get("user_id"),
                         "chunk_index": i, "chunk_text": str(chunk)[:500], "document_type": doc.get("file_type"),
                         "processed_at": datetime.utcnow().isoformat()},
            )
            for i, (chunk, vec) in enumerate(zip(chunks, vectors))
        ]
        for start in range(0, len(points), 64):
            client.upsert(collection_name="documents", points=points[start:start + 64])
        report["replaced"] += 1
    return report
