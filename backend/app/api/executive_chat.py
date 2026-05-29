import logging
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
from ..core.database import get_database
from ..dependencies.auth import get_current_user, get_current_user_optional
from ..core.ai_client import get_chat_response

router = APIRouter()
logger = logging.getLogger("yesboss.executive_chat")


def get_user_org_id(user) -> Optional[str]:
    if hasattr(user, 'user_metadata') and user.user_metadata:
        return user.user_metadata.get("organization_id")
    return None


class Message(BaseModel):
    role: str
    content: str
    timestamp: Optional[str] = None


class ChatRequest(BaseModel):
    message: str
    context: Optional[Dict[str, Any]] = None
    history: Optional[List[Message]] = None
    organization_id: Optional[str] = None


class ExpertResponse(BaseModel):
    expert: str
    response: str
    confidence: float
    sources: Optional[List[str]] = None


class ExecutiveResponse(BaseModel):
    message: str
    expert_responses: List[ExpertResponse]
    action_items: Optional[List[str]] = None
    timestamp: str


@router.post("/chat")
async def executive_chat(request: ChatRequest, current_user = Depends(get_current_user_optional)):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = request.organization_id or get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

    org = db.organizations.find_one({"_id": org_id})
    org_name = org.get("name", "Your Organization") if org else "Your Organization"
    org_industry = org.get("industry", "") if org else ""

    goals = list(db.goals.find({"organization_id": org_id}).sort("created_at", -1).limit(20))
    tasks = list(db.tasks.find({"organization_id": org_id}).sort("created_at", -1).limit(30))
    members = list(db.org_chart_members.find({"organization_id": org_id}))

    active_goals = [g for g in goals if g.get("status") == "active"]
    completed_goals = [g for g in goals if g.get("status") == "completed"]

    goal_details = ""
    if goals:
        goal_details = "Goals:\n" + "\n".join([
            f"  {i+1}. \"{g.get('title', 'Untitled')}\" — status: {g.get('status', 'unknown')}, priority: {g.get('priority', 'medium')}, department: {g.get('department', 'N/A')}"
            for i, g in enumerate(goals[:8])
        ])

    task_details = ""
    if tasks:
        task_details = "\nTasks:\n" + "\n".join([
            f"  {i+1}. \"{t.get('title', 'Untitled')}\" — status: {t.get('status', 'pending')}, priority: {t.get('priority', 'medium')}"
            for i, t in enumerate(tasks[:12])
        ])

    member_details = ""
    if members:
        dept_count = {}
        for m in members:
            d = m.get("department", "General")
            dept_count[d] = dept_count.get(d, 0) + 1
        member_details = "\nTeam: " + ", ".join([f"{d}: {c}" for d, c in dept_count.items()])

    context_block = f"""===== BUSINESS DATA =====
Organization: {org_name}
Industry: {org_industry}
Total: {len(goals)} goals, {len(tasks)} tasks, {len(members)} team members
{goal_details}{task_details}{member_details}
========================="""

    conversation_history = []
    if request.history:
        for msg in request.history[-6:]:
            conversation_history.append({"role": msg.role, "content": msg.content})

    system_prompt = (
        f"You are an AI Business Analyst for {org_name}. "
        "Your job is to answer questions using ONLY the business data provided below. "
        "Be direct, specific, and reference actual goal/task names when answering. "
        "If the data doesn't contain the answer, say so clearly.\n\n"
        "FORMAT YOUR RESPONSE LIKE THIS:\n"
        "- Use **bold** for key numbers and names\n"
        "- Use short paragraphs separated by blank lines\n"
        "- Use bullet lists (- ) for multiple items\n"
        "- Use numbered steps (1. ) for sequences\n"
        "- Keep it clean — no walls of text, no long sentences\n"
        "- Max 5-6 lines total unless the user asks for detail"
    )

    user_prompt = f"{context_block}\n\nQuestion: {request.message}"

    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(conversation_history)
    messages.append({"role": "user", "content": user_prompt})

    ai_response = ""
    try:
        ai_response = await get_chat_response(
            messages=messages,
            provider="xai",
            temperature=0.7,
            max_tokens=2000,
        )
    except Exception as e:
        logger.error(f"AI chat failed: {e}")
        ai_response = (
            f"I apologize, but I'm having trouble connecting to my AI engine. "
            f"Here's what I can tell you based on your current data:\n\n"
            f"{goals_summary}\n{tasks_summary}\n{members_summary}\n\n"
            f"Please try your question again in a moment."
        )

    action_items = []
    lines = ai_response.split("\n")
    gathering = False
    for line in lines:
        stripped = line.strip()
        if stripped.lower().startswith(("action item", "recommend", "next step", "suggest")):
            gathering = True
            continue
        if gathering and stripped.startswith("- ") and len(stripped) > 3:
            action_items.append(stripped[2:].strip())
        elif gathering and stripped == "":
            gathering = False
    if not action_items:
        action_items = [
            "Review the insights above",
            "Ask follow-up questions for deeper analysis",
            "Check relevant dashboards for detailed metrics"
        ]

    expert_responses = [ExpertResponse(
        expert="Business Analyst",
        response=ai_response[:400] + ("..." if len(ai_response) > 400 else ""),
        confidence=0.92,
        sources=["Organization Data", "AI Analysis"]
    )]

    return ExecutiveResponse(
        message=ai_response,
        expert_responses=expert_responses,
        action_items=action_items,
        timestamp=datetime.utcnow().isoformat()
    )


@router.get("/experts")
async def get_experts():
    return {
        "experts": [
            {
                "id": "analyst",
                "name": "Business Analyst",
                "description": "Analyzes business data including goals, tasks, team metrics, and provides strategic insights",
                "example_questions": [
                    "What's our overall progress this week?",
                    "Which goals need attention?",
                    "How is team productivity looking?",
                    "What should we prioritize?",
                    "Are we on track for our targets?"
                ]
            }
        ]
    }


@router.get("/history")
async def get_chat_history(
    limit: int = 20,
    current_user = Depends(get_current_user)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

    history = list(db.executive_chat_history.find(
        {"organization_id": org_id}
    ).sort("created_at", -1).limit(limit))

    for item in history:
        item["_id"] = str(item["_id"])

    return {"history": history}


@router.post("/history")
async def save_chat_message(
    message: Message,
    current_user = Depends(get_current_user)
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    org_id = get_user_org_id(current_user)
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")

    user_id = getattr(current_user, 'id', None) or str(current_user) if current_user else None

    message_doc = {
        "organization_id": org_id,
        "user_id": user_id,
        "role": message.role,
        "content": message.content,
        "created_at": datetime.utcnow()
    }

    result = db.executive_chat_history.insert_one(message_doc)
    message_doc["_id"] = str(result.inserted_id)

    return {"message": message_doc}
