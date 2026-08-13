import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppService } from '../src/server/app.service'
import { pool } from '../src/server/database'

const admin = { id: 'admin-1', role: 'admin' as const, name: 'Admin', email: 'admin@example.com' }
const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }

describe('administrator system settings', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('denies project managers access to system settings', async () => {
    const service = new AppService({} as any)

    await expect(service.getSystemSettings(manager)).rejects.toThrow('Administrator access required')
    await expect(service.updateSystemSettings(manager, { model: 'Qwen 2.5', mode: 'RAG', desensitize: false })).rejects.toThrow('Administrator access required')
  })

  it('persists administrator settings and records an audit event', async () => {
    vi.spyOn(pool, 'execute').mockResolvedValue([] as any)
    const service = new AppService({} as any)

    await expect(service.updateSystemSettings(admin, { model: 'Qwen 2.5', mode: 'RAG', desensitize: false }))
      .resolves.toEqual({ model: 'Qwen 2.5', mode: 'RAG', desensitize: false })

    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE system_settings'),
      ['Qwen 2.5', 'RAG', false],
    )
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_logs'),
      expect.arrayContaining(['admin-1', 'system_settings.updated', 'system_settings', 'default']),
    )
  })

  it('returns stored settings to an administrator', async () => {
    vi.spyOn(pool, 'query').mockResolvedValueOnce([[{ model: 'GPT-4o', mode: 'Single model', desensitize: 1 }]] as any)
    const service = new AppService({} as any)

    await expect(service.getSystemSettings(admin)).resolves.toEqual({ model: 'GPT-4o', mode: 'Single model', desensitize: true })
  })
})
