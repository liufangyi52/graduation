import { afterEach, expect, it, vi } from 'vitest'
import { AppService } from '../src/server/app.service'

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
