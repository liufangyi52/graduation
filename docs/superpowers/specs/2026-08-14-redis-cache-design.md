# Redis Cache Design

## Goal

Add Redis-backed cache-aside caching for high-read project data while preserving existing authorization rules and keeping every API available when Redis is unavailable.

## Configuration And Availability

The server accepts `REDIS_URL` and `REDIS_TTL_SECONDS`, defaulting the TTL to 60 seconds. A Redis client connects lazily and has a short command timeout. Connection, read, write, parse, or delete failures are logged with NestJS `Logger` and treated as cache misses; MySQL remains the source of truth and requests never fail solely because Redis is down.

## Cache Scope

Only structured, already-authorized read responses are cached:

- `projects:<role>:<userId>` for project lists.
- `project-detail:<role>:<userId>:<projectId>` for project details.
- `tasks:<role>:<userId>` for task lists.
- `risks:<role>:<userId>` for risk lists.
- `overdue-tasks:<role>:<userId>` for deadline warnings.

Every key embeds the user role and user ID. Cache values never include passwords, bearer tokens, meeting text, analysis drafts, or exported files.

## Invalidation

Successful writes invalidate cache keys before returning. Project mutation clears the actor's project list and all detail keys for that project. Task and feedback mutations clear task, overdue, project-detail, and project-list keys for affected project users. Risk mutations clear risk and project-detail keys. Meeting analysis review clears project-detail keys. Namespace versioning (`meetingflow:v1`) makes it possible to retire the full cache without scanning Redis.

The initial implementation uses a small versioned cache manager with known-key invalidation. It does not scan keys in Redis or add a cache dashboard.

## Testing

Tests use a memory Redis-shaped fake at the cache-manager boundary. They prove cache hit avoids the loader, cache miss stores data, role/user keys stay isolated, invalidation removes matching entries, and Redis errors execute the MySQL loader normally.
