import { afterEach, expect, it, vi } from 'vitest'
import { createWorkspaceService } from '../src/services/workspaceService'

afterEach(() => vi.restoreAllMocks())

it('does not mutate feedback state when the API rejects the request', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ message: 'failed' }), { status: 500 }))
  const service = createWorkspaceService('token')
  await expect(service.submitFeedback('task-1', 'Member', 'update', 20)).rejects.toThrow('failed')
  expect(service.state.feedbacks).toHaveLength(0)
})

it('persists notification read state through the API before updating local state', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
  const service = createWorkspaceService('token')
  service.state.notifications.push({ id: 'n1', title: 'Notice', time: '', read: false, path: '/notifications' })
  await service.markRead('n1')
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/notifications/n1/read'), expect.objectContaining({ method: 'PATCH' }))
  expect(service.state.notifications[0].read).toBe(true)
})

it('loads task deadlines and meeting dates as calendar events', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([
    { id: 'task-1', type: 'task', title: 'Release checklist', project_name: 'Alpha', date: '2026-08-15', assignee_name: 'Member', priority: 'high', status: 'todo' },
    { id: 'meeting-1', type: 'meeting', title: 'Release review', project_name: 'Alpha', date: '2026-08-12' },
  ]), { status: 200 }))
  const service = createWorkspaceService('token')

  await service.loadCalendarEvents()

  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/calendar-events'), expect.any(Object))
  expect(service.state.calendarEvents).toEqual([
    expect.objectContaining({ id: 'task-1', type: 'task', date: '2026-08-15', owner: 'Member', priority: '高', state: 'todo' }),
    expect.objectContaining({ id: 'meeting-1', type: 'meeting', date: '2026-08-12', project: 'Alpha' }),
  ])
})

it('maps each risk to its project owner returned by the API', async () => {
  vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'risk-1', title: 'Dependency', description: 'Waiting', level: 'medium', status: 'open', project_owner_name: 'Manager' }]), { status: 200 }))
  const service = createWorkspaceService('token')

  await service.load()

  expect(service.state.risks[0].owner).toBe('Manager')
})

it('maps server-calculated project progress instead of replacing it with zero', async () => {
  vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'project-1', name: 'Alpha', code: 'A', owner_name: 'Manager', status: 'active', progress: 65, end_date: null, members: 1 }]), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
  const service = createWorkspaceService('token')

  await service.load()

  expect(service.state.projects[0].progress).toBe(65)
})

it('retains task creation and completion timestamps when loading the workspace', async () => {
  vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify([{
      id: 'task-1', title: 'Release', project_name: 'Alpha', project_id: 'project-1', assignee_name: 'Member', assignee_id: 'member-1',
      priority: 'high', status: 'completed', progress: 100, due_date: '2026-08-15',
      created_at: '2026-08-14T09:00:00.000Z', completed_at: '2026-08-14T10:00:00.000Z',
    }]), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
  const service = createWorkspaceService('token')

  await service.load()

  expect(service.state.tasks[0]).toEqual(expect.objectContaining({
    createdAt: '2026-08-14T09:00:00.000Z',
    completedAt: '2026-08-14T10:00:00.000Z',
  }))
})

it('updates only the requested task state', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))
  const service = createWorkspaceService('token')
  service.state.tasks.push(
    { id: 'task-1', title: 'First', project: 'Alpha', owner: 'Member', due: '2026-08-15', priority: '中', rawPriority: 'medium', state: 'completed', progress: 100, createdAt: '' },
    { id: 'task-2', title: 'Second', project: 'Alpha', owner: 'Member', due: '2026-08-16', priority: '中', rawPriority: 'medium', state: 'in-progress', progress: 50, createdAt: '' },
  )

  await service.updateTaskState('task-2', 'completed')

  expect(service.state.tasks).toEqual([
    expect.objectContaining({ id: 'task-1', state: 'completed', progress: 100 }),
    expect.objectContaining({ id: 'task-2', state: 'completed', progress: 100 }),
  ])
})

it('sends an administrator-created notification through the notification endpoint', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ created: 2 }), { status: 200 }))
  const service = createWorkspaceService('token')

  await expect((service as any).sendNotification({ title: 'Release', body: 'The release is ready.', audienceType: 'role', role: 'member' })).resolves.toEqual({ created: 2 })

  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/notifications'), expect.objectContaining({
    method: 'POST', body: JSON.stringify({ title: 'Release', body: 'The release is ready.', audienceType: 'role', role: 'member' }),
  }))
})
