import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { managerApi, type GetTeamLeavesParams } from '@/api/manager'
import type { ApprovePayload, RejectPayload } from '@/types'

export const managerKeys = {
  all:      ['manager'] as const,
  leaves:   (p: GetTeamLeavesParams) => ['manager', 'leaves', p] as const,
  stats:    (year?: number) => ['manager', 'stats', year] as const,
  calendar: (year: number, month: number) => ['manager', 'calendar', year, month] as const,
  conflicts:(start: string, end: string) => ['manager', 'conflicts', start, end] as const,
}

export function useTeamLeaves(params: GetTeamLeavesParams = {}) {
  return useQuery({
    queryKey: managerKeys.leaves(params),
    queryFn:  () => managerApi.getTeamLeaves(params),
    placeholderData: (prev) => prev,
  })
}

export function useManagerStats(year?: number) {
  return useQuery({
    queryKey: managerKeys.stats(year),
    queryFn:  () => managerApi.getStats(year),
    staleTime: 1000 * 60 * 5,
  })
}

export function useTeamCalendar(year: number, month: number) {
  return useQuery({
    queryKey: managerKeys.calendar(year, month),
    queryFn:  () => managerApi.getTeamCalendar(year, month),
  })
}

export function useTeamConflicts(startDate: string, endDate: string) {
  return useQuery({
    queryKey: managerKeys.conflicts(startDate, endDate),
    queryFn:  () => managerApi.getTeamConflicts(startDate, endDate),
    enabled:  !!(startDate && endDate),
  })
}

export function useApproveLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ApprovePayload }) =>
      managerApi.approveLeave(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manager', 'leaves'] })
      qc.invalidateQueries({ queryKey: ['manager', 'stats'] })
    },
  })
}

export function useRejectLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: RejectPayload }) =>
      managerApi.rejectLeave(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manager', 'leaves'] })
      qc.invalidateQueries({ queryKey: ['manager', 'stats'] })
    },
  })
}
