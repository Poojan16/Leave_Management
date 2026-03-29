import { cn } from '@/lib/utils'

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'inline-block h-5 w-5 animate-spin rounded-full border-2 border-solid border-current border-r-transparent',
        className
      )}
      role="status"
      aria-label="Loading"
    />
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />
}
