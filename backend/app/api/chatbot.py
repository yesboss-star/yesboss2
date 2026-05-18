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


PERSONA_QUESTIONS = {
    "Engineering": [
        "What's your preferred way to receive task updates and progress reports?",
        "What's typically the biggest bottleneck or challenge you face in your daily workflow?",
        "How do you prefer to communicate with your team - async messages, daily standups, or ad-hoc chats?",
        "What tools do you primarily use for code reviews and project tracking?",
    ],
    "Marketing": [
        "How do you prefer to track campaign progress and receive updates on your projects?",
        "What's your biggest challenge when launching campaigns or content?",
        "How do you prefer to receive feedback on creative work - detailed notes or quick approvals?",
        "What metrics matter most to you in measuring campaign success?",
    ],
    "Sales": [
        "How do you prefer to receive leads and track your pipeline updates?",
        "What's the most challenging part of your sales workflow?",
        "How do you prefer to get updates on prospect activities and follow-ups?",
        "What information helps you most in closing deals faster?",
    ],
    "Operations": [
        "How do you prefer to receive task updates and coordinate with your team?",
        "What's typically the biggest bottleneck in your daily operations?",
        "How do you prefer to handle approvals and sign-offs?",
        "What metrics help you most in tracking operational efficiency?",
    ],
    "Finance": [
        "How do you prefer to receive financial report updates and approval requests?",
        "What's your biggest challenge when managing financial workflows?",
        "How do you prefer to communicate about budgets and forecasts?",
        "What tools do you use most for financial tracking and reporting?",
    ],
}

DEFAULT_QUESTIONS = [
    "What's your preferred way to receive task updates and project notifications?",
    "What's typically the biggest challenge or bottleneck in your daily workflow?",
    "How do you prefer to communicate with your manager and team?",
    "What tools do you primarily use for your daily work?",
]


@router.post("/persona-questions")
async def get_persona_questions(request: PersonaQuestionsRequest):
    dept = request.department or "default"
    questions = PERSONA_QUESTIONS.get(dept, DEFAULT_QUESTIONS)
    
    first_question = questions[0]
    
    if request.organization_name and request.department and request.role:
        first_question = f"Welcome to {request.organization_name}! I see you're in {request.department} as a {request.role or 'team member'}. {first_question}"
    elif request.department:
        first_question = f"I see you're in the {request.department} department. {first_question}"
    
    return {
        "message": first_question,
        "all_questions": questions,
        "department": request.department
    }


class PersonaResponseRequest(BaseModel):
    messages: list[dict]
    context: Optional[dict] = None


@router.post("/persona-response")
async def process_persona_response(request: PersonaResponseRequest):
    user_messages = [m["content"] for m in request.messages if m.get("role") == "user"]
    last_message = user_messages[-1] if user_messages else ""
    
    context = request.context or {}
    department = context.get("department", "")
    role = context.get("role", "")
    
    follow_up_questions = {
        "Engineering": [
            "Got it - daily digests with priorities it is! How about communication - do you prefer async updates or real-time sync?",
            "Thanks for sharing! One more question - what's typically the biggest bottleneck or challenge you face in your daily workflow?",
            "Great insight! How do you prefer to receive feedback on your work - detailed reviews or quick approvals?",
            "Perfect! What's your preferred way to coordinate with your manager for task assignments?",
        ],
        "Marketing": [
            "Thanks for that insight! What about campaign coordination - how do you prefer to track deadlines and deliverables?",
            "Got it! What's typically your biggest challenge when launching campaigns or content?",
            "Interesting! How do you prefer to handle feedback on creative work?",
            "Great! What metrics matter most to you in measuring your success?",
        ],
        "Sales": [
            "Understood! How do you prefer to track your pipeline and deal progress?",
            "Thanks for sharing! What's typically the biggest challenge in your sales workflow?",
            "Got it! How do you prefer to receive updates on prospect activities?",
            "Great! What information helps you most in closing deals faster?",
        ],
        "Operations": [
            "Thanks! How do you prefer to handle coordination with different teams?",
            "Got it! What's typically the biggest bottleneck in your daily operations?",
            "Interesting! How do you prefer to manage approvals and sign-offs?",
            "Great! What metrics help you most in tracking efficiency?",
        ],
        "Finance": [
            "Got it! How do you prefer to handle approval workflows and reviews?",
            "Thanks! What's your biggest challenge when managing financial processes?",
            "Understood! How do you prefer to communicate about budgets and forecasts?",
            "Great! What tools do you use most for financial tracking?",
        ],
    }
    
    questions = follow_up_questions.get(department, DEFAULT_QUESTIONS)
    num_responses = len(user_messages)
    
    if num_responses < len(questions):
        response = questions[num_responses]
    else:
        response = "Thank you for sharing all that information! I've learned about your work style and preferences. You can now proceed to your dashboard where your AI assistant will help you work more effectively. Feel free to chat with me anytime about tasks, priorities, or workflow optimization!"
    
    return {
        "response": response,
        "message_count": num_responses,
        "is_complete": num_responses >= 4
    }


