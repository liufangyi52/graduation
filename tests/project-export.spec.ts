import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { afterEach, expect, it, vi } from 'vitest'
import { AppController } from '../src/server/app.controller'
import { AppService } from '../src/server/app.service'
import { pool } from '../src/server/database'

const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }
const admin = { id: 'admin-1', role: 'admin' as const, name: 'Admin', email: 'admin@example.com' }
const member = { id: 'member-1', role: 'member' as const, name: 'Member', email: 'member@example.com' }
const auditor = { id: 'auditor-1', role: 'auditor' as const, name: 'Auditor', email: 'auditor@example.com' }

afterEach(() => vi.restoreAllMocks())

it('exports manager-owned meetings without meeting body and audits the request', async () => {
  const query = vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ owner_id: manager.id }]] as any)
    .mockResolvedValueOnce([[{ id: 'project-1', name: 'Alpha', code: 'ALPHA', description: 'Desc', owner_id: manager.id, owner_name: manager.name, status: 'active', start_date: '2026-08-01', end_date: '2026-08-31' }]] as any)
    .mockResolvedValueOnce([[{ id: 'meeting-1', title: 'Kickoff', created_at: '2026-08-01', latest_analysis_status: 'approved', summary: 'Ship it', decisions: ['Ship'], version_count: 2 }]] as any)
  const execute = vi.spyOn(pool, 'execute').mockResolvedValue([{} as any, [] as any])

  const result = await new AppService({} as any).exportProjectData(manager, 'project-1', 'meetings') as any

  expect(result).toEqual({ project: expect.objectContaining({ id: 'project-1', name: 'Alpha' }), meetings: [{ title: 'Kickoff', createdAt: '2026-08-01', latestAnalysisStatus: 'approved', summary: 'Ship it', decisions: ['Ship'], versionCount: 2 }] })
  expect(result.meetings[0]).not.toHaveProperty('content')
  expect(query).toHaveBeenCalledTimes(3)
  expect(execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_logs'), expect.arrayContaining([manager.id, 'export.requested', 'project', 'project-1', JSON.stringify({ kind: 'meetings', scope: 'project-1' })]))
})

it('allows an admin to export all task fields for a project', async () => {
  vi.spyOn(pool, 'execute').mockResolvedValue([{} as any, [] as any])
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ id: 'project-1', name: 'Alpha', code: 'ALPHA', description: null, owner_id: manager.id, owner_name: manager.name, status: 'active', start_date: null, end_date: null }]] as any)
    .mockResolvedValueOnce([[{ project_id: 'project-1', project_name: 'Alpha', title: 'Ship', description: 'Details', assignee_id: member.id, assignee_name: 'Member', priority: 'high', status: 'todo', progress: 10, created_at: '2026-08-01', due_date: '2026-08-20' }]] as any)

  const result = await new AppService({} as any).exportProjectData(admin, 'project-1', 'tasks') as any

  expect(result.tasks[0]).toEqual({ projectId: 'project-1', projectName: 'Alpha', title: 'Ship', description: 'Details', assigneeId: member.id, assigneeName: 'Member', priority: 'high', status: 'todo', progress: 10, createdAt: '2026-08-01', dueDate: '2026-08-20' })
})

it('rejects member project-level exports', async () => {
  await expect(new AppService({} as any).exportProjectData(member, 'project-1', 'meetings')).rejects.toBeInstanceOf(ForbiddenException)
  await expect(new AppService({} as any).exportProjectData(member, 'project-1', 'summary')).rejects.toBeInstanceOf(ForbiddenException)
})

it('filters member task exports to their own assignee id', async () => {
  vi.spyOn(pool, 'execute').mockResolvedValue([{} as any, [] as any])
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ project_id: 'project-1' }]] as any)
    .mockResolvedValueOnce([[{ id: 'project-1', name: 'Alpha', code: 'ALPHA', owner_id: manager.id, owner_name: manager.name, status: 'active' }]] as any)
    .mockResolvedValueOnce([[{ project_id: 'project-1', project_name: 'Alpha', title: 'Mine', description: null, assignee_id: member.id, assignee_name: 'Member', priority: 'low', status: 'in_progress', progress: 40, created_at: '2026-08-01', due_date: null }]] as any)
  const result = await new AppService({} as any).exportProjectData(member, 'project-1', 'tasks') as any
  expect(result.tasks).toHaveLength(1)
  expect((pool.query as any).mock.calls[2][1]).toEqual(['project-1', member.id])
})

it('rejects auditors from business export', async () => {
  await expect(new AppService({} as any).exportProjectData(auditor, 'project-1', 'tasks')).rejects.toBeInstanceOf(ForbiddenException)
})

it('returns a summary with project facts, analytics metrics and scoped records', async () => {
  vi.spyOn(pool, 'execute').mockResolvedValue([{} as any, [] as any])
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ owner_id: manager.id }]] as any)
    .mockResolvedValueOnce([[{ id: 'project-1', name: 'Alpha', code: 'ALPHA', description: 'Desc', owner_id: manager.id, owner_name: manager.name, status: 'active', start_date: '2026-08-01', end_date: '2026-08-31' }]] as any)
    .mockResolvedValueOnce([[{ project_id: 'project-1', project_name: 'Alpha', id: 'task-1', title: 'Ship', description: null, assignee_id: member.id, assignee_name: 'Member', priority: 'high', status: 'completed', progress: 100, created_at: '2026-08-01', due_date: null }]] as any)
    .mockResolvedValueOnce([[{ id: 'meeting-1', title: 'Kickoff', created_at: '2026-08-01', latest_analysis_status: 'approved', summary: 'Ship it', decisions: ['Ship'], version_count: 1 }]] as any)
    .mockResolvedValueOnce([[{ id: 'risk-1', title: 'Delay', description: 'Schedule', level: 'high', status: 'open', created_at: '2026-08-01' }]] as any)
  const result = await new AppService({} as any).exportProjectData(manager, 'project-1', 'summary')
  expect(result).toEqual(expect.objectContaining({ project: expect.any(Object), metrics: expect.objectContaining({ totalTasks: 1, completedTasks: 1, openRisks: 1 }), tasks: expect.any(Array), meetings: expect.any(Array), risks: expect.any(Array) }))
})

it('validates export kind in the controller', async () => {
  const app = { databaseUser: vi.fn(), exportProjectData: vi.fn() } as any
  const controller = new AppController(app)
  await expect(controller.projectExport('token', 'project-1', 'invalid')).rejects.toBeInstanceOf(BadRequestException)
  expect(app.exportProjectData).not.toHaveBeenCalled()
})
