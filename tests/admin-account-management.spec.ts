import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppService } from '../src/server/app.service'
import { pool } from '../src/server/database'

const admin = { id: 'admin-1', role: 'admin' as const, name: 'Admin', email: 'admin@example.com' }
const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }

describe('administrator account governance', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('rejects project managers from changing managed accounts', async () => {
    const service = new AppService({} as any)

    await expect(service.createManagedUser(manager, { role: 'member', name: 'Member', email: 'member@example.com', password: 'password-1' }))
      .rejects.toThrow('Administrator access required')
    await expect(service.updateManagedUser(manager, 'member-1', { isActive: false })).rejects.toThrow('Administrator access required')
    await expect(service.resetManagedPassword(manager, 'member-1', 'password-2')).rejects.toThrow('Administrator access required')
  })

  it('allows an administrator to create an account and records the action', async () => {
    vi.spyOn(pool, 'query').mockResolvedValueOnce([[]] as any)
    const execute = vi.spyOn(pool, 'execute').mockResolvedValue([] as any)
    const service = new AppService({} as any)

    await expect(service.createManagedUser(admin, { role: 'member', name: 'Member', email: 'member@example.com', password: 'password-1' }))
      .resolves.toMatchObject({ role: 'member', name: 'Member', email: 'member@example.com', is_active: true })

    expect(execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_logs'), expect.arrayContaining(['admin-1', 'user.created', 'user']))
  })

  it('allows an administrator to disable an account and reset its password with audit records', async () => {
    const execute = vi.spyOn(pool, 'execute').mockResolvedValue([] as any)
    const service = new AppService({} as any)

    await expect(service.updateManagedUser(admin, 'member-1', { isActive: false })).resolves.toEqual({ id: 'member-1', isActive: false })
    await expect(service.resetManagedPassword(admin, 'member-1', 'password-2')).resolves.toEqual({ id: 'member-1', reset: true })

    expect(execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_logs'), expect.arrayContaining(['admin-1', 'user.updated', 'user', 'member-1']))
    expect(execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_logs'), expect.arrayContaining(['admin-1', 'user.password_reset', 'user', 'member-1']))
  })
})
