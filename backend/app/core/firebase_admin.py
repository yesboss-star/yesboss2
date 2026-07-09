import os
import json
import logging
from pathlib import Path
from typing import Optional

import firebase_admin
from firebase_admin import credentials, auth

logger = logging.getLogger("yesboss.firebase")

_firebase_app: Optional[firebase_admin.App] = None


def initialize_firebase(cred_path: Optional[str] = None) -> firebase_admin.App:
    global _firebase_app
    
    if _firebase_app is not None:
        return _firebase_app
    
    if cred_path is None:
        cred_path = os.getenv("FIREBASE_CREDENTIALS_PATH", "firebase-credentials.json")
    
    cred_path = Path(cred_path)
    
    if cred_path.exists():
        cred = credentials.Certificate(str(cred_path))
        _firebase_app = firebase_admin.initialize_app(cred)
        logger.info("Firebase initialized with credentials file: %s", cred_path)
    else:
        try:
            cred_json = os.getenv("FIREBASE_CREDENTIALS_JSON")
            if cred_json:
                cred_dict = json.loads(cred_json)
                cred = credentials.Certificate(cred_dict)
                _firebase_app = firebase_admin.initialize_app(cred)
                logger.info("Firebase initialized with environment credentials")
            else:
                logger.warning("Firebase credentials not found. Auth features will be limited.")
                _firebase_app = firebase_admin.initialize_app()
        except Exception as e:
            logger.error("Failed to initialize Firebase: %s", str(e))
            raise
    
    return _firebase_app


def get_firebase_auth() -> firebase_admin.auth:
    if _firebase_app is None:
        initialize_firebase()
    return auth


class AuthUser:
    """Wrapper around Firebase UserRecord that provides both .uid and .id access.
    
    The codebase uses current_user.id in many places. Firebase UserRecord has .uid but not .id,
    so this wrapper adds .id as an alias for .uid and keeps all other UserRecord attributes.
    """
    def __init__(self, record: auth.UserRecord):
        self._record = record
        self.uid = record.uid
        self.id = record.uid  # Backward compatibility for current_user.id
        self.email = record.email
        self.display_name = record.display_name
        self.phone_number = record.phone_number
        self.photo_url = record.photo_url
        self.disabled = record.disabled
        self.email_verified = record.email_verified
        self.provider_data = record.provider_data
        self.custom_claims = record.custom_claims or {}
        self.tokens_valid_after_timestamp = record.tokens_valid_after_timestamp
        self.tenant_id = record.tenant_id
        # user_metadata is a UserMetadata object; wrap as dict so .get('organization_id') works
        um = record.user_metadata
        self.user_metadata = {
            "creation_timestamp": um.creation_timestamp,
            "last_sign_in_timestamp": um.last_sign_in_timestamp,
        } if um else {}

    def __getattr__(self, name):
        """Fall back to the underlying record for any attributes we don't explicitly define."""
        return getattr(self._record, name)

    def __str__(self):
        return self.uid

    def __repr__(self):
        return f"AuthUser(uid={self.uid!r}, email={self.email!r})"


def verify_id_token(id_token: str) -> Optional[AuthUser]:
    try:
        decoded = auth.verify_id_token(id_token, app=_firebase_app)
        record = auth.get_user(decoded["uid"], app=_firebase_app)
        return AuthUser(record) if record else None
    except Exception as e:
        logger.warning("Token verification failed: %s", str(e))
        return None


def create_user(email: str, password: str, phone: Optional[str] = None, 
                display_name: Optional[str] = None) -> auth.UserRecord:
    fb_auth = get_firebase_auth()
    user_properties = {
        "email": email,
        "password": password,
    }
    if phone:
        user_properties["phone_number"] = phone
    if display_name:
        user_properties["display_name"] = display_name
    
    return fb_auth.create_user(**user_properties)


def get_user_by_email(email: str) -> Optional[auth.UserRecord]:
    try:
        return auth.get_user_by_email(email, app=_firebase_app)
    except Exception:
        return None


def get_user_by_phone(phone: str) -> Optional[auth.UserRecord]:
    try:
        return auth.get_user_by_phone_number(phone, app=_firebase_app)
    except Exception:
        return None


def get_user(uid: str) -> Optional[auth.UserRecord]:
    try:
        return auth.get_user(uid, app=_firebase_app)
    except Exception:
        return None


def update_user(uid: str, **kwargs) -> auth.UserRecord:
    fb_auth = get_firebase_auth()
    return fb_auth.update_user(uid, **kwargs)


def delete_user(uid: str) -> bool:
    try:
        fb_auth = get_firebase_auth()
        fb_auth.delete_user(uid)
        return True
    except Exception:
        return False


def generate_email_verification_link(email: str) -> str:
    fb_auth = get_firebase_auth()
    return fb_auth.generate_email_verification_link(email)


def generate_password_reset_link(email: str) -> str:
    fb_auth = get_firebase_auth()
    return fb_auth.generate_password_reset_link(email)


def set_custom_user_claims(uid: str, claims: dict) -> None:
    fb_auth = get_firebase_auth()
    fb_auth.set_custom_user_claims(uid, claims)