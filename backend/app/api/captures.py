"""Capture: one inbox for text, voice, files and meeting notes. See UNIFIED_CAPTURE_SPEC.md.

A capture is a thin record that sits in front of today's stores (journal entries, uploaded files,
meetings). Saving one queues a background analysis (``core/capture_analysis``): the kind is worked
out, people / dates / amounts are extracted, it is linked to related goals, tasks and earlier
captures, and task *suggestions* are offered. A suggestion becomes a task only when the author
accepts it.

Visibility
  private  - the author only. Nobody else, owners included.
  members  - the author, the people named in ``shared_with``, and the organization's owners.
  org      - every member of the organization.
Journal captures are always private and can never be widened.
"""
import logging
import re
from datetime import datetime
from typing import Any, Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..core.capture_access import can_read as _can_read
from ..core.capture_access import is_author as _is_author
from ..core.capture_access import visible_query as _visible_query
from ..core.capture_analysis import analyze_capture, schedule_analysis
from ..core.capture_metrics import store_metrics
from ..core import memory as _memory
from ..core.commitments import forget_capture
from ..core.config import settings
from ..core.database import get_database
from ..dependencies.auth import get_current_user
from ..dependencies.scope import email_is_org_member, is_org_owner, user_email, user_id
from ..dependencies.tenant import assert_org_access
from ..utils.dates import normalize_due_date
from .tasks import TaskCreate, create_task

logger = logging.getLogger("yesboss.captures")
router = APIRouter()

KINDS = ("note", "journal", "mom", "report", "idea", "question", "other")
SOURCES = ("text", "voice", "file", "transcript", "email", "cliq")
STATUSES = ("queued", "processing", "done", "needs_review", "failed")
MAX_TEXT = 100_000
MAX_SHARED = 50
PREVIEW_CHARS = 280
FILE_TEXT_CHARS = 2000  # enough for a preview; the file itself stays in Uploaded Data
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
JOURNAL_PRIVATE = "Journal entries stay private"


class RawRef(BaseModel):
    type: Literal["file", "journal_entry", "meeting"]
    id: str


class CaptureCreate(BaseModel):
    organization_id: str
    source: Literal["text", "voice", "file", "transcript"] = "text"
    kind: Literal["note", "journal", "mom", "report", "idea", "question", "other"] = "note"
    title: str | None = Field(default=None, max_length=200)
    text: str | None = Field(default=None, max_length=MAX_TEXT)
    visibility: Literal["private", "members", "org"] = "private"
    shared_with: list[str] = Field(default_factory=list)
    raw_ref: RawRef | None = None


class CaptureUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    kind: Literal["note", "journal", "mom", "report", "idea", "question", "other"] | None = None
    visibility: Literal["private", "members", "org"] | None = None
    shared_with: list[str] | None = None
    confirm: bool = False  # "the classification looks right": clears Needs review


class SuggestionAccept(BaseModel):
    title: str | None = Field(default=None, max_length=140)
    assignee_email: str | None = None
    due_date: str | None = None
    priority: Literal["low", "medium", "high"] | None = None
    goal_id: str | None = None


def _db():
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    return db


def _oid(value: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=404, detail="Capture not found")
    return ObjectId(value)


def _preview(text: str | None) -> str:
    flat = " ".join((text or "").split())
    return flat if len(flat) <= PREVIEW_CHARS else flat[: PREVIEW_CHARS - 1].rstrip() + "…"


async def _resolve_people(db, org_id: str, emails: list[str]) -> list[dict[str, str]]:
    """Named people for a members-visibility capture. Every one must belong to the organization;
    access is later checked by email, the name is for display only."""
    clean: list[str] = []
    for raw in emails:
        email = (raw or "").strip().lower()
        if not EMAIL_RE.match(email):
            raise HTTPException(status_code=400, detail=f"'{raw}' is not a valid email")
        if email not in clean:
            clean.append(email)
    if len(clean) > MAX_SHARED:
        raise HTTPException(status_code=400, detail=f"A capture can be shared with at most {MAX_SHARED} people")

    people = []
    outsiders = []
    for email in clean:
        if not await email_is_org_member(db, org_id, email):
            outsiders.append(email)
            continue
        row = db.org_chart_members.find_one({"organization_id": org_id, "email": email}, {"full_name": 1}) or {}
        people.append({"email": email, "name": row.get("full_name") or email.split("@")[0]})
    if outsiders:
        raise HTTPException(status_code=400, detail="Not members of this organization: " + ", ".join(outsiders))
    return people


