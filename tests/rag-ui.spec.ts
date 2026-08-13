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

it('keeps index controls manager-scoped in the existing experiments view', () => {
  expect(appSource).toContain("currentPage === 'experiments' && canManageBusiness")
  expect(appSource).toContain('syncRagIndex')
  expect(appSource).toContain('@click="syncRagIndex"')
})

it('renders only safe retrieval source identifiers', () => {
  expect(reviewSource).toContain('v-for="source in detail.analysis.executionMetadata?.retrievalSources')
  expect(reviewSource).toContain('source.meetingId')
  expect(reviewSource).toContain('source.versionId')
  expect(reviewSource).toContain('source.chunkIndex')
  expect(reviewSource).toContain('source.score')
  expect(reviewSource).not.toContain('source.text')
})

it('preserves completed retrieval metadata returned by the API', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([{
    id: 'analysis-1', meeting_id: 'meeting-1', status: 'pending', mode: 'rag', execution_metadata: {
      retrievalStatus: 'completed', retrievalDurationMs: 12, retrievalHitCount: 1,
      retrievalSources: [{ meetingId: 'm-1', versionId: 'v-1', chunkIndex: 2, score: 0.91 }],
    },
  }]), { status: 200 }))

  const service = createMeetingService('token')
  await service.load()

  expect(service.state.analyses[0].executionMetadata).toMatchObject({
    retrievalStatus: 'completed', retrievalDurationMs: 12, retrievalHitCount: 1,
    retrievalSources: [{ meetingId: 'm-1', versionId: 'v-1', chunkIndex: 2, score: 0.91 }],
  })
})
