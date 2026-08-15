# Project Realtime Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authorized project members see task progress and feedback changes promptly, with a reliable HTTP refresh fallback and an auditable activity history.

**Architecture:** A Nest Socket.IO gateway authenticates the existing bearer token and admits users only to rooms for projects they may view. `AppService` writes a normalized progress event in the same transaction as a task update or feedback submission, then an injected publisher broadcasts after commit. The project-detail API returns health, member-progress, and activity aggregates; Vue subscribes to the room, reloads after received or reconnect events, and refreshes every 10 seconds while disconnected.

**Tech Stack:** Vue 3, TypeScript, Vite, NestJS 11, Socket.IO, MySQL, Vitest.

## Global Constraints

- Preserve existing bearer-token validation, account revocation checks, and HTTP authorization as the source of truth.
- The client never supplies the project id for a task progress event; the server obtains it from the task record.
- Store an event for `PATCH /tasks/:id` and `POST /tasks/:id/feedbacks` in the same transaction as the state mutation, and publish only after commit.
- Realtime rooms use `project:<projectId>` and event name `project.progress.updated`.
- Realtime failure must not block task updates or feedback; disconnected detail pages refresh by HTTP every 10 seconds and reload on reconnection.
- Display event dates in Beijing time using the existing date-format utilities; do not expose ISO suffixes.
- Keep the existing working-tree changes intact and do not create a commit unless the user asks for one.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `package.json` / lockfile | Add the Nest Socket.IO server and browser client dependencies. |
| `src/server/project-progress-events.service.ts` | Define the serialized progress-event payload and publish committed events to the gateway. |
| `src/server/project-progress.gateway.ts` | Authenticate a socket with the established JWT/database account check, authorize project-room joins, and emit only to that project room. |
| `src/server/app.module.ts` | Register the gateway and progress-event publisher. |
| `src/server/migrate.ts` | Create the append-only `project_progress_events` table and indexed project/activity lookup. |
| `src/server/app.service.ts` | Write events transactionally, publish after commit, and return health/member/activity data from `projectDetail`. |
| `src/services/projectRealtimeService.ts` | Own the socket lifecycle, bounded reconnect behavior, room join, and connected-state callback for one project-detail page. |
| `src/services/workspaceService.ts` | Export typed project health, member progress, and activity fields and map API payloads. |
| `src/components/ProjectDetailPage.vue` | Subscribe/unsubscribe, perform the disconnected refresh, render health/member/activity views, and use the actual-progress Gantt overlay. |
| `src/style.css` | Provide compact responsive layout and clear planned/actual/overdue Gantt distinction. |
| `tests/project-progress-events.spec.ts` | Cover transactional event records, payload mapping, room authorization, and post-commit publishing. |
| `tests/project-realtime-service.spec.ts` | Cover socket reconnect and disconnected HTTP-fallback timer behavior with a controllable socket factory. |
| `tests/project-detail.spec.ts` | Cover the extended project-detail response mapping and authorization scope. |
| `tests/project-detail-ui.spec.ts` | Assert the new project health, member-progress, activity, and actual-Gantt markup/styles are present. |

### Task 1: Persist and Publish Project Progress Events

**Files:**
- Modify: `package.json`
- Modify: lockfile selected by the repository package manager
- Create: `src/server/project-progress-events.service.ts`
- Create: `src/server/project-progress.gateway.ts`
- Modify: `src/server/app.module.ts`
- Modify: `src/server/migrate.ts`
- Modify: `src/server/app.service.ts:362-405`
- Test: `tests/project-progress-events.spec.ts`

**Interfaces:**
- Consumes: `SessionUser` identity already verified by `AppService.databaseUser(token)` and task rows with `id`, `title`, `project_id`, `status`, `progress`, and `assignee_id`.
- Produces: `ProjectProgressEvent` with `{ id, projectId, taskId, taskTitle, actorId, actorName, eventType: 'task_updated' | 'feedback_created', beforeProgress, afterProgress, beforeStatus, afterStatus, feedbackContent?, createdAt }`.
- Produces: `ProjectProgressEventsService.publish(event: ProjectProgressEvent): void` and `ProjectProgressGateway.joinProject(socket, projectId): Promise<void>`.

