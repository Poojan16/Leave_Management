import logging
import time
from typing import Callable

import structlog
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings

# ── Fields that must never appear in logs ─────────────────────────────────────
_SCRUB_KEYS = frozenset({
    "password", "hashed_password", "access_token", "refresh_token",
    "token", "secret", "api_key", "authorization",
})


def _scrub(event_dict: dict) -> dict:
    """Remove sensitive keys from the log event dict."""
    return {
        k: "***REDACTED***" if k.lower() in _SCRUB_KEYS else v
        for k, v in event_dict.items()
    }


# ── Configure structlog ───────────────────────────────────────────────────────

def configure_logging() -> None:
    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.CallsiteParameterAdder(
            [structlog.processors.CallsiteParameter.FILENAME,
             structlog.processors.CallsiteParameter.LINENO]
        ),
    ]

    if settings.is_production:
        # JSON output for log aggregators (Datadog, CloudWatch, etc.)
        renderer = structlog.processors.JSONRenderer()
    else:
        # Colourful human-readable output for local dev
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    handler = logging.StreamHandler()
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers = [handler]
    root_logger.setLevel(logging.DEBUG if not settings.is_production else logging.INFO)

    # Silence noisy third-party loggers
    for noisy in ("uvicorn.access", "sqlalchemy.engine", "httpx"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


# ── Request logging middleware ────────────────────────────────────────────────

class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log every HTTP request with method, path, status code, and duration."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        log = structlog.get_logger("http")
        start = time.perf_counter()

        # Bind request context
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            method=request.method,
            path=request.url.path,
            client=request.client.host if request.client else "unknown",
        )

        try:
            response = await call_next(request)
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            log.info(
                "request",
                status=response.status_code,
                duration_ms=duration_ms,
            )
            return response
        except Exception as exc:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            log.error(
                "request_error",
                duration_ms=duration_ms,
                error=str(exc),
                exc_info=True,
            )
            raise
