import { beforeEach, expect, it, vi } from 'vitest'
import { AppService } from '../src/server/app.service'
import { pool } from '../src/server/database'

const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }

beforeEach(() => vi.restoreAllMocks())

it('restores a historical meeting version by inserting a new current version', async () => {
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn()
      .mockResolvedValueOnce([[{ id: 'version-1', meeting_id: 'meeting-1', version_number: 1, source_type: 'text', original_content: 'old', desensitized_content: 'old' }]])
      .mockResolvedValueOnce([[{ next_version: 2 }]]),
    execute: vi.fn(),
  }
  vi.spyOn(pool, 'getConnection').mockResolvedValue(connection as any)
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ project_id: 'project-1' }]] as any)
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
    .mockResolvedValueOnce([[{ desensitize: true }]] as any)
    .mockResolvedValueOnce([[]] as any)
  vi.spyOn(pool, 'execute').mockResolvedValue([] as any)
  const service = new AppService({} as any)

  await expect(service.restoreMeetingVersion(manager, 'meeting-1', 'version-1')).resolves.toMatchObject({ meetingId: 'meeting-1', versionNumber: 2 })
  expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO meeting_versions'), expect.arrayContaining(['meeting-1', 2]))
  expect(connection.execute.mock.calls.some(([sql]) => String(sql).includes('UPDATE meeting_versions SET'))).toBe(false)
})
