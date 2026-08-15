import { afterEach, expect, it, vi } from 'vitest'
import { AppService } from '../src/server/app.service'
import { pool } from '../src/server/database'

const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }
const member = { id: 'member-1', role: 'member' as const, name: 'Member', email: 'member@example.com' }

afterEach(() => vi.restoreAllMocks())

it('uses role and user scoped keys for authorized project list reads', async () => {
  const cache = {
    key: vi.fn((scope: string, user: { role: string; id: string }) => `meetingflow:v1:${scope}:${user.role}:${user.id}`),
    getOrLoad: vi.fn(async (_key: string, loader: () => Promise<unknown>) => loader()),
  }
  vi.spyOn(pool, 'query').mockResolvedValue([[]] as any)
  const service = new AppService({} as any, cache as any)

  await service.projects(manager)
  await service.projects(member)

  expect(cache.getOrLoad).toHaveBeenCalledTimes(2)
  expect(cache.key).toHaveBeenCalledWith('projects', manager)
  expect(cache.key).toHaveBeenCalledWith('projects', member)
})

it('invalidates business read caches after a task update', async () => {
  const cache = { invalidateBusinessReads: vi.fn().mockResolvedValue(undefined) }
  const connection = { beginTransaction: vi.fn(), execute: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() }
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ id: 'task-1', title: 'Ship', assignee_id: 'manager-1', project_id: 'project-1', due_date: null, status: 'in_progress' }]] as any)
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
  vi.spyOn(pool, 'execute').mockResolvedValue([{}] as any)
  vi.spyOn(pool, 'getConnection').mockResolvedValue(connection as any)
  const service = new AppService({} as any, cache as any)

  await service.updateTask(manager, 'task-1', { progress: 100 })

  expect(cache.invalidateBusinessReads).toHaveBeenCalledTimes(1)
})
