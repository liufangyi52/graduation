import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppService } from '../src/server/app.service'
import { pool } from '../src/server/database'

const admin = { id: 'admin-1', role: 'admin' as const, name: 'Admin', email: 'admin@example.com' }
const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }

describe('project business role separation', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('rejects an administrator from creating a project before inserting data', async () => {
    const execute = vi.spyOn(pool, 'execute').mockResolvedValue([] as any)
    const service = new AppService({} as any)

    await expect(service.createProject(admin, { name: 'Alpha', code: 'ALPHA' })).rejects.toThrow('Only managers can perform this action')
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects an administrator from updating a project task before mutation', async () => {
    vi.spyOn(pool, 'query').mockResolvedValueOnce([[{ assignee_id: 'member-1', project_id: 'project-1' }]] as any)
    const execute = vi.spyOn(pool, 'execute').mockResolvedValue([] as any)
    const service = new AppService({} as any)

    await expect(service.updateTask(admin, 'task-1', { progress: 50 })).rejects.toThrow('You cannot update this task')
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects an administrator from creating or analyzing meeting minutes', async () => {
    const execute = vi.spyOn(pool, 'execute').mockResolvedValue([] as any)
    const service = new AppService({ analyze: vi.fn() } as any)

    await expect(service.createMeeting(admin, { projectId: 'project-1', title: 'Review', content: 'Minutes' })).rejects.toThrow('Only managers can perform this action')
    vi.spyOn(pool, 'query').mockResolvedValueOnce([[{ id: 'meeting-1', title: 'Review', content: 'Minutes', project_id: 'project-1' }]] as any)
    await expect(service.analyzeMeeting(admin, 'meeting-1')).rejects.toThrow('Only managers can perform this action')
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects an administrator from reviewing analysis, resolving risk, or archiving a project', async () => {
    const execute = vi.spyOn(pool, 'execute').mockResolvedValue([] as any)
    const service = new AppService({} as any)

    vi.spyOn(pool, 'query').mockResolvedValueOnce([[{
      id: 'analysis-1',
      project_id: 'project-1',
      status: 'pending',
      result_json: JSON.stringify({ summary: 'Review result', decisions: [], tasks: [], risks: [] }),
    }]] as any)
    await expect(service.reviewAnalysis(admin, 'analysis-1', true)).rejects.toThrow('Only managers can perform this action')
    vi.spyOn(pool, 'query').mockResolvedValueOnce([[{ project_id: 'project-1' }]] as any)
    await expect(service.resolveRisk(admin, 'risk-1')).rejects.toThrow('Only managers can perform this action')
    await expect(service.archiveProject(admin, 'project-1')).rejects.toThrow('Only managers can perform this action')
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects a manager who does not own the affected project', async () => {
    vi.spyOn(pool, 'query')
      .mockResolvedValueOnce([[{ assignee_id: 'member-1', project_id: 'project-1' }]] as any)
      .mockResolvedValueOnce([[{ owner_id: 'manager-2' }]] as any)
    const execute = vi.spyOn(pool, 'execute').mockResolvedValue([] as any)
    const service = new AppService({} as any)

    await expect(service.updateTask(manager, 'task-1', { progress: 50 })).rejects.toThrow('You do not manage this project')
    expect(execute).not.toHaveBeenCalled()
  })

  it('allows the owning manager to update a task and records an audit entry', async () => {
    vi.spyOn(pool, 'query')
      .mockResolvedValueOnce([[{ assignee_id: 'member-1', project_id: 'project-1' }]] as any)
      .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
    const execute = vi.spyOn(pool, 'execute').mockResolvedValue([] as any)
    const service = new AppService({} as any)

    await expect(service.updateTask(manager, 'task-1', { progress: 50 })).resolves.toEqual({ id: 'task-1', status: undefined, progress: 50 })
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_logs'),
      expect.arrayContaining(['manager-1', 'task.updated', 'task', 'task-1']),
    )
  })

  it('records project creation in the audit trail', async () => {
    const execute = vi.spyOn(pool, 'execute').mockResolvedValue([] as any)
    const service = new AppService({} as any)

    await expect(service.createProject(manager, { name: 'Alpha', code: 'ALPHA' })).resolves.toMatchObject({ ownerId: 'manager-1', status: 'active' })
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_logs'),
      expect.arrayContaining(['manager-1', 'project.created', 'project']),
    )
  })

  it('rejects administrator feedback and audits manager feedback without recording its content', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      query: vi.fn().mockResolvedValue([[{ assignee_id: 'member-1', project_id: 'project-1' }]]),
      execute: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
    }
    vi.spyOn(pool, 'getConnection').mockResolvedValue(connection as any)
    const auditExecute = vi.spyOn(pool, 'execute').mockResolvedValue([] as any)
    const service = new AppService({} as any)

    await expect(service.feedback(admin, 'task-1', { content: 'Do not write', progress: 50 })).rejects.toThrow('You cannot update this task')
    expect(connection.execute).not.toHaveBeenCalled()

    connection.query.mockResolvedValueOnce([[{ assignee_id: 'member-1', project_id: 'project-1' }]])
    connection.query.mockResolvedValueOnce([[{ owner_id: 'manager-1' }]])
    await expect(service.feedback(manager, 'task-1', { content: 'Sensitive feedback', progress: 50 })).resolves.toMatchObject({ taskId: 'task-1', authorId: 'manager-1' })
    expect(auditExecute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_logs'),
      expect.arrayContaining(['manager-1', 'task.feedback_created', 'task_feedback']),
    )
    expect(JSON.stringify(auditExecute.mock.calls.at(-1)?.[1])).not.toContain('Sensitive feedback')
  })
})
