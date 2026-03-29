import { useNavigate } from 'react-router-dom'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import type { Role } from '@/types'

const ROLE_HOME: Record<Role, string> = {
  admin: '/admin/dashboard',
  manager: '/manager/dashboard',
  employee: '/employee/dashboard',
}

export function useAuth() {
  const navigate = useNavigate()
  const { user, accessToken, refreshToken, isAuthenticated, setAuth, clearAuth } = useAuthStore()

  const login = async (email: string, password: string): Promise<void> => {
    const data = await authApi.login({ email, password })
    setAuth(data.user, data.access_token, data.refresh_token)
    navigate(ROLE_HOME[data.user.role] ?? '/employee/dashboard', { replace: true })
  }

  const logout = async (): Promise<void> => {
    try {
      if (refreshToken) await authApi.logout(refreshToken)
    } catch {
      // Ignore logout API errors — always clear local state
    } finally {
      clearAuth()
      navigate('/login', { replace: true })
    }
  }

  const isRole = (...roles: Role[]): boolean =>
    user ? roles.includes(user.role) : false

  return {
    user,
    accessToken,
    isAuthenticated,
    login,
    logout,
    isRole,
  }
}
