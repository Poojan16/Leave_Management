import { format } from 'date-fns'
import { Users, UserX } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LeaveStatusBadge } from '@/components/leaves/LeaveStatusBadge'
import { useTeamLeaves } from '@/hooks/useManager'
import { Skeleton } from '@/components/ui/skeleton'

export function TeamAvailability() {
  const today = format(new Date(), 'yyyy-MM-dd')

  const { data, isLoading } = useTeamLeaves({
    start_date: today,
    end_date:   today,
    limit: 20,
  })

  const absentToday = data?.items.filter(
    (l) => l.status === 'approved' || l.status === 'pending'
  ) ?? []

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Team Today — {format(new Date(), 'MMM d, yyyy')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : absentToday.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <UserX className="h-4 w-4" />
            Everyone is in today.
          </div>
        ) : (
          <ul className="space-y-2">
            {absentToday.map((l) => (
              <li key={l.id} className="flex items-center justify-between text-sm">
                <span className="font-medium">{l.employee_name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{l.leave_type.name}</span>
                  <LeaveStatusBadge status={l.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