- [ ] **Step 1: Write failing server tests**

```ts
it('records a task update event before committing and publishes its normalized payload after commit', async () => {
  const publish = vi.fn()
  const service = new AppService({} as any, {} as any, {} as any, undefined, { publish } as any)

  await service.updateTask(member, 'task-1', { progress: 65 })

  expect(transaction.execute).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO project_progress_events'),
    expect.arrayContaining(['project-1', 'task-1', 'member-1', 'task_updated', 20, 65]),
  )
  expect(publish).toHaveBeenCalledWith(expect.objectContaining({
    projectId: 'project-1', taskId: 'task-1', eventType: 'task_updated', beforeProgress: 20, afterProgress: 65,
  }))
})

it('rejects a socket project-room join when the authenticated user is not a project member', async () => {
  await expect(gateway.joinProject(socketFor(member), 'private-project')).rejects.toThrow('You cannot view this project')
  expect(socketFor(member).join).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the focused tests to verify they fail for the missing event/gateway interfaces**

Run: `npm test -- tests/project-progress-events.spec.ts`

Expected: FAIL because the progress-event publisher and realtime gateway do not yet exist.

- [ ] **Step 3: Add Socket.IO dependencies and migration**

```json
{
  "dependencies": {
    "@nestjs/platform-socket.io": "^11.1.28",
    "@nestjs/websockets": "^11.1.28",
    "socket.io": "^4.8.1",
    "socket.io-client": "^4.8.1"
  }
}
```

Create `project_progress_events` in `migrate()` with UUID primary key, foreign keys to project/task/user, the event type, nullable before/after status and progress values, nullable feedback text, `created_at`, and an index on `(project_id, created_at DESC)`. Use `CREATE TABLE IF NOT EXISTS`, matching the existing migration style.

- [ ] **Step 4: Implement authorization-safe Socket.IO gateway and publisher**

```ts
export type ProjectProgressEvent = {
  id: string; projectId: string; taskId: string; taskTitle: string
  actorId: string; actorName: string; eventType: 'task_updated' | 'feedback_created'
  beforeProgress: number; afterProgress: number; beforeStatus: string; afterStatus: string
  feedbackContent?: string; createdAt: string
}

@Injectable()
export class ProjectProgressEventsService {
  constructor(private readonly gateway: ProjectProgressGateway) {}
  publish(event: ProjectProgressEvent) { this.gateway.emitProgress(event) }
}
```

Have the gateway read the socket handshake bearer token, call `AppService.databaseUser`, and query `projects`/`project_members` for authorization before `socket.join('project:' + projectId)`. Permit a manager only for their owned active project and a member only for an active membership; reject admins/auditors. The gateway exposes `emitProgress(event)` and sends `project.progress.updated` only to `project:<event.projectId>`.

- [ ] **Step 5: Make task update and feedback writes atomic with their events**

Refactor `AppService.updateTask` to use a MySQL connection transaction and `SELECT ... FOR UPDATE` including the existing progress/status fields. Insert its `task_updated` event before `commit()`, construct the event payload from the locked task, then call `progressEvents.publish(event)` only after successful commit. In `feedback`, extend the existing locked task query, insert a `feedback_created` event beside `task_feedbacks`, commit, then publish after the transaction. Keep audit, deadline-warning, and cache invalidation behavior after the database transaction.

- [ ] **Step 6: Run the focused event tests to verify they pass**

Run: `npm test -- tests/project-progress-events.spec.ts tests/authorization.spec.ts`

Expected: PASS; forbidden room joins do not call `join`, and publish occurs only after a committed event write.

### Task 2: Return Health, Member Progress, and Activity from Project Detail

**Files:**
- Modify: `src/server/app.service.ts:134-169`
- Modify: `src/services/workspaceService.ts:21-42` and `getProjectDetail`
- Modify: `tests/project-detail.spec.ts`

**Interfaces:**
- Consumes: persisted `project_progress_events`, tasks, members, and risks for one authorized project.
- Produces: `ProjectDetail.health`, `ProjectDetail.memberProgress`, and `ProjectDetail.activity`, with every `createdAt` preserved as an API value for client-side Beijing formatting.

- [ ] **Step 1: Write failing project-detail response tests**

```ts
it('returns project health, per-member progress, and newest-first activity for an authorized project', async () => {
  const detail = await new AppService({} as any).projectDetail(manager, 'project-1')

  expect(detail.health).toEqual({ activeTasks: 2, blockedTasks: 1, overdueTasks: 1, openRisks: 1 })
  expect(detail.memberProgress).toEqual([expect.objectContaining({ memberId: 'member-1', taskCount: 2, completedTaskCount: 1, averageProgress: 60 })])
  expect(detail.activity[0]).toEqual(expect.objectContaining({ eventType: 'feedback_created', taskTitle: 'Ship', actorName: 'Member' }))
})

