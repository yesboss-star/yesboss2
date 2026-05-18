from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..agents.master_agent import run_master_agent, get_initial_state

router = APIRouter()


class InitializeAgentRequest(BaseModel):
    user_id: str
    company_profile: dict = None
    provider: str = "openai"


class ChatRequest(BaseModel):
    user_id: str
    message: str
    company_profile: dict = None
    provider: str = "openai"


class AgentResponse(BaseModel):
    current_step: str
    understanding_level: str
    missing_info: list[str]
    recommended_questions: list[str]
    chat_history: list[dict]
    confidence: float


@router.post("/initialize", response_model=AgentResponse)
async def initialize_agent(request: InitializeAgentRequest):
    if not request.user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    
    result = await run_master_agent(
        user_id=request.user_id,
        company_profile=request.company_profile,
        provider=request.provider
    )
    
    return AgentResponse(**result)


@router.post("/chat", response_model=AgentResponse)
async def chat_with_agent(request: ChatRequest):
    if not request.user_id or not request.message:
        raise HTTPException(status_code=400, detail="user_id and message are required")
    
    result = await run_master_agent(
        user_id=request.user_id,
        company_profile=request.company_profile,
        chat_message=request.message,
        provider=request.provider
    )
    
    return AgentResponse(**result)


@router.get("/state/{user_id}")
async def get_agent_state(user_id: str):
    state = get_initial_state(user_id)
    return {
        "user_id": user_id,
        "current_step": state["current_step"],
        "understanding_level": state["understanding_level"]
    }