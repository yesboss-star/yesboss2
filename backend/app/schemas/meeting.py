from datetime import datetime

from pydantic import BaseModel


class MeetingProcessRequest(BaseModel):
    meeting_title: str
    participants: str | None = None


class MeetingTaskOut(BaseModel):
    title: str
    description: str | None = None
    suggested_assignee: str | None = None
    suggested_priority: str = "medium"
    suggested_deadline: str | None = None


class MeetingProcessResponse(BaseModel):
    meeting_id: str
    meeting_title: str
    tasks_created: list[dict]
    task_count: int
    raw_text: str


class MeetingHistoryItem(BaseModel):
    id: str
    title: str
    created_at: datetime
    task_count: int
    file_name: str | None = None
    participant_count: int
