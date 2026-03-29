import { useState, useMemo } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventClickArg } from '@fullcalendar/core'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { LeaveDetailDrawer } from '@/components/leaves/LeaveDetailDrawer'
import { useCalendarLeaves, useMyLeaves } from '@/hooks/useLeaves'
import type { LeaveRequest, LeaveStatus } from '@/types'

// ── Status → FullCalendar color ───────────────────────────────────────────────
const STATUS_COLOR: Record<LeaveStatus, string> = {
  approved:  '#16a34a',
  pending:   '#d97706',
  rejected:  '#dc2626',
  cancelled: '#9ca3af',
}

const LEGEND: { status: LeaveStatus; label: string }[] = [
  { status: 'approved',  label: 'Approved' },
  { status: 'pending',   label: 'Pending' },
  { status: 'rejected',  label: 'Rejected' },
  { status: 'cancelled', label: 'Cancelled' },
]

export default function LeaveCalendar() {
  const today = new Date()
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [drawerLeave, setDrawerLeave] = useState<LeaveRequest | null>(null)

  const { data: calLeaves, isLoading } = useCalendarLeaves(year, month)

  // We also need full leave objects for the drawer — fetch all leaves
  const { data: allLeaves } = useMyLeaves({ limit: 200 })

  // Map calendar leaves to FullCalendar events
  const events = useMemo(() => {
    if (!calLeaves) return []
    return calLeaves.map((l) => ({
      id:              String(l.id),
      title:           l.leave_type.name,
      start:           l.start_date,
      end:             (() => {
        // FullCalendar end is exclusive — add 1 day
        const d = new Date(l.end_date)
        d.setDate(d.getDate() + 1)
        return d.toISOString().split('T')[0]
      })(),
      backgroundColor: STATUS_COLOR[l.status],
      borderColor:     STATUS_COLOR[l.status],
      textColor:       '#ffffff',
      extendedProps:   { leaveId: l.id, status: l.status },
    }))
  }, [calLeaves])

  const handleEventClick = (info: EventClickArg) => {
    const leaveId = info.event.extendedProps.leaveId as number
    const full = allLeaves?.items.find((l) => l.id === leaveId)
    if (full) setDrawerLeave(full)
  }

  const handleDatesSet = (info: { view: { currentStart: Date } }) => {
    const d = info.view.currentStart
    setYear(d.getFullYear())
    setMonth(d.getMonth() + 1)
  }

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap gap-4">
        {LEGEND.map(({ status, label }) => (
          <div key={status} className="flex items-center gap-1.5 text-sm">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: STATUS_COLOR[status] }}
            />
            {label}
          </div>
        ))}
      </div>

      {/* Calendar */}
      <Card>
        <CardContent className="p-4">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-96 w-full" />
            </div>
          ) : (
            <FullCalendar
              plugins={[dayGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              events={events}
              eventClick={handleEventClick}
              datesSet={handleDatesSet}
              headerToolbar={{
                left:   'prev,next today',
                center: 'title',
                right:  'dayGridMonth',
              }}
              height="auto"
              eventDisplay="block"
              dayMaxEvents={3}
              eventTimeFormat={{ hour: undefined, minute: undefined }}
            />
          )}
        </CardContent>
      </Card>

      {/* Detail drawer */}
      <LeaveDetailDrawer
        leave={drawerLeave}
        open={drawerLeave !== null}
        onClose={() => setDrawerLeave(null)}
      />
    </div>
  )
}
