import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
import time


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

from .api.health import router as health_router
from .api.auth import router as auth_router
from .api.organizations import router as organizations_router
from .api.employees import router as employees_router
from .api.upload import router as upload_router
from .api.scrape import router as scrape_router
from .api.intelligence import router as intelligence_router
from .api.master_agent import router as agent_router
from .api.expert_agents import router as expert_agents_router
from .api.chatbot import router as chatbot_router
from .api.file_processing import router as file_processing_router
from .api.social import router as social_router
from .api.goals import router as goals_router
from .api.tasks import router as tasks_router
from .api.dashboard import router as dashboard_router
from .api.executive_chat import router as executive_chat_router
from .api.learning import router as learning_router
from .api.websocket import router as websocket_router
from .api.org_chart import router as org_chart_router
from .api.reports import router as reports_router
from .api.market_trends import router as market_trends_router
from .core import settings
from .core.database import connect_mongodb, close_mongodb
from .core.qdrant import connect_qdrant, close_qdrant
from .core.supabase_client import connect_supabase
from .core.socket_manager import socket_manager

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

    logger.info("All services initialized")

    yield

    logger.info("Shutting down YesBoss API...")
    close_mongodb()
    close_qdrant()
    logger.info("All services disconnected")


app = FastAPI(
    title="YesBoss API",
    description="AI Business Operating System - Backend API",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(SecurityHeadersMiddleware)

allowed_origins = settings.__dict__.get("CORS_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins if allowed_origins != ["*"] else ["*"],
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


app.include_router(health_router, prefix="/api/v1", tags=["Health"])
app.include_router(auth_router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(organizations_router, prefix="/api/v1/organizations", tags=["Organizations"])
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
app.include_router(executive_chat_router, prefix="/api/v1/executive-chat", tags=["Executive Chat"])
app.include_router(learning_router, prefix="/api/v1/learning", tags=["Continuous Learning"])
app.include_router(org_chart_router, prefix="/api/v1/org-chart", tags=["Org Chart"])
app.include_router(reports_router, prefix="/api/v1/reports", tags=["Reports"])
app.include_router(market_trends_router, prefix="/api/v1/trends", tags=["Market Trends"])
app.include_router(websocket_router, tags=["WebSocket"])
