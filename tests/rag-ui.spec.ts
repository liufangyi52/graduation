import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createMeetingService } from '../src/services/meetingService'

const appSource = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
const reviewSource = readFileSync(new URL('../src/components/MeetingReviewPage.vue', import.meta.url), 'utf8')

afterEach(() => vi.restoreAllMocks())

it('sends a manager RAG index sync request with the session token', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ indexedChunks: 3 }), { status: 200 }))

  await createMeetingService('token').syncRagIndex('project-1')

  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/projects/project-1/rag-index/sync'),
    expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer token' }) }),
  )
})

it('requests the project-scoped RAG readiness status with the session token', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ configured: false, ready: false, eligibleVersionCount: 0 }), { status: 200 }))

  await createMeetingService('token').ragIndexStatus('project-1')

  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/projects/project-1/rag-index/status'),
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token' }) }),
  )
})

it('keeps index controls manager-scoped in the existing experiments view', () => {
  expect(appSource).toContain("currentPage === 'experiments' && canManageBusiness")
  expect(appSource).toContain('syncRagIndex')
  expect(appSource).toContain('ragIndexStatus')
  expect(appSource).toContain('ragIndexReady')
  expect(appSource).toContain('@click="syncRagIndex"')
})

it('clears stale RAG status during project changes and blocks sync until readiness is confirmed', () => {
  expect(appSource).toContain('async function loadRagIndexStatus(projectId: string)')
  expect(appSource).toContain('ragIndexStatus.value = null')
  expect(appSource).toContain('ragIndexStatusLoading.value = true')
  expect(appSource).toContain('if (experimentProjectId.value !== projectId) return')
  expect(appSource).toContain('!ragIndexStatusLoading.value && ragIndexStatus.value?.configured')
  expect(appSource).toContain(':disabled="ragIndexSyncing || !ragIndexReady"')
})

it('renders loading and unknown RAG status separately from an unconfigured baseline', () => {
  expect(appSource).toContain('v-if="ragIndexStatusLoading"')
  expect(appSource).toContain('v-else-if="!ragIndexStatus"')
  expect(appSource).toContain('无法确认 RAG 索引状态')
  expect(appSource).toContain('v-else-if="!ragIndexStatus.configured"')
})

it('renders only safe retrieval source identifiers', () => {
  expect(reviewSource).toContain('v-for="source in detail.analysis.executionMetadata?.retrievalSources')
  expect(reviewSource).toContain('source.meetingId')
  expect(reviewSource).toContain('source.versionId')
  expect(reviewSource).toContain('source.chunkIndex')
  expect(reviewSource).toContain('source.score')
  expect(reviewSource).not.toContain('source.text')
})

it('preserves only whitelisted completed retrieval metadata returned by the API', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([{
    id: 'analysis-1', meeting_id: 'meeting-1', status: 'pending', mode: 'rag', execution_metadata: {
      retrievalStatus: 'completed', retrievalDurationMs: 12, retrievalHitCount: 1,
      retrievalSources: [{ meetingId: 'm-1', versionId: 'v-1', chunkIndex: 2, score: 0.91 }],
      text: 'desensitized chunk must not reach the UI', prompt: 'do not expose', rawError: 'do not expose', unknown: 'do not expose',
    },
  }]), { status: 200 }))

  const service = createMeetingService('token')
  await service.load()

  expect(service.state.analyses[0].executionMetadata).toMatchObject({
    retrievalStatus: 'completed', retrievalDurationMs: 12, retrievalHitCount: 1,
    retrievalSources: [{ meetingId: 'm-1', versionId: 'v-1', chunkIndex: 2, score: 0.91 }],
  })
  expect(service.state.analyses[0].executionMetadata).not.toHaveProperty('text')
  expect(service.state.analyses[0].executionMetadata).not.toHaveProperty('prompt')
  expect(service.state.analyses[0].executionMetadata).not.toHaveProperty('rawError')
  expect(service.state.analyses[0].executionMetadata).not.toHaveProperty('unknown')
})

it('removes unsafe fields from individual retrieval sources and bounds plans', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([{
    id: 'analysis-1', meeting_id: 'meeting-1', status: 'pending', execution_metadata: JSON.stringify({
      mode: 'agent', modelCallCount: 2, retrievalEnabled: true, retrievalStatus: 'completed', plan: 'p'.repeat(2100),
      retrievalSources: [{ meetingId: 'm-1', versionId: 'v-1', chunkIndex: 2, score: 0.91, text: 'hidden', prompt: 'hidden' }],
    }),
  }]), { status: 200 }))

  const service = createMeetingService('token')
  await service.load()

  const metadata = service.state.analyses[0].executionMetadata!
  expect(metadata).toMatchObject({ mode: 'agent', modelCallCount: 2, retrievalEnabled: true, retrievalStatus: 'completed' })
  expect(metadata.plan).toHaveLength(2000)
  expect(metadata.retrievalSources).toEqual([{ meetingId: 'm-1', versionId: 'v-1', chunkIndex: 2, score: 0.91 }])
})
