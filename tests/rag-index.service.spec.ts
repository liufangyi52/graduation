import { expect, it } from 'vitest'
import {
  RagIndexService,
  chunkDesensitizedContent,
  ragPointId,
  type RagVersion,
} from '../src/server/rag-index.service'
import type { EmbeddingProvider } from '../src/server/embedding-provider'
import type { VectorPoint, VectorSearchResult, VectorStore } from '../src/server/vector-store'

const vector = Array.from({ length: 2560 }, (_, index) => index / 2560)
const originalPhoneNumber = '13800138000'
const version: RagVersion = {
  projectId: 'project-1',
  meetingId: 'meeting-1',
  versionId: 'version-1',
  desensitizedContent: '[PHONE] release review and acceptance criteria',
}

class FakeEmbedder implements EmbeddingProvider {
  calls: string[][] = []
  constructor(private readonly configured = true) {}
  isConfigured(): boolean { return this.configured }
  async embed(texts: string[]): Promise<number[][]> {
    this.calls.push(texts)
    return texts.map(() => vector)
  }
}

class FakeVectorStore implements VectorStore {
  ensured = 0
  upserted: VectorPoint[][] = []
  removed: Array<{ projectId: string; meetingId: string; retainedVersionId: string }> = []
  stored: VectorPoint[] = []
  queries: { vector: number[]; query: { projectId: string; excludedVersionId: string; limit: number } }[] = []
  constructor(private readonly configured = true, private readonly results: VectorSearchResult[] = []) {}
  isConfigured(): boolean { return this.configured }
  async ensureCollection(): Promise<void> { this.ensured += 1 }
  async upsert(points: VectorPoint[]): Promise<void> { this.upserted.push(points); this.stored.push(...points) }
  async removeMeetingVersions(query: { projectId: string; meetingId: string; retainedVersionId: string }): Promise<void> {
    this.removed.push(query)
    this.stored = this.stored.filter((point) => point.payload.projectId !== query.projectId || point.payload.meetingId !== query.meetingId || point.payload.versionId === query.retainedVersionId)
  }
  async search(queryVector: number[], query: { projectId: string; excludedVersionId: string; limit: number }): Promise<VectorSearchResult[]> {
    this.queries.push({ vector: queryVector, query })
    return this.results
  }
  async health(): Promise<boolean> { return this.configured }
}

it('chunks a 2400-character desensitized literal at offsets 0, 1000, and 2000', () => {
  const content = 'x'.repeat(2400)

  expect(chunkDesensitizedContent(content)).toEqual([
    content.slice(0, 1200),
    content.slice(1000, 2200),
    content.slice(2000, 2400),
  ])
})

it('writes the new meeting version before removing only that meeting\'s older versions', async () => {
  const events: string[] = []
  const store = new FakeVectorStore()
  store.upsert = async (points) => { events.push(`upsert:${points[0].payload.versionId}`); store.upserted.push(points) }
  store.removeMeetingVersions = async (query) => { events.push(`remove:${query.meetingId}:${query.retainedVersionId}`); store.removed.push(query) }
  const service = new RagIndexService(new FakeEmbedder(), store)

  await service.syncVersion({ ...version, versionId: 'version-2', desensitizedContent: '[PHONE] revised release review' })

  expect(events).toEqual(['upsert:version-2', 'remove:meeting-1:version-2'])
  expect(store.removed).toEqual([{ projectId: 'project-1', meetingId: 'meeting-1', retainedVersionId: 'version-2' }])
})

it('keeps prior meeting vectors when upserting a newer version fails', async () => {
  const store = new FakeVectorStore()
  store.upsert = async () => { throw new Error('Qdrant unavailable') }
  const service = new RagIndexService(new FakeEmbedder(), store)

  await expect(service.syncVersion({ ...version, versionId: 'version-2' })).rejects.toThrow('Qdrant unavailable')

  expect(store.removed).toEqual([])
})

it('replaces v1 points with v2 points without deleting other meetings or projects', async () => {
  const store = new FakeVectorStore()
  const service = new RagIndexService(new FakeEmbedder(), store)
  await service.syncVersion({ ...version, versionId: 'version-1', desensitizedContent: '[PHONE] v1' })
  await service.syncVersion({ ...version, versionId: 'version-2', desensitizedContent: '[PHONE] v2' })
  store.stored.push({ id: 'other', vector, payload: { projectId: 'project-1', meetingId: 'meeting-2', versionId: 'version-1', chunkIndex: 0, contentHash: 'other', text: '[PHONE] other' } })

  await service.syncVersion({ ...version, versionId: 'version-3', desensitizedContent: '[PHONE] v3' })

  expect(store.stored.map((point) => [point.payload.projectId, point.payload.meetingId, point.payload.versionId])).toEqual([
    ['project-1', 'meeting-2', 'version-1'],
    ['project-1', 'meeting-1', 'version-3'],
  ])
})

