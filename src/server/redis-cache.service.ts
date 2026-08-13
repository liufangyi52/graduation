import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import Redis from 'ioredis'

type CacheUser = { id: string; role: string }
type RedisClient = Pick<Redis, 'get' | 'set' | 'del' | 'incr' | 'disconnect'>

@Injectable()
export class RedisCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name)
  private readonly client: RedisClient | null
  private readonly ttlSeconds: number
  private businessRevision = 0

  constructor(client?: RedisClient | null, ttlSeconds?: number) {
    this.ttlSeconds = Math.max(1, ttlSeconds ?? Number(process.env.REDIS_TTL_SECONDS ?? 60))
    this.client = client === undefined && process.env.REDIS_URL
      ? new Redis(process.env.REDIS_URL, { lazyConnect: true, connectTimeout: 1_000, maxRetriesPerRequest: 0 })
      : client ?? null
  }

  async key(scope: string, user: CacheUser, projectId?: string) {
    return ['meetingflow', 'v1', scope, user.role, user.id, projectId, 'rev', await this.revision()].filter((part) => part !== undefined).join(':')
  }

  async getOrLoad<T>(key: string, loader: () => Promise<T>): Promise<T> {
    try {
      const cached = await this.client?.get(key)
      if (cached) return JSON.parse(cached) as T
    } catch (error) {
      this.logFailure('read', error)
    }

    const value = await loader()
    try {
      await this.client?.set(key, JSON.stringify(value), 'EX', this.ttlSeconds)
    } catch (error) {
      this.logFailure('write', error)
    }
    return value
  }

  async invalidate(keys: string[]) {
    if (!keys.length) return
    try {
      await this.client?.del(...keys)
    } catch (error) {
      this.logFailure('invalidate', error)
    }
  }

  async invalidateBusinessReads() {
    try {
      const revision = await this.client?.incr('meetingflow:v1:business-revision')
      this.businessRevision = Number(revision ?? this.businessRevision + 1)
    } catch (error) {
      this.logFailure('invalidate', error)
    }
  }

  onModuleDestroy() {
    this.client?.disconnect()
  }

  private logFailure(operation: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    this.logger.warn(`Redis cache ${operation} failed; using MySQL: ${message}`)
  }

  private async revision() {
    try {
      const revision = await this.client?.get('meetingflow:v1:business-revision')
      return Number(revision ?? this.businessRevision)
    } catch (error) {
      this.logFailure('read', error)
      return this.businessRevision
    }
  }
}
