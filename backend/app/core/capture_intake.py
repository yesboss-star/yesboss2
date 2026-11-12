"""Capture intake from outside the app (Phase 4): forwarded email and Cliq messages.

Both ways create a *private* capture for one person and queue the normal analysis. Nothing is shared
automatically: the author can share it later from the Capture page.

Email: each person has a private address, ``capture+<token>@<domain>``. The token, not the From
header (which anyone can forge), says whose inbox the message belongs to, so an unknown or old token
captures nothing. A person can replace their token at any time.
Cliq: a direct message that starts with ``capture:`` (or ``/capture``, ``#capture``) to the bot is
saved; so is a voice note sent when there is no open task conversation to reply to.
"""
import asyncio
import base64
import html
import logging
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta
from types import SimpleNamespace
from typing import Any

from ..dependencies.scope import is_org_member, resolve_user_org_ids
from ..utils.helpers import safe_filename, safe_path_segment
from .capture_analysis import schedule_analysis
from .config import settings

logger = logging.getLogger("yesboss.captures.intake")

ADDRESS_TOKEN = re.compile(r"capture\+([0-9a-f]{24,64})@", re.I)
ATTACHMENT_EXTENSIONS = {".pdf", ".docx", ".xlsx", ".xls", ".csv", ".txt", ".png", ".jpg", ".jpeg"}
MAX_ATTACHMENTS = 3
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
MAX_BODY_CHARS = 100_000
PER_HOUR_LIMIT = 60  # a stuck forwarding rule or a loop must not flood someone's inbox
PREVIEW_CHARS = 280
FILE_PREVIEW_CHARS = 2000
_SUBJECT_PREFIX = re.compile(r"^\s*(?:(?:fwd?|re|fw)\s*:\s*)+", re.I)
_CAPTURE_COMMAND = re.compile(r"^\s*(?:/|#)capture\b\s*[:\-–]?\s*(.*)$|^\s*capture\s*[:\-–]\s*(.*)$", re.I | re.S)


# ---------------------------------------------------------------- each person's private address
def inbox_enabled() -> bool:
    return bool(settings.CAPTURE_INBOUND_SECRET)


def inbox_address(token: str) -> str | None:
    domain = (settings.CAPTURE_INBOUND_DOMAIN or "").strip().lstrip("@")
    return f"capture+{token}@{domain}" if domain else None


def get_or_create_token(db, uid: str) -> str | None:
    row = db.users.find_one({"uid": uid}, {"capture_token": 1})
    if row is None:
        return None
    if row.get("capture_token"):
        return row["capture_token"]
    # only set it when still missing, so two requests at once cannot hand out two tokens
    db.users.update_one({"uid": uid, "capture_token": {"$exists": False}}, {"$set": {"capture_token": secrets.token_hex(16)}})
    return (db.users.find_one({"uid": uid}, {"capture_token": 1}) or {}).get("capture_token")


def regenerate_token(db, uid: str) -> str | None:
    token = secrets.token_hex(16)
    result = db.users.update_one({"uid": uid}, {"$set": {"capture_token": token}})
    return token if result.matched_count else None


def token_from_recipients(*values: str) -> str | None:
    match = ADDRESS_TOKEN.search(" ".join(v for v in values if v))
    return match.group(1).lower() if match else None


def user_for_token(db, token: str) -> dict[str, Any] | None:
    return db.users.find_one({"capture_token": token}) if token else None


# ---------------------------------------------------------------- text helpers
def strip_html(markup: str) -> str:
    text = re.sub(r"(?is)<(script|style).*?</\1>", " ", markup or "")
    text = re.sub(r"(?i)<br\s*/?>|</(p|div|li|tr|h\d)>", "\n", text)
    text = html.unescape(re.sub(r"<[^>]+>", " ", text))
    text = re.sub(r"[ \t]*\n[ \t]*", "\n", re.sub(r"[ \t]+", " ", text))
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def clean_subject(subject: str | None) -> str | None:
    return _SUBJECT_PREFIX.sub("", subject or "").strip()[:200] or None


