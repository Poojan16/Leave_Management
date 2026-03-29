import apiClient from './client'
import type { LoginPayload, SignupPayload, TokenResponse, User } from '@/types'

export const authApi = {
  login: (payload: LoginPayload) =>
    apiClient.post<TokenResponse>('/auth/login', payload).then((r) => r.data),

  signup: (payload: SignupPayload) =>
    apiClient.post<TokenResponse>('/auth/signup', payload).then((r) => r.data),

  logout: (refreshToken: string) =>
    apiClient.post('/auth/logout', { refresh_token: refreshToken }),

  refresh: (refreshToken: string) =>
    apiClient.post<TokenResponse>('/auth/refresh', { refresh_token: refreshToken }).then((r) => r.data),

  getMe: () =>
    apiClient.get<User>('/auth/me').then((r) => r.data),

  forgotPassword: (email: string) =>
    apiClient.post('/auth/forgot-password', { email }),

  resetPassword: (token: string, newPassword: string) =>
    apiClient.post('/auth/reset-password', { token, new_password: newPassword }),
}
