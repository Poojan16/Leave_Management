"""
Seed script — creates demo data for the Leave Management System.
Run: python scripts/seed.py
"""
import asyncio
import os
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncpg
from passlib.context import CryptContext

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

_raw_url = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://lms_user:lms_password_dev@localhost:5432/leave_management",
)
# When running outside Docker, replace the Docker service hostname with localhost
DATABASE_URL = _raw_url.replace("postgresql+asyncpg://", "postgresql://").replace("@postgres:", "@localhost:")

LEAVE_TYPES = [
    ("Sick",     12, False, "Medical / health leave"),
    ("Casual",   12, False, "Personal errands and casual absence"),
    ("Earned",   15, True,  "Planned vacation / earned leave"),
    ("Comp-off",  5, False, "Compensatory off for extra hours worked"),
]

DEPARTMENTS = ["Engineering", "Marketing", "Operations"]

# role, first, last, email, password, dept_idx
USERS = [
    ("ADMIN",    "Alice",  "Admin",   "admin@company.com",    "Admin@123",    0),
    ("MANAGER",  "Bob",    "Manager", "manager@company.com",  "Manager@123",  0),
    ("MANAGER",  "Carol",  "Lead",    "carol@company.com",    "Manager@123",  1),
    ("EMPLOYEE", "Dave",   "Smith",   "employee@company.com", "Employee@123", 0),
    ("EMPLOYEE", "Eve",    "Jones",   "eve@company.com",      "Employee@123", 0),
    ("EMPLOYEE", "Frank",  "Brown",   "frank@company.com",    "Employee@123", 0),
    ("EMPLOYEE", "Grace",  "Wilson",  "grace@company.com",    "Employee@123", 1),
    ("EMPLOYEE", "Henry",  "Taylor",  "henry@company.com",    "Employee@123", 1),
    ("EMPLOYEE", "Iris",   "Davis",   "iris@company.com",     "Employee@123", 2),
]

# user_idx, lt_idx, start_offset, days, status, reason
SAMPLE_LEAVES = [
    (3, 0, -30, 2, "APPROVED",   "Fever and cold"),
    (4, 1, -20, 1, "APPROVED",   "Personal work"),
    (5, 2, -15, 3, "APPROVED",   "Family vacation"),
    (6, 0, -10, 1, "APPROVED",   "Doctor appointment"),
    (7, 1,  -5, 1, "REJECTED",   "Personal errand"),
    (8, 2,   5, 5, "PENDING",    "Annual vacation"),
    (3, 1, -60, 1, "APPROVED",   "Bank work"),
    (4, 0, -45, 2, "APPROVED",   "Flu"),
    (5, 3,  -3, 1, "APPROVED",   "Worked on weekend"),
    (6, 2,  10, 3, "PENDING",    "Travel to hometown"),
]


async def seed():
    conn = await asyncpg.connect(DATABASE_URL)

    try:
        # Departments
        dept_ids = []
        for name in DEPARTMENTS:
            row = await conn.fetchrow(
                "INSERT INTO departments (name, description) VALUES ($1, $2) "
                "ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id",
                name, f"{name} department"
            )
            dept_ids.append(row["id"])

        # Leave types
        lt_ids = []
        for name, max_days, carry, desc in LEAVE_TYPES:
            row = await conn.fetchrow(
                "INSERT INTO leave_types (name, max_days_per_year, carry_forward, description) "
                "VALUES ($1, $2, $3, $4) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id",
                name, max_days, carry, desc
            )
            lt_ids.append(row["id"])

        # Users
        year = date.today().year
        user_ids = []
        for i, (role, first, last, email, pwd, dept_idx) in enumerate(USERS):
            hashed = pwd_ctx.hash(pwd)
            row = await conn.fetchrow(
                "INSERT INTO users (first_name, last_name, email, employee_id, hashed_password, role, is_active, dept_id) "
                "VALUES ($1, $2, $3, $4, $5, $6::userrole, $7, $8) "
                "ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING id",
                first, last, email, f"EMP{i+1:03d}", hashed, role, True, dept_ids[dept_idx]
            )
            user_ids.append(row["id"])

        # Assign managers: employees (idx 3-8) → manager Bob (idx 1); Grace/Henry → Carol (idx 2)
        manager_map = {3: 1, 4: 1, 5: 1, 6: 2, 7: 2, 8: 1}
        for emp_idx, mgr_idx in manager_map.items():
            await conn.execute(
                "UPDATE users SET manager_id=$1 WHERE id=$2",
                user_ids[mgr_idx], user_ids[emp_idx]
            )

        # Leave balances
        for uid in user_ids:
            for lt_id, (_, max_days, _, _) in zip(lt_ids, LEAVE_TYPES):
                await conn.execute(
                    "INSERT INTO leave_balances (user_id, leave_type_id, year, allocated, used, carried_forward) "
                    "VALUES ($1, $2, $3, $4, 0, 0) "
                    "ON CONFLICT (user_id, leave_type_id, year) DO NOTHING",
                    uid, lt_id, year, max_days
                )

        # Sample leave requests
        today = date.today()
        leave_ids = []
        for user_idx, lt_idx, offset, days, status, reason in SAMPLE_LEAVES:
            start = today + timedelta(days=offset)
            end = start + timedelta(days=days - 1)
            row = await conn.fetchrow(
                "INSERT INTO leave_requests (user_id, leave_type_id, start_date, end_date, days, status, reason) "
                "VALUES ($1, $2, $3, $4, $5, $6::leavestatus, $7) RETURNING id",
                user_ids[user_idx], lt_ids[lt_idx], start, end, days, status, reason
            )
            leave_ids.append(row["id"])

            # Update used balance for approved leaves
            if status == "APPROVED":
                await conn.execute(
                    "UPDATE leave_balances SET used = used + $1 "
                    "WHERE user_id=$2 AND leave_type_id=$3 AND year=$4",
                    days, user_ids[user_idx], lt_ids[lt_idx], year
                )

        # Audit logs
        admin_id = user_ids[0]
        for lr_id in leave_ids:
            await conn.execute(
                "INSERT INTO audit_logs (user_id, action, entity, entity_id) VALUES ($1, $2, $3, $4)",
                admin_id, "leave_request_created", "leave_request", lr_id
            )

    finally:
        await conn.close()

    print("\n✅ Seed complete!\n")
    print("=" * 50)
    print("Demo credentials:")
    print("  Admin:    admin@company.com    / Admin@123")
    print("  Manager:  manager@company.com  / Manager@123")
    print("  Employee: employee@company.com / Employee@123")
    print("=" * 50)
    print(f"\nCreated:")
    print(f"  • {len(DEPARTMENTS)} departments")
    print(f"  • {len(LEAVE_TYPES)} leave types")
    print(f"  • {len(USERS)} users (1 admin, 2 managers, 6 employees)")
    print(f"  • {len(USERS) * len(LEAVE_TYPES)} leave balance records")
    print(f"  • {len(SAMPLE_LEAVES)} sample leave requests")
    print(f"  • {len(SAMPLE_LEAVES)} audit log entries\n")


if __name__ == "__main__":
    asyncio.run(seed())
