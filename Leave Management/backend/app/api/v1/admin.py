import logging
from datetime import date
from math import ceil
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, require_role
from app.crud.admin import (
    admin_create_user,
    admin_deactivate_user,
    admin_get_user,
    admin_list_users,
    admin_update_user,
    allocate_balances,
    create_department,
    create_leave_type,
    delete_department,
    delete_leave_type,
    get_audit_logs,
    get_balances,
    get_company_stats,
    get_department,
    get_leave_type,
    get_report_data,
    list_departments,
    list_leave_types,
    update_department,
    update_leave_type,
)
from app.models.user import User, UserRole
from app.schemas.admin import (
    AuditLogListOut,
    AuditLogOut,
    BalanceAllocateRequest,
    BalanceListOut,
    BalanceOut,
    CompanyStatsOut,
    DepartmentCreate,
    DepartmentOut,
    DepartmentUpdate,
    LeaveTypeCreate,
    LeaveTypeOut,
    LeaveTypeUpdate,
    UserAdminListOut,
    UserAdminOut,
    UserCreateAdmin,
    UserUpdateAdmin,
)
from app.services.audit import AuditAction, AuditEntity, write_log
from app.services.reports import (
    generate_excel_report,
    generate_pdf_report,
    generate_stats_report,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/admin",
    tags=["Admin"],
    dependencies=[Depends(require_role(UserRole.ADMIN))],
)


