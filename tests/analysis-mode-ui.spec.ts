import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createMeetingService } from '../src/services/meetingService'

const appSource = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
const reviewSource = readFileSync(new URL('../src/components/MeetingReviewPage.vue', import.meta.url), 'utf8')

afterEach(() => vi.restoreAllMocks())

it('sends the selected mode when starting or retrying an analysis', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'analysis-1' }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'analysis-2' }), { status: 200 }))
  const service = createMeetingService('token')

  await service.analyze('meeting-1', 'agent')
  await service.reanalyze('analysis-1', 'rag')

  expect(fetchMock.mock.calls[0][0]).toContain('/meetings/meeting-1/analyze')
  expect((fetchMock.mock.calls[0][1] as RequestInit).body).toBe(JSON.stringify({ mode: 'agent' }))
  expect(fetchMock.mock.calls[1][0]).toContain('/analyses/analysis-1/reanalyze')
  expect((fetchMock.mock.calls[1][1] as RequestInit).body).toBe(JSON.stringify({ mode: 'rag' }))
})

it('maps recorded analysis execution fields with an llm default', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([{
    id: 'analysis-1', meeting_id: 'meeting-1', title: 'Standup', status: 'pending', result: {}, created_at: '2026-08-14',
    execution_metadata: { retrievalStatus: 'not_configured' }, duration_ms: 17, model_call_count: 2,
  }]), { status: 200 }))
  const service = createMeetingService('token')

  await service.load()

  expect(service.state.analyses[0]).toMatchObject({
    mode: 'llm', executionMetadata: { retrievalStatus: 'not_configured' }, durationMs: 17, modelCallCount: 2,
  })
})

it('offers all modes at submission and retry, and limits the RAG warning to recorded metadata', () => {
  for (const mode of ['manual', 'llm', 'rag', 'agent']) {
    expect(appSource).toContain(`value="${mode}"`)
    expect(reviewSource).toContain(`value="${mode}"`)
  }
  expect(appSource).toContain('v-model="meetingAnalysisMode"')
  expect(reviewSource).toContain('v-model="reanalysisMode"')
  expect(reviewSource).toContain('检索未配置')
  expect(reviewSource).toContain("retrievalStatus === 'not_configured'")
  expect(reviewSource).not.toContain("analysis.mode === 'rag'")
})

it('keeps approval controls pending-only', () => {
  expect(appSource).toContain("analysis.status === 'pending'")
  expect(reviewSource).toContain("detail.analysis.status === 'rejected'")
})
