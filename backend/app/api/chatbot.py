import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..core.chatbot import OnboardingChatbot, get_conversation, store_conversation, store_conversation_embedding

router = APIRouter()


class EmployeePersonaQuestionRequest(BaseModel):
    department: str | None = ""
    role: str | None = ""
    manager_name: str | None = ""
    organization_name: str | None = ""
    previous_answers: list[dict] | None = []
    question_count: int = 0
    more_time_agreed: bool = False
    provider: str | None = None


@router.post("/employee-persona/generate-question")
async def generate_employee_persona_question(request: EmployeePersonaQuestionRequest):
    from ..core.ai_client import get_ai_response
    from ..core.database import get_database
    from ..core.prompt_engine import MasterPromptEngine

    num_answers = len(request.previous_answers or [])

    context_parts = [
        f"- Role: {request.role or 'Not specified'}",
        f"- Department: {request.department or 'Not specified'}",
        f"- Organization: {request.organization_name or 'Not specified'}",
    ]
    if request.manager_name:
        context_parts.append(f"- Manager: {request.manager_name}")
    employee_context = "\n".join(context_parts)

    db = get_database()
    engine = MasterPromptEngine(db) if db is not None else None
    engine_context = f"===== EMPLOYEE CONTEXT =====\n{employee_context}\n=============================\n"
    if engine:
        persona = engine._get_persona_instructions("employee_persona_builder")
        engine_context += f"\n===== PERSONA =====\n{persona}\n====================\n"

    # Enforce minimum 3 questions before offering more time
    # If more_time_agreed, allow up to 3 additional questions
    if request.more_time_agreed and num_answers >= 3:
        max_extra = 3
        remaining = max_extra - (num_answers - 3)
        if remaining <= 0:
            return {"question_number": num_answers + 1}

    if num_answers == 0:
        prompt = f"""{engine_context}

You are meeting this employee for the first time. Ask ONE genuine, friendly question that helps you understand WHO they are as a team member — not just what they do, but how they work best, what motivates them, what makes their day productive.

This is NOT a survey. This is a real conversation starter.

Return ONLY valid JSON:
{{
    "question": "A genuine, human question about their work style, preferences, or challenges",
    "options": ["Realistic option 1", "Realistic option 2", "Realistic option 3"],
    "time_estimate": <integer 1-5>,
    "need_more_time": false
}}

Rules:
- Question must feel like a real conversation, not a form
- Options should reflect actual work-style archetypes
- Keep it warm and friendly — this is a new team member
- You MUST ask at least 3 questions total before deciding you have enough info"""
    else:
        answers_text = "\n".join([f"Q: {a.get('question', '')}\nA: {a.get('answer', '')}" for a in request.previous_answers[-5:]])

        prompt = f"""{engine_context}

CONVERSATION SO FAR:
{answers_text}

Based on their LAST answer, generate ONE follow-up question that goes deeper into what they revealed about their work style. This should feel like a natural continuation — like you're genuinely getting to know them as a colleague.

If their last answer revealed something interesting (a pain point, a preference, a work habit), ask about THAT specifically.
If they gave a generic answer, try a different angle to get to something real.

You must ask at least 3 questions before you can stop.
""" + (
    "After 3 questions, if you still need to understand more about this person, set need_more_time to true so we can ask them if they have more time. Otherwise set need_more_time to false to finish."
    if not request.more_time_agreed else
    "The user agreed to more questions. Ask 1-3 more follow-ups to round out your understanding, then stop. Set need_more_time to false when done."
) + """

Return ONLY valid JSON:
{{
    "question": "A natural follow-up based on their last answer",
    "options": ["Option that connects to their answer", "Another relevant option", "A different angle option"],
    "time_estimate": <integer 1-5>,
    "need_more_time": <boolean>
}}

Rules:
- Question MUST connect to their previous answer
- Options should branch differently based on what they said
- time_estimate: 1-5 minutes
- Keep it conversational, warm, and never robotic"""

    try:
        response = await get_ai_response(
            prompt=prompt,
            system_prompt="You are a warm, empathetic AI colleague getting to know a new team member. Generate ONE thoughtful question with 3 realistic options. Return ONLY valid JSON.",
            provider=request.provider,
            temperature=0.8,
            max_tokens=400
        )

        import json

        json_str = response.strip()
        if '{' in json_str and '}' in json_str:
            start = json_str.find('{')
            end = json_str.rfind('}') + 1
            json_str = json_str[start:end]

        data = json.loads(json_str)

        need_more = data.get("need_more_time", False)

        # Enforce minimum 3 questions
        if num_answers < 3:
            need_more = False
        elif num_answers == 3 and not request.more_time_agreed:
            need_more = True

        return {
            "question": data.get("question", "How do you prefer to receive feedback on your work?"),
            "options": data.get("options", ["Quick async comments", "Scheduled 1:1 meetings", "Written feedback in documents"]),
            "time_estimate": data.get("time_estimate", 3),
            "need_more_time": need_more,
            "question_number": num_answers + 1
        }
    except Exception:
        fallback_questions = [
            {
                "question": "How do you prefer to receive feedback on your work?",
                "options": ["Quick async comments (Slack, etc.)", "Scheduled 1:1 meetings", "Written feedback in documents"],
                "time_estimate": 2,
                "need_more_time": False,
            },
            {
                "question": "What's your ideal way to communicate with your team throughout the day?",
                "options": ["Quick chat messages", "Schedule calls when needed", "Async updates via shared docs"],
                "time_estimate": 2,
                "need_more_time": False,
            },
            {
                "question": "What tools or apps do you rely on most to get your work done?",
                "options": ["Project management tools (Jira, Asana, etc.)", "Communication tools (Slack, Teams)", "Documentation tools (Notion, Confluence)"],
                "time_estimate": 2,
                "need_more_time": False,
            },
            {
                "question": "What's typically the biggest challenge in your daily workflow?",
                "options": ["Too many meetings / interruptions", "Unclear priorities or requirements", "Cross-team coordination bottlenecks"],
                "time_estimate": 2,
                "need_more_time": False,
            },
            {
                "question": "How do you like to track your own progress and stay organized?",
                "options": ["Personal task lists / checklists", "Calendar blocking and time management", "Collaborative project boards"],
                "time_estimate": 1,
                "need_more_time": False,
            },
        ]

        idx = min(num_answers, len(fallback_questions) - 1)
        fb = fallback_questions[idx]
        need_more = fb.get("need_more_time", False)
        if num_answers < 3:
            need_more = False
        elif num_answers == 3 and not request.more_time_agreed:
            need_more = True
        return {**fb, "need_more_time": need_more, "question_number": num_answers + 1}


