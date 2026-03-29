import pytest
from httpx import AsyncClient

from app.models.user import User

pytestmark = pytest.mark.asyncio

SIGNUP_URL = "/api/v1/auth/signup"
LOGIN_URL = "/api/v1/auth/login"
REFRESH_URL = "/api/v1/auth/refresh"
ME_URL = "/api/v1/auth/me"

VALID_SIGNUP = {
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com",
    "employee_id": "EMP999",
    "password": "Secure123",
    "role": "employee",
}


# ── test_signup_success ───────────────────────────────────────────────────────

async def test_signup_success(client: AsyncClient):
    response = await client.post(SIGNUP_URL, json=VALID_SIGNUP)
    assert response.status_code == 201
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == VALID_SIGNUP["email"]
    assert data["user"]["role"] == "employee"


# ── test_signup_duplicate_email ───────────────────────────────────────────────

async def test_signup_duplicate_email(client: AsyncClient, test_employee: User):
    payload = {**VALID_SIGNUP, "email": test_employee.email, "employee_id": "EMP998"}
    response = await client.post(SIGNUP_URL, json=payload)
    assert response.status_code == 409
    assert "already exists" in response.json()["detail"].lower()


# ── test_signup_weak_password ─────────────────────────────────────────────────

async def test_signup_weak_password(client: AsyncClient):
    payload = {**VALID_SIGNUP, "password": "short"}
    response = await client.post(SIGNUP_URL, json=payload)
    assert response.status_code == 422


# ── test_login_success ────────────────────────────────────────────────────────

async def test_login_success(client: AsyncClient, test_employee: User):
    response = await client.post(
        LOGIN_URL,
        json={"email": test_employee.email, "password": "Password1"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["email"] == test_employee.email


# ── test_login_wrong_password ─────────────────────────────────────────────────

async def test_login_wrong_password(client: AsyncClient, test_employee: User):
    response = await client.post(
        LOGIN_URL,
        json={"email": test_employee.email, "password": "WrongPass99"},
    )
    assert response.status_code == 401
    assert "invalid" in response.json()["detail"].lower()


# ── test_refresh_token ────────────────────────────────────────────────────────

async def test_refresh_token(client: AsyncClient, test_employee: User):
    # First login to get tokens
    login_resp = await client.post(
        LOGIN_URL,
        json={"email": test_employee.email, "password": "Password1"},
    )
    assert login_resp.status_code == 200
    refresh_token = login_resp.json()["refresh_token"]

    # Use refresh token to get new access token
    refresh_resp = await client.post(
        REFRESH_URL,
        json={"refresh_token": refresh_token},
    )
    assert refresh_resp.status_code == 200
    data = refresh_resp.json()
    assert "access_token" in data
    assert data["access_token"] != login_resp.json()["access_token"]


# ── test_protected_route_no_token ─────────────────────────────────────────────

async def test_protected_route_no_token(client: AsyncClient):
    response = await client.get(ME_URL)
    assert response.status_code == 401


# ── test_protected_route_invalid_token ───────────────────────────────────────

async def test_protected_route_invalid_token(client: AsyncClient):
    response = await client.get(
        ME_URL,
        headers={"Authorization": "Bearer this.is.not.valid"},
    )
    assert response.status_code == 401


# ── test_me_returns_current_user ──────────────────────────────────────────────

async def test_me_returns_current_user(
    client: AsyncClient, test_employee: User, employee_headers: dict
):
    response = await client.get(ME_URL, headers=employee_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == test_employee.email
    assert data["id"] == test_employee.id


# ── test_login_inactive_user ──────────────────────────────────────────────────

async def test_login_inactive_user(client: AsyncClient, inactive_user: User):
    response = await client.post(
        LOGIN_URL,
        json={"email": inactive_user.email, "password": "Password1"},
    )
    assert response.status_code == 403
    assert "deactivated" in response.json()["detail"].lower()
