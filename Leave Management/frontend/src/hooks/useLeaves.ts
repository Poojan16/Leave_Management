import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { leavesApi, type GetMyLeavesParams } from '@/api/leaves'
import type { LeaveApplyPayload, LeaveRequest, PaginatedResponse } from '@/types'

// ── Query keys ────────────────────────────────────────────────────────────────
export const leaveKeys = {
  all:      ['leaves'] as const,
  lists:    () => [...leaveKeys.all, 'list'] as const,
  list:     (params: GetMyLeavesParams) => [...leaveKeys.lists(), params] as const,
  detail:   (id: number) => [...leaveKeys.all, 'detail', id] as const,
  balance:  (year?: number) => [...leaveKeys.all, 'balance', year] as const,
  calendar: (year: number, month: number) => [...leaveKeys.all, 'calendar', year, month] as const,
}

// ── useMyLeaves ───────────────────────────────────────────────────────────────
export function useMyLeaves(params: GetMyLeavesParams = {}) {
  return useQuery({
    queryKey: leaveKeys.list(params),
    queryFn: () => leavesApi.getMyLeaves(params),
    placeholderData: (prev) => prev,
  })
}

// ── useBalance ────────────────────────────────────────────────────────────────
export function useBalance(year?: number) {
  return useQuery({
    queryKey: leaveKeys.balance(year),
    queryFn: () => leavesApi.getBalance(year),
    staleTime: 1000 * 60 * 5, // 5 min — balances don't change often
  })
}

// ── useCalendarLeaves ─────────────────────────────────────────────────────────
export function useCalendarLeaves(year: number, month: number) {
  return useQuery({
    queryKey: leaveKeys.calendar(year, month),
    queryFn: () => leavesApi.getCalendar(year, month),
  })
}

// ── useApplyLeave ─────────────────────────────────────────────────────────────
export function useApplyLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: LeaveApplyPayload) => leavesApi.applyLeave(payload),
    onSuccess: () => {
      // Invalidate all leave lists and balance (days were deducted)
      qc.invalidateQueries({ queryKey: leaveKeys.lists() })
      qc.invalidateQueries({ queryKey: leaveKeys.balance() })
    },
  })
}

// ── useCancelLeave ────────────────────────────────────────────────────────────
export function useCancelLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      leavesApi.cancelLeave(id, reason),

    // Optimistic update: flip status to 'cancelled' immediately
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: leaveKeys.lists() })
      const snapshots: Map<unknown, PaginatedResponse<LeaveRequest>> = new Map()

      qc.getQueriesData<PaginatedResponse<LeaveRequest>>({ queryKey: leaveKeys.lists() })
        .forEach(([key, data]) => {
          if (!data) return
          snapshots.set(key, data)
          qc.setQueryData<PaginatedResponse<LeaveRequest>>(key, {
            ...data,
            items: data.items.map((l) =>
              l.id === id ? { ...l, status: 'cancelled' as const } : l
            ),
          })
        })
      return { snapshots }
    },

    onError: (_err, _vars, ctx) => {
      // Roll back optimistic update
      ctx?.snapshots.forEach((data, key) => {
        qc.setQueryData(key, data)
      })
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: leaveKeys.lists() })
      qc.invalidateQueries({ queryKey: leaveKeys.balance() })
    },
  })
}