# ═══════════════════════════════════════════════════════════════════════════════
# USER MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/users", response_model=UserAdminListOut)
async def list_users(
    search: Optional[str] = Query(None),
    role: Optional[UserRole] = Query(None),
    dept_id: Optional[int] = Query(None),
    is_active: Optional[bool] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    current_admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    skip = (page - 1) * limit
    users, total = await admin_list_users(db, search, role, dept_id, is_active, skip, limit)
    pages = ceil(total / limit) if total else 1
    return UserAdminListOut(
        items=[UserAdminOut.model_validate(u) for u in users],
        total=total,
        page=page,
        pages=pages,
    )


@router.post("/users", response_model=UserAdminOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreateAdmin,
    current_admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    try:
        user = await admin_create_user(db, body)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email or employee ID already exists.",
        )
    await write_log(
        db, current_admin.id, AuditAction.USER_CREATED,
        AuditEntity.USER, user.id, {"email": user.email, "role": user.role.value},
    )
    return UserAdminOut.model_validate(user)


@router.get("/users/{user_id}", response_model=UserAdminOut)
async def get_user(
    user_id: int,
    current_admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    user = await admin_get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return UserAdminOut.model_validate(user)


@router.patch("/users/{user_id}", response_model=UserAdminOut)
async def update_user(
    user_id: int,
    body: UserUpdateAdmin,
    current_admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    user = await admin_get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    user = await admin_update_user(db, user, body)
    await write_log(
        db, current_admin.id, AuditAction.USER_UPDATED,
        AuditEntity.USER, user.id, body.model_dump(exclude_unset=True),
    )
    return UserAdminOut.model_validate(user)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_user(
    user_id: int,
    current_admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    user = await admin_get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    if user.id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="You cannot deactivate your own account.",
        )
    await admin_deactivate_user(db, user)
    await write_log(
        db, current_admin.id, AuditAction.USER_DEACTIVATED,
        AuditEntity.USER, user.id, {"email": user.email},
    )


# ═══════════════════════════════════════════════════════════════════════════════
# DEPARTMENT MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/departments", response_model=list[DepartmentOut])
async def get_departments(
    current_admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    depts = await list_departments(db)
    return [DepartmentOut.model_validate(d) for d in depts]


@router.post("/departments", response_model=DepartmentOut, status_code=status.HTTP_201_CREATED)
async def create_dept(
    body: DepartmentCreate,
    current_admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    try:
        dept = await create_department(db, body)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A department with this name already exists.",
        )
    return DepartmentOut.model_validate(dept)


@router.patch("/departments/{dept_id}", response_model=DepartmentOut)
async def update_dept(
    dept_id: int,
    body: DepartmentUpdate,
    current_admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    dept = await get_department(db, dept_id)
    if not dept:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found.")
    dept = await update_department(db, dept, body)
    return DepartmentOut.model_validate(dept)


@router.delete("/departments/{dept_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dept(
    dept_id: int,
    current_admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    dept = await get_department(db, dept_id)
    if not dept:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found.")
    try:
        await delete_department(db, dept)
    except Exception:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete department with assigned users.",
        )


# ═══════════════════════════════════════════════════════════════════════════════
# LEAVE TYPE MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/leave-types", response_model=list[LeaveTypeOut])
async def get_leave_types(
    current_admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    lts = await list_leave_types(db)
    return [LeaveTypeOut.model_validate(lt) for lt in lts]


@router.post("/leave-types", response_model=LeaveTypeOut, status_code=status.HTTP_201_CREATED)
async def create_lt(
    body: LeaveTypeCreate,
    current_admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    try:
        lt = await create_leave_type(db, body)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A leave type with this name already exists.",
        )
    return LeaveTypeOut.model_validate(lt)


@router.patch("/leave-types/{lt_id}", response_model=LeaveTypeOut)
async def update_lt(
    lt_id: int,
    body: LeaveTypeUpdate,
    current_admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    lt = await get_leave_type(db, lt_id)
    if not lt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Leave type not found.")
    lt = await update_leave_type(db, lt, body)
    return LeaveTypeOut.model_validate(lt)


@router.delete("/leave-types/{lt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lt(
    lt_id: int,
    current_admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    lt = await get_leave_type(db, lt_id)
    if not lt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Leave type not found.")
    try:
        await delete_leave_type(db, lt)
    except Exception:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete leave type with existing leave requests.",
        )


# ═══════════════════════════════════════════════════════════════════════════════
# BALANCE MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/balances", response_model=BalanceListOut)
async def get_balance_list(
    user_id: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    current_admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    balances = await get_balances(db, user_id, year)
    items = [
        BalanceOut(
            id=b.id,
            user_id=b.user_id,
            leave_type_id=b.leave_type_id,
            year=b.year,
            allocated=b.allocated,
            used=b.used,
            carried_forward=b.carried_forward,
            remaining=b.remaining,
        )
        for b in balances
    ]
    return BalanceListOut(items=items, total=len(items))


@router.post("/balances/allocate", status_code=status.HTTP_200_OK)
async def bulk_allocate(
    body: BalanceAllocateRequest,
    current_admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    count = await allocate_balances(db, body)
    await write_log(
        db, current_admin.id, "BALANCE_ALLOCATED", "leave_balance", None,
        {"leave_type_id": body.leave_type_id, "year": body.year,
         "days": body.days, "user_ids": str(body.user_ids)},
    )
    return {"detail": f"Allocated {body.days} days to {count} user(s)."}


# ═══════════════════════════════════════════════════════════════════════════════
# AUDIT LOGS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/audit-logs", response_model=AuditLogListOut)
async def get_audit_log_list(
    user_id: Optional[int] = Query(None),
    action: Optional[str] = Query(None),
    entity: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    current_admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    skip = (page - 1) * limit
    logs, total = await get_audit_logs(db, user_id, action, entity, start_date, end_date, skip, limit)
    pages = ceil(total / limit) if total else 1

    items = [
        AuditLogOut(
            id=log.id,
            actor_name=log.user.full_name if log.user else None,
            action=log.action,
            entity=log.entity,
            entity_id=log.entity_id,
            meta=log.meta,
            timestamp=log.timestamp,
        )
        for log in logs
    ]
    return AuditLogListOut(items=items, total=total, page=page, pages=pages)


# ═══════════════════════════════════════════════════════════════════════════════
# REPORTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/reports/export")
async def export_report(
    format: str = Query("pdf", pattern="^(pdf|xlsx)$"),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    dept_id: Optional[int] = Query(None),
    employee_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    leave_type_id: Optional[int] = Query(None),
    current_admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    filters = {
        "year": year, "month": month, "dept_id": dept_id,
        "employee_id": employee_id, "status": status_filter,
        "leave_type_id": leave_type_id,
    }
    data = await get_report_data(
        db, year=year, month=month, dept_id=dept_id,
        employee_id=employee_id, status=status_filter,
        leave_type_id=leave_type_id,
    )

    if format == "pdf":
        content = generate_pdf_report(data, filters)
        media_type = "application/pdf"
        filename = "leave_report.pdf"
    else:
        content = generate_excel_report(data, filters)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = "leave_report.xlsx"

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/reports/stats", response_model=CompanyStatsOut)
async def company_stats(
    year: Optional[int] = Query(None),
    current_admin: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    from datetime import date as date_cls
    target_year = year or date_cls.today().year
    raw = await get_company_stats(db, target_year)
    return CompanyStatsOut(**raw)
