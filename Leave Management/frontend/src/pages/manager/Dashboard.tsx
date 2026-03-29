import { useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { CheckCircle, XCircle, Clock, FileText, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { LeaveStatusBadge } from '@/components/leaves/LeaveStatusBadge'
import { TeamAvailability } from '@/components/manager/TeamAvailability'
import { ApproveDialog } from '@/components/manager/ApproveDialog'
import { RejectDialog } from '@/components/manager/RejectDialog'
import { useManagerStats, useTeamLeaves } from '@/hooks/useManager'
import type { TeamLeaveRequest } from '@/types'

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const PIE_COLORS  = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4']

interface StatCardProps { label: string; value: number; icon: React.ElementType; color: string; loading: boolean }
function StatCard({ label, value, icon: Icon, color, loading }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-4">
        <div className={`rounded-full p-3 ${color}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div>
          {loading ? <Skeleton className="h-7 w-12 mb-1" /> : <p className="text-2xl font-bold">{value}</p>}
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export default function ManagerDashboard() {
  const year = new Date().getFullYear()
  const { data: stats, isLoading: statsLoading } = useManagerStats(year)
  const { data: pendingPage, isLoading: pendingLoading } = useTeamLeaves({ status: 'pending', limit: 5 })

  const [approveTarget, setApproveTarget] = useState<TeamLeaveRequest | null>(null)
  const [rejectTarget,  setRejectTarget]  = useState<TeamLeaveRequest | null>(null)

  const barData = MONTH_NAMES.map((name, i) => ({
    name,
    count: stats?.by_month.find((m) => m.month === i + 1)?.count ?? 0,
  }))

  const pieData = stats?.by_type.map((t) => ({ name: t.leave_type, value: t.count })) ?? []

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Requests"  value={stats?.total_requests ?? 0} icon={FileText}     color="bg-blue-500"   loading={statsLoading} />
        <StatCard label="Pending"         value={stats?.pending ?? 0}        icon={Clock}         color="bg-amber-500"  loading={statsLoading} />
        <StatCard label="Approved"        value={stats?.approved ?? 0}       icon={CheckCircle}   color="bg-green-500"  loading={statsLoading} />
        <StatCard label="Rejected"        value={stats?.rejected ?? 0}       icon={XCircle}       color="bg-red-500"    loading={statsLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pending approvals */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Pending Approvals</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/manager/leaves" className="flex items-center gap-1 text-xs">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {pendingLoading ? (
              <div className="p-4 space-y-3">
                {[1,2,3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : pendingPage?.items.length ? (
              <ul className="divide-y">
                {pendingPage.items.map((leave) => (
                  <li key={leave.id} className="flex items-center justify-between px-4 py-3 gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{leave.employee_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {leave.leave_type.name} · {format(new Date(leave.start_date), 'MMM d')} – {format(new Date(leave.end_date), 'MMM d')} · {leave.days}d
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => setApproveTarget(leave)}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 px-2 text-xs"
                        onClick={() => setRejectTarget(leave)}
                      >
                        Reject
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No pending requests. 🎉
              </div>
            )}
          </CardContent>
        </Card>

        {/* Team availability */}
        <TeamAvailability />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar chart — by month */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Requests by Month ({year})</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? <Skeleton className="h-56 w-full" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={barData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Pie chart — by type */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Requests by Leave Type</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? <Skeleton className="h-56 w-full" /> : pieData.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">No data yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialogs */}
      {approveTarget && (
        <ApproveDialog
          leaveId={approveTarget.id}
          employeeName={approveTarget.employee_name}
          open={!!approveTarget}
          onClose={() => setApproveTarget(null)}
        />
      )}
      {rejectTarget && (
        <RejectDialog
          leaveId={rejectTarget.id}
          employeeName={rejectTarget.employee_name}
          open={!!rejectTarget}
          onClose={() => setRejectTarget(null)}
        />
      )}
    </div>
  )
}
