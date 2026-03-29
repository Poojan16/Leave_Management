import { useState } from 'react'
import { Loader2, XCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useRejectLeave } from '@/hooks/useManager'
import { useToast } from '@/components/ui/toast'
import { normalizeError } from '@/api/client'

interface Props {
  leaveId: number
  employeeName: string
  open: boolean
  onClose: () => void
}

export function RejectDialog({ leaveId, employeeName, open, onClose }: Props) {
  const [remarks, setRemarks] = useState('')
  const [touched, setTouched] = useState(false)
  const { mutateAsync, isPending } = useRejectLeave()
  const { success, error: toastError } = useToast()

  const isInvalid = !remarks.trim()

  const handleConfirm = async () => {
    setTouched(true)
    if (isInvalid) return
    try {
      await mutateAsync({ id: leaveId, payload: { remarks: remarks.trim() } })
      success('Leave rejected', `${employeeName}'s leave request has been rejected.`)
      setRemarks('')
      setTouched(false)
      onClose()
    } catch (err) {
      toastError('Rejection failed', normalizeError(err).message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setTouched(false); onClose() } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-destructive" />
            Reject Leave Request
          </DialogTitle>
          <DialogDescription>
            Rejecting leave for <strong>{employeeName}</strong>. Remarks are required and will be sent to the employee.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label className="text-sm font-medium">
            Remarks <span className="text-destructive">*</span>
          </label>
          <textarea
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            rows={3}
            placeholder="Explain why this leave is being rejected…"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
          {touched && isInvalid && (
            <p className="text-xs text-destructive">Remarks are required when rejecting a leave.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={isPending}>
            {isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Rejecting…</> : 'Reject'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