class StartChatRequest(BaseModel):
    user_id: str
    company_profile: dict | None = None
    provider: str | None = None


class ChatMessageRequest(BaseModel):
    user_id: str
    conversation_id: str
    message: str
    company_profile: dict | None = None
    answered_topics: list[str] | None = None
    conversation_history: list[dict] | None = None
    provider: str | None = None


class ChatResponse(BaseModel):
    response: str
    next_question: str | None
    is_continuing: bool
    updated_profile: dict
    answered_topics: list[str] | None = None


@router.post("/start")
async def start_conversation(request: StartChatRequest):
    if not request.user_id:
        raise HTTPException(status_code=400, detail="user_id is required")

    chatbot = OnboardingChatbot(provider=request.provider)
    result = await chatbot.start_conversation(request.company_profile)

    conversation_id = str(uuid.uuid4())

    conversation_doc = {
        "user_id": request.user_id,
        "conversation_id": conversation_id,
        "messages": [{"role": "assistant", "content": result["message"], "timestamp": datetime.utcnow().isoformat()}],
        "company_profile": result.get("company_profile", {}),
        "created_at": datetime.utcnow()
    }

    await store_conversation(
        request.user_id,
        conversation_id,
        conversation_doc["messages"],
        result.get("company_profile", {})
    )

    await store_conversation_embedding(
        conversation_id,
        request.user_id,
        result["message"],
        {"type": "intro"}
    )

    return {
        "conversation_id": conversation_id,
        "message": result["message"],
        "question_type": result["question_type"],
        "company_profile": result.get("company_profile", {})
    }


