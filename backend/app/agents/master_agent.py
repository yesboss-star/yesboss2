import logging
from datetime import datetime

logger = logging.getLogger("yesboss.agents.master")

from langchain_core.tools import tool
from langgraph.graph import END, StateGraph

from ..core.database import get_database
from ..core.qdrant import get_qdrant_client

STATE_SCHEMA = {
    "user_id": str,
    "current_step": str,
    "understanding_level": float,
    "missing_info": list,
    "chat_history": list,
    "recommended_questions": list,
    "confidence": float,
    "company_profile": dict,
    "conversation_context": dict,
}


class AgentState(dict):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.setdefault("user_id", "")
        self.setdefault("current_step", "introduction")
        self.setdefault("understanding_level", 0.0)
        self.setdefault("missing_info", [])
        self.setdefault("chat_history", [])
        self.setdefault("recommended_questions", [])
        self.setdefault("confidence", 0.0)
        self.setdefault("company_profile", {})
        self.setdefault("conversation_context", {})


def get_initial_state(user_id: str, company_profile: dict | None = None) -> AgentState:
    state = AgentState()
    state["user_id"] = user_id
    state["current_step"] = "introduction"
    state["understanding_level"] = 0.0
    state["missing_info"] = ["company_name", "industry", "size", "goals", "challenges", "team_structure"]
    state["chat_history"] = []
    state["recommended_questions"] = [
        "What does your company do?",
        "What industry are you in?",
        "How many employees do you have?",
    ]
    state["confidence"] = 0.0

    if company_profile:
        state["company_profile"] = company_profile
        if company_profile.get("industry"):
            state["missing_info"] = [k for k in state["missing_info"] if k != "industry"]
            state["understanding_level"] += 0.2
        if company_profile.get("company_name"):
            state["missing_info"] = [k for k in state["missing_info"] if k != "company_name"]
            state["understanding_level"] += 0.2
        if company_profile.get("size"):
            state["missing_info"] = [k for k in state["missing_info"] if k != "size"]
            state["understanding_level"] += 0.1

    return state


@tool
def retrieve_company_context(query: str, user_id: str) -> str:
    """Retrieve company context and conversation history from vector store."""
    try:
        client = get_qdrant_client()
        if not client:
            return "No context available"

        from qdrant_client.models import FieldCondition, Filter, Match

        results = client.search(
            collection_name="conversations",
            query_vector=[0.0] * 1536,
            limit=3,
            query_filter=Filter(
                must=[FieldCondition(key="user_id", match=Match(value=user_id))]
            ),
            with_payload=True
        )

        if results:
            context_parts = [r.payload.get("text", "") for r in results]
            return " | ".join(context_parts[:3])
        return ""
    except Exception as e:
        logger.error(f"Context retrieval failed: {e}")
        return ""


@tool
def update_company_profile(user_id: str, field: str, value: str) -> dict:
    """Update company profile fields in the database."""
    try:
        db = get_database()

        existing = db.conversations.find_one({"user_id": user_id})

        if not existing:
            profile = {"user_id": user_id, field: value, "updated_at": datetime.utcnow()}
            db.conversations.insert_one(profile)
        else:
            db.conversations.update_one(
                {"user_id": user_id},
                {"$set": {field: value, "updated_at": datetime.utcnow()}}
            )

        return {"status": "success", "field": field, "value": value}
    except Exception as e:
        logger.error(f"Profile update failed: {e}")
        return {"status": "error", "message": str(e)}


def analyze_user_response(state: AgentState) -> AgentState:
    return state


def generate_next_question(state: AgentState) -> AgentState:
    missing = state.get("missing_info", [])

    if not missing:
        state["current_step"] = "complete"
        return state

    topic_map = {
        "company_name": "What is your company name?",
        "industry": "What industry are you in?",
        "size": "How many employees do you have?",
        "goals": "What are your main business goals for this year?",
        "challenges": "What are your biggest operational challenges?",
        "team_structure": "How is your team organized?",
    }

    next_topic = missing[0]
    next_question = topic_map.get(next_topic, "Can you tell me more about your business?")

    state["recommended_questions"] = [next_question]

    return state


