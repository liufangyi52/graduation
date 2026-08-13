import { afterEach, expect, it, vi } from 'vitest'
import { AppService } from '../src/server/app.service'
import { pool } from '../src/server/database'

const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }
const member = { id: 'member-1', role: 'member' as const, name: 'Member', email: 'member@example.com' }

afterEach(() => vi.restoreAllMocks())

it('creates a manually assigned task for an active project member', async () => {
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ owner_id: 'manager-1', deleted_at: null }]] as any)
    .mockResolvedValueOnce([[{ id: 'member-1' }]] as any)
  const connection = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn() }
  vi.spyOn(pool, 'getConnection').mockResolvedValue(connection as any)
  vi.spyOn(pool, 'execute').mockResolvedValue([] as any)

  await expect(new AppService({} as any).createTask(manager, { projectId: 'project-1', title: 'Prepare release', assigneeId: 'member-1', priority: 'high', status: 'todo', progress: 0 })).resolves.toMatchObject({ title: 'Prepare release', status: 'todo' })
  expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO notifications'), expect.arrayContaining(['member-1', '已分配任务：Prepare release']))
})

it('rejects a member closing a task', async () => {
  await expect(new AppService({} as any).closeTask(member, 'task-1')).rejects.toThrow('Only managers can close tasks')
})
