import { useState, useMemo } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventClickArg } from '@fullcalendar/core'
import { format } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ConflictWarning } from '@/components/manager/ConflictWarning'
import { useTeamCalendar } from '@/hooks/useManager'

// Deterministic color per employee name
const PALETTE = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899','#84cc16','#f97316','#6366f1']
function colorFor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

interface PopoverInfo { title: string; date: string; type: string; status: string }

export default function TeamCalendar() {
  const today = new Date()
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [popover, setPopover] = useState<PopoverInfo | null>(null)

  const { data: calDays, isLoading } = useTeamCalendar(year, month)

  // Find conflict days (3+ absences)
  const conflictDays = useMemo(() => {
    if (!calDays) return []
    return calDays.filter((d) => d.leaves_on_date.length >= 3)
  }, [calDays])

  // Build FullCalendar events from team calendar days
  const events = useMemo(() => {
    if (!calDays) return []
    return calDays.flatMap((day) =>
      day.leaves_on_date.map((entry, i) => ({
        id:              `${day.date}-${i}`,
        title:           `${entry.user_name} (${entry.leave_type})`,
        start:           day.date,
        end:             day.date,
        backgroundColor: colorFor(entry.user_name),
        borderColor:     colorFor(entry.user_name),
        textColor:       '#ffffff',
        extendedProps:   { ...entry, date: day.date },
      }))
    )
  }, [calDays])

  const handleEventClick = (info: EventClickArg) => {
    const p = info.event.extendedProps as PopoverInfo & { date: string }
    setPopover({ title: info.event.title, date: p.date, type: p.leave_type, status: p.status })
  }

  return (
    <div className="space-y-4">
      {/* Conflict warnings */}
      {conflictDays.map((d) => (
        <ConflictWarning
          key={d.date}
          count={d.leaves_on_date.length}
          date={format(new Date(d.date), 'MMM d, yyyy')}
        />
      ))}

      {/* Legend */}
      <p className="text-xs text-muted-foreground">Each team member is assigned a unique color. Click an event for details.</p>

      {/* Calendar */}
      <Card>
        <CardContent className="p-4">
          {isLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : (
            <FullCalendar
              plugins={[dayGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              events={events}
              eventClick={handleEventClick}
              datesSet={(info) => {
                const d = info.view.currentStart
                setYear(d.getFullYear())
                setMonth(d.getMonth() + 1)
              }}
              headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth' }}
              height="auto"
              dayMaxEvents={4}
            />
          )}
        </CardContent>
      </Card>

      {/* Simple popover */}
      {popover && (
        <div className="fixed bottom-6 right-6 z-50 bg-background border rounded-lg shadow-xl p-4 max-w-xs">
          <button className="absolute top-2 right-2 text-muted-foreground hover:text-foreground text-lg leading-none" onClick={() => setPopover(null)}>×</button>
          <p className="font-semibold text-sm">{popover.title}</p>
          <p className="text-xs text-muted-foreground mt-1">{format(new Date(popover.date), 'MMMM d, yyyy')}</p>
          <p className="text-xs mt-1">Type: <span className="font-medium">{popover.type}</span></p>
          <p className="text-xs">Status: <span className="font-medium capitalize">{popover.status}</span></p>
        </div>
      )}
    </div>
  )
}