it('removes prior points when the current meeting version has no desensitized content', async () => {
  const store = new FakeVectorStore()
  const service = new RagIndexService(new FakeEmbedder(), store)
  await service.syncVersion({ ...version, versionId: 'version-1', desensitizedContent: '[PHONE] previous' })

  await service.syncVersion({ ...version, versionId: 'version-2', desensitizedContent: '   ' })

  expect(store.stored).toEqual([])
  expect(store.removed.at(-1)).toEqual({ projectId: 'project-1', meetingId: 'meeting-1', retainedVersionId: 'version-2' })
})

it('drops whitespace-only desensitized content', () => {
  expect(chunkDesensitizedContent(' \n\t ')).toEqual([])
})

it('derives a deterministic SHA-256 point ID from version identity and desensitized text', () => {
  const first = ragPointId(version, 0, '[PHONE] release review')

  expect(first).toMatch(/^[0-9a-f]{64}$/)
  expect(ragPointId(version, 0, '[PHONE] release review')).toBe(first)
  expect(ragPointId({ ...version, versionId: 'version-2' }, 0, '[PHONE] release review')).not.toBe(first)
})

it('indexes only desensitized chunks with the documented Qdrant payload fields', async () => {
  const embedder = new FakeEmbedder()
  const store = new FakeVectorStore()
  const service = new RagIndexService(embedder, store)
  const input = { ...version, desensitizedContent: `${version.desensitizedContent}\n${originalPhoneNumber}`.replace(originalPhoneNumber, '[PHONE]') }

  await expect(service.syncVersion(input)).resolves.toEqual({ indexedChunks: 1 })

  expect(embedder.calls).toEqual([[input.desensitizedContent]])
  expect(store.ensured).toBe(1)
  expect(store.upserted).toHaveLength(1)
  const [point] = store.upserted[0]
  expect(Object.keys(point.payload).sort()).toEqual(['chunkIndex', 'contentHash', 'meetingId', 'projectId', 'text', 'versionId'])
  expect(point.payload).toMatchObject({ projectId: 'project-1', meetingId: 'meeting-1', versionId: 'version-1', chunkIndex: 0, text: input.desensitizedContent })
  expect(JSON.stringify({ embeddings: embedder.calls, points: store.upserted })).not.toContain(originalPhoneNumber)
})

it('synchronizes then retrieves up to five project-scoped historical chunks', async () => {
  const results: VectorSearchResult[] = Array.from({ length: 6 }, (_, chunkIndex) => ({
    meetingId: `meeting-history-${chunkIndex}`,
    versionId: `version-history-${chunkIndex}`,
    chunkIndex,
    score: 0.9 - chunkIndex / 100,
    text: `[PHONE] historical chunk ${chunkIndex}`,
  }))
  const embedder = new FakeEmbedder()
  const store = new FakeVectorStore(true, results)
  const service = new RagIndexService(embedder, store)

  const retrieved = await service.retrieve(version)

  expect(store.upserted).toHaveLength(1)
  expect(store.queries).toHaveLength(1)
  expect(store.queries[0].query).toEqual({ projectId: 'project-1', excludedVersionId: 'version-1', limit: 5 })
  expect(retrieved.evidence).toEqual(results.slice(0, 5))
  expect(retrieved.durationMs).toBeGreaterThanOrEqual(0)
})

it('does not access adapters while RAG dependencies are not configured', async () => {
  const embedder = new FakeEmbedder(false)
  const store = new FakeVectorStore(false)
  const service = new RagIndexService(embedder, store)

  expect(service.isConfigured()).toBe(false)
  await expect(service.syncVersion(version)).resolves.toEqual({ indexedChunks: 0 })
  await expect(service.retrieve(version)).resolves.toEqual({ evidence: [], durationMs: 0 })
  expect(embedder.calls).toEqual([])
  expect(store.ensured).toBe(0)
  expect(store.upserted).toEqual([])
  expect(store.queries).toEqual([])
})
