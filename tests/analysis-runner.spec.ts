import { afterEach, expect, it, vi } from 'vitest'
import { AnalysisRunner } from '../src/server/analysis-runner'
import { DeepSeekService, type MeetingAnalysis } from '../src/server/deepseek.service'
import { SiliconFlowEmbeddingProvider } from '../src/server/embedding-provider'
import { RagIndexService } from '../src/server/rag-index.service'
import type { VectorPoint, VectorSearchResult, VectorStore } from '../src/server/vector-store'

afterEach(() => vi.unstubAllGlobals())

const providerResult: MeetingAnalysis = {
  summary: 'Provider summary',
  decisions: ['Approve launch'],
  tasks: [{ title: 'Prepare launch', priority: 'high' }],
  risks: [{ title: 'Timeline', level: 'medium' }],
}

function createProvider() {
  return {
    analyzeWithPlan: vi.fn().mockResolvedValue(providerResult),
    analyzeWithContext: vi.fn().mockResolvedValue(providerResult),
    plan: vi.fn().mockResolvedValue('Inspect actions and risks'),
  }
}

const ragInput = {
  mode: 'rag' as const,
  title: 'Standup',
  projectId: 'project-1',
  meetingId: 'meeting-1',
  versionId: 'version-1',
  desensitizedContent: '[PHONE]',
}

class CountingVectorStore implements VectorStore {
  ensured = 0
  upserted = 0
  searched = 0
  isConfigured() { return true }
  async ensureCollection() { this.ensured += 1 }
  async upsert(_points: VectorPoint[]) { this.upserted += 1 }
  async removeMeetingVersions(_query: { projectId: string; meetingId: string; retainedVersionId: string }) {}
  async search(_vector: number[], _query: { projectId: string; excludedVersionId: string; limit: number }): Promise<VectorSearchResult[]> {
    this.searched += 1
    return []
  }
  async health() { return true }
}

it('returns a manual-review draft without calling the provider', async () => {
  const provider = createProvider()
  const runner = new AnalysisRunner(provider)

  const execution = await runner.run({ mode: 'manual', title: 'Standup', desensitizedContent: '[PHONE]' })

  expect(execution).toEqual({
    result: { summary: 'Manual review required', decisions: [], tasks: [], risks: [] },
    metadata: {
      mode: 'manual',
      model: null,
      modelCallCount: 0,
      retrievalEnabled: false,
      retrievalStatus: 'not_applicable',
    },
  })
  expect(provider.analyzeWithPlan).not.toHaveBeenCalled()
  expect(provider.plan).not.toHaveBeenCalled()
})

it('runs one structured extraction for LLM mode', async () => {
  const provider = createProvider()
  const runner = new AnalysisRunner(provider)

  const execution = await runner.run({ mode: 'llm', title: 'Standup', desensitizedContent: '[PHONE]' })

  expect(execution.result).toEqual(providerResult)
  expect(execution.metadata).toEqual({
    mode: 'llm',
    model: 'deepseek-chat',
    modelCallCount: 1,
    retrievalEnabled: false,
    retrievalStatus: 'not_applicable',
  })
  expect(provider.analyzeWithPlan).toHaveBeenCalledOnce()
  expect(provider.analyzeWithPlan).toHaveBeenCalledWith('Standup', '[PHONE]', undefined)
  expect(provider.plan).not.toHaveBeenCalled()
})

it('runs one structured extraction and reports unavailable retrieval for RAG mode', async () => {
  const provider = createProvider()
  const rag = { isConfigured: vi.fn().mockReturnValue(false), retrieve: vi.fn() }
  const runner = new AnalysisRunner(provider, rag as any)

  const execution = await runner.run(ragInput)

  expect(execution.result).toEqual(providerResult)
  expect(execution.metadata).toEqual({
    mode: 'rag',
    model: 'deepseek-chat',
    modelCallCount: 1,
    retrievalEnabled: false,
    retrievalStatus: 'not_configured',
  })
  expect(provider.analyzeWithPlan).toHaveBeenCalledOnce()
  expect(provider.analyzeWithPlan).toHaveBeenCalledWith('Standup', '[PHONE]', undefined)
  expect(provider.plan).not.toHaveBeenCalled()
  expect(provider.analyzeWithContext).not.toHaveBeenCalled()
  expect(rag.retrieve).not.toHaveBeenCalled()
})

it('keeps RAG as the one-call not-configured baseline when EMBEDDING_MODEL is absent', async () => {
  const prior = {
    apiKey: process.env.SILICONFLOW_API_KEY,
    baseUrl: process.env.SILICONFLOW_BASE_URL,
    model: process.env.EMBEDDING_MODEL,
    qdrantUrl: process.env.QDRANT_URL,
  }
  process.env.SILICONFLOW_API_KEY = 'test-key'
  process.env.SILICONFLOW_BASE_URL = 'https://example.test/v1'
  process.env.QDRANT_URL = 'http://127.0.0.1:6333'
  delete process.env.EMBEDDING_MODEL
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)

  try {
    const provider = createProvider()
    const store = new CountingVectorStore()
    const rag = new RagIndexService(new SiliconFlowEmbeddingProvider(), store)
    const execution = await new AnalysisRunner(provider, rag).run(ragInput)

    expect(rag.isConfigured()).toBe(false)
    expect(execution.metadata).toMatchObject({ mode: 'rag', modelCallCount: 1, retrievalEnabled: false, retrievalStatus: 'not_configured' })
    expect(provider.analyzeWithPlan).toHaveBeenCalledOnce()
    expect(provider.analyzeWithContext).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(store).toMatchObject({ ensured: 0, upserted: 0, searched: 0 })
  } finally {
    if (prior.apiKey === undefined) delete process.env.SILICONFLOW_API_KEY
    else process.env.SILICONFLOW_API_KEY = prior.apiKey
    if (prior.baseUrl === undefined) delete process.env.SILICONFLOW_BASE_URL
    else process.env.SILICONFLOW_BASE_URL = prior.baseUrl
    if (prior.model === undefined) delete process.env.EMBEDDING_MODEL
    else process.env.EMBEDDING_MODEL = prior.model
    if (prior.qdrantUrl === undefined) delete process.env.QDRANT_URL
    else process.env.QDRANT_URL = prior.qdrantUrl
  }
})

