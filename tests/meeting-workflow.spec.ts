import { afterEach, expect, it, vi } from 'vitest'
import { createMeetingService } from '../src/services/meetingService'
import { AppService } from '../src/server/app.service'
import { pool } from '../src/server/database'

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

it('uploads a meeting file as multipart data without forcing a JSON content type', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'm1' }), { status: 200 }))
  const file = new File(['hello'], 'minutes.txt', { type: 'text/plain' })

  await createMeetingService('token').importFile('p1', 'Minutes', file)

  expect(fetchMock.mock.calls[0][0]).toContain('/meetings/import')
  const request = fetchMock.mock.calls[0][1] as RequestInit
  expect(request.body).toBeInstanceOf(FormData)
  expect(request.headers).not.toHaveProperty('Content-Type')
})

it('does not include a rejection reason in the audit event', async () => {
  const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }
  const connection = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), query: vi.fn()
    .mockResolvedValueOnce([[{ id: 'analysis-1', project_id: 'project-1', title: 'Minutes', status: 'pending', owner_id: 'manager-1', owner_is_active: 1, owner_role: 'manager', result_json: JSON.stringify({ summary: 'x', decisions: [], tasks: [], risks: [] }) }]])
    .mockResolvedValueOnce([[]]), execute: vi.fn() }
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ id: 'analysis-1', project_id: 'project-1', status: 'pending', result_json: JSON.stringify({ summary: 'x', decisions: [], tasks: [], risks: [] }) }]] as any)
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
  vi.spyOn(pool, 'getConnection').mockResolvedValue(connection as any)
  const audit = vi.spyOn(pool, 'execute').mockResolvedValue([] as any)

  await new AppService({} as any).reviewAnalysis(manager, 'analysis-1', false, 'Contains private correction')

  expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('rejection_reason'), expect.arrayContaining(['Contains private correction']))
  expect(JSON.stringify(audit.mock.calls.at(-1)?.[1])).not.toContain('Contains private correction')
})

it('notifies the matching project member when an approved analysis creates a task', async () => {
  const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }
  const connection = {
    beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(),
    query: vi.fn()
      .mockResolvedValueOnce([[{ id: 'analysis-1', project_id: 'project-1', title: 'Minutes', status: 'pending', owner_id: 'manager-1', owner_is_active: 1, owner_role: 'manager', result_json: JSON.stringify({ summary: 'x', decisions: [], tasks: [{ title: 'Prepare release', priority: 'high', owner_email: 'member@example.com' }], risks: [] }) }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ id: 'member-1' }]]),
  }
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ id: 'analysis-1', project_id: 'project-1', status: 'pending', result_json: JSON.stringify({ summary: 'x', decisions: [], tasks: [{ title: 'Prepare release', priority: 'high', owner_email: 'member@example.com' }], risks: [] }) }]] as any)
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
  vi.spyOn(pool, 'getConnection').mockResolvedValue(connection as any)
  vi.spyOn(pool, 'execute').mockResolvedValue([] as any)

  await new AppService({} as any).reviewAnalysis(manager, 'analysis-1', true)

  expect(connection.execute).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO notifications'),
    expect.arrayContaining(['member-1', '任务已分配：Prepare release', '/my-tasks']),
  )
})

it('notifies the project owner when an approved task has no matching member', async () => {
  const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }
  const connection = {
    beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(),
    query: vi.fn()
      .mockResolvedValueOnce([[{ id: 'analysis-1', project_id: 'project-1', title: 'Minutes', status: 'pending', owner_id: 'manager-1', owner_is_active: 1, owner_role: 'manager', result_json: JSON.stringify({ summary: 'x', decisions: [], tasks: [{ title: 'Prepare release', priority: 'high' }], risks: [] }) }]])
      .mockResolvedValueOnce([[]]),
  }
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ id: 'analysis-1', project_id: 'project-1', status: 'pending', result_json: JSON.stringify({ summary: 'x', decisions: [], tasks: [{ title: 'Prepare release', priority: 'high' }], risks: [] }) }]] as any)
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
  vi.spyOn(pool, 'getConnection').mockResolvedValue(connection as any)
  vi.spyOn(pool, 'execute').mockResolvedValue([] as any)

  await new AppService({} as any).reviewAnalysis(manager, 'analysis-1', true)

  expect(connection.execute).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO notifications'),
    expect.arrayContaining(['manager-1', '任务已分配：Prepare release', '/my-tasks']),
  )
})
