import re
import logging
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, field_validator

from ..core.firebase_admin import (
    initialize_firebase,
    create_user,
    get_user_by_email,
    get_user,
    update_user,
    generate_email_verification_link,
    generate_password_reset_link,
    set_custom_user_claims,
)
from ..core.database import get_database

try:
    initialize_firebase()
except Exception as e:
    logging.warning(f"Firebase initialization deferred: {e}")

logger = logging.getLogger("yesboss.auth")

router = APIRouter()


class SignupRequest(BaseModel):
    email: str
    password: str
    full_name: str
    phone: Optional[str] = None
    role: str = "owner"

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in ("owner", "employee"):
            raise ValueError("Role must be 'owner' or 'employee'")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if not re.match(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$", v):
            raise ValueError("Invalid email address")
        return v.strip().lower()


class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        return v.strip().lower()


class SendOTPRequest(BaseModel):
    phone: str

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        digits = re.sub(r"\D", "", v)
        if len(digits) < 10:
            raise ValueError("Phone number must have at least 10 digits")
        return v.strip()


class VerifyOTPRequest(BaseModel):
    phone: str
    code: str


class ResetPasswordRequest(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        return v.strip().lower()


class UserResponse(BaseModel):
    uid: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    organization_id: Optional[str] = None
    created_at: Optional[str] = None


class AuthResponse(BaseModel):
    success: bool
    message: str
    user: Optional[UserResponse] = None
    uid: Optional[str] = None


def _user_to_response(user) -> UserResponse:
    return UserResponse(
        uid=user.uid,
        email=user.email,
        full_name=getattr(user, "display_name", None),
        phone=getattr(user, "phone_number", None),
        created_at=str(user.user_meta.creation_timestamp) if hasattr(user, "user_meta") else None,
    )


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def signup(request: SignupRequest):
    try:
        existing = get_user_by_email(request.email)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered",
            )

        user = create_user(
            email=request.email,
            password=request.password,
            phone=request.phone,
            display_name=request.full_name,
        )

        set_custom_user_claims(user.uid, {"role": request.role})

        db = get_database()
        if db:
            db.users.insert_one({
                "uid": user.uid,
                "email": request.email,
                "full_name": request.full_name,
                "phone": request.phone,
                "role": request.role,
                "created_at": datetime.utcnow().isoformat(),
                "organization_id": None,
                "organization_completed": False,
            })

        logger.info("User signed up: %s (role=%s)", request.email, request.role)

        try:
            verification_link = generate_email_verification_link(request.email)
            logger.info("Verification link generated for: %s", request.email)
        except Exception as e:
            logger.warning("Could not generate verification link: %s", str(e))

        return AuthResponse(
            success=True,
            message="Account created successfully",
            user=UserResponse(
                uid=user.uid,
                email=user.email,
                full_name=request.full_name,
                phone=request.phone,
                role=request.role,
            ),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Signup failed for %s: %s", request.email, str(e))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/login", response_model=AuthResponse)
async def login(request: LoginRequest):
    try:
        user = get_user_by_email(request.email)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )

        claims = getattr(user, "custom_claims", {}) or {}
        role = claims.get("role", "owner")

        db = get_database()
        db_user = None
        if db:
            db_user = db.users.find_one({"uid": user.uid})

        logger.info("User logged in: %s", request.email)

        return AuthResponse(
            success=True,
            message="Login successful",
            uid=user.uid,
            user=UserResponse(
                uid=user.uid,
                email=user.email,
                full_name=getattr(user, "display_name", None),
                phone=getattr(user, "phone_number", None),
                role=db_user.get("role", role) if db_user else role,
                organization_id=db_user.get("organization_id") if db_user else None,
            ),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Login failed for %s: %s", request.email, str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )


@router.post("/send-otp", response_model=AuthResponse)
async def send_otp(request: SendOTPRequest):
    try:
        logger.info("OTP send requested for phone: %s", request.phone)
        
        return AuthResponse(
            success=True,
            message="OTP functionality handled on frontend via Firebase SDK",
        )

    except Exception as e:
        logger.error("OTP send failed: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/verify-otp", response_model=AuthResponse)
async def verify_otp(request: VerifyOTPRequest):
    try:
        logger.info("OTP verification requested for phone: %s", request.phone)
        
        return AuthResponse(
            success=True,
            message="OTP verification handled on frontend via Firebase SDK",
        )

    except Exception as e:
        logger.error("OTP verification failed: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP",
        )


@router.get("/me", response_model=AuthResponse)
async def get_me(uid: str = None):
    if not uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not authenticated",
        )

    try:
        user = get_user(uid)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )

        claims = getattr(user, "custom_claims", {}) or {}
        role = claims.get("role", "owner")

        db = get_database()
        db_user = None
        if db:
            db_user = db.users.find_one({"uid": uid})

        return AuthResponse(
            success=True,
            message="User retrieved",
            user=UserResponse(
                uid=user.uid,
                email=user.email,
                full_name=getattr(user, "display_name", None),
                phone=getattr(user, "phone_number", None),
                role=db_user.get("role", role) if db_user else role,
                organization_id=db_user.get("organization_id") if db_user else None,
            ),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Get user failed: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.post("/logout", response_model=AuthResponse)
async def logout(uid: str = None):
    try:
        logger.info("User logged out: %s", uid)
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


class SyncUserRequest(BaseModel):
    uid: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    phone: Optional[str] = None
    role: str = "owner"
    phone_verified: bool = False


@router.post("/sync-user", response_model=AuthResponse)
async def sync_user(request: SyncUserRequest):
    try:
        db = get_database()
        if db is None:
            raise HTTPException(status_code=500, detail="Database not configured")

        existing = db.users.find_one({"uid": request.uid})
        now = datetime.utcnow().isoformat()

        user_doc = {
            "uid": request.uid,
            "email": request.email or "",
            "full_name": request.full_name or "",
            "phone": request.phone or "",
            "role": request.role,
            "phone_verified": request.phone_verified,
            "organization_id": None,
            "organization_completed": False,
            "updated_at": now,
        }

        if existing:
            db.users.update_one({"uid": request.uid}, {"$set": user_doc})
            logger.info("User synced (updated): %s", request.email)
        else:
            user_doc["created_at"] = now
            db.users.insert_one(user_doc)
            logger.info("User synced (created): %s", request.email)

        return AuthResponse(
            success=True,
            message="User synced to database",
            uid=request.uid,
            user=UserResponse(
                uid=request.uid,
                email=request.email,
                full_name=request.full_name,
                phone=request.phone,
                role=request.role,
            ),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Sync user failed: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.post("/reset-password", response_model=AuthResponse)
async def reset_password(request: ResetPasswordRequest):
    try:
        user = get_user_by_email(request.email)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )

        reset_link = generate_password_reset_link(request.email)
        logger.info("Password reset link sent to: %s", request.email)

        return AuthResponse(
            success=True,
            message="Password reset email sent",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Password reset failed: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.put("/user/{uid}/role", response_model=AuthResponse)
async def update_user_role(uid: str, role: str):
    if role not in ("owner", "employee"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid role",
        )

    try:
        set_custom_user_claims(uid, {"role": role})

        db = get_database()
        if db:
            db.users.update_one({"uid": uid}, {"$set": {"role": role}})

        logger.info("User %s role updated to: %s", uid, role)

        return AuthResponse(
            success=True,
            message="Role updated successfully",
        )

    except Exception as e:
        logger.error("Update role failed: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )