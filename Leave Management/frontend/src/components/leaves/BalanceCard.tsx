import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { LeaveBalance } from '@/types'

interface Props {
  balance: LeaveBalance
}

function getBarColor(pct: number): string {
  if (pct > 50) return 'bg-green-500'
  if (pct >= 25) return 'bg-amber-400'
  return 'bg-red-500'
}

function getTextColor(pct: number): string {
  if (pct > 50) return 'text-green-700'
  if (pct >= 25) return 'text-amber-700'
  return 'text-red-700'
}

export function BalanceCard({ balance }: Props) {
  const total = balance.allocated + balance.carried_forward
  const pct = total > 0 ? Math.round((balance.remaining / total) * 100) : 0

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{balance.leave_type.name}</p>
            <p className={cn('text-2xl font-bold mt-0.5', getTextColor(pct))}>
              {balance.remaining}
              <span className="text-sm font-normal text-muted-foreground ml-1">days left</span>
            </p>
          </div>
          <span className={cn('text-xs font-semibold px-2 py-1 rounded-full', getTextColor(pct),
            pct > 50 ? 'bg-green-50' : pct >= 25 ? 'bg-amber-50' : 'bg-red-50'
          )}>
            {pct}%
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500', getBarColor(pct))}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>

        <div className="flex justify-between mt-2 text-xs text-muted-foreground">
          <span>{balance.used} used</span>
          <span>{total} allocated</span>
        </div>
      </CardContent>
    </Card>
  )
}

export function BalanceCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-2 w-full" />
      </CardContent>
    </Card>
  )
}
