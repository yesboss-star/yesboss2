"""Owner-facing AI Business Analytics assistant.

The assistant can:
- answer general ("chatgpt-style") questions directly,
- recognise action intent ("I want to start hiring") and ask engaging
  counter-questions one-at-a-time,
- recognise delegation intent ("do X and allocate to Sarah") and
  create a goal + a task for the named team member in one shot.
"""

import asyncio
import json
import logging
import re
import uuid
from datetime import datetime
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..core.ai_client import get_ai_response
from ..core.database import get_database
from ..dependencies.auth import get_current_user_optional
from .websocket import manager as ws_manager


async def create_notification(user_id: str, org_id: str, type: str, title: str, message: str, link: str = None, actor_id: str = None, actor_name: str = None, metadata: dict = None, email: str = None):
    from ..core.notification_service import create_and_deliver
    await create_and_deliver(user_id, org_id, type, title, message, link, actor_id, actor_name, metadata, email=email)

logger = logging.getLogger("yesboss.assistant")

router = APIRouter()

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class ChatContext(BaseModel):
    user_email: str | None = None
    organization_id: str | None = None
    organization_name: str | None = None
    document_summary: str | None = ""
    role: str | None = "owner"


class IntentRequest(BaseModel):
    message: str
    context: ChatContext | None = None
    conversation_history: list[dict[str, str]] | None = None


class CounterQuestionRequest(BaseModel):
    message: str
    intent: str  # "action" | "delegate" | "goal_creation" | "hiring" | "task_creation"
    gathered: dict[str, Any] = Field(default_factory=dict)
    missing: list[str] | None = None
    context: ChatContext | None = None


class CounterQuestionResponse(BaseModel):
    question: str
    field_id: str
    field_type: str = "text"  # text | select | person | number | date
    options: list[dict[str, str]] | None = None
    emoji: str | None = None
    progress: str | None = None  # e.g. "Step 1 of 3"


class ChatRequest(BaseModel):
    message: str
    context: ChatContext | None = None
    conversation_history: list[dict[str, str]] | None = None
    provider: str | None = None


class DelegateRequest(BaseModel):
    title: str
    description: str | None = None
    assignee_id: str | list[str] | None = None  # employee _id OR email
    assignee_name: str | list[str] | None = None
    assignees: list[dict[str, Any]] | None = None  # [{id, name, email}, ...] resolved by preview
    priority: str = "medium"
    timeline: str | None = None
    due_date: str | None = None
    department: str | None = None
    context: ChatContext | None = None
    item_type: str = "task"  # "task" | "goal" | "both" — what to actually create
    create_tasks: bool = True
    task_count: int = 3
    sub_tasks: list[dict[str, Any]] | None = None  # user-confirmed sub-tasks to create


class PersonSearchRequest(BaseModel):
    query: str
    organization_id: str | None = None


# ---------------------------------------------------------------------------
# Intent classification
# ---------------------------------------------------------------------------

INTENT_SYSTEM = """You are the intent classifier for YesBoss — an AI business analytics assistant for business owners.

Given the user's latest message (and optional short context), classify the intent into ONE of:

- "chat" — the user is asking a general question, looking for advice, explanation, ideas, brainstorming, or anything that should be answered directly without taking an action. Examples: "What is unit economics?", "How do I improve customer retention?", "What does CAC mean?", "Give me 3 marketing slogans".

- "action" — the user wants to *do* something inside YesBoss but hasn't told us everything we need yet. Examples: "I want to start hiring", "We need to launch a new product", "I want to set a goal for Q4", "Help me run a marketing campaign". We will need to ask follow-up questions (department, deadline, owner, scope, success criteria) before creating a goal.

- "delegate" — the user explicitly wants to *assign a task or goal to a specific team member right now*. Look for explicit "allocate to", "assign to", "give this to", "ask X to", "have X do this", "send to X". Examples: "Prepare the Q4 investor deck and allocate to Sarah", "Get the marketing report done by John", "I want Sarah to draft a new hiring policy".

Respond with ONLY a single valid JSON object:
{"intent": "chat|action|delegate", "confidence": 0.0-1.0, "topic": "2-4 word topic"}

No markdown, no commentary, no extra text."""


DELEGATION_KEYWORDS = re.compile(
    r"\b(allocate|assign|assigned|give (it|this) to|ask .* to|have .* do|"
    r"send (it|this) to|delegate|hand over|hand off|responsible for|"
    r"owner should be|on (his|her|their) plate|on .* plate)\b",
    re.IGNORECASE,
)

ACTION_KEYWORDS = re.compile(
    r"\b(start|launch|hire|hiring|set (a|up) goal|create (a )?goal|"
    r"need to|want to|let's|lets|we need|we should|planning to|"
    r"open a position|rollout|onboard(ing)?|kickoff|kick[- ]?off|"
    r"set up|setup|implement|run a campaign|build (a|an))\b",
    re.IGNORECASE,
)


def _heuristic_intent(text: str) -> dict[str, Any]:
    """Fast, rule-based intent hint used as a fallback when the LLM call fails."""
    has_delegate = bool(DELEGATION_KEYWORDS.search(text))
    has_action = bool(ACTION_KEYWORDS.search(text))
    if has_delegate and has_action:
        return {"intent": "delegate", "confidence": 0.6, "topic": "task assignment"}
    if has_delegate:
        return {"intent": "delegate", "confidence": 0.55, "topic": "task assignment"}
    if has_action:
        return {"intent": "action", "confidence": 0.55, "topic": "business action"}
    return {"intent": "chat", "confidence": 0.6, "topic": "general question"}


@router.post("/analyze-intent")
async def analyze_intent(request: IntentRequest):
    """Classify the user's message into chat / action / delegate."""
    text = (request.message or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message is required")

    try:
        prompt = (
            f"Latest user message:\n\"\"\"{text}\"\"\"\n\n"
            f"Recent history (most recent last):\n"
            f"{json.dumps((request.conversation_history or [])[-6:], ensure_ascii=False)}\n\n"
            "Classify the intent. Respond with ONLY the JSON object."
        )
        raw = await get_ai_response(
            prompt=prompt,
            system_prompt=INTENT_SYSTEM,
            temperature=0.2,
            max_tokens=800,
        )
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
            cleaned = re.sub(r"```$", "", cleaned).strip()
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if match:
            cleaned = match.group(0)
        parsed = json.loads(cleaned)
        if parsed.get("intent") not in ("chat", "action", "delegate"):
            parsed["intent"] = "chat"
        parsed.setdefault("confidence", 0.7)
        parsed.setdefault("topic", "general")
        return parsed
    except Exception as e:
        logger.warning("Intent classification fell back to heuristics: %s", e)
        return _heuristic_intent(text)


# ---------------------------------------------------------------------------
# Counter-questions
# ---------------------------------------------------------------------------

# Field IDs we collect for a generic "action" intent
ACTION_FIELDS = [
    ("title", "What should we call this initiative? Something short your team will recognise — e.g. *Q4 Hiring Push* or *Launch Mobile App v2*.", "text", "📝"),
    ("description", "In one sentence, what does success look like? *e.g. Hire 2 senior engineers by Dec 15.*", "text", "🎯"),
    ("department", "Which department owns this?", "select_dept", "🏢"),
    ("assignee_name", "Who do you want leading it? (Type their name or pick from your team.)", "person", "👤"),
    ("timeline", "When does this need to land? *e.g. by end of Q4, in 6 weeks, before the board meeting on Oct 30.*", "text", "📅"),
    ("priority", "How urgent is this?", "select_priority", "🔥"),
]

DELEGATE_FIELDS = [
    ("assignee_name", "Who should own this? (Type a name, or pick from your team.)", "person", "👤"),
    ("title", "What should the task be called?", "text", "📝"),
    ("description", "One line on what's expected? *e.g. \"Draft the Q4 investor deck — 12 slides max.\"*", "text", "📋"),
    ("due_date", "When's the deadline? *e.g. Friday, Oct 30, in 2 weeks.*", "text", "📅"),
    ("priority", "How urgent is it?", "select_priority", "🔥"),
]

PRIORITY_OPTIONS = [
    {"value": "low", "label": "🟢 Low — whenever they can"},
    {"value": "medium", "label": "🟡 Medium — within the week"},
    {"value": "high", "label": "🔴 High — drop everything"},
]


def _next_field(intent: str, gathered: dict[str, Any]):
    fields = DELEGATE_FIELDS if intent == "delegate" else ACTION_FIELDS
    for fid, q, ftype, emoji in fields:
        if not gathered.get(fid):
            return fid, q, ftype, emoji
    return None, None, None, None


def _detect_priority_from_text(text: str) -> str | None:
    t = text.lower()
    if any(w in t for w in ("urgent", "asap", "drop everything", "critical", "tomorrow", "today", "🔥", "right now")):
        return "high"
    if any(w in t for w in ("this week", "soon", "by friday", "next week", "by next", "🟡")):
        return "medium"
    if any(w in t for w in ("whenever", "no rush", "low priority", "low-priority", "🟢", "backlog")):
        return "low"
    return None


def _parse_smart_assignment(text: str) -> dict[str, Any]:
    """Extract structured fields from a free-form user reply.

    Examples:
      "high" / "🔴" → priority
      "Q4 hiring push" → title
      "Hire 2 senior engineers by Dec 15" → description
      "friday" / "in 2 weeks" → due_date / timeline
      "Sarah" / "sarah@company.com" → assignee_name
    """
    out: dict[str, Any] = {}
    t = text.strip()
    if not t:
        return out
    tl = t.lower()

    priority = _detect_priority_from_text(t)
    if priority:
        out["priority"] = priority

    # Date / deadline hints
    if re.search(r"\b(today|tomorrow|tonight|asap|eod|end of (the )?day|cob)\b", tl):
        out["due_date"] = "today"
    elif re.search(r"\bthis (week|friday|monday)\b", tl):
        out["due_date"] = "this week"
    elif re.search(r"\bnext (week|monday|month)\b", tl):
        out["due_date"] = "next week"
    elif re.search(r"\bin (\d+) (day|week|month)s?\b", tl):
        m = re.search(r"\bin (\d+) (day|week|month)s?\b", tl)
        out["due_date"] = f"in {m.group(1)} {m.group(2)}s"
    elif re.search(r"\bby (end of |next )?q[1-4]\b", tl):
        m = re.search(r"\bby (end of |next )?q[1-4]\b", tl)
        out["due_date"] = m.group(0)
    elif re.search(r"\bby (\w+ \d{1,2}(st|nd|rd|th)?)\b", tl):
        out["due_date"] = re.search(r"\bby (\w+ \d{1,2}(st|nd|rd|th)?)\b", tl).group(0)

    return out


@router.post("/counter-questions", response_model=CounterQuestionResponse)
async def next_counter_question(request: CounterQuestionRequest):
    """Return the next engaging counter-question for the user.

    The frontend keeps a `gathered` object across turns. This endpoint
    always returns ONE question (or signals done via `done: true`).
    """
    intent = request.intent or "action"
    gathered = dict(request.gathered or {})

    # If a free-form answer came in, try to extract structured fields from it
    if request.message and request.message.strip() and not gathered.get("_seeded"):
        extracted = _parse_smart_assignment(request.message)
        for k, v in extracted.items():
            gathered.setdefault(k, v)
        # Use the message itself as a title/description if it looks like one and
        # the user hasn't answered a title question yet
        if intent == "delegate" and not gathered.get("title"):
            m = re.search(r"(?:called|named|titled)\s+[\"']?(.+?)[\"']?$", request.message, re.IGNORECASE)
            if m:
                gathered["title"] = m.group(1).strip()
            else:
                gathered["title"] = request.message.strip()[:80]
        elif intent != "delegate" and not gathered.get("title") and len(request.message.strip()) < 80:
            gathered["title"] = request.message.strip()
        elif intent != "delegate" and not gathered.get("description"):
            gathered["description"] = request.message.strip()
        gathered["_seeded"] = True

    # Special-case: if a person's name was typed, validate it against employees
    if gathered.get("assignee_name") and not gathered.get("_assignee_validated"):
        db = get_database()
        org_id = (request.context or {}).organization_id if request.context else None
        if db is not None and org_id:
            emp = _find_employee(db, org_id, gathered["assignee_name"])
            if emp:
                gathered["assignee_id"] = str(emp["_id"])
                gathered["assignee_name"] = emp.get("full_name") or gathered["assignee_name"]
                gathered["_assignee_validated"] = True
            else:
                # Don't validate yet; ask for confirmation via a select
                return CounterQuestionResponse(
                    question=(
                        f"I couldn't find **{gathered['assignee_name']}** in your team. "
                        f"Could you double-check the spelling, or pick from the list below?"
                    ),
                    field_id="assignee_name",
                    field_type="person",
                    options=[],
                    emoji="🔍",
                )
        else:
            gathered["_assignee_validated"] = True

    # If priority is missing but the user message looks like a priority answer,
    # we may have already captured it. Otherwise ask.

    field_id, question, ftype, emoji = _next_field(intent, gathered)

    if field_id is None:
        return CounterQuestionResponse(
            question="",
            field_id="done",
            field_type="done",
            options=None,
            emoji="✅",
            progress="All set — ready to create",
        )

    options = None
    if ftype == "select_priority":
        options = PRIORITY_OPTIONS
    elif ftype == "select_dept":
        options = [
            {"value": "Engineering", "label": "🛠 Engineering"},
            {"value": "Product", "label": "🧩 Product"},
            {"value": "Marketing", "label": "📣 Marketing"},
            {"value": "Sales", "label": "💼 Sales"},
            {"value": "Operations", "label": "⚙️ Operations"},
            {"value": "Finance", "label": "💰 Finance"},
            {"value": "HR", "label": "🧑‍🤝‍🧑 People & HR"},
            {"value": "Customer Success", "label": "🤝 Customer Success"},
            {"value": "Design", "label": "🎨 Design"},
            {"value": "Other", "label": "Other — type below"},
        ]

    fields = DELEGATE_FIELDS if intent == "delegate" else ACTION_FIELDS
    total = len(fields)
    asked = sum(1 for fid, *_ in fields if gathered.get(fid)) + 1
    progress = f"Step {min(asked, total)} of {total}"

    # Lightly rewrite the question using the user's original phrasing when we
    # have it — makes it feel like the AI is paying attention.
    opener = ""
    if field_id == "title" and request.context and request.context.organization_name:
        opener = f"Got it — let's shape this for **{request.context.organization_name}**. "

    return CounterQuestionResponse(
        question=opener + question,
        field_id=field_id,
        field_type=ftype,
        options=options,
        emoji=emoji,
        progress=progress,
    )


# ---------------------------------------------------------------------------
# People search
# ---------------------------------------------------------------------------

def _find_employee(db, org_id: str, query: str):
    """Find a team member by free-form text: full_name OR email OR first name.
    Searches both `employees` and `org_chart_members` collections (they're separate)."""
    if not query:
        return None
    raw = query.strip()
    q = re.escape(raw)
    first_token = raw.split()[0] if raw.split() else raw
    filter = {
        "organization_id": org_id,
        "$or": [
            {"full_name": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}},
            {"full_name": {"$regex": r"\b" + q, "$options": "i"}},
            {"full_name": {"$regex": r"\b" + re.escape(first_token) + r"\b", "$options": "i"}},
        ],
    }
    emp = db.employees.find_one(filter)
    if emp:
        return emp
    member = db.org_chart_members.find_one(filter)
    if member:
        member["_id"] = str(member["_id"])
        return member
    return None


_ASSIGNEE_SEPARATORS = re.compile(r"\s*(?:,|;|&|\band\b|\bwith\b|\+)\s*", re.IGNORECASE)


def _parse_assignee_names(raw: str | list[str] | None) -> list[str]:
    """Split a possibly-multi-person assignee string into individual names.

    Handles the LLM emitting things like "Prince Pandey, Krisha Suchak",
    "Prince and Krisha", or an actual JSON list.
    """
    if not raw:
        return []
    if isinstance(raw, list):
        parts: list[str] = []
        for item in raw:
            parts.extend(_parse_assignee_names(item))
        return parts
    text = str(raw).strip()
    if not text:
        return []
    names = [p.strip() for p in _ASSIGNEE_SEPARATORS.split(text) if p.strip()]
    return names


