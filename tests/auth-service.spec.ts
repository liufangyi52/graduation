import { afterEach, expect, it, vi } from 'vitest'
import { canManageProjectBusiness, createAuthService } from '../src/services/authService'

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

  expect(routes).toEqual(['/dashboard', '/notifications', '/settings', '/users', '/audit-logs'])
  expect(routes).not.toContain('/projects')
  expect(routes).not.toContain('/tasks')
  expect(routes).not.toContain('/risks')
  expect(routes).not.toContain('/meetings')
  expect(routes).not.toContain('/reviews')
})

it('exposes project business controls only to project managers', () => {
  expect(canManageProjectBusiness('manager')).toBe(true)
  expect(canManageProjectBusiness('admin')).toBe(false)
  expect(canManageProjectBusiness('member')).toBe(false)
  expect(canManageProjectBusiness('auditor')).toBe(false)
})
