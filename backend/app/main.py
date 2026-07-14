import asyncio
import logging
import time
import uuid
from collections import defaultdict
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_requests: int = 60, window_seconds: int = 60):
        super().__init__(app)
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests: dict = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        if request.url.path.startswith("/api/v1/health"):
            return await call_next(request)

        key = request.client.host if request.client else "unknown"
        now = time.time()
        window_start = now - self.window_seconds
        self.requests[key] = [t for t in self.requests[key] if t > window_start]

        if len(self.requests[key]) >= self.max_requests:
            return JSONResponse(status_code=429, content={"error": True, "detail": "Rate limit exceeded. Try again later."})

        self.requests[key].append(now)
        return await call_next(request)


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-Id") or str(uuid.uuid4())
        response = await call_next(request)
        response.headers["X-Request-Id"] = request_id
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        if request.url.path.startswith("/api/docs"):
            response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https://fastapi.tiangolo.com; font-src 'self' data:; object-src 'none'; frame-ancestors 'none'"
        else:
            response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; object-src 'none'; frame-ancestors 'none'"

        return response


class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method in ("POST", "PUT", "PATCH", "DELETE"):
            origin = request.headers.get("Origin", "")
            referer = request.headers.get("Referer", "")

            cors_origins_str = getattr(settings, "CORS_ORIGINS", "")
            allowed = []
            if cors_origins_str:
                allowed = [o.strip() for o in cors_origins_str.split(",") if o.strip()]

            if allowed and allowed != ["*"]:
                is_valid = False
                for allowed_origin in allowed:
                    if origin and origin.rstrip("/") == allowed_origin.rstrip("/"):
                        is_valid = True
                        break
                    if referer and referer.startswith(allowed_origin.rstrip("/")):
                        is_valid = True
                        break
                if not is_valid and not origin and not referer:
                    is_valid = True

                if not is_valid:
                    logger.warning("CSRF check failed: method=%s path=%s origin=%s referer=%s", request.method, request.url.path, origin, referer)
                    return JSONResponse(
                        status_code=status.HTTP_403_FORBIDDEN,
                        content={"error": True, "detail": "CSRF check failed. Invalid Origin or Referer."},
                    )

        return await call_next(request)

from .api.assistant import router as assistant_router
from .api.auth import router as auth_router
from .api.chatbot import router as chatbot_router
from .api.check_ins import router as check_ins_router
from .api.dashboard import router as dashboard_router
from .api.employees import router as employees_router
from .api.expert_agents import router as expert_agents_router
from .api.file_processing import router as file_processing_router
from .api.goals import router as goals_router
from .api.health import router as health_router
from .api.intelligence import router as intelligence_router
from .api.journal import router as journal_router
from .api.learning import router as learning_router
from .api.market_trends import router as market_trends_router
from .api.master_agent import router as agent_router
from .api.meetings import router as meetings_router
from .api.notification_preferences import router as notification_preferences_router
from .api.notifications import router as notifications_router
from .api.org_chart import router as org_chart_router
from .api.organizations import router as organizations_router
from .api.owner_requests import router as owner_requests_router
from .api.prompt import router as prompt_router
from .api.push_subscriptions import router as push_subscriptions_router
from .api.reports import router as reports_router
from .api.scrape import router as scrape_router
from .api.smart_suggestions import router as smart_suggestions_router
from .api.social import router as social_router
from .api.strategy_chat import router as strategy_chat_router
from .api.tasks import router as tasks_router
from .api.upload import router as upload_router
from .api.websocket import router as websocket_router
from .api.zoho_auth import router as zoho_auth_router
from .api.zoho_calendar import router as zoho_calendar_router
from .core import settings
from .core.database import close_mongodb, connect_mongodb, get_database
from .core.qdrant import close_qdrant, connect_qdrant
from .core.supabase_client import connect_supabase

