import { afterEach, expect, it, vi } from 'vitest'
import { validate } from 'class-validator'
import { createMeetingService } from '../src/services/meetingService'
import { AppService } from '../src/server/app.service'
import { pool } from '../src/server/database'
import { ReviewDraftDto } from '../src/server/dtos'

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

it('does not expose project-wide analysis tasks and risks in a member review detail', async () => {
  const member = { id: 'member-1', role: 'member' as const, name: 'Member', email: 'member@example.com' }
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ id: 'meeting-1', project_id: 'project-1', title: 'Minutes', created_at: '', version_number: 1, desensitized_content: 'masked text' }]] as any)
    .mockResolvedValueOnce([[{ project_id: 'project-1' }]] as any)
    .mockResolvedValueOnce([[{ id: 'analysis-1', status: 'approved', model: 'test', result_json: JSON.stringify({ summary: 'x', decisions: [], tasks: [{ title: 'Other member task', priority: 'high' }], risks: [{ title: 'Other member risk', level: 'high' }] }) }]] as any)
    .mockResolvedValueOnce([[{ draft_json: JSON.stringify({ summary: 'x', decisions: [], tasks: [{ title: 'Other member task', priority: 'high' }], risks: [{ title: 'Other member risk', level: 'high' }] }) }]] as any)

  const detail = await new AppService({} as any).reviewDetail(member, 'meeting-1')

  expect(detail.analysis).not.toHaveProperty('result.tasks')
  expect(detail.analysis).not.toHaveProperty('result.risks')
  expect(detail.draft).toBeNull()
})

it('lists approved analyses for projects joined by a member', async () => {
  const member = { id: 'member-1', role: 'member' as const, name: 'Member', email: 'member@example.com' }
  const query = vi.spyOn(pool, 'query').mockResolvedValueOnce([[{ id: 'analysis-1', status: 'approved', project_id: 'project-1', result_json: JSON.stringify({ summary: 'x', decisions: [], tasks: [], risks: [] }) }]] as any)

  await new AppService({} as any).listAnalyses(member)

  expect(query).toHaveBeenCalledWith(expect.stringContaining('JOIN project_members pm ON pm.project_id=m.project_id'), ['member-1'])
  expect(query).toHaveBeenCalledWith(expect.stringContaining("a.status='approved'"), ['member-1'])
})

it('validates draft decisions, risks, owner email, and due date', async () => {
  const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ project_id: 'project-1', status: 'pending' }]] as any)
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
  const service = new AppService({} as any)
  await expect(service.saveReviewDraft(manager, 'analysis-1', { summary: 'x', decisions: [''], tasks: [{ title: 'Task', priority: 'low', owner_email: 'bad', due_date: 'tomorrow' }], risks: [{ title: '', level: 'high' }] } as any)).rejects.toThrow('Review draft is invalid')
})

it('saves a task-free manual draft while validating supplied structured items', async () => {
  const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ project_id: 'project-1', status: 'pending' }]] as any)
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
  const execute = vi.spyOn(pool, 'execute').mockResolvedValue([] as any)

  await expect(new AppService({} as any).saveReviewDraft(manager, 'analysis-1', { summary: 'No follow-up work', decisions: [], tasks: [], risks: [] })).resolves.toEqual({ summary: 'No follow-up work', decisions: [], tasks: [], risks: [] })
  expect(execute).toHaveBeenCalledWith(expect.stringContaining('ai_analysis_drafts'), expect.arrayContaining([expect.stringContaining('No follow-up work')]))

  const dto = Object.assign(new ReviewDraftDto(), { summary: 'No follow-up work', decisions: [], tasks: [], risks: [] })
  expect(await validate(dto)).toHaveLength(0)
})

