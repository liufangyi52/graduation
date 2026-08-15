import { beforeEach, expect, it, vi } from 'vitest'
import { AppService } from '../src/server/app.service'
import { pool } from '../src/server/database'
import { readFileSync } from 'node:fs'

const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }

beforeEach(() => vi.restoreAllMocks())

it('creates task-specific overdue warnings and delivers one unread notification to each active recipient', async () => {
  const connection = {
    beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(),
    query: vi.fn().mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ id: 'member-1' }, { id: 'manager-1' }]]),
  }
  vi.spyOn(pool, 'getConnection').mockResolvedValue(connection as any)

  await (new AppService({} as any) as any).ensureTaskDeadlineWarnings({ id: 'task-1', assignee_id: 'member-1', project_id: 'project-1', owner_id: 'manager-1', due_date: '2020-01-01', status: 'in_progress', title: 'Release' })

  expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO risks'), expect.arrayContaining(['task-1', expect.stringContaining('Release')]))
  expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO notifications'), expect.arrayContaining(['member-1', expect.stringContaining('deadline:task-1:overdue:member-1')]))
  expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO notifications'), expect.arrayContaining(['manager-1', expect.stringContaining('deadline:task-1:overdue:manager-1')]))
  expect(connection.commit).toHaveBeenCalledOnce()
})

it('keeps same-title risks independent per task and collapses a shared recipient', async () => {
  const first = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(), query: vi.fn().mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ id: 'member-1' }]]) }
  const second = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(), query: vi.fn().mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ id: 'member-1' }]]) }
  vi.spyOn(pool, 'getConnection').mockResolvedValueOnce(first as any).mockResolvedValueOnce(second as any)
  const service = new AppService({} as any) as any

  await service.ensureTaskDeadlineWarnings({ id: 'task-1', assignee_id: 'member-1', project_id: 'project-1', owner_id: 'member-1', due_date: '2020-01-01', status: 'todo', title: 'Release' })
  await service.ensureTaskDeadlineWarnings({ id: 'task-2', assignee_id: 'member-1', project_id: 'project-1', owner_id: 'member-1', due_date: '2020-01-01', status: 'todo', title: 'Release' })

  expect(first.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO risks'), expect.arrayContaining(['task-1']))
  expect(second.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO risks'), expect.arrayContaining(['task-2']))
  expect(first.execute.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO notifications'))).toHaveLength(1)
  expect(second.execute.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO notifications'))).toHaveLength(1)
})

it('does not warn for completed tasks and clears a notification dedupe key when read', async () => {
  const getConnection = vi.spyOn(pool, 'getConnection')
  const execute = vi.spyOn(pool, 'execute').mockResolvedValue([{ affectedRows: 1 }] as any)
  const service = new AppService({} as any)

  await (service as any).ensureTaskDeadlineWarnings({ id: 'task-1', assignee_id: 'member-1', project_id: 'project-1', owner_id: 'manager-1', due_date: '2020-01-01', status: 'completed', title: 'Release' })
  await expect(service.markNotificationRead({ id: 'member-1', role: 'member', name: 'Member', email: 'member@example.com' }, 'notification-1')).resolves.toEqual({ id: 'notification-1', is_read: true })

  expect(getConnection).not.toHaveBeenCalled()
  expect(execute).toHaveBeenCalledWith('UPDATE notifications SET is_read=TRUE,dedupe_key=NULL WHERE id=? AND user_id=?', ['notification-1', 'member-1'])
})

it('migrates a unique notification dedupe key', () => {
  const source = readFileSync(new URL('../src/server/migrate.ts', import.meta.url), 'utf8')
  expect(source).toContain("addColumnIfMissing('notifications', 'dedupe_key', 'dedupe_key VARCHAR(255) NULL')")
  expect(source).toContain('CREATE UNIQUE INDEX uq_notifications_dedupe_key ON notifications (dedupe_key)')
  expect(source).toContain("if (error.code !== 'ER_DUP_KEYNAME') throw error")
})

it.skip('creates an overdue warning only when an identical open risk does not already exist', async () => {
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ id: 'task-1', assignee_id: 'member-1', project_id: 'project-1', due_date: new Date('2020-01-01T00:00:00.000Z'), status: 'in_progress', title: 'Release' }]] as any)
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
    .mockResolvedValueOnce([[]] as any)
    .mockResolvedValueOnce([[]] as any)
  const connection = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: (...args: any[]) => execute(...args), query: vi.fn().mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ owner_id: 'manager-1' }]]).mockResolvedValueOnce([[{ id: 'member-1' }, { id: 'manager-1' }]]) }
  vi.spyOn(pool, 'getConnection').mockResolvedValue(connection as any)
  const execute = vi.spyOn(pool, 'execute').mockResolvedValue([] as any)

  await new AppService({} as any).updateTask(manager, 'task-1', { progress: 50 })

  expect(execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO risks'), expect.arrayContaining(['任务逾期：Release']))
  expect(execute).toHaveBeenCalledWith(expect.stringContaining('task_id'), expect.arrayContaining(['task-1']))
  expect(execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO notifications'), expect.arrayContaining(['member-1']))
})

it('includes the owning project manager when listing risks', async () => {
  const query = vi.spyOn(pool, 'query').mockResolvedValue([[]] as any)

  await new AppService({} as any).risks({ id: 'admin-1', role: 'admin', name: 'Admin', email: 'admin@example.com' })

  expect(query).toHaveBeenCalledWith(expect.stringContaining('u.name project_owner_name'))
  expect(query).toHaveBeenCalledWith(expect.stringContaining('t.title task_title'))
  expect(query).toHaveBeenCalledWith(expect.stringContaining('JOIN users u ON u.id=p.owner_id'))
})

it('limits member risks to those linked to the member task', async () => {
  const query = vi.spyOn(pool, 'query').mockResolvedValue([[{ id: 'member-risk', task_id: 'member-task' }]] as any)

  const risks = await new AppService({} as any).risks({ id: 'member-1', role: 'member', name: 'Member', email: 'member@example.com' })

  expect(risks).toEqual([{ id: 'member-risk', task_id: 'member-task' }])
  expect(query).toHaveBeenCalledWith(expect.stringContaining('JOIN tasks t ON t.id=r.task_id'), ['member-1'])
  expect(query).toHaveBeenCalledWith(expect.stringContaining('t.assignee_id=?'), ['member-1'])
  expect(query).toHaveBeenCalledWith(expect.stringContaining('t.title task_title'), ['member-1'])
})

it('labels the risk-list owner column as the project owner', () => {
  const source = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')

  expect(source).toContain('<th>项目负责人</th>')
  expect(source).toContain("{{ risk.owner || '未设置' }}")
})

it('does not expose internal risk identifiers in the risk list', () => {
  const source = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')

  expect(source).not.toContain('<small class="mono">{{ risk.id }}</small>')
})

it('renders a project-level fallback when a risk has no linked task title', () => {
  const source = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
  expect(source).toContain("risk.task || '项目级风险'")
})
