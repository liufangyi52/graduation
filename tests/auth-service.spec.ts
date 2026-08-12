import { afterEach, expect, it, vi } from 'vitest'
import { createAuthService } from '../src/services/authService'

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