logger = logging.getLogger("yesboss.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting YesBoss API...")

    connect_mongodb()
    connect_qdrant()
    connect_supabase()

    from .core.qdrant import create_collection
    create_collection("documents", 1536)
    create_collection("conversations", 1536)
    create_collection("workflows", 1536)

    scheduler_task = None
    try:
        from .core.scheduler import scheduler_loop
        scheduler_task = asyncio.create_task(scheduler_loop())
        logger.info("Scheduler started")
    except Exception as e:
        logger.warning(f"Scheduler not started: {e}")

    try:
        db = get_database()
        if db is not None:
            count = db.goals.count_documents({"status": "active", "review_frequency_days": {"$exists": False}})
            if count:
                db.goals.update_many(
                    {"status": "active", "review_frequency_days": {"$exists": False}},
                    [{"$set": {
                        "review_frequency_days": {
                            "$switch": {
                                "branches": [
                                    {"case": {"$and": [{"$eq": ["$goal_type", "short_term"]}, {"$eq": ["$duration", "one_time"]}]}, "then": 3},
                                    {"case": {"$eq": ["$goal_type", "short_term"]}, "then": 5},
                                ],
                                "default": 7,
                            }
                        }
                    }}]
                )
                logger.info("Backfilled review_frequency_days for %d existing goals", count)
    except Exception as e:
        logger.warning("Review frequency backfill skipped: %s", e)

    logger.info("All services initialized")

    yield

    if scheduler_task:
        scheduler_task.cancel()
        logger.info("Scheduler stopped")

    logger.info("Shutting down YesBoss API...")
    close_mongodb()
    close_qdrant()
    logger.info("All services disconnected")


app = FastAPI(
    title="YesBoss API",
    description="AI Business Operating System - Backend API",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
)

# Sentry
sentry_dsn = getattr(settings, "SENTRY_DSN", "")
if sentry_dsn:
    try:
        import sentry_sdk
        sentry_sdk.init(dsn=sentry_dsn, traces_sample_rate=0.1)
        logger.info("Sentry initialized")
    except ImportError:
        logger.info("sentry-sdk not installed, skipping Sentry")

app.add_middleware(RequestIDMiddleware)
app.add_middleware(CSRFMiddleware)
app.add_middleware(RateLimitMiddleware, max_requests=60, window_seconds=60)
app.add_middleware(SecurityHeadersMiddleware)

cors_origins_str = getattr(settings, "CORS_ORIGINS", "")
if cors_origins_str:
    allowed_origins = [o.strip() for o in cors_origins_str.split(",") if o.strip()]
else:
    allowed_origins = ["*"] if settings.DEBUG else []

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Request-Id", "X-Response-Time"],
)


@app.middleware("http")
async def request_timing_middleware(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Response-Time"] = f"{process_time:.3f}s"
    return response


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": True,
            "status_code": exc.status_code,
            "detail": exc.detail,
            "path": str(request.url.path),
        },
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled error: %s", str(exc), exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": True,
            "status_code": 500,
            "detail": "Internal server error",
            "path": str(request.url.path),
        },
    )


@app.get("/")
async def root():
    return {
        "name": "YesBoss API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/api/docs",
    }


def _require_admin(request: Request):
    if settings.ENVIRONMENT == "production":
        raise HTTPException(status_code=404, detail="Not found")
    admin_key = request.headers.get("X-Admin-Key") or request.query_params.get("admin_key")
    if not admin_key or admin_key != settings.ADMIN_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required. Provide X-Admin-Key header or ?admin_key= param.",
        )


@app.get("/api/openapi.json", include_in_schema=False)
async def get_openapi(request: Request):
    _require_admin(request)
    return app.openapi()