it('maps the realtime detail aggregates into the client contract', async () => {
  const detail = await createWorkspaceService('token').getProjectDetail('project-1')
  expect(detail.memberProgress[0].latestFeedbackAt).toBe('2026-08-14T10:00:00.000Z')
})
```

- [ ] **Step 2: Run the project-detail tests to verify the new fields fail**

Run: `npm test -- tests/project-detail.spec.ts`

Expected: FAIL because `health`, `memberProgress`, and `activity` are absent.

- [ ] **Step 3: Query and map the additional detail aggregates**

Add scoped queries inside the existing `projectDetail()` cache loader:

```sql
SELECT pm.user_id member_id,u.name member_name,
  COUNT(t.id) task_count,
  SUM(t.status IN ('completed','closed')) completed_task_count,
  COALESCE(ROUND(AVG(t.progress)),0) average_progress,
  MAX(f.created_at) latest_feedback_at
FROM project_members pm
JOIN users u ON u.id=pm.user_id
LEFT JOIN tasks t ON t.project_id=pm.project_id AND t.assignee_id=pm.user_id
LEFT JOIN task_feedbacks f ON f.author_id=pm.user_id
  AND EXISTS (SELECT 1 FROM tasks ft WHERE ft.id=f.task_id AND ft.project_id=pm.project_id)
WHERE pm.project_id=?
GROUP BY pm.user_id,u.name
ORDER BY average_progress DESC,u.name ASC
```

Query the latest 20 events joined with task and actor names, newest first. Compute `activeTasks`, `blockedTasks` (`todo`), `overdueTasks` (open task with a due date before today), and `openRisks` from the existing project-scoped data. Extend the TypeScript interfaces and mapper with camelCase names without changing the established task/meeting/risk fields.

- [ ] **Step 4: Run the project-detail regression tests to verify they pass**

Run: `npm test -- tests/project-detail.spec.ts tests/workspace-service.spec.ts`

Expected: PASS; old detail data continues to map, and the new data is correctly typed and scoped.

### Task 3: Add Realtime Subscription and Disconnected Refresh Behavior

**Files:**
- Create: `src/services/projectRealtimeService.ts`
- Modify: `src/components/ProjectDetailPage.vue:1-95`
- Test: `tests/project-realtime-service.spec.ts`

**Interfaces:**
- Consumes: `ProjectProgressEvent`, current login token, a project id, and `load(): Promise<void>` from the detail page.
- Produces: `createProjectRealtimeService({ token, projectId, onProgress, onConnectionChange }): { connect(): void; disconnect(): void; connected: Readonly<Ref<boolean>> }`.

- [ ] **Step 1: Write failing lifecycle and fallback tests**

```ts
it('joins a project room, reloads after a progress event, and clears its fallback timer on disconnect', async () => {
  const realtime = createProjectRealtimeService({ token: 'token', projectId: 'project-1', onProgress })
  realtime.connect()
  socket.emit('project.progress.updated', event)
  await flushPromises()

  expect(onProgress).toHaveBeenCalledWith(event)
  realtime.disconnect()
  expect(clearInterval).toHaveBeenCalled()
})

