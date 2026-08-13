import { createHash } from 'node:crypto'
import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { type EmbeddingProvider, SiliconFlowEmbeddingProvider } from './embedding-provider'
import { QdrantVectorStore, type VectorPoint, type VectorStore } from './vector-store'

const CHUNK_SIZE = 1200
const CHUNK_ADVANCE = 1000
const RETRIEVAL_LIMIT = 5

export type RagVersion = {
  projectId: string
  meetingId: string
  versionId: string
  desensitizedContent: string
}

export type RetrievalEvidence = {
  meetingId: string
  versionId: string
  chunkIndex: number
  score: number
  text: string
}

export function chunkDesensitizedContent(content: string): string[] {
  const chunks: string[] = []
  for (let offset = 0; offset < content.length; offset += CHUNK_ADVANCE) {
    const chunk = content.slice(offset, offset + CHUNK_SIZE)
    if (chunk.trim()) chunks.push(chunk)
  }
  return chunks
}

export function ragPointId(version: RagVersion, chunkIndex: number, text: string): string {
  return createHash('sha256')
    .update(JSON.stringify([version.projectId, version.meetingId, version.versionId, chunkIndex, text]))
    .digest('hex')
}

@Injectable()
export class RagIndexService {
  constructor(
    @Inject(SiliconFlowEmbeddingProvider) private readonly embedder: EmbeddingProvider,
    @Inject(QdrantVectorStore) private readonly store: VectorStore,
  ) {}

  isConfigured(): boolean {
    return this.embedder.isConfigured() && this.store.isConfigured()
  }

  async syncVersion(version: RagVersion): Promise<{ indexedChunks: number }> {
    if (!this.isConfigured()) return { indexedChunks: 0 }

    const chunks = chunkDesensitizedContent(version.desensitizedContent)
    await this.store.ensureCollection()
    if (chunks.length === 0) {
      await this.store.removeMeetingVersions({ projectId: version.projectId, meetingId: version.meetingId, retainedVersionId: version.versionId })
      return { indexedChunks: 0 }
    }

    const vectors = await this.embedder.embed(chunks)
    if (vectors.length !== chunks.length) throw this.unavailable()

    const points: VectorPoint[] = chunks.map((text, chunkIndex) => ({
      id: ragPointId(version, chunkIndex, text),
      vector: vectors[chunkIndex],
      payload: {
        projectId: version.projectId,
        meetingId: version.meetingId,
        versionId: version.versionId,
        chunkIndex,
        contentHash: this.contentHash(text),
        text,
      },
    }))
    await this.store.upsert(points)
    await this.store.removeMeetingVersions({ projectId: version.projectId, meetingId: version.meetingId, retainedVersionId: version.versionId })
    return { indexedChunks: points.length }
  }

  async retrieve(input: RagVersion): Promise<{ evidence: RetrievalEvidence[]; durationMs: number }> {
    if (!this.isConfigured()) return { evidence: [], durationMs: 0 }

    const startedAt = Date.now()
    await this.syncVersion(input)
    if (!input.desensitizedContent.trim()) return { evidence: [], durationMs: Date.now() - startedAt }

    const [queryVector] = await this.embedder.embed([input.desensitizedContent])
    if (!queryVector) throw this.unavailable()
    const results = await this.store.search(queryVector, {
      projectId: input.projectId,
      excludedVersionId: input.versionId,
      limit: RETRIEVAL_LIMIT,
    })
    return {
      evidence: results.slice(0, RETRIEVAL_LIMIT).map(({ meetingId, versionId, chunkIndex, score, text }) => ({
        meetingId,
        versionId,
        chunkIndex,
        score,
        text,
      })),
      durationMs: Date.now() - startedAt,
    }
  }

  async health(): Promise<boolean> {
    return this.isConfigured() && this.store.health()
  }

  private contentHash(text: string): string {
    return createHash('sha256').update(text).digest('hex')
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException('RAG index service is unavailable')
  }
}
