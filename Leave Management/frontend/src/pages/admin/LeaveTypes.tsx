import { useState } from 'react'
import { Plus, Pencil, Trash2, Loader2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useLeaveTypes, useCreateLeaveType, useUpdateLeaveType, useDeleteLeaveType } from '@/hooks/useAdmin'
import { useToast } from '@/components/ui/toast'
import { normalizeError } from '@/api/client'
import type { LeaveType } from '@/types'

function LeaveTypeFormDialog({ lt, open, onClose }: { lt?: LeaveType; open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ name: lt?.name ?? '', description: lt?.description ?? '', max_days_per_year: lt?.max_days_per_year ?? 0, carry_forward: lt?.carry_forward ?? false })
  const { mutateAsync: create, isPending: creating } = useCreateLeaveType()
  const { mutateAsync: update, isPending: updating } = useUpdateLeaveType()
  const { success, error: toastError } = useToast()
  const isPending = creating || updating

  const handleSave = async () => {
    if (!form.name.trim()) return
    try {
      if (lt) { await update({ id: lt.id, payload: form }) }
      else     { await create(form) }
      success(lt ? 'Leave type updated' : 'Leave type created')
      onClose()
    } catch (err) { toastError('Failed', normalizeError(err).message) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{lt ? 'Edit Leave Type' : 'Add Leave Type'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Annual" /></div>
          <div className="space-y-1"><Label>Description</Label><Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Max Days / Year</Label><Input type="number" min={0} value={form.max_days_per_year} onChange={(e) => setForm((f) => ({ ...f, max_days_per_year: Number(e.target.value) }))} /></div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="cf" checked={form.carry_forward} onChange={(e) => setForm((f) => ({ ...f, carry_forward: e.target.checked }))} className="h-4 w-4" />
            <Label htmlFor="cf">Allow carry forward to next year</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSave} disabled={isPending || !form.name.trim()}>
            {isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function LeaveTypes() {
  const { data: lts, isLoading } = useLeaveTypes()
  const { mutateAsync: deleteLt, isPending: deleting } = useDeleteLeaveType()
  const { success, error: toastError } = useToast()
  const [addOpen,  setAddOpen]  = useState(false)
  const [editLt,   setEditLt]   = useState<LeaveType | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const handleDelete = async () => {
    if (!deleteId) return
    try { await deleteLt(deleteId); success('Leave type deleted'); setDeleteId(null) }
    catch (err) { toastError('Failed', normalizeError(err).message) }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Leave Type</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : lts?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Max Days/Year</TableHead>
                  <TableHead>Carry Forward</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lts.map((lt) => (
                  <TableRow key={lt.id}>
                    <TableCell className="font-medium">{lt.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{lt.description ?? '—'}</TableCell>
                    <TableCell>{lt.max_days_per_year}</TableCell>
                    <TableCell>{lt.carry_forward ? <Check className="h-4 w-4 text-green-600" /> : <X className="h-4 w-4 text-muted-foreground" />}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setEditLt(lt)}><Pencil className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => setDeleteId(lt.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <div className="p-10 text-center text-sm text-muted-foreground">No leave types yet.</div>}
        </CardContent>
      </Card>

      {addOpen && <LeaveTypeFormDialog open={addOpen} onClose={() => setAddOpen(false)} />}
      {editLt  && <LeaveTypeFormDialog lt={editLt} open={!!editLt} onClose={() => setEditLt(null)} />}

      <Dialog open={deleteId !== null} onOpenChange={(v) => !v && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Leave Type</DialogTitle><DialogDescription>This cannot be undone. Existing leave requests using this type will be affected.</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <><Loader2 className="h-4 w-4 animate-spin" /> Deleting…</> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
