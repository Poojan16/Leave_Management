import { format } from 'date-fns'
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Users, FileText, CheckCircle, Clock, XCircle, CalendarDays } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useCompanyStats, useAuditLogs } from '@/hooks/useAdmin'

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const PIE_COLORS  = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4']

function StatCard({ label, value, icon: Icon, color, loading }: { label: string; value: number; icon: React.ElementType; color: string; loading: boolean }) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-4">
        <div className={`rounded-full p-3 ${color}`}><Icon className="h-5 w-5 text-white" /></div>
        <div>
          {loading ? <Skeleton className="h-7 w-12 mb-1" /> : <p className="text-2xl font-bold">{value}</p>}
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export default function AdminDashboard() {
  const year = new Date().getFullYear()
  const { data: stats, isLoading: statsLoading } = useCompanyStats(year)
  const { data: auditPage, isLoading: auditLoading } = useAuditLogs({ limit: 10 })

  const lineData = MONTH_NAMES.map((name, i) => ({
    name,
    requests: stats?.by_month.find((m) => m.month === i + 1)?.count ?? 0,
  }))

  const pieData = stats?.by_leave_type.map((t) => ({ name: t.leave_type, value: t.count })) ?? []
  const deptData = stats?.by_department.slice(0, 8).map((d) => ({ name: d.department, count: d.count })) ?? []

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard label="Employees"    value={stats?.total_employees ?? 0}  icon={Users}        color="bg-slate-600"  loading={statsLoading} />
        <StatCard label="Total"        value={stats?.total_requests ?? 0}   icon={FileText}     color="bg-blue-500"   loading={statsLoading} />
        <StatCard label="Pending"      value={stats?.pending ?? 0}          icon={Clock}        color="bg-amber-500"  loading={statsLoading} />
        <StatCard label="Approved"     value={stats?.approved ?? 0}         icon={CheckCircle}  color="bg-green-500"  loading={statsLoading} />
        <StatCard label="Rejected"     value={stats?.rejected ?? 0}         icon={XCircle}      color="bg-red-500"    loading={statsLoading} />
        <StatCard label="Days Taken"   value={stats?.total_days_taken ?? 0} icon={CalendarDays} color="bg-purple-500" loading={statsLoading} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly trend */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base">Monthly Trend — {year}</CardTitle></CardHeader>
          <CardContent>
            {statsLoading ? <Skeleton className="h-52 w-full" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={lineData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="requests" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Leave type pie */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">By Leave Type</CardTitle></CardHeader>
          <CardContent>
            {statsLoading ? <Skeleton className="h-52 w-full" /> : pieData.length ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">No data</div>}
          </CardContent>
        </Card>
      </div>

      {/* Department bar + Audit feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">By Department</CardTitle></CardHeader>
          <CardContent>
            {statsLoading ? <Skeleton className="h-52 w-full" /> : deptData.length ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={deptData} layout="vertical" margin={{ top: 4, right: 8, left: 40, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#10b981" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">No data</div>}
          </CardContent>
        </Card>

        {/* Audit log feed */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Recent Activity</CardTitle></CardHeader>
          <CardContent>
            {auditLoading ? (
              <div className="space-y-2">{[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : auditPage?.items.length ? (
              <ul className="space-y-2 max-h-52 overflow-y-auto">
                {auditPage.items.map((log) => (
                  <li key={log.id} className="flex items-start gap-2 text-xs">
                    <span className="text-muted-foreground shrink-0 mt-0.5">{format(new Date(log.timestamp), 'MMM d HH:mm')}</span>
                    <div className="min-w-0">
                      <span className="font-medium">{log.actor_name ?? 'System'}</span>
                      {' '}
                      <span className="text-muted-foreground">{log.action.replace(/_/g, ' ').toLowerCase()}</span>
                      {' '}
                      <span className="text-muted-foreground">{log.entity} #{log.entity_id}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">No activity yet.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
