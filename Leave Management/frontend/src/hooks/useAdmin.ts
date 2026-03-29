import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi, type ListUsersParams } from '@/api/admin'
import type { BalanceAllocatePayload } from '@/types'

export const adminKeys = {
  users:      (p: ListUsersParams) => ['admin', 'users', p] as const,
  user:       (id: number)         => ['admin', 'user', id] as const,
  depts:      ()                   => ['admin', 'departments'] as const,
  leaveTypes: ()                   => ['admin', 'leave-types'] as const,
  balances:   (p: { user_id?: number; year?: number }) => ['admin', 'balances', p] as const,
  auditLogs:  (p: Record<string, unknown>) => ['admin', 'audit-logs', p] as const,
  stats:      (year?: number)      => ['admin', 'stats', year] as const,
}

// ── Users ─────────────────────────────────────────────────────────────────────
export function useUsers(params: ListUsersParams = {}) {
  return useQuery({
    queryKey: adminKeys.users(params),
    queryFn:  () => adminApi.listUsers(params),
    placeholderData: (prev) => prev,
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => adminApi.createUser(payload),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      adminApi.updateUser(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  })
}

export function useDeactivateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => adminApi.deactivateUser(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  })
}

// ── Departments ───────────────────────────────────────────────────────────────
export function useDepartments() {
  return useQuery({
    queryKey: adminKeys.depts(),
    queryFn:  () => adminApi.listDepartments(),
    staleTime: 1000 * 60 * 10,
  })
}

export function useCreateDepartment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { name: string; description?: string }) =>
      adminApi.createDepartment(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.depts() }),
  })
}

export function useUpdateDepartment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { name?: string; description?: string } }) =>
      adminApi.updateDepartment(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.depts() }),
  })
}

export function useDeleteDepartment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => adminApi.deleteDepartment(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: adminKeys.depts() }),
  })
}

// ── Leave Types ───────────────────────────────────────────────────────────────
export function useLeaveTypes() {
  return useQuery({
    queryKey: adminKeys.leaveTypes(),
    queryFn:  () => adminApi.listLeaveTypes(),
    staleTime: 1000 * 60 * 10,
  })
}

export function useCreateLeaveType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => adminApi.createLeaveType(payload),
    onSuccess:  () => qc.invalidateQueries({ queryKey: adminKeys.leaveTypes() }),
  })
}

export function useUpdateLeaveType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      adminApi.updateLeaveType(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.leaveTypes() }),
  })
}

export function useDeleteLeaveType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => adminApi.deleteLeaveType(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: adminKeys.leaveTypes() }),
  })
}

// ── Balances ──────────────────────────────────────────────────────────────────
export function useAdminBalances(params: { user_id?: number; year?: number } = {}) {
  return useQuery({
    queryKey: adminKeys.balances(params),
    queryFn:  () => adminApi.getBalances(params),
  })
}

export function useAllocateBalances() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: BalanceAllocatePayload) => adminApi.allocateBalances(payload),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['admin', 'balances'] }),
  })
}

// ── Audit Logs ────────────────────────────────────────────────────────────────
export function useAuditLogs(params: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: adminKeys.auditLogs(params),
    queryFn:  () => adminApi.getAuditLogs(params as Parameters<typeof adminApi.getAuditLogs>[0]),
    placeholderData: (prev) => prev,
  })
}

// ── Company Stats ─────────────────────────────────────────────────────────────
export function useCompanyStats(year?: number) {
  return useQuery({
    queryKey: adminKeys.stats(year),
    queryFn:  () => adminApi.getCompanyStats(year),
    staleTime: 1000 * 60 * 5,
  })
}

// ── Export Report ─────────────────────────────────────────────────────────────
export function useExportReport() {
  return useMutation({
    mutationFn: (params: Parameters<typeof adminApi.exportReport>[0]) =>
      adminApi.exportReport(params),
  })
}
