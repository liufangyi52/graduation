# Redis Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fault-tolerant Redis cache-aside caching to authorized project read APIs.

**Architecture:** A focused `RedisCacheService` owns namespaced keys, JSON serialization, TTL writes, fallback logging, and known-key invalidation. `AppService` wraps selected read methods with `getOrLoad` and invalidates affected keys after successful writes.

**Tech Stack:** NestJS, TypeScript, ioredis, MySQL, Vitest.

## Global Constraints

- Redis must never be required for a successful API request.
- Cache keys must include role and user ID.
- MySQL remains the source of truth.
- Do not cache meeting bodies, drafts, passwords, or tokens.
- TTL defaults to 60 seconds when not configured.

---

### Task 1: Fault-Tolerant Cache Manager

**Files:**
- Create: `src/server/redis-cache.service.ts`
- Modify: `src/server/app.module.ts`
- Modify: `.env.example`
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `tests/redis-cache.spec.ts`

**Interfaces:**
- Produces: `RedisCacheService.getOrLoad<T>(key, loader): Promise<T>` and `invalidate(keys): Promise<void>`.

- [ ] **Step 1: Write failing cache behavior tests**

```ts
expect(await cache.getOrLoad('projects:manager:m1', loader)).toEqual({ id: 'p1' })
expect(loader).toHaveBeenCalledTimes(1)
await cache.getOrLoad('projects:manager:m1', loader)
expect(loader).toHaveBeenCalledTimes(1)
```

- [ ] **Step 2: Run the cache tests and confirm cache service is missing**

Run: `npm test -- tests/redis-cache.spec.ts`
Expected: FAIL because `RedisCacheService` does not exist.

- [ ] **Step 3: Implement cache-aside and failure fallback**

```ts
async getOrLoad<T>(key: string, loader: () => Promise<T>): Promise<T> {
  try { const cached = await this.client?.get(key); if (cached) return JSON.parse(cached) as T } catch { /* fall through */ }
  const value = await loader()
  try { await this.client?.set(key, JSON.stringify(value), 'EX', this.ttlSeconds) } catch { /* MySQL result remains valid */ }
  return value
}
```

- [ ] **Step 4: Run the cache tests and confirm they pass**

Run: `npm test -- tests/redis-cache.spec.ts`
Expected: PASS.

### Task 2: Authorized Read Caching

**Files:**
- Modify: `src/server/app.service.ts`
- Test: `tests/redis-cache-integration.spec.ts`

**Interfaces:**
- Consumes: `RedisCacheService.getOrLoad` and `cacheKey(scope, user, projectId?)`.
- Produces: cached project detail, project list, task list, risk list, and overdue task reads.

- [ ] **Step 1: Write failing authorization-key tests**

```ts
expect(cacheKeys).toContain('meetingflow:v1:project-detail:manager:manager-1:project-1')
expect(cacheKeys).toContain('meetingflow:v1:project-detail:member:member-1:project-1')
```

- [ ] **Step 2: Run integration tests and confirm uncached behavior fails the new assertions**

Run: `npm test -- tests/redis-cache-integration.spec.ts`
Expected: FAIL because reads do not call the cache manager.

- [ ] **Step 3: Wrap selected reads in cache-aside loading**

```ts
return this.cache.getOrLoad(this.cache.key('project-detail', user, projectId), async () => {
  // existing authorized MySQL query and response mapping
})
```

- [ ] **Step 4: Run integration tests and confirm they pass**

Run: `npm test -- tests/redis-cache-integration.spec.ts`
Expected: PASS.

### Task 3: Write-Path Invalidation

**Files:**
- Modify: `src/server/app.service.ts`
- Test: `tests/redis-cache-integration.spec.ts`

**Interfaces:**
- Produces: `invalidateProject(projectId)` and `invalidateTaskScope(projectId)` calls after successful writes.

- [ ] **Step 1: Write failing invalidation tests**

```ts
await service.updateTask(manager, 'task-1', { status: 'completed' })
expect(cache.invalidated).toContain('meetingflow:v1:project-detail:project-1')
```

- [ ] **Step 2: Run the targeted test and confirm no invalidation occurs**

Run: `npm test -- tests/redis-cache-integration.spec.ts`
Expected: FAIL because task writes do not invalidate cache keys.

- [ ] **Step 3: Invalidate after successful transaction or MySQL write**

```ts
await this.cache.invalidateProject(projectId)
```

- [ ] **Step 4: Run targeted tests and confirm they pass**

Run: `npm test -- tests/redis-cache-integration.spec.ts`
Expected: PASS.

### Task 4: Full Verification

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Document Redis environment variables**

```dotenv
REDIS_URL=redis://127.0.0.1:6379
REDIS_TTL_SECONDS=60
```

- [ ] **Step 2: Run full verification**

Run: `npm test; npm run build`
Expected: all tests pass and production build exits with status 0.
