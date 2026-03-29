from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserUpdate


async def get_by_email(db: AsyncSession, email: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalars().first()


async def get_by_id(db: AsyncSession, user_id: int) -> Optional[User]:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalars().first()


async def create_user(db: AsyncSession, schema: UserCreate) -> User:
    user = User(
        first_name=schema.first_name.strip(),
        last_name=schema.last_name.strip(),
        email=schema.email,
        employee_id=schema.employee_id.strip(),
        hashed_password=hash_password(schema.password),
        role=schema.role,
        dept_id=schema.dept_id,
        manager_id=schema.manager_id,
        is_active=True,
    )
    db.add(user)
    await db.flush()   # get user.id without committing — caller commits via get_db
    await db.refresh(user)
    return user


async def update_user(db: AsyncSession, user: User, schema: UserUpdate) -> User:
    update_data = schema.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)
    await db.flush()
    await db.refresh(user)
    return user


async def list_users(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 50,
    role: Optional[UserRole] = None,
    dept_id: Optional[int] = None,
    is_active: Optional[bool] = None,
) -> tuple[list[User], int]:
    query = select(User)

    if role is not None:
        query = query.where(User.role == role)
    if dept_id is not None:
        query = query.where(User.dept_id == dept_id)
    if is_active is not None:
        query = query.where(User.is_active == is_active)

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar_one()

    result = await db.execute(query.offset(skip).limit(limit).order_by(User.id))
    return result.scalars().all(), total
