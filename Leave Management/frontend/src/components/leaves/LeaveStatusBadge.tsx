import { Badge } from '@/components/ui/badge'
import type { LeaveStatus } from '@/types'

interface Props {
  status: LeaveStatus
  className?: string
}

const STATUS_LABEL: Record<LeaveStatus, string> = {
  pending:   'Pending',
  approved:  'Approved',
  rejected:  'Rejected',
  cancelled: 'Cancelled',
}

export function LeaveStatusBadge({ status, className }: Props) {
  return (
    <Badge variant={status} className={className}>
      {STATUS_LABEL[status]}
    </Badge>
  )
}
