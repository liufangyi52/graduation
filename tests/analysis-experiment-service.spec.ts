import { validate } from 'class-validator'
import { expect, it, vi } from 'vitest'
import { AppService } from '../src/server/app.service'
import { AnalysisRequestDto } from '../src/server/dtos'
import { pool } from '../src/server/database'
import { AnalysisExecutionError } from '../src/server/analysis-runner'

const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }
const result = { summary: 'Safe summary', decisions: [], tasks: [], risks: [] }

it('runs a RAG analysis from only the current desensitized content and persists safe execution data', async () => {
  const runner = { run: vi.fn().mockResolvedValue({
    result,
    metadata: { mode: 'rag', model: 'deepseek-chat', modelCallCount: 1, retrievalEnabled: false, retrievalStatus: 'not_configured' },
  }) }
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ id: 'meeting-1', title: 'Standup', content: '13800138000', project_id: 'project-1', desensitized_content: '[PHONE]' }]] as any)
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
  const execute = vi.spyOn(pool, 'execute').mockResolvedValue([] as any)

  await expect(new AppService({} as any, { invalidateBusinessReads: vi.fn() } as any, runner as any).analyzeMeeting(manager, 'meeting-1', 'rag')).resolves.toMatchObject({ meetingId: 'meeting-1', status: 'pending', result })

  expect(runner.run).toHaveBeenCalledWith({ mode: 'rag', title: 'Standup', desensitizedContent: '[PHONE]' })
  const persisted = JSON.stringify(execute.mock.calls)
  expect(persisted).not.toContain('13800138000')
  expect(persisted).not.toContain('[PHONE]')
  expect(execute).toHaveBeenCalledWith(expect.stringContaining('execution_metadata'), expect.arrayContaining([expect.stringContaining('not_configured'), 1]))
})

it('records safe metadata and timing when a mode execution fails', async () => {
  const runner = { run: vi.fn().mockRejectedValue(new AnalysisExecutionError(new Error('Provider unavailable'), { mode: 'agent', model: 'deepseek-chat', modelCallCount: 2, retrievalEnabled: false, retrievalStatus: 'not_applicable' })) }
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ id: 'meeting-1', title: 'Standup', content: '13800138000', project_id: 'project-1', desensitized_content: '[PHONE]' }]] as any)
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
  const execute = vi.spyOn(pool, 'execute').mockResolvedValue([] as any)

  await expect(new AppService({} as any, {} as any, runner as any).analyzeMeeting(manager, 'meeting-1', 'agent')).rejects.toThrow('Provider unavailable')

  const persisted = JSON.stringify(execute.mock.calls)
  expect(persisted).not.toContain('13800138000')
  expect(persisted).not.toContain('[PHONE]')
  expect(execute).toHaveBeenCalledWith(expect.stringContaining('status="failed"'), expect.arrayContaining(['Analysis execution failed', expect.stringContaining('not_applicable'), 2]))
})

it('keeps a persisted analysis pending when audit or cache invalidation fails', async () => {
  const runner = { run: vi.fn().mockResolvedValue({ result, metadata: { mode: 'llm', model: 'deepseek-chat', modelCallCount: 1, retrievalEnabled: false, retrievalStatus: 'not_applicable' } }) }
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ id: 'meeting-1', title: 'Standup', project_id: 'project-1', desensitized_content: '[PHONE]' }]] as any)
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
  const execute = vi.spyOn(pool, 'execute').mockImplementation((async (sql: string) => {
    if (sql.includes('INSERT INTO audit_logs')) throw new Error('Audit unavailable')
    return [] as any
  }) as any)

  await expect(new AppService({} as any, { invalidateBusinessReads: vi.fn().mockRejectedValue(new Error('Cache unavailable')) } as any, runner as any).analyzeMeeting(manager, 'meeting-1')).resolves.toMatchObject({ status: 'pending', result })

  expect(execute.mock.calls.filter(([sql]) => String(sql).includes('status="failed"'))).toHaveLength(0)
})

it('does not persist an agent plan that echoes desensitized meeting content', async () => {
  const runner = { run: vi.fn().mockResolvedValue({ result, metadata: { mode: 'agent', model: 'deepseek-chat', modelCallCount: 2, retrievalEnabled: false, retrievalStatus: 'not_applicable', plan: 'Use [PHONE] to prioritize the work' } }) }
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ id: 'meeting-1', title: 'Standup', project_id: 'project-1', desensitized_content: '[PHONE]' }]] as any)
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
  const execute = vi.spyOn(pool, 'execute').mockResolvedValue([] as any)

  await new AppService({} as any, { invalidateBusinessReads: vi.fn() } as any, runner as any).analyzeMeeting(manager, 'meeting-1', 'agent')

  expect(JSON.stringify(execute.mock.calls)).not.toContain('[PHONE]')
  expect(JSON.stringify(execute.mock.calls)).not.toContain('Use [PHONE]')
})

it('rejects unsupported analysis modes in the request DTO', async () => {
  const dto = Object.assign(new AnalysisRequestDto(), { mode: 'queue' })

  expect(await validate(dto)).not.toHaveLength(0)
})

it('returns execution aggregates for the owning manager and rejects another manager', async () => {
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
    .mockResolvedValueOnce([[
      { mode: 'rag', run_count: 3, pending_count: 1, failed_count: 1, approved_count: 1, rejected_count: 0, total_duration_ms: 180, total_model_calls: 3 },
      { mode: null, run_count: 1, pending_count: 0, failed_count: 0, approved_count: 1, rejected_count: 0, total_duration_ms: 20, total_model_calls: 1 },
    ]] as any)
  const service = new AppService({} as any)

  await expect(service.experimentSummary(manager, 'project-1')).resolves.toEqual({
    manual: { runCount: 0, pendingCount: 0, failedCount: 0, approvedCount: 0, rejectedCount: 0, totalDurationMs: 0, averageDurationMs: 0, totalModelCalls: 0 },
    llm: { runCount: 1, pendingCount: 0, failedCount: 0, approvedCount: 1, rejectedCount: 0, totalDurationMs: 20, averageDurationMs: 20, totalModelCalls: 1 },
    rag: { runCount: 3, pendingCount: 1, failedCount: 1, approvedCount: 1, rejectedCount: 0, totalDurationMs: 180, averageDurationMs: 60, totalModelCalls: 3 },
    agent: { runCount: 0, pendingCount: 0, failedCount: 0, approvedCount: 0, rejectedCount: 0, totalDurationMs: 0, averageDurationMs: 0, totalModelCalls: 0 },
  })

  vi.restoreAllMocks()
  vi.spyOn(pool, 'query').mockResolvedValueOnce([[{ owner_id: 'manager-2' }]] as any)
  await expect(service.experimentSummary(manager, 'project-1')).rejects.toThrow('You do not manage this project')
})
