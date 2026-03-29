from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.leave_balance import LeaveBalance
from app.models.leave_type import LeaveType
from app.models.user import User, UserRole

pytestmark = pytest.mark.asyncio

USERS_URL      = "/api/v1/admin/users"
DEPTS_URL      = "/api/v1/admin/departments"
LT_URL         = "/api/v1/admin/leave-types"
BALANCES_URL   = "/api/v1/admin/balances"
ALLOCATE_URL   = "/api/v1/admin/balances/allocate"
AUDIT_URL      = "/api/v1/admin/audit-logs"
EXPORT_URL     = "/api/v1/admin/reports/export"
STATS_URL      = "/api/v1/admin/reports/stats"


# ── test_admin_create_user ────────────────────────────────────────────────────

async def test_admin_create_user(
    client: AsyncClient,
    admin_headers: dict,
):
    payload = {
        "first_name": "Frank",
        "last_name": "Castle",
        "email": "frank@example.com",
        "employee_id": "EMP999",
        "password": "Secure123",
        "role": "employee",
    }
    response = await client.post(USERS_URL, json=payload, headers=admin_headers)
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["email"] == "frank@example.com"
    assert data["role"] == "employee"
    assert data["is_active"] is True


# ── test_admin_deactivate_user ────────────────────────────────────────────────

async def test_admin_deactivate_user(
    client: AsyncClient,
    admin_headers: dict,
    test_employee: User,
):
    response = await client.delete(
        f"{USERS_URL}/{test_employee.id}",
        headers=admin_headers,
    )
    assert response.status_code == 204

    # Verify user is now inactive
    get_resp = await client.get(f"{USERS_URL}/{test_employee.id}", headers=admin_headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["is_active"] is False


# ── test_admin_cannot_deactivate_self ─────────────────────────────────────────

async def test_admin_cannot_deactivate_self(
    client: AsyncClient,
    admin_headers: dict,
    test_admin: User,
):
    response = await client.delete(
        f"{USERS_URL}/{test_admin.id}",
        headers=admin_headers,
    )
    assert response.status_code == 422


# ── test_admin_create_department ──────────────────────────────────────────────

async def test_admin_create_department(
    client: AsyncClient,
    admin_headers: dict,
):
    payload = {"name": "Engineering", "description": "Software engineering team"}
    response = await client.post(DEPTS_URL, json=payload, headers=admin_headers)
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["name"] == "Engineering"
    assert data["id"] is not None


# ── test_admin_create_leave_type ──────────────────────────────────────────────

async def test_admin_create_leave_type(
    client: AsyncClient,
    admin_headers: dict,
):
    payload = {
        "name": "Paternity",
        "description": "Paternity leave",
        "max_days_per_year": 10,
        "carry_forward": False,
    }
    response = await client.post(LT_URL, json=payload, headers=admin_headers)
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["name"] == "Paternity"
    assert data["max_days_per_year"] == 10


# ── test_bulk_balance_allocation ──────────────────────────────────────────────

async def test_bulk_balance_allocation(
    client: AsyncClient,
    admin_headers: dict,
    test_employee: User,
    leave_type: LeaveType,
    db: AsyncSession,
):
    payload = {
        "user_ids": [test_employee.id],
        "leave_type_id": leave_type.id,
        "year": date.today().year,
        "days": 15,
    }
    response = await client.post(ALLOCATE_URL, json=payload, headers=admin_headers)
    assert response.status_code == 200, response.text
    assert "1 user" in response.json()["detail"]

    # Verify balance was created/updated
    bal_resp = await client.get(
        BALANCES_URL,
        params={"user_id": test_employee.id, "year": date.today().year},
        headers=admin_headers,
    )
    assert bal_resp.status_code == 200
    items = bal_resp.json()["items"]
    assert any(b["allocated"] == 15 and b["leave_type_id"] == leave_type.id for b in items)


# ── test_bulk_balance_allocation_all ─────────────────────────────────────────

async def test_bulk_balance_allocation_all(
    client: AsyncClient,
    admin_headers: dict,
    test_employee: User,
    test_manager: User,
    leave_type: LeaveType,
):
    payload = {
        "user_ids": "all",
        "leave_type_id": leave_type.id,
        "year": date.today().year,
        "days": 20,
    }
    response = await client.post(ALLOCATE_URL, json=payload, headers=admin_headers)
    assert response.status_code == 200, response.text
    # Should have allocated to at least 2 users (employee + manager + admin)
    detail = response.json()["detail"]
    assert "user" in detail


# ── test_audit_log_pagination ─────────────────────────────────────────────────

async def test_audit_log_pagination(
    client: AsyncClient,
    admin_headers: dict,
    test_employee: User,
):
    # Create a user to generate an audit log entry
    payload = {
        "first_name": "Audit",
        "last_name": "Test",
        "email": "audit@example.com",
        "employee_id": "AUD001",
        "password": "Secure123",
        "role": "employee",
    }
    await client.post(USERS_URL, json=payload, headers=admin_headers)

    response = await client.get(
        AUDIT_URL,
        params={"page": 1, "limit": 10},
        headers=admin_headers,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert "page" in data
    assert "pages" in data
    assert data["total"] >= 1
    assert data["page"] == 1


# ── test_export_pdf_returns_bytes ─────────────────────────────────────────────

async def test_export_pdf_returns_bytes(
    client: AsyncClient,
    admin_headers: dict,
):
    response = await client.get(
        EXPORT_URL,
        params={"format": "pdf", "year": date.today().year},
        headers=admin_headers,
    )
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/pdf"
    assert len(response.content) > 0
    # PDF magic bytes
    assert response.content[:4] == b"%PDF"


# ── test_export_excel_returns_bytes ──────────────────────────────────────────

async def test_export_excel_returns_bytes(
    client: AsyncClient,
    admin_headers: dict,
):
    response = await client.get(
        EXPORT_URL,
        params={"format": "xlsx", "year": date.today().year},
        headers=admin_headers,
    )
    assert response.status_code == 200, response.text
    assert "spreadsheetml" in response.headers["content-type"]
    assert len(response.content) > 0
    # XLSX is a ZIP — starts with PK
    assert response.content[:2] == b"PK"


# ── test_non_admin_cannot_access ──────────────────────────────────────────────

async def test_non_admin_cannot_access(
    client: AsyncClient,
    employee_headers: dict,
    manager_headers: dict,
):
    for headers in [employee_headers, manager_headers]:
        r = await client.get(USERS_URL, headers=headers)
        assert r.status_code == 403

        r = await client.get(DEPTS_URL, headers=headers)
        assert r.status_code == 403

        r = await client.get(AUDIT_URL, headers=headers)
        assert r.status_code == 403