async def _check_raw_ref(db, ref: RawRef, org_id: str, user) -> str:
    """The record a capture points at must be one the caller may use. Returns its text, if any."""
    uid, email = user_id(user), user_email(user)

    if ref.type == "file":
        # Uploaded Data stores a processed file under ``documents`` (uuid ``file_id``); plain
        # uploads live in ``files`` (ObjectId). Either way it must be the caller's, or an owner's.
        doc = None
        if ObjectId.is_valid(ref.id):
            doc = db.files.find_one({"_id": ObjectId(ref.id), "organization_id": org_id})
        if doc is None:
            doc = db.documents.find_one({"file_id": ref.id, "org_id": org_id})
        creator = str(doc.get("created_by") or doc.get("user_id") or "").strip().lower() if doc else ""
        if not doc or not (creator in {str(uid or "").lower(), email or ""} or await is_org_owner(db, org_id, user)):
            raise HTTPException(status_code=400, detail="File not found")
        return (doc.get("text") or "")[:FILE_TEXT_CHARS]

    if not ObjectId.is_valid(ref.id):
        raise HTTPException(status_code=400, detail="Invalid reference")
    oid = ObjectId(ref.id)

    if ref.type == "journal_entry":
        entry = db.journal_entries.find_one({"_id": oid, "org_id": org_id, "user_id": uid})
        if not entry:
            raise HTTPException(status_code=400, detail="Journal entry not found")
        return entry.get("content") or ""

    meeting = db.meetings.find_one({"_id": oid, "organization_id": org_id})
    if not meeting:
        raise HTTPException(status_code=400, detail="Meeting not found")
    return ""


def _utc_iso(value: datetime | None) -> str | None:
    """Timestamps are stored as naive UTC; the trailing Z tells the browser so it shows local time."""
    return value.isoformat() + "Z" if value else None


# ---------------------------------------------------------------- links, shown per viewer
class _Viewer:
    """What one viewer may see of goals and tasks, worked out once per request.

    The analysis linked a capture to things the *author* can see. Another person reading a shared
    capture must not learn the title of a goal or task they could not open themselves."""

    def __init__(self, db, user):
        self.db, self.user = db, user
        self._owner: dict[str, bool] = {}
        self._goals: dict[str, set[str]] = {}

    async def is_owner(self, org_id: str) -> bool:
        if org_id not in self._owner:
            self._owner[org_id] = await is_org_owner(self.db, org_id, self.user)
        return self._owner[org_id]

    def _mine_query(self, org_id: str) -> dict[str, Any]:
        uid, email = user_id(self.user), user_email(self.user)
        ids = [x for x in (uid, email) if x]
        return {"organization_id": org_id, "$or": [{"created_by": uid}, {"assignee_email": email}, {"assignee_id": {"$in": ids}}]}

    def mine(self, task: dict[str, Any]) -> bool:
        uid, email = user_id(self.user), user_email(self.user)
        assignees = task.get("assignee_id")
        assignees = assignees if isinstance(assignees, list) else [assignees]
        return bool(
            (uid and task.get("created_by") == uid)
            or (email and (task.get("assignee_email") or "").lower() == email)
            or ({uid, email} & {a for a in assignees if a})
        )

    def goals_of_my_tasks(self, org_id: str) -> set[str]:
        """Goals the viewer reaches through a task of their own (the same rule the analysis used)."""
        if org_id not in self._goals:
            rows = self.db.tasks.find(self._mine_query(org_id), {"goal_id": 1})
            self._goals[org_id] = {str(r["goal_id"]) for r in rows if r.get("goal_id")}
        return self._goals[org_id]


