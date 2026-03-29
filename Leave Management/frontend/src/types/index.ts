// ── Enums ─────────────────────────────────────────────────────────────────────

export type Role = 'admin' | 'manager' | 'employee'

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

// ── Core entities ─────────────────────────────────────────────────────────────

export interface User {
  id: number
  first_name: string
  last_name: string
  email: string
  role: Role
  dept_id: number | null
  is_active: boolean
}

export interface Department {
  id: number
  name: string
  description?: string | null
  created_at?: string
}

export interface LeaveType {
  id: number
  name: string
  description?: string | null
  max_days_per_year: number
  carry_forward?: boolean
}

export interface LeaveBalance {
  leave_type: LeaveType
  allocated: number
  carried_forward: number
  used: number
  remaining: number
}

export interface LeaveRequest {
  id: number
  user: {
    id: number
    first_name: string
    last_name: string
    email: string
    employee_id: string
  }
  leave_type: LeaveType
  start_date: string
  end_date: string
  days: number
  status: LeaveStatus
  reason: string
  created_at: string
}

export interface TeamLeaveRequest extends LeaveRequest {
  employee_name: string
  department_name: string | null
}

export interface LeaveApproval {
  id: number
  request_id: number
  approver_id: number | null
  action: 'approved' | 'rejected'
  remarks: string | null
  actioned_at: string
}

export interface AuditLog {
  id: number
  actor_name: string | null
  action: string
  entity: string
  entity_id: number | null
  meta: Record<string, unknown> | null
  timestamp: string
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export interface ManagerStats {
  total_requests: number
  pending: number
  approved: number
  rejected: number
  cancelled: number
  by_type: { leave_type: string; count: number }[]
  by_month: { month: number; count: number }[]
}

export interface CompanyStats {
  year: number
  total_employees: number
  total_requests: number
  pending: number
  approved: number
  rejected: number
  cancelled: number
  total_days_taken: number
  by_department: { department: string; count: number }[]
  by_leave_type: { leave_type: string; count: number }[]
  by_month: { month: number; count: number }[]
}

// ── Pagination ────────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pages: number
}

// ── API shapes ────────────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  user: User
}

export interface ApiError {
  message: string
  detail?: string
}

// ── Form payloads ─────────────────────────────────────────────────────────────

export interface LoginPayload {
  email: string
  password: string
}

export interface SignupPayload {
  first_name: string
  last_name: string
  email: string
  employee_id: string
  password: string
  role: Role
}

export interface LeaveApplyPayload {
  leave_type_id: number
  start_date: string
  end_date: string
  reason: string
}

export interface ApprovePayload {
  remarks?: string
}

export interface RejectPayload {
  remarks: string
}

export interface BalanceAllocatePayload {
  user_ids: number[] | 'all'
  leave_type_id: number
  year: number
  days: number
}

// ── Calendar ──────────────────────────────────────────────────────────────────

export interface CalendarLeave {
  id: number
  leave_type: LeaveType
  start_date: string
  end_date: string
  days: number
  status: LeaveStatus
}

export interface TeamCalendarDay {
  date: string
  leaves_on_date: {
    user_name: string
    leave_type: string
    status: string
  }[]
}
