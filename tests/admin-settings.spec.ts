import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { AppService } from '../src/server/app.service'
import { pool } from '../src/server/database'

const admin = { id: 'admin-1', role: 'admin' as const, name: 'Admin', email: 'admin@example.com' }
const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }
const appSource = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
const authSource = readFileSync(new URL('../src/services/authService.ts', import.meta.url), 'utf8')

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

  it('creates one routed demo notification for each active role without duplicates', async () => {
    vi.spyOn(pool, 'query')
      .mockResolvedValueOnce([[
        { id: 'manager-1', role: 'manager' },
        { id: 'member-1', role: 'member' },
        { id: 'admin-1', role: 'admin' },
        { id: 'auditor-1', role: 'auditor' },
      ]] as any)
      .mockResolvedValue([[]] as any)
    const execute = vi.spyOn(pool, 'execute').mockResolvedValue([] as any)
    const service = new AppService({} as any)

    await expect(service.createRoleDemoNotifications(admin)).resolves.toEqual({ created: 4, missingRoles: [] })
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO notifications'),
      expect.arrayContaining(['manager-1', 'AI 分析待审核', '请进入 AI 审核队列处理待审核分析。', '/reviews']),
    )
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO notifications'),
      expect.arrayContaining(['member-1', '任务临近截止', '请进入我的任务处理临近截止的任务。', '/my-tasks']),
    )
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO notifications'),
      expect.arrayContaining(['admin-1', '账号管理待处理', '请进入账号管理查看待处理账号事项。', '/users']),
    )
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO notifications'),
      expect.arrayContaining(['auditor-1', '发现待核查审计记录', '请进入审计日志核查最新记录。', '/audit-logs']),
    )
  })

  it('does not recreate existing role demo notifications', async () => {
    vi.spyOn(pool, 'query')
      .mockResolvedValueOnce([[
        { id: 'manager-1', role: 'manager' },
        { id: 'member-1', role: 'member' },
        { id: 'admin-1', role: 'admin' },
        { id: 'auditor-1', role: 'auditor' },
      ]] as any)
      .mockResolvedValue([[{ id: 'existing-demo-notification' }]] as any)
    const execute = vi.spyOn(pool, 'execute').mockResolvedValue([] as any)
    const service = new AppService({} as any)

    await expect(service.createRoleDemoNotifications(admin)).resolves.toEqual({ created: 0, missingRoles: [] })
    expect(execute.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO notifications'))).toHaveLength(0)
  })

  it('denies non-administrators from generating role demo notifications', async () => {
    const query = vi.spyOn(pool, 'query')
    const service = new AppService({} as any)

    await expect(service.createRoleDemoNotifications(manager)).rejects.toThrow('Administrator access required')
    expect(query).not.toHaveBeenCalled()
  })

  it('exposes the administrator-only demo notification action in system settings', () => {
    expect(authSource).toContain("'/notifications/demo'")
    expect(appSource).toContain('生成角色演示通知')
    expect(appSource).toContain('createRoleDemoNotifications')
    expect(appSource).toContain('demo-notification-setting')
    expect(appSource).toContain('const result = await auth.createRoleDemoNotifications(props.token)\n    await service.load()')
  })

  it('does not render a redundant settings sub-navigation panel', () => {
    expect(appSource).not.toContain('settings-nav panel')
  })

  it('renders an operational overview on the administrator dashboard', () => {
    expect(appSource).toContain('admin-dashboard')
    expect(appSource).toContain('账号总数')
    expect(appSource).toContain('启用账号')
    expect(appSource).toContain('最近审计记录')
  })
})
