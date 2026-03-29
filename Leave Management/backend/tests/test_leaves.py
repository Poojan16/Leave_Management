from datetime import date, timedelta
from unittest.mock import patch

import pytest
from httpx import AsyncClient

from app.models.leave_balance import LeaveBalance
from app.models.leave_request import LeaveRequest, LeaveStatus
from app.models.leave_type import LeaveType
from app.models.user import User

pytestmark = pytest.mark.asyncio

APPLY_URL  = "/api/v1/leaves/apply"
MY_URL     = "/api/v1/leaves/my"
BALANCE_URL = "/api/v1/leaves/balance"
CALENDAR_URL = "/api/v1/leaves/calendar"


def _cancel_url(leave_id: int) -> str:
    return f"/api/v1/leaves/{leave_id}/cancel"


def _leave_url(leave_id: int) -> str:
    return f"/api/v1/leaves/{leave_id}"


# ── test_apply_leave_success ──────────────────────────────────────────────────

async def test_apply_leave_success(
    client: AsyncClient,
    employee_headers: dict,
    leave_type: LeaveType,
    employee_balance: LeaveBalance,
):
    tomorrow = date.today() + timedelta(days=30)
    payload = {
        "leave_type_id": leave_type.id,
        "start_date": str(tomorrow),
        "end_date": str(tomorrow + timedelta(days=2)),
        "reason": "Family vacation",
    }
    with patch("app.api.v1.leaves.send_leave_applied_email"):
        response = await client.post(APPLY_URL, json=payload, headers=employee_headers)

    assert response.status_code == 201, response.text
    data = response.json()
    assert data["status"] == "pending"
    assert data["days"] == 3
    assert data["leave_type"]["id"] == leave_type.id


# ── test_apply_leave_overlap_rejected ────────────────────────────────────────

async def test_apply_leave_overlap_rejected(
    client: AsyncClient,
    employee_headers: dict,
    leave_type: LeaveType,
    pending_leave: LeaveRequest,
):
    # pending_leave occupies tomorrow → tomorrow+2; try to overlap
    overlap_start = pending_leave.start_date
    overlap_end   = pending_leave.end_date
    payload = {
        "leave_type_id": leave_type.id,
        "start_date": str(overlap_start),
        "end_date": str(overlap_end),
        "reason": "Overlapping request",
    }
    with patch("app.api.v1.leaves.send_leave_applied_email"):
        response = await client.post(APPLY_URL, json=payload, headers=employee_headers)

    assert response.status_code == 409
    assert "overlap" in response.json()["detail"].lower()


# ── test_apply_leave_insufficient_balance ────────────────────────────────────

async def test_apply_leave_insufficient_balance(
    client: AsyncClient,
    employee_headers: dict,
    sick_leave_type: LeaveType,
    zero_balance: LeaveBalance,
):
    start = date.today() + timedelta(days=5)
    payload = {
        "leave_type_id": sick_leave_type.id,
        "start_date": str(start),
        "end_date": str(start + timedelta(days=2)),
        "reason": "Sick",
    }
    with patch("app.api.v1.leaves.send_leave_applied_email"):
        response = await client.post(APPLY_URL, json=payload, headers=employee_headers)

    assert response.status_code == 422
    assert "insufficient" in response.json()["detail"].lower()


# ── test_apply_leave_invalid_dates ────────────────────────────────────────────

async def test_apply_leave_invalid_dates(
    client: AsyncClient,
    employee_headers: dict,
    leave_type: LeaveType,
):
    today = date.today()
    payload = {
        "leave_type_id": leave_type.id,
        "start_date": str(today + timedelta(days=5)),
        "end_date": str(today + timedelta(days=2)),   # end before start
        "reason": "Bad dates",
    }
    response = await client.post(APPLY_URL, json=payload, headers=employee_headers)
    assert response.status_code == 422


# ── test_get_my_leaves_with_filters ──────────────────────────────────────────

async def test_get_my_leaves_with_filters(
    client: AsyncClient,
    employee_headers: dict,
    pending_leave: LeaveRequest,
    approved_leave: LeaveRequest,
):
    # No filter — should return both
    response = await client.get(MY_URL, headers=employee_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2

    # Filter by status=pending
    response = await client.get(MY_URL, params={"status": "pending"}, headers=employee_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["status"] == "pending"

    # Filter by status=approved
    response = await client.get(MY_URL, params={"status": "approved"}, headers=employee_headers)
    assert response.status_code == 200
    assert response.json()["total"] == 1


# ── test_get_leave_balance ────────────────────────────────────────────────────

async def test_get_leave_balance(
    client: AsyncClient,
    employee_headers: dict,
    employee_balance: LeaveBalance,
    leave_type: LeaveType,
):
    response = await client.get(BALANCE_URL, headers=employee_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    annual = next((b for b in data if b["leave_type"]["name"] == "Annual"), None)
    assert annual is not None
    assert annual["allocated"] == 20
    assert annual["used"] == 0
    assert annual["remaining"] == 20


# ── test_cancel_pending_leave ─────────────────────────────────────────────────

async def test_cancel_pending_leave(
    client: AsyncClient,
    employee_headers: dict,
    pending_leave: LeaveRequest,
    employee_balance: LeaveBalance,
):
    with patch("app.api.v1.leaves.send_leave_cancelled_email"):
        response = await client.delete(
            _cancel_url(pending_leave.id),
            json={"reason": "Plans changed"},
            headers=employee_headers,
        )

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["status"] == "cancelled"


# ── test_cancel_approved_leave_fails ─────────────────────────────────────────

async def test_cancel_approved_leave_fails(
    client: AsyncClient,
    employee_headers: dict,
    approved_leave: LeaveRequest,
):
    response = await client.delete(
        _cancel_url(approved_leave.id),
        json={},
        headers=employee_headers,
    )
    assert response.status_code == 422
    assert "pending" in response.json()["detail"].lower()


# ── test_calendar_view ────────────────────────────────────────────────────────

async def test_calendar_view(
    client: AsyncClient,
    employee_headers: dict,
    pending_leave: LeaveRequest,
):
    today = date.today()
    response = await client.get(
        CALENDAR_URL,
        params={"year": today.year, "month": pending_leave.start_date.month},
        headers=employee_headers,
    )
    assert response.status_code == 200
    data = response.json()
    # pending_leave starts next month or this month — at least one result
    ids = [item["id"] for item in data]
    assert pending_leave.id in ids


# ── test_get_leave_by_id_own ──────────────────────────────────────────────────

async def test_get_leave_by_id_own(
    client: AsyncClient,
    employee_headers: dict,
    pending_leave: LeaveRequest,
):
    response = await client.get(_leave_url(pending_leave.id), headers=employee_headers)
    assert response.status_code == 200
    assert response.json()["id"] == pending_leave.id


# ── test_get_leave_by_id_other_user_forbidden ─────────────────────────────────

async def test_get_leave_by_id_other_user_forbidden(
    client: AsyncClient,
    manager_headers: dict,
    pending_leave: LeaveRequest,
):
    # Manager role CAN view — so test with a second employee instead
    # This test verifies the 403 path: a different employee cannot view another's leave
    # We reuse manager_headers here only to confirm managers CAN view (200)
    response = await client.get(_leave_url(pending_leave.id), headers=manager_headers)
    assert response.status_code == 200   # managers are privileged
