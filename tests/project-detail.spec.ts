import { afterEach, expect, it, vi } from 'vitest'
import { AppService } from '../src/server/app.service'
import { pool } from '../src/server/database'
import { createWorkspaceService } from '../src/services/workspaceService'

const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }
const member = { id: 'member-1', role: 'member' as const, name: 'Member', email: 'member@example.com' }

afterEach(() => vi.restoreAllMocks())

it('aggregates an owned active project with scoped tasks, meetings, risks and members', async () => {
  const query = vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ id: 'project-1', name: 'Alpha', code: 'ALPHA', description: 'Desc', status: 'active', start_date: '2026-08-01', end_date: '2026-08-31', owner_id: 'manager-1', owner_name: 'Manager', progress: 50, task_count: 2, completed_task_count: 1, pending_review_count: 1, open_risk_count: 1 }]] as any)
    .mockResolvedValueOnce([[{ id: 'task-1', title: 'Ship', project_id: 'project-1', project_name: 'Alpha', assignee_id: 'member-1', assignee_name: 'Member', priority: 'high', status: 'todo', progress: 0, created_at: '2026-08-01', completed_at: '2026-08-10', due_date: '2026-08-20' }]] as any)
    .mockResolvedValueOnce([[{ id: 'meeting-1', title: 'Kickoff', created_at: '2026-08-01', version_count: 1, latest_analysis_status: 'approved' }]] as any)
    .mockResolvedValueOnce([[{ id: 'risk-1', title: 'Delay', description: 'Schedule risk', level: 'high', status: 'open', created_at: '2026-08-01' }]] as any)
    .mockResolvedValueOnce([[{ id: 'manager-1', name: 'Manager', email: 'manager@example.com', role: 'manager', project_role: 'manager' }, { id: 'member-1', name: 'Member', email: 'member@example.com', role: 'member', project_role: 'member' }]] as any)
    .mockResolvedValueOnce([[{ member_id: 'member-1', member_name: 'Member', task_count: 2, completed_task_count: 1, average_progress: 60, latest_feedback_at: '2026-08-14T10:00:00.000Z' }]] as any)
    .mockResolvedValueOnce([[{ id: 'event-1', task_id: 'task-1', task_title: 'Ship', actor_id: 'member-1', actor_name: 'Member', event_type: 'feedback_created', before_progress: 30, after_progress: 60, before_status: 'in_progress', after_status: 'in_progress', feedback_content: 'Draft is ready', created_at: '2026-08-14T10:00:00.000Z' }]] as any)

  const detail = await new AppService({} as any).projectDetail(manager, 'project-1')

  expect(detail.project).toMatchObject({ id: 'project-1', ownerId: 'manager-1', ownerName: 'Manager' })
  expect(detail.tasks).toHaveLength(1)
  expect(detail.tasks[0]).toMatchObject({ createdAt: '2026-08-01', completedAt: '2026-08-10' })
  expect(detail.meetings[0]).toMatchObject({ id: 'meeting-1', latestAnalysisStatus: 'approved' })
  expect(detail.risks[0]).toMatchObject({ id: 'risk-1', status: 'open' })
  expect(detail.counts).toMatchObject({ tasks: 2, completedTasks: 1, pendingReviews: 1, openRisks: 1 })
  expect(detail.health).toEqual({ activeTasks: 1, blockedTasks: 1, overdueTasks: 0, openRisks: 1 })
  expect(detail.memberProgress).toEqual([expect.objectContaining({ memberId: 'member-1', averageProgress: 60, latestFeedbackAt: '2026-08-14T10:00:00.000Z' })])
  expect(detail.activity).toEqual([expect.objectContaining({ taskTitle: 'Ship', actorName: 'Member', eventType: 'feedback_created', feedbackContent: 'Draft is ready' })])
  expect(detail.permissions).toMatchObject({ canEdit: true, canManageMembers: true, canManageRisks: true })
  expect(query).toHaveBeenCalledTimes(7)
})

it('allows a member to view only a joined active project and exposes read-only permissions', async () => {
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ id: 'project-1', name: 'Alpha', code: 'ALPHA', status: 'active', owner_id: 'manager-1', owner_name: 'Manager', progress: 0, task_count: 0, completed_task_count: 0, pending_review_count: 0, open_risk_count: 0 }]] as any)
    .mockResolvedValueOnce([[]] as any)
    .mockResolvedValueOnce([[]] as any)
    .mockResolvedValueOnce([[]] as any)
    .mockResolvedValueOnce([[{ id: 'member-1', name: 'Member', email: 'member@example.com', role: 'member', project_role: 'member' }]] as any)
    .mockResolvedValueOnce([[]] as any)
    .mockResolvedValueOnce([[]] as any)

  const detail = await new AppService({} as any).projectDetail(member, 'project-1')

  expect(detail.project.id).toBe('project-1')
  expect(detail.permissions).toMatchObject({ canEdit: false, canManageMembers: false, canManageRisks: false, canCreateTask: false })
})

