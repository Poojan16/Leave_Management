import { useState } from 'react'
import { Loader2, Plus, Pencil, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { useUsers, useCreateUser, useUpdateUser, useDeactivateUser, useDepartments } from '@/hooks/useAdmin'
import { useToast } from '@/components/ui/toast'
import { normalizeError } from '@/api/client'
import type { User } from '@/types'
import type { ListUsersParams } from '@/api/admin'

const ROLE_BADGE: Record<string, string> = {
  admin:    'bg-purple-100 text-purple-800 border-purple-200',
  manager:  'bg-blue-100 text-blue-800 border-blue-200',
  employee: 'bg-green-100 text-green-800 border-green-200',
}

function UserFormDialog({ user, open, onClose }: { user?: User; open: boolean; onClose: () => void }) {
  const isEdit = !!user
  const { data: depts } = useDepartments()
  const { mutateAsync: create, isPending: creating } = useCreateUser()
  const { mutateAsync: update, isPending: updating } = useUpdateUser()
  const { success, error: toastError } = useToast()

  const [form, setForm] = useState({
    first_name:  user?.first_name ?? '',
    last_name:   user?.last_name  ?? '',
    email:       user?.email      ?? '',
    employee_id: '',
    password:    '',
    role:        user?.role       ?? 'employee',
    dept_id:     user?.dept_id    ?? '',
    is_active:   user?.is_active  ?? true,
  })

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }))
  const isPending = creating || updating

  const handleSubmit = async () => {
    try {
      if (isEdit) {
        await update({ id: user!.id, payload: { first_name: form.first_name, last_name: form.last_name, role: form.role, dept_id: form.dept_id || null, is_active: form.is_active } })
        success('User updated')
      } else {
        await create({ ...form, dept_id: form.dept_id || null, password: form.password || 'Temp@1234' })
        success('User created', 'Default password: Temp@1234')
      }
      onClose()
    } catch (err) { toastError('Failed', normalizeError(err).message) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit User' : 'Add User'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>First Name</Label><Input value={form.first_name} onChange={(e) => set('first_name', e.target.value)} /></div>
            <div className="space-y-1"><Label>Last Name</Label><Input value={form.last_name} onChange={(e) => set('last_name', e.target.value)} /></div>
          </div>
          {!isEdit && (
            <>
              <div className="space-y-1"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
              <div className="space-y-1"><Label>Employee ID</Label><Input value={form.employee_id} onChange={(e) => set('employee_id', e.target.value)} /></div>
            </>
          )}
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(v) => set('role', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">Employee</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Department</Label>
            <Select value={form.dept_id ? String(form.dept_id) : '__none__'} onValueChange={(v) => set('dept_id', v === '__none__' ? '' : Number(v))}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {depts?.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function Users() {
  const [filters, setFilters] = useState<ListUsersParams>({ page: 1, limit: 20 })
  const [addOpen, setAddOpen]     = useState(false)
  const [editUser, setEditUser]   = useState<User | null>(null)
  const [deactivateId, setDeactivateId] = useState<number | null>(null)

  const { data, isLoading } = useUsers(filters)
  const { mutateAsync: deactivate, isPending: deactivating } = useDeactivateUser()
  const { success, error: toastError } = useToast()

  const handleDeactivate = async () => {
    if (!deactivateId) return
    try {
      await deactivate(deactivateId)
      success('User deactivated')
      setDeactivateId(null)
    } catch (err) { toastError('Failed', normalizeError(err).message) }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-end">
          <Input className="w-52 h-10" placeholder="Search name, email, ID…" value={filters.search ?? ''} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))} />
          <div className="w-36">
            <Select value={filters.role ?? ''} onValueChange={(v) => setFilters((f) => ({ ...f, role: v === '__all__' ? undefined : v, page: 1 }))}>
              <SelectTrigger><SelectValue placeholder="Role" /></SelectTrigger>
              <SelectContent>
                {['__all__','employee','manager','admin'].map((r) => <SelectItem key={r} value={r}>{r === '__all__' ? 'All Roles' : r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-36">
            <Select value={filters.is_active === undefined ? '__all__' : String(filters.is_active)} onValueChange={(v) => setFilters((f) => ({ ...f, is_active: v === '__all__' ? undefined : v === 'true', page: 1 }))}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                <SelectItem value="true">Active</SelectItem>
                <SelectItem value="false">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="ml-auto" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add User
          </Button>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : data?.items.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.first_name} {user.last_name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{user.email}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ROLE_BADGE[user.role] ?? ''}`}>
                        {user.role}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{user.dept_id ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={user.is_active ? 'approved' : 'cancelled'}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setEditUser(user)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        {user.is_active && (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => setDeactivateId(user.id)}>
                            <UserX className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-10 text-center text-sm text-muted-foreground">No users found.</div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {data.page} of {data.pages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={data.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}>Previous</Button>
            <Button variant="outline" size="sm" disabled={data.page >= data.pages} onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}>Next</Button>
          </div>
        </div>
      )}

      {addOpen  && <UserFormDialog open={addOpen}  onClose={() => setAddOpen(false)} />}
      {editUser && <UserFormDialog user={editUser} open={!!editUser} onClose={() => setEditUser(null)} />}

      <Dialog open={deactivateId !== null} onOpenChange={(v) => !v && setDeactivateId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Deactivate User</DialogTitle>
            <DialogDescription>This will prevent the user from logging in. You can reactivate them later.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeactivate} disabled={deactivating}>
              {deactivating ? <><Loader2 className="h-4 w-4 animate-spin" /> Deactivating…</> : 'Deactivate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
