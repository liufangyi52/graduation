import { beforeEach, expect, it, vi } from 'vitest'
import { AppService } from '../src/server/app.service'
import { pool } from '../src/server/database'

const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }

beforeEach(() => vi.restoreAllMocks())

it('creates an overdue warning only when an identical open risk does not already exist', async () => {
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ id: 'task-1', assignee_id: 'member-1', project_id: 'project-1', due_date: new Date('2020-01-01T00:00:00.000Z'), status: 'in_progress', title: 'Release' }]] as any)
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
    .mockResolvedValueOnce([[]] as any)
    .mockResolvedValueOnce([[]] as any)
  const execute = vi.spyOn(pool, 'execute').mockResolvedValue([] as any)

  await new AppService({} as any).updateTask(manager, 'task-1', { progress: 50 })

  expect(execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO risks'), expect.arrayContaining(['任务逾期：task-1']))
  expect(execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO notifications'), expect.arrayContaining(['member-1', '任务逾期：Release', '/my-tasks']))
})
