import { expect, it } from 'vitest'
import { refreshSession } from '../src/services/sessionService'

it('keeps the cached session when the profile refresh fails', async () => {
  const cached = {
    user: { id: 'u1', role: 'manager' as const, name: '缓存姓名', email: 'u@example.com' },
    token: 'token-1',
  }

  const result = await refreshSession(cached, async () => { throw new Error('offline') })

  expect(result.user.name).toBe('缓存姓名')
})

it('uses the database user when the profile refresh succeeds', async () => {
  const cached = {
    user: { id: 'u1', role: 'manager' as const, name: '缓存姓名', email: 'u@example.com' },
    token: 'token-1',
  }

  const result = await refreshSession(cached, async () => ({ ...cached.user, name: '数据库姓名' }))

  expect(result.user.name).toBe('数据库姓名')
})
