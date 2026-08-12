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
