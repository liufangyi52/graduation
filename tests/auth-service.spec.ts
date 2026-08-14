import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { canManageProjectBusiness, canUpdateVisibleTasks, createAuthService } from '../src/services/authService'

afterEach(() => vi.restoreAllMocks())

it('loads the current user from the authenticated profile endpoint', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
    id: 'u1',
    role: 'manager',
    name: '数据库姓名',
    email: 'u@example.com',
  }), { status: 200 }))

  const user = await createAuthService().currentUser('token-1')

  expect(user.name).toBe('数据库姓名')
  expect(fetchMock).toHaveBeenCalledWith(
    'http://127.0.0.1:3000/api/auth/me',
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token-1' }) }),
  )
})

it('does not expose project business routes to administrators', () => {
  const routes = createAuthService().visibleRoutes('admin')

  expect(routes).toEqual(['/dashboard', '/notifications', '/settings', '/users', '/audit-logs', '/search'])
  expect(routes).not.toContain('/projects')
  expect(routes).not.toContain('/tasks')
  expect(routes).not.toContain('/risks')
  expect(routes).not.toContain('/meetings')
  expect(routes).not.toContain('/reviews')
})

it('limits auditors to audit workspace, notifications, and audit logs', () => {
  expect(createAuthService().visibleRoutes('auditor'))
    .toEqual(['/dashboard', '/notifications', '/audit-logs', '/search'])
})

it('renders a dedicated auditor dashboard without project management actions', () => {
  const appSource = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')

  expect(appSource).toContain("currentPage === 'dashboard' && user.role === 'auditor'")
  expect(appSource).not.toContain("user.role === 'auditor' && navigate('/projects')")
})

it('exposes project business controls only to project managers', () => {
  expect(canManageProjectBusiness('manager')).toBe(true)
  expect(canManageProjectBusiness('admin')).toBe(false)
  expect(canManageProjectBusiness('member')).toBe(false)
  expect(canManageProjectBusiness('auditor')).toBe(false)
})

it('limits task creation authority to project managers', () => {
  const appSource = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')

  expect(appSource).toContain('v-if="currentPage === \'tasks\' && canManageBusiness"')
})

it('keeps task action controls hidden from read-only roles', () => {
  expect(canUpdateVisibleTasks('manager')).toBe(true)
  expect(canUpdateVisibleTasks('member')).toBe(true)
  expect(canUpdateVisibleTasks('admin')).toBe(false)
  expect(canUpdateVisibleTasks('auditor')).toBe(false)
})

it('loads and saves system settings through administrator API endpoints', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ model: 'DeepSeek V3', mode: 'RAG', desensitize: true }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ model: 'Qwen 2.5', mode: 'RAG', desensitize: false }), { status: 200 }))
  const service = createAuthService()

  await expect(service.getSystemSettings('token-1')).resolves.toEqual({ model: 'DeepSeek V3', mode: 'RAG', desensitize: true })
  await expect(service.updateSystemSettings('token-1', { model: 'Qwen 2.5', mode: 'RAG', desensitize: false }))
    .resolves.toEqual({ model: 'Qwen 2.5', mode: 'RAG', desensitize: false })

  expect(fetchMock).toHaveBeenNthCalledWith(1, expect.stringContaining('/settings'), expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token-1' }) }))
  expect(fetchMock).toHaveBeenNthCalledWith(2, expect.stringContaining('/settings'), expect.objectContaining({ method: 'PATCH' }))
})

it('uses the protected account governance endpoints', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'u2' }), { status: 200 }))
    .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    .mockResolvedValueOnce(new Response('{}', { status: 200 }))
  const service = createAuthService()

  await service.createUser('token-1', { role: 'member', name: 'Member', email: 'member@example.com', password: 'password-1' })
  await service.updateUser('token-1', 'u2', { isActive: false })
  await service.resetPassword('token-1', 'u2', 'password-2')

  expect(fetchMock).toHaveBeenNthCalledWith(1, expect.stringContaining('/users'), expect.objectContaining({ method: 'POST' }))
  expect(fetchMock).toHaveBeenNthCalledWith(2, expect.stringContaining('/users/u2'), expect.objectContaining({ method: 'PATCH' }))
  expect(fetchMock).toHaveBeenNthCalledWith(3, expect.stringContaining('/users/u2/reset-password'), expect.objectContaining({ method: 'POST' }))
})