@app.get("/api/docs", include_in_schema=False)
async def get_docs(request: Request):
    _require_admin(request)
    spec_url = f"/api/openapi.json?admin_key={settings.ADMIN_API_KEY}"
    return get_swagger_ui_html(
        openapi_url=spec_url,
        title=app.title + " - Swagger UI",
        oauth2_redirect_url=app.swagger_ui_oauth2_redirect_url,
        swagger_js_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js",
        swagger_css_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css",
    )


@app.get("/api/redoc", include_in_schema=False)
async def get_redoc(request: Request):
    _require_admin(request)
    spec_url = f"/api/openapi.json?admin_key={settings.ADMIN_API_KEY}"
    return get_redoc_html(
        openapi_url=spec_url,
        title=app.title + " - ReDoc",
        redoc_js_url="https://cdn.jsdelivr.net/npm/redoc@next/bundles/redoc.standalone.js",
    )


@app.get("/api/v1/")
async def api_root():
    return {"status": "ok", "version": "1.0.0"}


app.include_router(health_router, prefix="/api/v1", tags=["Health"])
app.include_router(auth_router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(organizations_router, prefix="/api/v1/organizations", tags=["Organizations"])
app.include_router(owner_requests_router, prefix="/api/v1", tags=["Owner Requests"])
app.include_router(employees_router, prefix="/api/v1/employees", tags=["Employees"])
app.include_router(upload_router, prefix="/api/v1/upload", tags=["Upload"])
app.include_router(scrape_router, prefix="/api/v1/scrape", tags=["Scraper"])
app.include_router(intelligence_router, prefix="/api/v1/intelligence", tags=["Intelligence"])
app.include_router(agent_router, prefix="/api/v1/agent", tags=["Master Agent"])
app.include_router(expert_agents_router, prefix="/api/v1/expert-agents", tags=["Expert Agents"])
app.include_router(chatbot_router, prefix="/api/v1/chatbot", tags=["Chatbot"])
app.include_router(file_processing_router, prefix="/api/v1/files", tags=["File Processing"])
app.include_router(social_router, prefix="/api/v1/social", tags=["Social Detection"])
app.include_router(goals_router, prefix="/api/v1/goals", tags=["Goals"])
app.include_router(tasks_router, prefix="/api/v1/tasks", tags=["Tasks"])
app.include_router(dashboard_router, prefix="/api/v1/dashboard", tags=["Dashboard"])
app.include_router(strategy_chat_router, prefix="/api/v1/strategy-chat", tags=["Strategy Chat"])
app.include_router(learning_router, prefix="/api/v1/learning", tags=["Continuous Learning"])
app.include_router(org_chart_router, prefix="/api/v1/org-chart", tags=["Org Chart"])
app.include_router(reports_router, prefix="/api/v1/reports", tags=["Reports"])
app.include_router(market_trends_router, prefix="/api/v1/trends", tags=["Market Trends"])
app.include_router(prompt_router, prefix="/api/v1/prompt", tags=["Prompt Engine"])
app.include_router(assistant_router, prefix="/api/v1/assistant", tags=["AI Assistant"])
app.include_router(notifications_router, prefix="/api/v1/notifications", tags=["Notifications"])
app.include_router(notification_preferences_router, prefix="/api/v1/notification-preferences", tags=["Notification Preferences"])
app.include_router(meetings_router, prefix="/api/v1/meetings", tags=["Meetings"])
app.include_router(push_subscriptions_router, prefix="/api/v1/push", tags=["Push Notifications"])
app.include_router(zoho_auth_router, prefix="/api/v1/zoho", tags=["Zoho Auth"])
app.include_router(zoho_calendar_router, prefix="/api/v1/zoho/calendar", tags=["Zoho Calendar"])
app.include_router(check_ins_router, prefix="/api/v1/organizations", tags=["Check-Ins"])
app.include_router(smart_suggestions_router, prefix="/api/v1/smart", tags=["Smart Suggestions"])
app.include_router(websocket_router, tags=["WebSocket"])
app.include_router(journal_router, prefix="/api/v1/journal", tags=["Journal"])
