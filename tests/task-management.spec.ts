import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { AppService } from '../src/server/app.service'
import { pool } from '../src/server/database'

const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }
const member = { id: 'member-1', role: 'member' as const, name: 'Member', email: 'member@example.com' }

afterEach(() => vi.restoreAllMocks())

it('creates a manually assigned task for an active project member', async () => {
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ owner_id: 'manager-1', deleted_at: null }]] as any)
    .mockResolvedValueOnce([[{ id: 'member-1' }]] as any)
  const connection = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn() }
  vi.spyOn(pool, 'getConnection').mockResolvedValue(connection as any)
  vi.spyOn(pool, 'execute').mockResolvedValue([] as any)

  await expect(new AppService({} as any).createTask(manager, { projectId: 'project-1', title: 'Prepare release', assigneeId: 'member-1', priority: 'high', status: 'todo', progress: 0 })).resolves.toMatchObject({ title: 'Prepare release', status: 'todo' })
  expect(connection.execute).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO notifications'), expect.any(Array))
})

it('normalizes a completed task created with progress 100', async () => {
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ owner_id: 'manager-1', deleted_at: null }]] as any)
    .mockResolvedValueOnce([[{ id: 'member-1' }]] as any)
  const connection = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn() }
  vi.spyOn(pool, 'getConnection').mockResolvedValue(connection as any)
  vi.spyOn(pool, 'execute').mockResolvedValue([] as any)

  await expect(new AppService({} as any).createTask(manager, { projectId: 'project-1', title: 'Release', assigneeId: 'member-1', priority: 'high', status: 'todo', progress: 100 }))
    .resolves.toMatchObject({ status: 'completed', progress: 100 })
  expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO tasks'), expect.arrayContaining(['completed', 100]))
})

it('normalizes member updates before persisting progress events', async () => {
  vi.spyOn(pool, 'query').mockResolvedValueOnce([[{ id: 'task-1', title: 'Release', assignee_id: 'member-1', project_id: 'project-1', status: 'todo', progress: 0 }]] as any)
  const connection = {
    beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(),
    query: vi.fn().mockResolvedValueOnce([[{ 1: 1 }]]),
  }
  vi.spyOn(pool, 'getConnection').mockResolvedValue(connection as any)
  vi.spyOn(pool, 'execute').mockResolvedValue([] as any)

  await expect(new AppService({} as any).updateTask(member, 'task-1', { progress: 100 })).resolves.toMatchObject({ status: 'completed', progress: 100 })
  expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE tasks SET status=?, progress=?'), ['completed', 100, 'completed', 'task-1'])
  expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('project_progress_events'), expect.arrayContaining([0, 100, 'todo', 'completed']))
})

it('normalizes member feedback to the same task state pair', async () => {
  const connection = {
    beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(),
    query: vi.fn()
      .mockResolvedValueOnce([[{ id: 'task-1', title: 'Release', assignee_id: 'member-1', project_id: 'project-1', status: 'todo', progress: 0 }]])
      .mockResolvedValueOnce([[{ 1: 1 }]]),
  }
  vi.spyOn(pool, 'getConnection').mockResolvedValue(connection as any)
  vi.spyOn(pool, 'query').mockResolvedValueOnce([[{ id: 'task-1', title: 'Release', assignee_id: 'member-1', project_id: 'project-1', status: 'completed', due_date: null }]] as any)
  vi.spyOn(pool, 'execute').mockResolvedValue([] as any)

  await expect(new AppService({} as any).feedback(member, 'task-1', { content: 'Done', progress: 100 })).resolves.toMatchObject({ progress: 100 })
  expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE tasks SET status=?, progress=?'), ['completed', 100, 'completed', 'task-1'])
  expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('task_feedbacks'), expect.arrayContaining([100]))
})