@router.post("/message", response_model=ChatResponse)
async def send_message(request: ChatMessageRequest):
    if not all([request.user_id, request.conversation_id, request.message]):
        raise HTTPException(status_code=400, detail="user_id, conversation_id, and message are required")

    chatbot = OnboardingChatbot(provider=request.provider)

    result = await chatbot.process_message(
        message=request.message,
        company_profile=request.company_profile or {},
        answered_topics=request.answered_topics or [],
        conversation_history=request.conversation_history or [],
        provider=request.provider
    )

    conversation = await get_conversation(request.conversation_id)

    if conversation:
        messages = conversation.get("messages", [])
        messages.append({"role": "user", "content": request.message, "timestamp": datetime.utcnow().isoformat()})
        messages.append({"role": "assistant", "content": result["response"], "timestamp": datetime.utcnow().isoformat()})

        await store_conversation(
            request.user_id,
            request.conversation_id,
            messages,
            result.get("updated_profile", {})
        )

        await store_conversation_embedding(
            request.conversation_id,
            request.user_id,
            request.message + " | " + result["response"],
            {"type": "conversation"}
        )

    return ChatResponse(**result)


@router.get("/conversation/{conversation_id}")
async def get_conversation_by_id(conversation_id: str):
    conv = await get_conversation(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


@router.get("/user/{user_id}")
async def get_user_conversations(user_id: str):
    from ..core.database import get_database

    db = get_database()

    try:
        conversations = list(db.conversations.find(
            {"user_id": user_id},
            {"messages": 0}
        ).sort("created_at", -1).limit(20))

        for conv in conversations:
            conv["_id"] = str(conv["_id"])

        return {"conversations": conversations}
    except Exception:
        return {"conversations": []}


class PersonaQuestionsRequest(BaseModel):
    department: str | None = None
    role: str | None = None
    manager_name: str | None = None
    organization_name: str | None = None


class PersonaQuestionGenerateRequest(BaseModel):
    org_name: str | None = ""
    industry: str | None = ""
    micro_vertical: str | None = ""
    company_size: str | None = ""
    domain: str | None = ""
    website_content: str | None = ""
    uploaded_files_summary: str | None = ""
    social_links: dict | None = {}
    previous_answers: list[dict] | None = []
    question_count: int = 0
    provider: str | None = None


@router.post("/persona/generate-question")
async def generate_persona_question(request: PersonaQuestionGenerateRequest):
    from ..core.ai_client import get_ai_response
    from ..core.database import get_database
    from ..core.prompt_engine import MasterPromptEngine

    website_content = request.website_content or ""
    if not website_content and request.domain:
        try:
            from ..core.scraper import scrape_company_data
            scraped = await scrape_company_data(request.domain)
            website_content = scraped.get("description", "")[:2000]
        except Exception:
            pass

    num_answers = len(request.previous_answers or [])

    context_parts = [
        f"- Company: {request.org_name or 'Unknown'}",
        f"- Industry: {request.industry or 'Not specified'}",
        f"- Micro-vertical: {request.micro_vertical or 'Not specified'}",
        f"- Company size: {request.company_size or 'Not specified'}",
    ]
    if website_content:
        context_parts.append(f"- Website summary: {website_content[:1500]}")
    if request.uploaded_files_summary:
        context_parts.append(f"- Uploaded documents: {request.uploaded_files_summary}")
    if request.social_links:
        social_str = ", ".join([f"{k}: {v}" for k, v in request.social_links.items() if v])
        if social_str:
            context_parts.append(f"- Social presence: {social_str}")
    company_context = "\n".join(context_parts)

    # Build unified context through MasterPromptEngine
    db = get_database()
    engine = MasterPromptEngine(db) if db is not None else None
    engine_context = f"===== COMPANY CONTEXT =====\n{company_context}\n===========================\n"
    if engine:
        persona = engine._get_persona_instructions("persona_builder")
        engine_context += f"\n===== PERSONA =====\n{persona}\n====================\n"

    if num_answers == 0:
        prompt = f"""{engine_context}

You are meeting this person for the first time. Ask ONE genuine, thoughtful question that helps you understand WHO they are as a leader — not what they do, but how they think, what drives them, what keeps them up at night.

This is NOT a survey. This is a real conversation starter.

Return ONLY valid JSON:
{{
    "question": "A genuine, human question about their leadership style, priorities, or challenges",
    "options": ["Realistic option 1", "Realistic option 2", "Realistic option 3"],
    "time_estimate": <integer 1-5, estimate how many minutes this will take based on company complexity>,
    "need_more_time": <boolean, true only if company context is thin and you need more questions to understand them>
}}

Rules:
- Question must feel like a real conversation, not a form
- Options should reflect actual leadership archetypes or decision-making styles
- time_estimate: Based on company complexity — larger/more complex companies need more time (1-5 min)
- need_more_time: true if the company context is very limited and you'll need deeper exploration"""
    else:
        answers_text = "\n".join([f"Q: {a.get('question', '')}\nA: {a.get('answer', '')}" for a in request.previous_answers[-5:]])

        prompt = f"""{engine_context}

CONVERSATION SO FAR:
{answers_text}

Based on their LAST answer, generate ONE follow-up question that goes deeper into what they revealed. This should feel like a natural continuation — like you're genuinely interested in understanding them better.

If their last answer revealed something interesting (a pain point, a priority, a leadership style), ask about THAT specifically.
If they gave a generic answer, try a different angle to get to something real.

Return ONLY valid JSON:
{{
    "question": "A natural follow-up based on their last answer",
    "options": ["Option that connects to their answer", "Another relevant option", "A different angle option"],
    "time_estimate": <integer 1-5, how many minutes this follow-up will likely take>,
    "need_more_time": <boolean, true only if you genuinely feel you still lack enough understanding after this question>
}}

Rules:
- Question MUST connect to their previous answer
- Options should branch differently based on what they said
- time_estimate: 1-5 minutes, based on question depth and remaining unknowns
- need_more_time: true only if you genuinely still lack enough understanding of this person. false once you have a solid picture.
- Decide dynamically how many more questions are needed — there is no fixed limit
- Keep it conversational, never robotic"""

    try:
        response = await get_ai_response(
            prompt=prompt,
            system_prompt="You are an empathetic business analyst having a real conversation. Generate ONE thoughtful question with 3 realistic options. Return ONLY valid JSON.",
            provider=request.provider,
            temperature=0.8,
            max_tokens=400
        )

        import json

        json_str = response.strip()
        if '{' in json_str and '}' in json_str:
            start = json_str.find('{')
            end = json_str.rfind('}') + 1
            json_str = json_str[start:end]

        data = json.loads(json_str)

        return {
            "question": data.get("question", "What matters most to you in how you lead your team?"),
            "options": data.get("options", ["Empowering others to decide", "Setting clear direction myself", "Collaborative decision-making"]),
            "time_estimate": data.get("time_estimate", 3),
            "need_more_time": data.get("need_more_time", False),
            "question_number": num_answers + 1
        }
    except Exception:
        fallback_questions = [
            {
                "question": "What matters most to you in how you lead your team?",
                "options": ["Empowering others to decide", "Setting clear direction myself", "Collaborative decision-making"],
                "time_estimate": 3,
                "need_more_time": False,
            },
            {
                "question": "When things get stressful, what's your instinct — take control or step back and trust your team?",
                "options": ["Take control and drive things forward", "Step back and let the team handle it", "Find a balance between both"],
                "time_estimate": 2,
                "need_more_time": True,
            },
            {
                "question": "What's the one thing you wish you could delegate but haven't found the right person for yet?",
                "options": ["Strategic decisions", "Day-to-day operations", "Client/customer relationships"],
                "time_estimate": 2,
                "need_more_time": False,
            },
            {
                "question": "If you could change one thing about how your company operates tomorrow, what would it be?",
                "options": ["Communication and transparency", "Speed of execution", "Quality of work"],
                "time_estimate": 1,
                "need_more_time": False,
            },
            {
                "question": "What does success look like for you personally in the next year?",
                "options": ["Growing the business significantly", "Building a self-sustaining team", "Achieving better work-life balance"],
                "time_estimate": 1,
                "need_more_time": False,
            },
        ]

        idx = min(num_answers, len(fallback_questions) - 1)
        return {**fallback_questions[idx], "question_number": num_answers + 1}
