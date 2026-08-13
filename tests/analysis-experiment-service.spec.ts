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
  expect(persisted).not.toContain('Provider unavailable')
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

it('persists only a bounded agent plan derived from desensitized content', async () => {
  const safePlan = `Use [PHONE] to prioritize the work ${'x'.repeat(2100)}`
  const runner = { run: vi.fn().mockResolvedValue({ result, metadata: { mode: 'agent', model: 'deepseek-chat', modelCallCount: 2, retrievalEnabled: false, retrievalStatus: 'not_applicable', plan: safePlan, prompt: 'INTERNAL PROMPT', apiKey: 'secret-key', rawProviderError: 'provider details' } }) }
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ id: 'meeting-1', title: 'Standup', content: '13800138000', project_id: 'project-1', desensitized_content: '[PHONE]' }]] as any)
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
  const execute = vi.spyOn(pool, 'execute').mockResolvedValue([] as any)

  await new AppService({} as any, { invalidateBusinessReads: vi.fn() } as any, runner as any).analyzeMeeting(manager, 'meeting-1', 'agent')

  const metadataArguments = execute.mock.calls.find(([sql]) => String(sql).startsWith('UPDATE ai_analyses SET result_json'))?.[1] as any[] | undefined
  const metadataArgument = metadataArguments?.[1]
  const metadata = JSON.parse(String(metadataArgument))
  expect(metadata.plan).toBe(safePlan.slice(0, 2000))
  expect(metadata.plan).toContain('[PHONE]')
  expect(metadata).not.toHaveProperty('prompt')
  expect(metadata).not.toHaveProperty('apiKey')
  expect(metadata).not.toHaveProperty('rawProviderError')
  expect(JSON.stringify(execute.mock.calls)).not.toContain('13800138000')
  expect(JSON.stringify(execute.mock.calls)).not.toContain('INTERNAL PROMPT')
  expect(JSON.stringify(execute.mock.calls)).not.toContain('secret-key')
  expect(JSON.stringify(execute.mock.calls)).not.toContain('provider details')
})

it('rejects unsupported analysis modes in the request DTO', async () => {
  const dto = Object.assign(new AnalysisRequestDto(), { mode: 'queue' })

  expect(await validate(dto)).not.toHaveLength(0)
})

it('returns execution aggregates with null durations excluded from the average', async () => {
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
    .mockResolvedValueOnce([[
      { mode: 'rag', run_count: 3, pending_count: 1, failed_count: 1, approved_count: 1, rejected_count: 0, total_duration_ms: 180, average_duration_ms: 90, total_model_calls: 3 },
      { mode: 'manual', run_count: 1, pending_count: 1, failed_count: 0, approved_count: 0, rejected_count: 0, total_duration_ms: 0, average_duration_ms: null, total_model_calls: 0 },
      { mode: null, run_count: 1, pending_count: 0, failed_count: 0, approved_count: 1, rejected_count: 0, total_duration_ms: 20, average_duration_ms: 20, total_model_calls: 1 },
    ]] as any)
  const service = new AppService({} as any)

  await expect(service.experimentSummary(manager, 'project-1')).resolves.toEqual({
    manual: { runCount: 1, pendingCount: 1, failedCount: 0, approvedCount: 0, rejectedCount: 0, totalDurationMs: 0, averageDurationMs: 0, totalModelCalls: 0 },
    llm: { runCount: 1, pendingCount: 0, failedCount: 0, approvedCount: 1, rejectedCount: 0, totalDurationMs: 20, averageDurationMs: 20, totalModelCalls: 1 },
    rag: { runCount: 3, pendingCount: 1, failedCount: 1, approvedCount: 1, rejectedCount: 0, totalDurationMs: 180, averageDurationMs: 90, totalModelCalls: 3 },
    agent: { runCount: 0, pendingCount: 0, failedCount: 0, approvedCount: 0, rejectedCount: 0, totalDurationMs: 0, averageDurationMs: 0, totalModelCalls: 0 },
  })

  expect(vi.mocked(pool.query).mock.calls[1][0]).toContain('AVG(a.duration_ms)')

  vi.restoreAllMocks()
  vi.spyOn(pool, 'query').mockResolvedValueOnce([[{ owner_id: 'manager-2' }]] as any)
  await expect(service.experimentSummary(manager, 'project-1')).rejects.toThrow('You do not manage this project')
})

it('returns persisted execution fields from analysis list and review detail queries', async () => {
  const metadata = { mode: 'agent', retrievalStatus: 'not_applicable', plan: 'Inspect safe placeholders' }
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[
      { id: 'analysis-list', meeting_id: 'meeting-1', status: 'pending', model: 'deepseek-chat', mode: 'agent', execution_metadata: JSON.stringify(metadata), duration_ms: 42, model_call_count: 2, result_json: JSON.stringify(result), created_at: '2026-08-14', title: 'Standup', project_id: 'project-1' },
      { id: 'analysis-legacy', meeting_id: 'meeting-2', status: 'approved', model: 'deepseek-chat', mode: null, execution_metadata: null, duration_ms: null, model_call_count: null, result_json: JSON.stringify(result), created_at: '2026-08-13', title: 'Legacy', project_id: 'project-1' },
    ]] as any)
    .mockResolvedValueOnce([[{ id: 'meeting-1', project_id: 'project-1', title: 'Standup', created_at: '2026-08-14', version_number: 1, desensitized_content: 'safe notes' }]] as any)
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
    .mockResolvedValueOnce([[{ id: 'analysis-detail', status: 'pending', model: 'deepseek-chat', mode: 'rag', execution_metadata: JSON.stringify({ mode: 'rag', retrievalStatus: 'not_configured' }), duration_ms: 17, model_call_count: 1, result_json: JSON.stringify(result), created_at: '2026-08-14', reviewed_at: null, rejection_reason: null, reanalysis_of_id: null }]] as any)
    .mockResolvedValueOnce([[]] as any)
  const service = new AppService({} as any)

  await expect(service.listAnalyses(manager)).resolves.toEqual([
    expect.objectContaining({ id: 'analysis-list', mode: 'agent', execution_metadata: JSON.stringify(metadata), duration_ms: 42, model_call_count: 2 }),
    expect.objectContaining({ id: 'analysis-legacy', mode: 'llm' }),
  ])
  await expect(service.reviewDetail(manager, 'meeting-1')).resolves.toMatchObject({
    analysis: { id: 'analysis-detail', mode: 'rag', execution_metadata: JSON.stringify({ mode: 'rag', retrievalStatus: 'not_configured' }), duration_ms: 17, model_call_count: 1 },
  })

  const sql = vi.mocked(pool.query).mock.calls.map(([query]) => String(query)).join('\n')
  expect(sql).toContain('a.execution_metadata')
  expect(sql).toContain('a.duration_ms')
  expect(sql).toContain('a.model_call_count')
})
