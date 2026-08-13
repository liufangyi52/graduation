import { afterEach, expect, it, vi } from 'vitest'
import { assertManagedTaskInput } from '../src/server/authorization'
import { AppService } from '../src/server/app.service'
import { pool } from '../src/server/database'

const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }

afterEach(() => vi.restoreAllMocks())

it('rejects a manager task without an assignee', () => {
  expect(() => assertManagedTaskInput({ title: 'Prepare release', assigneeId: '', priority: 'high' })).toThrow('Task assignee is required')
})

it('soft deletes an owned project without a physical delete', async () => {
  vi.spyOn(pool, 'query').mockResolvedValueOnce([[{ owner_id: 'manager-1', deleted_at: null }]] as any)
  const execute = vi.spyOn(pool, 'execute').mockResolvedValue([{ affectedRows: 1 }] as any)

  await expect(new AppService({} as any).softDeleteProject(manager, 'project-1')).resolves.toEqual({ id: 'project-1', deleted: true })

  expect(execute).toHaveBeenCalledWith(expect.stringContaining('SET deleted_at=CURRENT_TIMESTAMP'), ['manager-1', 'project-1'])
  expect(execute.mock.calls.some(([sql]) => String(sql).startsWith('DELETE FROM projects'))).toBe(false)
})

it('updates only supplied project fields for an owning manager', async () => {
  vi.spyOn(pool, 'query').mockResolvedValueOnce([[{ owner_id: 'manager-1', deleted_at: null }]] as any)
  const execute = vi.spyOn(pool, 'execute').mockResolvedValue([{ affectedRows: 1 }] as any)

  await expect(new AppService({} as any).updateProject(manager, 'project-1', { name: 'Renamed', status: 'paused' })).resolves.toEqual({ id: 'project-1', name: 'Renamed', status: 'paused' })

  expect(execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE projects SET name=?,status=?'), ['Renamed', 'paused', 'project-1'])
})
