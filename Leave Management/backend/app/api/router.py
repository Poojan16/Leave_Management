from fastapi import FastAPI
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.api.v1.auth import router as auth_router
from app.api.v1.leaves import router as leaves_router
from app.api.v1.manager import router as manager_router
from app.api.v1.admin import router as admin_router
from app.api.v1.ai import router as ai_router

limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])


def register_routers(app: FastAPI) -> None:
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    _apply_rate_limits()

    app.include_router(auth_router,    prefix="/api/v1")
    app.include_router(leaves_router,  prefix="/api/v1")
    app.include_router(manager_router, prefix="/api/v1")
    app.include_router(admin_router,   prefix="/api/v1")
    app.include_router(ai_router,      prefix="/api/v1")


def _apply_rate_limits() -> None:
    from app.api.v1 import auth as auth_module
    from app.api.v1 import ai as ai_module

    # Auth: strict 5/min
    for endpoint in [auth_module.signup, auth_module.login, auth_module.forgot_password]:
        limiter.limit("5/minute")(endpoint)

    # AI: 20/min
    for endpoint in [ai_module.parse_leave, ai_module.get_anomalies, ai_module.get_suggestions]:
        limiter.limit("20/minute")(endpoint)
