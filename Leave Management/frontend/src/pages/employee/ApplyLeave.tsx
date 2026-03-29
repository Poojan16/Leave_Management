import { useState, useEffect, useMemo } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { Loader2, Sparkles, AlertTriangle, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { useBalance, useApplyLeave, useMyLeaves } from '@/hooks/useLeaves'
import { leavesApi } from '@/api/leaves'
import { normalizeError } from '@/api/client'
import { cn } from '@/lib/utils'
import { parseISO } from 'date-fns'

// ── Working days calculator ───────────────────────────────────────────────────
function calcWorkingDays(start: string, end: string): number {
  if (!start || !end) return 0
  const s = new Date(start)
  const e = new Date(end)
  if (e < s) return 0
  let count = 0
  const cur = new Date(s)
  while (cur <= e) {
    if (cur.getDay() !== 0 && cur.getDay() !== 6) count++
    cur.setDate(cur.getDate() + 1)
  }
  return Math.max(count, 1)
}

// ── Zod schema ────────────────────────────────────────────────────────────────
const schema = z.object({
  leave_type_id: z.string().min(1, 'Select a leave type.'),
  start_date:    z.string().min(1, 'Start date is required.'),
  end_date:      z.string().min(1, 'End date is required.'),
  reason:        z.string().min(5, 'Reason must be at least 5 characters.').max(500),
}).refine((d) => new Date(d.end_date) >= new Date(d.start_date), {
  message: 'End date must be on or after start date.',
  path: ['end_date'],
})

type FormValues = z.infer<typeof schema>

export default function ApplyLeave() {
  const navigate = useNavigate()
  const { success: toastSuccess, error: toastError } = useToast()
  const { data: balances } = useBalance()
  const { data: myLeaves } = useMyLeaves({ limit: 100 })
  const { mutateAsync: applyLeave, isPending } = useApplyLeave()

  const [aiText, setAiText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [showAi, setShowAi] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const watchedTypeId  = watch('leave_type_id')
  const watchedStart   = watch('start_date')
  const watchedEnd     = watch('end_date')

  // Working days preview
  const workingDays = useMemo(
    () => calcWorkingDays(watchedStart, watchedEnd),
    [watchedStart, watchedEnd]
  )

  // Selected balance
  const selectedBalance = useMemo(
    () => balances?.find((b) => String(b.leave_type.id) === watchedTypeId),
    [balances, watchedTypeId]
  )

  const insufficientBalance = selectedBalance
    ? workingDays > selectedBalance.remaining
    : false

  // Overlap check against existing approved/pending leaves
  const hasOverlap = useMemo(() => {
    if (!watchedStart || !watchedEnd || !myLeaves?.items) return false
    const s = new Date(watchedStart)
    const e = new Date(watchedEnd)
    return myLeaves.items.some((l) => {
      if (l.status === 'cancelled' || l.status === 'rejected') return false
      const ls = parseISO(l.start_date)
      const le = parseISO(l.end_date)
      return s <= le && e >= ls
    })
  }, [watchedStart, watchedEnd, myLeaves])

  // AI assist
  const handleAiParse = async () => {
    if (!aiText.trim()) return
    setAiLoading(true)
    try {
      const result = await leavesApi.parseLeaveAI(aiText)
      if (result.start_date) setValue('start_date', result.start_date)
      if (result.end_date)   setValue('end_date',   result.end_date)
      if (result.reason)     setValue('reason',     result.reason)
      if (result.leave_type_name && balances) {
        const match = balances.find(
          (b) => b.leave_type.name.toLowerCase() === result.leave_type_name!.toLowerCase()
        )
        if (match) setValue('leave_type_id', String(match.leave_type.id))
      }
      toastSuccess('AI filled the form', 'Review and adjust before submitting.')
    } catch {
      toastError('AI assist failed', 'Could not parse your text. Please fill the form manually.')
    } finally {
      setAiLoading(false)
    }
  }

  const onSubmit = async (values: FormValues) => {
    try {
      await applyLeave({
        leave_type_id: Number(values.leave_type_id),
        start_date:    values.start_date,
        end_date:      values.end_date,
        reason:        values.reason,
      })
      toastSuccess('Leave applied!', 'Your request is pending manager approval.')
      navigate('/employee/history')
    } catch (err) {
      toastError('Apply failed', normalizeError(err).message)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* AI Assist toggle */}
      <Card className="border-dashed border-primary/40 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">AI Assist</span>
              <span className="text-xs text-muted-foreground">Describe your leave in plain English</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAi((v) => !v)}
            >
              {showAi ? 'Hide' : 'Try it'}
            </Button>
          </div>

          {showAi && (
            <div className="mt-3 space-y-2">
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                rows={3}
                placeholder='e.g. "I need 3 days off next week for a medical procedure, starting Monday"'
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
              />
              <Button size="sm" onClick={handleAiParse} disabled={aiLoading || !aiText.trim()}>
                {aiLoading
                  ? <><Loader2 className="h-3 w-3 animate-spin" /> Parsing…</>
                  : <><Sparkles className="h-3 w-3" /> Auto-fill form</>
                }
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main form */}
      <Card>
        <CardHeader>
          <CardTitle>Apply for Leave</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            {/* Leave type */}
            <div className="space-y-2">
              <Label>Leave Type</Label>
              <Controller
                name="leave_type_id"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select leave type" />
                    </SelectTrigger>
                    <SelectContent>
                      {balances?.map((b) => (
                        <SelectItem key={b.leave_type.id} value={String(b.leave_type.id)}>
                          {b.leave_type.name}
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({b.remaining} days remaining)
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.leave_type_id && (
                <p className="text-xs text-destructive">{errors.leave_type_id.message}</p>
              )}

              {/* Balance info */}
              {selectedBalance && (
                <div className={cn(
                  'flex items-center gap-2 text-xs px-3 py-2 rounded-md',
                  insufficientBalance
                    ? 'bg-red-50 text-red-700'
                    : 'bg-green-50 text-green-700'
                )}>
                  <Info className="h-3 w-3 shrink-0" />
                  {insufficientBalance
                    ? `Insufficient balance. You have ${selectedBalance.remaining} day(s) remaining but need ${workingDays}.`
                    : `${selectedBalance.remaining} day(s) remaining for ${selectedBalance.leave_type.name}.`
                  }
                </div>
              )}
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">Start Date</Label>
                <Input
                  id="start_date"
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  {...register('start_date')}
                />
                {errors.start_date && (
                  <p className="text-xs text-destructive">{errors.start_date.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">End Date</Label>
                <Input
                  id="end_date"
                  type="date"
                  min={watchedStart || new Date().toISOString().split('T')[0]}
                  {...register('end_date')}
                />
                {errors.end_date && (
                  <p className="text-xs text-destructive">{errors.end_date.message}</p>
                )}
              </div>
            </div>

            {/* Working days preview */}
            {watchedStart && watchedEnd && workingDays > 0 && (
              <div className="flex items-center gap-2 text-sm bg-muted px-3 py-2 rounded-md">
                <Info className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>
                  <strong>{workingDays}</strong> working day{workingDays !== 1 ? 's' : ''} (weekends excluded)
                </span>
              </div>
            )}

            {/* Overlap warning */}
            {hasOverlap && (
              <div className="flex items-center gap-2 text-sm bg-amber-50 text-amber-800 px-3 py-2 rounded-md border border-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                You already have a pending or approved leave overlapping these dates.
              </div>
            )}

            {/* Reason */}
            <div className="space-y-2">
              <Label htmlFor="reason">Reason</Label>
              <textarea
                id="reason"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring min-h-[100px]"
                placeholder="Briefly describe the reason for your leave…"
                {...register('reason')}
              />
              {errors.reason && (
                <p className="text-xs text-destructive">{errors.reason.message}</p>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="submit"
                disabled={isPending || insufficientBalance}
                className="flex-1"
              >
                {isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</>
                  : 'Submit Leave Request'
                }
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/employee/history')}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