it('normalizes manager edits when reopening a completed task state', async () => {
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ id: 'task-1', project_id: 'project-1', assignee_id: 'member-1', status: 'completed', progress: 100, title: 'Release', due_date: null }]] as any)
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
  vi.spyOn(pool, 'execute').mockResolvedValue([] as any)

  await expect(new AppService({} as any).updateManagedTask(manager, 'task-1', { status: 'in_progress' })).resolves.toMatchObject({ status: 'in_progress', progress: 99 })
  expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE tasks SET'), expect.arrayContaining(['in_progress', 99]))
})

it('normalizes a closed task when it is reopened', async () => {
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ project_id: 'project-1', status: 'closed', progress: 100 }]] as any)
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
  vi.spyOn(pool, 'execute').mockResolvedValue([] as any)

  await expect(new AppService({} as any).reopenTask(manager, 'task-1', 'todo')).resolves.toEqual({ id: 'task-1', status: 'todo', progress: 0 })
  expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE tasks SET status=?,progress=?'), ['todo', 0, 'task-1'])
})

it.each([
  ['admin', 'admin-1'],
  ['auditor', 'auditor-1'],
] as const)('rejects an active %s account as a task assignee', async (role, assigneeId) => {
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ owner_id: 'manager-1', deleted_at: null }]] as any)
    .mockImplementationOnce(async (sql: unknown) => String(sql).includes('role IN')
      ? [[]] as any
      : [[{ id: assigneeId, role, is_active: 1 }]] as any)
  vi.spyOn(pool, 'getConnection').mockResolvedValue({ beginTransaction: vi.fn(), execute: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() } as any)
  vi.spyOn(pool, 'execute').mockResolvedValue([] as any)

  await expect(new AppService({} as any).createTask(manager, {
    projectId: 'project-1', title: 'Prepare release', assigneeId, priority: 'high', status: 'todo', progress: 0,
  })).rejects.toThrow('Task assignee must be an active project member')
})

it('rejects a member closing a task', async () => {
  await expect(new AppService({} as any).closeTask(member, 'task-1')).rejects.toThrow('Only managers can close tasks')
})

it('lets a project manager remind the assignee without updating task state', async () => {
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ id: 'task-1', title: 'Prepare release', assignee_id: 'member-1', project_id: 'project-1', status: 'todo', progress: 0 }]] as any)
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
  const execute = vi.spyOn(pool, 'execute').mockResolvedValue([] as any)

  await expect(new AppService({} as any).remindTask(manager, 'task-1')).resolves.toMatchObject({ taskId: 'task-1', recipientId: 'member-1' })

  expect(execute).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO notifications'),
    expect.arrayContaining(['member-1', '任务推进提醒：Prepare release', '/my-tasks']),
  )
  expect(execute.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE tasks'))).toBe(false)
})

it('reads persisted completion timestamps in the visible task list', async () => {
  const query = vi.spyOn(pool, 'query').mockResolvedValueOnce([[]] as any)

  await new AppService({} as any).tasks(manager)

  expect(query).toHaveBeenCalledWith(expect.stringContaining('t.created_at,t.completed_at'), ['manager-1'])
  expect(query).not.toHaveBeenCalledWith(expect.stringContaining('audit_logs'), ['manager-1'])
})

it('records and backfills the first completion time with a supporting audit index', () => {
  const serviceSource = readFileSync('src/server/app.service.ts', 'utf8')
  const migrationSource = readFileSync('src/server/migrate.ts', 'utf8')

  expect(serviceSource).toContain("completed_at=CASE WHEN ?='completed' THEN COALESCE(completed_at,CURRENT_TIMESTAMP)")
  expect(serviceSource).toContain('completed_at=CASE WHEN ?="completed" THEN COALESCE(completed_at,CURRENT_TIMESTAMP)')
  expect(migrationSource).toContain("addColumnIfMissing('tasks', 'completed_at', 'completed_at TIMESTAMP NULL')")
  expect(migrationSource).toContain('idx_audit_task_completion')
})
