import { afterEach, expect, it, vi } from 'vitest'
import { createMeetingService } from '../src/services/meetingService'

afterEach(() => vi.restoreAllMocks())

it('reviews an analysis through the real API and refreshes the queue', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'a1', status: 'approved' }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'a1', meeting_id: 'm1', title: 'Meeting', status: 'approved', result: { tasks: [], risks: [] }, created_at: '' }]), { status: 200 }))
  const service = createMeetingService('token')
  await service.review('a1', true)
  await service.load()
  expect(fetchMock.mock.calls[0][0]).toContain('/analyses/a1/review')
  expect(service.state.analyses[0].status).toBe('approved')
})
