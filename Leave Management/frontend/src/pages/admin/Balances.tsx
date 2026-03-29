import { useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAdminBalances, useAllocateBalances, useLeaveTypes, useUsers } from '@/hooks/useAdmin'
import { useToast } from '@/components/ui/toast'
import { normalizeError } from '@/api/client'

const YEARS = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i + 1)

export default function Balances() {
  const [year,   setYear]   = useState(new Date().getFullYear())
  const [userId, setUserId] = useState<number | undefined>()
  const [allocOpen, setAllocOpen] = useState(false)
  const [allocForm, setAllocForm] = useState({ user_ids: 'all' as 'all' | number[], leave_type_id: 0, year: new Date().getFullYear(), days: 0 })

  const { data: balances, isLoading } = useAdminBalances({ user_id: userId, year })
  const { data: leaveTypes } = useLeaveTypes()
  const { data: users } = useUsers({ limit: 200, is_active: true })
  const { mutateAsync: allocate, isPending: allocating } = useAllocateBalances()
  const { success, error: toastError } = useToast()

  const handleAllocate = async () => {
    try {
      const result = await allocate({ ...allocForm, leave_type_id: Number(allocForm.leave_type_id), days: Number(allocForm.days) })
      success('Balances allocated', (result as { detail?: string })?.detail)
      setAllocOpen(false)
    } catch (err) { toastError('Failed', normalizeError(err).message) }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-end">
          <div className="w-28">
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="w-52">
            <Select value={userId ? String(userId) : ''} onValueChange={(v) => setUserId(v ? Number(v) : undefined)}>
              <SelectTrigger><SelectValue placeholder="All employees" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Employees</SelectItem>
                {users?.items.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.first_name} {u.last_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button className="ml-auto" onClick={() => setAllocOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Bulk Allocate
          </Button>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{[1,2,3,4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (balances as { items?: unknown[] })?.items?.length || (Array.isArray(balances) && (balances as unknown[]).length) ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User ID</TableHead>
                  <TableHead>Leave Type</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Allocated</TableHead>
                  <TableHead>Used</TableHead>
                  <TableHead>Carried Fwd</TableHead>
                  <TableHead>Remaining</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {((balances as { items?: unknown[] })?.items ?? (Array.isArray(balances) ? balances : []) as unknown[]).map((b: unknown) => {
                  const bal = b as { id: number; user_id: number; leave_type_id: number; year: number; allocated: number; used: number; carried_forward: number; remaining: number }
                  return (
                    <TableRow key={bal.id}>
                      <TableCell>{bal.user_id}</TableCell>
                      <TableCell>{bal.leave_type_id}</TableCell>
                      <TableCell>{bal.year}</TableCell>
                      <TableCell>{bal.allocated}</TableCell>
                      <TableCell>{bal.used}</TableCell>
                      <TableCell>{bal.carried_forward}</TableCell>
                      <TableCell className="font-semibold">{bal.remaining}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="p-10 text-center text-sm text-muted-foreground">No balance records found.</div>
          )}
        </CardContent>
      </Card>

      {/* Bulk allocate dialog */}
      <Dialog open={allocOpen} onOpenChange={(v) => !v && setAllocOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Bulk Allocate Leave Balance</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Employees</Label>
              <Select value={allocForm.user_ids === 'all' ? 'all' : 'specific'} onValueChange={(v) => setAllocForm((f) => ({ ...f, user_ids: v === 'all' ? 'all' : [] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Active Employees</SelectItem>
                  <SelectItem value="specific">Specific Employees</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Leave Type *</Label>
              <Select value={String(allocForm.leave_type_id)} onValueChange={(v) => setAllocForm((f) => ({ ...f, leave_type_id: Number(v) }))}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>{leaveTypes?.map((lt) => <SelectItem key={lt.id} value={String(lt.id)}>{lt.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Year</Label><Input type="number" value={allocForm.year} onChange={(e) => setAllocForm((f) => ({ ...f, year: Number(e.target.value) }))} /></div>
              <div className="space-y-1"><Label>Days *</Label><Input type="number" min={1} value={allocForm.days} onChange={(e) => setAllocForm((f) => ({ ...f, days: Number(e.target.value) }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAllocOpen(false)}>Cancel</Button>
            <Button onClick={handleAllocate} disabled={allocating || !allocForm.leave_type_id || !allocForm.days}>
              {allocating ? <><Loader2 className="h-4 w-4 animate-spin" /> Allocating…</> : 'Allocate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
