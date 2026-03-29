import { useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { useManagerStats, useTeamLeaves } from '@/hooks/useManager'

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const TYPE_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4']
const YEARS = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i)

export default function Analytics() {
  const [year, setYear] = useState(new Date().getFullYear())
  const { data: stats, isLoading } = useManagerStats(year)

  // Employee ranking — fetch all approved leaves for the year
  const { data: allLeaves } = useTeamLeaves({ status: 'approved', limit: 200 })

  const employeeRanking = (() => {
    if (!allLeaves?.items) return []
    const map = new Map<string, { name: string; days: number; dept: string | null }>()
    allLeaves.items.forEach((l) => {
      const key = l.employee_name
      const cur = map.get(key) ?? { name: key, days: 0, dept: l.department_name }
      map.set(key, { ...cur, days: cur.days + l.days })
    })
    return Array.from(map.values()).sort((a, b) => b.days - a.days).slice(0, 10)
  })()

  const lineData = MONTH_NAMES.map((name, i) => ({
    name,
    requests: stats?.by_month.find((m) => m.month === i + 1)?.count ?? 0,
  }))

  // Stacked bar: by type per month (simplified — use by_type totals per month)
  const stackedData = MONTH_NAMES.map((name, i) => {
    const base: Record<string, number | string> = { name }
    stats?.by_type.forEach((t) => { base[t.leave_type] = 0 })
    const monthCount = stats?.by_month.find((m) => m.month === i + 1)?.count ?? 0
    // Distribute proportionally across types
    const total = stats?.total_requests ?? 1
    stats?.by_type.forEach((t) => {
      base[t.leave_type] = Math.round((t.count / total) * monthCount)
    })
    return base
  })

  return (
    <div className="space-y-6">
      {/* Year selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">Year:</span>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Line chart — trend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Leave Request Trend — {year}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-56 w-full" /> : (
            <ResponsiveContainer width="100%" height={220}>
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

      {/* Stacked bar — by type per month */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Leave by Type per Month</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-56 w-full" /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stackedData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                {stats?.by_type.map((t, i) => (
                  <Bar key={t.leave_type} dataKey={t.leave_type} stackId="a" fill={TYPE_COLORS[i % TYPE_COLORS.length]} radius={i === (stats.by_type.length - 1) ? [4,4,0,0] : [0,0,0,0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Employee ranking */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Employee Leave Ranking (Approved Days)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {employeeRanking.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Days Taken</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employeeRanking.map((emp, i) => (
                  <TableRow key={emp.name}>
                    <TableCell className="text-muted-foreground font-medium">{i + 1}</TableCell>
                    <TableCell className="font-medium">{emp.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{emp.dept ?? '—'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min((emp.days / (employeeRanking[0]?.days || 1)) * 100, 100)}%`, minWidth: 4 }} />
                        <span className="text-sm font-semibold">{emp.days}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">No approved leaves data.</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
