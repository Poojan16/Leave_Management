import pytest
import pytest_asyncio
from datetime import date, timedelta
from httpx import AsyncClient, ASGITransport
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy import JSON

from app.core.database import Base
from app.core.deps import get_db
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models.audit_log import AuditLog
from app.models.leave_balance import LeaveBalance
from app.models.leave_request import LeaveRequest, LeaveStatus
from app.models.leave_type import LeaveType
from app.models.user import User, UserRole

# ── Patch JSONB → JSON for SQLite compatibility ───────────────────────────────
# AuditLog.meta uses JSONB (PostgreSQL-only); swap to JSON for in-memory tests
AuditLog.__table__.c.meta.type = JSON()

# ── In-memory async SQLite engine ─────────────────────────────────────────────
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
)

TestSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


# ── Override get_db ───────────────────────────────────────────────────────────

async def override_get_db() -> AsyncSession:
    async with TestSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


app.dependency_overrides[get_db] = override_get_db


# ── Schema setup / teardown per test ─────────────────────────────────────────

@pytest_asyncio.fixture(autouse=True, scope="function")
async def setup_db():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


# ── HTTP client ───────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def client() -> AsyncClient:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


# ── DB session ────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def db() -> AsyncSession:
    async with TestSessionLocal() as session:
        yield session