class EmployeeAssistantRequest(BaseModel):
    message: str
    context: Optional[dict] = None


@router.post("/employee-assistant")
async def employee_assistant(request: EmployeeAssistantRequest):
    message = request.message.lower()
    context = request.context or {}
    
    response = ""
    
    if any(w in message for w in ["prioritize", "priority", "today", "focus", "important"]):
        response = f"""Based on your current workload, here's how I'd recommend prioritizing:

**High Priority:**
1. Any tasks marked "urgent" or "high" priority
2. Tasks with approaching deadlines (next 2 days)
3. Items assigned directly by your manager

**Medium Priority:**
1. Tasks due this week
2. Collaborative tasks waiting on others

**Low Priority:**
1. Tasks marked "low" priority
2. Optional improvements or enhancements

💡 *Pro tip: Block 2 hours each morning for your most important task.*"""
    
    elif any(w in message for w in ["approval", "pending", "review", "approve"]):
        response = """You currently have pending items waiting for your review:

**Action Required:**
• Review expense reports (2 pending)
• Approve time-off requests (1 pending)

**Quick Actions:**
• Click "Approve" for routine requests
• Click "Details" for items needing more attention

💡 *Timely approvals keep your team moving forward!*"""
    
    elif any(w in message for w in ["block", "stuck", "blocking", "bottleneck"]):
        response = """Let me help identify potential workflow blockers:

**Common Blockers to Check:**
1. **Waiting on others** - Dependencies not yet completed
2. **Missing information** - Awaiting specs or details
3. **Resource constraints** - Tools, access, or time
4. **Decisions pending** - Waiting for approvals

💡 *Tip: Check your task details for dependency status. If stuck, consider reaching out to your manager or the task owner.*"""
    
    elif any(w in message for w in ["deadline", "due", "week", "today", "tomorrow"]):
        response = """Here's your upcoming deadline overview:

**Due Soon (Today/Tomorrow):**
• Review Q2 marketing report (High)

**Due This Week:**
• Update client presentation (Medium)
• Complete team meeting notes (Low)

**Total: 3 tasks this week**

💡 *You have good bandwidth. Consider starting with the high-priority item.*"""
    
    elif any(w in message for w in ["team", "update", "news", "announcement"]):
        response = """Recent team activity:

**Today:**
• Sarah Johnson completed 'Website redesign sprint 3'

**This Week:**
• Mike Brown reached 85% of Q2 target
• New project kickoff: Mobile App v2.0

**Announcements:**
• Team meeting moved to Thursday 2pm

💡 *Stay connected with your team through regular check-ins!*"""
    
    elif any(w in message for w in ["help", "what can you", "capabilities", "what do"]):
        response = """I'm here to help! I can assist with:

• **Task Prioritization** - "What should I work on today?"
• **Approval Summaries** - "What approvals are pending?"
• **Blocker Identification** - "What's blocking my work?"
• **Deadline Tracking** - "What's due this week?"
• **Team Updates** - "Any recent team news?"

Just ask me anything about your work!"""
    
    else:
        response = f"""I'd be happy to help! Based on your question, here are some things I can assist with:

• **Task Management** - Prioritize your daily tasks
• **Approvals** - Review pending items waiting for you
• **Workflow** - Identify what's blocking your progress
• **Deadlines** - See what's due soon
• **Team** - Stay updated on team activity

What would you like to focus on? You can also ask me specific questions like:
- "How should I prioritize today's tasks?"
- "What's blocking my workflow?"
- "Summarize my pending approvals"

💡 *I'm learning your preferences to provide better personalized help!*"""

    return {"response": response}