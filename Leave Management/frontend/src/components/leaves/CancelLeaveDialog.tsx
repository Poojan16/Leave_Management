import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useCancelLeave } from '@/hooks/useLeaves'
import { useToast } from '@/components/ui/toast'
import { normalizeError } from '@/api/client'

interface Props {
  leaveId: number
  open: boolean
  onClose: () => void
}

export function CancelLeaveDialog({ leaveId, open, onClose }: Props) {
  const [reason, setReason] = useState('')
  const { mutateAsync, isPending } = useCancelLeave()
  const { success, error: toastError } = useToast()

  const handleConfirm = async () => {
    try {
      await mutateAsync({ id: leaveId, reason: reason.trim() || undefined })
      success('Leave cancelled', 'Your leave request has been cancelled and balance restored.')
      onClose()
    } catch (err) {
      toastError('Cancel failed', normalizeError(err).message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel Leave Request</DialogTitle>
          <DialogDescription>
            This will cancel your leave request and restore your balance. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label className="text-sm font-medium">Reason (optional)</label>
          <textarea
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            rows={3}
            placeholder="Why are you cancelling this leave?"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Keep Leave
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={isPending}>
            {isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Cancelling…</> : 'Cancel Leave'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
