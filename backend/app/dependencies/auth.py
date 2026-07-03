import logging
from fastapi import Depends, HTTPException, status, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from ..core.supabase_client import get_supabase
from typing import Optional
from types import SimpleNamespace

logger = logging.getLogger("yesboss.auth")
security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication service not configured",
        )

    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        response = supabase.auth.get_user(credentials.credentials)
        return response.user
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    x_user_id: Optional[str] = Header(None),
    x_user_email: Optional[str] = Header(None),
):
    if credentials:
        supabase = get_supabase()
        if supabase:
            try:
                response = supabase.auth.get_user(credentials.credentials)
                return response.user
            except Exception:
                pass

    # SECURITY: Header-based auth is valid for testing only.
    # TODO: For production (Azure VPS), require DB validation of the user.
    logger.warning("Auth via X-User-ID/X-User-Email header — no token validation")
    if x_user_id:
        return SimpleNamespace(
            id=x_user_id,
            email=x_user_email or "",
            user_metadata={},
        )

    if x_user_email:
        return SimpleNamespace(
            id=x_user_email,
            email=x_user_email,
            user_metadata={},
        )

    return None


def require_role(required_role: str):
    async def role_checker(user=Depends(get_current_user)):
        user_role = user.user_metadata.get("role")
        if user_role != required_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role: {required_role}",
            )
        return user

    return role_checker
