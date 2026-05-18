import logging
import re
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, EmailStr, field_validator
from supabase import Client

from ..core.supabase_client import get_supabase
from ..dependencies.auth import get_current_user

logger = logging.getLogger("yesboss.auth")

router = APIRouter()


# ============================================
# Request / Response Models
# ============================================

class SignupRequest(BaseModel):
    email: str
    password: str
    full_name: str
    phone: str
    role: str

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in ("owner", "employee"):
            raise ValueError("Role must be 'owner' or 'employee'")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one digit")
        return v

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if not re.match(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$", v):
            raise ValueError("Invalid email address")
        return v.strip().lower()

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        digits = re.sub(r"\D", "", v)
        if len(digits) < 10:
            raise ValueError("Phone number must have at least 10 digits")
        return v.strip()


class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        return v.strip().lower()


class SendOTPRequest(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        return v.strip().lower()


class VerifyOTPRequest(BaseModel):
    email: str
    token: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        return v.strip().lower()


class ResetPasswordRequest(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        return v.strip().lower()


class UserMetadata(BaseModel):
    id: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    organization_id: Optional[str] = None


class AuthResponse(BaseModel):
    success: bool
    message: str
    user: Optional[UserMetadata] = None
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None


# ============================================
# Helpers
# ============================================

def _get_supabase_or_raise() -> Client:
    supabase = get_supabase()
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication service not configured",
        )
    return supabase


def _extract_user_meta(user) -> UserMetadata:
    meta = user.user_metadata or {}
    return UserMetadata(
        id=str(user.id),
        email=user.email,
        full_name=meta.get("full_name"),
        phone=meta.get("phone"),
        role=meta.get("role"),
        organization_id=meta.get("organization_id"),
    )


# ============================================
# Endpoints
# ============================================

@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def signup(request: SignupRequest):
    supabase = _get_supabase_or_raise()

    try:
        response = supabase.auth.sign_up({
            "email": request.email,
            "password": request.password,
            "options": {
                "data": {
                    "full_name": request.full_name,
                    "phone": request.phone,
                    "role": request.role,
                }
            },
        })

        if response.user:
            logger.info("User signed up: %s (role=%s)", request.email, request.role)
            return AuthResponse(
                success=True,
                message="Account created successfully. Please check your email to verify.",
                user=_extract_user_meta(response.user),
                access_token=response.session.access_token if response.session else None,
                refresh_token=response.session.refresh_token if response.session else None,
            )
        else:
            return AuthResponse(
                success=True,
                message="Signup initiated. Check email for verification.",
            )

    except Exception as e:
        error_msg = str(e)
        logger.warning("Signup failed for %s: %s", request.email, error_msg)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg,
        )


@router.post("/login", response_model=AuthResponse)
async def login(request: LoginRequest):
    supabase = _get_supabase_or_raise()

    try:
        response = supabase.auth.sign_in_with_password({
            "email": request.email,
            "password": request.password,
        })

        logger.info("User logged in: %s", request.email)
        return AuthResponse(
            success=True,
            message="Login successful",
            user=_extract_user_meta(response.user),
            access_token=response.session.access_token,
            refresh_token=response.session.refresh_token,
        )

    except Exception as e:
        logger.warning("Login failed for %s: %s", request.email, str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )


@router.post("/send-otp", response_model=AuthResponse)
async def send_otp(request: SendOTPRequest):
    supabase = _get_supabase_or_raise()

    try:
        supabase.auth.sign_in_with_otp({
            "email": request.email,
            "options": {
                "should_create_user": True,
            },
        })

        logger.info("OTP sent to %s", request.email)
        return AuthResponse(
            success=True,
            message="OTP sent to your email",
        )

    except Exception as e:
        logger.warning("OTP send failed for %s: %s", request.email, str(e))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/verify-otp", response_model=AuthResponse)
async def verify_otp(request: VerifyOTPRequest):
    supabase = _get_supabase_or_raise()

    try:
        response = supabase.auth.verify_otp({
            "email": request.email,
            "token": request.token,
            "type": "email",
        })

        logger.info("OTP verified for %s", request.email)
        return AuthResponse(
            success=True,
            message="OTP verified successfully",
            user=_extract_user_meta(response.user),
            access_token=response.session.access_token if response.session else None,
            refresh_token=response.session.refresh_token if response.session else None,
        )

    except Exception as e:
        logger.warning("OTP verification failed for %s: %s", request.email, str(e))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP",
        )


@router.get("/me", response_model=AuthResponse)
async def get_me(user=Depends(get_current_user)):
    return AuthResponse(
        success=True,
        message="User retrieved",
        user=_extract_user_meta(user),
    )


@router.post("/logout", response_model=AuthResponse)
async def logout(user=Depends(get_current_user)):
    supabase = _get_supabase_or_raise()

    try:
        supabase.auth.sign_out()
        logger.info("User logged out: %s", user.email)
        return AuthResponse(
            success=True,
            message="Logged out successfully",
        )
    except Exception as e:
        logger.error("Logout failed: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/reset-password", response_model=AuthResponse)
async def reset_password(request: ResetPasswordRequest):
    supabase = _get_supabase_or_raise()

    try:
        supabase.auth.reset_password_for_email(
            request.email,
            options={"redirect_to": None},
        )

        logger.info("Password reset email sent to %s", request.email)
        return AuthResponse(
            success=True,
            message="Password reset email sent",
        )

    except Exception as e:
        logger.warning("Password reset failed for %s: %s", request.email, str(e))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
