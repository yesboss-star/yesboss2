from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class APIResponse(BaseModel, Generic[T]):
    success: bool = True
    message: str = ""
    data: T | None = None


class APIError(BaseModel):
    success: bool = False
    error: str = ""
    detail: str | None = None
    status_code: int = 500


class PaginatedResponse(BaseModel, Generic[T]):
    success: bool = True
    data: list[T]
    total: int
    page: int
    page_size: int
    total_pages: int
