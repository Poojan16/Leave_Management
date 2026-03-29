import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { AppLayout } from '@/components/layout/AppLayout'
import { Spinner } from '@/components/ui/skeleton'
import type { Role } from '@/types'

// ── Lazy pages ────────────────────────────────────────────────────────────────
const Login       = lazy(() => import('@/pages/auth/Login'))
const Signup      = lazy(() => import('@/pages/auth/Signup'))
const Unauthorized = lazy(() => import('@/pages/Unauthorized'))
const NotFound    = lazy(() => import('@/pages/NotFound'))

// Employee
const EmployeeDashboard = lazy(() => import('@/pages/employee/Dashboard'))
const ApplyLeave        = lazy(() => import('@/pages/employee/ApplyLeave'))
const LeaveHistory      = lazy(() => import('@/pages/employee/LeaveHistory'))
const LeaveCalendar     = lazy(() => import('@/pages/employee/LeaveCalendar'))

// Manager
const ManagerDashboard  = lazy(() => import('@/pages/manager/Dashboard'))
const TeamLeaves        = lazy(() => import('@/pages/manager/TeamLeaves'))
const TeamCalendar      = lazy(() => import('@/pages/manager/TeamCalendar'))
const ManagerAnalytics  = lazy(() => import('@/pages/manager/Analytics'))

// Admin
const AdminDashboard    = lazy(() => import('@/pages/admin/Dashboard'))
const AdminUsers        = lazy(() => import('@/pages/admin/Users'))
const AdminDepartments  = lazy(() => import('@/pages/admin/Departments'))
const AdminLeaveTypes   = lazy(() => import('@/pages/admin/LeaveTypes'))
const AdminBalances     = lazy(() => import('@/pages/admin/Balances'))
const AdminAuditLogs    = lazy(() => import('@/pages/admin/AuditLogs'))
const AdminReports      = lazy(() => import('@/pages/admin/Reports'))

// ── Loading fallback ──────────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner className="h-8 w-8 text-primary" />
    </div>
  )
}

function SuspenseWrapper() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Outlet />
    </Suspense>
  )
}

// ── AuthGuard ─────────────────────────────────────────────────────────────────
function AuthGuard() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <Outlet />
}

// ── RoleGuard ─────────────────────────────────────────────────────────────────
function RoleGuard({ roles }: { roles: Role[] }) {
  const user = useAuthStore((s) => s.user)
  if (!user || !roles.includes(user.role as Role)) {
    return <Navigate to="/unauthorized" replace />
  }
  return <Outlet />
}

// ── Dashboard redirect ────────────────────────────────────────────────────────
function DashboardRedirect() {
  const user = useAuthStore((s) => s.user)
  const destinations: Record<Role, string> = {
    admin:    '/admin/dashboard',
    manager:  '/manager/dashboard',
    employee: '/employee/dashboard',
  }
  const dest = user ? destinations[user.role as Role] : '/login'
  return <Navigate to={dest} replace />
}

// ── Router ────────────────────────────────────────────────────────────────────
export const router = createBrowserRouter([
  // Public routes
  {
    element: <SuspenseWrapper />,
    children: [
      { path: '/login',        element: <Login /> },
      { path: '/signup',       element: <Signup /> },
      { path: '/unauthorized', element: <Unauthorized /> },
      { path: '*',             element: <NotFound /> },
    ],
  },

  // Root redirect
  { path: '/', element: <DashboardRedirect /> },
  { path: '/dashboard', element: <DashboardRedirect /> },

  // Protected routes
  {
    element: <AuthGuard />,
    children: [
      {
        element: <AppLayout />,
        children: [
          // ── Employee ──────────────────────────────────────────────────────
          {
            element: <RoleGuard roles={['employee']} />,
            children: [
              {
                element: <SuspenseWrapper />,
                children: [
                  { path: '/employee/dashboard', element: <EmployeeDashboard /> },
                  { path: '/employee/apply',     element: <ApplyLeave /> },
                  { path: '/employee/history',   element: <LeaveHistory /> },
                  { path: '/employee/calendar',  element: <LeaveCalendar /> },
                ],
              },
            ],
          },

          // ── Manager ───────────────────────────────────────────────────────
          {
            element: <RoleGuard roles={['manager']} />,
            children: [
              {
                element: <SuspenseWrapper />,
                children: [
                  { path: '/manager/dashboard', element: <ManagerDashboard /> },
                  { path: '/manager/leaves',    element: <TeamLeaves /> },
                  { path: '/manager/calendar',  element: <TeamCalendar /> },
                  { path: '/manager/analytics', element: <ManagerAnalytics /> },
                ],
              },
            ],
          },

          // ── Admin ─────────────────────────────────────────────────────────
          {
            element: <RoleGuard roles={['admin']} />,
            children: [
              {
                element: <SuspenseWrapper />,
                children: [
                  { path: '/admin/dashboard',   element: <AdminDashboard /> },
                  { path: '/admin/users',        element: <AdminUsers /> },
                  { path: '/admin/departments',  element: <AdminDepartments /> },
                  { path: '/admin/leave-types',  element: <AdminLeaveTypes /> },
                  { path: '/admin/balances',     element: <AdminBalances /> },
                  { path: '/admin/audit-logs',   element: <AdminAuditLogs /> },
                  { path: '/admin/reports',      element: <AdminReports /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
])
