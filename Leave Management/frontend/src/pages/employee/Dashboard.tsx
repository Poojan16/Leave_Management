import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { format, differenceInCalendarDays, parseISO } from 'date-fns'
import { PlusCircle, CalendarCheck, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BalanceCard, BalanceCardSkeleton } from '@/components/leaves/BalanceCard'
import { LeaveStatusBadge } from '@/components/leaves/LeaveStatusBadge'
import { useBalance, useMyLeaves } from '@/hooks/useLeaves'
import { useAuthStore } from '@/store/authStore'

export default function Dashboard() {
  const user = useAuthStore((s) => s.user)

  const { data: balances, isLoading: balLoading } = useBalance()
  const { data: leavesPage, isLoading: leavesLoading } = useMyLeaves({ limit: 5, sort_by: 'created_at', sort_dir: 'desc' })

  // Next upcoming approved leave
  const upcomingLeave = useMemo(() => {
    if (!leavesPage?.items) return null
    const today = new Date()
    return leavesPage.items
      .filter((l) => l.status === 'approved' && parseISO(l.start_date) >= today)
      .sort((a, b) => parseISO(a.start_date).getTime() - parseISO(b.start_date).getTime())[0] ?? null
  }, [leavesPage])

  const daysUntil = upcomingLeave
    ? differenceInCalendarDays(parseISO(upcomingLeave.start_date), new Date())
    : null

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">
            Good {getGreeting()}, {user?.first_name} 👋
          </h2>
          <p className="text-muted-foreground text-sm mt-1">Here's your leave overview</p>
        </div>
        <Button asChild>
          <Link to="/employee/apply">
            <PlusCircle className="h-4 w-4" />
            Apply Leave
          </Link>
        </Button>
      </div>

      {/* Balance cards */}
      <section>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Leave Balances
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {balLoading
            ? Array.from({ length: 3 }).map((_, i) => <BalanceCardSkeleton key={i} />)
            : balances?.length
              ? balances.map((b) => <BalanceCard key={b.leave_type.id} balance={b} />)
              : <p className="text-sm text-muted-foreground col-span-full">No balance records found. Contact your admin.</p>
          }
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent leaves table */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Recent Requests</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/employee/history" className="flex items-center gap-1 text-xs">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {leavesLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : leavesPage?.items.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leavesPage.items.map((leave) => (
                    <TableRow key={leave.id}>
                      <TableCell className="font-medium">{leave.leave_type.name}</TableCell>
                      <TableCell>{format(parseISO(leave.start_date), 'MMM d, yyyy')}</TableCell>
                      <TableCell>{format(parseISO(leave.end_date), 'MMM d, yyyy')}</TableCell>
                      <TableCell>{leave.days}</TableCell>
                      <TableCell><LeaveStatusBadge status={leave.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No leave requests yet.{' '}
                <Link to="/employee/apply" className="text-primary hover:underline">Apply now</Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming leave widget */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-primary" />
              Upcoming Leave
            </CardTitle>
          </CardHeader>
          <CardContent>
            {leavesLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-8 w-20" />
              </div>
            ) : upcomingLeave ? (
              <div className="space-y-3">
                <div>
                  <p className="font-semibold">{upcomingLeave.leave_type.name}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {format(parseISO(upcomingLeave.start_date), 'MMM d')} —{' '}
                    {format(parseISO(upcomingLeave.end_date), 'MMM d, yyyy')}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {upcomingLeave.days} day{upcomingLeave.days !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="rounded-lg bg-primary/10 px-4 py-3 text-center">
                  <p className="text-3xl font-bold text-primary">{daysUntil}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {daysUntil === 0 ? 'Today!' : daysUntil === 1 ? 'day away' : 'days away'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground">No upcoming approved leaves.</p>
                <Button variant="link" size="sm" asChild className="mt-1">
                  <Link to="/employee/apply">Plan one now</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
