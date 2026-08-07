import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from ..core.database import get_database
from ..core.google import GoogleOAuth
from ..dependencies.auth import get_current_user_optional

logger = logging.getLogger("yesboss.google_auth")
router = APIRouter()


def get_user_id(user) -> str | None:
    if user is None:
        return None
    return getattr(user, "id", None) or getattr(user, "email", None)


def get_user_email(user) -> str:
    if user is None:
        return ""
    return getattr(user, "email", "")


def _request_origin(request: Request) -> str:
    """Return the public origin (scheme://netloc) of this request.

    The app sits behind nginx which terminates TLS, so the upstream request uvicorn
    sees is plain http — request.base_url is therefore http://vsllp.live. For any
    non-loopback host, upgrade to https so OAuth redirect URIs match the registered
    public https URLs. Loopback hosts (localhost / 127.0.0.1) are normalized to
    localhost and left as http (local dev).
    """
    base = str(request.base_url).rstrip("/")
    base = base.replace("://127.0.0.1", "://localhost", 1)
    host = (request.url.hostname or "").lower()
    loopback = host in ("localhost", "127.0.0.1", "::1", "0.0.0.0", "testserver")
    if not loopback and base.startswith("http://"):
        base = "https://" + base[len("http://"):]
    return base


@router.get("/auth-url")
async def get_auth_url(
    request: Request,
    current_user=Depends(get_current_user_optional),
):
    user_id = get_user_id(current_user)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    google = GoogleOAuth(get_database())
    try:
        redirect_uri = f"{_request_origin(request)}/api/v1/google/callback"
        url = google.get_auth_url(state=user_id, redirect_uri=redirect_uri)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"url": url}


@router.get("/callback")
async def google_callback(
    request: Request,
    code: str = Query(...),
    state: str | None = Query(None),
    error: str | None = Query(None),
):
    try:
        if error:
            logger.warning("Google OAuth error: %s", error)
            raise HTTPException(status_code=400, detail=f"Google authorization failed: {error}")

        if not code:
            raise HTTPException(status_code=400, detail="Missing authorization code")

        logger.info("Google callback received: code=%s... state=%s", code[:20] if code else "", state)

        db = get_database()
        google = GoogleOAuth(db)

        redirect_uri = f"{_request_origin(request)}/api/v1/google/callback"

        token_data = await google.exchange_code(code, redirect_uri=redirect_uri)
        if not token_data:
            logger.error("Google exchange_code returned None — check client_id/secret match Google Cloud console")
            raise HTTPException(status_code=502, detail="Failed to exchange authorization code. Verify the Client ID and Secret match what's in the Google Cloud console")

        logger.info("Google exchange_code succeeded — keys=%s, has_access_token=%s",
                     list(token_data.keys()), bool(token_data.get("access_token")))

        access_token = token_data.get("access_token", "")
        if not access_token:
            error_detail = token_data.get("error", "unknown_error")
            error_desc = token_data.get("error_description", token_data)
            logger.error("Google exchange_code returned error — error=%s, description=%s, full_response=%s",
                         error_detail, error_desc, token_data)
            raise HTTPException(
                status_code=502,
                detail=f"Google token exchange failed: {error_detail}. {error_desc}. "
                       f"Verify your Google Cloud OAuth client configuration (Client ID, Secret, Redirect URI) "
                       f"matches what's in your backend .env file."
            )

        user_email = await google.get_user_email(access_token)

        user_id = state or ""
        org_id = ""
        user_doc_email = ""

        if user_id and db is not None:
            try:
                user_doc = db.users.find_one({"uid": user_id})
                if user_doc:
                    user_doc_email = user_doc.get("email", "")
            except Exception:
                pass
            try:
                org = db.organizations.find_one({"owner_id": user_id})
                if org:
                    org_id = str(org["_id"])
            except Exception:
                pass

        saved = await google.save_token(user_id, org_id, token_data, email=user_email or user_doc_email or user_id)
        logger.info("Callback saved token — user_id=%s, org_id=%s, email=%s, success=%s",
                     user_id, org_id, user_email, saved)

        if not saved:
            logger.error("Failed to save Google token for user_id=%s — will not redirect to success page", user_id)
            raise HTTPException(status_code=502, detail="Failed to save Google token. Please try again.")

        # Either/or: connecting Google disconnects Zoho for this user
        if user_id and db is not None:
            try:
                db.zoho_tokens.delete_one({"user_id": user_id})
                logger.info("Either/or: removed Zoho token for user_id=%s after Google connect", user_id)
            except Exception as e:
                logger.warning("Either/or: could not remove Zoho token for user_id=%s: %s", user_id, e)

        from ..core.config import settings
        frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:3000")
        # Prefer the request's own public origin (reliable behind nginx) over the env value.
        request_origin = _request_origin(request)
        if request_origin and "localhost" not in request_origin:
            frontend_url = request_origin
        # Land on a public success page (no auth) that auto-closes the OAuth popup.
        redirect_url = f"{frontend_url}/oauth/connected?provider=google"

        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=redirect_url, status_code=302)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Google callback unhandled error: %s", str(e), exc_info=True)
        raise HTTPException(status_code=500, detail=f"Callback error: {str(e)}")


@router.get("/status")
async def get_google_status(
    current_user=Depends(get_current_user_optional),
):
    user_id = get_user_id(current_user)
    logger.info("Status check — user_id=%s, current_user type=%s", user_id, type(current_user).__name__ if current_user else "None")
    if not user_id:
        logger.warning("Status — no user_id resolved")
        return {"connected": False}

    db = get_database()
    google = GoogleOAuth(db)
    token = await google.get_token(user_id)

    if not token:
        logger.warning("Status — no token found for user_id=%s", user_id)
        return {"connected": False}

    if not token.get("access_token"):
        logger.warning("Status — token exists but has no access_token for user_id=%s", user_id)
        return {"connected": False}

    logger.info("Status — valid token for user_id=%s, email=%s", user_id, token.get("email", ""))
    return {
        "connected": True,
        "email": token.get("email", "") or get_user_email(current_user),
        "scopes": token.get("scope", "").split(),
        "connected_at": token.get("connected_at", ""),
        "provider": "google",
    }


@router.post("/disconnect")
async def disconnect_google(
    current_user=Depends(get_current_user_optional),
):
    user_id = get_user_id(current_user)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    db = get_database()
    google = GoogleOAuth(db)
    await google.disconnect(user_id)

    return {"disconnected": True}
