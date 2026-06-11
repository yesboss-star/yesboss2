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
from typing import Optional, List, Dict, Any

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Depends
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
    user_email: Optional[str] = None
    organization_id: Optional[str] = None
    organization_name: Optional[str] = None
    document_summary: Optional[str] = ""
    role: Optional[str] = "owner"


class IntentRequest(BaseModel):
    message: str
    context: Optional[ChatContext] = None
    conversation_history: Optional[List[Dict[str, str]]] = None


class CounterQuestionRequest(BaseModel):
    message: str
    intent: str  # "action" | "delegate" | "goal_creation" | "hiring" | "task_creation"
    gathered: Dict[str, Any] = Field(default_factory=dict)
    missing: Optional[List[str]] = None
    context: Optional[ChatContext] = None


class CounterQuestionResponse(BaseModel):
    question: str
    field_id: str
    field_type: str = "text"  # text | select | person | number | date
    options: Optional[List[Dict[str, str]]] = None
    emoji: Optional[str] = None
    progress: Optional[str] = None  # e.g. "Step 1 of 3"


class ChatRequest(BaseModel):
    message: str
    context: Optional[ChatContext] = None
    conversation_history: Optional[List[Dict[str, str]]] = None
    provider: Optional[str] = None


class DelegateRequest(BaseModel):
    title: str
    description: Optional[str] = None
    assignee_id: Optional[str] = None  # employee _id OR email
    assignee_name: Optional[str] = None
    priority: str = "medium"
    timeline: Optional[str] = None
    due_date: Optional[str] = None
    department: Optional[str] = None
    context: Optional[ChatContext] = None
    create_tasks: bool = True
    task_count: int = 3


class PersonSearchRequest(BaseModel):
    query: str
    organization_id: Optional[str] = None


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


def _heuristic_intent(text: str) -> Dict[str, Any]:
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
            max_tokens=120,
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


def _next_field(intent: str, gathered: Dict[str, Any]):
    fields = DELEGATE_FIELDS if intent == "delegate" else ACTION_FIELDS
    for fid, q, ftype, emoji in fields:
        if not gathered.get(fid):
            return fid, q, ftype, emoji
    return None, None, None, None


def _detect_priority_from_text(text: str) -> Optional[str]:
    t = text.lower()
    if any(w in t for w in ("urgent", "asap", "drop everything", "critical", "tomorrow", "today", "🔥", "right now")):
        return "high"
    if any(w in t for w in ("this week", "soon", "by friday", "next week", "by next", "🟡")):
        return "medium"
    if any(w in t for w in ("whenever", "no rush", "low priority", "low-priority", "🟢", "backlog")):
        return "low"
    return None


