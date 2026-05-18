from pydantic import BaseModel
from typing import Optional, Generic, TypeVar, Any

T = TypeVar("T")


class APIResponse(BaseModel, Generic[T]):
    success: bool = True
    message: str = ""
    data: Optional[T] = None


class APIError(BaseModel):
    success: bool = False
    error: str = ""
    detail: Optional[str] = None
    status_code: int = 500


class PaginatedResponse(BaseModel, Generic[T]):
    success: bool = True
    data: list[T]
    total: int
    page: int
    page_size: int
    total_pages: int
