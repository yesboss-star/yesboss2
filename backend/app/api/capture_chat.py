"""Capture chat: the one question the Capture screen asks the server before it handles a message.

Everything after that already exists and is reused as it is: the assistant (``/assistant/ask-stream``) for
questions, tasks, meetings and strategy; the journal route for reflections; Capture's own analysis for
meeting notes.
"""
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..core.capture_routing import MAX_CHARS, route_message

router = APIRouter()


class RouteRequest(BaseModel):
    message: str = Field(default="", max_length=MAX_CHARS)
    last_route: Literal["assistant", "journal", "meeting_notes"] | None = None
    has_file: bool = False
    open_question: bool = False  # the assistant's last message was a question


@router.post("/route")
async def route(data: RouteRequest):
    """What kind of message is this? ``assistant`` | ``journal`` | ``meeting_notes``."""
    return await route_message(data.message, data.last_route, data.has_file, data.open_question)
