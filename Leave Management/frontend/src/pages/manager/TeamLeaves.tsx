import { useState } from 'react'
import { format } from 'date-fns'
import { Download, ChevronUp, ChevronDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { LeaveStatusBadge } from '@/components/leaves/LeaveStatusBadge'
import { ApproveDialog } from '@/components/manager/ApproveDialog'
import { RejectDialog } from '@/components/manager/RejectDialog'
import { useTeamLeaves, useApproveLeave, useRejectLeave } from '@/hooks/useManager'
import { useLeaveTypes } from '@/hooks/useAdmin'
import { adminApi } from '@/api/admin'
import { useToast } from '@/components/ui/toast'
import type { TeamLeaveRequest } from '@/types'
import type { GetTeamLeavesParams } from '@/api/manager'

type SortField = 'created_at' | 'start_date' | 'end_date' | 'days' | 'status'

export default function TeamLeaves() {
  const { error: toastError } = useToast()
  const [filters, setFilters] = useState<GetTeamLeavesParams>({ page: 1, limit: 15, sort_by: 'created_at', sort_dir: 'desc' })
  const [approveTarget, setApproveTarget] = useState<TeamLeaveRequest | null>(null)
  const [rejectTarget,  setRejectTarget]  = useState<TeamLeaveRequest | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [exporting, setExporting] = useState(false)

  const { data, isLoading } = useTeamLeaves(filters)
  const { data: leaveTypes } = useLeaveTypes()
  const { mutateAsync: bulkApprove, isPending: approving } = useApproveLeave()
  const { mutateAsync: bulkReject,  isPending: rejecting  } = useRejectLeave()

  const setFilter = (key: keyof GetTeamLeavesParams, value: string | number | undefined) =>
    setFilters((f) => ({ ...f, [key]: value || undefined, page: 1 }))

  const toggleSort = (field: SortField) =>
    setFilters((f) => ({ ...f, sort_by: field, sort_dir: f.sort_by === field && f.sort_dir === 'asc' ? 'desc' : 'asc' }))

  const SortIcon = ({ field }: { field: SortField }) =>
    filters.sort_by !== field
      ? <ChevronUp className="h-3 w-3 opacity-30" />
      : filters.sort_dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />

  const toggleSelect = (id: number) =>
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const toggleAll = () => {
    const ids = data?.items.filter((l) => l.status === 'pending').map((l) => l.id) ?? []
    setSelected((s) => s.size === ids.length ? new Set() : new Set(ids))
  }

  const handleBulkApprove = async () => {
    for (const id of selected) {
      try { await bulkApprove({ id, payload: {} }) } catch { /* continue */ }
    }
    setSelected(new Set())
  }

  const handleBulkReject = async () => {
    const remarks = window.prompt('Enter rejection remarks for all selected leaves:')
    if (!remarks?.trim()) return
    for (const id of selected) {
      try { await bulkReject({ id, payload: { remarks } }) } catch { /* continue */ }
    }
    setSelected(new Set())
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const resp = await adminApi.exportReport({ format: 'xlsx' })
      const url  = URL.createObjectURL(new Blob([resp.data]))
      const a    = document.createElement('a'); a.href = url; a.download = 'team_leaves.xlsx'; a.click()
      URL.revokeObjectURL(url)
    } catch { toastError('Export failed', 'Could not generate Excel file.') }
    finally { setExporting(false) }
  }

  const pendingItems = data?.items.filter((l) => l.status === 'pending') ?? []

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <Input
              className="w-48 h-10"
              placeholder="Search employee…"
              value={filters.search ?? ''}
              onChange={(e) => setFilter('search', e.target.value)}
            />
            <div className="w-36">
              <Select value={filters.status ?? ''} onValueChange={(v) => setFilter('status', v === '__all__' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  {['__all__','pending','approved','rejected','cancelled'].map((s) => (
                    <SelectItem key={s} value={s}>{s === '__all__' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <Select value={filters.leave_type_id ? String(filters.leave_type_id) : ''} onValueChange={(v) => setFilter('leave_type_id', v === '__all__' ? undefined : Number(v))}>
                <SelectTrigger><SelectValue placeholder="Leave Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Types</SelectItem>
                  {leaveTypes?.map((lt) => <SelectItem key={lt.id} value={String(lt.id)}>{lt.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Input type="date" className="w-36 h-10" value={filters.start_date ?? ''} onChange={(e) => setFilter('start_date', e.target.value)} />
            <span className="text-muted-foreground">—</span>
            <Input type="date" className="w-36 h-10" value={filters.end_date ?? ''} onChange={(e) => setFilter('end_date', e.target.value)} />
            {(filters.search || filters.status || filters.leave_type_id || filters.start_date) && (
              <Button variant="ghost" size="sm" onClick={() => setFilters({ page: 1, limit: 15, sort_by: 'created_at', sort_dir: 'desc' })}>
                <X className="h-4 w-4 mr-1" /> Clear
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              {selected.size > 0 && (
                <>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-9" onClick={handleBulkApprove} disabled={approving}>
                    Approve {selected.size}
                  </Button>
                  <Button size="sm" variant="destructive" className="h-9" onClick={handleBulkReject} disabled={rejecting}>
                    Reject {selected.size}
                  </Button>
                </>
              )}
              <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
                <Download className="h-4 w-4 mr-1" />{exporting ? 'Exporting…' : 'Excel'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : data?.items.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input type="checkbox" onChange={toggleAll} checked={selected.size === pendingItems.length && pendingItems.length > 0} />
                  </TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Dept</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort('start_date')}>
                    <span className="flex items-center gap-1">Start <SortIcon field="start_date" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort('end_date')}>
                    <span className="flex items-center gap-1">End <SortIcon field="end_date" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort('days')}>
                    <span className="flex items-center gap-1">Days <SortIcon field="days" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort('status')}>
                    <span className="flex items-center gap-1">Status <SortIcon field="status" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort('created_at')}>
                    <span className="flex items-center gap-1">Applied <SortIcon field="created_at" /></span>
                  </TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((leave) => (
                  <TableRow key={leave.id}>
                    <TableCell>
                      {leave.status === 'pending' && (
                        <input type="checkbox" checked={selected.has(leave.id)} onChange={() => toggleSelect(leave.id)} />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{leave.employee_name}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{leave.department_name ?? '—'}</TableCell>
                    <TableCell>{leave.leave_type.name}</TableCell>
                    <TableCell>{format(new Date(leave.start_date), 'MMM d, yyyy')}</TableCell>
                    <TableCell>{format(new Date(leave.end_date), 'MMM d, yyyy')}</TableCell>
                    <TableCell>{leave.days}</TableCell>
                    <TableCell><LeaveStatusBadge status={leave.status} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(leave.created_at), 'MMM d, yyyy')}</TableCell>
                    <TableCell>
                      {leave.status === 'pending' && (
                        <div className="flex gap-1">
                          <Button size="sm" className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700 text-white" onClick={() => setApproveTarget(leave)}>✓</Button>
                          <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" onClick={() => setRejectTarget(leave)}>✗</Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-10 text-center text-sm text-muted-foreground">No team leaves found.</div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {data.page} of {data.pages} ({data.total} total)</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={data.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}>Previous</Button>
            <Button variant="outline" size="sm" disabled={data.page >= data.pages} onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}>Next</Button>
          </div>
        </div>
      )}

      {approveTarget && <ApproveDialog leaveId={approveTarget.id} employeeName={approveTarget.employee_name} open={!!approveTarget} onClose={() => setApproveTarget(null)} />}
      {rejectTarget  && <RejectDialog  leaveId={rejectTarget.id}  employeeName={rejectTarget.employee_name}  open={!!rejectTarget}  onClose={() => setRejectTarget(null)}  />}
    </div>
  )
}