async def _resolve_links(db, captures: list[dict[str, Any]], user) -> dict[Any, list[dict[str, Any]]]:
    wanted: dict[str, set[str]] = {"goal": set(), "task": set(), "capture": set()}
    for c in captures:
        for link in c.get("links") or []:
            if link.get("type") in wanted and ObjectId.is_valid(str(link.get("id"))):
                wanted[link["type"]].add(str(link["id"]))

    def fetch(collection, ids: set[str], fields: dict[str, int]) -> dict[str, dict]:
        if not ids:
            return {}
        rows = collection.find({"_id": {"$in": [ObjectId(i) for i in ids]}}, fields)
        return {str(r["_id"]): r for r in rows}

    goals = fetch(db.goals, wanted["goal"], {"title": 1, "organization_id": 1, "created_by": 1})
    tasks = fetch(db.tasks, wanted["task"], {"title": 1, "organization_id": 1, "created_by": 1, "assignee_email": 1,
                                             "assignee_id": 1, "goal_id": 1})
    others = fetch(db.captures, wanted["capture"], {"title": 1, "preview": 1, "kind": 1, "org_id": 1, "user_id": 1,
                                                     "visibility": 1, "shared_with_emails": 1})
    viewer = _Viewer(db, user)
    uid = user_id(user)

    out: dict[Any, list[dict[str, Any]]] = {}
    for c in captures:
        shown = []
        org_id = c.get("org_id")
        for link in c.get("links") or []:
            kind, target_id = link.get("type"), str(link.get("id"))
            title = None
            if kind == "goal" and (g := goals.get(target_id)) and g.get("organization_id") == org_id:
                if await viewer.is_owner(org_id) or g.get("created_by") == uid or target_id in viewer.goals_of_my_tasks(org_id):
                    title = g.get("title")
            elif kind == "task" and (t := tasks.get(target_id)) and t.get("organization_id") == org_id:
                if await viewer.is_owner(org_id) or viewer.mine(t):
                    title = t.get("title")
            elif kind == "capture" and (o := others.get(target_id)) and o.get("org_id") == org_id:
                if await _can_read(db, o, user):
                    title = o.get("title") or o.get("preview")
            if title:
                shown.append({"type": kind, "id": target_id, "title": title, "reason": link.get("reason"),
                              "confidence": link.get("confidence")})
        out[c["_id"]] = shown
    return out


