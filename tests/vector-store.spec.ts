import { expect, it, vi } from 'vitest'
import { QdrantVectorStore, type VectorPoint } from '../src/server/vector-store'

const vector = Array.from({ length: 2560 }, (_, index) => index / 2560)
const point: VectorPoint = {
  id: 'chunk-1',
  vector,
  payload: {
    projectId: 'project-1',
    meetingId: 'meeting-1',
    versionId: 'version-1',
    chunkIndex: 0,
    contentHash: 'hash-1',
    text: '[PHONE] project status',
  },
}

function response(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: vi.fn().mockResolvedValue(body) } as unknown as Response
}

it('creates the Qdrant cosine collection once when absent', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(response({}, 404))
    .mockResolvedValueOnce(response({ result: true }, 200))
  vi.stubGlobal('fetch', fetchMock)
  const store = new QdrantVectorStore({ url: 'http://127.0.0.1:6333' })

  await store.ensureCollection()
  await store.ensureCollection()

  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:6333/collections/meeting_rag_chunks', { method: 'GET' })
  expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://127.0.0.1:6333/collections/meeting_rag_chunks', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vectors: { size: 2560, distance: 'Cosine' } }),
  })
})

it('upserts typed vector points and searches project history while excluding the current version', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(response({ result: { status: 'ok' } }))
    .mockResolvedValueOnce(response({ result: [
      { score: 0.9, payload: point.payload },
    ] }))
  vi.stubGlobal('fetch', fetchMock)
  const store = new QdrantVectorStore({ url: 'http://127.0.0.1:6333' })

  await store.upsert([point])
  await expect(store.search(vector, { projectId: 'project-1', excludedVersionId: 'version-current', limit: 5 })).resolves.toEqual([
    { meetingId: 'meeting-1', versionId: 'version-1', chunkIndex: 0, score: 0.9, text: '[PHONE] project status' },
  ])

  expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:6333/collections/meeting_rag_chunks/points?wait=true', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: [point] }),
  })
  expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://127.0.0.1:6333/collections/meeting_rag_chunks/points/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vector,
      limit: 5,
      with_payload: true,
      filter: {
        must: [{ key: 'projectId', match: { value: 'project-1' } }],
        must_not: [{ key: 'versionId', match: { value: 'version-current' } }],
      },
    }),
  })
})

it('rejects malformed Qdrant data without exposing its raw response body', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ result: [{ score: 'invalid' }], error: 'qdrant private body' })))
  const store = new QdrantVectorStore({ url: 'http://127.0.0.1:6333' })

  await expect(store.search(vector, { projectId: 'project-1', excludedVersionId: 'version-current', limit: 5 })).rejects.toMatchObject({
    message: 'Vector store is unavailable',
  })
  await expect(store.search(vector, { projectId: 'project-1', excludedVersionId: 'version-current', limit: 5 })).rejects.not.toThrow(/qdrant private body/)
})
