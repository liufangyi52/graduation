import { afterEach, expect, it, vi } from 'vitest'
import { createMeetingService } from '../src/services/meetingService'
import { AppService } from '../src/server/app.service'
import { pool } from '../src/server/database'

afterEach(() => vi.restoreAllMocks())

it('saves a review draft without changing the original analysis result and rejects non-managers', async () => {
  const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }
  const member = { id: 'member-1', role: 'member' as const, name: 'Member', email: 'member@example.com' }
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ project_id: 'project-1', status: 'pending', result_json: JSON.stringify({ summary: 'original', decisions: [], tasks: [{ title: 'Original', priority: 'low' }], risks: [] }) }]] as any)
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
    .mockResolvedValue([[{ project_id: 'project-1', status: 'pending' }]] as any)
  const execute = vi.spyOn(pool, 'execute').mockResolvedValue([] as any)
  const service = new AppService({} as any)
  await service.saveReviewDraft(manager, 'analysis-1', { summary: 'edited', decisions: [], tasks: [{ title: 'Edited', priority: 'high' }], risks: [] })
  expect(execute).toHaveBeenCalledWith(expect.stringContaining('ai_analysis_drafts'), expect.any(Array))
  await expect(service.saveReviewDraft(member, 'analysis-1', { summary: 'x', decisions: [], tasks: [], risks: [] })).rejects.toThrow('Only managers can perform this action')
})

it('requires a non-blank rejection reason for single and batch reviews', async () => {
  const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }
  const service = new AppService({} as any)
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ id: 'analysis-1', project_id: 'project-1', status: 'pending', result_json: JSON.stringify({ summary: 'x', decisions: [], tasks: [], risks: [] }) }]] as any)
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
  await expect(service.reviewAnalysis(manager, 'analysis-1', false, '   ')).rejects.toThrow('Review reason must contain 1 to 500 characters')
  await expect(service.reviewAnalyses(manager, ['analysis-1'], false, '')).resolves.toMatchObject({ failed: [{ id: 'analysis-1' }] })
})

it('uses edited draft task fields when approving an analysis', async () => {
  const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }
  const connection = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(), query: vi.fn()
    .mockResolvedValueOnce([[{ draft_json: JSON.stringify({ summary: 'x', decisions: [], tasks: [{ title: 'Edited', priority: 'high', owner_email: 'member@example.com' }], risks: [] }) }]])
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]])
    .mockResolvedValueOnce([[{ id: 'member-1' }]]) }
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ id: 'analysis-1', project_id: 'project-1', status: 'pending', result_json: JSON.stringify({ summary: 'x', decisions: [], tasks: [{ title: 'Original', priority: 'low' }], risks: [] }), requested_by: 'manager-1', meeting_title: 'Minutes' }]] as any)
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
  vi.spyOn(pool, 'getConnection').mockResolvedValue(connection as any)
  vi.spyOn(pool, 'execute').mockResolvedValue([] as any)
  await new AppService({} as any).reviewAnalysis(manager, 'analysis-1', true)
  expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO tasks'), expect.arrayContaining(['Edited', 'member-1', 'high']))
  expect(connection.execute.mock.calls.some((call) => String(call[0]).includes('result_json'))).toBe(false)
})

it('rejects overlong rejection reasons for single and batch reviews', async () => {
  const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }
  const service = new AppService({} as any)
  vi.spyOn(pool, 'query').mockImplementation(async (sql: any) => String(sql).includes('owner_id')
    ? [[{ owner_id: 'manager-1' }]] as any
    : [[{ id: 'analysis-1', project_id: 'project-1', status: 'pending', result_json: JSON.stringify({ summary: 'x', decisions: [], tasks: [], risks: [] }) }]] as any)
  await expect(service.reviewAnalysis(manager, 'analysis-1', false, 'x'.repeat(501))).rejects.toThrow('Review reason must contain 1 to 500 characters')
  await expect(service.reviewAnalyses(manager, ['analysis-1'], false, 'x'.repeat(501))).resolves.toMatchObject({ failed: [{ id: 'analysis-1', message: 'Review reason must contain 1 to 500 characters' }] })
})

it('allows admin and auditor to view desensitized review details without original content', async () => {
  const admin = { id: 'admin-1', role: 'admin' as const, name: 'Admin', email: 'admin@example.com' }
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ id: 'meeting-1', project_id: 'project-1', title: 'Minutes', created_at: '', version_number: 1, desensitized_content: 'masked text' }]] as any)
    .mockResolvedValueOnce([[{ id: 'analysis-1', status: 'approved', model: 'test', result_json: JSON.stringify({ summary: 'x', decisions: [], tasks: [], risks: [] }) }]] as any)
    .mockResolvedValueOnce([[]] as any)
  const detail = await new AppService({} as any).reviewDetail(admin, 'meeting-1')
  expect(detail.meeting.desensitizedContent).toBe('masked text')
  expect(detail.meeting).not.toHaveProperty('originalContent')
})

it('validates draft decisions, risks, owner email, and due date', async () => {
  const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ project_id: 'project-1', status: 'pending' }]] as any)
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
  const service = new AppService({} as any)
  await expect(service.saveReviewDraft(manager, 'analysis-1', { summary: 'x', decisions: [''], tasks: [{ title: 'Task', priority: 'low', owner_email: 'bad', due_date: 'tomorrow' }], risks: [{ title: '', level: 'high' }] } as any)).rejects.toThrow('Review draft is invalid')
})

it('sends review detail and draft payloads through the client service', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
  const service = createMeetingService('token')
  await service.getReviewDetail('meeting-1')
  await service.saveReviewDraft('analysis-1', { summary: 'x', decisions: [], tasks: [], risks: [] })
  expect(fetchMock.mock.calls[0][0]).toContain('/meetings/meeting-1/review')
  expect(fetchMock.mock.calls[1][0]).toContain('/analyses/analysis-1/draft')
  expect((fetchMock.mock.calls[1][1] as RequestInit).method).toBe('PUT')
})