def _preview(text: str) -> str:
    flat = " ".join((text or "").split())
    return flat if len(flat) <= PREVIEW_CHARS else flat[: PREVIEW_CHARS - 1].rstrip() + "…"


def parse_capture_command(text: str | None) -> str | None:
    """``capture: call Acme`` -> ``call Acme``. Anything that is not a command gives None."""
    match = _CAPTURE_COMMAND.match(text or "")
    if not match:
        return None
    body = (match.group(1) if match.group(1) is not None else match.group(2) or "").strip()
    return body or None


# ---------------------------------------------------------------- creating the capture
async def _org_for(db, user_doc: dict[str, Any], org_id: str = "") -> str:
    person = SimpleNamespace(id=user_doc.get("uid"), uid=user_doc.get("uid"), email=(user_doc.get("email") or "").lower())
    if org_id and await is_org_member(db, org_id, person):
        return org_id
    own = str(user_doc.get("organization_id") or "")
    if own and await is_org_member(db, own, person):
        return own
    ids = sorted(await resolve_user_org_ids(db, person))
    return ids[0] if ids else ""


async def ingest_capture(db, *, user_doc: dict[str, Any], source: str, text: str = "", title: str | None = None,
                         raw_ref: dict[str, str] | None = None, org_id: str = "", external_id: str | None = None) -> dict[str, Any] | None:
    """Save one private capture for ``user_doc``. None when it was refused (no organization, a repeat,
    or too many in the last hour)."""
    uid = user_doc.get("uid")
    org = await _org_for(db, user_doc, org_id)
    if not uid or not org or not (text.strip() or raw_ref):
        return None
    if external_id and db.captures.find_one({"user_id": uid, "external_id": external_id}, {"_id": 1}):
        return None  # the same message delivered twice
    since = datetime.utcnow() - timedelta(hours=1)
    if db.captures.count_documents({"user_id": uid, "source": {"$in": ["email", "cliq"]}, "created_at": {"$gte": since}}) >= PER_HOUR_LIMIT:
        logger.warning("Capture intake: hourly limit reached for %s", uid)
        return None

    text = text.strip()[:MAX_BODY_CHARS]
    now = datetime.utcnow()
    capture = {
        "org_id": org, "user_id": uid,
        "author_name": user_doc.get("full_name") or (user_doc.get("email") or "").split("@")[0],
        "source": source, "kind": "note", "kind_source": "default",
        "visibility": "private", "shared_with": [], "shared_with_emails": [],
        "title": title, "text": text or None, "preview": _preview(text), "raw_ref": raw_ref,
        "status": "queued" if settings.CAPTURE_AUTO_ANALYZE else "done",
        "external_id": external_id, "created_at": now, "updated_at": now,
    }
    capture["_id"] = db.captures.insert_one(capture).inserted_id
    if settings.CAPTURE_AUTO_ANALYZE:
        schedule_analysis(str(capture["_id"]))
    return capture


async def save_attachment(db, org_id: str, uid: str, filename: str, data: bytes) -> str | None:
    """Store a forwarded attachment the way Uploaded Data does, so it can be read, analysed and
    listed there. Returns the file id."""
    from .file_processor import extract_text, get_file_type

    name = safe_filename(filename)
    file_id = uuid.uuid4().hex
    directory = f"uploads/email/{safe_path_segment(org_id)}"
    path = f"{directory}/{file_id}_{name}"

    def write() -> None:
        os.makedirs(directory, exist_ok=True)
        with open(path, "wb") as handle:
            handle.write(data)

    try:
        await asyncio.to_thread(write)
        text = await asyncio.to_thread(extract_text, data, name)
    except Exception as e:
        logger.warning("Could not store attachment %s: %s", name, e)
        return None
    db.documents.insert_one({
        "file_id": file_id, "filename": name, "file_path": path, "file_type": get_file_type(name), "org_id": org_id,
        "user_id": uid, "text": text[:50000], "text_length": len(text), "chunks": [], "chunk_count": 0,
        "insights": None, "insights_status": "none", "created_at": datetime.utcnow(), "metadata": {"source": "email"},
    })
    return file_id


