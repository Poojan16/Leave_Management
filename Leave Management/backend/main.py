from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration
from sentry_sdk.integrations.logging import LoggingIntegration
import logging

from app.core.config import settings
from app.core.database import engine, Base
from app.core.logging import configure_logging, RequestLoggingMiddleware
from app.api.router import register_routers

# ── Logging ───────────────────────────────────────────────────────────────────
configure_logging()
logger = logging.getLogger(__name__)

# ── Sentry ────────────────────────────────────────────────────────────────────
if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        integrations=[
            StarletteIntegration(transaction_style="endpoint"),
            FastApiIntegration(transaction_style="endpoint"),
            LoggingIntegration(level=logging.INFO, event_level=logging.ERROR),
        ],
        traces_sample_rate=0.1 if settings.is_production else 1.0,
        profiles_sample_rate=0.1 if settings.is_production else 0.0,
        send_default_pii=False,
        attach_stacktrace=True,
        release=f"lms@{settings.APP_VERSION}",
    )
    logger.info("Sentry initialised", extra={"environment": settings.ENVIRONMENT})


# ── Lifespan ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up Leave Management System API v%s", settings.APP_VERSION)
    async with engine.begin() as conn:
        await conn.run_sync(lambda _: None)
    yield
    logger.info("Shutting down")
    await engine.dispose()


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_TITLE,
    version=settings.APP_VERSION,
    description="Production-ready Leave Management System API",
    docs_url="/api/docs" if not settings.is_production else None,
    redoc_url="/api/redoc" if not settings.is_production else None,
    lifespan=lifespan,
)

# ── Middleware ────────────────────────────────────────────────────────────────
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
register_routers(app)


# ── Global error handler — attach Sentry user context ────────────────────────
@app.middleware("http")
async def sentry_user_context(request: Request, call_next):
    if settings.SENTRY_DSN:
        token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        if token:
            try:
                from app.core.security import decode_token
                payload = decode_token(token)
                sentry_sdk.set_user({"id": payload.get("sub")})
            except Exception:
                pass
    return await call_next(request)


# ── Health Check ──────────────────────────────────────────────────────────────
@app.get("/health", tags=["Health"])
async def health_check():
    return JSONResponse(
        status_code=200,
        content={
            "status": "healthy",
            "service": settings.APP_TITLE,
            "version": settings.APP_VERSION,
            "environment": settings.ENVIRONMENT,
        },
    )


@app.get("/", tags=["Root"])
async def root():
    return {
        "service": settings.APP_TITLE,
        "version": settings.APP_VERSION,
        "docs": "/api/docs",
        "health": "/health",
    }
