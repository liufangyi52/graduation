import { expect, it, vi } from 'vitest'
import { QdrantVectorStore, type VectorPoint } from '../src/server/vector-store'

const vector = Array.from({ length: 2560 }, (_, index) => index / 2560)
const stableHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const point: VectorPoint = {
  id: stableHash,
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
    .mockResolvedValueOnce(response({ result: true }, 200))
  vi.stubGlobal('fetch', fetchMock)
  const store = new QdrantVectorStore({ url: 'http://127.0.0.1:6333' })

  await store.ensureCollection()
  await store.ensureCollection()

  expect(fetchMock).toHaveBeenCalledTimes(3)
  expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:6333/collections/meeting_rag_chunks', { method: 'GET' })
  expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://127.0.0.1:6333/collections/meeting_rag_chunks', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vectors: { size: 2560, distance: 'Cosine' } }),
  })
  expect(fetchMock).toHaveBeenNthCalledWith(3, 'http://127.0.0.1:6333/collections/meeting_rag_chunks/index', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ field_name: 'projectId', field_schema: 'keyword' }),
  })
})

it('creates the projectId payload index for an existing collection and deletes only older versions of one meeting', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(response({ result: true }, 200))
    .mockResolvedValueOnce(response({ result: true }, 200))
    .mockResolvedValueOnce(response({ result: true }, 200))
  vi.stubGlobal('fetch', fetchMock)
  const store = new QdrantVectorStore({ url: 'http://127.0.0.1:6333' })

  await store.ensureCollection()
  await store.removeMeetingVersions({ projectId: 'project-1', meetingId: 'meeting-1', retainedVersionId: 'version-2' })

  expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://127.0.0.1:6333/collections/meeting_rag_chunks/index', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ field_name: 'projectId', field_schema: 'keyword' }),
  })
  expect(fetchMock).toHaveBeenNthCalledWith(3, 'http://127.0.0.1:6333/collections/meeting_rag_chunks/points/delete?wait=true', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filter: { must: [{ key: 'projectId', match: { value: 'project-1' } }, { key: 'meetingId', match: { value: 'meeting-1' } }], must_not: [{ key: 'versionId', match: { value: 'version-2' } }] } }),
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
    body: JSON.stringify({ points: [{ ...point, id: '01234567-89ab-4def-8123-456789abcdef' }] }),
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

it('rejects an invalid point ID before making a Qdrant request', async () => {
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  const store = new QdrantVectorStore({ url: 'http://127.0.0.1:6333' })

  await expect(store.upsert([{ ...point, id: 'not-a-sha256-point-id' }])).rejects.toMatchObject({
    message: 'Vector store is unavailable',
  })
  await expect(store.upsert([{ ...point, id: 'not-a-sha256-point-id' }])).rejects.not.toThrow(/not-a-sha256-point-id/)
  expect(fetchMock).not.toHaveBeenCalled()
})

it('rejects malformed Qdrant data without exposing its raw response body', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ result: [{ score: 'invalid' }], error: 'qdrant private body' })))
  const store = new QdrantVectorStore({ url: 'http://127.0.0.1:6333' })

  await expect(store.search(vector, { projectId: 'project-1', excludedVersionId: 'version-current', limit: 5 })).rejects.toMatchObject({
    message: 'Vector store is unavailable',
  })
  await expect(store.search(vector, { projectId: 'project-1', excludedVersionId: 'version-current', limit: 5 })).rejects.not.toThrow(/qdrant private body/)
})
