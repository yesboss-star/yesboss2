from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class MeetingProcessRequest(BaseModel):
    meeting_title: str
    participants: Optional[str] = None


class MeetingTaskOut(BaseModel):
    title: str
    description: Optional[str] = None
    suggested_assignee: Optional[str] = None
    suggested_priority: str = "medium"
    suggested_deadline: Optional[str] = None


class MeetingProcessResponse(BaseModel):
    meeting_id: str
    meeting_title: str
    tasks_created: List[dict]
    task_count: int
    raw_text: str


class MeetingHistoryItem(BaseModel):
    id: str
    title: str
    created_at: datetime
    task_count: int
    file_name: Optional[str] = None
    participant_count: int
