from fastapi import Query
from typing import Optional


def pagination_params(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
):
    return {"page": page, "page_size": page_size, "skip": (page - 1) * page_size}


def search_params(
    search: Optional[str] = Query(None, description="Search query"),
    sort_by: Optional[str] = Query("created_at", description="Sort field"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$", description="Sort order"),
):
    return {"search": search, "sort_by": sort_by, "sort_order": sort_order}