def decode_json_attachments(items: Any) -> list[tuple[str, bytes]]:
    out: list[tuple[str, bytes]] = []
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        try:
            data = base64.b64decode(item.get("content_base64") or item.get("content") or "", validate=False)
        except Exception:
            continue
        if data:
            out.append((str(item.get("filename") or item.get("name") or "attachment"), data))
    return out


async def ingest_email(db, user_doc: dict[str, Any], *, subject: str | None, body: str,
                       attachments: list[tuple[str, bytes]], message_id: str | None) -> dict[str, Any]:
    """One forwarded message -> a note for the body and one capture per usable attachment."""
    org = await _org_for(db, user_doc)
    uid = user_doc["uid"]
    result: dict[str, Any] = {"captured": 0, "skipped": []}
    title = clean_subject(subject)
    base_id = f"email:{message_id.strip()}" if message_id and message_id.strip() else None

    if body.strip():
        made = await ingest_capture(db, user_doc=user_doc, source="email", text=body, title=title, external_id=base_id)
        result["captured"] += bool(made)
    for index, (filename, data) in enumerate(attachments):
        ext = os.path.splitext(filename)[1].lower()
        if index >= MAX_ATTACHMENTS:
            result["skipped"].append(f"{filename}: only the first {MAX_ATTACHMENTS} attachments are read")
        elif ext not in ATTACHMENT_EXTENSIONS:
            result["skipped"].append(f"{filename}: this file type is not supported")
        elif len(data) > MAX_ATTACHMENT_BYTES:
            result["skipped"].append(f"{filename}: larger than 10 MB")
        else:
            file_id = await save_attachment(db, org, uid, filename, data) if org else None
            doc = db.documents.find_one({"file_id": file_id}, {"text": 1}) if file_id else None
            made = file_id and await ingest_capture(
                db, user_doc=user_doc, source="file", title=safe_filename(filename), raw_ref={"type": "file", "id": file_id},
                text=(doc or {}).get("text", "")[:FILE_PREVIEW_CHARS], org_id=org,  # the same preview the app keeps for uploads
                external_id=f"{base_id}:{index}" if base_id else None)
            if made:
                result["captured"] += 1
            else:
                result["skipped"].append(f"{filename}: could not be saved")
    return result


# ---------------------------------------------------------------- Cliq
async def capture_from_cliq(db, identity: dict[str, Any], normalized: dict[str, Any], *, no_open_thread: bool = False) -> bool:
    """Save a Cliq message as a capture when it is a capture command (or a voice note with nothing
    else to reply to). Returns True when the message was used."""
    if normalized.get("modality") == "button":
        return False
    text = normalized.get("text") or ""
    command = parse_capture_command(text)
    if command is None and not (no_open_thread and normalized.get("modality") == "voice" and text.strip()):
        return False
    body = command if command is not None else text
    user_doc = db.users.find_one({"email": identity.get("email")}) or db.users.find_one({"uid": identity.get("uid")})
    if not user_doc:
        return False
    msg_id = normalized.get("cliq_msg_id") or ""
    made = await ingest_capture(db, user_doc=user_doc, source="cliq", text=body, org_id=identity.get("org_id") or "",
                                external_id=f"cliq:{msg_id}" if msg_id else None)
    if made:
        try:
            from .zoho.cliq import ZohoCliq

            await ZohoCliq(db).send_dm(identity.get("email", ""), "Saved to your Capture inbox. Only you can see it until you share it.",
                                       org_id=made["org_id"])
        except Exception as e:  # the confirmation is a courtesy
            logger.info("Cliq confirmation not sent: %s", e)
    return True