def update_understanding(state: AgentState) -> AgentState:
    current_level = state.get("understanding_level", 0.0)

    state["understanding_level"] = min(1.0, current_level + 0.1)

    if state["understanding_level"] > 0.7:
        state["confidence"] = 0.8
    elif state["understanding_level"] > 0.4:
        state["confidence"] = 0.6
    else:
        state["confidence"] = 0.3

    return state


async def process_user_message(state: AgentState, message: str) -> AgentState:
    state.get("user_id", "")

    state["chat_history"].append({"role": "user", "content": message, "timestamp": datetime.utcnow().isoformat()})

    await _extract_profile_info(state, message)

    state = update_understanding(state)
    state = generate_next_question(state)

    state.get("company_profile", {})
    missing = state.get("missing_info", [])

    if missing:
        next_question = state.get("recommended_questions", ["Can you tell me more about your business?"])[0]
        ai_response = f"I understand. {next_question}"
    else:
        ai_response = "Thank you for sharing that information. I now have a good understanding of your business. Let me summarize what I've learned and provide you with personalized insights."

    state["chat_history"].append({"role": "assistant", "content": ai_response, "timestamp": datetime.utcnow().isoformat()})

    return state


async def _extract_profile_info(state: AgentState, message: str) -> None:
    message_lower = message.lower()

    profile = state.get("company_profile", {})
    missing = state.get("missing_info", [])

    keywords = {
        "company_name": ["company", "business", "start", "founded", "we are", "our company is"],
        "industry": ["industry", "sector", "field", "domain", "market", "space"],
        "size": ["employees", "team size", "staff", "people", "headcount"],
        "goals": ["goal", "target", "objective", "aim", "focus", "priority", "kpi"],
        "challenges": ["challenge", "problem", "issue", "difficult", "struggle", "bottleneck"],
        "team_structure": ["team", "department", "organize", "structure", "reporting"],
    }

    for field, kws in keywords.items():
        if any(kw in message_lower for kw in kws):
            if field in missing:
                missing.remove(field)
                profile[field] = message[:100]
                state["missing_info"] = missing
                state["company_profile"] = profile

    state["company_profile"] = profile


async def run_master_agent(
    user_id: str,
    company_profile: dict | None = None,
    chat_message: str | None = None,
    provider: str | None = None,
) -> dict:
    logger.info(f"Running master agent for user: {user_id}")

    state = get_initial_state(user_id, company_profile)

    if chat_message:
        state = await process_user_message(state, chat_message)

    return {
        "user_id": state["user_id"],
        "current_step": state["current_step"],
        "understanding_level": state["understanding_level"],
        "missing_info": state["missing_info"],
        "recommended_questions": state["recommended_questions"],
        "chat_history": state["chat_history"],
        "confidence": state["confidence"],
        "company_profile": state["company_profile"],
    }


async def run_onboarding_flow(
    user_id: str,
    company_profile: dict | None = None,
    provider: str | None = None,
) -> dict:
    state = get_initial_state(user_id, company_profile)

    intro_message = """Hello! I'm your AI Business Analyst. I'll help you build your personalized business operating system.

Let me ask you a few questions to understand your business better. This will help me provide you with the most relevant insights and recommendations.

"""

    first_question = state.get("recommended_questions", ["What does your company do?"])[0]
    intro_message += first_question

    return {
        "user_id": user_id,
        "intro_message": intro_message,
        "next_question": first_question,
        "missing_info": state["missing_info"],
        "current_step": state["current_step"],
    }


def create_master_agent_graph():
    from typing import TypedDict

    class MasterAgentState(TypedDict):
        user_id: str
        current_step: str
        understanding_level: float
        missing_info: list
        chat_history: list
        recommended_questions: list
        confidence: float
        company_profile: dict
        conversation_context: dict
        last_message: str
        ai_response: str

    graph = StateGraph(MasterAgentState)

    graph.add_node("analyze", analyze_user_response)
    graph.add_node("question", generate_next_question)
    graph.add_node("update", update_understanding)

    graph.set_entry_point("analyze")
    graph.add_edge("analyze", "question")
    graph.add_edge("question", "update")
    graph.add_edge("update", END)

    return graph.compile()


master_agent_graph = create_master_agent_graph()
