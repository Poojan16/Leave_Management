import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, CalendarDays, FileText, PlusCircle, Users,
  Building2, Settings, BarChart3, ClipboardList, Shield,
  ChevronLeft, ChevronRight, BookOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useAuthStore } from '@/store/authStore'
import type { Role } from '@/types'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  roles: Role[]
}

const NAV_ITEMS: NavItem[] = [
  // Employee
  { label: 'Dashboard',     href: '/employee/dashboard', icon: LayoutDashboard, roles: ['employee'] },
  { label: 'Apply Leave',   href: '/employee/apply',     icon: PlusCircle,      roles: ['employee'] },
  { label: 'My Leaves',     href: '/employee/history',   icon: FileText,        roles: ['employee'] },
  { label: 'Calendar',      href: '/employee/calendar',  icon: CalendarDays,    roles: ['employee'] },
  // Manager
  { label: 'Dashboard',     href: '/manager/dashboard',  icon: LayoutDashboard, roles: ['manager'] },
  { label: 'Team Leaves',   href: '/manager/leaves',     icon: ClipboardList,   roles: ['manager'] },
  { label: 'Team Calendar', href: '/manager/calendar',   icon: CalendarDays,    roles: ['manager'] },
  { label: 'Analytics',     href: '/manager/analytics',  icon: BarChart3,       roles: ['manager'] },
  // Admin
  { label: 'Dashboard',     href: '/admin/dashboard',    icon: LayoutDashboard, roles: ['admin'] },
  { label: 'Users',         href: '/admin/users',        icon: Users,           roles: ['admin'] },
  { label: 'Departments',   href: '/admin/departments',  icon: Building2,       roles: ['admin'] },
  { label: 'Leave Types',   href: '/admin/leave-types',  icon: BookOpen,        roles: ['admin'] },
  { label: 'Balances',      href: '/admin/balances',     icon: Settings,        roles: ['admin'] },
  { label: 'Audit Logs',    href: '/admin/audit-logs',   icon: Shield,          roles: ['admin'] },
  { label: 'Reports',       href: '/admin/reports',      icon: BarChart3,       roles: ['admin'] },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const user = useAuthStore((s) => s.user)
  const role = user?.role as Role | undefined

  const visibleItems = NAV_ITEMS.filter((item) => role && item.roles.includes(role))
  const initials = user ? `${user.first_name[0]}${user.last_name[0]}`.toUpperCase() : '?'

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col h-screen bg-slate-900 text-white transition-all duration-300 shrink-0',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-slate-700">
        {!collapsed && (
          <span className="text-lg font-bold tracking-tight text-white">
            LMS
          </span>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="ml-auto p-1 rounded hover:bg-slate-700 transition-colors"
          aria-label="Toggle sidebar"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 space-y-1 px-2">
        {visibleItems.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-white'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white'
              )
            }
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* User info */}
      <div className={cn('border-t border-slate-700 p-4 flex items-center gap-3', collapsed && 'justify-center')}>
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-primary text-white text-xs">{initials}</AvatarFallback>
        </Avatar>
        {!collapsed && user && (
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{user.first_name} {user.last_name}</p>
            <p className="text-xs text-slate-400 capitalize">{user.role}</p>
          </div>
        )}
      </div>
    </aside>
  )
}
