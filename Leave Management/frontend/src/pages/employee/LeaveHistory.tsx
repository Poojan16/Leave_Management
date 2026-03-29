import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Download, ChevronUp, ChevronDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { LeaveStatusBadge } from '@/components/leaves/LeaveStatusBadge'
import { CancelLeaveDialog } from '@/components/leaves/CancelLeaveDialog'
import { LeaveDetailDrawer } from '@/components/leaves/LeaveDetailDrawer'
import { useMyLeaves, useBalance } from '@/hooks/useLeaves'
import { adminApi } from '@/api/admin'
import { useToast } from '@/components/ui/toast'
import type { LeaveRequest, LeaveStatus } from '@/types'
import type { GetMyLeavesParams } from '@/api/leaves'

type SortField = 'start_date' | 'end_date' | 'created_at' | 'status' | 'days'

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '__all__',   label: 'All Statuses' },
  { value: 'pending',   label: 'Pending' },
  { value: 'approved',  label: 'Approved' },
  { value: 'rejected',  label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function LeaveHistory() {
  const { error: toastError } = useToast()

  const [filters, setFilters] = useState<GetMyLeavesParams>({
    page: 1, limit: 10, sort_by: 'created_at', sort_dir: 'desc',
  })
  const [cancelId, setCancelId]     = useState<number | null>(null)
  const [drawerLeave, setDrawerLeave] = useState<LeaveRequest | null>(null)
  const [exporting, setExporting]   = useState(false)

  const { data, isLoading } = useMyLeaves(filters)
  const { data: balances } = useBalance()

  const setFilter = (key: keyof GetMyLeavesParams, value: string | number | undefined) =>
    setFilters((f) => ({ ...f, [key]: value || undefined, page: 1 }))

  const toggleSort = (field: SortField) => {
    setFilters((f) => ({
      ...f,
      sort_by:  field,
      sort_dir: f.sort_by === field && f.sort_dir === 'asc' ? 'desc' : 'asc',
    }))
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (filters.sort_by !== field) return <ChevronUp className="h-3 w-3 opacity-30" />
    return filters.sort_dir === 'asc'
      ? <ChevronUp className="h-3 w-3" />
      : <ChevronDown className="h-3 w-3" />
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const resp = await adminApi.exportReport({ format: 'pdf' })
      const url  = URL.createObjectURL(new Blob([resp.data], { type: 'application/pdf' }))
      const a    = document.createElement('a')
      a.href     = url
      a.download = 'my_leaves.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toastError('Export failed', 'Could not generate PDF. Try again.')
    } finally {
      setExporting(false)
    }
  }

  const leaveTypeOptions = balances?.map((b) => ({
    value: String(b.leave_type.id),
    label: b.leave_type.name,
  })) ?? []

  return (
    <div className="space-y-4">
      {/* Filters bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Status */}
            <div className="w-40">
              <Select
                value={filters.status ?? '__all__'}
                onValueChange={(v) => setFilter('status', v === '__all__' ? '' : v)}
              >
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Leave type */}
            <div className="w-44">
              <Select
                value={filters.leave_type_id ? String(filters.leave_type_id) : ''}
                onValueChange={(v) => setFilter('leave_type_id', v ? Number(v) : undefined)}
              >
                <SelectTrigger><SelectValue placeholder="Leave Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Types</SelectItem>
                  {leaveTypeOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date range */}
            <div className="flex items-center gap-2">
              <Input
                type="date"
                className="w-36 h-10"
                value={filters.start_date ?? ''}
                onChange={(e) => setFilter('start_date', e.target.value)}
                placeholder="From"
              />
              <span className="text-muted-foreground text-sm">—</span>
              <Input
                type="date"
                className="w-36 h-10"
                value={filters.end_date ?? ''}
                onChange={(e) => setFilter('end_date', e.target.value)}
                placeholder="To"
              />
            </div>

            {/* Clear filters */}
            {(filters.status || filters.leave_type_id || filters.start_date || filters.end_date) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilters({ page: 1, limit: 10, sort_by: 'created_at', sort_dir: 'desc' })}
              >
                <X className="h-4 w-4 mr-1" /> Clear
              </Button>
            )}

            <div className="ml-auto">
              <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
                <Download className="h-4 w-4 mr-1" />
                {exporting ? 'Exporting…' : 'Export PDF'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : data?.items.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => toggleSort('start_date')}
                  >
                    <span className="flex items-center gap-1">Start <SortIcon field="start_date" /></span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => toggleSort('end_date')}
                  >
                    <span className="flex items-center gap-1">End <SortIcon field="end_date" /></span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => toggleSort('days')}
                  >
                    <span className="flex items-center gap-1">Days <SortIcon field="days" /></span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => toggleSort('status')}
                  >
                    <span className="flex items-center gap-1">Status <SortIcon field="status" /></span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => toggleSort('created_at')}
                  >
                    <span className="flex items-center gap-1">Applied <SortIcon field="created_at" /></span>
                  </TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((leave) => (
                  <TableRow
                    key={leave.id}
                    className="cursor-pointer"
                    onClick={() => setDrawerLeave(leave)}
                  >
                    <TableCell className="font-medium">{leave.leave_type.name}</TableCell>
                    <TableCell>{format(parseISO(leave.start_date), 'MMM d, yyyy')}</TableCell>
                    <TableCell>{format(parseISO(leave.end_date), 'MMM d, yyyy')}</TableCell>
                    <TableCell>{leave.days}</TableCell>
                    <TableCell><LeaveStatusBadge status={leave.status} /></TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {format(parseISO(leave.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {leave.status === 'pending' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive h-7 px-2 text-xs"
                          onClick={() => setCancelId(leave.id)}
                        >
                          Cancel
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No leave requests found.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {data.page} of {data.pages} ({data.total} total)
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={data.page <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={data.page >= data.pages}
              onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Cancel dialog */}
      {cancelId !== null && (
        <CancelLeaveDialog
          leaveId={cancelId}
          open={cancelId !== null}
          onClose={() => setCancelId(null)}
        />
      )}

      {/* Detail drawer */}
      <LeaveDetailDrawer
        leave={drawerLeave}
        open={drawerLeave !== null}
        onClose={() => setDrawerLeave(null)}
      />
    </div>
  )
}
