import logging
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
from ..core.database import get_database
from ..dependencies.auth import get_current_user_optional
from ..core.zoho import ZohoOAuth

logger = logging.getLogger("yesboss.zoho_auth")
router = APIRouter()


def get_user_id(user) -> Optional[str]:
    if user is None:
        return None
    return getattr(user, "id", None) or getattr(user, "email", None)


def get_user_email(user) -> str:
    if user is None:
        return ""
    return getattr(user, "email", "")


@router.get("/auth-url")
async def get_auth_url(
    current_user=Depends(get_current_user_optional),
):
    user_id = get_user_id(current_user)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    zoho = ZohoOAuth(get_database())
    url = zoho.get_auth_url(state=user_id)
    return {"url": url}


@router.get("/callback")
async def zoho_callback(
    code: str = Query(...),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
):
    try:
        if error:
            logger.warning("Zoho OAuth error: %s", error)
            raise HTTPException(status_code=400, detail=f"Zoho authorization failed: {error}")

        if not code:
            raise HTTPException(status_code=400, detail="Missing authorization code")

        logger.info("Zoho callback received: code=%s... state=%s", code[:20] if code else "", state)

        db = get_database()
        zoho = ZohoOAuth(db)

        token_data = await zoho.exchange_code(code)
        if not token_data:
            logger.error("Zoho exchange_code returned None — check client_id/secret match global console")
            raise HTTPException(status_code=502, detail="Failed to exchange authorization code. Verify the Client ID and Secret match what's on api-console.zoho.com")

        logger.info("Zoho exchange_code succeeded — keys=%s, has_access_token=%s",
                     list(token_data.keys()), bool(token_data.get("access_token")))

        access_token = token_data.get("access_token", "")
        if not access_token:
            error_detail = token_data.get("error", "unknown_error")
            error_desc = token_data.get("error_description", token_data)
            logger.error("Zoho exchange_code returned error — error=%s, description=%s, full_response=%s",
                         error_detail, error_desc, token_data)
            raise HTTPException(
                status_code=502,
                detail=f"Zoho token exchange failed: {error_detail}. {error_desc}. "
                       f"Verify your Zoho client app configuration (Client ID, Secret, Redirect URI) "
                       f"matches what's in your backend .env file."
            )

        zoho_mail_id = await zoho.get_zoho_mail_id(access_token)

        user_id = state or ""
        org_id = ""
        user_email = ""

        if user_id and db is not None:
            try:
                user_doc = db.users.find_one({"uid": user_id})
                if user_doc:
                    user_email = user_doc.get("email", "")
            except Exception:
                pass
            try:
                org = db.organizations.find_one({"owner_id": user_id})
                if org:
                    org_id = str(org["_id"])
            except Exception:
                pass

        saved = await zoho.save_token(user_id, org_id, token_data, zoho_mail_id, email=user_email or zoho_mail_id)
        logger.info("Callback saved token — user_id=%s, org_id=%s, zoho_mail_id=%s, success=%s",
                     user_id, org_id, zoho_mail_id, saved)

        if not saved:
            logger.error("Failed to save Zoho token for user_id=%s — will not redirect to success page", user_id)
            raise HTTPException(status_code=502, detail="Failed to save Zoho token. Please try again.")

        from ..core.config import settings
        frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:3000")
        redirect_url = f"{frontend_url}/dashboard/settings?zoho=connected"

        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=redirect_url, status_code=302)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Zoho callback unhandled error: %s", str(e), exc_info=True)
        raise HTTPException(status_code=500, detail=f"Callback error: {str(e)}")


@router.get("/status")
async def get_zoho_status(
    current_user=Depends(get_current_user_optional),
):
    user_id = get_user_id(current_user)
    logger.info("Status check — user_id=%s, current_user type=%s", user_id, type(current_user).__name__ if current_user else "None")
    if not user_id:
        logger.warning("Status — no user_id resolved")
        return {"connected": False}

    db = get_database()
    zoho = ZohoOAuth(db)
    token = await zoho.get_token(user_id)

    if not token:
        logger.warning("Status — no token found for user_id=%s", user_id)
        return {"connected": False}

    if not token.get("access_token"):
        logger.warning("Status — token exists but has no access_token for user_id=%s", user_id)
        return {"connected": False}

    logger.info("Status — valid token for user_id=%s, zoho_mail_id=%s", user_id, token.get("zoho_mail_id", ""))
    return {
        "connected": True,
        "email": token.get("zoho_mail_id", "") or get_user_email(current_user),
        "scopes": token.get("scope", "").split(","),
        "connected_at": token.get("connected_at", ""),
    }


@router.post("/disconnect")
async def disconnect_zoho(
    current_user=Depends(get_current_user_optional),
):
    user_id = get_user_id(current_user)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    db = get_database()
    zoho = ZohoOAuth(db)
    await zoho.disconnect(user_id)

    return {"disconnected": True}