def _public(capture: dict[str, Any], user, links: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    analysis = capture.get("analysis") or {}
    author = _is_author(capture, user)
    return {
        "id": str(capture["_id"]),
        "organization_id": capture.get("org_id"),
        "user_id": capture.get("user_id"),
        "author_name": capture.get("author_name"),
        "source": capture.get("source"),
        "kind": capture.get("kind"),
        "kind_source": capture.get("kind_source"),
        "visibility": capture.get("visibility"),
        "shared_with": capture.get("shared_with") or [],
        "title": capture.get("title"),
        "text": capture.get("text"),
        "preview": capture.get("preview"),
        "raw_ref": capture.get("raw_ref"),
        "status": capture.get("status"),
        "series_key": capture.get("series_key"),
        "analysis": {
            "kind": analysis.get("kind"), "kind_confidence": analysis.get("kind_confidence"),
            "summary": analysis.get("summary"), "reason": analysis.get("reason"), "provider": analysis.get("provider"),
        } if analysis else None,
        "entities": capture.get("entities") or None,
        "links": links or [],
        # Suggestions are the author's to act on; people a capture is shared with do not see them.
        "suggestions": [
            {k: s.get(k) for k in ("id", "title", "description", "assignee_email", "due_date", "priority", "goal_id",
                                   "reason", "status", "task_id")}
            for s in (capture.get("suggestions") or [])
        ] if author else [],
        "error": capture.get("error") if author else None,
        "created_at": _utc_iso(capture.get("created_at")),
        "updated_at": _utc_iso(capture.get("updated_at")),
    }


async def _present(db, capture: dict[str, Any], user) -> dict[str, Any]:
    links = await _resolve_links(db, [capture], user)
    return _public(capture, user, links.get(capture["_id"]))


# ---------------------------------------------------------------- create / list / read
@router.post("", status_code=201)
async def create_capture(data: CaptureCreate, current_user=Depends(get_current_user)):
    db = _db()
    org_id = data.organization_id.strip()
    await assert_org_access(db, org_id, current_user)

    visibility, shared_with = data.visibility, data.shared_with
    if data.kind == "journal" and (visibility != "private" or shared_with):
        raise HTTPException(status_code=400, detail=JOURNAL_PRIVATE)
    if visibility != "members" and shared_with:
        raise HTTPException(status_code=400, detail="shared_with only applies to visibility 'members'")
    people = await _resolve_people(db, org_id, shared_with) if visibility == "members" else []
    if visibility == "members" and not people:
        raise HTTPException(status_code=400, detail="Name at least one person to share with")

    text = (data.text or "").strip()
    if data.raw_ref:
        ref_text = await _check_raw_ref(db, data.raw_ref, org_id, current_user)
        text = text or ref_text.strip()
    if not text and not data.raw_ref:
        raise HTTPException(status_code=400, detail="Add some text or attach a file")

    author = db.users.find_one({"uid": user_id(current_user)}, {"full_name": 1}) or {}
    now = datetime.utcnow()
    capture = {
        "org_id": org_id,
        "user_id": user_id(current_user),
        "author_name": author.get("full_name") or (user_email(current_user) or "").split("@")[0],
        "source": data.source,
        "kind": data.kind,
        # "note" is the unset default: the analysis may refine it. Any other kind was the user's choice.
        "kind_source": "default" if data.kind == "note" else "user",
        "visibility": visibility,
        "shared_with": people,
        "shared_with_emails": [p["email"] for p in people],
        "title": (data.title or "").strip() or None,
        "text": text or None,
        "preview": _preview(text),
        "raw_ref": data.raw_ref.model_dump() if data.raw_ref else None,
        "status": "queued" if settings.CAPTURE_AUTO_ANALYZE else "done",
        "created_at": now,
        "updated_at": now,
    }
    capture["_id"] = db.captures.insert_one(capture).inserted_id
    if settings.CAPTURE_AUTO_ANALYZE:
        schedule_analysis(str(capture["_id"]))
    return {"capture": _public(capture, current_user)}


@router.get("")
async def list_captures(
    organization_id: str = Query(...),
    kind: str | None = Query(None),
    source: str | None = Query(None),
    status: str | None = Query(None),
    q: str | None = Query(None, max_length=100),
    limit: int = Query(50, ge=1, le=100),
    skip: int = Query(0, ge=0),
    current_user=Depends(get_current_user),
):
    db = _db()
    await assert_org_access(db, organization_id, current_user)
    if kind and kind not in KINDS:
        raise HTTPException(status_code=400, detail="Unknown kind")
    if source and source not in SOURCES:
        raise HTTPException(status_code=400, detail="Unknown source")
    if status and status not in STATUSES:
        raise HTTPException(status_code=400, detail="Unknown status")

    query = await _visible_query(db, organization_id, current_user)
    if kind:
        query["kind"] = kind
    if source:
        query["source"] = source
    if status:
        query["status"] = status
        if status != "done":
            query["user_id"] = user_id(current_user)  # review and progress states belong to the author
    if q and q.strip():
        needle = {"$regex": re.escape(q.strip()), "$options": "i"}
        query = {"$and": [query, {"$or": [{"title": needle}, {"text": needle}]}]}

    total = db.captures.count_documents(query)
    rows = list(db.captures.find(query).sort("created_at", -1).skip(skip).limit(limit))
    links = await _resolve_links(db, rows, current_user)
    review = db.captures.count_documents(
        {"org_id": organization_id, "user_id": user_id(current_user), "status": "needs_review"})
    return {"captures": [_public(r, current_user, links.get(r["_id"])) for r in rows], "total": total,
            "needs_review": review}


async def _load(db, capture_id: str, user) -> dict[str, Any]:
    """404 for a missing capture and for one the caller may not see, so existence does not leak."""
    capture = db.captures.find_one({"_id": _oid(capture_id)})
    if not capture or not await _can_read(db, capture, user):
        raise HTTPException(status_code=404, detail="Capture not found")
    await assert_org_access(db, capture.get("org_id"), user)
    return capture


async def _load_as_author(db, capture_id: str, user) -> dict[str, Any]:
    capture = await _load(db, capture_id, user)
    if not _is_author(capture, user):
        raise HTTPException(status_code=403, detail="Only the author can do this")
    return capture


@router.get("/{capture_id}")
async def get_capture(capture_id: str, current_user=Depends(get_current_user)):
    db = _db()
    return {"capture": await _present(db, await _load(db, capture_id, current_user), current_user)}


# ---------------------------------------------------------------- change
@router.patch("/{capture_id}")
async def update_capture(capture_id: str, data: CaptureUpdate, current_user=Depends(get_current_user)):
    db = _db()
    capture = await _load(db, capture_id, current_user)
    org_id = capture["org_id"]
    author = _is_author(capture, current_user)
    owner = await is_org_owner(db, org_id, current_user)

    if not author and not (owner and capture.get("visibility") == "members"):
        raise HTTPException(status_code=403, detail="Only the author can change this capture")

    fields = data.model_fields_set
    if not author and fields - {"shared_with"}:
        raise HTTPException(status_code=403, detail="Only the author can change this capture")

    kind = data.kind if "kind" in fields and data.kind else capture["kind"]
    visibility = data.visibility if "visibility" in fields and data.visibility else capture["visibility"]
    shared = data.shared_with if "shared_with" in fields and data.shared_with is not None else None

    if kind == "journal":
        # A journal capture is never shared: becoming one makes it private again.
        if visibility != "private" and "visibility" in fields:
            raise HTTPException(status_code=400, detail=JOURNAL_PRIVATE)
        if shared:
            raise HTTPException(status_code=400, detail=JOURNAL_PRIVATE)
        visibility, shared = "private", []
    elif visibility != "members" and shared:
        raise HTTPException(status_code=400, detail="shared_with only applies to visibility 'members'")

    update: dict[str, Any] = {"kind": kind, "visibility": visibility, "updated_at": datetime.utcnow()}
    if "title" in fields:
        update["title"] = (data.title or "").strip() or None
    if "kind" in fields and data.kind:
        update["kind_source"] = "user"  # the person's choice now outranks the analysis
    if (("kind" in fields and data.kind) or data.confirm) and capture.get("status") == "needs_review":
        update["status"] = "done"

    if visibility == "members":
        if shared is not None:
            people = await _resolve_people(db, org_id, shared)
        else:
            people = capture.get("shared_with") or []
        if not people:
            raise HTTPException(status_code=400, detail="Name at least one person to share with")
        update["shared_with"] = people
        update["shared_with_emails"] = [p["email"] for p in people]
    else:
        update["shared_with"], update["shared_with_emails"] = [], []

    db.captures.update_one({"_id": capture["_id"]}, {"$set": update})
    updated = db.captures.find_one({"_id": capture["_id"]})
    if "kind" in fields and data.kind and data.kind != capture.get("kind"):
        # the numbers and commitments follow the kind: a journal has none, a report has numbers
        if kind == "journal":
            forget_capture(db, capture["_id"])
        elif kind == "report":
            await store_metrics(db, updated)
        else:
            db.report_metrics.delete_many({"capture_id": capture["_id"]})
    return {"capture": await _present(db, updated, current_user)}


# ---------------------------------------------------------------- analysis and suggestions
@router.post("/{capture_id}/analyze")
async def reanalyze_capture(capture_id: str, wait: bool = Query(False), current_user=Depends(get_current_user)):
    """Run the analysis again (author only). ``wait=true`` returns the finished result."""
    db = _db()
    capture = await _load_as_author(db, capture_id, current_user)
    if capture.get("status") == "processing":
        return {"capture": await _present(db, capture, current_user)}
    db.captures.update_one({"_id": capture["_id"]}, {"$set": {"status": "queued", "updated_at": datetime.utcnow()}})
    if wait:
        await analyze_capture(capture_id)
    else:
        schedule_analysis(capture_id)
    return {"capture": await _present(db, db.captures.find_one({"_id": capture["_id"]}), current_user)}


def _set_suggestion(db, capture_id, suggestion_id: str, fields: dict[str, Any], only_if: str | None = None) -> bool:
    query: dict[str, Any] = {"_id": capture_id}
    if only_if:
        query["suggestions"] = {"$elemMatch": {"id": suggestion_id, "status": only_if}}
    else:
        query["suggestions.id"] = suggestion_id
    changes = {f"suggestions.$.{k}": v for k, v in fields.items()}
    return db.captures.update_one(query, {"$set": changes}).modified_count == 1


def _pending_suggestion(capture: dict[str, Any], suggestion_id: str) -> dict[str, Any]:
    found = next((s for s in capture.get("suggestions") or [] if s.get("id") == suggestion_id), None)
    if not found:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    if found.get("status") != "pending":
        raise HTTPException(status_code=409, detail="That suggestion was already handled")
    return found


@router.post("/{capture_id}/suggestions/{suggestion_id}/accept")
async def accept_suggestion(capture_id: str, suggestion_id: str, data: SuggestionAccept | None = None,
                            current_user=Depends(get_current_user)):
    """Turn a suggestion into a real task (author only). The task goes through the normal task
    flow, so assignment notices, Cliq and Zoho/Google sync behave as for any other task."""
    db = _db()
    data = data or SuggestionAccept()
    capture = await _load_as_author(db, capture_id, current_user)
    suggestion = _pending_suggestion(capture, suggestion_id)
    org_id = capture["org_id"]

    me = user_email(current_user) or ""
    assignee = (data.assignee_email or suggestion.get("assignee_email") or me).strip().lower()
    if assignee != me and not await email_is_org_member(db, org_id, assignee):
        raise HTTPException(status_code=400, detail=f"{assignee} is not a member of this organization")

    goal_id = data.goal_id if data.goal_id is not None else suggestion.get("goal_id")
    if goal_id and not (ObjectId.is_valid(str(goal_id)) and db.goals.find_one({"_id": ObjectId(str(goal_id)), "organization_id": org_id})):
        goal_id = None
    due = normalize_due_date(data.due_date) if data.due_date else suggestion.get("due_date")

    # Claim it first so a double click cannot create two tasks.
    if not _set_suggestion(db, capture["_id"], suggestion_id, {"status": "accepting"}, only_if="pending"):
        raise HTTPException(status_code=409, detail="That suggestion was already handled")
    try:
        created = await create_task(
            TaskCreate(
                title=(data.title or suggestion["title"]).strip(),
                description=suggestion.get("description") or f"From your capture: {capture.get('title') or capture.get('preview') or ''}".strip(),
                priority=data.priority or suggestion.get("priority") or "medium",
                goal_id=str(goal_id) if goal_id else None,
                assignee_email=assignee,
                due_date=due,
                organization_id=org_id,
            ),
            organization_id=org_id,
            current_user=current_user,
        )
    except Exception:
        _set_suggestion(db, capture["_id"], suggestion_id, {"status": "pending"})
        raise

    task_id = str(created["task"]["_id"])
    db.tasks.update_one({"_id": ObjectId(task_id)}, {"$set": {"source": "capture", "capture_id": str(capture["_id"])}})
    _set_suggestion(db, capture["_id"], suggestion_id, {"status": "accepted", "task_id": task_id})
    # the commitment now has a task, so its progress is tracked and "done" has hard evidence
    db.commitments.update_one({"capture_id": capture["_id"], "suggestion_id": suggestion_id},
                              {"$set": {"task_id": task_id, "owner_email": assignee}})
    return {"task_id": task_id, "capture": await _present(db, db.captures.find_one({"_id": capture["_id"]}), current_user)}


@router.post("/{capture_id}/suggestions/{suggestion_id}/dismiss")
async def dismiss_suggestion(capture_id: str, suggestion_id: str, current_user=Depends(get_current_user)):
    db = _db()
    capture = await _load_as_author(db, capture_id, current_user)
    _pending_suggestion(capture, suggestion_id)
    if not _set_suggestion(db, capture["_id"], suggestion_id, {"status": "dismissed"}, only_if="pending"):
        raise HTTPException(status_code=409, detail="That suggestion was already handled")
    db.commitments.update_many({"capture_id": capture["_id"], "suggestion_id": suggestion_id}, {"$set": {"dropped": True}})
    return {"capture": await _present(db, db.captures.find_one({"_id": capture["_id"]}), current_user)}


# ---------------------------------------------------------------- delete
@router.delete("/{capture_id}")
async def delete_capture(capture_id: str, current_user=Depends(get_current_user)):
    """The author can delete their capture; an owner can delete one shared with members or the
    organization. A journal entry the capture points at is private to the same author, so it goes
    with it. Files and meetings are company records: they stay, and the response says so."""
    db = _db()
    capture = await _load(db, capture_id, current_user)
    org_id = capture["org_id"]
    if not _is_author(capture, current_user) and not await is_org_owner(db, org_id, current_user):
        raise HTTPException(status_code=403, detail="Only the author or an owner can delete this capture")

    ref = capture.get("raw_ref") or {}
    source_deleted = False
    source_kept = None
    if ref.get("type") == "journal_entry" and ObjectId.is_valid(ref.get("id", "")):
        source_deleted = db.journal_entries.delete_one(
            {"_id": ObjectId(ref["id"]), "user_id": capture.get("user_id"), "org_id": org_id}
        ).deleted_count > 0
    elif ref:
        source_kept = ref

    db.captures.delete_one({"_id": capture["_id"]})
    forget_capture(db, capture["_id"])  # its commitments and report numbers go with it
    await _memory.aforget("note", capture["_id"])  # and what was remembered from it
    if source_deleted:
        await _memory.aforget("journal", ref["id"])
    return {"success": True, "source_deleted": source_deleted, "source_kept": source_kept}
