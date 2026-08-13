import { afterEach, expect, it, vi } from 'vitest'
import { AppService } from '../src/server/app.service'
import { pool } from '../src/server/database'

const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }

afterEach(() => vi.restoreAllMocks())

it('keeps successful batch reviews when another analysis fails', async () => {
  const service = new AppService({} as any)
  vi.spyOn(service, 'reviewAnalysis')
    .mockResolvedValueOnce({ id: 'analysis-1', status: 'approved' })
    .mockRejectedValueOnce(new Error('Analysis has already been reviewed'))

  await expect(service.reviewAnalyses(manager, ['analysis-1', 'analysis-2'], true)).resolves.toEqual({
    succeeded: [{ id: 'analysis-1', status: 'approved' }],
    failed: [{ id: 'analysis-2', message: 'Analysis has already been reviewed' }],
  })
})

it.each(['rejected', 'failed'])('reanalyzes a manager-owned %s analysis and retains its source linkage', async (status) => {
  const result = { summary: 'Retry result', decisions: [], tasks: [], risks: [] }
  const runner = { run: vi.fn().mockResolvedValue({ result, metadata: { mode: 'rag', model: 'deepseek-chat', modelCallCount: 1, retrievalEnabled: false, retrievalStatus: 'not_configured' } }) }
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ id: 'analysis-1', status, meeting_id: 'meeting-1', title: 'Standup', project_id: 'project-1', desensitized_content: '[PHONE]' }]] as any)
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
  const execute = vi.spyOn(pool, 'execute').mockResolvedValue([] as any)

  const retried = await new AppService({} as any, { invalidateBusinessReads: vi.fn() } as any, runner as any).reanalyzeRejectedAnalysis(manager, 'analysis-1', 'rag')

  expect(retried).toMatchObject({ status: 'pending', mode: 'rag', reanalysisOfId: 'analysis-1', result })
  expect(execute).toHaveBeenCalledWith(expect.stringContaining('reanalysis_of_id'), expect.arrayContaining(['analysis-1']))
})

it('rejects reanalysis for managers who do not own the project', async () => {
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ id: 'analysis-1', status: 'failed', meeting_id: 'meeting-1', title: 'Standup', project_id: 'project-1', desensitized_content: '[PHONE]' }]] as any)
    .mockResolvedValueOnce([[{ owner_id: 'manager-2' }]] as any)

  await expect(new AppService({} as any).reanalyzeRejectedAnalysis(manager, 'analysis-1', 'llm')).rejects.toThrow('You do not manage this project')
})
