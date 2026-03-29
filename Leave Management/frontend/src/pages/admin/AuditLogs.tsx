import { useState } from 'react'
import { format } from 'date-fns'
import { Download, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuditLogs } from '@/hooks/useAdmin'
import { adminApi } from '@/api/admin'
import { useToast } from '@/components/ui/toast'

const ACTION_OPTIONS = ['','LEAVE_APPLIED','LEAVE_APPROVED','LEAVE_REJECTED','LEAVE_CANCELLED','USER_CREATED','USER_UPDATED','USER_DEACTIVATED','BALANCE_ALLOCATED']
const ENTITY_OPTIONS = ['','leave_request','user','leave_balance']

export default function AuditLogs() {
  const { error: toastError } = useToast()
  const [filters, setFilters] = useState<Record<string, unknown>>({ page: 1, limit: 25 })
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [exporting, setExporting] = useState(false)

  const { data, isLoading } = useAuditLogs(filters)

  const set = (k: string, v: unknown) => setFilters((f) => ({ ...f, [k]: v || undefined, page: 1 }))

  const toggleExpand = (id: number) =>
    setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const handleExport = async () => {
    setExporting(true)
    try {
      const resp = await adminApi.exportReport({ format: 'xlsx' })
      const url  = URL.createObjectURL(new Blob([resp.data]))
      const a    = document.createElement('a'); a.href = url; a.download = 'audit_logs.xlsx'; a.click()
      URL.revokeObjectURL(url)
    } catch { toastError('Export failed', 'Could not generate Excel.') }
    finally { setExporting(false) }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-end">
          <div className="w-44">
            <Select value={String(filters.action ?? '')} onValueChange={(v) => set('action', v)}>
              <SelectTrigger><SelectValue placeholder="Action" /></SelectTrigger>
              <SelectContent>{ACTION_OPTIONS.map((a) => <SelectItem key={a} value={a || '__all__'}>{a || 'All Actions'}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="w-40">
            <Select value={String(filters.entity ?? '')} onValueChange={(v) => set('entity', v)}>
              <SelectTrigger><SelectValue placeholder="Entity" /></SelectTrigger>
              <SelectContent>{ENTITY_OPTIONS.map((e) => <SelectItem key={e} value={e || '__all__'}>{e || 'All Entities'}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Input type="date" className="w-36 h-10" value={String(filters.start_date ?? '')} onChange={(e) => set('start_date', e.target.value)} />
          <span className="text-muted-foreground">—</span>
          <Input type="date" className="w-36 h-10" value={String(filters.end_date ?? '')} onChange={(e) => set('end_date', e.target.value)} />
          <Button variant="outline" size="sm" className="ml-auto" onClick={handleExport} disabled={exporting}>
            <Download className="h-4 w-4 mr-1" />{exporting ? 'Exporting…' : 'Excel'}
          </Button>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : data?.items.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Entity ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((log) => (
                  <>
                    <TableRow key={log.id} className="cursor-pointer" onClick={() => log.meta && toggleExpand(log.id)}>
                      <TableCell>
                        {log.meta && (expanded.has(log.id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{format(new Date(log.timestamp), 'MMM d, yyyy HH:mm:ss')}</TableCell>
                      <TableCell className="text-sm font-medium">{log.actor_name ?? 'System'}</TableCell>
                      <TableCell><span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{log.action}</span></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{log.entity}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{log.entity_id ?? '—'}</TableCell>
                    </TableRow>
                    {expanded.has(log.id) && log.meta && (
                      <TableRow key={`${log.id}-meta`}>
                        <TableCell colSpan={6} className="bg-muted/50 px-4 py-2">
                          <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap">{JSON.stringify(log.meta, null, 2)}</pre>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-10 text-center text-sm text-muted-foreground">No audit logs found.</div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {data.page} of {data.pages} ({data.total} total)</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={data.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: (Number(f.page) || 1) - 1 }))}>Previous</Button>
            <Button variant="outline" size="sm" disabled={data.page >= data.pages} onClick={() => setFilters((f) => ({ ...f, page: (Number(f.page) || 1) + 1 }))}>Next</Button>
          </div>
        </div>
      )}
    </div>
  )
}
