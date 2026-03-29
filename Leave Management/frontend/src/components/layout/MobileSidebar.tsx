import { NavLink } from 'react-router-dom'
import { X, LayoutDashboard, CalendarDays, FileText, PlusCircle, Users, Building2, Settings, BarChart3, ClipboardList, Shield, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import type { Role } from '@/types'

const NAV_ITEMS = [
  { label: 'Dashboard',     href: '/employee/dashboard', icon: LayoutDashboard, roles: ['employee'] as Role[] },
  { label: 'Apply Leave',   href: '/employee/apply',     icon: PlusCircle,      roles: ['employee'] as Role[] },
  { label: 'My Leaves',     href: '/employee/history',   icon: FileText,        roles: ['employee'] as Role[] },
  { label: 'Calendar',      href: '/employee/calendar',  icon: CalendarDays,    roles: ['employee'] as Role[] },
  { label: 'Dashboard',     href: '/manager/dashboard',  icon: LayoutDashboard, roles: ['manager'] as Role[] },
  { label: 'Team Leaves',   href: '/manager/leaves',     icon: ClipboardList,   roles: ['manager'] as Role[] },
  { label: 'Team Calendar', href: '/manager/calendar',   icon: CalendarDays,    roles: ['manager'] as Role[] },
  { label: 'Analytics',     href: '/manager/analytics',  icon: BarChart3,       roles: ['manager'] as Role[] },
  { label: 'Dashboard',     href: '/admin/dashboard',    icon: LayoutDashboard, roles: ['admin'] as Role[] },
  { label: 'Users',         href: '/admin/users',        icon: Users,           roles: ['admin'] as Role[] },
  { label: 'Departments',   href: '/admin/departments',  icon: Building2,       roles: ['admin'] as Role[] },
  { label: 'Leave Types',   href: '/admin/leave-types',  icon: BookOpen,        roles: ['admin'] as Role[] },
  { label: 'Balances',      href: '/admin/balances',     icon: Settings,        roles: ['admin'] as Role[] },
  { label: 'Audit Logs',    href: '/admin/audit-logs',   icon: Shield,          roles: ['admin'] as Role[] },
  { label: 'Reports',       href: '/admin/reports',      icon: BarChart3,       roles: ['admin'] as Role[] },
]

interface MobileSidebarProps {
  open: boolean
  onClose: () => void
}

export function MobileSidebar({ open, onClose }: MobileSidebarProps) {
  const user = useAuthStore((s) => s.user)
  const role = user?.role as Role | undefined
  const visibleItems = NAV_ITEMS.filter((item) => role && item.roles.includes(role))
  const initials = user ? `${user.first_name[0]}${user.last_name[0]}`.toUpperCase() : '?'

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white flex flex-col transition-transform duration-300 md:hidden',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between px-4 py-5 border-b border-slate-700">
          <span className="text-lg font-bold">LMS</span>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 space-y-1 px-2">
          {visibleItems.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                  isActive ? 'bg-primary text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                )
              }
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-700 p-4 flex items-center gap-3">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-primary text-white text-xs">{initials}</AvatarFallback>
          </Avatar>
          {user && (
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{user.first_name} {user.last_name}</p>
              <p className="text-xs text-slate-400 capitalize">{user.role}</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
