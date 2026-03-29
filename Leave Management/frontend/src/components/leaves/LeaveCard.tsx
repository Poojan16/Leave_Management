import { format } from 'date-fns'
import { CalendarDays, Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { LeaveStatusBadge } from './LeaveStatusBadge'
import type { LeaveRequest } from '@/types'

interface Props {
  leave: LeaveRequest
  onClick?: () => void
}

export function LeaveCard({ leave, onClick }: Props) {
  const start = format(new Date(leave.start_date), 'MMM d, yyyy')
  const end   = format(new Date(leave.end_date),   'MMM d, yyyy')

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{leave.leave_type.name}</p>
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
              <CalendarDays className="h-3 w-3 shrink-0" />
              <span>{start} — {end}</span>
            </div>
            <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" />
              <span>{leave.days} working day{leave.days !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <LeaveStatusBadge status={leave.status} />
        </div>
        {leave.reason && (
          <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{leave.reason}</p>
        )}
      </CardContent>
    </Card>
  )
}