it('preserves a risk link to its candidate task when saving a review draft', async () => {
  const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }
  vi.spyOn(pool, 'query').mockImplementation(async (sql: any) => String(sql).includes('owner_id')
    ? [[{ owner_id: 'manager-1' }]] as any
    : [[{ project_id: 'project-1', status: 'pending' }]] as any)
  vi.spyOn(pool, 'execute').mockResolvedValue([] as any)

  await expect(new AppService({} as any).saveReviewDraft(manager, 'analysis-1', {
    summary: 'Scoped risk',
    decisions: [],
    tasks: [{ title: 'Ship release', priority: 'high' }],
    risks: [{ title: 'Release delay', level: 'high', task_index: 0 }],
  } as any)).resolves.toMatchObject({ risks: [{ task_index: 0 }] })
})

it('rejects a risk link outside the candidate task list when saving a review draft', async () => {
  const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }
  vi.spyOn(pool, 'query').mockImplementation(async (sql: any) => String(sql).includes('owner_id')
    ? [[{ owner_id: 'manager-1' }]] as any
    : [[{ project_id: 'project-1', status: 'pending' }]] as any)
  vi.spyOn(pool, 'execute').mockResolvedValue([] as any)

  await expect(new AppService({} as any).saveReviewDraft(manager, 'analysis-1', {
    summary: 'Scoped risk',
    decisions: [],
    tasks: [{ title: 'Ship release', priority: 'high' }],
    risks: [{ title: 'Release delay', level: 'high', task_index: 1 }],
  } as any)).rejects.toThrow('Risk task reference is invalid')
})

it('approves a manual analysis using a human-authored saved task', async () => {
  const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }
  const connection = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(), query: vi.fn()
    .mockResolvedValueOnce([[{ draft_json: JSON.stringify({ summary: 'Human summary', decisions: ['Ship'], tasks: [{ title: 'Human task', priority: 'medium' }], risks: [{ title: 'Schedule', level: 'low' }] }) }]])
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]]) }
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ id: 'analysis-1', mode: 'manual', project_id: 'project-1', status: 'pending', result_json: JSON.stringify({ summary: 'Manual review required', decisions: [], tasks: [], risks: [] }), requested_by: 'manager-1', meeting_title: 'Minutes' }]] as any)
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
  vi.spyOn(pool, 'getConnection').mockResolvedValue(connection as any)
  vi.spyOn(pool, 'execute').mockResolvedValue([] as any)

  await new AppService({} as any).reviewAnalysis(manager, 'analysis-1', true)

  expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO tasks'), expect.arrayContaining(['Human task', 'medium']))
  expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO risks'), expect.arrayContaining(['Schedule', 'low']))
})

it('links an approved risk to the formal task selected in its review draft', async () => {
  const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }
  const connection = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(), query: vi.fn()
    .mockResolvedValueOnce([[{ draft_json: JSON.stringify({ summary: 'x', decisions: [], tasks: [{ title: 'First', priority: 'low' }, { title: 'Second', priority: 'high' }], risks: [{ title: 'Second risk', level: 'high', task_index: 1 }] }) }]])
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]]) }
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ id: 'analysis-1', project_id: 'project-1', status: 'pending', result_json: JSON.stringify({ summary: 'x', decisions: [], tasks: [], risks: [] }), requested_by: 'manager-1', meeting_title: 'Minutes' }]] as any)
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
  vi.spyOn(pool, 'getConnection').mockResolvedValue(connection as any)
  vi.spyOn(pool, 'execute').mockResolvedValue([] as any)

  await new AppService({} as any).reviewAnalysis(manager, 'analysis-1', true)

  const taskInserts = connection.execute.mock.calls.filter((call) => String(call[0]).includes('INSERT INTO tasks'))
  const riskInsert = connection.execute.mock.calls.find((call) => String(call[0]).includes('INSERT INTO risks'))
  expect(taskInserts).toHaveLength(2)
  expect(riskInsert?.[0]).toContain('task_id')
  expect(riskInsert?.[1]).toContain(taskInserts[1][1][0])
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
