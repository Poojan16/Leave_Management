import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  count: number
  date?: string
  className?: string
}

export function ConflictWarning({ count, date, className }: Props) {
  if (count < 3) return null
  return (
    <div className={cn(
      'flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800',
      className
    )}>
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
      <div>
        <p className="font-medium">High absence alert{date ? ` — ${date}` : ''}</p>
        <p className="text-xs mt-0.5">
          {count} team members are on leave. Consider reviewing pending requests to ensure adequate coverage.
        </p>
      </div>
    </div>
  )
}
