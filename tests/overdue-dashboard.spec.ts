import { expect, it, vi } from 'vitest'
import { AppService } from '../src/server/app.service'
import { pool } from '../src/server/database'

const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }

it('queries overdue dashboard tasks from active projects only', async () => {
  const query = vi.spyOn(pool, 'query').mockResolvedValueOnce([[]] as any)

  await expect(new AppService({} as any).overdueTasks(manager)).resolves.toEqual([])

  expect(query).toHaveBeenCalledWith(expect.stringContaining('p.deleted_at IS NULL'), ['manager-1'])
  expect(query).toHaveBeenCalledWith(expect.stringContaining("t.status NOT IN ('completed','closed')"), ['manager-1'])
})
