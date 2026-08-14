import 'dotenv/config'
import { Injectable, ServiceUnavailableException } from '@nestjs/common'

export type EmbeddingProvider = {
  isConfigured(): boolean
  embed(texts: string[]): Promise<number[][]>
}

type EmbeddingProviderOptions = {
  apiKey?: string
  baseUrl?: string
  model?: string
}

const VECTOR_DIMENSIONS = 2560

@Injectable()
export class SiliconFlowEmbeddingProvider implements EmbeddingProvider {
  private readonly apiKey: string | undefined
  private readonly baseUrl: string
  private readonly model: string
  private readonly configuredModel: string | undefined

  constructor(options: EmbeddingProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.SILICONFLOW_API_KEY
    this.baseUrl = (options.baseUrl ?? process.env.SILICONFLOW_BASE_URL ?? 'https://api.siliconflow.cn/v1').replace(/\/$/, '')
    this.configuredModel = options.model ?? process.env.EMBEDDING_MODEL
    this.model = this.configuredModel?.trim() || 'Qwen/Qwen3-Embedding-4B'
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey?.trim() && this.configuredModel?.trim())
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) throw this.unavailable()
    if (texts.length === 0) return []

    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model: this.model, input: texts, encoding_format: 'float' }),
      })
      const payload = await response.json().catch(() => undefined)
      const vectors = payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)
        ? (payload as { data: unknown[] }).data.map((item) => item && typeof item === 'object' ? (item as { embedding?: unknown }).embedding : undefined)
        : undefined
      if (!response.ok || !vectors || vectors.length !== texts.length || !vectors.every(this.isEmbeddingVector)) throw this.unavailable()
      return vectors as number[][]
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error
      throw this.unavailable()
    }
  }

  private isEmbeddingVector = (vector: unknown): vector is number[] =>
    Array.isArray(vector) && vector.length === VECTOR_DIMENSIONS && vector.every((value) => typeof value === 'number' && Number.isFinite(value))

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException('Embedding service is unavailable')
  }
}
