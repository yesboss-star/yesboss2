from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from ..core.learning import learning

router = APIRouter()


class WorkflowRecord(BaseModel):
    organization_id: str
    type: str
    steps: list[str] = []
    duration: Optional[int] = None
    outcome: str = "unknown"
    efficiency_score: Optional[float] = None
    metadata: dict = {}


class TaskOutcomeRecord(BaseModel):
    organization_id: str
    task_id: str
    title: str
    status: str
    completed_at: Optional[str] = None
    duration_hours: Optional[float] = None
    priority: Optional[str] = None
    assignee_id: Optional[str] = None
    department: Optional[str] = None
    was_delayed: bool = False
    delay_reason: Optional[str] = None
    quality_score: Optional[float] = None


class BottleneckRecord(BaseModel):
    organization_id: str
    type: str
    description: str
    affected_workflows: list[str] = []
    impact_score: float = 0
    frequency: int = 1
    department: Optional[str] = None
    status: str = "open"
    suggested_fix: Optional[str] = None


class PatternRecord(BaseModel):
    organization_id: str
    type: str
    name: str
    description: Optional[str] = None
    frequency: int = 1
    context: dict = {}
    triggers: list[str] = []
    confidence: float = 0.5


class GoalOutcomeRecord(BaseModel):
    organization_id: str
    goal_id: str
    goal_type: Optional[str] = None
    duration: Optional[str] = None
    department: Optional[str] = None
    priority: Optional[str] = None
    industry: str = ""
    micro_vertical: str = ""
    status: str = ""
    completion_reviewed: bool = False
    actual_duration_days: Optional[float] = None
    estimated_duration_days: Optional[float] = None
    was_delayed: bool = False
    delay_reason: Optional[str] = None
    created_at: Optional[str] = None
    completed_at: Optional[str] = None


@router.post("/workflow")
async def record_workflow(request: WorkflowRecord):
    return learning.record_workflow(
        organization_id=request.organization_id,
        workflow_data=request.model_dump()
    )


@router.post("/task-outcome")
async def record_task_outcome(request: TaskOutcomeRecord):
    return learning.record_task_outcome(
        organization_id=request.organization_id,
        task_data=request.model_dump()
    )


@router.post("/bottleneck")
async def record_bottleneck(request: BottleneckRecord):
    return learning.record_bottleneck(
        organization_id=request.organization_id,
        bottleneck_data=request.model_dump()
    )


@router.post("/pattern")
async def record_pattern(request: PatternRecord):
    return learning.record_pattern(
        organization_id=request.organization_id,
        pattern_data=request.model_dump()
    )


@router.get("/workflow/analysis/{organization_id}")
async def get_workflow_analysis(organization_id: str, days: int = 30):
    return learning.analyze_workflow_efficiency(organization_id, days)


@router.get("/bottlenecks/{organization_id}")
async def get_bottlenecks(organization_id: str):
    return {"bottlenecks": learning.get_bottlenecks(organization_id)}


@router.get("/patterns/{organization_id}")
async def get_patterns(organization_id: str, pattern_type: Optional[str] = None):
    return {"patterns": learning.get_patterns(organization_id, pattern_type)}


@router.get("/frequencies/{organization_id}")
async def get_employee_frequencies(organization_id: str):
    from ..core.database import get_database
    import hashlib
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    org_ref = hashlib.sha256(organization_id.encode()).hexdigest()[:16]
    freqs = list(db.employee_frequencies.find({"org_ref": org_ref}).sort("frequency_per_week", -1))
    for f in freqs:
        f["_id"] = str(f["_id"])
    return {"frequencies": freqs}


@router.post("/goal-outcome")
async def record_goal_outcome(request: GoalOutcomeRecord):
    return learning.record_goal_outcome(
        organization_id=request.organization_id,
        outcome_data=request.model_dump()
    )


@router.post("/aggregate-industry-patterns")
async def trigger_aggregation(industry: Optional[str] = None, micro_vertical: Optional[str] = None):
    return learning.aggregate_industry_patterns(industry, micro_vertical)


@router.get("/industry-recommendations")
async def get_recommendations(industry: str, micro_vertical: Optional[str] = None):
    return learning.get_industry_recommendations(industry, micro_vertical)