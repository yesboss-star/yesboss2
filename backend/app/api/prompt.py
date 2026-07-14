import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..core.database import get_database
from ..dependencies.auth import get_current_user_optional

router = APIRouter()
logger = logging.getLogger("yesboss.prompt")


class PromptBuildRequest(BaseModel):
    organization_id: str
    goal_id: str | None = None
    agent_type: str | None = None
    extra_context: str | None = None


class ProbeRequest(BaseModel):
    goal_title: str
    organization_id: str
    existing_fields: dict[str, Any] | None = None


@router.post("/build")
async def build_prompt(
    request: PromptBuildRequest,
    current_user = Depends(get_current_user_optional),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    user_id = getattr(current_user, 'id', None) if current_user else None

    from ..core.prompt_engine import MasterPromptEngine
    engine = MasterPromptEngine(db)

    prompt = await engine.build_prompt(
        org_id=request.organization_id,
        user_id=user_id,
        goal_id=request.goal_id,
        agent_type=request.agent_type,
        extra_context=request.extra_context,
    )

    return {
        "prompt": prompt,
        "agent_types": engine.get_agent_types(),
    }


@router.post("/probe")
async def generate_probe(
    request: ProbeRequest,
    current_user = Depends(get_current_user_optional),
):
    db = get_database()
    if db is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    user_id = getattr(current_user, 'id', None) if current_user else None

    from ..core.prompt_engine import MasterPromptEngine
    engine = MasterPromptEngine(db)

    questions = await engine.generate_probing_questions(
        goal_title=request.goal_title,
        org_id=request.organization_id,
        user_id=user_id,
        existing_fields=request.existing_fields or {},
    )

    return {"questions": questions}
