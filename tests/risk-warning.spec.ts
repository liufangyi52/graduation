import { beforeEach, expect, it, vi } from 'vitest'
import { AppService } from '../src/server/app.service'
import { pool } from '../src/server/database'
import { readFileSync } from 'node:fs'

const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }

beforeEach(() => vi.restoreAllMocks())

it('creates an overdue warning only when an identical open risk does not already exist', async () => {
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ id: 'task-1', assignee_id: 'member-1', project_id: 'project-1', due_date: new Date('2020-01-01T00:00:00.000Z'), status: 'in_progress', title: 'Release' }]] as any)
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
    .mockResolvedValueOnce([[]] as any)
    .mockResolvedValueOnce([[]] as any)
  const connection = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn() }
  vi.spyOn(pool, 'getConnection').mockResolvedValue(connection as any)
  const execute = vi.spyOn(pool, 'execute').mockResolvedValue([] as any)

  await new AppService({} as any).updateTask(manager, 'task-1', { progress: 50 })

  expect(execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO risks'), expect.arrayContaining(['任务逾期：Release']))
  expect(execute).toHaveBeenCalledWith(expect.stringContaining('task_id'), expect.arrayContaining(['task-1']))
  expect(execute).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO notifications'), expect.any(Array))
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