it('retrieves project evidence and performs one contextual extraction for configured RAG', async () => {
  const provider = createProvider()
  const rag = {
    isConfigured: vi.fn().mockReturnValue(true),
    retrieve: vi.fn().mockResolvedValue({
      durationMs: 37,
      evidence: [
        { meetingId: 'meeting-history-1', versionId: 'version-history-1', chunkIndex: 2, score: 0.91, text: '[EMAIL] release decision' },
        { meetingId: 'meeting-history-2', versionId: 'version-history-2', chunkIndex: 0, score: 0.84, text: '[PHONE] schedule risk' },
      ],
    }),
  }
  const runner = new AnalysisRunner(provider, rag as any)

  const execution = await runner.run(ragInput)

  expect(rag.retrieve).toHaveBeenCalledWith({
    projectId: 'project-1',
    meetingId: 'meeting-1',
    versionId: 'version-1',
    desensitizedContent: '[PHONE]',
  })
  expect(provider.analyzeWithContext).toHaveBeenCalledOnce()
  expect(provider.analyzeWithContext).toHaveBeenCalledWith('Standup', '[PHONE]', expect.stringMatching(/Source 1[\s\S]*Source 2/))
  expect(provider.analyzeWithPlan).not.toHaveBeenCalled()
  expect(execution).toEqual({
    result: providerResult,
    metadata: {
      mode: 'rag',
      model: 'deepseek-chat',
      modelCallCount: 1,
      retrievalEnabled: true,
      retrievalStatus: 'completed',
      retrievalDurationMs: 37,
      retrievalHitCount: 2,
      retrievalSources: [
        { meetingId: 'meeting-history-1', versionId: 'version-history-1', chunkIndex: 2, score: 0.91 },
        { meetingId: 'meeting-history-2', versionId: 'version-history-2', chunkIndex: 0, score: 0.84 },
      ],
    },
  })
  expect(JSON.stringify(execution.metadata)).not.toContain('release decision')
  expect(JSON.stringify(execution.metadata)).not.toContain('schedule risk')
})

it('fails configured RAG safely before DeepSeek extraction when retrieval fails', async () => {
  const provider = createProvider()
  const rag = {
    isConfigured: vi.fn().mockReturnValue(true),
    retrieve: vi.fn().mockRejectedValue(new Error('qdrant private response and secret-key')),
  }
  const runner = new AnalysisRunner(provider, rag as any)

  await expect(runner.run(ragInput)).rejects.toMatchObject({
    message: 'RAG retrieval failed',
    metadata: {
      mode: 'rag',
      modelCallCount: 0,
      retrievalEnabled: true,
      retrievalStatus: 'failed',
    },
  })
  expect(provider.analyzeWithContext).not.toHaveBeenCalled()
  expect(provider.analyzeWithPlan).not.toHaveBeenCalled()
})

it('labels and bounds retrieved evidence separately from an agent plan', async () => {
  const previousKey = process.env.DEEPSEEK_API_KEY
  process.env.DEEPSEEK_API_KEY = 'test-key'
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(providerResult) } }] }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)

  try {
    await new DeepSeekService().analyzeWithContext('Standup', '[PHONE]', `Source 1:\n${'x'.repeat(9000)}`)
  } finally {
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY = previousKey
  }

  const request = fetchMock.mock.calls[0][1] as RequestInit
  const body = JSON.parse(String(request.body))
  const userMessage = body.messages.find((message: any) => message.role === 'user').content as string
  expect(userMessage).toContain('\nEvidence:\nSource 1:')
  expect(userMessage).not.toContain('\nPlan:\nRetrieved evidence:')
  expect(userMessage).not.toContain('x'.repeat(8001))
})

it('plans then extracts for agent mode', async () => {
  const provider = createProvider()
  const runner = new AnalysisRunner(provider)

  const execution = await runner.run({ mode: 'agent', title: 'Standup', desensitizedContent: '[PHONE]' })

  expect(execution.result).toEqual(providerResult)
  expect(execution.metadata).toEqual({
    mode: 'agent',
    model: 'deepseek-chat',
    modelCallCount: 2,
    retrievalEnabled: false,
    retrievalStatus: 'not_applicable',
    plan: 'Inspect actions and risks',
  })
  expect(provider.plan).toHaveBeenCalledOnce()
  expect(provider.plan).toHaveBeenCalledWith('Standup', '[PHONE]')
  expect(provider.analyzeWithPlan).toHaveBeenCalledOnce()
  expect(provider.analyzeWithPlan).toHaveBeenCalledWith('Standup', '[PHONE]', 'Inspect actions and risks')
})

it('reports both attempted calls when agent extraction fails after planning', async () => {
  const provider = createProvider()
  provider.analyzeWithPlan.mockRejectedValueOnce(new Error('Extraction failed'))
  const runner = new AnalysisRunner(provider)

  await expect(runner.run({ mode: 'agent', title: 'Standup', desensitizedContent: '[PHONE]' })).rejects.toMatchObject({
    metadata: { mode: 'agent', modelCallCount: 2, retrievalStatus: 'not_applicable' },
  })
})
