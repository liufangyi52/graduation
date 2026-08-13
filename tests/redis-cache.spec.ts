import { expect, it, vi } from 'vitest'
import { RedisCacheService } from '../src/server/redis-cache.service'

class FakeRedis {
  readonly entries = new Map<string, string>()
  failReads = false
  failWrites = false

  async get(key: string) {
    if (this.failReads) throw new Error('Redis unavailable')
    return this.entries.get(key) ?? null
  }

  async set(key: string, value: string) {
    if (this.failWrites) throw new Error('Redis unavailable')
    this.entries.set(key, value)
  }

  async del(...keys: string[]) {
    keys.forEach((key) => this.entries.delete(key))
  }

  async incr(key: string) {
    const next = Number(this.entries.get(key) ?? 0) + 1
    this.entries.set(key, String(next))
    return next
  }
}

it('stores a cache miss and serves the following read from Redis', async () => {
  const client = new FakeRedis()
  const cache = new RedisCacheService(client as any, 60)
  const loader = vi.fn().mockResolvedValue({ id: 'project-1' })

  expect(await cache.getOrLoad('projects:manager:manager-1', loader)).toEqual({ id: 'project-1' })
  expect(await cache.getOrLoad('projects:manager:manager-1', loader)).toEqual({ id: 'project-1' })
  expect(loader).toHaveBeenCalledTimes(1)
})

it('keeps role and user cache keys isolated', async () => {
  const cache = new RedisCacheService(null, 60)

  expect(await cache.key('project-detail', { role: 'manager', id: 'manager-1' }, 'project-1')).toBe('meetingflow:v1:project-detail:manager:manager-1:project-1:rev:0')
  expect(await cache.key('project-detail', { role: 'member', id: 'member-1' }, 'project-1')).toBe('meetingflow:v1:project-detail:member:member-1:project-1:rev:0')
})

it('changes the business cache version after invalidation without scanning Redis keys', async () => {
  const client = new FakeRedis()
  const cache = new RedisCacheService(client as any, 60)
  const user = { role: 'manager', id: 'manager-1' }
  const before = await cache.key('projects', user)

  await cache.invalidateBusinessReads()

  expect(await cache.key('projects', user)).not.toBe(before)
})

it('removes explicitly invalidated keys', async () => {
  const client = new FakeRedis()
  const cache = new RedisCacheService(client as any, 60)
  const key = await cache.key('tasks', { role: 'manager', id: 'manager-1' })
  await cache.getOrLoad(key, async () => ['task-1'])

  await cache.invalidate([key])

  expect(client.entries.has(key)).toBe(false)
})

it('loads from MySQL when Redis read or write fails', async () => {
  const client = new FakeRedis()
  client.failReads = true
  const cache = new RedisCacheService(client as any, 60)
  const loader = vi.fn().mockResolvedValue({ id: 'project-1' })

  expect(await cache.getOrLoad('projects:manager:manager-1', loader)).toEqual({ id: 'project-1' })
  expect(loader).toHaveBeenCalledTimes(1)

  client.failReads = false
  client.failWrites = true
  expect(await cache.getOrLoad('projects:manager:manager-2', loader)).toEqual({ id: 'project-1' })
  expect(loader).toHaveBeenCalledTimes(2)
})
