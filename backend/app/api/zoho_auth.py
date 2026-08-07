import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from ..core.database import get_database
from ..core.zoho import ZohoOAuth
from ..dependencies.auth import get_current_user_optional

logger = logging.getLogger("yesboss.zoho_auth")
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
    zoho = ZohoOAuth(get_database())
    redirect_uri = f"{_request_origin(request)}/api/v1/zoho/callback"
    url = zoho.get_auth_url(state=user_id, redirect_uri=redirect_uri)
    return {"url": url}


@router.get("/callback")
async def zoho_callback(
    request: Request,
    code: str = Query(...),
    state: str | None = Query(None),
    error: str | None = Query(None),
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

        # The redirect URI must exactly match the one used in the auth URL — derive
        # it from this callback's own origin so it works on any host/env.
        redirect_uri = f"{_request_origin(request)}/api/v1/zoho/callback"

        token_data = await zoho.exchange_code(code, redirect_uri=redirect_uri)
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

        # Either/or: connecting Zoho disconnects Google for this user
        if user_id and db is not None:
            try:
                db.google_tokens.delete_one({"user_id": user_id})
                logger.info("Either/or: removed Google token for user_id=%s after Zoho connect", user_id)
            except Exception as e:
                logger.warning("Either/or: could not remove Google token for user_id=%s: %s", user_id, e)

        # Backfill: push any pending YesBoss tasks assigned to this user to Zoho
        # now that they're connected. Normally the retry scheduler handles this,
        # but doing it immediately populates their Zoho To-Do right away.
        try:
            import asyncio

            from ..api.tasks import sync_task_to_zoho

            match_email = (user_email or "").strip().lower()
            if match_email and db is not None:
                pending_tasks = list(db.tasks.find({
                    "zoho_sync_status": {"$ne": "synced"},
                    "$or": [
                        {"assignee_email": {"$regex": f"^{re.escape(match_email)}$", "$options": "i"}},
                        {"assignee_id": match_email},
                    ],
                }))
                for t in pending_tasks:
                    t_org = t.get("organization_id", "")
                    if t_org:
                        asyncio.create_task(sync_task_to_zoho(db, t, t_org))
                if pending_tasks:
                    logger.info("Scheduled Zoho backfill for %s pending tasks of %s", len(pending_tasks), match_email)
        except Exception as e:
            logger.warning("Zoho backfill scheduling failed: %s", e)

        from ..core.config import settings
        frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:3000")
        # Prefer the request's own public origin (reliable behind nginx) over the env value.
        request_origin = _request_origin(request)
        if request_origin and "localhost" not in request_origin:
            frontend_url = request_origin
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
