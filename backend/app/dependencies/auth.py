import logging

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from ..core.firebase_admin import verify_id_token

logger = logging.getLogger("yesboss.auth")
security = HTTPBearer(auto_error=False)


def _verify_token(token: str):
    """Verify a Firebase ID token and return the user dict, or None."""
    try:
        return verify_id_token(token)
    except Exception as e:
        logger.warning("Token verification failed: %s", e)
        return None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    request: Request = None,
):
    token = None
    if credentials:
        token = credentials.credentials
    if not token and request:
        token = request.cookies.get("yesboss_token")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = _verify_token(token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    request: Request = None,
):
    token = None
    if credentials:
        token = credentials.credentials
    if not token and request:
        token = request.cookies.get("yesboss_token")

    if token:
        user = _verify_token(token)
        if user:
            return user

    return None


def require_role(required_role: str):
    async def role_checker(user=Depends(get_current_user)):
        custom_claims = getattr(user, "custom_claims", {}) or {}
        user_role = custom_claims.get("role")
        if user_role != required_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role: {required_role}",
            )
        return user

    return role_checker
