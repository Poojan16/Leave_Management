import apiClient from './client'
import type {
  CalendarLeave,
  LeaveApplyPayload,
  LeaveBalance,
  LeaveRequest,
  PaginatedResponse,
} from '@/types'

export interface GetMyLeavesParams {
  status?: string
  leave_type_id?: number
  start_date?: string
  end_date?: string
  page?: number
  limit?: number
  sort_by?: string
  sort_dir?: 'asc' | 'desc'
}

export interface AiParseResult {
  leave_type_name?: string
  start_date?: string
  end_date?: string
  reason?: string
  confidence?: number
}

export const leavesApi = {
  applyLeave: (payload: LeaveApplyPayload) =>
    apiClient.post<LeaveRequest>('/leaves/apply', payload).then((r) => r.data),

  getMyLeaves: (params: GetMyLeavesParams = {}) =>
    apiClient
      .get<PaginatedResponse<LeaveRequest>>('/leaves/my', { params })
      .then((r) => r.data),

  getLeaveById: (id: number) =>
    apiClient.get<LeaveRequest>(`/leaves/${id}`).then((r) => r.data),

  cancelLeave: (id: number, reason?: string) =>
    apiClient
      .delete<LeaveRequest>(`/leaves/${id}/cancel`, { data: { reason } })
      .then((r) => r.data),

  getBalance: (year?: number) =>
    apiClient
      .get<LeaveBalance[]>('/leaves/balance', { params: year ? { year } : {} })
      .then((r) => r.data),

  getCalendar: (year?: number, month?: number) =>
    apiClient
      .get<CalendarLeave[]>('/leaves/calendar', { params: { year, month } })
      .then((r) => r.data),

  // AI-assisted leave parsing
  parseLeaveAI: (text: string) =>
    apiClient
      .post<AiParseResult>('/ai/parse-leave', { text })
      .then((r) => r.data),
}
