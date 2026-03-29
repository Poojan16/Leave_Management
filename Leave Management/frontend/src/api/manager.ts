import apiClient from './client'
import type {
  ApprovePayload,
  LeaveRequest,
  ManagerStats,
  PaginatedResponse,
  RejectPayload,
  TeamCalendarDay,
  TeamLeaveRequest,
} from '@/types'

export interface GetTeamLeavesParams {
  status?: string
  employee_id?: string
  leave_type_id?: number
  start_date?: string
  end_date?: string
  search?: string
  page?: number
  limit?: number
  sort_by?: string
  sort_dir?: 'asc' | 'desc'
}

export const managerApi = {
  getTeamLeaves: (params: GetTeamLeavesParams = {}) =>
    apiClient
      .get<PaginatedResponse<TeamLeaveRequest>>('/manager/leaves', { params })
      .then((r) => r.data),

  approveLeave: (id: number, payload: ApprovePayload) =>
    apiClient
      .patch<LeaveRequest>(`/manager/leaves/${id}/approve`, payload)
      .then((r) => r.data),

  rejectLeave: (id: number, payload: RejectPayload) =>
    apiClient
      .patch<LeaveRequest>(`/manager/leaves/${id}/reject`, payload)
      .then((r) => r.data),

  getStats: (year?: number) =>
    apiClient
      .get<ManagerStats>('/manager/stats', { params: year ? { year } : {} })
      .then((r) => r.data),

  getTeamCalendar: (year?: number, month?: number) =>
    apiClient
      .get<TeamCalendarDay[]>('/manager/team-calendar', { params: { year, month } })
      .then((r) => r.data),

  getTeamConflicts: (startDate: string, endDate: string) =>
    apiClient
      .get('/manager/team-conflicts', {
        params: { start_date: startDate, end_date: endDate },
      })
      .then((r) => r.data),
}
