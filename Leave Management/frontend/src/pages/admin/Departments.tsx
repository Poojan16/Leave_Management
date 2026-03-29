import { useState } from 'react'
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useDepartments, useCreateDepartment, useUpdateDepartment, useDeleteDepartment } from '@/hooks/useAdmin'
import { useToast } from '@/components/ui/toast'
import { normalizeError } from '@/api/client'
import type { Department } from '@/types'

function DeptFormDialog({ dept, open, onClose }: { dept?: Department; open: boolean; onClose: () => void }) {
  const [name, setName] = useState(dept?.name ?? '')
  const [desc, setDesc] = useState(dept?.description ?? '')
  const { mutateAsync: create, isPending: creating } = useCreateDepartment()
  const { mutateAsync: update, isPending: updating } = useUpdateDepartment()
  const { success, error: toastError } = useToast()
  const isPending = creating || updating

  const handleSave = async () => {
    if (!name.trim()) return
    try {
      if (dept) { await update({ id: dept.id, payload: { name: name.trim(), description: desc.trim() || undefined } }) }
      else       { await create({ name: name.trim(), description: desc.trim() || undefined }) }
      success(dept ? 'Department updated' : 'Department created')
      onClose()
    } catch (err) { toastError('Failed', normalizeError(err).message) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{dept ? 'Edit Department' : 'Add Department'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Engineering" /></div>
          <div className="space-y-1"><Label>Description</Label><Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optional description" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSave} disabled={isPending || !name.trim()}>
            {isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function Departments() {
  const { data: depts, isLoading } = useDepartments()
  const { mutateAsync: deleteDept, isPending: deleting } = useDeleteDepartment()
  const { success, error: toastError } = useToast()

  const [addOpen,    setAddOpen]    = useState(false)
  const [editDept,   setEditDept]   = useState<Department | null>(null)
  const [deleteId,   setDeleteId]   = useState<number | null>(null)

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteDept(deleteId)
      success('Department deleted')
      setDeleteId(null)
    } catch (err) { toastError('Failed', normalizeError(err).message) }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Department</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : depts?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {depts.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{d.description ?? '—'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setEditDept(d)}><Pencil className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => setDeleteId(d.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-10 text-center text-sm text-muted-foreground">No departments yet.</div>
          )}
        </CardContent>
      </Card>

      {addOpen  && <DeptFormDialog open={addOpen}  onClose={() => setAddOpen(false)} />}
      {editDept && <DeptFormDialog dept={editDept} open={!!editDept} onClose={() => setEditDept(null)} />}

      <Dialog open={deleteId !== null} onOpenChange={(v) => !v && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Department</DialogTitle><DialogDescription>This cannot be undone. Users in this department will be unassigned.</DialogDescription></DialogHeader>
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
