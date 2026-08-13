import { afterEach, expect, it, vi } from 'vitest'
import { AppService } from '../src/server/app.service'
import { pool } from '../src/server/database'

const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }
const member = { id: 'member-1', role: 'member' as const, name: 'Member', email: 'member@example.com' }

afterEach(() => vi.restoreAllMocks())

it('aggregates an owned active project with scoped tasks, meetings, risks and members', async () => {
  const query = vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ id: 'project-1', name: 'Alpha', code: 'ALPHA', description: 'Desc', status: 'active', start_date: '2026-08-01', end_date: '2026-08-31', owner_id: 'manager-1', owner_name: 'Manager', progress: 50, task_count: 2, completed_task_count: 1, pending_review_count: 1, open_risk_count: 1 }]] as any)
    .mockResolvedValueOnce([[{ id: 'task-1', title: 'Ship', project_id: 'project-1', project_name: 'Alpha', assignee_id: 'member-1', assignee_name: 'Member', priority: 'high', status: 'todo', progress: 0, due_date: '2026-08-20' }]] as any)
    .mockResolvedValueOnce([[{ id: 'meeting-1', title: 'Kickoff', created_at: '2026-08-01', version_count: 1, latest_analysis_status: 'approved' }]] as any)
    .mockResolvedValueOnce([[{ id: 'risk-1', title: 'Delay', description: 'Schedule risk', level: 'high', status: 'open', created_at: '2026-08-01' }]] as any)
    .mockResolvedValueOnce([[{ id: 'manager-1', name: 'Manager', email: 'manager@example.com', role: 'manager', project_role: 'manager' }, { id: 'member-1', name: 'Member', email: 'member@example.com', role: 'member', project_role: 'member' }]] as any)

  const detail = await new AppService({} as any).projectDetail(manager, 'project-1')

  expect(detail.project).toMatchObject({ id: 'project-1', ownerId: 'manager-1', ownerName: 'Manager' })
  expect(detail.tasks).toHaveLength(1)
  expect(detail.meetings[0]).toMatchObject({ id: 'meeting-1', latestAnalysisStatus: 'approved' })
  expect(detail.risks[0]).toMatchObject({ id: 'risk-1', status: 'open' })
  expect(detail.counts).toMatchObject({ tasks: 2, completedTasks: 1, pendingReviews: 1, openRisks: 1 })
  expect(detail.permissions).toMatchObject({ canEdit: true, canManageMembers: true, canManageRisks: true })
  expect(query).toHaveBeenCalledTimes(5)
})

it('allows a member to view only a joined active project and exposes read-only permissions', async () => {
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ id: 'project-1', name: 'Alpha', code: 'ALPHA', status: 'active', owner_id: 'manager-1', owner_name: 'Manager', progress: 0, task_count: 0, completed_task_count: 0, pending_review_count: 0, open_risk_count: 0 }]] as any)
    .mockResolvedValueOnce([[]] as any)
    .mockResolvedValueOnce([[]] as any)
    .mockResolvedValueOnce([[]] as any)
    .mockResolvedValueOnce([[{ id: 'member-1', name: 'Member', email: 'member@example.com', role: 'member', project_role: 'member' }]] as any)

  const detail = await new AppService({} as any).projectDetail(member, 'project-1')

  expect(detail.project.id).toBe('project-1')
  expect(detail.permissions).toMatchObject({ canEdit: false, canManageMembers: false, canManageRisks: false, canCreateTask: false })
})

it('does not return a soft-deleted project to a manager', async () => {
  vi.spyOn(pool, 'query').mockResolvedValueOnce([[]] as any)
  await expect(new AppService({} as any).projectDetail(manager, 'deleted-project')).rejects.toThrow('Project does not exist')
})