it('requests a 10-second HTTP fallback only while the socket is disconnected', () => {
  socket.emit('disconnect')
  expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 10_000)
  socket.emit('connect')
  expect(clearInterval).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the focused realtime client tests to verify failure**

Run: `npm test -- tests/project-realtime-service.spec.ts`

Expected: FAIL because the client lifecycle wrapper does not exist.

- [ ] **Step 3: Implement one scoped client socket lifecycle**

```ts
const socket = io(realtimeBaseUrl, {
  auth: { token }, transports: ['websocket', 'polling'], reconnection: true,
  reconnectionAttempts: 5, reconnectionDelay: 500, reconnectionDelayMax: 5_000,
})
socket.on('connect', () => socket.emit('project.join', { projectId }))
socket.on('project.progress.updated', (event: ProjectProgressEvent) => onProgress(event))
```

Start the 10-second interval only from `disconnect`/`connect_error`, stop it on `connect`, and call `onProgress` after a successful reconnection so the page reloads the canonical server state. Do not create an application-global connection; each detail page owns and cleans up its own subscription.

- [ ] **Step 4: Wire project page loading, cleanup, and sync timestamp**

Import `onBeforeUnmount`, create the subscription after the initial `load()`, call `load()` from `onProgress`, and call `disconnect()` in `onBeforeUnmount`. Track `lastSyncedAt` after successful HTTP responses. The page must tolerate temporary socket failures while the existing detail view stays usable.

- [ ] **Step 5: Run realtime lifecycle tests to verify they pass**

Run: `npm test -- tests/project-realtime-service.spec.ts tests/project-detail.spec.ts`

Expected: PASS; the fallback begins only during a disconnect and page cleanup prevents timers/sockets from surviving navigation.

### Task 4: Render the Realtime Project Progress Workspace

**Files:**
- Modify: `src/components/ProjectDetailPage.vue:97-130`
- Modify: `src/style.css`
- Modify: `tests/project-detail-ui.spec.ts`

**Interfaces:**
- Consumes: `ProjectDetail.health`, `memberProgress`, `activity`, `project.progress`, detail tasks, and `lastSyncedAt`.
- Produces: overview health/member/activity panels and an actual-progress Gantt overlay that preserves planned dates.

- [ ] **Step 1: Write failing source-level UI tests**

```ts
it('renders the realtime health, member progress, and activity-feed regions', () => {
  expect(source).toContain('项目健康度')
  expect(source).toContain('成员进度')
  expect(source).toContain('最新动态')
  expect(source).toContain('formatBeijingMinute(activity.createdAt)')
})

it('distinguishes Gantt planned duration, actual completion, and overdue tasks', () => {
  expect(source).toContain('gantt-plan')
  expect(source).toContain('gantt-actual')
  expect(source).toContain('gantt-overdue')
  expect(styles).toContain('.gantt-actual')
})
```

- [ ] **Step 2: Run the UI test to verify failure**

Run: `npm test -- tests/project-detail-ui.spec.ts`

Expected: FAIL because the new sections and actual-progress classes are absent.

- [ ] **Step 3: Build compact overview and activity content**

Add a full-width project-health summary immediately below the existing project header: completion rate, active/blocking/overdue/open-risk values, and a Beijing-formatted last-synchronized time. Add an unframed two-column overview band containing member rows (name, task/completed counts, progress meter, latest feedback time, click-through task summary) and a newest-first activity feed limited to five events, with a dedicated activity tab showing all returned events. Reuse the page's existing panels, tabs, tags, and responsive conventions rather than adding nested cards.

- [ ] **Step 4: Improve Gantt planned versus actual visualization**

Keep `gantt-plan` as the full planned schedule bar. Render `gantt-actual` above it with `width = task.width * task.progress / 100`, include owner and percentage labels that do not alter row dimensions, retain the today line, and add `gantt-overdue` for unfinished tasks whose due date is before today. Ensure the narrow viewport layout preserves a horizontal Gantt scroll rather than overlapping labels.

- [ ] **Step 5: Add responsive styles with stable geometry**

Define stable grid tracks for health stats, member rows, event rows, and Gantt rows; collapse the overview band to one column at the existing 900px breakpoint. Use existing color tokens for status colors, a neutral pale planned bar, and semantic warning/error colors for blocked or overdue states. Keep panel radii and typography consistent with the dashboard.

- [ ] **Step 6: Run UI and build verification**

Run: `npm test -- tests/project-detail-ui.spec.ts tests/project-detail.spec.ts tests/project-realtime-service.spec.ts`

Expected: PASS; new real-time regions, Beijing time format, and visual Gantt layers are covered.

Run: `npm run build`

Expected: exit code 0 from `vue-tsc --noEmit --incremental false && vite build`.

### Task 5: Validate Two-Member Synchronization and Regressions

**Files:**
- Modify: `tests/project-progress-events.spec.ts`
- Modify: `tests/project-realtime-service.spec.ts`
- Modify: `docs/superpowers/specs/2026-08-14-project-realtime-progress-design.md` only if implementation exposes a necessary, user-approved API deviation.

**Interfaces:**
- Consumes: completed server gateway, client subscription wrapper, and project detail API.
- Produces: regression evidence for authorization, post-commit event delivery, disconnect fallback, and build compatibility.

- [ ] **Step 1: Write a failing two-member delivery test**

```ts
it('delivers a committed member task-progress event only to sockets joined to that project room', async () => {
  await service.updateTask(memberA, 'project-1-task', { progress: 75 })

  expect(projectOneSocket.emit).toHaveBeenCalledWith('project.progress.updated', expect.objectContaining({ afterProgress: 75 }))
  expect(projectTwoSocket.emit).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run it to verify the test detects room isolation issues**

Run: `npm test -- tests/project-progress-events.spec.ts -t "only to sockets joined"`

Expected: FAIL until the test doubles are wired to the completed room publisher.

- [ ] **Step 3: Complete the smallest test-double wiring needed for room-isolation coverage**

Use an in-memory Socket.IO server/to-room spy in the test; do not add a second transport or a production-only testing branch. Verify the emitted payload corresponds to the committed database event.

- [ ] **Step 4: Run final focused checks and build**

Run: `npm test -- tests/project-progress-events.spec.ts tests/project-realtime-service.spec.ts tests/project-detail.spec.ts tests/project-detail-ui.spec.ts tests/authorization.spec.ts`

Expected: PASS.

Run: `npm run build`

Expected: exit code 0.

- [ ] **Step 5: Run the full suite and report pre-existing failures separately if they remain**

Run: `npm test`

Expected: all tests pass except any already-known unrelated failures; identify each remaining failure by test file and do not attribute it to this feature without evidence.

## Self-Review

- Spec coverage: Task 1 implements authenticated, project-scoped realtime rooms and atomic event creation; Task 2 returns the audit/activity data and aggregate health; Task 3 provides reconnect plus 10-second fallback; Task 4 implements all requested project detail and Gantt UI; Task 5 proves cross-member room isolation and reruns regression checks.
- Placeholder scan: no TODO/TBD or unspecified implementation/test steps remain.
- Type consistency: all layers use `ProjectProgressEvent`, the `project.progress.updated` event name, and the `project:<projectId>` room name. The server produces camelCase API payloads that the workspace service exposes as `ProjectDetail` fields.
