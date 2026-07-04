import re
import secrets
import logging
from typing import Optional
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator

from ..core.firebase_admin import (
    initialize_firebase,
    create_user,
    get_user_by_email,
    get_user_by_phone,
    get_user,
    update_user,
    delete_user,
    generate_email_verification_link,
    generate_password_reset_link,
    set_custom_user_claims,
)
from ..core.database import get_database
from ..dependencies.auth import get_current_user

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
    email: Optional[str] = None
    phone: Optional[str] = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        return v.strip().lower() if v else v


class VerifyOTPRequest(BaseModel):
    email: Optional[str] = None
    phone: Optional[str] = None
    code: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        return v.strip().lower() if v else v


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
        if db is not None:
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
        if db is not None:
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
    """Send a 6-digit OTP for email verification during signup.
    Stores OTP in signup_otps collection with MongoDB TTL auto-cleanup.
    Actually delivers the OTP via SMTP email."""
    try:
        db = get_database()
        if db is None:
            raise HTTPException(status_code=500, detail="Database not configured")

        if not request.email:
            raise HTTPException(status_code=400, detail="Email is required for OTP verification")

        email = request.email.strip().lower()

        otp = f"{secrets.randbelow(1000000):06d}"
        expires_at = datetime.utcnow() + timedelta(minutes=10)

        db.signup_otps.delete_many({"email": email})
        db.signup_otps.insert_one({
            "email": email,
            "otp": otp,
            "verified": False,
            "expires_at": expires_at,
            "created_at": datetime.utcnow(),
        })

        from ..core.email_service import send_otp_email, is_email_configured
        email_sent = False
        if is_email_configured():
            email_sent = send_otp_email(email, otp, purpose="verification")
            if email_sent:
                logger.info("Signup OTP sent to %s", email)
            else:
                logger.warning("SMTP send failed for %s. Debug OTP: %s", email, otp)
        else:
            logger.warning("SMTP not configured - OTP not sent to %s. Debug OTP: %s", email, otp)

        return AuthResponse(
            success=True,
            message="OTP sent" if email_sent else f"OTP generated (check server logs for debug code)",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Send OTP failed: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/verify-otp", response_model=AuthResponse)
async def verify_otp(request: VerifyOTPRequest):
    """Verify the 6-digit OTP for signup email verification.
    Returns a verification_token that must be sent with /sync-user to complete signup."""
    try:
        if not request.email:
            raise HTTPException(status_code=400, detail="Email is required")
        email = request.email.strip().lower()
        otp_code = request.code.strip()

        db = get_database()
        if db is None:
            raise HTTPException(status_code=500, detail="Database not configured")

        record = db.signup_otps.find_one({"email": email})
        if not record:
            raise HTTPException(status_code=400, detail="No OTP request found. Send OTP first.")

        if record.get("expires_at") and record["expires_at"] < datetime.utcnow():
            db.signup_otps.delete_one({"_id": record["_id"]})
            raise HTTPException(status_code=400, detail="OTP expired. Request a new one.")

        if record.get("otp") != otp_code:
            raise HTTPException(status_code=400, detail="Invalid OTP")

        verification_token = secrets.token_urlsafe(32)
        db.signup_otps.update_one(
            {"_id": record["_id"]},
            {"$set": {"verified": True, "verification_token": verification_token, "verified_at": datetime.utcnow()}},
        )

        logger.info("Signup OTP verified for %s", email)
        return AuthResponse(
            success=True,
            message="OTP verified",
            uid=verification_token,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Verify OTP failed: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/me", response_model=AuthResponse)
async def get_me(current_user = Depends(get_current_user)):
    uid = current_user.id or current_user.sub

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
        if db is not None:
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
    verification_token: Optional[str] = None


@router.post("/sync-user", response_model=AuthResponse)
async def sync_user(request: SyncUserRequest):
    try:
        db = get_database()
        if db is None:
            raise HTTPException(status_code=500, detail="Database not configured")

        # For email signups, validate the verification_token to prove OTP was verified
        if request.email and not request.phone_verified:
            if not request.verification_token:
                raise HTTPException(status_code=400, detail="Verification token required. Verify OTP first.")
            token_record = db.signup_otps.find_one({
                "email": request.email.strip().lower(),
                "verification_token": request.verification_token,
                "verified": True,
            })
            if not token_record:
                raise HTTPException(status_code=400, detail="Invalid or expired verification token. Verify OTP first.")
            db.signup_otps.delete_one({"_id": token_record["_id"]})

        existing = db.users.find_one({"uid": request.uid})
        now = datetime.utcnow().isoformat()

        if existing:
            existing_role = existing.get("role", "employee")
            user_doc = {
                "uid": request.uid,
                "email": request.email or "",
                "full_name": request.full_name or "",
                "phone": request.phone or "",
                "role": existing_role,
                "phone_verified": request.phone_verified,
                "organization_id": existing.get("organization_id"),
                "organization_completed": existing.get("organization_completed", False),
                "updated_at": now,
            }
            db.users.update_one({"uid": request.uid}, {"$set": user_doc})
            logger.info("User synced (updated): %s", request.email)
            actual_role = existing_role
        else:
            role_val = request.role if request.role else "employee"
            user_doc = {
                "uid": request.uid,
                "email": request.email or "",
                "full_name": request.full_name or "",
                "phone": request.phone or "",
                "role": role_val,
                "phone_verified": request.phone_verified,
                "organization_id": None,
                "organization_completed": False,
                "created_at": now,
                "updated_at": now,
            }
            db.users.insert_one(user_doc)
            logger.info("User synced (created): %s", request.email)
            actual_role = role_val

        return AuthResponse(
            success=True,
            message="User synced to database",
            uid=request.uid,
            user=UserResponse(
                uid=request.uid,
                email=request.email,
                full_name=request.full_name,
                phone=request.phone,
                role=actual_role,
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
        if db is not None:
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


@router.delete("/user/by-email/{email}", response_model=AuthResponse)
async def delete_firebase_user(email: str):
    email = email.strip().lower()
    try:
        user = get_user_by_email(email)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found in Firebase",
            )

        uid = user.uid
        delete_user(uid)

        db = get_database()
        if db is not None:
            db.users.delete_one({"uid": uid})
            db.organizations.delete_many({"owner_id": uid})

        logger.info("User deleted from Firebase and MongoDB: %s (%s)", email, uid)

        return AuthResponse(
            success=True,
            message=f"User {email} deleted successfully",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Delete user failed: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


# ============================================================
# Forgot Password — OTP-based flow (email OR phone)
# ============================================================


class ForgotSendOTPRequest(BaseModel):
    email: Optional[str] = None
    phone: Optional[str] = None

    @field_validator("email")
    @classmethod
    def norm_email(cls, v):
        return v.strip().lower() if v else v


class ForgotVerifyOTPRequest(BaseModel):
    email: Optional[str] = None
    phone: Optional[str] = None
    otp: str


class ForgotResetRequest(BaseModel):
    reset_token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v


class ForgotTokenResponse(BaseModel):
    success: bool
    message: str
    channel: str
    reset_token: Optional[str] = None
    debug_otp: Optional[str] = None


EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
PHONE_RE = re.compile(r"^\+?\d[\d\s\-()]{6,}$")


def _detect_channel(req: ForgotSendOTPRequest) -> tuple[Optional[str], Optional[str], str]:
    """Returns (uid, contact, channel) where channel is 'email' or 'phone'."""
    if req.email and EMAIL_RE.match(req.email):
        user = get_user_by_email(req.email)
        if user:
            return user.uid, req.email, "email"
        return None, req.email, "email"
    if req.phone and PHONE_RE.match(req.phone):
        digits = re.sub(r"\D", "", req.phone)
        user = get_user_by_phone(f"+{digits}" if not req.phone.startswith("+") else req.phone)
        if user:
            return user.uid, req.phone, "phone"
        return None, req.phone, "phone"
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Provide a valid email or phone number",
    )


@router.post("/forgot-password/send-otp", response_model=ForgotTokenResponse)
async def forgot_password_send_otp(request: ForgotSendOTPRequest):
    """Generate a 6-digit OTP and store it in MongoDB with a 10-minute TTL.

    The actual delivery (email/SMS) is wired to Firebase on the client side.
    For email we also generate the Firebase password-reset link so the
    frontend can fall back to it.
    """
    try:
        uid, contact, channel = _detect_channel(request)

        otp = f"{secrets.randbelow(1000000):06d}"
        expires_at = datetime.utcnow() + timedelta(minutes=10)
        token = secrets.token_urlsafe(32)

        db = get_database()
        if db is None:
            raise HTTPException(status_code=500, detail="Database not configured")

        db.password_reset_codes.delete_many({"contact": contact})
        db.password_reset_codes.insert_one({
            "contact": contact,
            "channel": channel,
            "uid": uid,
            "otp": otp,
            "reset_token": token,
            "verified": False,
            "expires_at": expires_at,
            "created_at": datetime.utcnow(),
        })

        if channel == "email":
            from ..core.email_service import send_otp_email, is_email_configured
            email_sent = False
            if is_email_configured():
                email_sent = send_otp_email(contact, otp, purpose="password_reset")
                if email_sent:
                    logger.info("Password reset OTP sent to %s", contact)
                else:
                    logger.warning("SMTP send failed - password reset OTP not sent to %s. Debug OTP: %s", contact, otp)
            else:
                logger.warning("SMTP not configured - password reset OTP not sent to %s. Debug OTP: %s", contact, otp)
            try:
                reset_link = generate_password_reset_link(contact)
                logger.info("Password reset link also generated for: %s", contact)
            except Exception as e:
                logger.warning("Could not generate password reset link: %s", e)

        logger.info("Forgot-password OTP generated for %s (%s)", contact, channel)

        return ForgotTokenResponse(
            success=True,
            message="OTP sent" if uid else "OTP sent (user will be created at reset if needed)",
            channel=channel,
            debug_otp=otp,
            reset_token=None,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Forgot-password send-otp failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/forgot-password/verify-otp", response_model=ForgotTokenResponse)
async def forgot_password_verify_otp(request: ForgotVerifyOTPRequest):
    """Verify the 6-digit OTP. If valid, mark the reset token as verified so
    the reset endpoint can accept it. The reset token is short-lived (10 min)."""
    try:
        contact = (request.email or request.phone or "").strip()
        if not contact or not request.otp:
            raise HTTPException(status_code=400, detail="Contact and OTP are required")

        db = get_database()
        if db is None:
            raise HTTPException(status_code=500, detail="Database not configured")

        record = db.password_reset_codes.find_one({"contact": contact})
        if not record:
            raise HTTPException(status_code=400, detail="No OTP request found. Send OTP first.")

        if record.get("expires_at") and record["expires_at"] < datetime.utcnow():
            db.password_reset_codes.delete_one({"_id": record["_id"]})
            raise HTTPException(status_code=400, detail="OTP expired. Request a new one.")

        if record.get("otp") != request.otp.strip():
            raise HTTPException(status_code=400, detail="Invalid OTP")

        db.password_reset_codes.update_one(
            {"_id": record["_id"]},
            {"$set": {"verified": True, "verified_at": datetime.utcnow()}},
        )

        return ForgotTokenResponse(
            success=True,
            message="OTP verified",
            channel=record.get("channel", "email"),
            reset_token=record["reset_token"],
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Forgot-password verify-otp failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/forgot-password/reset", response_model=AuthResponse)
async def forgot_password_reset(request: ForgotResetRequest):
    """Consume the reset token and set the new password in Firebase."""
    try:
        db = get_database()
        if db is None:
            raise HTTPException(status_code=500, detail="Database not configured")

        record = db.password_reset_codes.find_one({"reset_token": request.reset_token})
        if not record:
            raise HTTPException(status_code=400, detail="Invalid or expired reset token")

        if record.get("expires_at") and record["expires_at"] < datetime.utcnow():
            db.password_reset_codes.delete_one({"_id": record["_id"]})
            raise HTTPException(status_code=400, detail="Reset token expired")

        if not record.get("verified"):
            raise HTTPException(status_code=400, detail="OTP not verified")

        uid = record.get("uid")
        if not uid:
            channel = record.get("channel")
            contact = record.get("contact")
            if channel == "email" and contact:
                existing = get_user_by_email(contact)
                if existing:
                    uid = existing.uid
        if not uid:
            raise HTTPException(
                status_code=400,
                detail="No user associated with this contact. Sign up first.",
            )

        update_user(uid, password=request.new_password)
        db.password_reset_codes.delete_one({"_id": record["_id"]})

        logger.info("Password reset for uid=%s via %s", uid, record.get("channel"))

        return AuthResponse(
            success=True,
            message="Password updated successfully",
            uid=uid,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Forgot-password reset failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))