# ── User fixtures ─────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def test_employee(db: AsyncSession) -> User:
    user = User(
        first_name="Alice",
        last_name="Smith",
        email="alice@test.com",
        employee_id="EMP001",
        hashed_password=hash_password("Password1"),
        role=UserRole.EMPLOYEE,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def test_manager(db: AsyncSession) -> User:
    user = User(
        first_name="Bob",
        last_name="Jones",
        email="bob@test.com",
        employee_id="MGR001",
        hashed_password=hash_password("Password1"),
        role=UserRole.MANAGER,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def inactive_user(db: AsyncSession) -> User:
    user = User(
        first_name="Carol",
        last_name="Doe",
        email="carol@test.com",
        employee_id="EMP002",
        hashed_password=hash_password("Password1"),
        role=UserRole.EMPLOYEE,
        is_active=False,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def employee_under_manager(db: AsyncSession, test_manager: User) -> User:
    """Employee whose manager_id points to test_manager — used in Sprint 5 tests."""
    user = User(
        first_name="Dave",
        last_name="Brown",
        email="dave@test.com",
        employee_id="EMP003",
        hashed_password=hash_password("Password1"),
        role=UserRole.EMPLOYEE,
        is_active=True,
        manager_id=test_manager.id,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def other_employee(db: AsyncSession) -> User:
    """Employee with no manager — used to verify cross-team isolation."""
    user = User(
        first_name="Eve",
        last_name="White",
        email="eve@test.com",
        employee_id="EMP004",
        hashed_password=hash_password("Password1"),
        role=UserRole.EMPLOYEE,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def test_admin(db: AsyncSession) -> User:
    """Admin user for Sprint 6 tests."""
    user = User(
        first_name="Admin",
        last_name="User",
        email="admin@test.com",
        employee_id="ADM001",
        hashed_password=hash_password("Password1"),
        role=UserRole.ADMIN,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


# ── LeaveType fixture ─────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def leave_type(db: AsyncSession) -> LeaveType:
    lt = LeaveType(
        name="Annual",
        description="Annual leave",
        max_days_per_year=20,
        carry_forward=False,
    )
    db.add(lt)
    await db.commit()
    await db.refresh(lt)
    return lt


@pytest_asyncio.fixture
async def sick_leave_type(db: AsyncSession) -> LeaveType:
    lt = LeaveType(
        name="Sick",
        description="Sick leave",
        max_days_per_year=10,
        carry_forward=False,
    )
    db.add(lt)
    await db.commit()
    await db.refresh(lt)
    return lt


# ── LeaveBalance fixture ──────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def employee_balance(
    db: AsyncSession, test_employee: User, leave_type: LeaveType
) -> LeaveBalance:
    balance = LeaveBalance(
        user_id=test_employee.id,
        leave_type_id=leave_type.id,
        year=date.today().year,
        allocated=20,
        used=0,
        carried_forward=0,
    )
    db.add(balance)
    await db.commit()
    await db.refresh(balance)
    return balance


@pytest_asyncio.fixture
async def zero_balance(
    db: AsyncSession, test_employee: User, sick_leave_type: LeaveType
) -> LeaveBalance:
    """Balance with 0 remaining — for insufficient balance tests."""
    balance = LeaveBalance(
        user_id=test_employee.id,
        leave_type_id=sick_leave_type.id,
        year=date.today().year,
        allocated=0,
        used=0,
        carried_forward=0,
    )
    db.add(balance)
    await db.commit()
    await db.refresh(balance)
    return balance


# ── LeaveRequest fixture ──────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def pending_leave(
    db: AsyncSession, test_employee: User, leave_type: LeaveType, employee_balance: LeaveBalance
) -> LeaveRequest:
    tomorrow = date.today() + timedelta(days=1)
    leave = LeaveRequest(
        user_id=test_employee.id,
        leave_type_id=leave_type.id,
        start_date=tomorrow,
        end_date=tomorrow + timedelta(days=2),
        days=3,
        reason="Family event",
        status=LeaveStatus.PENDING,
    )
    db.add(leave)
    # Reflect used days in balance
    employee_balance.used += 3
    await db.commit()
    await db.refresh(leave)
    return leave


@pytest_asyncio.fixture
async def approved_leave(
    db: AsyncSession, test_employee: User, leave_type: LeaveType, employee_balance: LeaveBalance
) -> LeaveRequest:
    start = date.today() + timedelta(days=10)
    leave = LeaveRequest(
        user_id=test_employee.id,
        leave_type_id=leave_type.id,
        start_date=start,
        end_date=start + timedelta(days=1),
        days=2,
        reason="Approved leave",
        status=LeaveStatus.APPROVED,
    )
    db.add(leave)
    employee_balance.used += 2
    await db.commit()
    await db.refresh(leave)
    return leave


# ── Team-member leave fixtures (Sprint 5) ────────────────────────────────────

@pytest_asyncio.fixture
async def team_member_balance(
    db: AsyncSession,
    employee_under_manager: User,
    leave_type: LeaveType,
) -> LeaveBalance:
    balance = LeaveBalance(
        user_id=employee_under_manager.id,
        leave_type_id=leave_type.id,
        year=date.today().year,
        allocated=20,
        used=0,
        carried_forward=0,
    )
    db.add(balance)
    await db.commit()
    await db.refresh(balance)
    return balance


@pytest_asyncio.fixture
async def team_pending_leave(
    db: AsyncSession,
    employee_under_manager: User,
    leave_type: LeaveType,
    team_member_balance: LeaveBalance,
) -> LeaveRequest:
    start = date.today() + timedelta(days=5)
    leave = LeaveRequest(
        user_id=employee_under_manager.id,
        leave_type_id=leave_type.id,
        start_date=start,
        end_date=start + timedelta(days=2),
        days=3,
        reason="Team member vacation",
        status=LeaveStatus.PENDING,
    )
    db.add(leave)
    team_member_balance.used += 3
    await db.commit()
    await db.refresh(leave)
    return leave


@pytest_asyncio.fixture
async def other_team_leave(
    db: AsyncSession,
    other_employee: User,
    leave_type: LeaveType,
) -> LeaveRequest:
    """Leave from an employee NOT under test_manager — for isolation tests."""
    balance = LeaveBalance(
        user_id=other_employee.id,
        leave_type_id=leave_type.id,
        year=date.today().year,
        allocated=20,
        used=3,
        carried_forward=0,
    )
    db.add(balance)
    start = date.today() + timedelta(days=5)
    leave = LeaveRequest(
        user_id=other_employee.id,
        leave_type_id=leave_type.id,
        start_date=start,
        end_date=start + timedelta(days=2),
        days=3,
        reason="Other team leave",
        status=LeaveStatus.PENDING,
    )
    db.add(leave)
    await db.commit()
    await db.refresh(leave)
    return leave


# ── Token / header fixtures ───────────────────────────────────────────────────

@pytest.fixture
def employee_token(test_employee: User) -> str:
    return create_access_token({"sub": str(test_employee.id)})


@pytest.fixture
def manager_token(test_manager: User) -> str:
    return create_access_token({"sub": str(test_manager.id)})


@pytest.fixture
def employee_headers(employee_token: str) -> dict:
    return {"Authorization": f"Bearer {employee_token}"}


@pytest.fixture
def manager_headers(manager_token: str) -> dict:
    return {"Authorization": f"Bearer {manager_token}"}


@pytest.fixture
def admin_token(test_admin: User) -> str:
    return create_access_token({"sub": str(test_admin.id)})


@pytest.fixture
def admin_headers(admin_token: str) -> dict:
    return {"Authorization": f"Bearer {admin_token}"}
