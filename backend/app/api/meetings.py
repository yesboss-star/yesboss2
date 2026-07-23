import asyncio
import json
import logging
import re
from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile

from ..api.websocket import manager as ws_manager
from ..core.database import get_database
from ..core.zoho import ZohoMailTasks, ZohoOAuth
from ..dependencies.auth import get_current_user_optional

logger = logging.getLogger("yesboss.meetings")

router = APIRouter()


def resolve_mentions(text: str, db, org_id: str) -> list[str]:
    names = re.findall(r'@(\w[\w\s.-]+?)(?:\s|$|[,;:.!?])', text + " ")
    resolved = []
    seen = set()
    for name in names:
        name = name.strip()
        if not name or name.lower() in seen:
            continue
        seen.add(name.lower())
        member = db.org_chart_members.find_one({
            "organization_id": org_id,
            "full_name": {"$regex": f"^{re.escape(name)}$", "$options": "i"},
        })
        if member:
            resolved.append(member.get("email", "").lower())
    return list(set(resolved))


def _resolve_assignee(db, org_id: str, name: str):
    """Try to match a name against org chart members with progressive loosening."""
    name = name.strip()
    if not name:
        return None
    emp = db.org_chart_members.find_one({
        "organization_id": org_id,
        "$or": [
            {"email": {"$regex": f"^{re.escape(name)}$", "$options": "i"}},
            {"full_name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}},
        ]
    })
    if not emp:
        name_parts = name.split()
        if len(name_parts) >= 2:
            first = re.escape(name_parts[0])
            last = re.escape(name_parts[-1])
            emp = db.org_chart_members.find_one({
                "organization_id": org_id,
                "full_name": {"$regex": f"^{first} .*{last}$", "$options": "i"},
            })
    if not emp:
        # Substring match on full_name or email (catch-all for first-name-only, partial matches)
        emp = db.org_chart_members.find_one({
            "organization_id": org_id,
            "$or": [
                {"full_name": {"$regex": re.escape(name), "$options": "i"}},
                {"email": {"$regex": re.escape(name), "$options": "i"}},
            ]
        })
    if emp:
        logger.info("_resolve_assignee: '%s' → %s <%s>", name, emp.get("full_name"), emp.get("email"))
    else:
        logger.warning("_resolve_assignee: '%s' → no match in org_chart_members", name)
    return emp


def _find_matching_assignees(db, org_id: str, name: str) -> list[dict]:
    """Return ALL org chart members matching a given name, for disambiguation."""
    name = name.strip()
    if not name:
        return []
    results = []
    seen = set()
    candidates = list(db.org_chart_members.find({
        "organization_id": org_id,
        "$or": [
            {"full_name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}},
            {"email": {"$regex": f"^{re.escape(name)}$", "$options": "i"}},
        ]
    }))
    for c in candidates:
        email = c.get("email", "").lower()
        if email and email not in seen:
            seen.add(email)
            results.append({"name": c.get("full_name", email), "email": email})

    if not results:
        name_parts = name.split()
        if len(name_parts) >= 2:
            first = re.escape(name_parts[0])
            last = re.escape(name_parts[-1])
            candidates = list(db.org_chart_members.find({
                "organization_id": org_id,
                "full_name": {"$regex": f"^{first} .*{last}$", "$options": "i"},
            }))
            for c in candidates:
                email = c.get("email", "").lower()
                if email and email not in seen:
                    seen.add(email)
                    results.append({"name": c.get("full_name", email), "email": email})

    if not results:
        candidates = list(db.org_chart_members.find({
            "organization_id": org_id,
            "$or": [
                {"full_name": {"$regex": re.escape(name), "$options": "i"}},
                {"email": {"$regex": re.escape(name), "$options": "i"}},
            ]
        }))
        for c in candidates:
            email = c.get("email", "").lower()
            if email and email not in seen:
                seen.add(email)
                results.append({"name": c.get("full_name", email), "email": email})

    logger.info("_find_matching_assignees: '%s' → %d matches: %s", name, len(results), results)
    return results


def _resolve_multi_assignee(db, org_id: str, text: str) -> list:
    """Parse compound assignee strings like 'Krisha & Prince' or 'Krisha, Prince' into a list of emails."""
    text = text.strip()
    if not text:
        return []
    parts = re.split(r'\s*[&,]\s*|\s+and\s+', text)
    emails = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        emp = _resolve_assignee(db, org_id, part)
        if emp:
            emails.append(emp.get("email", "").lower())
    return emails


def _build_section_map(text: str) -> dict:
    """Parse meeting notes into a section map: name → list of task lines under that name."""
    sections = {}
    current_names = []
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue
        # Pattern: "Name • task"
        name_match = re.match(r'^([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\s+[•\*]\s+(.+)', line)
        if name_match:
            name = name_match.group(1)
            task_text = name_match.group(2)
            current_names = [name]
            for cn in current_names:
                sections.setdefault(cn, []).append(task_text)
        # Pattern: "• subtask" (continuation of previous name's section)
        elif re.match(r'^[•\*]\s+', line):
            task_text = re.sub(r'^[•\*]\s+', '', line)
            for cn in current_names:
                sections.setdefault(cn, []).append(task_text)
        # Pattern: "NAME -" or "NAME & NAME -" (section header)
        else:
            header_match = re.match(r'^([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?(?:\s*[&,]\s*[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)?)\s*[–\-]', line)
            if header_match:
                current_names = [n.strip() for n in re.split(r'\s*[&,]\s*|\s+and\s+', header_match.group(1))]
            else:
                # Pattern: "Name Task text" (name prefix without bullet, like "Rishi Set GTM w/ @prince")
                name_prefix = re.match(r'^([A-Z][a-zA-Z]+)\s+(.+)', line)
                if name_prefix and len(name_prefix.group(1)) >= 2 and len(name_prefix.group(2)) > 5:
                    current_names = [name_prefix.group(1)]
                    sections.setdefault(current_names[0], []).append(name_prefix.group(2))
    return sections


def _match_task_to_section(task_title: str, section_map: dict) -> list:
    """Try to find which name(s) a task belongs to based on section task text overlap."""
    title_lower = task_title.lower()
    matches = []
    for name, tasks in section_map.items():
        for t in tasks:
            t_lower = t.lower()
            title_words = [w for w in title_lower.split() if len(w) > 2]
            if title_words:
                overlap = sum(1 for w in title_words if w in t_lower)
                if overlap >= max(1, len(title_words) // 2):
                    matches.append(name)
                    break
            elif len(t_lower) > 3 and (t_lower in title_lower or title_lower in t_lower):
                matches.append(name)
                break
    return matches


def _extract_names_from_text(text: str) -> list:
    """Extract person names from meeting notes text using common MoM patterns."""
    names = []
    # Pattern 1: "Name • task" (name before bullet)
    matches = re.findall(r'^([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\s+[•\*]\s', text, re.MULTILINE)
    names.extend(matches)
    # Pattern 2: "• Name – task" or "* Name – task" (name after bullet, before dash)
    matches = re.findall(r'^[•\*]\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\s*[–\-]', text, re.MULTILINE)
    names.extend(matches)
    # Pattern 3: "Name:" or "Name – role" or "Name - role" (role assignments)
    matches = re.findall(r'^([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\s*:\s', text, re.MULTILINE)
    names.extend(matches)
    # Pattern 4: "NAME & NAME -" (section headers for shared tasks)
    matches = re.findall(r'^([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?(?:\s*[&,]\s*[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)?)\s*[–\-]', text, re.MULTILINE)
    names.extend(matches)
    # Pattern 5: @mentions
    matches = re.findall(r'@(\w[\w\s.-]+?)(?:\s|$|[,;:.!?])', text + " ")
    names.extend(matches)
    seen = set()
    result = []
    for n in names:
        n = n.strip()
        if n and n.lower() not in seen:
            seen.add(n.lower())
            result.append(n)
    return result

TASK_SYSTEM_PROMPT = (
    "You are an AI assistant that extracts actionable tasks from meeting notes. "
    "Given the meeting title, participants, and notes below, identify all actionable tasks. "
    "For each task, return a JSON object with these fields:\n"
    "- title: short task name (required)\n"
    "- description: detailed description of what needs to be done\n"
    "- suggested_assignee: the EXACT name(s) of the person(s) responsible, as written in the meeting notes. "
    "If multiple people are assigned (e.g. 'Krisha & Prince' or 'Krisha, Prince' or 'Krisha and Prince'), "
    "include ALL names separated by ' & '. Extract from the meeting notes text — do not make up names. "
    "If unclear, use the empty string.\n"
    "- suggested_priority: one of high, medium, low\n"
    "- suggested_deadline: when it should be done (relative date like '2026-06-20' or empty string)\n\n"
    "IMPORTANT: Meeting notes often use sections with headers like 'Person: role' or 'Person • task'. "
    "Use these headers to determine who each task belongs to. Also watch for sections like "
    "'PERSON1 & PERSON2 -' where all tasks under that section belong to both people. "
    "Do not use email addresses. Leave empty if no person is clearly responsible.\n\n"
    "Return ONLY a valid JSON array of task objects. No markdown, no code blocks, no extra text."
)


async def get_user_org_id(user) -> str | None:
    if hasattr(user, 'user_metadata') and user.user_metadata:
        return user.user_metadata.get("organization_id")
    return None


async def _resolve_token_for_email(db, email: str, org_id: str | None = None) -> str | None:
    """Find a valid Zoho access token for a user by their email address."""
    zoauth = ZohoOAuth(db)
    # Strategy 1: direct user_id lookup (tokens stored with user_id = Firebase uid)
    token = await zoauth.get_valid_token(email)
    if token:
        return token
    # Strategy 2: users collection maps email → Firebase uid
    user_doc = db.users.find_one({"email": {"$regex": f"^{re.escape(email)}$", "$options": "i"}})
    if user_doc and user_doc.get("uid"):
        token = await zoauth.get_valid_token(user_doc["uid"])
        if token:
            return token
    # Strategy 3: search zoho_tokens by stored fields
    att_doc = db.zoho_tokens.find_one({
        "$or": [
            {"zoho_mail_id": {"$regex": re.escape(email), "$options": "i"}},
            {"email": {"$regex": re.escape(email), "$options": "i"}},
            {"user_id": email},
        ]
    })
    if att_doc and att_doc.get("user_id"):
        token = await zoauth.get_valid_token(att_doc["user_id"])
        if token:
            return token
    # Strategy 4: org_chart_members → try matching zoho_mail_id substring
    member = None
    if org_id:
        member = db.org_chart_members.find_one({
            "organization_id": org_id,
            "email": {"$regex": f"^{re.escape(email)}$", "$options": "i"},
        })
    if member:
        name_parts = (member.get("full_name") or "").split()
        if name_parts:
            att_doc = db.zoho_tokens.find_one({
                "zoho_mail_id": {"$regex": re.escape(name_parts[0]), "$options": "i"},
            })
            if att_doc and att_doc.get("user_id"):
                token = await zoauth.get_valid_token(att_doc["user_id"])
                if token:
                    return token
    logger.warning("_resolve_token_for_email: no token found for %s", email)
    return None


async def _push_to_zoho_todo(db, org_id: str, task_doc: dict, assignee_emails: list):
    try:
        mail_tasks = ZohoMailTasks(db)
        owner_token = await ZohoOAuth(db).get_valid_token(task_doc.get("created_by"))
        if not owner_token:
            org = db.organizations.find_one({"_id": ObjectId(org_id)})
            if org and org.get("owner_id"):
                owner_token = await ZohoOAuth(db).get_valid_token(org["owner_id"])

        zgid = None
        if owner_token:
            org_name = ""
            org_doc = db.organizations.find_one({"_id": ObjectId(org_id)})
            if org_doc:
                org_name = org_doc.get("name", "")
            zgid = await mail_tasks.ensure_group(org_name, owner_token)

        zoho_ids = []
        for email in assignee_emails:
            att_token = await _resolve_token_for_email(db, email, org_id)
            if att_token:
                zoho_task_id = await mail_tasks.create_personal_task(att_token, task_doc)
                if zoho_task_id:
                    zoho_ids.append(zoho_task_id)
                    logger.info("Pushed task '%s' to Zoho ToDo for %s (id=%s)", task_doc.get("title"), email, zoho_task_id)
                    if zgid:
                        group_task_id = await mail_tasks.create_group_task(owner_token, zgid, task_doc)
                        if group_task_id:
                            logger.info("Pushed task to Zoho group for %s (id=%s)", email, group_task_id)
                else:
                    logger.warning("Failed to push task to Zoho ToDo for %s", email)
            else:
                logger.warning("No Zoho token for %s — skipping Zoho ToDo push", email)

        if zoho_ids:
            db.tasks.update_one({"_id": ObjectId(task_doc["_id"])}, {"$set": {"zoho_task_ids": zoho_ids}})
    except Exception as e:
        logger.error("Failed to push task to Zoho ToDo: %s", e, exc_info=True)


async def create_task_from_meeting(
    db,
    org_id: str,
    user_id: str,
    task_data: dict,
    meeting_title: str,
    participant_list: list | None = None,
    goal_id: str | None = None,
    manual_assignee_emails: list | None = None,
):
    assignee_emails = []
    suggested = (task_data.get("suggested_assignee") or "").strip()

    logger.info("create_task_from_meeting: task='%s' suggested='%s' participants=%s",
                 task_data.get("title"), suggested, participant_list)

    if suggested:
        assignee_emails = _resolve_multi_assignee(db, org_id, suggested)
        logger.info("Resolved suggested_assignee '%s' -> emails=%s", suggested, assignee_emails)

    if not assignee_emails and suggested and participant_list:
        suggested_lower = suggested.lower()
        for email in participant_list:
            emp = db.org_chart_members.find_one({
                "organization_id": org_id,
                "email": {"$regex": f"^{re.escape(email)}$", "$options": "i"},
            })
            if emp:
                full_name = (emp.get("full_name") or "").lower()
                if full_name:
                    if suggested_lower == full_name or suggested_lower in full_name or full_name in suggested_lower:
                        assignee_emails = [email]
                        logger.info("Participant name match: suggested='%s' matched '%s' -> %s", suggested, full_name, email)
                        break
                    first_name = full_name.split()[0] if full_name.split() else ""
                    if first_name and (suggested_lower == first_name or suggested_lower.startswith(first_name)):
                        assignee_emails = [email]
                        logger.info("Participant first-name match: suggested='%s' matched '%s' -> %s", suggested, first_name, email)
                        break

    if not assignee_emails and manual_assignee_emails:
        assignee_emails = manual_assignee_emails
        logger.info("Manual override: using emails %s for task '%s'", manual_assignee_emails, task_data.get("title"))

    task_doc = {
        "title": task_data.get("title", "Untitled Task"),
        "description": task_data.get("description", ""),
        "priority": task_data.get("suggested_priority", "medium"),
        "status": "pending",
        "assignee_id": assignee_emails,
        "assignee_email": assignee_emails[0] if assignee_emails else "",
        "assignee_name": suggested,
        "department": None,
        "due_date": task_data.get("suggested_deadline"),
        "dependencies": [],
        "reviewers": [],
        "organization_id": org_id,
        "created_by": user_id,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "escalation_level": 0,
        "owner_escalated": False,
        "owner_escalated_at": None,
        "source": "meeting",
        "source_meeting_title": meeting_title,
        "zoho_task_ids": [],
        "goal_id": goal_id,
    }
    result = db.tasks.insert_one(task_doc)
    task_doc["_id"] = str(result.inserted_id)

    asyncio.create_task(ws_manager.broadcast_to_organization(
        {"type": "task_created", "data": task_doc}, org_id
    ))

    for email in assignee_emails:
        from ..core.notification_service import create_and_deliver
        asyncio.create_task(create_and_deliver(
            user_id=email,
            org_id=org_id,
            type="task_assigned",
            title="New Task from Meeting",
            message=f"Task '{task_doc['title']}' created from meeting '{meeting_title}'",
            link=f"/tasks/{result.inserted_id}",
            actor_id=user_id,
        ))

    if not task_doc.get("due_date") and user_id:
        from ..core.notification_service import create_and_deliver
        asyncio.create_task(create_and_deliver(
            user_id=user_id,
            org_id=org_id,
            type="deadline_needed",
            title="Task needs a deadline",
            message=f"Task '{task_doc['title']}' has no deadline — please set one",
            link=f"/tasks/{result.inserted_id}",
            actor_id=user_id,
        ))

    asyncio.create_task(_push_to_zoho_todo(db, org_id, task_doc, assignee_emails))

    return task_doc


@router.post("/process")
async def process_meeting(
    meeting_title: str = Form(...),
    participants: str | None = Form(None),
    file: UploadFile | None = File(None),
    zoho_event_id: str | None = Form(None),
    organization_id: str | None = Form(None),
    goal_id: str | None = Form(None),
    current_user=Depends(get_current_user_optional),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = organization_id or await get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

    user_id = getattr(current_user, 'id', None) or str(current_user) if current_user else None

    raw_text = ""
    participant_list = []

    if zoho_event_id:
        event = db.calendar_events.find_one({"zoho_event_id": zoho_event_id})
        if not event:
            raise HTTPException(status_code=404, detail="Calendar event not found. Sync your calendar first.")
        raw_text = event.get("description", "")
        if not raw_text:
            raw_text = event.get("title", "")
        participant_list = event.get("attendees", [])
        if not meeting_title:
            meeting_title = event.get("title", "Meeting from Calendar")

    else:
        if not file:
            raise HTTPException(status_code=400, detail="Either file or zoho_event_id is required")
        ALLOWED_EXTENSIONS = {"txt", "md", "csv", "json", "xml", "html", "log", "pdf", "docx", "xlsx", "xls"}
        MAX_FILE_SIZE = 20 * 1024 * 1024
        file_bytes = await file.read()
        if not file_bytes:
            raise HTTPException(status_code=400, detail="Empty file")
        if len(file_bytes) > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail=f"File too large. Max {MAX_FILE_SIZE // (1024*1024)}MB.")
        filename = file.filename or "meeting_notes.txt"
        ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail=f"Unsupported file type '.{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}")
        text_ext = {"txt", "md", "csv", "json", "xml", "html", "log"}
        doc_ext = {"pdf", "docx", "xlsx", "xls"}
        if ext in text_ext:
            raw_text = file_bytes.decode("utf-8", errors="ignore").strip()
        elif ext in doc_ext:
            from ..core.file_processor import extract_text
            raw_text = extract_text(file_bytes, filename)
        else:
            raw_text = file_bytes.decode("utf-8", errors="ignore").strip()
        if not raw_text:
            raise HTTPException(status_code=400, detail="Could not extract text from file. Supported formats: txt, md, pdf, docx.")
        participant_list = [p.strip() for p in (participants or "").split(",") if p.strip()] if participants else []

    extracted_names = _extract_names_from_text(raw_text)
    logger.info("Extracted names from text: %s", extracted_names)
    for name in extracted_names:
        emp = _resolve_assignee(db, org_id, name)
        if emp:
            email = emp.get("email", "").lower()
            if email and email not in participant_list:
                participant_list.append(email)
                logger.info("Added %s to participant list from extracted name '%s'", email, name)

    ai_prompt = (
        f"Meeting Title: {meeting_title}\n"
        f"Participants: {', '.join(participant_list) if participant_list else 'N/A'}\n\n"
        f"Meeting Notes:\n{raw_text[:8000]}"
    )

    from ..core.ai_client import get_ai_response
    ai_result = ""
    try:
        ai_result = await get_ai_response(
            prompt=ai_prompt,
            system_prompt=TASK_SYSTEM_PROMPT,
            temperature=0.3,
            max_tokens=3000,
        )
    except Exception as e:
        logger.error(f"AI analysis failed: {e}")
        raise HTTPException(status_code=502, detail=f"AI analysis failed: {e}")

    tasks_data = []
    cleaned = ai_result.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned)
        cleaned = re.sub(r'\s*```$', '', cleaned)
    try:
        tasks_data = json.loads(cleaned)
        if isinstance(tasks_data, dict):
            tasks_data = tasks_data.get("tasks", tasks_data.get("task", [tasks_data]))
        if not isinstance(tasks_data, list):
            tasks_data = [tasks_data]
    except json.JSONDecodeError:
        logger.warning(f"AI returned non-JSON, attempting extraction: {ai_result[:200]}")
        match = re.search(r'\[.*?\]', cleaned, re.DOTALL)
        if match:
            try:
                tasks_data = json.loads(match.group(0))
            except json.JSONDecodeError:
                tasks_data = []
        else:
            tasks_data = []

    logger.info("AI returned %d tasks: %s", len(tasks_data), json.dumps([{
        "title": t.get("title", ""),
        "suggested_assignee": t.get("suggested_assignee", ""),
        "priority": t.get("suggested_priority", ""),
    } for t in tasks_data if isinstance(t, dict) and t.get("title")], indent=2))

    preview_tasks = []
    section_map = _build_section_map(raw_text)
    logger.info("Section map: %s", json.dumps({k: v for k, v in section_map.items()}, indent=2))
    for td in tasks_data:
        if isinstance(td, dict) and td.get("title"):
            suggested = (td.get("suggested_assignee") or "").strip()
            if not suggested:
                matched = _match_task_to_section(td.get("title", ""), section_map)
                if matched:
                    suggested = " & ".join(matched)
                    logger.info("Section fallback: task '%s' matched to '%s'", td.get("title"), suggested)

            suggestions = []
            if suggested:
                parts = re.split(r'\s*[&,]\s*|\s+and\s+', suggested)
                for part in parts:
                    part = part.strip()
                    if part:
                        suggestions.extend(_find_matching_assignees(db, org_id, part))

            resolved_email = suggestions[0]["email"] if len(suggestions) == 1 else ""

            preview_tasks.append({
                "title": td.get("title", "Untitled Task"),
                "description": td.get("description", ""),
                "priority": td.get("suggested_priority", "medium"),
                "due_date": td.get("suggested_deadline"),
                "suggested_assignee": suggested,
                "resolved_assignee_email": resolved_email,
                "assignee_suggestions": suggestions,
            })

    return {
        "meeting_title": meeting_title,
        "tasks": preview_tasks,
        "task_count": len(preview_tasks),
        "raw_text": raw_text[:2000],
    }


@router.get("/confirm")
async def confirm_route_check():
    logger.info("GET /confirm route check — route IS loaded")
    return {"status": "ok", "message": "confirm route loaded"}


@router.post("/confirm")
async def confirm_meeting_tasks(
    meeting_title: str = Form(...),
    participants: str | None = Form(None),
    zoho_event_id: str | None = Form(None),
    organization_id: str | None = Form(None),
    goal_id: str | None = Form(None),
    tasks: str = Form(...),
    current_user=Depends(get_current_user_optional),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = organization_id
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

    user_id = getattr(current_user, 'id', None) or str(current_user) if current_user else None
    participant_list = [p.strip() for p in (participants or "").split(",") if p.strip()] if participants else []

    try:
        tasks_data = json.loads(tasks)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid tasks JSON")

    if not isinstance(tasks_data, list) or not tasks_data:
        raise HTTPException(status_code=400, detail="tasks must be a non-empty array")

    from ..api.websocket import manager as ws_manager
    from ..core.notification_service import create_and_deliver

    created_tasks = []
    for td in tasks_data:
        assignee_email = (td.get("assignee_email") or "").strip()
        assignee_name = (td.get("assignee_name") or "").strip()

        assignee_emails = [assignee_email] if assignee_email else []

        task_doc = {
            "title": td.get("title", "Untitled Task"),
            "description": td.get("description", ""),
            "priority": td.get("priority", "medium"),
            "status": "pending",
            "assignee_id": assignee_emails,
            "assignee_email": assignee_email,
            "assignee_name": assignee_name,
            "department": None,
            "due_date": td.get("due_date"),
            "dependencies": [],
            "reviewers": [],
            "organization_id": org_id,
            "created_by": user_id,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "escalation_level": 0,
            "owner_escalated": False,
            "owner_escalated_at": None,
            "source": "meeting",
            "source_meeting_title": meeting_title,
            "zoho_task_ids": [],
            "goal_id": goal_id,
        }
        result = db.tasks.insert_one(task_doc)
        task_doc["_id"] = str(result.inserted_id)

        asyncio.create_task(ws_manager.broadcast_to_organization(
            {"type": "task_created", "data": task_doc}, org_id
        ))

        for email in assignee_emails:
            asyncio.create_task(create_and_deliver(
                user_id=email,
                org_id=org_id,
                type="task_assigned",
                title="New Task from Meeting",
                message=f"Task '{task_doc['title']}' created from meeting '{meeting_title}'",
                link=f"/tasks/{result.inserted_id}",
                actor_id=user_id,
            ))

        if not task_doc.get("due_date") and user_id:
            asyncio.create_task(create_and_deliver(
                user_id=user_id,
                org_id=org_id,
                type="deadline_needed",
                title="Task needs a deadline",
                message=f"Task '{task_doc['title']}' has no deadline — please set one",
                link=f"/tasks/{result.inserted_id}",
                actor_id=user_id,
            ))

        asyncio.create_task(_push_to_zoho_todo(db, org_id, task_doc, assignee_emails))
        created_tasks.append(task_doc)

    filename = ""
    from ..core.notification_service import create_and_deliver
    owner_id = None
    org = db.organizations.find_one({"_id": ObjectId(org_id)})
    if org:
        owner_id = org.get("owner_id")

    if owner_id:
        asyncio.create_task(create_and_deliver(
            user_id=owner_id,
            org_id=org_id,
            type="meeting_processed",
            title="Meeting Processed",
            message=f"{len(created_tasks)} tasks created from your meeting '{meeting_title}'",
            link="/dashboard",
            actor_id=user_id,
        ))

    meeting_record = {
        "organization_id": org_id,
        "title": meeting_title,
        "file_name": filename,
        "participants": participant_list,
        "tasks_created": [t["_id"] for t in created_tasks],
        "task_count": len(created_tasks),
        "raw_text": "",
        "created_by": user_id,
        "created_at": datetime.utcnow(),
    }
    meeting_result = db.meetings.insert_one(meeting_record)
    meeting_id = str(meeting_result.inserted_id)

    return {
        "meeting_id": meeting_id,
        "meeting_title": meeting_title,
        "tasks_created": [
            {
                "id": t["_id"],
                "title": t["title"],
                "priority": t["priority"],
                "assignee_id": t.get("assignee_id", []),
                "assignee_email": t.get("assignee_email", ""),
                "assignee_name": t.get("assignee_name", ""),
            }
            for t in created_tasks
        ],
        "task_count": len(created_tasks),
    }


@router.get("/titles")
async def list_meeting_titles(
    q: str | None = Query(""),
    organization_id: str | None = Query(None),
    limit: int = Query(10, ge=1, le=50),
    current_user=Depends(get_current_user_optional),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = organization_id or await get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

    user_id = getattr(current_user, 'id', None) or str(current_user) if current_user else None

    query_filter = {"organization_id": org_id, "created_by": user_id}
    if q:
        query_filter["title"] = {"$regex": re.escape(q), "$options": "i"}

    titles = list(
        db.meetings.find(query_filter, {"title": 1})
        .sort("created_at", -1)
        .limit(limit)
    )
    return {"titles": [t["title"] for t in titles if t.get("title")]}


@router.delete("/{meeting_id}")
async def delete_meeting(
    meeting_id: str,
    organization_id: str | None = Query(None),
    current_user=Depends(get_current_user_optional),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = organization_id or await get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

    logger.info(f"DELETE meeting: meeting_id={meeting_id}, org_id={org_id}")
    try:
        oid = ObjectId(meeting_id)
    except Exception as e:
        logger.error(f"Invalid meeting_id '{meeting_id}': {e}")
        raise HTTPException(status_code=400, detail=f"Invalid meeting ID: {e}")

    existing = db.meetings.find_one({"_id": oid, "organization_id": org_id})
    if not existing:
        logger.warning(f"Meeting not found with _id={meeting_id}, org_id={org_id}. Exists without org filter: {db.meetings.find_one({'_id': oid}) is not None}")
        raise HTTPException(status_code=404, detail="Meeting not found")

    result = db.meetings.delete_one({"_id": oid, "organization_id": org_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Meeting not found")

    return {"deleted": True}


@router.get("/history")
async def list_meetings(
    organization_id: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    email: str | None = Query(None),
    current_user=Depends(get_current_user_optional),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = organization_id or await get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

    query: dict = {"organization_id": org_id}
    if email:
        clean_email = email.lower().strip()
        query["$or"] = [
            {"participants": clean_email},
            {"attendees": clean_email},
            {"created_by": current_user.id if current_user else clean_email},
        ]

    meetings = list(
        db.meetings.find(query)
        .sort("created_at", -1)
        .limit(limit)
    )

    for m in meetings:
        m["id"] = str(m.pop("_id"))
        m.pop("raw_text", None)

    return {"meetings": meetings}
