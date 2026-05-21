from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid
from ..core.chatbot import OnboardingChatbot, store_conversation, get_conversation, store_conversation_embedding

router = APIRouter()


class StartChatRequest(BaseModel):
    user_id: str
    company_profile: Optional[dict] = None
    provider: str = "openai"


class ChatMessageRequest(BaseModel):
    user_id: str
    conversation_id: str
    message: str
    company_profile: Optional[dict] = None
    answered_topics: Optional[list[str]] = None
    conversation_history: Optional[list[dict]] = None
    provider: str = "openai"


class ChatResponse(BaseModel):
    response: str
    next_question: Optional[str]
    is_continuing: bool
    updated_profile: dict
    answered_topics: Optional[list[str]] = None


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
    except Exception as e:
        return {"conversations": []}


class PersonaQuestionsRequest(BaseModel):
    department: Optional[str] = None
    role: Optional[str] = None
    manager_name: Optional[str] = None
    organization_name: Optional[str] = None


class PersonaQuestionGenerateRequest(BaseModel):
    org_name: Optional[str] = ""
    industry: Optional[str] = ""
    micro_vertical: Optional[str] = ""
    company_size: Optional[str] = ""
    website_content: Optional[str] = ""
    uploaded_files_summary: Optional[str] = ""
    social_links: Optional[dict] = {}
    previous_answers: Optional[list[dict]] = []
    question_count: int = 0
    provider: str = "gemini"


@router.post("/persona/generate-question")
async def generate_persona_question(request: PersonaQuestionGenerateRequest):
    from ..core.ai_client import get_ai_response
    
    num_answers = len(request.previous_answers or [])
    
    if num_answers == 0:
        prompt = f"""You are YesBoss, an AI business co-founder building a deep understanding of this person to create their personalized operational dashboard.

COMPANY CONTEXT:
- Company: {request.org_name or "Unknown"}
- Industry: {request.industry or "Not specified"}
- Micro-vertical: {request.micro_vertical or "Not specified"}
- Company size: {request.company_size or "Not specified"}
- Website: {request.website_content or "Not analyzed"}
- Social presence: {request.social_links or "None detected"}

You are meeting this person for the first time. Ask ONE genuine, thoughtful question that helps you understand WHO they are as a leader — not what they do, but how they think, what drives them, what keeps them up at night.

This is NOT a survey. This is a real conversation starter.

Return ONLY valid JSON:
{{
    "question": "A genuine, human question about their leadership style, priorities, or challenges",
    "options": ["Realistic option 1", "Realistic option 2", "Realistic option 3"],
    "time_estimate": 3,
    "need_more_time": false
}}

Rules:
- Question must feel like a real conversation, not a form
- Options should reflect actual leadership archetypes or decision-making styles
- time_estimate: 2-5 minutes based on how much context we still need
- need_more_time: false for first question"""
    else:
        answers_text = "\n".join([f"Q: {a.get('question', '')}\nA: {a.get('answer', '')}" for a in request.previous_answers[-5:]])
        
        prompt = f"""You are YesBoss, an AI business co-founder in an ongoing conversation. You've been learning about this person through their answers.

COMPANY CONTEXT:
- Company: {request.org_name or "Unknown"}
- Industry: {request.industry or "Not specified"}

CONVERSATION SO FAR:
{answers_text}

Based on their LAST answer, generate ONE follow-up question that goes deeper into what they revealed. This should feel like a natural continuation — like you're genuinely interested in understanding them better.

If their last answer revealed something interesting (a pain point, a priority, a leadership style), ask about THAT specifically.
If they gave a generic answer, try a different angle to get to something real.

Return ONLY valid JSON:
{{
    "question": "A natural follow-up based on their last answer",
    "options": ["Option that connects to their answer", "Another relevant option", "A different angle option"],
    "time_estimate": {max(1, 4 - num_answers)},
    "need_more_time": {num_answers >= 2 and num_answers <= 4}
}}

Rules:
- Question MUST connect to their previous answer
- Options should branch differently based on what they said
- time_estimate decreases as we learn more (1-3 min)
- need_more_time: true only if you genuinely feel we need more depth (typically after 2-4 questions)
- After 5+ questions, need_more_time should be false
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
        import re
        
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
    except Exception as e:
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