@router.post("/people/search")
async def search_people(request: PersonSearchRequest):
    """Return up to 10 team members matching a free-form query."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = request.organization_id
    if not org_id:
        raise HTTPException(status_code=400, detail="organization_id is required")

    q = (request.query or "").strip()
    query: dict[str, Any] = {"organization_id": org_id}
    if q:
        ql = re.escape(q)
        query["$or"] = [
            {"full_name": {"$regex": ql, "$options": "i"}},
            {"email": {"$regex": ql, "$options": "i"}},
            {"role": {"$regex": ql, "$options": "i"}},
            {"department": {"$regex": ql, "$options": "i"}},
        ]
    people = list(db.employees.find(query).limit(10))
    for p in people:
        p["_id"] = str(p["_id"])
    return {
        "people": [
            {
                "id": p["_id"],
                "name": p.get("full_name") or p.get("email"),
                "email": p.get("email"),
                "role": p.get("role"),
                "department": p.get("department"),
            }
            for p in people
        ]
    }


# ---------------------------------------------------------------------------
# Delegate — create goal + task in one shot
# ---------------------------------------------------------------------------


def _resolve_assignee(db, org_id: str, assignee_id, assignee_name):
    """Resolve a single assignee (back-compat wrapper used by bulk-create)."""
    matched, _ = _resolve_assignees(db, org_id, assignee_id=assignee_id, assignee_name=assignee_name)
    return matched[0] if matched else None


def _resolve_assignees(db, org_id: str, assignee_id=None, assignee_name=None, assignee_email=None):
    """Resolve one or more assignees into matched employee records.

    Accepts a single value or a list for assignee_id / assignee_name /
    assignee_email (as produced by the LLM's delegate JSON). Returns
    (matched, unresolved) where matched is a list of employee dicts (each with
    a string `_id`) and unresolved is a list of the raw strings we couldn't match.
    """
    matched: list[dict[str, Any]] = []
    unresolved: list[str] = []

    ids = []
    if isinstance(assignee_id, list):
        ids.extend(assignee_id)
    elif assignee_id:
        ids.append(assignee_id)

    for aid in ids:
        emp = None
        try:
            emp = db.employees.find_one({"_id": ObjectId(aid), "organization_id": org_id})
        except Exception:
            emp = None
        if not emp:
            emp = _find_employee(db, org_id, aid)
        if emp:
            matched.append(emp)
        else:
            unresolved.append(str(aid))

    names = _parse_assignee_names(assignee_name)
    emails = _parse_assignee_names(assignee_email)

    for name in names:
        emp = _find_employee(db, org_id, name)
        if emp:
            matched.append(emp)
        else:
            unresolved.append(name)

    for email in emails:
        emp = _find_employee(db, org_id, email)
        if emp:
            matched.append(emp)
        else:
            unresolved.append(email)

    # De-duplicate by canonical id while preserving order
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for emp in matched:
        eid = str(emp["_id"])
        if eid in seen:
            continue
        seen.add(eid)
        emp["_id"] = eid
        unique.append(emp)
    return unique, unresolved


def _employee_assignee_spec(emp: dict[str, Any]) -> dict[str, Any]:
    """Canonical assignee payload for a resolved employee."""
    return {
        "id": str(emp["_id"]),
        "name": emp.get("full_name") or emp.get("name") or emp.get("email"),
        "email": emp.get("email"),
        "role": emp.get("role"),
        "department": emp.get("department"),
    }


def _list_team_members(db, org_id: str, limit: int = 30) -> list[dict[str, str]]:
    """Return up to `limit` team members (name + email) for LLM prompts.

    Searches both `employees` and `org_chart_members` collections and
    de-duplicates by email.
    """
    members: list[dict[str, str]] = []
    seen_emails: set[str] = set()
    try:
        for emp in db.employees.find({"organization_id": org_id}).limit(limit):
            email = (emp.get("email") or "").strip().lower()
            if email and email in seen_emails:
                continue
            if email:
                seen_emails.add(email)
            name = emp.get("full_name") or emp.get("name") or email or ""
            members.append({"name": name, "email": email})
    except Exception as e:
        logger.warning("_list_team_members (employees) failed: %s", e)
    try:
        for m in db.org_chart_members.find({"organization_id": org_id}).limit(limit):
            email = (m.get("email") or "").strip().lower()
            if email and email in seen_emails:
                continue
            if email:
                seen_emails.add(email)
            name = m.get("full_name") or m.get("name") or email or ""
            members.append({"name": name, "email": email})
    except Exception as e:
        logger.warning("_list_team_members (org_chart_members) failed: %s", e)
    return members[:limit]


@router.post("/delegate")
async def delegate_task(request: DelegateRequest):
    """Create a task and/or goal assigned to the named team member.

    item_type controls what is created: "task" creates only a task,
    "goal" creates only a goal, "both" creates a goal AND a task.

    Used when the owner says something like:
      "Prepare the Q4 investor deck and allocate to Sarah"
    """
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = (request.context or {}).organization_id if request.context else None
    if not org_id:
        raise HTTPException(status_code=400, detail="organization_id is required in context")

    title = (request.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")

    # Resolve assignees. Prefer the pre-resolved list from the preview; fall
    # back to resolving the raw id/name/email fields (which may each hold a
    # single value or a comma-separated list of names).
    assignees: list[dict[str, Any]] = []
    unresolved: list[str] = []
    if request.assignees:
        for a in request.assignees:
            a = dict(a)
            a["_id"] = a.get("id") or a.get("_id")
            assignees.append(a)
    else:
        assignees, unresolved = _resolve_assignees(
            db, org_id,
            assignee_id=request.assignee_id,
            assignee_name=request.assignee_name,
        )
    if unresolved:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Couldn't find **{', '.join(unresolved)}** in your team. "
                f"Add them to the org first, then try again."
            ),
        )
    if not assignees:
        shown = str(request.assignee_name or request.assignee_id or "")
        raise HTTPException(
            status_code=404,
            detail=(
                f"Couldn't find '{shown}' in your team. "
                f"Add them to the org first, then try again."
            ),
        )

    # Department analysis (reuse the existing helper, fall back silently)
    department = request.department
    if not department:
        try:
            from ..core.intelligence import analyze_goal_department
            department = await analyze_goal_department(
                title=title, description=request.description or "", industry=""
            )
        except Exception as e:
            logger.warning("Department analysis failed in delegate: %s", e)
            department = assignees[0].get("department") or "General"

    now = datetime.utcnow()
    item_type = (request.item_type or "task").strip().lower()
    if item_type not in ("task", "goal", "both"):
        item_type = "task"
    create_goal = item_type in ("goal", "both")
    create_task = item_type in ("task", "both")

    # Canonical identity = EMAILS (so AI analytics / filters / notifications all
    # resolve "who owns this work" by the same key). ObjectIds from the old
    # delegate path are the root cause of tasks vanishing for a person's view.
    from ..core.identity import email_list

    assignee_emails = email_list([a.get("email") for a in assignees])
    assignee_ids = (
        list(assignee_emails)
        if assignee_emails
        else [str(a["_id"]) for a in assignees if a.get("_id")]
    )
    assignee_names = [
        (a.get("full_name") or a.get("name") or a.get("email")) for a in assignees
    ]
    assignee_email_primary = assignee_emails[0] if assignee_emails else None

    goal_doc: dict[str, Any] | None = None
    goal_id: str | None = None

    # 1) Goal (only when the user asked for a goal)
    if create_goal:
        goal_doc = {
            "title": title,
            "description": request.description,
            "priority": request.priority or "medium",
            "timeline": request.timeline,
            "department": department,
            "assignee_id": assignee_ids,
            "assignee_name": assignee_names,
            "assignee_email": assignee_email_primary,
            "organization_id": org_id,
            "created_by": (request.context.user_email if request.context else None),
            "status": "active",
            "source": "assistant_delegation",
            "created_at": now,
            "updated_at": now,
        }
        goal_result = db.goals.insert_one(goal_doc)
        goal_id = str(goal_result.inserted_id)
        goal_doc["_id"] = goal_id

    task_doc: dict[str, Any] | None = None
    task_id: str | None = None
    confirmed = request.sub_tasks or []

    def _task_doc() -> dict[str, Any]:
        return {
            "title": title,
            "description": request.description,
            "priority": request.priority or "medium",
            "status": "pending",
            "goal_id": goal_id,
            "assignee_id": assignee_ids,
            "assignee_email": assignee_email_primary,
            "assignee_name": assignee_names,
            "department": department,
            "due_date": request.due_date,
            "organization_id": org_id,
            "created_by": (request.context.user_email if request.context else None),
            "source": "assistant_delegation",
            "created_at": now,
            "updated_at": now,
        }

    # 2) Task (only when the user asked for a task)
    if create_task:
        task_doc = _task_doc()
        task_result = db.tasks.insert_one(task_doc)
        task_id = str(task_result.inserted_id)
        task_doc["_id"] = task_id

    # 2b) Goal-only delegation with sub-tasks: also create the main task so the
    #     sub-tasks can be linked to it (parent_task_id) and the goal renders as
    #     a proper goal -> task -> sub-task chain in the drill-down flow.
    elif create_goal and (confirmed or request.create_tasks):
        task_doc = _task_doc()
        task_result = db.tasks.insert_one(task_doc)
        task_id = str(task_result.inserted_id)
        task_doc["_id"] = task_id

    def _sub_doc(st: dict[str, Any]) -> dict[str, Any]:
        return {
            "title": (st.get("title") or "").strip() or "Sub-task",
            "description": st.get("description", ""),
            "priority": st.get("priority", "medium"),
            "status": "pending",
            "goal_id": goal_id,
            "parent_task_id": task_id,
            "assignee_id": assignee_ids,
            "assignee_email": assignee_email_primary,
            "assignee_name": assignee_names,
            "department": department,
            "due_date": request.due_date,
            "organization_id": org_id,
            "source": "assistant_delegation_subtask",
            "created_at": now,
            "updated_at": now,
        }

    # 3) Sub-tasks: insert the user-confirmed selection; otherwise keep the
    #    legacy auto-generate path (used by the guided delegate flow).
    sub_tasks: list[dict[str, Any]] = []
    if confirmed:
        for st in confirmed[:8]:
            sub_doc = _sub_doc(st)
            sr = db.tasks.insert_one(sub_doc)
            sub_doc["_id"] = str(sr.inserted_id)
            sub_tasks.append(sub_doc)
    elif request.create_tasks:
        try:
            from ..core.intelligence import generate_tasks_from_goal
            generated = await generate_tasks_from_goal(
                goal_title=title,
                goal_description=request.description or "",
                count=max(1, min(request.task_count, 8)),
            )
            for st in (generated or [])[: request.task_count]:
                sub_doc = _sub_doc(st)
                sr = db.tasks.insert_one(sub_doc)
                sub_doc["_id"] = str(sr.inserted_id)
                sub_tasks.append(sub_doc)
        except Exception as e:
            logger.warning("Sub-task generation failed in delegate: %s", e)

    # 4) Provider ToDo sync (sync per assignee email)
    try:
        from .tasks import sync_task_to_provider
        if task_doc:
            for a in assignees:
                zoho_task = {**task_doc, "assignee_id": a.get("email")}
                asyncio.create_task(sync_task_to_provider(db, zoho_task, org_id))
        for st in sub_tasks:
            for a in assignees:
                st_zoho = {**st, "assignee_id": a.get("email")}
                asyncio.create_task(sync_task_to_provider(db, st_zoho, org_id))
    except Exception as e:
        logger.warning("Provider sync failed in delegate: %s", e)

    # 5) Real-time push + notifications
    user_id = (request.context.user_email if request.context else None)
    try:
        if goal_doc:
            asyncio.create_task(ws_manager.broadcast_to_organization(
                {"type": "goal_created", "data": goal_doc}, org_id
            ))
        if task_doc:
            asyncio.create_task(ws_manager.broadcast_to_organization(
                {"type": "task_created", "data": task_doc}, org_id
            ))
            for a in assignees:
                if a.get("email"):
                    asyncio.create_task(ws_manager.send_personal_message(
                        {"type": "task_assigned", "data": task_doc}, a["email"]
                    ))
    except Exception as e:
        logger.warning("WebSocket broadcast failed in delegate: %s", e)

    try:
        # In-app + email notification for each assignee (keyed by email, which
        # resolve_uid can turn back into the Firebase uid).
        def _notify_target(a: dict[str, Any]) -> str:
            return a.get("email") or str(a.get("_id") or "")

        for a in assignees:
            assignee_id = _notify_target(a)
            if goal_doc:
                asyncio.create_task(create_notification(
                    user_id=assignee_id, org_id=org_id, type="goal_assigned",
                    title="New Goal Assigned", message=f"Goal assigned: {title}",
                    link=f"/goals/{goal_id}",
                    actor_id=user_id, email=a.get("email"),
                ))
            if task_doc:
                asyncio.create_task(create_notification(
                    user_id=assignee_id, org_id=org_id, type="task_assigned",
                    title="New Task Assigned", message=f"You have been assigned: {title}",
                    link=f"/tasks/{task_id}",
                    actor_id=user_id, email=a.get("email"),
                ))
        for st in sub_tasks:
            for a in assignees:
                asyncio.create_task(create_notification(
                    user_id=_notify_target(a), org_id=org_id, type="task_assigned",
                    title="New Sub-Task Assigned", message=f"You have been assigned: {st.get('title', 'Sub-task')}",
                    link=f"/tasks/{st.get('_id', task_id)}",
                    actor_id=user_id, email=a.get("email"),
                ))
    except Exception as e:
        logger.warning("Notification delivery failed in delegate: %s", e)

    return {
        "success": True,
        "item_type": item_type,
        "goal": goal_doc,
        "task": task_doc,
        "sub_tasks": sub_tasks,
        "assignees": [_employee_assignee_spec(a) for a in assignees],
        "assignee": _employee_assignee_spec(assignees[0]),
    }


async def _build_delegate_preview(parsed: dict, db, org_id: str | None):
    """Build a delegate confirmation payload WITHOUT creating anything.

    Returns (delegate_params, generated_sub_tasks, error) where error is a
    user-facing message string when we can't proceed, else None.
    """
    raw_names = parsed.get("assignee_name") or ""
    title = (parsed.get("title") or "").strip()
    if not title or not raw_names:
        return None, [], "I need a bit more detail — who should I assign this to, and what's the task?"

    item_type = (parsed.get("item_type") or "task").strip().lower()
    if item_type not in ("task", "goal", "both"):
        item_type = "task"

    assignees: list[dict[str, Any]] = []
    unresolved: list[str] = []
    if org_id:
        assignees, unresolved = _resolve_assignees(
            db, org_id,
            assignee_id=parsed.get("assignee_id"),
            assignee_name=raw_names,
            assignee_email=parsed.get("assignee_email"),
        )
    if unresolved:
        return None, [], (
            f"Couldn't find **{', '.join(unresolved)}** in your team. "
            "Add them to the org first, then try again."
        )
    if not assignees:
        shown = str(raw_names if isinstance(raw_names, str) else ", ".join(raw_names))
        return None, [], (
            f"Couldn't find '{shown}' in your team. "
            "Add them to the org first, then try again."
        )

    generated_sub_tasks: list[dict[str, Any]] = []
    try:
        from ..core.intelligence import generate_tasks_from_goal
        generated = await generate_tasks_from_goal(
            goal_title=title,
            goal_description=parsed.get("description") or "",
            count=4,
        )
        for st in (generated or [])[:4]:
            generated_sub_tasks.append({
                "title": st.get("title", "Sub-task"),
                "description": st.get("description", ""),
                "priority": st.get("priority", "medium"),
            })
    except Exception as e:
        logger.warning("Delegate preview sub-task generation failed: %s", e)

    delegate_params = {
        "title": title,
        "description": parsed.get("description"),
        "assignee_id": [str(a["_id"]) for a in assignees],
        "assignee_name": ", ".join(
            (a.get("full_name") or a.get("name") or a.get("email") or "") for a in assignees
        ),
        "assignee_email": [a.get("email") for a in assignees if a.get("email")],
        "assignees": [_employee_assignee_spec(a) for a in assignees],
        "priority": parsed.get("priority", "medium"),
        "item_type": item_type,
        "department": assignees[0].get("department"),
    }
    return delegate_params, generated_sub_tasks, None


# ---------------------------------------------------------------------------
# Chat (owner-friendly, in-character responses for "chat" intent)
# ---------------------------------------------------------------------------

CHAT_SYSTEM = """You are YesBoss's AI Business Analyst — a sharp, encouraging, owner-friendly copilot.

Tone:
- Confident but not cocky. Speak like a great COO who's been in the trenches.
- Short sentences. No corporate-speak. No "Certainly!" or "I'd be happy to help".
- Use 1-2 relevant emojis max per message.
- When the user asks a strategic question, lead with a one-line answer, then 2-4 bullets of substance.
- If the question is too vague, push back with one clarifying question rather than a wall of text.
- Never invent numbers. If you don't know, say so and suggest where to look.

The user is a business owner. They have access to documents they've uploaded (use the document_summary if provided).
Their organization is mentioned in context. Use it.
"""


# ---------------------------------------------------------------------------
# Data diagnostic — figures out what data we have vs need before answering
# ---------------------------------------------------------------------------

DATA_DIAGNOSE_SYSTEM = """You are the data-sufficiency assessor for YesBoss's AI Business Analyst.

STEP 1 — classify the question type. This is the most important step.

The question is "general" (the user wants general knowledge, advice, explanation, ideas, brainstorming — they do NOT need the company's specific data) when it matches ANY of these patterns:
- Starts with "What is", "What are", "What's", "Define", "Explain", "How does X work", "Why does X happen"
- Asks for general advice, frameworks, or templates: "How do I write a great pitch deck", "Give me 3 ways to reduce churn", "What should a QBR include", "Best practices for hiring engineers", "What is unit economics"
- Asks about a generic scenario, NOT the user's own company: "What's a good OKR framework for a 10-person startup", "How do SaaS companies price their products", "What's normal churn for B2B"
- Asks for ideas, brainstorming, or "give me options": "Give me 5 tagline ideas", "Suggest 3 marketing channels for a B2B SaaS"

The question is "company" (the user wants something specific to THEIR business) when it matches ANY of:
- References the user's own business with pronouns: "we", "our", "us", "my company", "I", "should I"
- Asks about a specific recent event/number from the business: "What was our Q3 revenue?", "How is the engineering team doing?", "What's our biggest risk right now?"
- Asks for an action in the user's business: "Should I hire more engineers?", "What's blocking our growth?", "How do I cut our burn rate?"

If you're unsure, prefer "general" — the assistant can fall back to general knowledge gracefully. Only mark "company" when it's clearly about the user's specific business.

For "general" questions: set data_sufficiency to "complete" and upload_requests to []. The assistant will answer from general knowledge.

For "company" questions, set data_sufficiency to one of:
   - "complete"   — we have everything needed to give a specific, evidence-backed answer
   - "partial"    — we have some data, but a key piece is missing; we can give a partial answer AND ask for the missing piece
   - "missing"    — we don't have the primary data source needed; we MUST ask the user to upload a specific document before we can answer properly

For "company" answers also include:

2. available_sources: short list of the data sources we have that ARE relevant to this question. Each item: {"type": "documents|goals|tasks|employees|kpis|team_updates|org_profile", "summary": "one short sentence of what's there"}.

3. missing_sources: short list of what we'd need. Same shape.

4. upload_requests: ONLY when data_sufficiency != "complete". Array of up to 3 specific documents the user should upload. Each: {"document_type": "short label like 'Q3 P&L report' or 'Team org chart'", "why": "1 sentence — what we'll learn from it", "example": "1 example of the kind of file (e.g. 'PDF or spreadsheet, anything with the numbers')"}.

5. reasoning: 1-2 sentences the assistant will say out loud to the owner explaining what we know and what's missing — human, empathetic, not corporate. (Skip this for "general" questions.)

Respond with ONLY valid JSON. No markdown, no commentary."""


def resolve_mentions(text: str, db, org_id: str) -> list[str]:
    if not text:
        return []
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


def _member_calendar_settings(db, org_id: str, email: str) -> tuple[str, str, str]:
    """Return (timezone, working_hours_start, working_hours_end) for a member."""
    m = db.org_chart_members.find_one({
        "organization_id": org_id,
        "email": {"$regex": f"^{re.escape(email)}$", "$options": "i"},
    })
    tz_name = (m or {}).get("timezone") or "Asia/Kolkata"
    wh_start = (m or {}).get("working_hours_start") or "09:00"
    wh_end = (m or {}).get("working_hours_end") or "18:00"
    return tz_name, wh_start, wh_end


def _slot_iso(day_str: str, hhmm: str, tz_name: str) -> str:
    from zoneinfo import ZoneInfo

    h, m = hhmm.split(":")
    aware = datetime(int(day_str[:4]), int(day_str[5:7]), int(day_str[8:10]), int(h), int(m), tzinfo=ZoneInfo(tz_name))
    return aware.strftime("%Y%m%dT%H%M00%z")


async def _collect_busy_blocks(db, org_id, ref_tz, day, attendee_emails, att_tokens) -> list:
    """Busy intervals (aware datetimes in ref_tz) across all attendees on their own provider."""
    from datetime import UTC, timedelta
    from zoneinfo import ZoneInfo

    from ..core.google import GoogleCalendar
    from ..core.zoho import ZohoCalendar

    busy: list = []
    for email in attendee_emails:
        tok = att_tokens.get(email)
        if not tok:
            continue
        provider, token = tok
        att_tz_name = _member_calendar_settings(db, org_id, email)[0]
        att_tz = ZoneInfo(att_tz_name)
        day_start_local = datetime(day.year, day.month, day.day, 0, 0, tzinfo=att_tz)
        day_end_local = day_start_local + timedelta(days=1)
        try:
            if provider == "google":
                blocks = await GoogleCalendar.get_freebusy(
                    token,
                    [email],
                    day_start_local.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    day_end_local.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
                )
                for b in blocks:
                    s, e = b.get("start", ""), b.get("end", "")
                    if not s or not e:
                        continue
                    try:
                        s_dt = datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(ref_tz)
                        e_dt = datetime.fromisoformat(e.replace("Z", "+00:00")).astimezone(ref_tz)
                        busy.append((s_dt, e_dt))
                    except Exception:
                        pass
            else:
                blocks = await ZohoCalendar.check_freebusy(
                    token,
                    email,
                    day_start_local.strftime("%Y%m%dT%H%M%S"),
                    day_end_local.strftime("%Y%m%dT%H%M%S"),
                )
                for b in blocks:
                    fb_s, fb_e = b.get("startTime", ""), b.get("endTime", "")
                    if not fb_s or not fb_e:
                        continue
                    try:
                        s_dt = datetime.strptime(fb_s.replace("T", ""), "%Y%m%d%H%M%S").replace(tzinfo=att_tz).astimezone(ref_tz)
                        e_dt = datetime.strptime(fb_e.replace("T", ""), "%Y%m%d%H%M%S").replace(tzinfo=att_tz).astimezone(ref_tz)
                        busy.append((s_dt, e_dt))
                    except Exception:
                        pass
        except Exception:
            pass
    return busy


def _free_slots(window, duration: int, busy: list) -> list:
    from datetime import timedelta

    slots = []
    cur, end = window
    while cur + timedelta(minutes=duration) <= end:
        slot_end = cur + timedelta(minutes=duration)
        conflict = False
        for bs, be in busy:
            if bs < slot_end and be > cur:
                conflict = True
                break
        if not conflict:
            slots.append({
                "date": cur.strftime("%Y-%m-%d"),
                "start": cur.strftime("%H:%M"),
                "end": slot_end.strftime("%H:%M"),
            })
        cur += timedelta(minutes=30)
    return slots


async def _book_provider_event(
    db, org_id, organizer_email, organizer_token, is_google, ref_tz_name,
    slot, title, description, attendee_emails, att_tokens,
) -> dict:
    """Create the organizer's event (with invites) + mirror events on each attendee's own calendar."""
    from ..core.google import GoogleCalendar
    from ..core.zoho import ZohoCalendar

    day_str = slot["date"]
    g_start = f"{day_str}T{slot['start']}:00"
    g_end = f"{day_str}T{slot['end']}:00"
    iso_start = _slot_iso(day_str, slot["start"], ref_tz_name)
    iso_end = _slot_iso(day_str, slot["end"], ref_tz_name)
    attendees = [{"email": e} for e in attendee_emails]
    event_ids: dict = {}

    if is_google:
        cal = await GoogleCalendar.get_primary_calendar_id(organizer_token)
        if cal:
            eid = await GoogleCalendar.create_event(
                user_token=organizer_token, calendar_id=cal, title=title,
                description=description, start_dt=g_start, end_dt=g_end,
                timezone=ref_tz_name, attendees=attendees,
            )
            if eid:
                event_ids["google"] = eid
    else:
        cal = await ZohoCalendar.get_default_calendar_uid(organizer_token)
        if cal:
            eid = await ZohoCalendar.create_event(
                user_token=organizer_token, calendar_uid=cal, title=title,
                description=description, start_dt=iso_start, end_dt=iso_end,
                timezone=ref_tz_name, attendees=attendees,
            )
            if eid:
                event_ids["zoho"] = eid

    for email in attendee_emails:
        if email == organizer_email:
            continue
        tok = att_tokens.get(email)
        if not tok:
            continue
        prov, token = tok
        try:
            if prov == "google":
                cal = await GoogleCalendar.get_primary_calendar_id(token)
                if cal:
                    eid = await GoogleCalendar.create_event(
                        user_token=token, calendar_id=cal, title=title,
                        description=description, start_dt=g_start, end_dt=g_end,
                        timezone=ref_tz_name, attendees=[],
                    )
                    if eid:
                        event_ids[email] = eid
            else:
                cal = await ZohoCalendar.get_default_calendar_uid(token)
                if cal:
                    eid = await ZohoCalendar.create_event(
                        user_token=token, calendar_uid=cal, title=title,
                        description=description, start_dt=iso_start, end_dt=iso_end,
                        timezone=ref_tz_name, attendees=[],
                    )
                    if eid:
                        event_ids[email] = eid
        except Exception:
            pass

    return event_ids


async def handle_meeting_booking(booking_params: dict, db, org_id: str, user_id: str) -> dict[str, Any]:
    """Handle meeting booking: resolve attendees, check freebusy (per-attendee provider), book."""
    import re as _re
    from datetime import timedelta
    from zoneinfo import ZoneInfo

    attendee_names = booking_params.get("attendee_names", [])
    date_str = booking_params.get("date", "") or ""
    date_start = booking_params.get("date_start", "") or ""
    date_end = booking_params.get("date_end", "") or ""
    duration = int(booking_params.get("duration_minutes", 60))
    title = booking_params.get("title", "Meeting")
    description = booking_params.get("description", "")
    preferred_time = booking_params.get("preferred_time", "")
    auto = bool(booking_params.get("auto", False))
    recurrence = booking_params.get("recurrence") or {}
    remind_minutes = int(booking_params.get("remind_before_minutes", 30))
    series_id = booking_params.get("series_id") or str(uuid.uuid4())

    # Resolve names to emails
    attendee_emails = []
    for name in attendee_names:
        member = db.org_chart_members.find_one({
            "organization_id": org_id,
            "$or": [
                {"email": {"$regex": f"^{_re.escape(name)}$", "$options": "i"}},
                {"full_name": {"$regex": f"^{_re.escape(name)}$", "$options": "i"}},
            ]
        })
        if member:
            attendee_emails.append(member.get("email", "").lower())
        elif "@" in name:
            attendee_emails.append(name.lower())

    if not attendee_emails:
        return {"error": "Could not find any attendees in your team. Make sure they are added to the org chart."}

    from ..core.providers import get_provider_token, resolve_token_for_email
    from ..core.zoho import ZohoOAuth

    organizer_email = (user_id or "").lower()
    provider_token = await get_provider_token(db, user_id)
    if not provider_token and organizer_email:
        provider_token = await resolve_token_for_email(db, organizer_email, org_id)
    if not provider_token:
        if org_id:
            gdoc = db.google_tokens.find_one({"org_id": str(org_id)}) if db is not None else None
            if gdoc and gdoc.get("user_id"):
                from ..core.google import GoogleOAuth
                gtoken = await GoogleOAuth(db).get_valid_token(gdoc["user_id"])
                if gtoken:
                    provider_token = ("google", gtoken)
            if not provider_token:
                zdoc = db.zoho_tokens.find_one({"org_id": str(org_id)}) if db is not None else None
                if zdoc and zdoc.get("user_id"):
                    ztoken = await ZohoOAuth(db).get_valid_token(zdoc["user_id"])
                    if ztoken:
                        provider_token = ("zoho", ztoken)
        if not provider_token:
            zdoc = db.zoho_tokens.find_one({}, sort=[("connected_at", -1)]) if db is not None else None
            if zdoc and zdoc.get("user_id"):
                ztoken = await ZohoOAuth(db).get_valid_token(zdoc["user_id"])
                if ztoken:
                    provider_token = ("zoho", ztoken)

    if not provider_token:
        return {"error": "No calendar account connected. Please connect Zoho or Google in Settings first."}


    provider, organizer_token = provider_token
    is_google = provider == "google"
    ref_tz_name = _member_calendar_settings(db, org_id, organizer_email)[0]
    ref_tz = ZoneInfo(ref_tz_name)

    # Resolve each attendee's own provider token
    att_tokens: dict = {}
    for email in attendee_emails:
        tok = await resolve_token_for_email(db, email, org_id)
        if tok:
            att_tokens[email] = tok

    # Determine the days to search
    def _iter_days():
        if date_start and date_end:
            try:
                d = datetime.strptime(date_start, "%Y-%m-%d").date()
                end = datetime.strptime(date_end, "%Y-%m-%d").date()
            except ValueError:
                d = end = datetime.now().date()
            while d <= end:
                yield d
                d += timedelta(days=1)
            return
        d = None
        if date_str:
            try:
                d = datetime.strptime(date_str, "%Y-%m-%d").date()
            except ValueError:
                try:
                    d = datetime.strptime(date_str, "%d/%m/%Y").date()
                except ValueError:
                    d = None
        yield d or datetime.now().date()

    all_slots: list = []
    for day in _iter_days():
        # Intersection of working windows across organizer + attendees
        window_start = None
        window_end = None
        for email in [organizer_email] + attendee_emails:
            if not email:
                continue
            tz_name, ws, we = _member_calendar_settings(db, org_id, email)
            att_tz = ZoneInfo(tz_name)
            try:
                wh, wm = (int(x) for x in ws.split(":"))
                eh, em = (int(x) for x in we.split(":"))
            except Exception:
                wh, wm, eh, em = 9, 0, 18, 0
            s_local = datetime(day.year, day.month, day.day, wh, wm, tzinfo=att_tz).astimezone(ref_tz)
            e_local = datetime(day.year, day.month, day.day, eh, em, tzinfo=att_tz).astimezone(ref_tz)
            if e_local <= s_local:
                e_local += timedelta(days=1)
            window_start = s_local if window_start is None else max(window_start, s_local)
            window_end = e_local if window_end is None else min(window_end, e_local)

        if window_start is None or window_end is None or window_start >= window_end:
            continue

        busy = await _collect_busy_blocks(db, org_id, ref_tz, day, attendee_emails, att_tokens)
        all_slots.extend(_free_slots((window_start, window_end), duration, busy))

    if not all_slots:
        scope = f"{date_start} to {date_end}" if (date_start and date_end) else (date_str or "that date")
        return {
            "booked": False,
            "message": f"No available slots {('between ' + scope) if (date_start and date_end) else ('on ' + (date_str or 'that date'))} for a {duration}-minute meeting. Try another date.",
            "available_slots": [],
        }

    # Decide which slot to book
    chosen = None
    if preferred_time:
        match = _re.match(r"(\d{1,2})(?::(\d{2}))?", preferred_time.strip())
        if match:
            pref = f"{int(match.group(1)):02d}:{int(match.group(2) or 0):02d}"
            for slot in all_slots:
                if slot["start"] == pref:
                    chosen = slot
                    break
        if not chosen:
            return {
                "booked": False,
                "message": f"The time {preferred_time} is busy. Here are available slots:",
                "available_slots": all_slots[:8],
            }
    elif auto or len(all_slots) == 1:
        chosen = all_slots[0]

    if not chosen:
        return {
            "booked": False,
            "message": f"Found {len(all_slots)} available slot(s):",
            "available_slots": all_slots[:8],
        }

    # Build instances (recurring expands a bounded series)
    instances = [chosen]
    if recurrence and recurrence.get("frequency") and recurrence.get("count"):
        freq = recurrence["frequency"]
        count = max(1, int(recurrence.get("count", 8)))
        freq_days = 7 if freq == "weekly" else 1 if freq == "daily" else 7
        for i in range(1, count):
            from datetime import date as _date
            d = chosen["date"]
            nd = _date(int(d[:4]), int(d[5:7]), int(d[8:10])) + timedelta(days=i * freq_days)
            instances.append({
                "date": nd.strftime("%Y-%m-%d"),
                "start": chosen["start"],
                "end": chosen["end"],
            })

    booked_records = []
    for inst in instances:
        event_ids = await _book_provider_event(
            db, org_id, organizer_email, organizer_token, is_google, ref_tz_name,
            inst, title, description, attendee_emails, att_tokens,
        )
        iso_start = _slot_iso(inst["date"], inst["start"], ref_tz_name)
        iso_end = _slot_iso(inst["date"], inst["end"], ref_tz_name)
        booked_records.append({
            "start": iso_start,
            "end": iso_end,
            "slot": inst,
            "event_ids": event_ids,
        })
        try:
            meeting_doc = {
                "organization_id": org_id,
                "title": title,
                "description": description,
                "attendees": attendee_emails,
                "created_by": organizer_email or None,
                "status": "booked",
                "mom_uploaded": False,
                "reminder_sent": False,
                "remind_before_minutes": remind_minutes,
                "start_dt": iso_start,
                "end_dt": iso_end,
                "series_id": series_id,
                "recurring": recurrence or None,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            }
            if "google" in event_ids:
                meeting_doc["google_event_id"] = event_ids["google"]
            if "zoho" in event_ids:
                meeting_doc["zoho_event_id"] = event_ids["zoho"]
            db.meetings.insert_one(meeting_doc)
        except Exception as e:
            logger.warning(f"Failed to persist meeting record: {e}")

    try:
        from ..core.notification_service import create_and_deliver
        for email in attendee_emails:
            asyncio.create_task(create_and_deliver(
                user_id=email, org_id=org_id,
                type="meeting_booked",
                title=f"Meeting: {title}",
                message=f"Booked {instances[0]['date']} at {instances[0]['start']}",
            ))
    except Exception:
        pass

    first = booked_records[0]
    return {
        "booked": True,
        "title": title,
        "start": first["start"],
        "end": first["end"],
        "attendees": attendee_emails,
        "slot": first["slot"],
        "count": len(instances),
        "series_id": series_id,
        "message": f"Booked {len(instances)} occurrence(s)." if len(instances) > 1 else "Booked.",
    }


async def _find_meeting_by_title(db, org_id: str, title: str):
    if not title:
        return None
    return db.meetings.find_one(
        {
            "organization_id": org_id,
            "status": {"$ne": "cancelled"},
            "title": {"$regex": re.escape(title), "$options": "i"},
        },
        sort=[("created_at", -1)],
    )


async def _cancel_meeting(db, org_id: str, meeting_meta: dict) -> dict[str, Any]:
    """Cancel a booked meeting: best-effort delete external events, mark record cancelled."""
    title = (meeting_meta.get("title") or "").strip()
    meeting_id = meeting_meta.get("meeting_id")
    meeting = None
    if meeting_id and ObjectId.is_valid(str(meeting_id)):
        meeting = db.meetings.find_one({"_id": ObjectId(str(meeting_id)), "organization_id": org_id})
    if not meeting and title:
        meeting = await _find_meeting_by_title(db, org_id, title)
    if not meeting:
        return {"error": "I couldn't find that meeting to cancel. Tell me the meeting title."}

    title = meeting.get("title", "Meeting")
    from ..core.google import GoogleCalendar
    from ..core.providers import get_provider_token
    from ..core.zoho import ZohoCalendar, ZohoOAuth

    provider_token = await get_provider_token(db, meeting.get("created_by") or "")
    if not provider_token and org_id:
        gdoc = db.google_tokens.find_one({"org_id": str(org_id)}) if db is not None else None
        if gdoc and gdoc.get("user_id"):
            from ..core.google import GoogleOAuth
            gtoken = await GoogleOAuth(db).get_valid_token(gdoc["user_id"])
            if gtoken:
                provider_token = ("google", gtoken)
        if not provider_token:
            zdoc = db.zoho_tokens.find_one({"org_id": str(org_id)}) if db is not None else None
            if zdoc and zdoc.get("user_id"):
                ztoken = await ZohoOAuth(db).get_valid_token(zdoc["user_id"])
                if ztoken:
                    provider_token = ("zoho", ztoken)

    event_ids = meeting.get("event_ids") or {}
    if provider_token:
        provider, token = provider_token
        try:
            if provider == "google":
                cal = await GoogleCalendar.get_primary_calendar_id(token)
                if cal:
                    gid = meeting.get("google_event_id")
                    if gid:
                        await GoogleCalendar.delete_event(token, cal, gid)
            else:
                cal = await ZohoCalendar.get_default_calendar_uid(token)
                if cal:
                    zid = meeting.get("zoho_event_id")
                    if zid:
                        await ZohoCalendar.delete_event(token, cal, zid)
        except Exception:
            pass

    # Best-effort delete attendee mirror events
    from ..core.providers import resolve_token_for_email
    for email, eid in event_ids.items():
        try:
            tok = await resolve_token_for_email(db, email, org_id)
            if not tok:
                continue
            prov, t = tok
            if prov == "google":
                cal = await GoogleCalendar.get_primary_calendar_id(t)
                if cal:
                    await GoogleCalendar.delete_event(t, cal, eid)
            else:
                cal = await ZohoCalendar.get_default_calendar_uid(t)
                if cal:
                    await ZohoCalendar.delete_event(t, cal, eid)
        except Exception:
            pass

    now = datetime.utcnow()
    db.meetings.update_one(
        {"_id": meeting["_id"]},
        {"$set": {"status": "cancelled", "cancelled_at": now, "updated_at": now}},
    )

    try:
        from ..core.notification_service import create_and_deliver
        for att in meeting.get("attendees") or []:
            asyncio.create_task(create_and_deliver(
                user_id=att, org_id=org_id,
                type="meeting_cancelled",
                title=f"Meeting cancelled: {title}",
                message=f"The meeting '{title}' has been cancelled.",
            ))
    except Exception:
        pass

    return {"title": title, "meeting_id": str(meeting["_id"])}


def _parse_time_to_hhmm(text: str) -> str | None:
    """Return HH:MM for a bare-time message like '1', '1:00', '1pm', '3 PM', '13:00', or None."""
    m = re.match(r"^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$", text or "", re.IGNORECASE)
    if not m:
        return None
    h = int(m.group(1))
    mi = int(m.group(2) or 0)
    ap = (m.group(3) or "").lower()
    if ap == "pm" and h < 12:
        h += 12
    if ap == "am" and h == 12:
        h = 0
    if h > 23 or mi > 59:
        return None
    return f"{h:02d}:{mi:02d}"


async def _try_deterministic_booking(
    text: str,
    session_context: dict[str, Any],
    db,
    org_id: str | None,
    organizer_email: str | None,
) -> dict[str, Any] | None:
    """Short-circuit a bare-time reply against a pending booking stored in session_context.

    Returns a metadata-ready dict if booking was attempted, else None.
    """
    booking_time = _parse_time_to_hhmm(text)
    if not booking_time or not org_id or db is None:
        return None

    raw = session_context.get("pending_booking") or ""
    if not raw:
        return None
    try:
        pending_bp = json.loads(raw) if isinstance(raw, str) else raw
    except Exception:
        return None
    if not isinstance(pending_bp, dict) or not pending_bp.get("attendee_names"):
        return None

    bp = dict(pending_bp)
    bp["preferred_time"] = booking_time
    bp.pop("auto", None)
    bp.pop("available_slots", None)
    bp.pop("booking_result", None)

    try:
        result = await handle_meeting_booking(bp, db, org_id, organizer_email or "")
    except Exception as e:
        logger.warning(f"deterministic booking failed: {e}")
        return {"type": "answer", "answer": f"I couldn't book that time: {e}"}

    if result.get("error"):
        return {"type": "answer", "answer": f"I couldn't book the meeting: {result['error']}"}

    bp["attendee_emails"] = result.get("attendees", [])
    bp["available_slots"] = result.get("available_slots")
    bp["booking_result"] = result
    bp["preferred_time"] = booking_time

    if result.get("booked"):
        slot = result.get("slot", {})
        count = result.get("count", 1)
        recurring_note = f" — {count} occurrences" if count and count > 1 else ""
        answer = (
            f"✅ Meeting **\"{result['title']}\"** booked on {slot.get('date', '')} at "
            f"{slot.get('start', '')}{recurring_note} with {len(result.get('attendees', []))} attendee(s)."
        )
        return {"type": "answer", "answer": answer, "booking_params": bp}

    return {
        "type": "meeting_booking",
        "answer": result.get("message", "Available slots:"),
        "booking_params": bp,
    }


def _resolve_identity(current_user) -> tuple[str | None, str | None]:
    """Return (user_id, user_email) from an optional verified auth user."""
    if not current_user:
        return None, None
    user_id = getattr(current_user, "uid", None) or getattr(current_user, "id", None)
    user_email = getattr(current_user, "email", None)
    return user_id, user_email


async def _gather_org_snapshot(db, org_id: str, user_id: str | None = None, user_email: str | None = None) -> dict[str, Any]:
    """Collect a small JSON snapshot of everything we know about the org.

    `recent_insights` are scoped to the authenticated user (user_id / user_email)
    so one person's chat takeaways never leak into another user's prompt.
    """
    if db is None or not org_id:
        return {}

    snap: dict[str, Any] = {}

    try:
        try:
            org_oid = ObjectId(org_id)
        except Exception:
            org_oid = org_id
        org = db.organizations.find_one({"_id": org_oid}) or db.organizations.find_one({"_id": org_id})
        if org:
            snap["org_profile"] = {
                "name": org.get("name"),
                "industry": org.get("industry"),
                "micro_vertical": org.get("micro_vertical"),
                "stage": org.get("stage") or org.get("business_stage"),
                "business_model": org.get("business_model"),
                "size": org.get("size") or org.get("company_size"),
                "website": org.get("website_url") or org.get("website"),
                "description": (org.get("description") or "")[:200],
            }
    except Exception as e:
        logger.warning("org snapshot failed: %s", e)

    try:
        from ..core.file_processor import get_org_document_context
        doc_ctx = await get_org_document_context(org_id, max_docs=20)
        snap["documents"] = doc_ctx
    except Exception as e:
        logger.warning("doc snapshot failed: %s", e)
        snap["documents"] = {"total_documents": 0, "analyzed_documents": 0, "summary": ""}

    try:
        goals_docs = list(db.goals.find({"organization_id": org_id}).sort("created_at", -1).limit(60))
        for g in goals_docs:
            g["_id"] = str(g["_id"])
        snap["goals"] = {
            "count": len(goals_docs),
            "active": sum(1 for g in goals_docs if g.get("status") == "active"),
            "departments": list({g.get("department") for g in goals_docs if g.get("department")})[:10],
            "titles": [g.get("title") for g in goals_docs[:8]],
        }
        snap["_goal_docs"] = goals_docs
    except Exception as e:
        logger.warning("goals snapshot failed: %s", e)
        snap["goals"] = {"count": 0, "active": 0, "departments": [], "titles": []}
        snap["_goal_docs"] = []

    try:
        task_docs = list(db.tasks.find({"organization_id": org_id}).sort("created_at", -1).limit(150))
        snap["tasks"] = {
            "total": len(task_docs),
            "pending": sum(1 for t in task_docs if t.get("status") == "pending"),
            "in_progress": sum(1 for t in task_docs if t.get("status") == "in_progress"),
            "completed": sum(1 for t in task_docs if t.get("status") == "completed"),
            "departments": list({t.get("department") for t in task_docs if t.get("department")})[:10],
        }
        snap["_task_docs"] = task_docs
    except Exception as e:
        logger.warning("tasks snapshot failed: %s", e)
        snap["tasks"] = {"total": 0, "pending": 0, "in_progress": 0, "completed": 0, "departments": []}
        snap["_task_docs"] = []

    # Per-person workload index so the AI can answer "show me what's assigned
    # to <person>" / "What should I focus on this week?" with real names+titles.
    try:
        from ..core.identity import is_email as _is_email

        member_map: dict[str, str] = {}
        for col in ("employees", "org_chart_members"):
            for m in db[col].find({"organization_id": org_id}, {"email": 1, "full_name": 1}):
                em = str(m.get("email") or "").strip().lower()
                if em:
                    member_map.setdefault(em, m.get("full_name") or m.get("name") or em)

        id2email: dict[str, str] = {e.lower(): e for e in member_map}
        for col in ("employees", "org_chart_members"):
            for m in db[col].find({"organization_id": org_id}, {"email": 1}):
                em = str(m.get("email") or "").strip().lower()
                if em:
                    try:
                        id2email.setdefault(str(m["_id"]).lower(), em)
                    except Exception:
                        pass
                    uid = m.get("uid")
                    if uid:
                        id2email.setdefault(str(uid).lower(), em)
        for u in db["users"].find({}, {"email": 1, "uid": 1}):
            em = str(u.get("email") or "").strip().lower()
            uid = u.get("uid")
            if em and uid:
                id2email.setdefault(str(uid).lower(), em)

        def _assignee_emails_of(doc: dict[str, Any]) -> list[str]:
            raw = doc.get("assignee_id")
            if isinstance(raw, str):
                raw = [raw]
            out: list[str] = []
            for v in raw or []:
                s = str(v or "").strip().lower()
                if not s:
                    continue
                if _is_email(s):
                    out.append(s)
                else:
                    mapped = id2email.get(s)
                    if mapped:
                        out.append(mapped)
            # De-duplicate while preserving order
            seen: set[str] = set()
            deduped: list[str] = []
            for e in out:
                if e not in seen:
                    seen.add(e)
                    deduped.append(e)
            return deduped

        workload: dict[str, dict[str, Any]] = {}

        def _touch(email: str) -> dict[str, Any]:
            w = workload.setdefault(email, {"email": email, "name": member_map.get(email, email), "goals": [], "tasks": []})
            return w

        goal_titles: dict[str, str] = {str(g.get("_id")): g.get("title") for g in snap.get("_goal_docs") or []}

        for g in snap.get("_goal_docs") or []:
            for e in _assignee_emails_of(g):
                w = _touch(e)
                if len(w["goals"]) < 5:
                    pid = g.get("parent_goal_id")
                    label = g.get("title")
                    if pid and pid in goal_titles:
                        label = f"{label} (sub-goal of {goal_titles[pid]})"
                    w["goals"].append({"title": label, "status": g.get("status"), "goal_type": g.get("goal_type")})

        for t in snap.get("_task_docs") or []:
            for e in _assignee_emails_of(t):
                w = _touch(e)
                if len(w["tasks"]) < 6:
                    w["tasks"].append({"title": t.get("title"), "status": t.get("status"), "priority": t.get("priority")})

        # Only expose members with at least one item (or members with anything)
        workload_list = [w for w in workload.values() if w["goals"] or w["tasks"]]
        workload_list.sort(key=lambda w: (w["name"] or w["email"]).lower())
        snap["team_workload"] = workload_list[:40]
    except Exception as e:
        logger.warning("workload snapshot failed: %s", e)
        snap["team_workload"] = []

    # Drop the private raw lists before returning the snapshot
    snap.pop("_goal_docs", None)
    snap.pop("_task_docs", None)

    try:
        employees = list(db.employees.find({"organization_id": org_id}).limit(100))
        depts: dict[str, int] = {}
        for e in employees:
            d = e.get("department") or "Unassigned"
            depts[d] = depts.get(d, 0) + 1
        snap["employees"] = {
            "count": len(employees),
            "departments": depts,
            "sample": [
                {"name": e.get("full_name"), "role": e.get("role"), "department": e.get("department")}
                for e in employees[:5]
            ],
        }
    except Exception as e:
        logger.warning("employees snapshot failed: %s", e)
        snap["employees"] = {"count": 0, "departments": {}, "sample": []}

    try:
        updates = list(db.team_updates.find({"organization_id": org_id}).sort("created_at", -1).limit(5))
        snap["team_updates"] = [
            {"content": (u.get("content") or u.get("text") or "")[:200], "created_at": str(u.get("created_at"))}
            for u in updates
        ]
    except Exception:
        snap["team_updates"] = []

    try:
        insights_query: dict[str, Any] = {"organization_id": org_id, "status": "open"}
        if user_id:
            insights_query["user_id"] = user_id
        elif user_email:
            insights_query["user_email"] = user_email
        else:
            # No verified identity — must not return anyone else's insights.
            insights_query["user_id"] = "__unauthenticated__"
        insights_list = list(
            db.session_insights.find(insights_query)
            .sort("created_at", -1)
            .limit(5)
        )
        snap["recent_insights"] = [
            {"summary": i.get("summary", ""), "type": i.get("type", "insight"), "created_at": str(i.get("created_at"))}
            for i in insights_list
        ]
    except Exception:
        snap["recent_insights"] = []

    return snap


async def _store_session_insight(db, org_id: str | None, session_id: str | None, answer_text: str, insight_type: str = "insight", user_id: str | None = None, user_email: str | None = None):
    """Extract a one-line summary from the assistant's answer and store it as a session insight.

    Insights are stored scoped to the authenticated user so they never surface
    in another user's conversation.
    """
    if db is None or not org_id or not answer_text or len(answer_text) < 15:
        return
    try:
        first_line = answer_text.strip().split("\n")[0][:200]
        summary = first_line.replace("*", "").replace("✅", "").replace("🎯", "").strip()
        if len(summary) < 10:
            summary = answer_text.strip()[:200]
        db.session_insights.insert_one({
            "organization_id": org_id,
            "session_id": session_id or "",
            "user_id": user_id,
            "user_email": user_email,
            "summary": summary,
            "type": insight_type,
            "status": "open",
            "created_at": datetime.utcnow(),
        })
    except Exception as e:
        logger.warning(f"Failed to store session insight: {e}")


async def _confirm_insight_by_summary(db, org_id: str | None, summary: str, user_id: str | None = None):
    """Mark session insights matching the summary as done, scoped to the user."""
    if db is None or not org_id or not summary:
        return
    try:
        query: dict[str, Any] = {
            "organization_id": org_id,
            "summary": {"$regex": re.escape(summary[:100]), "$options": "i"},
            "status": "open",
        }
        if user_id:
            query["user_id"] = user_id
        db.session_insights.update_many(
            query,
            {"$set": {"status": "done", "confirmed_at": datetime.utcnow()}},
        )
    except Exception as e:
        logger.warning(f"Failed to confirm insight: {e}")


def _format_insights_block(insights: list[dict[str, Any]] | None) -> str:
    """Render stored cross-session insights for injection into the prompt.

    ASK_SYSTEM's CROSS-SESSION MEMORY section tells the model a "Recent insights"
    section is present above, so this must be injected everywhere that system
    prompt is used — otherwise the model is instructed to reference data it never
    actually receives, and cross-session recall silently does nothing.
    """
    if not insights:
        return ""
    lines = []
    for item in insights[:5]:
        summary = (item.get("summary") or "").strip()
        if not summary:
            continue
        created = str(item.get("created_at") or "")[:10]
        if created and created != "None":
            lines.append(f"- {summary} (from {created})")
        else:
            lines.append(f"- {summary}")
    if not lines:
        return ""
    return "Recent insights from previous sessions:\n" + "\n".join(lines) + "\n"


async def _build_ask_prompt(
    *,
    text: str,
    ctx: ChatContext,
    org_id: str | None,
    db,
    session_context: dict[str, Any],
    conversation_history: list[dict[str, str]] | None,
    proactive: bool,
    user_id: str | None = None,
    user_email: str | None = None,
) -> tuple[str, str, dict[str, Any]]:
    """Shared prompt + system choice for smart_ask and ask_stream.

    Returns (prompt_string, system_prompt_choice, snapshot_data).
    """
    snap: dict[str, Any] = {}
    if db is not None and org_id:
        try:
            snap = await _gather_org_snapshot(db, org_id, user_id=user_id, user_email=user_email)
        except Exception as e:
            logger.warning("_build_ask_prompt: snapshot failed: %s", e)

    org_p = snap.get("org_profile") or {}
    docs = snap.get("documents") or {}
    goals = snap.get("goals") or {}
    tasks = snap.get("tasks") or {}
    employees = snap.get("employees") or {}

    org_block = f"Organization: {ctx.organization_name or 'your business'}\n"
    if org_p:
        org_lines = [f"- {k}: {v}" for k, v in org_p.items() if v]
        if org_lines:
            org_block += "\n".join(org_lines) + "\n"

    doc_block = ""
    if docs and (docs.get("total_documents") or 0) > 0:
        analyzed_n = docs.get("analyzed_documents") or 0
        total_n = docs.get("total_documents") or 0
        doc_block = f"Uploaded documents ({analyzed_n} analyzed of {total_n}):\n"
        for d in (docs.get("documents") or [])[:8]:
            line = f"- {d.get('filename')}: {(d.get('summary') or '')[:200]}"
            metrics = d.get("key_metrics") or []
            if metrics:
                kv = ", ".join(f"{m.get('name')}={m.get('value')}" for m in metrics[:3])
                line += f" [{kv}]"
            decisions = d.get("decisions") or []
            if decisions:
                line += f" | decisions: {'; '.join(decisions[:2])}"
            doc_block += line + "\n"

    rag_block = ""
    if db is not None and org_id:
        try:
            from ..core.file_processor import search_documents
            search_results = await search_documents(org_id, text, top_k=3)
            if search_results:
                chunks = []
                for r in search_results:
                    chunks.append(f"- [{r.get('filename','?')}] (score: {r.get('score',0):.2f}): {r.get('text','')[:600]}")
                rag_block = "Relevant document excerpts (search results):\n" + "\n".join(chunks) + "\n"
        except Exception as e:
            logger.warning(f"_build_ask_prompt: vector search failed: {e}")

    goals_block = ""
    if goals.get("titles"):
        goals_block = f"Goals ({goals.get('active', 0)} active of {goals.get('count', 0)}):\n" + "\n".join(f"- {t}" for t in goals["titles"][:5]) + "\n"

    tasks_block = ""
    if tasks.get("total", 0) > 0:
        tasks_block = f"Tasks: {tasks.get('total', 0)} total ({tasks.get('pending', 0)} pending, {tasks.get('in_progress', 0)} in progress)\n"

    emp_block = ""
    if employees.get("count", 0) > 0:
        emp_block = f"Team: {employees['count']} people\n"
    team_block = ""
    if db is not None and org_id:
        try:
            team_members = _list_team_members(db, org_id) or []
            if team_members:
                lines = "\n".join(f"- {m['name']} ({m['email']})" if m.get("email") else f"- {m['name']}" for m in team_members)
                team_block = f"Team members (use these EXACT names when assigning tasks):\n{lines}\n"
        except Exception as e:
            logger.warning("Team member listing failed in _build_ask_prompt: %s", e)

    # Per-person workload index — the key ingredient that lets the AI answer
    # "what is assigned to <person>?" with real task/goal titles by name.
    workload = snap.get("team_workload") or []
    workload_map: dict[str, dict[str, Any]] = {}
    for w in workload:
        workload_map[(w.get("email") or "").lower()] = w
        workload_map[(w.get("name") or "").lower()] = w

    def _fmt_person(w: dict[str, Any]) -> str:
        parts = []
        goals = w.get("goals") or []
        tasks = w.get("tasks") or []
        if goals:
            parts.append("goals: " + "; ".join(f"{g.get('title')} ({g.get('status')})" for g in goals[:5]))
        if tasks:
            parts.append("tasks: " + "; ".join(f"{t.get('title')} ({t.get('status')})" for t in tasks[:6]))
        return f"- {w.get('name')} <{w.get('email')}>: " + (" | ".join(parts) if parts else "no assigned work")

    workload_block = ""
    if workload:
        rendered = [_fmt_person(w) for w in workload[:40]]
        workload_block = "Team workload (who is assigned what — check here when the user names a person):\n" + "\n".join(rendered) + "\n"

    # Personal block for the signed-in user, plus any person explicitly
    # @-mentioned or named in the message.
    personal_blocks: list[str] = []
    mentioned_keys: set[str] = set()
    for key in (user_email or "").lower(), (user_id or "").lower():
        if key and key in workload_map and key not in mentioned_keys:
            mentioned_keys.add(key)
            personal_blocks.append("Your assigned work:\n" + _fmt_person(workload_map[key]))
    for cand in workload:
        key = (cand.get("email") or "").lower()
        name = (cand.get("name") or "").strip().lower()
        if key in mentioned_keys or not name:
            continue
        if name and len(name) >= 3 and (name in text.lower() or (cand.get("email") or "").lower() in text.lower()):
            mentioned_keys.add(key)
            personal_blocks.append(f"Work assigned to {cand.get('name')}:\n" + _fmt_person(cand))
        if len(personal_blocks) >= 3:
            break
    personal_block = ("\n".join(personal_blocks) + "\n") if personal_blocks else ""

    ctx_block = ""
    if session_context:
        ctx_block = "What we already know from this chat:\n" + "\n".join(f"- {k}: {v}" for k, v in session_context.items()) + "\n"

    insights_block = _format_insights_block(snap.get("recent_insights") or [])

    history = (conversation_history or [])[-8:]
    history_block = "\n".join(f"{m.get('role','')}: {m.get('content','')[:300]}" for m in history) if history else ""

    prompt = (
        f"{org_block}\n"
        f"{doc_block}"
        f"{rag_block}"
        f"{goals_block}"
        f"{tasks_block}"
        f"{emp_block}"
        f"{team_block}"
        f"{personal_block}"
        f"{workload_block}"
        f"{ctx_block}"
        f"{insights_block}\n"
        f"Recent chat:\n{history_block}\n\n"
        f"Current date: {datetime.now().strftime('%A, %Y-%m-%d')}\n\n"
        f"User's message:\n\"{text}\"\n\n"
        f"{'Decide: answer directly or ask one question for missing info.' if not proactive else 'Respond with your proactive overview.'}"
    )

    system_choice = PROACTIVE_SYSTEM if proactive else ASK_SYSTEM
    return prompt, system_choice, snap


class DiagnoseRequest(BaseModel):
    message: str
    context: ChatContext | None = None


@router.post("/diagnose-data")
async def diagnose_data(request: DiagnoseRequest):
    """Look at what data the org has, decide if it's enough to answer
    the user's question, and (if not) request specific uploads."""
    text = (request.message or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="message is required")

    ctx = request.context or ChatContext()
    org_id = ctx.organization_id
    if not org_id:
        raise HTTPException(status_code=400, detail="organization_id is required in context")

    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    snap = await _gather_org_snapshot(db, org_id)

    # Truncate the snapshot for the prompt
    compact = {
        "org_profile": snap.get("org_profile", {}),
        "documents": {
            "total": snap.get("documents", {}).get("total_documents", 0),
            "analyzed": snap.get("documents", {}).get("analyzed_documents", 0),
            "pending": snap.get("documents", {}).get("pending_documents", 0),
            "summary": (snap.get("documents", {}).get("summary") or "")[:800],
            "metrics_count": len(snap.get("documents", {}).get("metrics", [])),
            "categories": list((snap.get("documents", {}).get("category_breakdown") or {}).keys()),
        },
        "goals": snap.get("goals", {}),
        "tasks": snap.get("tasks", {}),
        "employees": {
            "count": snap.get("employees", {}).get("count", 0),
            "departments": snap.get("employees", {}).get("departments", {}),
        },
        "team_updates_count": len(snap.get("team_updates", [])),
    }

    prompt = (
        f"User question:\n\"{text}\"\n\n"
        f"Organization data snapshot:\n{json.dumps(compact, ensure_ascii=False, default=str, indent=2)}\n\n"
        "Decide data_sufficiency, list relevant available_sources, list missing_sources, "
        "and (only if not 'complete') propose up to 3 upload_requests. "
        "Also write a short reasoning line the assistant can say out loud."
    )

    fallback = {
        "data_sufficiency": "complete",
        "available_sources": [],
        "missing_sources": [],
        "upload_requests": [],
        "reasoning": "I can answer this from what we already have.",
        "question_type": "general",
    }

    # Fast heuristic to keep the LLM from over-classifying company-specific
    # questions when the user is plainly asking for general knowledge.
    tl = text.lower().strip()
    has_personal_pronoun = bool(re.search(
        r"\b(we|our|us|my (company|business|team|startup)|i should|should i (hire|fire|cut|invest|launch|build))\b",
        tl,
    ))
    is_knowledge_query = bool(re.match(
        r"^(what (is|are)|what's|define|explain|how (does|do) .* work|why (does|do)|"
        r"give me \d+|suggest \d+|best practice|frameworks? for|tips? for|ways? to)\b",
        tl,
    ))
    if not has_personal_pronoun and is_knowledge_query:
        fallback["question_type"] = "general"
        return fallback

    try:
        raw = await get_ai_response(
            prompt=prompt,
            system_prompt=DATA_DIAGNOSE_SYSTEM,
            temperature=0.2,
            max_tokens=2000,
        )
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
            cleaned = re.sub(r"```$", "", cleaned).strip()
        m = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if m:
            cleaned = m.group(0)
        parsed = json.loads(cleaned)
        parsed.setdefault("data_sufficiency", "complete")
        parsed.setdefault("available_sources", [])
        parsed.setdefault("missing_sources", [])
        parsed.setdefault("upload_requests", [])
        parsed.setdefault("reasoning", "")
        parsed.setdefault("question_type", "company")
        if parsed["data_sufficiency"] not in ("complete", "partial", "missing"):
            parsed["data_sufficiency"] = "complete"
        if parsed["question_type"] not in ("general", "company"):
            parsed["question_type"] = "company"
        # General-knowledge questions never need uploads
        if parsed["question_type"] == "general":
            parsed["data_sufficiency"] = "complete"
            parsed["upload_requests"] = []
        return parsed
    except Exception as e:
        logger.warning("diagnose_data failed: %s", e)
        fallback["question_type"] = "company"
        return fallback


# ---------------------------------------------------------------------------
# Chat (intelligent: diagnose → either ask for data, or answer deeply)
# ---------------------------------------------------------------------------

CHAT_DEEP_SYSTEM = """You are YesBoss's AI Business Analyst — sharp, encouraging, owner-friendly, and most importantly SPECIFIC.

You speak like a great COO sitting next to the founder, not a chatbot.

Hard rules:
1. NEVER give a vague, generic, or textbook answer. Every sentence must reference something concrete — a number, a name, a decision, a date, a doc, a goal, a task. If you don't have specifics, say so and say what to upload.
2. Lead with the single most important insight in one short sentence.
3. Then 2-5 short bullets. Each bullet either cites a number/fact from the data OR names a concrete next step.
4. End with ONE specific follow-up question OR a clear "do this next" suggestion.
5. When you cite a metric, include the source filename in italics. Example: _from Q3 Financials.pdf_.
6. If the user asked about something we have only PARTIAL data for, say what we know AND clearly state what we don't. Don't hide the gap.
7. Never say "based on the information provided" or "as an AI". The owner knows you're an AI. Be useful, not polite.
8. Use 1-2 relevant emojis max per message.

Tone: warm, direct, confident, no fluff. The owner is busy.
"""


@router.post("/chat")
async def assistant_chat(request: ChatRequest, current_user = Depends(get_current_user_optional)):
    """Intelligent chat. Diagnoses data first; if data is missing, asks for
    specific uploads. If data is partial, gives a partial answer and asks for
    the missing piece. If data is complete, gives a deep, specific answer."""
    text = (request.message or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="message is required")

    user_id, user_email = _resolve_identity(current_user)
    context = request.context or ChatContext()
    if not context.user_email and user_email:
        context.user_email = user_email
    org_id = context.organization_id

    history = (request.conversation_history or [])[-8:]
    history_block = "\n".join(
        f"{m.get('role', 'user').upper()}: {m.get('content', '')}" for m in history
    ) if history else "(no prior messages)"

    # --- Step 1: Diagnose data ---
    diagnosis: dict[str, Any] | None = None
    if org_id:
        try:
            diagnosis = await diagnose_data(DiagnoseRequest(message=text, context=context))
        except Exception as e:
            logger.warning("chat: diagnose step failed: %s", e)

    # --- Step 2: If missing data, ask the owner to upload the right docs ---
    if diagnosis and diagnosis.get("question_type") == "company" and diagnosis.get("data_sufficiency") == "missing":
        upload_requests = diagnosis.get("upload_requests") or []
        reasoning = diagnosis.get("reasoning") or "I need a bit more context before I can answer that properly."
        # Human-to-human framing of the upload request
        bullets = []
        for i, req in enumerate(upload_requests[:3]):
            doc_type = req.get("document_type", "a document")
            why = req.get("why", "")
            example = req.get("example", "")
            line = f"**{i+1}. {doc_type}** — {why}"
            if example:
                line += f"\n   e.g. _{example}_"
            bullets.append(line)
        bullet_block = "\n".join(bullets) if bullets else ""
        response = (
            f"{reasoning}\n\n"
            f"To give you a real answer (not a textbook one), can you upload:\n\n"
            f"{bullet_block}\n\n"
            f"Drop the file(s) right here and I'll dig in immediately. 📎"
        )
        return {
            "response": response,
            "status": "needs_data",
            "data_sufficiency": "missing",
            "upload_requests": upload_requests,
            "available_sources": diagnosis.get("available_sources", []),
            "missing_sources": diagnosis.get("missing_sources", []),
        }

    # --- Step 3: Build the rich context for the deep answer ---
    db = get_database()
    snap: dict[str, Any] = {}
    if db is not None and org_id:
        try:
            snap = await _gather_org_snapshot(db, org_id, user_id=user_id, user_email=user_email)
        except Exception as e:
            logger.warning("chat: snapshot failed: %s", e)

    # General-knowledge question: answer from general knowledge, light context
    if diagnosis and diagnosis.get("question_type") == "general":
        org_p = snap.get("org_profile") or {}
        industry = org_p.get("industry") or "their industry"
        size = org_p.get("size") or "their company"
        general_prompt = (
            f"User works at {context.organization_name or 'a business'} "
            f"in {industry} ({size}). "
            f"Adapt your answer to be relevant to a small/mid business owner — "
            f"give concrete, actionable advice, not textbook fluff.\n\n"
            f"Recent conversation:\n{history_block}\n\n"
            f"Question:\n\"{text}\""
        )
        try:
            response = await get_ai_response(
                prompt=general_prompt,
                system_prompt=CHAT_DEEP_SYSTEM,
                temperature=0.6,
                max_tokens=3000,
                provider=request.provider,
            )
            if not response or not response.strip():
                raise RuntimeError("Empty AI response")
            return {
                "response": response.strip(),
                "status": "ok",
                "data_sufficiency": "complete",
                "question_type": "general",
                "available_sources": [],
                "missing_sources": [],
                "upload_requests": [],
            }
        except Exception as e:
            logger.warning("general chat failed: %s", e)
            return {
                "response": (
                    "I'm having a small hiccup. Try again in a moment."
                ),
                "status": "error",
            }

    org_block = ""
    org_p = snap.get("org_profile") or {}
    if org_p:
        org_lines = [f"- {k}: {v}" for k, v in org_p.items() if v]
        if org_lines:
            org_block = "Organization profile:\n" + "\n".join(org_lines) + "\n\n"

    doc_block = ""
    docs = snap.get("documents") or {}
    if docs and (docs.get("total_documents") or 0) > 0:
        # Per-document detailed block (small subset, trimmed). Summaries include
        # a raw-text preview fallback so pending docs aren't bare filenames.
        doc_lines = []
        for d in (docs.get("documents") or [])[:8]:
            line = f"- **{d.get('filename', 'document')}** ({d.get('document_category', '?')}): {d.get('summary', '')[:200]}"
            metrics = d.get("key_metrics") or []
            if metrics:
                kv = ", ".join(f"{m.get('name')}={m.get('value')}" for m in metrics[:5])
                line += f" | metrics: {kv}"
            decisions = d.get("decisions") or []
            if decisions:
                line += f" | decisions: {'; '.join(decisions[:2])}"
            actions = d.get("action_items") or []
            if actions:
                line += f" | action items: {'; '.join(actions[:2])}"
            doc_lines.append(line)
        if doc_lines:
            doc_block = (
                f"Documents ({docs.get('analyzed_documents', 0)} analyzed of {docs.get('total_documents', 0)}):\n"
                + "\n".join(doc_lines)
                + "\n\n"
            )

    goals_block = ""
    goals = snap.get("goals") or {}
    if goals.get("titles"):
        goals_block = (
            f"Active goals ({goals.get('active', 0)} of {goals.get('count', 0)} total):\n"
            + "\n".join(f"- {t}" for t in goals["titles"][:8])
            + "\n\n"
        )

    tasks_block = ""
    tasks = snap.get("tasks") or {}
    if tasks.get("total", 0) > 0:
        tasks_block = (
            f"Task workload: {tasks.get('total', 0)} total — "
            f"{tasks.get('pending', 0)} pending, {tasks.get('in_progress', 0)} in progress, "
            f"{tasks.get('completed', 0)} completed.\n"
        )
        if tasks.get("departments"):
            tasks_block += f"Departments with work: {', '.join(tasks['departments'][:6])}\n\n"

    emp_block = ""
    employees = snap.get("employees") or {}
    if employees.get("count", 0) > 0:
        dept_summary = ", ".join(f"{d}:{n}" for d, n in list(employees.get("departments", {}).items())[:8])
        emp_block = (
            f"Team: {employees['count']} people across departments — {dept_summary}.\n\n"
        )

    team_block = ""
    if db is not None and org_id:
        try:
            team_members = _list_team_members(db, org_id) or []
            if team_members:
                lines = "\n".join(f"- {m['name']} ({m['email']})" if m.get("email") else f"- {m['name']}" for m in team_members)
                team_block = f"Team members (use these EXACT names when assigning tasks):\n{lines}\n\n"
        except Exception as e:
            logger.warning("Team member listing failed in assistant_chat: %s", e)

    updates_block = ""
    updates = snap.get("team_updates") or []
    if updates:
        updates_block = "Recent team updates:\n" + "\n".join(f"- {u.get('content','')}" for u in updates[:3]) + "\n\n"

    available = []
    if diagnosis and diagnosis.get("available_sources"):
        available = [f"- [{s.get('type')}] {s.get('summary')}" for s in diagnosis["available_sources"]]
    avail_block = ("Relevant data we have:\n" + "\n".join(available) + "\n\n") if available else ""

    missing_line = ""
    if diagnosis and diagnosis.get("data_sufficiency") == "partial" and diagnosis.get("missing_sources"):
        miss = "; ".join(s.get("summary", s.get("type", "")) for s in diagnosis["missing_sources"][:3])
        missing_line = f"Note: we don't yet have {miss}. Mention this gap in your answer.\n\n"

    prompt = (
        f"Organization: {context.organization_name or 'your business'}\n"
        f"User: {context.user_email or 'the owner'}\n\n"
        f"{org_block}"
        f"{doc_block}"
        f"{goals_block}"
        f"{tasks_block}"
        f"{emp_block}"
        f"{team_block}"
        f"{updates_block}"
        f"{avail_block}"
        f"{missing_line}"
        f"Recent conversation:\n{history_block}\n\n"
        f"Owner's latest question:\n\"{text}\"\n\n"
        "Answer SPECIFICALLY. Cite numbers, files, names, and goals when relevant. "
        "If we don't have the data, say so and tell the owner exactly what to upload."
    )

    try:
        response = await get_ai_response(
            prompt=prompt,
            system_prompt=CHAT_DEEP_SYSTEM,
            temperature=0.55,
            max_tokens=3000,
            provider=request.provider,
        )
        if not response or not response.strip():
            raise RuntimeError("Empty AI response")

        if diagnosis and diagnosis.get("data_sufficiency") == "partial":
            # Augment the answer with a one-line nudge to fill the gap
            gap = diagnosis.get("missing_sources", [])
            if gap:
                first_gap = gap[0].get("summary", gap[0].get("type", ""))
                if first_gap and first_gap.lower() not in response.lower():
                    response += f"\n\n_Heads up: I'm working without {first_gap} right now — upload it and I'll sharpen this answer._"

        return {
            "response": response.strip(),
            "status": "ok" if not (diagnosis and diagnosis.get("data_sufficiency") == "partial") else "partial",
            "data_sufficiency": (diagnosis or {}).get("data_sufficiency", "complete"),
            "available_sources": (diagnosis or {}).get("available_sources", []),
            "missing_sources": (diagnosis or {}).get("missing_sources", []),
            "upload_requests": (diagnosis or {}).get("upload_requests", []),
        }
    except Exception as e:
        logger.warning("assistant_chat failed: %s", e)
        return {
            "response": (
                "I'm having trouble reaching my reasoning model right now. "
                "Try again in a moment, or rephrase the question — I work best "
                "with one clear ask at a time."
            ),
            "status": "error",
        }


async def _async_snapshot(db, org_id: str) -> dict[str, Any]:
    """Async wrapper around the snapshot collector (kept for symmetry)."""
    return await _gather_org_snapshot(db, org_id)


# ---------------------------------------------------------------------------
# Smart Ask — understand → check docs → answer or ask
# ---------------------------------------------------------------------------

ASK_SYSTEM = """You are YesBoss's AI Business Analyst. You help business owners and employees with smart, engaging, context-aware answers.

## CORE PRINCIPLE
Before you respond, think: **Do I actually understand what the user wants?** If their statement is vague or lacks specifics (e.g. "I want to start hiring", "I want to invest", "Let's do marketing"), ask ONE clarifying question first. Never make up context, projects, or people they didn't mention.

## YOUR DECISION PROCESS

STEP 1 — Classify intent:
- "general_knowledge" — advice, explanations, ideas (e.g. "What is unit economics?"). No company data needed.
- "company_data" — they ask about THEIR business (e.g. "How much can I spend?", "Can we afford 8 lakhs?"). Check docs/tasks/goals first.
- "delegate" — they explicitly want to assign something to someone (e.g. "assign to X", "send this to Y"). Only use this if they NAME a person.
- "question" — they ask something specific you can answer directly.
- Everything else — ask ONE clarifying question before responding.

STEP 2 — Act:
- If you understood the request fully: answer directly. Be concise.
- If the intent is unclear or lacks specifics: ask ONE specific clarifying question. Never list multiple questions or suggestions.
- Only mention team members or assign tasks if the user explicitly brought them up.
- Only reference goals/projects that actually exist in the data provided. Never invent them.

STEP 3 — Format:
- Short, direct answer (1-2 sentences) then optional follow-up
- Natural, human language. No corporate jargon.
- NEVER ask more than ONE question at a time

## CONVERSATION STYLE
- Talk like a sharp colleague, not a chatbot
- Short sentences. Punchy. Human.
- Keep answers under 8 lines total. Tight = respectful.

## HANDLING USER FOLLOW-UPS
- If user says "this is the file" / "I uploaded a file" — check the Uploaded documents section and analyze it. Don't ask what it says.
- If user says "did you analyze the file" — scan documents and summarize findings.
- If user repeats themselves — don't ask the same question again. Try a different angle.
- Every response: scan uploaded docs if the topic involves money/budget/resources.

## EXAMPLE FLOWS
User: "I want to start hiring"
→ Too vague. Ask: "What role are you looking to hire for?"
→ User: "Software engineer"
→ Then: "Got it. What's the budget range and timeline?"

User: "I want to buy something for 8 lakhs"
→ Check documents for budget/financial data
→ If a doc shows "available budget: 15 lakhs" → "You've got 15 lakhs in your budget — you're good to spend 8! 🎉"
→ If no budget doc exists → "Do you have a budget sheet or financial report I can check? I want to make sure 8 lakhs works before you commit."

User: "What should I focus on this week?"
→ Check goals, tasks, session_context
→ If goals/tasks exist → "You've got 3 active goals and 5 tasks in progress. I'd start with the Q4 hiring push — it's the only one marked high priority. Want me to break it into steps?"
→ If nothing exists → "Looks like your plate is clear right now. Want to set a goal for the week?"

User: "send this to Prafullata and add it as task to her" (after discussing hiring 6 marketing interns)
→ Check conversation history — see the context is about hiring marketing interns
→ Output delegate: {"type":"delegate","assignee_name":"Prafullata","title":"Hire 6 marketing interns","description":"Draft job post and initiate hiring for 6 marketing interns, 10k/month stipend, 6 months duration","priority":"medium","answer":"Done! I've created a task **\"Hire 6 marketing interns\"** for **Prafullata**. She'll see it on her dashboard. 🎉"}

User: "assign the Q4 report to John"
→ If John is a known team member and Q4 report context is in conversation history → delegate
→ If no context → {"type":"question","question":{...}}

## MEETING BOOKING

When the user asks to book/schedule a meeting (e.g. "add meeting with @john next Tuesday", "schedule a call with @sarah", "book a meeting with team", "schedule a weekly sync", "reschedule the meeting to Thursday 3pm", "cancel the meeting"), you must:

1. **Extract all available info from their message first.** If they gave you attendees, date, time, and duration all in one message, do NOT ask any clarifying questions — just book it. The `Current date` line at the top tells you today's date. Use it to resolve relative dates like "today", "tomorrow", "next Tuesday", "this Friday" into absolute YYYY-MM-DD.

2. Ask ONE clarifying question at a time via the "question" format — ONLY if something is truly missing:
   - who should attend? (if not clear from @mentions)
   - what date? (only if no date given — if they said "today"/"tomorrow"/"next Tuesday", resolve it yourself)
   - what time / duration? (only if not given — e.g. if they said "9pm for 1hr", extract both)
   - what's the meeting title? (only if not given)

3. **Reschedule:** if the user asks to move an existing meeting, output {"type":"meeting_reschedule","meeting":{"title":"...","date":"YYYY-MM-DD","preferred_time":"HH:MM or empty"},"answer":"..."}. Identify the meeting from conversation history (title + who was attending). If the new date/time is given, resolve relative to Current date; leave preferred_time empty if "any time".

4. **Cancel:** if the user asks to cancel/delete an existing meeting, output {"type":"meeting_cancel","meeting":{"title":"..."},"answer":"I'll cancel that meeting."}. Identify the meeting title from the message or conversation history.

5. **Book:** otherwise output a meeting_booking response. Once ALL of the following are clear, include in `booking_params`:
   - `attendee_names` — list of full names or emails of attendees (resolve @mentions to names)
   - `date` — the absolute calendar date in YYYY-MM-DD format (today/tomorrow/next Tuesday resolved from Current date). If they gave a RANGE (e.g. "sometime next week", "any day this week", "this month"), set `date` empty and instead set `date_start` + `date_end` (YYYY-MM-DD).
   - `duration_minutes` — numeric duration (15, 30, 60, 90, 120). Default 60 if unclear.
   - `title` — meeting title (default "Meeting" if unclear)
   - `preferred_time` — the specific time if they mentioned one (e.g. "15:00", "10:30"); otherwise leave empty.
   - `auto` — true ONLY if they didn't specify a time and clearly want you to pick (e.g. "any time", "whenever works", "book it for me"); system auto-picks the first free slot. For a range with no time, also set auto true.
   - `recurrence` — if recurring, {"frequency":"weekly","count":8} (or "daily").
   - `remind_before_minutes` — 30 by default; set to their request if they say e.g. "remind me 10 min before".
   - `description` — optional meeting agenda or context

6. CRITICAL: Never ask for the date if they already said "today". Never ask what "today" means. Use the Current date provided above.

7. **Bare-time follow-up:** If the user's message is ONLY a time (e.g. "1:00", "1pm", "3 PM", "13:00") and the recent chat shows you just asked for a meeting time, treat it as the answer — output a meeting_booking with `preferred_time` in HH:MM, reusing the attendees, title and date from the recent chat. NEVER ask another question in that case.

8. **Clarifying questions must carry booking_params:** Whenever you ask a meeting clarifying question (e.g. "what time?", "who should attend?"), include a partial `booking_params` object at the top level of the SAME JSON envelope (alongside `type` and `question`) with whatever you have already gathered — e.g. {"type":"question","question":{...},"booking_params":{"attendee_names":["Krisha"],"title":"YB test project","date":"2026-08-24","duration_minutes":60}}. This lets the system resume booking once the user answers.

## MEETING BOOKING RESPONSE FORMAT

{"type":"meeting_booking","booking_params":{"attendee_names":["John Smith","Sarah Jones"],"date":"2026-06-23","duration_minutes":60,"title":"Sprint Review","preferred_time":"15:00","description":"Weekly sprint sync"},"answer":"I found availability at 3 PM on Tuesday. Let me book it for you!"}

Range + auto example: {"type":"meeting_booking","booking_params":{"attendee_names":["John Smith"],"date_start":"2026-06-22","date_end":"2026-06-26","duration_minutes":30,"title":"Check-in","auto":true},"answer":"I'll find the first free slot next week and book it."}

## RESPONSE FORMATS

For answers: {"type":"answer","answer":"your answer here (max 8 lines)","follow_up":"optional 1-line follow-up","suggestions":[{"label":"Button text","action":"Full sentence to send as follow-up"}]}

For questions: {"type":"question","question":{"id":"q_xxx","field_id":"field_name","text":"one clear question","options":[{"value":"opt1","label":"Option 1"},...],"allow_custom":true},"answer":null}

## STRATEGIC BRIEFING (RESPONSE TYPE: "briefing")

Use this ONLY when the user's message is a long, multi-topic, strategic context-dump — they describe how the whole business runs in a single turn (sales flow, order pipeline, org structure and owners, operating cadence, targets, margins, concerns, and what they want to restructure). Think: a thinking-out-loud briefing about the entire operation, not one focused question and not one explicit delegation request.

Response format (same JSON envelope as "answer", so keep field names identical):
{"type":"briefing","answer":"the full structured briefing (may be LONG — no 8-line cap here; tables and code blocks welcome)","follow_up":"one short closing line","missing_data":{"doc_type":"...","reason":"..."},"suggestions":[{"label":"...","action":"..."}]}

Rules for the "briefing" response:
- If the user SAID they are attaching files (e.g. a funnel Excel, an implementation-process doc, an org-chart file, a presentation) but no such files appear in the "Uploaded documents" section above, say so openly up front and include a "missing_data" entry so the app asks them to upload. Then tell them what you can do once the files arrive.
- Reflect their operating model back in an organized way: the flow (e.g. funnel → order booking → execution → invoicing → collection) with who owns each stage; the key problems with each lever; the org structure they described (use a code block for the chart); the operating cadence (weekly sales commitment, delivery review, collection tracking, monthly governance); and the numbers they gave.
- Answer any embedded strategic question directly (e.g. "should I slow down?"), with a clear recommendation and why.
- NEVER delegate, create tasks, or create goals from a briefing. It is context-setting, not an assignment. Do not output type "delegate".
- Never invent numbers. Only use figures the user explicitly stated.
- Flag obvious gaps they raised themselves (e.g. an ownerless function).
- End with ONE next-step question offering to operationalize something (a tracker, a weekly plan, a checklist).

For delegation (when user wants to assign a task or goal to someone AND you have enough context):
{"type":"delegate","item_type":"task|goal|both","assignee_name":"full name of person (or comma-separated list: "Prince Pandey, Krisha Suchak")","assignee_email":"their email if known","title":"short title (2-8 words)","description":"optional detail","priority":"medium|high|low","answer":"confirmation of intent to show the user (1-2 sentences)"}

For MULTIPLE assignees you may also provide the names as an array: "assignee_name": ["Prince Pandey", "Krisha Suchak"]. ALWAYS use the EXACT names from the "Team members" list above — never invent or guess a teammate's name. One task/goal with multiple assignees (do NOT create a separate task per person).

For item_type: use "task" when the user says "assign as a task" / "create a task and assign" / just says assign something to do; use "goal" when they say "assign as a goal" / "set a goal for" someone; use "both" when the request is ambiguous or clearly implies both a goal and a task. Never create both unless the user's words imply both.

## ACTION ITEMS (OPTIONAL)
After answering, if the conversation reveals clear next steps or action items the user hasn't explicitly delegated, include an "action_items" array in your JSON response. Each action item should have a title, optional description, priority, and optional assignee_name (if the user mentioned someone who should own it).

Example: User discusses needing to review marketing budget and hire a designer
→ {"type":"answer","answer":"Good news — your budget has room for both. I'd suggest starting with the designer hire since it takes longest.","follow_up":"Want me to draft a job description?","action_items":[{"title":"Review Q3 marketing budget","description":"Compare actual spend vs budget for Q3","priority":"high"},{"title":"Hire a graphic designer","description":"Draft job post and initiate hiring","priority":"medium"}]}

Only include action_items when there are 1-5 clear, specific, actionable items. Don't include them for general knowledge questions or casual chat. Limit to 5 items max.

## CROSS-SESSION MEMORY (IMPORTANT)
The "Recent insights" section above shows key takeaways from previous chat sessions with this user. Use them to:
- Reference past discussions: *"Last session you mentioned wanting to review ad channels — did that happen?"*
- Follow up on open items: *"You were planning to set up a hiring pipeline. Want to continue that?"*
- Suggest marking things done: *"Should I mark that task as completed?"*
- Connect dots across conversations: *"Your goal from last week ties into what you're asking now."*

Always reference insights naturally, as if you remember the conversation. If the user confirms something is done, include "confirmation" in your response so the backend can mark it.

Example: Recent insights include "Planned to review marketing budget"
User: "Yes, we reviewed it — all good"
→ {"type":"answer","answer":"Great that it's sorted! I'll mark that as done.","follow_up":"Want to set a new budget goal based on that review?","confirmation":{"insight_summary":"Planned to review marketing budget","status":"done"}}

## FOLLOW-UP SUGGESTIONS (OPTIONAL)
After answering, if there are 1-3 natural next steps the user might want to take, include a "suggestions" array in your response. Each suggestion has a "label" (short button text, 2-4 words) and "action" (what it does — used as the input text when the user clicks it).

Example: User asks "What should I focus on this week?" with goals including "Q4 hiring push"
→ {"type":"answer","answer":"Start with the Q4 hiring push — it's your only high priority goal.","follow_up":"Want me to break it into steps?","suggestions":[{"label":"Break into steps","action":"Break the Q4 hiring push into actionable steps"},{"label":"Show my tasks","action":"Show me all my pending tasks this week"},{"label":"Set a new goal","action":"I want to set a new goal"}]}

Only include suggestions when there are 1-3 clear, specific, useful next steps. Don't include them for simple confirmations, yes/no answers, or clarification questions. The action text should be a complete sentence the user could send as a follow-up message.

## MISSING DATA REQUEST (OPTIONAL)
When you cannot fully answer because specific data is NOT present in the uploaded documents, org profile, or chat context, include a "missing_data" field in your JSON response with doc_type and reason. This tells the frontend to prompt the user for the specific document.

Only use this when:
- The user asks something that clearly requires data from a specific document type
- No uploaded document contains that data
- You know exactly what document type would help

Known document types you can request:
- "Financial Statement (P&L / Budget)" — profit & loss, balance sheet, budget planning
- "Sales Report" — revenue data, pipeline, deals
- "Team Structure / Org Chart" — team roles, headcount, reporting lines
- "Marketing Plan" — campaign strategy, ad spend, channels
- "Business Plan" — overall business strategy and goals
- "Inventory / Stock Report" — stock levels, supply chain
- "Customer Feedback / Survey" — NPS, survey results
- "Contract / Legal Document" — agreements, terms

Example: User asks "Can we afford to hire 2 more developers?" and no financial docs exist
→ {"type":"answer","answer":"I don't have your financial data to check this. Upload your budget or financial statement and I'll run the numbers.","missing_data":{"doc_type":"Financial Statement (P&L / Budget)","reason":"Need to verify available budget for headcount expansion"}}

Do NOT use missing_data for general knowledge questions. Only use it when the answer depends on data that should exist in a specific company document."""

PROACTIVE_SYSTEM = """You are YesBoss's AI Business Analyst — starting a conversation with a business owner.

## YOUR JOB
The user just opened this chat. They haven't asked anything yet. Your job is to proactively analyze their business and start the conversation with a valuable overview.

## WHAT TO DO
1. Look at the Organization Profile, Goals, Tasks, Uploaded Documents, Team, Recent Chat context, and any "Recent insights from previous sessions" provided below.
   - If past-session insights are present, lead with a follow-up on one of them — *"Last session you were planning to review ad channels — did that happen?"* That's far more valuable than a cold summary.
2. Give a concise, insightful **business overview** (4-6 lines max) that covers:
   - What you see — key metrics, active goals, pending tasks, team size
   - One notable observation — e.g. "I notice you have 3 overdue tasks", "Your documents include a budget with room to invest", "Your team has capacity"
   - A specific offer — "Want to dive into any of these?"

## RULES
- Be sharp and human, like a colleague who walked into your office with a coffee
- Never say "How can I help you?" — that's lazy. Be specific about what you see.
- If the org has little data (no goals, no docs, small team), offer to help set things up
- If there are clear problems (overdue tasks, incomplete profile), flag them gently
- End with a single, specific question — not a generic "What would you like to do?"

## EXAMPLES

Scenario: 12 active goals, 3 overdue tasks, budget doc uploaded
→ "Morning! You've got 12 goals running and a budget doc I analyzed — looks like you have ₹15L to work with. But 3 tasks are overdue. Want to review those or talk about where to invest the budget?"

Scenario: New org, no goals, no docs, 2 team members
→ "Welcome! I see you've just started building your org. You've got 2 team members but no goals or documents yet. Want to set up your first goal or upload a financial plan? Happy to guide you through either."

Scenario: 5 active goals, all on track, sales report uploaded showing growth
→ "Good week so far — all 5 goals are on track. I scanned your sales report: revenue is up 12% this quarter. 🎉 Want to adjust any targets or set a new growth goal?"

## FOLLOW-UP SUGGESTIONS (ALWAYS INCLUDE)
The user hasn't typed anything yet, so give them 2-3 one-tap ways to start. Include a
"suggestions" array where each entry has a "label" (short button text, 2-4 words) and an
"action" (a complete sentence sent as the user's next message). Base them on what you
actually saw in the data — reference real goals, overdue tasks, or documents, not generic
filler.

Example: 12 goals, 3 overdue tasks, budget doc uploaded
→ "suggestions":[{"label":"Review overdue","action":"Show me the 3 overdue tasks and what's blocking them"},{"label":"Budget breakdown","action":"Break down what's in my budget document"},{"label":"Set a goal","action":"Help me set a new goal for this quarter"}]

## RESPONSE FORMAT
{"type":"answer","answer":"your proactive overview here (max 6 lines)","follow_up":"single follow-up question here","suggestions":[{"label":"Button text","action":"Full sentence to send as follow-up"}]}"""


class AskRequest(BaseModel):
    message: str
    session_id: str | None = None
    session_context: dict[str, str] | None = None
    context: ChatContext | None = None
    conversation_history: list[dict[str, str]] | None = None
    proactive: bool = False


class BookingSlot(BaseModel):
    date: str | None = None
    start: str
    end: str

class BookingParams(BaseModel):
    attendee_emails: list[str] = []
    date: str | None = None
    date_start: str | None = None
    date_end: str | None = None
    duration_minutes: int = 60
    title: str | None = None
    description: str | None = None
    preferred_time: str | None = None
    auto: bool = False
    recurrence: dict[str, Any] | None = None
    remind_before_minutes: int = 30
    series_id: str | None = None
    available_slots: list[BookingSlot] | None = None
    booking_result: dict[str, Any] | None = None

class ActionItem(BaseModel):
    title: str
    description: str | None = None
    priority: str = "medium"
    assignee_name: str | None = None
    assignee_email: str | None = None


class BulkCreateTasksRequest(BaseModel):
    organization_id: str
    action_items: list[ActionItem]
    context: ChatContext | None = None


class AskResponse(BaseModel):
    type: str  # "question" | "answer" | "briefing" | "meeting_booking" | "delegate_preview"
    question: dict[str, Any] | None = None
    answer: str | None = None
    follow_up: str | None = None
    session_id: str | None = None
    booking_params: BookingParams | None = None
    action_items: list[dict[str, Any]] | None = None
    missing_data: dict[str, str] | None = None  # {"doc_type": "...", "reason": "..."}
    confirmation: dict[str, str] | None = None  # {"insight_summary": "...", "status": "done"}
    suggestions: list[dict[str, str]] | None = None  # [{"label": "...", "action": "..."}]
    delegate_params: dict[str, Any] | None = None  # pre-filled DelegateRequest fields for confirmation
    generated_sub_tasks: list[dict[str, Any]] | None = None  # AI-suggested sub-tasks awaiting selection


@router.post("/ask", response_model=AskResponse)
async def smart_ask(request: AskRequest, current_user = Depends(get_current_user_optional)):
    """Ask a question. Understands intent → checks uploaded docs → answers directly or asks for missing info."""
    text = (request.message or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="message is required")

    user_id, user_email = _resolve_identity(current_user)
    ctx = request.context or ChatContext()
    if not ctx.user_email and user_email:
        ctx.user_email = user_email
    org_id = ctx.organization_id
    db = get_database()

    session_context = dict(request.session_context or {})
    det = await _try_deterministic_booking(text, session_context, db, org_id, ctx.user_email or "")
    if det:
        det_bp = det.get("booking_params")
        return AskResponse(
            type=det["type"],
            answer=det.get("answer"),
            booking_params=BookingParams(**det_bp) if det_bp else None,
            session_id=request.session_id,
        )
    prompt, system, snap = await _build_ask_prompt(
        text=text,
        ctx=ctx,
        org_id=org_id,
        db=db,
        session_context=session_context,
        conversation_history=request.conversation_history,
        proactive=request.proactive,
        user_id=user_id,
        user_email=user_email,
    )

    fallback_question = {
        "type": "question",
        "question": {
            "id": "q_fallback",
            "field_id": "context",
            "text": "Could you tell me a bit more so I can give you a better answer?",
            "options": [
                {"value": "financial", "label": "Something about money or numbers"},
                {"value": "team_ops", "label": "Something about the team or work"},
                {"value": "strategy", "label": "Advice or ideas"},
                {"value": "other", "label": "Something else"},
            ],
            "allow_custom": True,
        },
        "answer": None,
    }

    try:
        raw = await get_ai_response(
            prompt=prompt,
            system_prompt=system,
            temperature=0.5,
            max_tokens=3000,
        )
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
            cleaned = re.sub(r"```$", "", cleaned).strip()
        m = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if m:
            cleaned = m.group(0)
        parsed = json.loads(cleaned)
        parsed_type = parsed.get("type", "question")

        if parsed_type == "delegate":
            # Build a confirmation preview — nothing is created until the user
            # confirms which sub-tasks to assign via POST /assistant/delegate.
            try:
                delegate_params, generated_sub_tasks, preview_error = await _build_delegate_preview(
                    parsed, db, org_id
                )
                if preview_error:
                    return AskResponse(
                        type="answer",
                        answer=preview_error,
                        session_id=request.session_id,
                    )
                answer_text = parsed.get("answer") or (
                    f"I can assign **\"{delegate_params['title']}\"** as a "
                    f"{'goal' if delegate_params['item_type'] == 'goal' else 'task'}"
                    f"{' and goal' if delegate_params['item_type'] == 'both' else ''} to "
                    f"**{delegate_params['assignee_name']}**."
                )
                return AskResponse(
                    type="delegate_preview",
                    answer=answer_text,
                    session_id=request.session_id,
                    delegate_params=delegate_params,
                    generated_sub_tasks=generated_sub_tasks,
                )
            except Exception as e:
                logger.warning(f"delegate from ask failed: {e}")
                return AskResponse(
                    type="answer",
                    answer=f"I couldn't create that task right now. The system said: {e}. Want to try again?",
                    session_id=request.session_id,
                )

        if parsed_type == "meeting_booking":
            bp = parsed.get("booking_params") or {}
            # Resolve @mentions from the original message
            mention_emails = resolve_mentions(text, db, org_id) if db is not None and org_id else []
            if mention_emails:
                if "attendee_names" not in bp or not bp["attendee_names"]:
                    # Map emails back to names
                    members = list(db.org_chart_members.find({"organization_id": org_id, "email": {"$in": mention_emails}}))
                    bp["attendee_names"] = [m.get("full_name", m["email"]) for m in members]

            try:
                booking_result = await handle_meeting_booking(bp, db, org_id, ctx.user_email or "")
                if booking_result.get("error"):
                    return AskResponse(
                        type="answer",
                        answer=f"I couldn't book the meeting: {booking_result['error']}",
                        session_id=request.session_id,
                    )

                bp["attendee_emails"] = booking_result.get("attendees", [])
                bp["available_slots"] = booking_result.get("available_slots")
                bp["booking_result"] = booking_result

                if booking_result.get("booked"):
                    slot = booking_result.get("slot", {})
                    time_str = slot.get("start", "")
                    slot_date = slot.get("date", "") or bp.get("date", "")
                    count = booking_result.get("count", 1)
                    recurring_note = f" — {count} occurrences" if count and count > 1 else ""
                    answer_text = parsed.get("answer") or (
                        f"✅ Meeting **\"{booking_result['title']}\"** booked "
                        f"on {slot_date} at {time_str}{recurring_note} "
                        f"with {len(booking_result.get('attendees', []))} attendee(s). "
                        "Everyone will get a calendar invite."
                    )
                    return AskResponse(
                        type="answer",
                        answer=answer_text,
                        booking_params=BookingParams(**bp) if bp else None,
                        session_id=request.session_id,
                    )

                # Not booked — return available slots
                slots = booking_result.get("available_slots", [])
                if not slots:
                    answer_text = booking_result.get("message", "No available slots on that date.")
                else:
                    slot_lines = []
                    for slot in slots[:5]:
                        s = slot.get("start", "")
                        e = slot.get("end", "")
                        d = slot.get("date", "")
                        label = f"{d} {s} – {e}" if d else f"{s} – {e}"
                        slot_lines.append(f"- {label}")
                    answer_text = booking_result.get("message", "Available slots:") + "\n" + "\n".join(slot_lines[:5])
                    if len(slots) > 5:
                        answer_text += f"\n... and {len(slots) - 5} more"

                return AskResponse(
                    type="meeting_booking",
                    answer=answer_text,
                    booking_params=BookingParams(**bp) if bp else None,
                    session_id=request.session_id,
                )
            except Exception as e:
                logger.warning(f"meeting_booking failed: {e}")
                return AskResponse(
                    type="answer",
                    answer=f"I tried to check availability but something went wrong: {e}. Maybe try again?",
                    session_id=request.session_id,
                )

        if parsed_type in ("meeting_reschedule", "meeting_cancel"):
            mt = parsed.get("meeting") or {}
            try:
                if parsed_type == "meeting_cancel":
                    result = await _cancel_meeting(db, org_id, mt)
                    if result.get("error"):
                        return AskResponse(type="answer", answer=result["error"], session_id=request.session_id)
                    return AskResponse(
                        type="answer",
                        answer=f"✅ Cancelled meeting **\"{result['title']}\"**.",
                        session_id=request.session_id,
                    )

                # Reschedule
                new_params = {
                    "date": mt.get("date"),
                    "date_start": mt.get("date_start"),
                    "date_end": mt.get("date_end"),
                    "preferred_time": mt.get("preferred_time"),
                    "duration_minutes": mt.get("duration_minutes", 60),
                    "title": mt.get("title", "Meeting"),
                    "description": mt.get("description", ""),
                    "auto": bool(mt.get("auto", False)),
                }
                existing = await _find_meeting_by_title(db, org_id, mt.get("title", ""))
                if existing and existing.get("attendees"):
                    new_params["attendee_names"] = existing["attendees"]

                booking_result = await handle_meeting_booking(new_params, db, org_id, ctx.user_email or "")
                if booking_result.get("error"):
                    return AskResponse(
                        type="answer",
                        answer=f"I couldn't reschedule: {booking_result['error']}",
                        session_id=request.session_id,
                    )
                if booking_result.get("booked"):
                    if existing:
                        await _cancel_meeting(db, org_id, {"meeting_id": str(existing["_id"])})
                    slot = booking_result.get("slot", {})
                    return AskResponse(
                        type="answer",
                        answer=f"✅ Rescheduled **\"{booking_result['title']}\"** to {slot.get('date', '')} at {slot.get('start', '')}.",
                        session_id=request.session_id,
                    )
                return AskResponse(
                    type="meeting_booking",
                    answer=booking_result.get("message", "Here are available slots:"),
                    booking_params=BookingParams(
                        attendee_names=new_params.get("attendee_names", []),
                        date=new_params.get("date"),
                        date_start=new_params.get("date_start"),
                        date_end=new_params.get("date_end"),
                        preferred_time=new_params.get("preferred_time"),
                        duration_minutes=new_params.get("duration_minutes", 60),
                        title=new_params.get("title"),
                        available_slots=booking_result.get("available_slots"),
                    ),
                    session_id=request.session_id,
                )
            except Exception as e:
                logger.warning(f"{parsed_type} failed: {e}")
                return AskResponse(
                    type="answer",
                    answer="I couldn't do that right now. Please try again.",
                    session_id=request.session_id,
                )

        if parsed_type == "briefing":
            answer_text = (parsed.get("answer") or "").strip()
            if not answer_text:
                return AskResponse(**fallback_question)
            missing_data = parsed.get("missing_data")
            if missing_data and not isinstance(missing_data, dict):
                missing_data = None
            suggestions = parsed.get("suggestions")
            if suggestions and not isinstance(suggestions, list):
                suggestions = None
            action_items = parsed.get("action_items")
            if action_items and not isinstance(action_items, list):
                action_items = None
            asyncio.create_task(
                _store_session_insight(db, org_id, request.session_id, answer_text, user_id=user_id, user_email=user_email)
            )
            return AskResponse(
                type="briefing",
                answer=answer_text,
                follow_up=parsed.get("follow_up"),
                missing_data=missing_data,
                suggestions=suggestions,
                action_items=action_items,
                session_id=request.session_id,
            )

        if parsed_type == "answer":
            answer_text = (parsed.get("answer") or "").strip()
            if not answer_text:
                return AskResponse(**fallback_question)
            action_items = parsed.get("action_items")
            if action_items and not isinstance(action_items, list):
                action_items = None
            missing_data = parsed.get("missing_data")
            if missing_data and not isinstance(missing_data, dict):
                missing_data = None
            suggestions = parsed.get("suggestions")
            if suggestions and not isinstance(suggestions, list):
                suggestions = None
            asyncio.create_task(
                _store_session_insight(db, org_id, request.session_id, answer_text, user_id=user_id, user_email=user_email)
            )
            confirmation = parsed.get("confirmation")
            if confirmation and isinstance(confirmation, dict) and confirmation.get("status") == "done":
                asyncio.create_task(
                    _confirm_insight_by_summary(db, org_id, confirmation.get("insight_summary", ""), user_id=user_id)
                )
            return AskResponse(
                type="answer",
                answer=answer_text,
                follow_up=parsed.get("follow_up"),
                action_items=action_items,
                missing_data=missing_data,
                confirmation=confirmation if isinstance(confirmation, dict) else None,
                suggestions=suggestions,
                session_id=request.session_id,
            )
        else:
            q = parsed.get("question", {})
            q.setdefault("id", f"q_{uuid.uuid4().hex[:6]}")
            q.setdefault("allow_custom", True)
            q.setdefault("options", [{"value": "tell_me_more", "label": "Tell me more"}])
            q_bp = None
            if parsed.get("booking_params"):
                try:
                    q_bp = BookingParams(**parsed["booking_params"])
                except Exception:
                    q_bp = None
            return AskResponse(
                type="question",
                question=q,
                booking_params=q_bp,
                session_id=request.session_id,
            )
    except Exception as e:
        logger.warning(f"smart_ask failed: {e}")
        # If AI responded with plain text (not JSON), use it as the answer
        try:
            if raw and raw.strip():
                text = raw.strip()
                if text.startswith("```"):
                    text = re.sub(r"^```(?:json)?", "", text).strip()
                    text = re.sub(r"```$", "", text).strip()
                if len(text) > 10 and not text.startswith("{"):
                    return AskResponse(type="answer", answer=text, session_id=request.session_id)
        except Exception:
            pass
        return AskResponse(**fallback_question)


_STREAM_ANSWER_KEY_RE = re.compile(r'"answer"\s*:\s*"')
_STREAM_ESCAPES = {"n": "\n", "t": "\t", '"': '"', "\\": "\\", "r": "\r", "/": "/"}


def _extract_streaming_answer_delta(buf: str, emitted_len: int) -> tuple[str, int]:
    """Best-effort incremental extraction of the `answer` string value out of a
    partially-streamed JSON blob, so the frontend can show clean typed text
    instead of raw JSON syntax. Only fires once the model has started writing
    a quoted "answer" value (i.e. not for type=question, where answer is null).
    Authoritative text still comes from the final parsed JSON — this is purely
    for the live typewriter effect."""
    key_match = _STREAM_ANSWER_KEY_RE.search(buf)
    if not key_match:
        return "", emitted_len

    out: list[str] = []
    i = key_match.end()
    n = len(buf)
    while i < n:
        ch = buf[i]
        if ch == "\\":
            if i + 1 >= n:
                break  # trailing backslash — incomplete escape, wait for more tokens
            unescaped = _STREAM_ESCAPES.get(buf[i + 1])
            if unescaped is None:
                break  # unicode escape or unknown — stop live extraction here
            out.append(unescaped)
            i += 2
            continue
        if ch == '"':
            break  # unescaped quote = end of the answer string value
        out.append(ch)
        i += 1

    extracted = "".join(out)
    if len(extracted) <= emitted_len:
        return "", emitted_len
    return extracted[emitted_len:], len(extracted)


@router.post("/ask-stream")
async def ask_stream(request: AskRequest, user: dict = Depends(get_current_user_optional)):
    """Streaming version of smart_ask — yields SSR tokens as the AI generates them."""
    text = (request.message or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="message is required")

    user_id, user_email = _resolve_identity(user)
    ctx = request.context or ChatContext()
    if not ctx.user_email and user_email:
        ctx.user_email = user_email
    org_id = ctx.organization_id
    db = get_database()

    session_context = dict(request.session_context or {})
    det = await _try_deterministic_booking(text, session_context, db, org_id, ctx.user_email or "")
    if det:

        async def det_stream():
            yield f"event: metadata\ndata: {json.dumps(det)}\n\n"
            yield "event: done\ndata: [DONE]\n\n"

        return StreamingResponse(det_stream(), media_type="text/event-stream")
    prompt, system, snap = await _build_ask_prompt(
        text=text,
        ctx=ctx,
        org_id=org_id,
        db=db,
        session_context=session_context,
        conversation_history=request.conversation_history,
        proactive=request.proactive,
        user_id=user_id,
        user_email=user_email,
    )

    async def event_stream():
        from ..core.ai_client import AIClient
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        full_content = ""
        emitted_len = 0
        looks_like_json = None  # None = undetermined, True = JSON envelope, False = plain prose
        client = AIClient()
        try:
            async for token in client.chat_complete_stream(messages, temperature=0.5, max_tokens=3000):
                full_content += token
                if looks_like_json is None:
                    stripped = full_content.lstrip()
                    if stripped:
                        looks_like_json = stripped.startswith("{") or stripped.startswith("```")
                if looks_like_json:
                    delta, emitted_len = _extract_streaming_answer_delta(full_content, emitted_len)
                    if delta:
                        yield f"data: {json.dumps({'token': delta})}\n\n"
                elif looks_like_json is False:
                    # Model ignored the JSON envelope and replied in plain prose —
                    # there's no wrapper to strip, so stream it straight through.
                    yield f"data: {json.dumps({'token': token})}\n\n"
        except Exception as e:
            logger.warning(f"ask_stream: AI streaming failed: {e}")
            yield f"data: {json.dumps({'token': f'I encountered an error: {e}'})}\n\n"
            yield "event: done\ndata: [DONE]\n\n"
            return

        # Parse the full JSON response
        cleaned = full_content.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
            cleaned = re.sub(r"```$", "", cleaned).strip()
        m = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if m:
            cleaned = m.group(0)

        metadata = {
            "type": "answer",
            "follow_up": None,
            "action_items": None,
            "missing_data": None,
            "confirmation": None,
            "suggestions": None,
            "delegate_params": None,
            "generated_sub_tasks": None,
            "booking_params": None,
        }
        try:
            parsed = json.loads(cleaned)
            parsed_type = parsed.get("type", "answer")
            metadata["type"] = parsed_type
            metadata["follow_up"] = parsed.get("follow_up")
            if parsed_type == "answer":
                answer_text = (parsed.get("answer") or "").strip()
                if answer_text:
                    metadata["answer"] = answer_text
                action_items = parsed.get("action_items")
                if action_items and isinstance(action_items, list):
                    metadata["action_items"] = action_items
                missing_data = parsed.get("missing_data")
                if missing_data and isinstance(missing_data, dict):
                    metadata["missing_data"] = missing_data
                confirmation = parsed.get("confirmation")
                if confirmation and isinstance(confirmation, dict):
                    metadata["confirmation"] = confirmation
                suggestions = parsed.get("suggestions")
                if suggestions and isinstance(suggestions, list):
                    metadata["suggestions"] = suggestions
            elif parsed_type == "briefing":
                answer_text = (parsed.get("answer") or "").strip()
                if answer_text:
                    metadata["answer"] = answer_text
                missing_data = parsed.get("missing_data")
                if missing_data and isinstance(missing_data, dict):
                    metadata["missing_data"] = missing_data
                suggestions = parsed.get("suggestions")
                if suggestions and isinstance(suggestions, list):
                    metadata["suggestions"] = suggestions
                action_items = parsed.get("action_items")
                if action_items and isinstance(action_items, list):
                    metadata["action_items"] = action_items
            elif parsed_type == "question":
                q = parsed.get("question", {})
                q.setdefault("id", f"q_{uuid.uuid4().hex[:6]}")
                q.setdefault("allow_custom", True)
                q.setdefault("options", [{"value": "tell_me_more", "label": "Tell me more"}])
                metadata["question"] = q
                if parsed.get("booking_params"):
                    try:
                        metadata["booking_params"] = BookingParams(**parsed["booking_params"]).model_dump()
                    except Exception:
                        metadata["booking_params"] = None
            elif parsed_type == "delegate":
                try:
                    delegate_params, generated_sub_tasks, preview_error = await _build_delegate_preview(
                        parsed, db, org_id
                    )
                    if preview_error:
                        metadata["type"] = "answer"
                        metadata["answer"] = preview_error
                    else:
                        answer_text = parsed.get("answer") or (
                            f"I can assign **\"{delegate_params['title']}\"** as a "
                            f"{'goal' if delegate_params['item_type'] == 'goal' else 'task'}"
                            f"{' and goal' if delegate_params['item_type'] == 'both' else ''} to "
                            f"**{delegate_params['assignee_name']}**."
                        )
                        metadata["type"] = "delegate_preview"
                        metadata["answer"] = answer_text
                        metadata["delegate_params"] = delegate_params
                        metadata["generated_sub_tasks"] = generated_sub_tasks
                except Exception as e:
                    logger.warning(f"ask_stream: delegate failed: {e}")
                    metadata["type"] = "answer"
                    metadata["answer"] = f"I couldn't create that task right now. The system said: {e}. Want to try again?"
            elif parsed_type in ("meeting_booking", "meeting_reschedule", "meeting_cancel"):
                try:
                    if parsed_type == "meeting_cancel":
                        mt = parsed.get("meeting") or {}
                        result = await _cancel_meeting(db, org_id, mt)
                        metadata["type"] = "answer"
                        metadata["answer"] = result.get("error") or f"✅ Cancelled meeting **\"{result.get('title', '')}\"**."
                    elif parsed_type == "meeting_reschedule":
                        mt = parsed.get("meeting") or {}
                        new_params = {
                            "date": mt.get("date"),
                            "date_start": mt.get("date_start"),
                            "date_end": mt.get("date_end"),
                            "preferred_time": mt.get("preferred_time"),
                            "duration_minutes": mt.get("duration_minutes", 60),
                            "title": mt.get("title", "Meeting"),
                            "description": mt.get("description", ""),
                            "auto": bool(mt.get("auto", False)),
                        }
                        existing = await _find_meeting_by_title(db, org_id, mt.get("title", ""))
                        if existing and existing.get("attendees"):
                            new_params["attendee_names"] = existing["attendees"]
                        booking_result = await handle_meeting_booking(new_params, db, org_id, ctx.user_email or "")
                        if booking_result.get("error"):
                            metadata["type"] = "answer"
                            metadata["answer"] = f"I couldn't reschedule: {booking_result['error']}"
                        elif booking_result.get("booked"):
                            if existing:
                                await _cancel_meeting(db, org_id, {"meeting_id": str(existing["_id"])})
                            slot = booking_result.get("slot", {})
                            metadata["type"] = "answer"
                            metadata["answer"] = f"✅ Rescheduled **\"{booking_result['title']}\"** to {slot.get('date', '')} at {slot.get('start', '')}."
                        else:
                            metadata["type"] = "meeting_booking"
                            metadata["answer"] = booking_result.get("message", "Here are available slots:")
                            metadata["booking_params"] = {
                                "attendee_names": new_params.get("attendee_names", []),
                                "date": new_params.get("date"),
                                "date_start": new_params.get("date_start"),
                                "date_end": new_params.get("date_end"),
                                "preferred_time": new_params.get("preferred_time"),
                                "duration_minutes": new_params.get("duration_minutes", 60),
                                "title": new_params.get("title"),
                                "available_slots": booking_result.get("available_slots"),
                            }
                    else:
                        bp = parsed.get("booking_params") or {}
                        mention_emails = resolve_mentions(text, db, org_id) if db is not None and org_id else []
                        if mention_emails and not bp.get("attendee_names"):
                            members = list(db.org_chart_members.find({"organization_id": org_id, "email": {"$in": mention_emails}}))
                            bp["attendee_names"] = [m.get("full_name", m["email"]) for m in members]
                        booking_result = await handle_meeting_booking(bp, db, org_id, ctx.user_email or "")
                        if booking_result.get("error"):
                            metadata["type"] = "answer"
                            metadata["answer"] = f"I couldn't book the meeting: {booking_result['error']}"
                        else:
                            bp["attendee_emails"] = booking_result.get("attendees", [])
                            bp["available_slots"] = booking_result.get("available_slots")
                            bp["booking_result"] = booking_result
                            metadata["booking_params"] = BookingParams(**bp).model_dump()
                            if booking_result.get("booked"):
                                slot = booking_result.get("slot", {})
                                count = booking_result.get("count", 1)
                                recurring_note = f" — {count} occurrences" if count and count > 1 else ""
                                metadata["type"] = "answer"
                                metadata["answer"] = parsed.get("answer") or (
                                    f"✅ Meeting **\"{booking_result['title']}\"** booked on {slot.get('date', '')} at "
                                    f"{slot.get('start', '')}{recurring_note} with {len(booking_result.get('attendees', []))} attendee(s). "
                                    "Everyone will get a calendar invite."
                                )
                            else:
                                metadata["type"] = "meeting_booking"
                                metadata["answer"] = booking_result.get("message", "Available slots:")
                except Exception as e:
                    logger.warning(f"ask_stream: meeting failed: {e}")
                    metadata["type"] = "answer"
                    metadata["answer"] = f"I couldn't do that right now: {e}. Maybe try again?"
        except json.JSONDecodeError:
            logger.warning("ask_stream: could not parse AI output as JSON, using raw text as answer")
            metadata["type"] = "answer"
            metadata["answer"] = full_content.strip()

        # Fire-and-forget insight storage for answer type
        if metadata["type"] == "answer" and metadata.get("answer"):
            asyncio.create_task(
                _store_session_insight(db, org_id, request.session_id, metadata["answer"], user_id=user_id, user_email=user_email)
            )
        # Handle confirmation
        if metadata.get("confirmation") and metadata["confirmation"].get("status") == "done":
            asyncio.create_task(
                _confirm_insight_by_summary(db, org_id, metadata["confirmation"].get("insight_summary", ""), user_id=user_id)
            )

        yield f"event: metadata\ndata: {json.dumps(metadata)}\n\n"
        yield "event: done\ndata: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/bulk-create-tasks")
async def bulk_create_tasks(request: BulkCreateTasksRequest):
    """Create multiple tasks from a list of action items extracted by the AI."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = request.organization_id
    if not org_id:
        raise HTTPException(status_code=400, detail="organization_id is required")

    created = []
    failed = []
    now = datetime.utcnow()

    for item in request.action_items:
        title = (item.title or "").strip()
        if not title:
            failed.append({"title": "", "error": "Empty title"})
            continue
        try:
            from ..core.identity import canonical_assignee_payload

            emp = None
            if item.assignee_name or item.assignee_email:
                emp = _resolve_assignee(db, org_id, item.assignee_email, item.assignee_name)
            raw_id = str(emp["_id"]) if emp else (item.assignee_email or None)
            raw_email = (emp.get("email") if emp else None) or item.assignee_email
            canon = canonical_assignee_payload(db, org_id, assignee_id=raw_id, assignee_email=raw_email, assignee_name=item.assignee_name)
            assignee_emails = canon["assignee_id"]
            assignee_email = assignee_emails[0] if assignee_emails else None
            assignee_name = canon["assignee_name"][0] if canon["assignee_name"] else item.assignee_name

            task_doc = {
                "title": title,
                "description": item.description or "",
                "priority": item.priority or "medium",
                "status": "pending",
                "organization_id": org_id,
                "assignee_id": assignee_emails,
                "assignee_email": assignee_email,
                "assignee_name": canon["assignee_name"] or [assignee_name] if assignee_name else [],
                "source": "ai_action_item",
                "created_at": now,
                "updated_at": now,
            }
            tr = db.tasks.insert_one(task_doc)
            task_doc["_id"] = str(tr.inserted_id)
            created.append(task_doc)

            if assignee_email:
                try:
                    from .tasks import sync_task_to_provider
                    asyncio.create_task(sync_task_to_provider(db, task_doc, org_id))
                except Exception as e:
                    logger.warning(f"Provider sync failed for action item: {e}")

            if assignee_email:
                try:
                    asyncio.create_task(create_notification(
                        user_id=assignee_email, org_id=org_id, type="task_assigned",
                        title="New Task from AI Analysis",
                        message=f"Action item created: {title}",
                        link=f"/tasks/{task_doc['_id']}",
                        email=assignee_email,
                    ))
                except Exception as e:
                    logger.warning(f"Notification failed for action item: {e}")
        except Exception as e:
            logger.warning(f"Failed to create action item '{title}': {e}")
            failed.append({"title": title, "error": str(e)})

    try:
        asyncio.create_task(ws_manager.broadcast_to_organization(
            {"type": "tasks_bulk_created", "data": {"created": len(created), "failed": len(failed)}}, org_id
        ))
    except Exception as e:
        logger.warning(f"WS broadcast failed for bulk create: {e}")

    return {
        "success": True,
        "created_count": len(created),
        "failed_count": len(failed),
        "created": [{"id": t["_id"], "title": t["title"]} for t in created],
        "failed": failed,
    }


class ReAnalyzeRequest(BaseModel):
    file_id: str
    original_message: str
    session_id: str | None = None
    organization_id: str
    context: ChatContext | None = None
    conversation_history: list[dict[str, str]] | None = None


@router.post("/re-analyze", response_model=AskResponse)
async def re_analyze(request: ReAnalyzeRequest):
    """Re-run analysis after a missing-data file was uploaded."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    doc = db.documents.find_one({"file_id": request.file_id})
    if not doc:
        raise HTTPException(status_code=404, detail="File not found")

    file_text = doc.get("text", "")[:10000]

    # Build a new AskRequest with the file text injected into session context
    history = (request.conversation_history or [])[-8:]
    ask_req = AskRequest(
        message=request.original_message,
        session_id=request.session_id,
        session_context={"file_text_preview": file_text},
        context=request.context,
        conversation_history=history,
        proactive=False,
    )
    return await smart_ask(ask_req)


class GenerateInsightsRequest(BaseModel):
    organization_id: str


@router.post("/generate-insights")
async def generate_insights(request: GenerateInsightsRequest):
    """Analyze uploaded documents and return proactive insight cards."""
    db = get_database()
    if db is None:
        return {"insights": []}

    org_id = request.organization_id
    if not org_id:
        return {"insights": []}

    try:
        # Fetch recent documents with raw text for insight generation
        raw_docs = list(
            db.documents.find({"org_id": org_id})
            .sort("created_at", -1)
            .limit(6)
        )
        if not raw_docs:
            return {"insights": []}

        doc_block_parts = []
        for d in raw_docs:
            line = f"- {d.get('filename','?')}"
            text = (d.get('text') or d.get('summary') or '')[:500]
            if text:
                line += f": {text}"
            doc_block_parts.append(line)
        doc_block = "\n".join(doc_block_parts)

        prompt = f"""You are analyzing documents for a business. Identify 1-3 valuable, specific insights that would be useful to the business owner.

Documents:
{doc_block}

For each insight, look for:
- TRENDS — positive or negative changes over time (e.g., revenue growth, cost increase)
- ANOMALIES — unusual data points or patterns (e.g., a sudden spike in expenses)
- GAPS — missing data or areas where info would be valuable (e.g., no sales pipeline data)
- BENCHMARKS — how the data compares to typical industry metrics
- OPPORTUNITIES — clear actions the owner could take based on the data

Return ONLY valid JSON array (no markdown, no code fences):
[{{"title":"short actionable title","explanation":"1-2 sentence explanation","type":"trend|anomaly|gap|benchmark|opportunity","suggested_goal_title":"goal title or null if not applicable","suggested_department":"department name or null"}}]

If no meaningful insights found, return []"""

        from ..core.ai_client import get_ai_response
        raw = await get_ai_response(prompt, temperature=0.4, max_tokens=1200)
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
            cleaned = re.sub(r"```$", "", cleaned).strip()
        insights = json.loads(cleaned)
        if not isinstance(insights, list):
            insights = []
        insights = insights[:5]
        return {"insights": insights}
    except Exception as e:
        logger.warning(f"generate_insights failed: {e}")
        return {"insights": []}


# ---------------------------------------------------------------------------
# Session management
# ---------------------------------------------------------------------------

class SessionCreateRequest(BaseModel):
    organization_id: str
    title: str | None = None


class SessionUpdateRequest(BaseModel):
    title: str | None = None
    context: dict[str, str] | None = None


@router.post("/sessions")
async def create_session(request: SessionCreateRequest, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    user_id = getattr(current_user, 'id', None) if current_user else None
    now = datetime.utcnow()
    session = {
        "title": request.title or "New Chat",
        "organization_id": request.organization_id,
        "user_id": user_id,
        "messages": [],
        "context": {},
        "created_at": now,
        "updated_at": now,
    }
    result = db.assistant_sessions.insert_one(session)
    session["_id"] = str(result.inserted_id)
    return session


@router.get("/sessions")
async def list_sessions(organization_id: str, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    user_id = getattr(current_user, 'id', None) if current_user else None
    query = {"organization_id": organization_id}
    if user_id:
        query["user_id"] = user_id
    sessions = list(
        db.assistant_sessions.find(query)
        .sort("updated_at", -1)
        .limit(50)
    )
    for s in sessions:
        s["_id"] = str(s["_id"])
    return {"sessions": sessions}


def _get_session_or_404(db, session_id: str, user_id: str | None = None):
    try:
        query: dict[str, Any] = {"_id": ObjectId(session_id)}
        if user_id:
            query["user_id"] = user_id
        s = db.assistant_sessions.find_one(query)
    except Exception:
        raise HTTPException(status_code=404, detail="Session not found")
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    return s


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    user_id = getattr(current_user, 'id', None) if current_user else None
    s = _get_session_or_404(db, session_id, user_id)
    s["_id"] = str(s["_id"])
    return s


@router.put("/sessions/{session_id}")
async def update_session(session_id: str, request: SessionUpdateRequest, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    user_id = getattr(current_user, 'id', None) if current_user else None
    _get_session_or_404(db, session_id, user_id)
    update = {"updated_at": datetime.utcnow()}
    if request.title is not None:
        update["title"] = request.title
    if request.context is not None:
        update["context"] = request.context
    try:
        db.assistant_sessions.update_one(
            {"_id": ObjectId(session_id)},
            {"$set": update},
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not update session: {e}")
    return {"success": True}


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    user_id = getattr(current_user, 'id', None) if current_user else None
    _get_session_or_404(db, session_id, user_id)
    try:
        db.assistant_sessions.delete_one({"_id": ObjectId(session_id)})
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not delete session: {e}")
    return {"success": True}


class AddMessageRequest(BaseModel):
    message: dict[str, Any]


@router.post("/sessions/{session_id}/messages")
async def add_session_message(session_id: str, request: AddMessageRequest, current_user = Depends(get_current_user_optional)):
    """Append a message to a session's message history."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    user_id = getattr(current_user, 'id', None) if current_user else None
    _get_session_or_404(db, session_id, user_id)
    try:
        db.assistant_sessions.update_one(
            {"_id": ObjectId(session_id)},
            {
                "$push": {"messages": request.message},
                "$set": {"updated_at": datetime.utcnow()},
            },
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not add message: {e}")
    return {"success": True}
