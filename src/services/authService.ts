export type UserRole = 'manager' | 'member' | 'admin' | 'auditor'

export interface UserAccount {
  id: string
  role: UserRole
  name: string
  email: string
}

export interface AuthSession {
  user: UserAccount
  token: string
}

export interface ManagedUser extends UserAccount {
  is_active: boolean
  created_at: string
}

export interface SystemSettings {
  model: string
  mode: string
  desensitize: boolean
}

export interface RoleDemoNotificationResult {
  created: number
  missingRoles: UserRole[]
}

export interface RegistrationInput {
  role: UserRole
  name: string
  email: string
  password: string
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000/api'

async function request<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(Array.isArray(payload.message) ? payload.message.join('；') : payload.message || '请求失败')
  return payload as T
}

const routeMatrix: Record<UserRole, string[]> = {
  manager: ['/dashboard', '/projects', '/tasks', '/risks', '/notifications', '/experiments', '/calendar', '/efficiency', '/meetings', '/reviews', '/search'],
  member: ['/dashboard', '/projects', '/tasks', '/my-tasks', '/notifications', '/search'],
  admin: ['/dashboard', '/notifications', '/settings', '/users', '/audit-logs', '/search'],
  auditor: ['/dashboard', '/notifications', '/audit-logs', '/search'],
}

export function canManageProjectBusiness(role: UserRole): boolean {
  return role === 'manager'
}

export function canUpdateVisibleTasks(role: UserRole): boolean {
  return role === 'manager' || role === 'member'
}

export function createAuthService() {
  return {
    register(input: RegistrationInput) {
      return request<UserAccount>('/auth/register', { method: 'POST', body: JSON.stringify(input) })
    },
    login(email: string, password: string) {
      return request<AuthSession>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
    },
    currentUser(token: string) {
      return request<UserAccount>('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
    },
    listUsers(token: string) {
      return request<ManagedUser[]>('/users', { headers: { Authorization: `Bearer ${token}` } })
    },
    createUser(token: string, input: RegistrationInput) {
      return request<ManagedUser>('/users', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(input) })
    },
    updateUser(token: string, id: string, input: { role?: UserRole; isActive?: boolean; name?: string }) {
      return request(`/users/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(input) })
    },
    resetPassword(token: string, id: string, password: string) {
      return request(`/users/${id}/reset-password`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ password }) })
    },
    listAuditLogs(token: string) {
      return request<any[]>('/audit-logs', { headers: { Authorization: `Bearer ${token}` } })
    },
    getSystemSettings(token: string) {
      return request<SystemSettings>('/settings', { headers: { Authorization: `Bearer ${token}` } })
    },
    updateSystemSettings(token: string, input: SystemSettings) {
      return request<SystemSettings>('/settings', { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(input) })
    },
    createRoleDemoNotifications(token: string) {
      return request<RoleDemoNotificationResult>('/notifications/demo', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    },
    visibleRoutes(role: UserRole) {
      return routeMatrix[role]
    },
  }
}

export const roleLabels: Record<UserRole, string> = {
  manager: '项目经理',
  member: '项目成员',
  admin: '系统管理员',
  auditor: '审计人员',
}
