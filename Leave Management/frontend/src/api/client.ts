import axios, { type AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios'
import type { ApiError, TokenResponse } from '@/types'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1'

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: false,
})

// Track whether a refresh is already in-flight to avoid loops
let _isRefreshing = false
let _failedQueue: { resolve: (token: string) => void; reject: (err: unknown) => void }[] = []

function _processQueue(error: unknown, token: string | null) {
  _failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token!)))
  _failedQueue = []
}

// ── Request interceptor ───────────────────────────────────────────────────────
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // Lazy-import store to avoid circular deps at module load time
  const { useAuthStore } = require('@/store/authStore')
  const token: string | null = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Response interceptor ──────────────────────────────────────────────────────
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as AxiosRequestConfig & { _retry?: boolean }

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(normalizeError(error))
    }

    // Skip refresh for the refresh endpoint itself
    if (original.url?.includes('/auth/refresh') || original.url?.includes('/auth/login')) {
      const { useAuthStore } = require('@/store/authStore')
      useAuthStore.getState().clearAuth()
      window.location.href = '/login'
      return Promise.reject(normalizeError(error))
    }

    if (_isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        _failedQueue.push({ resolve, reject })
      }).then((token) => {
        original.headers = { ...original.headers, Authorization: `Bearer ${token}` }
        return apiClient(original)
      })
    }

    original._retry = true
    _isRefreshing = true

    try {
      const { useAuthStore } = require('@/store/authStore')
      const refreshToken: string | null = useAuthStore.getState().refreshToken

      if (!refreshToken) throw new Error('No refresh token')

      const { data } = await axios.post<TokenResponse>(
        `${BASE_URL}/auth/refresh`,
        { refresh_token: refreshToken }
      )

      useAuthStore.getState().setAuth(data.user, data.access_token, data.refresh_token)
      _processQueue(null, data.access_token)

      original.headers = { ...original.headers, Authorization: `Bearer ${data.access_token}` }
      return apiClient(original)
    } catch (refreshError) {
      _processQueue(refreshError, null)
      const { useAuthStore } = require('@/store/authStore')
      useAuthStore.getState().clearAuth()
      window.location.href = '/login'
      return Promise.reject(normalizeError(error))
    } finally {
      _isRefreshing = false
    }
  }
)

// ── Error normalizer ──────────────────────────────────────────────────────────
export function normalizeError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as Record<string, unknown> | undefined
    return {
      message: (data?.message as string) || (data?.detail as string) || error.message || 'An error occurred.',
      detail: data?.detail as string | undefined,
    }
  }
  if (error instanceof Error) return { message: error.message }
  return { message: 'An unexpected error occurred.' }
}

export default apiClient
