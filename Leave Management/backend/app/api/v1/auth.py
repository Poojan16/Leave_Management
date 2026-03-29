import logging
from datetime import timedelta

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, Request, status
from jose import JWTError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_current_active_user, get_db
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.crud.user import create_user, get_by_email, get_by_id
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    RefreshRequest,
    SignupRequest,
    TokenResponse,
    UserInfo,
)
from app.schemas.user import UserCreate
from app.services.email import send_reset_email, send_welcome_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])

# ── Rate limiter (imported from main app state via request) ───────────────────
# slowapi limiter is attached to app.state.limiter in router.py


def _build_token_response(user: User) -> TokenResponse:
    token_data = {"sub": str(user.id)}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
        token_type="bearer",
        user=UserInfo.model_validate(user),
    )


async def _get_redis() -> aioredis.Redis:
    return aioredis.from_url(settings.REDIS_URL, decode_responses=True)


# ── POST /auth/signup ─────────────────────────────────────────────────────────

@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(
    request: Request,
    body: SignupRequest,
    db: AsyncSession = Depends(get_db),
):
    """Register a new user. Rate limited to 5 req/min."""
    existing = await get_by_email(db, body.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    user_in = UserCreate(
        first_name=body.first_name,
        last_name=body.last_name,
        email=body.email,
        employee_id=body.employee_id,
        password=body.password,
        role=body.role,
        dept_id=body.dept_id,
        manager_id=body.manager_id,
    )

    try:
        user = await create_user(db, user_in)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Employee ID or email already exists.",
        )

    try:
        send_welcome_email(user)
    except Exception:
        logger.warning("Welcome email failed for user %s", user.email)

    return _build_token_response(user)


# ── POST /auth/login ──────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate and return access + refresh tokens. Rate limited to 5 req/min."""
    user = await get_by_email(db, body.email)
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated. Contact your administrator.",
        )
    return _build_token_response(user)


# ── POST /auth/refresh ────────────────────────────────────────────────────────

@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    """Issue a new access token from a valid refresh token."""
    invalid_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token.",
    )
    try:
        payload = decode_token(body.refresh_token)
        if payload.get("type") != "refresh":
            raise invalid_exc
        user_id: str = payload.get("sub")
        if not user_id:
            raise invalid_exc
    except JWTError:
        raise invalid_exc

    # Check blacklist
    r = await _get_redis()
    try:
        if await r.get(f"blacklist:{body.refresh_token}"):
            raise invalid_exc
    finally:
        await r.aclose()

    user = await get_by_id(db, int(user_id))
    if not user or not user.is_active:
        raise invalid_exc

    return _build_token_response(user)


# ── POST /auth/logout ─────────────────────────────────────────────────────────

@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    body: RefreshRequest,
    current_user: User = Depends(get_current_active_user),
):
    """Blacklist the refresh token in Redis (TTL = REFRESH_TOKEN_EXPIRE_DAYS)."""
    ttl = settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400
    r = await _get_redis()
    try:
        await r.setex(f"blacklist:{body.refresh_token}", ttl, "1")
    finally:
        await r.aclose()


# ── GET /auth/me ──────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserInfo)
async def me(current_user: User = Depends(get_current_active_user)):
    """Return the currently authenticated user's profile."""
    return UserInfo.model_validate(current_user)


# ── POST /auth/forgot-password ────────────────────────────────────────────────

@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
async def forgot_password(
    request: Request,
    body: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Send a password reset email. Always returns 202 to prevent user enumeration.
    Rate limited to 5 req/min.
    """
    user = await get_by_email(db, body.email)
    if user and user.is_active:
        reset_token = create_access_token(
            {"sub": str(user.id), "purpose": "reset"},
            expires_delta=timedelta(minutes=30),
        )
        try:
            send_reset_email(user, reset_token)
        except Exception:
            logger.warning("Reset email failed for %s", body.email)

    return {"detail": "If that email exists, a reset link has been sent."}


# ── POST /auth/reset-password ─────────────────────────────────────────────────

@router.post("/reset-password", status_code=status.HTTP_200_OK)
async def reset_password(
    body: PasswordResetConfirm,
    db: AsyncSession = Depends(get_db),
):
    """Validate reset token and update password."""
    invalid_exc = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid or expired reset token.",
    )
    try:
        payload = decode_token(body.token)
        if payload.get("purpose") != "reset":
            raise invalid_exc
        user_id = payload.get("sub")
    except JWTError:
        raise invalid_exc

    user = await get_by_id(db, int(user_id))
    if not user or not user.is_active:
        raise invalid_exc

    user.hashed_password = hash_password(body.new_password)
    await db.flush()

    return {"detail": "Password updated successfully."}
