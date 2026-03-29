import { useState } from 'react'
import { Download, FileText, Table2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useCompanyStats, useLeaveTypes, useDepartments } from '@/hooks/useAdmin'
import { adminApi } from '@/api/admin'
import { useToast } from '@/components/ui/toast'

const YEARS   = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i)
const MONTHS  = ['','January','February','March','April','May','June','July','August','September','October','November','December']
const STATUSES = ['','pending','approved','rejected','cancelled']

export default function Reports() {
  const { error: toastError } = useToast()
  const [filters, setFilters] = useState<{
    year?: number; month?: number; dept_id?: number; status?: string; leave_type_id?: number
  }>({ year: new Date().getFullYear() })
  const [pdfLoading,  setPdfLoading]  = useState(false)
  const [xlsxLoading, setXlsxLoading] = useState(false)

  const { data: stats, isLoading: statsLoading } = useCompanyStats(filters.year)
  const { data: leaveTypes } = useLeaveTypes()
  const { data: depts }      = useDepartments()

  const set = (k: string, v: unknown) => setFilters((f) => ({ ...f, [k]: v || undefined }))

  const handleExport = async (format: 'pdf' | 'xlsx') => {
    const setLoading = format === 'pdf' ? setPdfLoading : setXlsxLoading
    setLoading(true)
    try {
      const resp = await adminApi.exportReport({
        format,
        year:          filters.year,
        month:         filters.month,
        dept_id:       filters.dept_id,
        status:        filters.status,
        leave_type_id: filters.leave_type_id,
      })
      const ext  = format === 'pdf' ? 'pdf' : 'xlsx'
      const mime = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      const url  = URL.createObjectURL(new Blob([resp.data], { type: mime }))
      const a    = document.createElement('a'); a.href = url; a.download = `leave_report.${ext}`; a.click()
      URL.revokeObjectURL(url)
    } catch { toastError('Export failed', 'Could not generate report. Try again.') }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-6">
      {/* Filter panel */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Report Filters</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="space-y-1">
              <Label>Year</Label>
              <Select value={String(filters.year ?? '')} onValueChange={(v) => set('year', v ? Number(v) : undefined)}>
                <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
                <SelectContent>{YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Month</Label>
              <Select value={String(filters.month ?? '')} onValueChange={(v) => set('month', v ? Number(v) : undefined)}>
                <SelectTrigger><SelectValue placeholder="All months" /></SelectTrigger>
                <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={i === 0 ? '__all__' : String(i)}>{m || 'All Months'}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Department</Label>
              <Select value={String(filters.dept_id ?? '')} onValueChange={(v) => set('dept_id', v === '__all__' ? undefined : Number(v))}>
                <SelectTrigger><SelectValue placeholder="All depts" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Departments</SelectItem>
                  {depts?.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={filters.status ?? ''} onValueChange={(v) => set('status', v === '__all__' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s || '__all__'}>{s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All Statuses'}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Leave Type</Label>
              <Select value={String(filters.leave_type_id ?? '')} onValueChange={(v) => set('leave_type_id', v === '__all__' ? undefined : Number(v))}>
                <SelectTrigger><SelectValue placeholder="All types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Types</SelectItem>
                  {leaveTypes?.map((lt) => <SelectItem key={lt.id} value={String(lt.id)}>{lt.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preview stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Card key={i}><CardContent className="p-5"><Skeleton className="h-12 w-full" /></CardContent></Card>)
        ) : (
          <>
            {[
              { label: 'Total Requests', value: stats?.total_requests ?? 0 },
              { label: 'Approved',       value: stats?.approved ?? 0 },
              { label: 'Days Taken',     value: stats?.total_days_taken ?? 0 },
              { label: 'Employees',      value: stats?.total_employees ?? 0 },
            ].map(({ label, value }) => (
              <Card key={label}>
                <CardContent className="p-5 text-center">
                  <p className="text-3xl font-bold">{value}</p>
                  <p className="text-sm text-muted-foreground mt-1">{label}</p>
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </div>

      {/* By type breakdown */}
      {stats?.by_leave_type.length ? (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">By Leave Type</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.by_leave_type.map((t) => {
                const pct = stats.total_requests > 0 ? Math.round((t.count / stats.total_requests) * 100) : 0
                return (
                  <div key={t.leave_type} className="flex items-center gap-3">
                    <span className="text-sm w-32 truncate">{t.leave_type}</span>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-sm font-medium w-12 text-right">{t.count}</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Export buttons */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Export Report</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Button
              size="lg"
              variant="outline"
              className="flex-1 min-w-[160px] border-red-200 text-red-700 hover:bg-red-50"
              onClick={() => handleExport('pdf')}
              disabled={pdfLoading}
            >
              {pdfLoading
                ? <><span className="animate-spin mr-2">⏳</span> Generating PDF…</>
                : <><FileText className="h-5 w-5 mr-2" /> Export as PDF</>
              }
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="flex-1 min-w-[160px] border-green-200 text-green-700 hover:bg-green-50"
              onClick={() => handleExport('xlsx')}
              disabled={xlsxLoading}
            >
              {xlsxLoading
                ? <><span className="animate-spin mr-2">⏳</span> Generating Excel…</>
                : <><Table2 className="h-5 w-5 mr-2" /> Export as Excel</>
              }
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Reports are generated based on the filters above. Large date ranges may take a few seconds.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
