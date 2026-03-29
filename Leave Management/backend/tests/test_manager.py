from datetime import date, timedelta
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.leave_balance import LeaveBalance
from app.models.leave_request import LeaveRequest, LeaveStatus
from app.models.leave_type import LeaveType
from app.models.user import User

pytestmark = pytest.mark.asyncio

TEAM_LEAVES_URL  = "/api/v1/manager/leaves"
STATS_URL        = "/api/v1/manager/stats"
CALENDAR_URL     = "/api/v1/manager/team-calendar"
CONFLICTS_URL    = "/api/v1/manager/team-conflicts"


def _approve_url(leave_id: int) -> str:
    return f"/api/v1/manager/leaves/{leave_id}/approve"


def _reject_url(leave_id: int) -> str:
    return f"/api/v1/manager/leaves/{leave_id}/reject"


# ── test_manager_can_see_team_leaves ──────────────────────────────────────────

async def test_manager_can_see_team_leaves(
    client: AsyncClient,
    manager_headers: dict,
    team_pending_leave: LeaveRequest,
):
    response = await client.get(TEAM_LEAVES_URL, headers=manager_headers)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["id"] == team_pending_leave.id
    assert data["items"][0]["employee_name"] == "Dave Brown"


# ── test_manager_cannot_see_other_team_leaves ─────────────────────────────────

async def test_manager_cannot_see_other_team_leaves(
    client: AsyncClient,
    manager_headers: dict,
    other_team_leave: LeaveRequest,
):
    """Leave from an employee not under this manager must not appear."""
    response = await client.get(TEAM_LEAVES_URL, headers=manager_headers)
    assert response.status_code == 200, response.text
    data = response.json()
    # other_team_leave belongs to other_employee who has no manager_id set
    ids = [item["id"] for item in data["items"]]
    assert other_team_leave.id not in ids


# ── test_approve_leave_success ────────────────────────────────────────────────

async def test_approve_leave_success(
    client: AsyncClient,
    manager_headers: dict,
    team_pending_leave: LeaveRequest,
):
    with patch("app.api.v1.manager.send_leave_status_email"):
        response = await client.patch(
            _approve_url(team_pending_leave.id),
            json={"remarks": "Approved, enjoy your leave."},
            headers=manager_headers,
        )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["status"] == "approved"


# ── test_approve_already_approved_fails ───────────────────────────────────────

async def test_approve_already_approved_fails(
    client: AsyncClient,
    manager_headers: dict,
    team_pending_leave: LeaveRequest,
):
    # First approval
    with patch("app.api.v1.manager.send_leave_status_email"):
        r1 = await client.patch(
            _approve_url(team_pending_leave.id),
            json={},
            headers=manager_headers,
        )
    assert r1.status_code == 200

    # Second approval attempt on already-approved leave
    with patch("app.api.v1.manager.send_leave_status_email"):
        r2 = await client.patch(
            _approve_url(team_pending_leave.id),
            json={},
            headers=manager_headers,
        )
    assert r2.status_code == 422
    assert "pending" in r2.json()["detail"].lower()


# ── test_reject_leave_restores_balance ────────────────────────────────────────

async def test_reject_leave_restores_balance(
    client: AsyncClient,
    manager_headers: dict,
    team_pending_leave: LeaveRequest,
    team_member_balance: LeaveBalance,
    db: AsyncSession,
):
    used_before = team_member_balance.used  # 3 days deducted when leave was created

    with patch("app.api.v1.manager.send_leave_status_email"):
        response = await client.patch(
            _reject_url(team_pending_leave.id),
            json={"remarks": "Insufficient staffing during this period."},
            headers=manager_headers,
        )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "rejected"

    # Refresh balance from DB and verify days were restored
    await db.refresh(team_member_balance)
    assert team_member_balance.used == used_before - team_pending_leave.days


# ── test_reject_requires_remarks ──────────────────────────────────────────────

async def test_reject_requires_remarks(
    client: AsyncClient,
    manager_headers: dict,
    team_pending_leave: LeaveRequest,
):
    response = await client.patch(
        _reject_url(team_pending_leave.id),
        json={"remarks": ""},          # blank remarks must fail validation
        headers=manager_headers,
    )
    assert response.status_code == 422


# ── test_reject_without_remarks_field ────────────────────────────────────────

async def test_reject_without_remarks_field(
    client: AsyncClient,
    manager_headers: dict,
    team_pending_leave: LeaveRequest,
):
    response = await client.patch(
        _reject_url(team_pending_leave.id),
        json={},                       # missing remarks field entirely
        headers=manager_headers,
    )
    assert response.status_code == 422


# ── test_manager_stats ────────────────────────────────────────────────────────

async def test_manager_stats(
    client: AsyncClient,
    manager_headers: dict,
    team_pending_leave: LeaveRequest,
):
    response = await client.get(
        STATS_URL,
        params={"year": date.today().year},
        headers=manager_headers,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["total_requests"] == 1
    assert data["pending"] == 1
    assert data["approved"] == 0
    assert data["rejected"] == 0
    assert isinstance(data["by_type"], list)
    assert isinstance(data["by_month"], list)
    assert data["by_type"][0]["leave_type"] == "Annual"
    assert data["by_type"][0]["count"] == 1


# ── test_team_calendar ────────────────────────────────────────────────────────

async def test_team_calendar(
    client: AsyncClient,
    manager_headers: dict,
    team_pending_leave: LeaveRequest,
):
    start = team_pending_leave.start_date
    response = await client.get(
        CALENDAR_URL,
        params={"year": start.year, "month": start.month},
        headers=manager_headers,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    # At least one calendar day entry should contain Dave Brown's leave
    all_entries = [entry for day in data for entry in day["leaves_on_date"]]
    names = [e["user_name"] for e in all_entries]
    assert "Dave Brown" in names


# ── test_employee_cannot_access_manager_routes ───────────────────────────────

async def test_employee_cannot_access_manager_routes(
    client: AsyncClient,
    employee_headers: dict,
):
    response = await client.get(TEAM_LEAVES_URL, headers=employee_headers)
    assert response.status_code == 403


# ── test_team_conflicts ───────────────────────────────────────────────────────

async def test_team_conflicts(
    client: AsyncClient,
    manager_headers: dict,
    team_pending_leave: LeaveRequest,
):
    start = team_pending_leave.start_date - timedelta(days=1)
    end   = team_pending_leave.end_date   + timedelta(days=1)
    response = await client.get(
        CONFLICTS_URL,
        params={"start_date": str(start), "end_date": str(end)},
        headers=manager_headers,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert len(data) == 1
    assert data[0]["user_name"] == "Dave Brown"
    assert data[0]["days"] == team_pending_leave.days
