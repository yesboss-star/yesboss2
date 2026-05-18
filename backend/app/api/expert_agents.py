from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from ..agents.expert_agents import (
    get_expert_agent,
    FinanceAgent,
    OperationsAgent,
    WorkflowAgent,
    ForecastingAgent,
    IndustryIntelligenceAgent,
    OrgUnderstandingAgent
)

router = APIRouter()


class ExpertQueryRequest(BaseModel):
    agent_type: str
    query: str
    company_context: Optional[dict] = None
    provider: str = "openai"


class WorkflowCreateRequest(BaseModel):
    workflow_type: str
    context: Optional[dict] = None
    provider: str = "openai"


class ForecastRequest(BaseModel):
    metric: str
    historical_data: Optional[list] = None
    context: Optional[dict] = None
    provider: str = "openai"


@router.post("/query")
async def query_expert_agent(request: ExpertQueryRequest):
    valid_types = ["finance", "operations", "workflow", "forecasting", "industry_intelligence", "org_understanding"]
    
    if request.agent_type.lower() not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid agent_type. Must be one of: {', '.join(valid_types)}"
        )
    
    try:
        agent = get_expert_agent(request.agent_type, request.provider)
        
        result = await agent.analyze(request.query, request.company_context)
        
        return result
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/workflow/create")
async def create_workflow(request: WorkflowCreateRequest):
    try:
        agent = WorkflowAgent(provider=request.provider)
        result = await agent.create_workflow(request.workflow_type, request.context)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/forecast")
async def run_forecast(request: ForecastRequest):
    try:
        agent = ForecastingAgent(provider=request.provider)
        result = await agent.forecast(request.metric, request.historical_data, request.context)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/types")
async def list_agent_types():
    return {
        "agents": [
            {"type": "finance", "description": "Financial analysis and recommendations"},
            {"type": "operations", "description": "Operations optimization"},
            {"type": "workflow", "description": "Workflow design and automation"},
            {"type": "forecasting", "description": "Business forecasting and predictions"},
            {"type": "industry_intelligence", "description": "Industry insights and competitive analysis"},
            {"type": "org_understanding", "description": "Organization structure analysis"}
        ]
    }


@router.get("/finance/health/{org_id}")
async def analyze_financial_health(org_id: str, provider: str = "openai"):
    try:
        agent = FinanceAgent(provider=provider)
        result = await agent.analyze_financial_health(org_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/operations/analysis/{org_id}")
async def analyze_operations(org_id: str, provider: str = "openai"):
    try:
        agent = OperationsAgent(provider=provider)
        result = await agent.analyze_operations(org_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/organization/analysis/{org_id}")
async def analyze_organization(org_id: str, provider: str = "openai"):
    try:
        agent = OrgUnderstandingAgent(provider=provider)
        result = await agent.analyze_organization(org_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))