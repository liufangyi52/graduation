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

it('maps server-calculated project progress instead of replacing it with zero', async () => {
  vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'project-1', name: 'Alpha', code: 'A', owner_name: 'Manager', status: 'active', progress: 65, end_date: null, members: 1 }]), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
  const service = createWorkspaceService('token')

  await service.load()

  expect(service.state.projects[0].progress).toBe(65)
})
