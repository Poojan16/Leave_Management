import { Bell, LogOut, User, Menu } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/authStore'

const PAGE_TITLES: Record<string, string> = {
  '/employee/dashboard': 'Dashboard',
  '/employee/apply':     'Apply for Leave',
  '/employee/history':   'My Leaves',
  '/employee/calendar':  'My Calendar',
  '/manager/dashboard':  'Manager Dashboard',
  '/manager/leaves':     'Team Leaves',
  '/manager/calendar':   'Team Calendar',
  '/manager/analytics':  'Analytics',
  '/admin/dashboard':    'Admin Dashboard',
  '/admin/users':        'User Management',
  '/admin/departments':  'Departments',
  '/admin/leave-types':  'Leave Types',
  '/admin/balances':     'Balance Management',
  '/admin/audit-logs':   'Audit Logs',
  '/admin/reports':      'Reports',
}

interface NavbarProps {
  onMenuClick?: () => void
}

export function Navbar({ onMenuClick }: NavbarProps) {
  const { logout } = useAuth()
  const user = useAuthStore((s) => s.user)
  const { pathname } = useLocation()

  const title = PAGE_TITLES[pathname] ?? 'Leave Management'
  const initials = user ? `${user.first_name[0]}${user.last_name[0]}`.toUpperCase() : '?'

  return (
    <header className="h-16 border-b bg-white flex items-center justify-between px-4 md:px-6 shrink-0">
      <div className="flex items-center gap-3">
        {/* Mobile hamburger */}
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onMenuClick}>
          <Menu className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        {/* Notifications (placeholder) */}
        <Button variant="ghost" size="icon" aria-label="Notifications">
          <Bell className="h-5 w-5" />
        </Button>

        {/* User dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 w-9 rounded-full p-0">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-primary text-white text-sm">{initials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="font-medium">{user?.first_name} {user?.last_name}</p>
              <p className="text-xs text-muted-foreground font-normal">{user?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2">
              <User className="h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 text-destructive focus:text-destructive"
              onClick={() => logout()}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
