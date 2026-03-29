import { useState } from 'react'
import { Loader2, CheckCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useApproveLeave } from '@/hooks/useManager'
import { useToast } from '@/components/ui/toast'
import { normalizeError } from '@/api/client'

interface Props {
  leaveId: number
  employeeName: string
  open: boolean
  onClose: () => void
}

export function ApproveDialog({ leaveId, employeeName, open, onClose }: Props) {
  const [remarks, setRemarks] = useState('')
  const { mutateAsync, isPending } = useApproveLeave()
  const { success, error: toastError } = useToast()

  const handleConfirm = async () => {
    try {
      await mutateAsync({ id: leaveId, payload: { remarks: remarks.trim() || undefined } })
      success('Leave approved', `${employeeName}'s leave request has been approved.`)
      setRemarks('')
      onClose()
    } catch (err) {
      toastError('Approval failed', normalizeError(err).message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Approve Leave Request
          </DialogTitle>
          <DialogDescription>
            Approving leave for <strong>{employeeName}</strong>. You may add optional remarks.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label className="text-sm font-medium">Remarks (optional)</label>
          <textarea
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            rows={3}
            placeholder="Add any notes for the employee…"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            className="bg-green-600 hover:bg-green-700 text-white"
            onClick={handleConfirm}
            disabled={isPending}
          >
            {isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Approving…</> : 'Approve'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
