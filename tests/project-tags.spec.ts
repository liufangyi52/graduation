import { afterEach, expect, it, vi } from 'vitest'
import { AppService } from '../src/server/app.service'
import { pool } from '../src/server/database'

const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }

afterEach(() => vi.restoreAllMocks())

it('adds a tag only to an active owned project', async () => {
  vi.spyOn(pool, 'query').mockResolvedValueOnce([[{ owner_id: 'manager-1', deleted_at: null }]] as any)
  const execute = vi.spyOn(pool, 'execute').mockResolvedValue([] as any)

  await expect(new AppService({} as any).createProjectTag(manager, 'project-1', { name: 'Release' })).resolves.toMatchObject({ projectId: 'project-1', name: 'Release' })

  expect(execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO project_tags'), expect.arrayContaining(['project-1', 'Release']))
})
