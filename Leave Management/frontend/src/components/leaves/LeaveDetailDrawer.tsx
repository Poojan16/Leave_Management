import { format } from 'date-fns'
import { X, CalendarDays, Clock, User, FileText, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LeaveStatusBadge } from './LeaveStatusBadge'
import { cn } from '@/lib/utils'
import type { LeaveRequest } from '@/types'

interface Props {
  leave: LeaveRequest | null
  open: boolean
  onClose: () => void
}

function Row({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b last:border-0">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium mt-0.5 break-words">{value}</p>
      </div>
    </div>
  )
}

export function LeaveDetailDrawer({ leave, open, onClose }: Props) {
  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          'fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-background shadow-xl flex flex-col transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-base font-semibold">Leave Details</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        {leave ? (
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {/* Status + type header */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-lg font-bold">{leave.leave_type.name}</span>
              <LeaveStatusBadge status={leave.status} />
            </div>

            <div className="divide-y">
              <Row
                icon={CalendarDays}
                label="Duration"
                value={`${format(new Date(leave.start_date), 'MMM d, yyyy')} — ${format(new Date(leave.end_date), 'MMM d, yyyy')}`}
              />
              <Row
                icon={Clock}
                label="Working Days"
                value={`${leave.days} day${leave.days !== 1 ? 's' : ''}`}
              />
              <Row
                icon={User}
                label="Employee"
                value={`${leave.user.first_name} ${leave.user.last_name}`}
              />
              <Row
                icon={FileText}
                label="Reason"
                value={leave.reason}
              />
              <Row
                icon={CalendarDays}
                label="Applied On"
                value={format(new Date(leave.created_at), 'MMM d, yyyy HH:mm')}
              />
            </div>

            {/* Approval remarks from approvals array if present */}
            {(leave as LeaveRequest & { approvals?: { remarks: string | null; action: string; actioned_at: string }[] }).approvals?.length ? (
              <div className="mt-4 rounded-md bg-muted p-4">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Manager Remarks</span>
                </div>
                {(leave as any).approvals.map((a: any, i: number) => (
                  <div key={i} className="text-sm text-muted-foreground">
                    <span className="capitalize font-medium text-foreground">{a.action}</span>
                    {a.remarks && `: ${a.remarks}`}
                    <span className="ml-2 text-xs">
                      {format(new Date(a.actioned_at), 'MMM d, yyyy')}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            No leave selected
          </div>
        )}
      </div>
    </>
  )
}