it('limits a member project detail to personal task, risk, activity, and metrics', async () => {
  const query = vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ id: 'project-1', name: 'Alpha', code: 'ALPHA', status: 'active', owner_id: 'manager-1', owner_name: 'Manager', progress: 50, task_count: 2, completed_task_count: 1, pending_review_count: 1, open_risk_count: 3 }]] as any)
    .mockResolvedValueOnce([[{ id: 'member-task', title: 'Personal', project_id: 'project-1', assignee_id: 'member-1', assignee_name: 'Member', priority: 'high', status: 'in_progress', progress: 40, created_at: '2026-08-01' }]] as any)
    .mockResolvedValueOnce([[{ id: 'meeting-1', title: 'Kickoff', created_at: '2026-08-01', version_count: 1, latest_analysis_status: 'approved' }]] as any)
    .mockResolvedValueOnce([[{ id: 'member-risk', title: 'Personal risk', level: 'high', status: 'open', created_at: '2026-08-02' }]] as any)
    .mockResolvedValueOnce([[{ id: 'manager-1', name: 'Manager', email: 'manager@example.com', role: 'manager', project_role: 'manager' }, { id: 'member-1', name: 'Member', email: 'member@example.com', role: 'member', project_role: 'member' }]] as any)
    .mockResolvedValueOnce([[{ member_id: 'member-1', member_name: 'Member', task_count: 1, completed_task_count: 0, average_progress: 40, latest_feedback_at: '2026-08-14T10:00:00.000Z' }]] as any)
    .mockResolvedValueOnce([[{ id: 'event-1', task_id: 'member-task', task_title: 'Personal', actor_id: 'member-1', actor_name: 'Member', event_type: 'feedback_created', before_progress: 0, after_progress: 40, before_status: 'todo', after_status: 'in_progress', created_at: '2026-08-14T10:00:00.000Z' }]] as any)

  const detail = await new AppService({} as any).projectDetail(member, 'project-1')

  expect(detail.scope).toBe('personal')
  expect(detail.project.progress).toBe(40)
  expect(detail.tasks.map((task) => task.id)).toEqual(['member-task'])
  expect(detail.risks.map((risk) => risk.id)).toEqual(['member-risk'])
  expect(detail.activity.every((event) => event.taskId === 'member-task')).toBe(true)
  expect(detail.counts).toMatchObject({ tasks: 1, completedTasks: 0, pendingReviews: 0, openRisks: 1 })
  expect(query.mock.calls[1][0]).toContain('t.assignee_id=?')
  expect(query.mock.calls[3][0]).toContain('JOIN tasks rt ON rt.id=r.task_id')
  expect(query.mock.calls[3][0]).toContain('rt.assignee_id=?')
  expect(query.mock.calls[6][0]).toContain('t.assignee_id=?')
})

it('does not return a soft-deleted project to a manager', async () => {
  vi.spyOn(pool, 'query').mockResolvedValueOnce([[]] as any)
  await expect(new AppService({} as any).projectDetail(manager, 'deleted-project')).rejects.toThrow('Project does not exist')
})

it('maps project detail task fields into the typed client shape', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
    project: { id: 'project-1', name: 'Alpha', code: 'A', status: 'active', ownerId: 'manager-1', ownerName: 'Manager', progress: 20 },
    tasks: [{ id: 'task-1', title: 'Ship', project_id: 'project-1', assignee_id: 'member-1', assignee_name: 'Member', priority: 'high', status: 'todo', progress: 20, created_at: '2026-08-01', completed_at: '2026-08-10', due_date: '2026-08-20' }],
    meetings: [], risks: [], members: [], health: { activeTasks: 1, blockedTasks: 1, overdueTasks: 0, openRisks: 0 }, memberProgress: [{ memberId: 'member-1', memberName: 'Member', taskCount: 1, completedTaskCount: 0, averageProgress: 20, latestFeedbackAt: '2026-08-14T10:00:00.000Z' }], activity: [{ id: 'event-1', projectId: 'project-1', taskId: 'task-1', taskTitle: 'Ship', actorId: 'member-1', actorName: 'Member', eventType: 'task_updated', beforeProgress: 0, afterProgress: 20, beforeStatus: 'todo', afterStatus: 'in_progress', createdAt: '2026-08-14T10:00:00.000Z' }], counts: { tasks: 1, completedTasks: 0, pendingReviews: 0, openRisks: 0, members: 0 }, permissions: { canEdit: false, canCreateTask: false, canManageMembers: false, canManageRisks: false },
  }), { status: 200 }))
  const detail = await createWorkspaceService('token').getProjectDetail('project-1')
  expect(detail.tasks[0]).toEqual(expect.objectContaining({ projectId: 'project-1', assigneeId: 'member-1', assigneeName: 'Member', createdAt: '2026-08-01', completedAt: '2026-08-10', dueDate: '2026-08-20' }))
  expect(detail.memberProgress[0]).toEqual(expect.objectContaining({ memberId: 'member-1', latestFeedbackAt: '2026-08-14T10:00:00.000Z' }))
  expect(detail.activity[0]).toEqual(expect.objectContaining({ eventType: 'task_updated', afterProgress: 20 }))
})
