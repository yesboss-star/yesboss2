from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from ..core.supabase_client import get_supabase
from typing import Optional

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
):
    supabase = get_supabase()
    if not supabase or not credentials:
        return None

    try:
        response = supabase.auth.get_user(credentials.credentials)
        return response.user
    except Exception:
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
