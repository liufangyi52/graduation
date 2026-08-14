import { afterEach, expect, it, vi } from 'vitest'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../src/server/app.module'
import { AppService } from '../src/server/app.service'
import { pool } from '../src/server/database'

const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }
const otherManager = { ...manager, id: 'manager-2' }
const member = { id: 'member-1', role: 'member' as const, name: 'Member', email: 'member@example.com' }

afterEach(() => vi.restoreAllMocks())

it('injects the RAG index service into the server application context', async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false })
  try {
    expect((app.get(AppService) as any).ragIndex).toBeDefined()
  } finally {
    await app.close()
  }
})

it('synchronizes only current desensitized versions for the project manager', async () => {
  const rag = { isConfigured: vi.fn().mockReturnValue(true), syncVersion: vi.fn().mockResolvedValueOnce({ indexedChunks: 2 }).mockResolvedValueOnce({ indexedChunks: 3 }) }
  const cache = { invalidateBusinessReads: vi.fn() }
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
    .mockResolvedValueOnce([[
      { project_id: 'project-1', meeting_id: 'meeting-1', version_id: 'version-1', original_content: '13800138000', desensitized_content: '[PHONE] release' },
      { project_id: 'project-1', meeting_id: 'meeting-2', version_id: 'version-2', original_content: 'private original', desensitized_content: '[EMAIL] follow-up' },
    ]] as any)
  const execute = vi.spyOn(pool, 'execute').mockResolvedValue([] as any)
  const service = new AppService({} as any, cache as any, undefined, rag as any)

  await expect(service.syncProjectRagIndex(manager, 'project-1')).resolves.toEqual({ indexedChunks: 5 })

  expect(rag.syncVersion.mock.calls).toEqual([
    [{ projectId: 'project-1', meetingId: 'meeting-1', versionId: 'version-1', desensitizedContent: '[PHONE] release' }],
    [{ projectId: 'project-1', meetingId: 'meeting-2', versionId: 'version-2', desensitizedContent: '[EMAIL] follow-up' }],
  ])
  expect(cache.invalidateBusinessReads).toHaveBeenCalledOnce()
  const auditCall = execute.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO audit_logs'))
  expect(auditCall?.[1]).toEqual(expect.arrayContaining(['manager-1', 'project.rag_index_synced', 'project', 'project-1', JSON.stringify({ indexedChunks: 5 })]))
  expect(JSON.stringify(auditCall)).not.toContain('13800138000')
  expect(JSON.stringify(auditCall)).not.toContain('[PHONE] release')
})

it('rejects another manager and members before reading meeting versions', async () => {
  const query = vi.spyOn(pool, 'query').mockResolvedValue([[{ owner_id: 'manager-1' }]] as any)
  const rag = { syncVersion: vi.fn() }
  const service = new AppService({} as any, {} as any, undefined, rag as any)

  await expect(service.syncProjectRagIndex(otherManager, 'project-1')).rejects.toThrow('You do not manage this project')
  await expect(service.syncProjectRagIndex(member, 'project-1')).rejects.toThrow('Only managers can perform this action')
  expect(query).toHaveBeenCalledTimes(1)
  expect(rag.syncVersion).not.toHaveBeenCalled()
})

it('reports safe configured, readiness, and eligible-version status to the project manager', async () => {
  const rag = { isConfigured: vi.fn().mockReturnValue(true), health: vi.fn().mockResolvedValue(true) }
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
    .mockResolvedValueOnce([[{ eligible_version_count: 0 }]] as any)
  const service = new AppService({} as any, {} as any, undefined, rag as any)

  await expect(service.ragIndexStatus(manager, 'project-1')).resolves.toEqual({ configured: true, ready: true, eligibleVersionCount: 0 })
})

it('blocks RAG synchronization when dependencies are not configured', async () => {
  const rag = { isConfigured: vi.fn().mockReturnValue(false), syncVersion: vi.fn() }
  vi.spyOn(pool, 'query').mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
  const service = new AppService({} as any, {} as any, undefined, rag as any)

  await expect(service.syncProjectRagIndex(manager, 'project-1')).rejects.toThrow('RAG index is not configured')
  expect(rag.syncVersion).not.toHaveBeenCalled()
})