def _parse_smart_assignment(text: str) -> Dict[str, Any]:
    """Extract structured fields from a free-form user reply.

    Examples:
      "high" / "🔴" → priority
      "Q4 hiring push" → title
      "Hire 2 senior engineers by Dec 15" → description
      "friday" / "in 2 weeks" → due_date / timeline
      "Sarah" / "sarah@company.com" → assignee_name
    """
    out: Dict[str, Any] = {}
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
    q = re.escape(query.strip())
    filter = {
        "organization_id": org_id,
        "$or": [
            {"full_name": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}},
            {"full_name": {"$regex": r"\b" + q, "$options": "i"}},
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
    query: Dict[str, Any] = {"organization_id": org_id}
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


def _resolve_assignee(db, org_id: str, assignee_id: Optional[str], assignee_name: Optional[str]):
    if assignee_id:
        try:
            emp = db.employees.find_one({"_id": ObjectId(assignee_id), "organization_id": org_id})
        except Exception:
            emp = None
        if emp:
            return emp
    if assignee_name:
        return _find_employee(db, org_id, assignee_name)
    return None


@router.post("/delegate")
async def delegate_task(request: DelegateRequest):
    """Create a goal AND a task assigned to the named team member.

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

    emp = _resolve_assignee(db, org_id, request.assignee_id, request.assignee_name)
    if not emp:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Couldn't find '{request.assignee_name or request.assignee_id}' in your team. "
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
            department = emp.get("department") or "General"

    now = datetime.utcnow()

    # 1) Goal
    goal_doc = {
        "title": title,
        "description": request.description,
        "priority": request.priority or "medium",
        "timeline": request.timeline,
        "department": department,
        "assignee_id": str(emp["_id"]),
        "assignee_name": emp.get("full_name") or emp.get("email"),
        "assignee_email": emp.get("email"),
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

    # 2) Task (the actual deliverable that lands on the assignee's dashboard)
    task_doc = {
        "title": title,
        "description": request.description,
        "priority": request.priority or "medium",
        "status": "pending",
        "goal_id": goal_id,
        "assignee_id": str(emp["_id"]),
        "assignee_email": emp.get("email"),
        "department": department,
        "due_date": request.due_date,
        "organization_id": org_id,
        "created_by": (request.context.user_email if request.context else None),
        "source": "assistant_delegation",
        "created_at": now,
        "updated_at": now,
    }
    task_result = db.tasks.insert_one(task_doc)
    task_id = str(task_result.inserted_id)
    task_doc["_id"] = task_id

    # 3) Optional sub-tasks (AI-generated)
    sub_tasks: List[Dict[str, Any]] = []
    if request.create_tasks:
        try:
            from ..core.intelligence import generate_tasks_from_goal
            generated = await generate_tasks_from_goal(
                goal_title=title,
                goal_description=request.description or "",
                count=max(1, min(request.task_count, 8)),
            )
            for st in (generated or [])[: request.task_count]:
                sub_doc = {
                    "title": st.get("title", "Sub-task"),
                    "description": st.get("description", ""),
                    "priority": st.get("priority", "medium"),
                    "status": "pending",
                    "goal_id": goal_id,
                    "parent_task_id": task_id,
                    "assignee_id": str(emp["_id"]),
                    "assignee_email": emp.get("email"),
                    "department": department,
                    "due_date": request.due_date,
                    "organization_id": org_id,
                    "source": "assistant_delegation_subtask",
                    "created_at": now,
                    "updated_at": now,
                }
                sr = db.tasks.insert_one(sub_doc)
                sub_doc["_id"] = str(sr.inserted_id)
                sub_tasks.append(sub_doc)
        except Exception as e:
            logger.warning("Sub-task generation failed in delegate: %s", e)

    # 4) Real-time push + notifications
    user_id = (request.context.user_email if request.context else None)
    try:
        asyncio.create_task(ws_manager.broadcast_to_organization(
            {"type": "goal_created", "data": goal_doc}, org_id
        ))
        asyncio.create_task(ws_manager.broadcast_to_organization(
            {"type": "task_created", "data": task_doc}, org_id
        ))
        if emp.get("email"):
            asyncio.create_task(ws_manager.send_personal_message(
                {"type": "task_assigned", "data": task_doc}, emp["email"]
            ))
    except Exception as e:
        logger.warning("WebSocket broadcast failed in delegate: %s", e)

    try:
        # In-app + email notification for the assignee
        assignee_id = str(emp["_id"])
        asyncio.create_task(create_notification(
            user_id=assignee_id, org_id=org_id, type="goal_assigned",
            title="New Goal Assigned", message=f"Goal assigned: {title}",
            link=f"/goals/{goal_id}",
            actor_id=user_id, email=emp.get("email"),
        ))
        asyncio.create_task(create_notification(
            user_id=assignee_id, org_id=org_id, type="task_assigned",
            title="New Task Assigned", message=f"You have been assigned: {title}",
            link=f"/tasks/{task_id}",
            actor_id=user_id, email=emp.get("email"),
        ))
    except Exception as e:
        logger.warning("Notification delivery failed in delegate: %s", e)

    return {
        "success": True,
        "goal": goal_doc,
        "task": task_doc,
        "sub_tasks": sub_tasks,
        "assignee": {
            "id": str(emp["_id"]),
            "name": emp.get("full_name") or emp.get("email"),
            "email": emp.get("email"),
            "role": emp.get("role"),
            "department": emp.get("department"),
        },
    }


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


async def _gather_org_snapshot(db, org_id: str) -> Dict[str, Any]:
    """Collect a small JSON snapshot of everything we know about the org."""
    if db is None or not org_id:
        return {}

    snap: Dict[str, Any] = {}

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
        goals = list(db.goals.find({"organization_id": org_id}).sort("created_at", -1).limit(20))
        for g in goals:
            g["_id"] = str(g["_id"])
        snap["goals"] = {
            "count": len(goals),
            "active": sum(1 for g in goals if g.get("status") == "active"),
            "departments": list({g.get("department") for g in goals if g.get("department")})[:10],
            "titles": [g.get("title") for g in goals[:8]],
        }
    except Exception as e:
        logger.warning("goals snapshot failed: %s", e)
        snap["goals"] = {"count": 0, "active": 0, "departments": [], "titles": []}

    try:
        tasks = list(db.tasks.find({"organization_id": org_id}).limit(50))
        snap["tasks"] = {
            "total": len(tasks),
            "pending": sum(1 for t in tasks if t.get("status") == "pending"),
            "in_progress": sum(1 for t in tasks if t.get("status") == "in_progress"),
            "completed": sum(1 for t in tasks if t.get("status") == "completed"),
            "departments": list({t.get("department") for t in tasks if t.get("department")})[:10],
        }
    except Exception as e:
        logger.warning("tasks snapshot failed: %s", e)
        snap["tasks"] = {"total": 0, "pending": 0, "in_progress": 0, "completed": 0, "departments": []}

    try:
        employees = list(db.employees.find({"organization_id": org_id}).limit(100))
        depts: Dict[str, int] = {}
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

    return snap


class DiagnoseRequest(BaseModel):
    message: str
    context: Optional[ChatContext] = None


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
            max_tokens=600,
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
async def assistant_chat(request: ChatRequest):
    """Intelligent chat. Diagnoses data first; if data is missing, asks for
    specific uploads. If data is partial, gives a partial answer and asks for
    the missing piece. If data is complete, gives a deep, specific answer."""
    text = (request.message or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="message is required")

    context = request.context or ChatContext()
    org_id = context.organization_id

    history = (request.conversation_history or [])[-8:]
    history_block = "\n".join(
        f"{m.get('role', 'user').upper()}: {m.get('content', '')}" for m in history
    ) if history else "(no prior messages)"

    # --- Step 1: Diagnose data ---
    diagnosis: Optional[Dict[str, Any]] = None
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
    snap: Dict[str, Any] = {}
    if db is not None and org_id:
        try:
            snap = await _gather_org_snapshot(db, org_id)
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
                max_tokens=900,
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
    if docs and (docs.get("analyzed_documents") or 0) > 0:
        # Per-document detailed block (small subset, trimmed)
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
                f"Documents analyzed ({docs.get('analyzed_documents', 0)}/{docs.get('total_documents', 0)}):\n"
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
            max_tokens=900,
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


async def _async_snapshot(db, org_id: str) -> Dict[str, Any]:
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

## RESPONSE FORMATS

For answers: {"type":"answer","answer":"your answer here (max 8 lines)","follow_up":"optional 1-line follow-up"}

For questions: {"type":"question","question":{"id":"q_xxx","field_id":"field_name","text":"one clear question","options":[{"value":"opt1","label":"Option 1"},...],"allow_custom":true},"answer":null}

For delegation (when user wants to assign a task to someone AND you have enough context):
{"type":"delegate","assignee_name":"full name of person","assignee_email":"their email if known","title":"short task title (2-8 words)","description":"optional detail about the task","priority":"medium|high|low","answer":"confirmation message to show the user (1-2 sentences)"}"""


class AskRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    session_context: Optional[Dict[str, str]] = None
    context: Optional[ChatContext] = None
    conversation_history: Optional[List[Dict[str, str]]] = None


class AskResponse(BaseModel):
    type: str  # "question" | "answer"
    question: Optional[Dict[str, Any]] = None
    answer: Optional[str] = None
    follow_up: Optional[str] = None
    session_id: Optional[str] = None


@router.post("/ask", response_model=AskResponse)
async def smart_ask(request: AskRequest):
    """Ask a question. Understands intent → checks uploaded docs → answers directly or asks for missing info."""
    text = (request.message or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="message is required")

    ctx = request.context or ChatContext()
    org_id = ctx.organization_id
    db = get_database()

    session_context = dict(request.session_context or {})
    snap: Dict[str, Any] = {}
    if db is not None and org_id:
        try:
            snap = await _gather_org_snapshot(db, org_id)
        except Exception as e:
            logger.warning("ask: snapshot failed: %s", e)

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
    if docs and (docs.get("analyzed_documents") or 0) > 0:
        doc_block = f"Uploaded documents ({docs.get('analyzed_documents', 0)} analyzed):\n"
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

    goals_block = ""
    if goals.get("titles"):
        goals_block = f"Goals ({goals.get('active', 0)} active of {goals.get('count', 0)}):\n" + "\n".join(f"- {t}" for t in goals["titles"][:5]) + "\n"

    tasks_block = ""
    if tasks.get("total", 0) > 0:
        tasks_block = f"Tasks: {tasks.get('total', 0)} total ({tasks.get('pending', 0)} pending, {tasks.get('in_progress', 0)} in progress)\n"

    emp_block = ""
    if employees.get("count", 0) > 0:
        emp_block = f"Team: {employees['count']} people\n"

    ctx_block = ""
    if session_context:
        ctx_block = "What we already know from this chat:\n" + "\n".join(f"- {k}: {v}" for k, v in session_context.items()) + "\n"

    history = (request.conversation_history or [])[-8:]
    history_block = "\n".join(f"{m.get('role','')}: {m.get('content','')[:300]}" for m in history) if history else ""

    prompt = (
        f"{org_block}\n"
        f"{doc_block}"
        f"{goals_block}"
        f"{tasks_block}"
        f"{emp_block}"
        f"{ctx_block}\n"
        f"Recent chat:\n{history_block}\n\n"
        f"User's message:\n\"{text}\"\n\n"
        "Decide: answer directly or ask one question for missing info."
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
            system_prompt=ASK_SYSTEM,
            temperature=0.5,
            max_tokens=1100,
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
            # Create task via delegate logic
            assignee_name = parsed.get("assignee_name", "").strip()
            task_title = parsed.get("title", "").strip()
            if not task_title or not assignee_name:
                return AskResponse(**fallback_question)
            try:
                delegate_req = DelegateRequest(
                    title=task_title,
                    description=parsed.get("description"),
                    assignee_name=assignee_name,
                    priority=parsed.get("priority", "medium"),
                    create_tasks=True,
                    task_count=3,
                    context=ctx,
                )
                delegate_result = await delegate_task(delegate_req)
                answer_text = parsed.get("answer") or f"✅ Task **\"{task_title}\"** created and assigned to **{assignee_name}**."
                if delegate_result.get("sub_tasks"):
                    answer_text += f"\n\nI also broke it into {len(delegate_result['sub_tasks'])} smaller steps."
                return AskResponse(
                    type="answer",
                    answer=answer_text,
                    session_id=request.session_id,
                )
            except Exception as e:
                logger.warning(f"delegate from ask failed: {e}")
                return AskResponse(
                    type="answer",
                    answer=f"I couldn't create that task right now. The system said: {e}. Want to try again?",
                    session_id=request.session_id,
                )

        if parsed_type == "answer":
            answer_text = (parsed.get("answer") or "").strip()
            if not answer_text:
                return AskResponse(**fallback_question)
            return AskResponse(
                type="answer",
                answer=answer_text,
                follow_up=parsed.get("follow_up"),
                session_id=request.session_id,
            )
        else:
            q = parsed.get("question", {})
            q.setdefault("id", f"q_{uuid.uuid4().hex[:6]}")
            q.setdefault("allow_custom", True)
            q.setdefault("options", [{"value": "tell_me_more", "label": "Tell me more"}])
            return AskResponse(
                type="question",
                question=q,
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


# ---------------------------------------------------------------------------
# Session management
# ---------------------------------------------------------------------------

class SessionCreateRequest(BaseModel):
    organization_id: str
    title: Optional[str] = None


class SessionUpdateRequest(BaseModel):
    title: Optional[str] = None
    context: Optional[Dict[str, str]] = None


@router.post("/sessions")
async def create_session(request: SessionCreateRequest):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    now = datetime.utcnow()
    session = {
        "title": request.title or "New Chat",
        "organization_id": request.organization_id,
        "messages": [],
        "context": {},
        "created_at": now,
        "updated_at": now,
    }
    result = db.assistant_sessions.insert_one(session)
    session["_id"] = str(result.inserted_id)
    return session


@router.get("/sessions")
async def list_sessions(organization_id: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    sessions = list(
        db.assistant_sessions.find({"organization_id": organization_id})
        .sort("updated_at", -1)
        .limit(50)
    )
    for s in sessions:
        s["_id"] = str(s["_id"])
    return {"sessions": sessions}


@router.get("/sessions/{session_id}")
async def get_session(session_id: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    try:
        s = db.assistant_sessions.find_one({"_id": ObjectId(session_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Session not found")
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    s["_id"] = str(s["_id"])
    return s


@router.put("/sessions/{session_id}")
async def update_session(session_id: str, request: SessionUpdateRequest):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
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
async def delete_session(session_id: str):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    try:
        db.assistant_sessions.delete_one({"_id": ObjectId(session_id)})
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not delete session: {e}")
    return {"success": True}


class AddMessageRequest(BaseModel):
    message: Dict[str, Any]


@router.post("/sessions/{session_id}/messages")
async def add_session_message(session_id: str, request: AddMessageRequest):
    """Append a message to a session's message history."""
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
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
