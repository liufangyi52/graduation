import { beforeEach, expect, it, vi } from 'vitest'
import { AppService } from '../src/server/app.service'
import { pool } from '../src/server/database'

const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }
const member = { id: 'member-1', role: 'member' as const, name: 'Member', email: 'member@example.com' }

beforeEach(() => vi.restoreAllMocks())

it('refuses removal of the project owner but permits removal of an ordinary member', async () => {
  const service = new AppService({} as any)
  const execute = vi.spyOn(pool, 'execute').mockResolvedValue([{ affectedRows: 1 }] as any)
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)

  await expect(service.removeProjectMember(manager, 'project-1', 'manager-1')).rejects.toThrow('Project owner cannot be removed')
  await expect(service.removeProjectMember(manager, 'project-1', 'member-1')).resolves.toEqual({ projectId: 'project-1', userId: 'member-1', removed: true })
  expect(execute).toHaveBeenCalledWith('DELETE FROM project_members WHERE project_id=? AND user_id=?', ['project-1', 'member-1'])
})

it.each([
  ['admin', 'admin-1'],
  ['auditor', 'auditor-1'],
] as const)('rejects an active %s account as a project member', async (role, userId) => {
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
    .mockResolvedValueOnce([[{ id: userId, role, is_active: 1 }]] as any)
  vi.spyOn(pool, 'execute').mockResolvedValue([] as any)

  await expect(new AppService({} as any).addProjectMember(manager, 'project-1', userId, 'member'))
    .rejects.toThrow('Project member must be an active manager or member')
})

it('revokes a removed member from direct task mutation even when the historical assignee remains', async () => {
  vi.spyOn(pool, 'query').mockResolvedValueOnce([[
    { id: 'task-1', title: 'Ship release', project_id: 'project-1', assignee_id: 'member-1', status: 'todo', progress: 0, due_date: null },
  ]] as any)
  const connection = {
    beginTransaction: vi.fn(),
    query: vi.fn().mockResolvedValueOnce([[]]),
    execute: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
  }
  vi.spyOn(pool, 'getConnection').mockResolvedValue(connection as any)
  vi.spyOn(pool, 'execute').mockResolvedValue([] as any)

  await expect(new AppService({} as any).updateTask(member, 'task-1', { progress: 20 }))
    .rejects.toThrow('You cannot access this task')
  expect(connection.execute).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE tasks'), expect.anything())
})

it('revokes only the removed member sockets from the project room', async () => {
  const progressEvents = { revokeMember: vi.fn().mockResolvedValue(undefined) }
  const service = new AppService({} as any, undefined, undefined, undefined, progressEvents as any)
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
  vi.spyOn(pool, 'execute').mockResolvedValue([{ affectedRows: 1 }] as any)

  await service.removeProjectMember(manager, 'project-1', 'member-1')

  expect(progressEvents.revokeMember).toHaveBeenCalledWith('project-1', 'member-1')
})

it('adds only active accounts to a project and records membership audit metadata', async () => {
  const service = new AppService({} as any)
  const execute = vi.spyOn(pool, 'execute').mockResolvedValue([] as any)
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
    .mockResolvedValueOnce([[{ id: 'member-1', is_active: 1, role: 'member' }]] as any)

  await expect(service.addProjectMember(manager, 'project-1', 'member-1', 'member')).resolves.toEqual({ projectId: 'project-1', userId: 'member-1', projectRole: 'member' })
  expect(execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO project_members'), ['project-1', 'member-1', 'member'])
})

it('returns active manager and member accounts as project member candidates', async () => {
  vi.spyOn(pool, 'query').mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any).mockResolvedValueOnce([[{ id: 'member-1', name: 'Member', email: 'member@example.com', role: 'member' }]] as any)

  await expect(new AppService({} as any).projectMemberCandidates(manager, 'project-1')).resolves.toEqual([
    { id: 'member-1', name: 'Member', email: 'member@example.com', role: 'member' },
  ])
})
