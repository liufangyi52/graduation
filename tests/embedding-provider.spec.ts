import { afterEach, expect, it, vi } from 'vitest'
import { SiliconFlowEmbeddingProvider } from '../src/server/embedding-provider'

const apiKey = 'test-siliconflow-key'
const vector = Array.from({ length: 2560 }, (_, index) => index / 2560)

afterEach(() => vi.unstubAllEnvs())

function response(body: unknown, ok = true): Response {
  return { ok, json: vi.fn().mockResolvedValue(body) } as unknown as Response
}

it('embeds texts through SiliconFlow using the configured model and preserves response order', async () => {
  const fetchMock = vi.fn().mockResolvedValue(response({
    data: [{ embedding: vector }, { embedding: vector.map((value) => value + 1) }],
  }))
  vi.stubGlobal('fetch', fetchMock)
  const provider = new SiliconFlowEmbeddingProvider({ apiKey, model: 'Qwen/Qwen3-Embedding-4B' })

  await expect(provider.embed(['alpha', 'beta'])).resolves.toEqual([
    vector,
    vector.map((value) => value + 1),
  ])
  expect(fetchMock).toHaveBeenCalledWith('https://api.siliconflow.cn/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'Qwen/Qwen3-Embedding-4B', input: ['alpha', 'beta'], encoding_format: 'float' }),
  })
})

it('requires an explicit non-empty embedding model before reporting configured', () => {
  vi.stubEnv('EMBEDDING_MODEL', '')

  expect(new SiliconFlowEmbeddingProvider({ apiKey }).isConfigured()).toBe(false)
  expect(new SiliconFlowEmbeddingProvider({ apiKey, model: '   ' }).isConfigured()).toBe(false)
  expect(new SiliconFlowEmbeddingProvider({ apiKey, model: 'Qwen/Qwen3-Embedding-4B' }).isConfigured()).toBe(true)
})

it('rejects an embedding response with a wrong vector count without exposing provider data or credentials', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ data: [{ embedding: vector }], error: { message: 'provider secret body' } })))
  const provider = new SiliconFlowEmbeddingProvider({ apiKey })

  await expect(provider.embed(['alpha', 'beta'])).rejects.toMatchObject({
    message: 'Embedding service is unavailable',
  })
  await expect(provider.embed(['alpha', 'beta'])).rejects.not.toThrow(/provider secret body|test-siliconflow-key/)
})

it('rejects embeddings with an invalid dimension without exposing provider data or credentials', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
    data: [{ embedding: Array.from({ length: 2559 }, () => 0) }],
    error: { message: 'provider secret body' },
  })))
  const provider = new SiliconFlowEmbeddingProvider({ apiKey })

  await expect(provider.embed(['alpha'])).rejects.toMatchObject({ message: 'Embedding service is unavailable' })
  await expect(provider.embed(['alpha'])).rejects.not.toThrow(/provider secret body|test-siliconflow-key/)
})
