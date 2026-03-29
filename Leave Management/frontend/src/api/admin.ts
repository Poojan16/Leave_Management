import apiClient from './client'
import type {
  AuditLog,
  BalanceAllocatePayload,
  CompanyStats,
  Department,
  LeaveType,
  PaginatedResponse,
  User,
} from '@/types'

// ── Users ─────────────────────────────────────────────────────────────────────

export interface ListUsersParams {
  search?: string
  role?: string
  dept_id?: number
  is_active?: boolean
  page?: number
  limit?: number
}

export const adminApi = {
  // Users
  listUsers: (params: ListUsersParams = {}) =>
    apiClient.get<PaginatedResponse<User>>('/admin/users', { params }).then((r) => r.data),

  createUser: (payload: Record<string, unknown>) =>
    apiClient.post<User>('/admin/users', payload).then((r) => r.data),

  getUser: (id: number) =>
    apiClient.get<User>(`/admin/users/${id}`).then((r) => r.data),

  updateUser: (id: number, payload: Record<string, unknown>) =>
    apiClient.patch<User>(`/admin/users/${id}`, payload).then((r) => r.data),

  deactivateUser: (id: number) =>
    apiClient.delete(`/admin/users/${id}`),

  // Departments
  listDepartments: () =>
    apiClient.get<Department[]>('/admin/departments').then((r) => r.data),

  createDepartment: (payload: { name: string; description?: string }) =>
    apiClient.post<Department>('/admin/departments', payload).then((r) => r.data),

  updateDepartment: (id: number, payload: { name?: string; description?: string }) =>
    apiClient.patch<Department>(`/admin/departments/${id}`, payload).then((r) => r.data),

  deleteDepartment: (id: number) =>
    apiClient.delete(`/admin/departments/${id}`),

  // Leave types
  listLeaveTypes: () =>
    apiClient.get<LeaveType[]>('/admin/leave-types').then((r) => r.data),

  createLeaveType: (payload: Record<string, unknown>) =>
    apiClient.post<LeaveType>('/admin/leave-types', payload).then((r) => r.data),

  updateLeaveType: (id: number, payload: Record<string, unknown>) =>
    apiClient.patch<LeaveType>(`/admin/leave-types/${id}`, payload).then((r) => r.data),

  deleteLeaveType: (id: number) =>
    apiClient.delete(`/admin/leave-types/${id}`),

  // Balances
  getBalances: (params: { user_id?: number; year?: number } = {}) =>
    apiClient.get('/admin/balances', { params }).then((r) => r.data),

  allocateBalances: (payload: BalanceAllocatePayload) =>
    apiClient.post('/admin/balances/allocate', payload).then((r) => r.data),

  // Audit logs
  getAuditLogs: (params: {
    user_id?: number
    action?: string
    entity?: string
    start_date?: string
    end_date?: string
    page?: number
    limit?: number
  } = {}) =>
    apiClient
      .get<PaginatedResponse<AuditLog>>('/admin/audit-logs', { params })
      .then((r) => r.data),

  // Reports
  exportReport: (params: {
    format: 'pdf' | 'xlsx'
    year?: number
    month?: number
    dept_id?: number
    status?: string
    leave_type_id?: number
  }) =>
    apiClient.get('/admin/reports/export', {
      params,
      responseType: 'blob',
    }),

  getCompanyStats: (year?: number) =>
    apiClient
      .get<CompanyStats>('/admin/reports/stats', { params: year ? { year } : {} })
      .then((r) => r.data),
}
