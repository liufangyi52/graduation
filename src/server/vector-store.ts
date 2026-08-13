import 'dotenv/config'
import { Injectable, ServiceUnavailableException } from '@nestjs/common'

export type VectorPayload = {
  projectId: string
  meetingId: string
  versionId: string
  chunkIndex: number
  contentHash: string
  text: string
}

export type VectorPoint = { id: string; vector: number[]; payload: VectorPayload }
export type VectorSearchResult = { meetingId: string; versionId: string; chunkIndex: number; score: number; text: string }

export type VectorStore = {
  isConfigured(): boolean
  ensureCollection(): Promise<void>
  upsert(points: VectorPoint[]): Promise<void>
  search(vector: number[], query: { projectId: string; excludedVersionId: string; limit: number }): Promise<VectorSearchResult[]>
  health(): Promise<boolean>
}

type VectorStoreOptions = { url?: string }

const COLLECTION_NAME = 'meeting_rag_chunks'

@Injectable()
export class QdrantVectorStore implements VectorStore {
  private readonly url: string | undefined
  private collectionEnsured = false

  constructor(options: VectorStoreOptions = {}) {
    this.url = (options.url ?? process.env.QDRANT_URL)?.replace(/\/$/, '')
  }

  isConfigured(): boolean {
    return Boolean(this.url)
  }

  async ensureCollection(): Promise<void> {
    if (this.collectionEnsured) return
    const response = await this.request(`/collections/${COLLECTION_NAME}`, { method: 'GET' }, [200, 404])
    if (response.status === 404) {
      await this.request(`/collections/${COLLECTION_NAME}`, this.jsonRequest('PUT', {
        vectors: { size: 2560, distance: 'Cosine' },
      }))
    }
    this.collectionEnsured = true
  }

  async upsert(points: VectorPoint[]): Promise<void> {
    if (points.length === 0) return
    const qdrantPoints = points.map((point) => ({ ...point, id: this.qdrantPointId(point.id) }))
    await this.request(`/collections/${COLLECTION_NAME}/points?wait=true`, this.jsonRequest('PUT', { points: qdrantPoints }))
  }

  async search(vector: number[], query: { projectId: string; excludedVersionId: string; limit: number }): Promise<VectorSearchResult[]> {
    const response = await this.request(`/collections/${COLLECTION_NAME}/points/search`, this.jsonRequest('POST', {
      vector,
      limit: query.limit,
      with_payload: true,
      filter: {
        must: [{ key: 'projectId', match: { value: query.projectId } }],
        must_not: [{ key: 'versionId', match: { value: query.excludedVersionId } }],
      },
    }))
    const payload = await response.json().catch(() => undefined)
    if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { result?: unknown }).result)) throw this.unavailable()

    try {
      return (payload as { result: unknown[] }).result.map((item) => this.toSearchResult(item))
    } catch {
      throw this.unavailable()
    }
  }

  async health(): Promise<boolean> {
    if (!this.url) return false
    try {
      const response = await fetch(`${this.url}/healthz`, { method: 'GET' })
      return response.ok
    } catch {
      return false
    }
  }

  private async request(path: string, init: RequestInit, acceptedStatuses = [200]): Promise<Response> {
    if (!this.url) throw this.unavailable()
    try {
      const response = await fetch(`${this.url}${path}`, init)
      if (!acceptedStatuses.includes(response.status)) throw this.unavailable()
      return response
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error
      throw this.unavailable()
    }
  }

  private jsonRequest(method: 'POST' | 'PUT', body: unknown): RequestInit {
    return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  }

  private qdrantPointId(id: string): string {
    if (!/^[0-9a-f]{64}$/i.test(id)) throw this.unavailable()
    const normalized = id.toLowerCase()
    return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-4${normalized.slice(13, 16)}-8${normalized.slice(17, 20)}-${normalized.slice(20, 32)}`
  }

  private toSearchResult(item: unknown): VectorSearchResult {
    if (!item || typeof item !== 'object') throw new Error('invalid result')
    const { score, payload } = item as { score?: unknown; payload?: unknown }
    if (typeof score !== 'number' || !Number.isFinite(score) || !payload || typeof payload !== 'object') throw new Error('invalid result')
    const { meetingId, versionId, chunkIndex, text } = payload as Partial<VectorPayload>
    if (typeof meetingId !== 'string' || typeof versionId !== 'string' || typeof chunkIndex !== 'number' || !Number.isInteger(chunkIndex) || typeof text !== 'string') {
      throw new Error('invalid result')
    }
    return { meetingId, versionId, chunkIndex, score, text }
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException('Vector store is unavailable')
  }
}
