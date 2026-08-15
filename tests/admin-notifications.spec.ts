import { afterEach, expect, it, vi } from 'vitest'
import { AppService } from '../src/server/app.service'
import { pool } from '../src/server/database'

const admin = { id: 'admin-1', role: 'admin' as const, name: 'Admin', email: 'admin@example.com' }
const member = { id: 'member-1', role: 'member' as const, name: 'Member', email: 'member@example.com' }

afterEach(() => vi.restoreAllMocks())

it('allows an administrator to send a notification to one active user', async () => {
  vi.spyOn(pool, 'query').mockResolvedValueOnce([[{ id: 'member-1' }]] as any)
  const execute = vi.spyOn(pool, 'execute').mockResolvedValue([] as any)
  const service = new AppService({} as any)

  await expect((service as any).sendNotification(admin, {
    title: 'Maintenance window', body: 'The service will restart at 22:00.', audienceType: 'user', userId: 'member-1',
  })).resolves.toEqual({ created: 1 })

  expect(execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO notifications'), expect.arrayContaining(['member-1', 'Maintenance window', 'The service will restart at 22:00.']))
  expect(execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_logs'), expect.arrayContaining(['admin-1', 'notification.sent']))
})

it('expands a role audience to all active users with that role', async () => {
  vi.spyOn(pool, 'query').mockResolvedValueOnce([[{ id: 'member-1' }, { id: 'member-2' }]] as any)
  const execute = vi.spyOn(pool, 'execute').mockResolvedValue([] as any)

  await expect((new AppService({} as any) as any).sendNotification(admin, {
    title: 'Release', body: 'The release is ready.', audienceType: 'role', role: 'member',
  })).resolves.toEqual({ created: 2 })

  expect(execute.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO notifications'))).toHaveLength(2)
})

it('rejects non-administrators before querying recipients', async () => {
  const query = vi.spyOn(pool, 'query')

  await expect((new AppService({} as any) as any).sendNotification(member, {
    title: 'Blocked', body: 'Blocked', audienceType: 'role', role: 'member',
  })).rejects.toThrow('Administrator access required')

  expect(query).not.toHaveBeenCalled()
})

it('rejects an empty recipient audience', async () => {
  vi.spyOn(pool, 'query').mockResolvedValueOnce([[]] as any)

  await expect((new AppService({} as any) as any).sendNotification(admin, {
    title: 'Notice', body: 'Body', audienceType: 'role', role: 'auditor',
  })).rejects.toThrow('No active notification recipients')
})
