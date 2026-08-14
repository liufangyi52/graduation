import { expect, it } from 'vitest'
import { createRagExperimentController } from '../src/services/ragExperimentController'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

const summary = { manual: {}, llm: {}, rag: {}, agent: {} } as any
const ready = { configured: true, ready: true, eligibleVersionCount: 1 }

it('clears an already-loaded A summary immediately when B is selected and still pending', async () => {
  const bSummary = deferred<any>(); const bStatus = deferred<any>()
  const controller = createRagExperimentController({
    experimentSummary: (projectId) => projectId === 'A' ? Promise.resolve(summary) : bSummary.promise,
    ragIndexStatus: (projectId) => projectId === 'A' ? Promise.resolve(ready) : bStatus.promise,
    syncRagIndex: async () => ({ indexedChunks: 0 }),
  })

  await controller.loadSelectedProject('A')
  const loadB = controller.loadSelectedProject('B')

  expect(controller.state.summary).toBeNull()
  expect(controller.state.summaryLoading).toBe(true)

  bSummary.resolve(summary); bStatus.resolve(ready); await loadB
})

it('keeps the newer A selection state when delayed A1 status and summary responses resolve', async () => {
  const a1Summary = deferred<any>(); const a1Status = deferred<any>()
  const bSummary = deferred<any>(); const bStatus = deferred<any>()
  const a2Summary = deferred<any>(); const a2Status = deferred<any>()
  const summaries = [a1Summary, bSummary, a2Summary]
  const statuses = [a1Status, bStatus, a2Status]
  const controller = createRagExperimentController({
    experimentSummary: () => summaries.shift()!.promise,
    ragIndexStatus: () => statuses.shift()!.promise,
    syncRagIndex: async () => ({ indexedChunks: 0 }),
  })

  const runA1 = controller.loadSelectedProject('A')
  const runB = controller.loadSelectedProject('B')
  const runA2 = controller.loadSelectedProject('A')
  a1Summary.resolve({ stale: 'A1' }); a1Status.resolve({ configured: false, ready: false, eligibleVersionCount: 0 })
  await Promise.resolve()

  expect(controller.state.status).toBeNull()
  expect(controller.state.statusLoading).toBe(true)
  expect(controller.state.summary).toBeNull()
  expect(controller.isReady()).toBe(false)

  a2Summary.resolve(summary); a2Status.resolve(ready)
  await runA2
  expect(controller.state.status).toEqual(ready)
  expect(controller.state.summary).toEqual(summary)
  expect(controller.state.statusLoading).toBe(false)

  bSummary.resolve(summary); bStatus.resolve(ready)
  await Promise.all([runA1, runB])
})

it('keeps the newer A2 summary loading while a delayed A1 summary resolves', async () => {
  const a1Summary = deferred<any>(); const a1Status = deferred<any>()
  const bSummary = deferred<any>(); const bStatus = deferred<any>()
  const a2Summary = deferred<any>(); const a2Status = deferred<any>()
  const summaries = [a1Summary, bSummary, a2Summary]
  const statuses = [a1Status, bStatus, a2Status]
  const controller = createRagExperimentController({
    experimentSummary: () => summaries.shift()!.promise,
    ragIndexStatus: () => statuses.shift()!.promise,
    syncRagIndex: async () => ({ indexedChunks: 0 }),
  })

  const runA1 = controller.loadSelectedProject('A')
  const runB = controller.loadSelectedProject('B')
  const runA2 = controller.loadSelectedProject('A')
  a1Summary.resolve({ stale: 'A1' }); a1Status.resolve(ready)
  await Promise.resolve()

  expect(controller.state.summaryLoading).toBe(true)
  expect(controller.state.summary).toBeNull()

  a2Summary.resolve(summary); a2Status.resolve(ready); await runA2
  bSummary.resolve(summary); bStatus.resolve(ready); await Promise.all([runA1, runB])
})

it('keeps the newer A2 notice and summary loading while a delayed A1 summary rejects', async () => {
  const a1Summary = deferred<any>(); const a1Status = deferred<any>()
  const bSummary = deferred<any>(); const bStatus = deferred<any>()
  const a2Summary = deferred<any>(); const a2Status = deferred<any>()
  const summaries = [a1Summary, bSummary, a2Summary]
  const statuses = [a1Status, bStatus, a2Status]
  const controller = createRagExperimentController({
    experimentSummary: () => summaries.shift()!.promise,
    ragIndexStatus: () => statuses.shift()!.promise,
    syncRagIndex: async () => ({ indexedChunks: 0 }),
  })

  const runA1 = controller.loadSelectedProject('A')
  const runB = controller.loadSelectedProject('B')
  const runA2 = controller.loadSelectedProject('A')
  controller.state.notice = 'A2 status is retained'
  a1Summary.reject(new Error('A1 summary failed')); a1Status.resolve(ready)
  await Promise.resolve()

  expect(controller.state.summaryLoading).toBe(true)
  expect(controller.state.notice).toBe('A2 status is retained')

  a2Summary.resolve(summary); a2Status.resolve(ready); await runA2
  bSummary.resolve(summary); bStatus.resolve(ready); await Promise.all([runA1, runB])
})

it('does not let delayed A1 sync update notice, loading, or trigger a status reload after A-to-B-to-A', async () => {
  const a1Summary = deferred<any>(); const a1Status = deferred<any>()
  const bSummary = deferred<any>(); const bStatus = deferred<any>()
  const a2Summary = deferred<any>(); const a2Status = deferred<any>()
  const a1Sync = deferred<{ indexedChunks: number }>()
  const statusCalls: string[] = []
  const summaries = [a1Summary, bSummary, a2Summary]
  const statuses = [a1Status, bStatus, a2Status]
  const controller = createRagExperimentController({
    experimentSummary: () => summaries.shift()!.promise,
    ragIndexStatus: (projectId) => { statusCalls.push(projectId); return statuses.shift()!.promise },
    syncRagIndex: () => a1Sync.promise,
  })

  const runA1 = controller.loadSelectedProject('A')
  a1Summary.resolve(summary); a1Status.resolve(ready); await runA1
  const syncA1 = controller.sync()
  expect(controller.state.syncing).toBe(true)
  const runB = controller.loadSelectedProject('B')
  const runA2 = controller.loadSelectedProject('A')
  a1Sync.resolve({ indexedChunks: 99 })
  await Promise.resolve()

  expect(controller.state.notice).toBe('')
  expect(controller.state.syncing).toBe(false)
  expect(statusCalls).toEqual(['A', 'B', 'A'])

  a2Summary.resolve(summary); a2Status.resolve(ready); await runA2
  bSummary.resolve(summary); bStatus.resolve(ready); await runB
  await syncA1
})
