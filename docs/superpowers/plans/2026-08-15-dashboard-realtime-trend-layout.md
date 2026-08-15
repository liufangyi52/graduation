# Dashboard Realtime Completion Trend and Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the manager dashboard immediately after member task events, render completion trend from persisted completion timestamps, and stabilize its lower layout.

**Architecture:** Reuse the existing authorized `project:<projectId>` Socket.IO room protocol. A dashboard-owned connection joins all visible projects, reloads canonical workspace data on `project.progress.updated`, and computes the view from the refreshed task collection. CSS uses a stable two-column grid that collapses at the 900px breakpoint.

**Tech Stack:** Vue 3, TypeScript, Socket.IO client, Vitest, CSS Grid.

## Global Constraints

- Reuse `project.join` and `project.progress.updated`; do not add server routes, rooms, or database tables.
- Do not patch workspace state from an event payload; reload from the server.
- Count only completed visible tasks with valid `completedAt` values.
- Poll every ten seconds only while the dashboard socket is disconnected.
- Preserve uncommitted work and stage only files owned by a task.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/services/dashboardRealtimeService.ts` | Dashboard socket lifecycle, project-room joins, and disconnected fallback. |
| `src/App.vue` | Event-driven canonical refresh, trend computed state, and manager chart. |
| `src/style.css` | Stable desktop and narrow-screen lower dashboard geometry. |
| `tests/dashboard-realtime-service.spec.ts` | Socket lifecycle regression coverage. |
| `tests/project-analytics-ui.spec.ts` | Trend and layout source regression coverage. |

### Task 1: Dashboard Socket Lifecycle

**Files:**
- Create: `src/services/dashboardRealtimeService.ts`
- Create: `tests/dashboard-realtime-service.spec.ts`

**Interfaces:**
- Produces: `createDashboardRealtimeService({ token, onProgress, onDisconnected })` with `connected`, `connect(projectIds)`, `syncProjects(projectIds)`, and `disconnect()`.
- `onProgress` receives an existing `project.progress.updated` payload. `onDisconnected` is called by the fallback timer only while disconnected.

- [ ] **Step 1: Write a failing lifecycle test**

Mock `socket.io-client` with a controllable socket in `tests/dashboard-realtime-service.spec.ts`.

```ts
const handlers: Record<string, (payload?: any) => void> = {}
const socket = {
  on: vi.fn((event, handler) => { handlers[event] = handler }),
  emit: vi.fn(),
  disconnect: vi.fn(),
}

it('joins visible projects and forwards a progress event immediately', () => {
  const onProgress = vi.fn()
  const realtime = createDashboardRealtimeService({ token: 'token', onProgress, onDisconnected: vi.fn() })
  realtime.connect(['project-a', 'project-b'])
  handlers.connect()
  handlers['project.progress.updated']({ projectId: 'project-a', taskId: 'task-1' })
  expect(socket.emit).toHaveBeenCalledWith('project.join', { projectId: 'project-a' })
  expect(socket.emit).toHaveBeenCalledWith('project.join', { projectId: 'project-b' })
  expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'task-1' }))
})

it('joins newly visible projects and only polls while disconnected', () => {
  vi.useFakeTimers()
  const onDisconnected = vi.fn()
  const realtime = createDashboardRealtimeService({ token: 'token', onProgress: vi.fn(), onDisconnected })
  realtime.connect(['project-a']); handlers.connect()
  realtime.syncProjects(['project-a', 'project-b'])
  handlers.disconnect(); vi.advanceTimersByTime(10_000); handlers.connect()
  expect(socket.emit).toHaveBeenCalledWith('project.join', { projectId: 'project-b' })
  expect(onDisconnected).toHaveBeenCalledTimes(1)
  vi.useRealTimers()
})
```

- [ ] **Step 2: Verify the test fails**

Run `npx vitest run tests/dashboard-realtime-service.spec.ts`.

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the minimum client service**

Create `src/services/dashboardRealtimeService.ts` using the same base URL, auth, and reconnect configuration as `projectRealtimeService.ts`.

```ts
import { ref } from 'vue'
import { io, type Socket } from 'socket.io-client'

type ProgressEvent = { projectId: string; taskId: string }

export function createDashboardRealtimeService(input: {
  token: string; onProgress: (event: ProgressEvent) => void; onDisconnected: () => void
}) {
  const connected = ref(false)
  const joinedProjectIds = new Set<string>()
  let socket: Socket | undefined
  let fallback: number | undefined
  const stopFallback = () => { if (fallback !== undefined) { window.clearInterval(fallback); fallback = undefined } }
  const startFallback = () => { if (fallback === undefined) fallback = window.setInterval(input.onDisconnected, 10_000) }
  const join = (ids: string[]) => ids.filter((id) => id && !joinedProjectIds.has(id)).forEach((projectId) => {
    joinedProjectIds.add(projectId); socket?.emit('project.join', { projectId })
  })
  return {
    connected,
    connect(ids: string[]) {
      socket = io((import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000/api').replace(/\/api$/, ''), { auth: { token: input.token }, reconnection: true, reconnectionAttempts: 5, reconnectionDelay: 500, reconnectionDelayMax: 5_000 })
      socket.on('connect', () => { connected.value = true; stopFallback(); join(ids) })
      socket.on('disconnect', () => { connected.value = false; startFallback() })
      socket.on('connect_error', () => { connected.value = false; startFallback() })
      socket.on('project.progress.updated', input.onProgress)
    },
    syncProjects: join,
    disconnect() { stopFallback(); joinedProjectIds.clear(); socket?.disconnect(); socket = undefined },
  }
}
```

- [ ] **Step 4: Verify green**

Run `npx vitest run tests/dashboard-realtime-service.spec.ts`.

Expected: PASS; project rooms are joined once, events reach the callback, and fallback starts only after disconnect.

- [ ] **Step 5: Commit**

Stage `src/services/dashboardRealtimeService.ts` and `tests/dashboard-realtime-service.spec.ts`, then commit with `feat: subscribe dashboard to project progress`.

### Task 2: Canonical Refresh and Completion Trend

**Files:**
- Modify: `src/App.vue`
- Modify: `tests/project-analytics-ui.spec.ts`

**Interfaces:**
- Consumes: `createDashboardRealtimeService`, `service.load()`, workspace projects/tasks, and `buildProjectAnalytics`.
- Produces: `refreshDashboardData(): Promise<void>` and `dashboardCompletionTrend: ComputedRef<{ date: string; count: number }[]>`.

- [ ] **Step 1: Write a failing dashboard source test**

Append this test to `tests/project-analytics-ui.spec.ts`:

```ts
it('subscribes the manager dashboard and derives its completion trend from refreshed task data', () => {
  const source = readFileSync('src/App.vue', 'utf8')
  expect(source).toContain("import { createDashboardRealtimeService } from './services/dashboardRealtimeService'")
  expect(source).toContain("import { buildProjectAnalytics } from './utils/projectAnalytics'")
  expect(source).toContain('const dashboardCompletionTrend = computed(() =>')
  expect(source).toContain('completedAt: task.completedAt')
  expect(source).toContain('onProgress: refreshDashboardData')
  expect(source).toContain('dashboardRealtime?.syncProjects(data.projects.map((project) => project.id))')
  expect(source).toContain('v-for="point in dashboardCompletionTrend"')
  expect(source).not.toContain('任务更新时间序列累计后将在此展示趋势。')
})
```

- [ ] **Step 2: Verify the test fails**

Run `npx vitest run tests/project-analytics-ui.spec.ts`.

Expected: FAIL because the current manager dashboard has a static empty-state panel.

- [ ] **Step 3: Add the refresh boundary and subscription**

Import the dashboard service and analytics builder. Before startup data loading, declare `dashboardRealtime` and `dashboardRefresh`, then add the coalesced refresh function:

```ts
let dashboardRealtime: ReturnType<typeof createDashboardRealtimeService> | undefined
let dashboardRefresh: Promise<void> | undefined

function refreshDashboardData() {
  if (dashboardRefresh) return dashboardRefresh
  dashboardRefresh = service.load()
    .then(() => { dashboardRealtime?.syncProjects(data.projects.map((project) => project.id)) })
    .finally(() => { dashboardRefresh = undefined })
  return dashboardRefresh
}
```

Replace the non-auditor startup load and existing ten-second task-refresh callback with `refreshDashboardData()`, retaining calendar/meeting loading and error reporting. In `onMounted`, connect only managers:

```ts
if (props.user.role === 'manager') {
  dashboardRealtime = createDashboardRealtimeService({ token: props.token, onProgress: refreshDashboardData, onDisconnected: refreshDashboardData })
  dashboardRealtime.connect(data.projects.map((project) => project.id))
}
```

Call `dashboardRealtime?.disconnect()` in `onUnmounted`.

- [ ] **Step 4: Add computed chart data and markup**

Add the computed data near existing dashboard metrics:

```ts
const dashboardCompletionTrend = computed(() => buildProjectAnalytics({
  tasks: data.tasks.map((task) => ({
    id: task.id, title: task.title,
    status: task.state === 'in-progress' ? 'in_progress' : task.state,
    progress: task.progress, createdAt: task.createdAt, completedAt: task.completedAt, dueDate: task.due,
  })),
  risks: [],
}, new Date().toISOString()).completionTrend)
const dashboardTrendMaximum = computed(() => Math.max(1, ...dashboardCompletionTrend.value.map((point) => point.count)))
```

Replace the static trend body with this markup:

```vue
<div v-if="dashboardCompletionTrend.length" class="dashboard-trend" aria-label="任务完成趋势">
  <div v-for="point in dashboardCompletionTrend" :key="point.date" class="dashboard-trend-row">
    <span class="mono">{{ point.date }}</span>
    <span class="dashboard-trend-track"><i :style="{ width: `${point.count / dashboardTrendMaximum * 100}%` }"></i></span>
    <b>{{ point.count }}</b>
  </div>
</div>
<div v-else class="empty-cell panel-empty-state">暂无可追溯的任务完成记录</div>
<p class="chart-note">成员完成任务后将立即同步更新。</p>
```

- [ ] **Step 5: Verify green**

Run `npx vitest run tests/project-analytics-ui.spec.ts`.

Expected: PASS; event-driven reload, timestamp-derived data, and non-static chart markup are present.

- [ ] **Step 6: Commit**

Stage `src/App.vue` and `tests/project-analytics-ui.spec.ts`, then commit with `feat: render realtime dashboard completion trend`.

### Task 3: Stable Lower Dashboard Layout

**Files:**
- Modify: `src/style.css`
- Modify: `tests/project-analytics-ui.spec.ts`

**Interfaces:**
- Consumes: `bottom-grid`, `chart-panel`, `risk-panel`, and the trend rows from Task 2.
- Produces: a 7:4 desktop layout with equal panel baseline/minimum height and one-column behavior at 900px.

- [ ] **Step 1: Write a failing layout test**

Append this test to `tests/project-analytics-ui.spec.ts`:

```ts
it('uses stable responsive geometry for the dashboard trend and risk panels', () => {
  const style = readFileSync('src/style.css', 'utf8')
  expect(style).toContain('.bottom-grid { grid-template-columns: minmax(0, 7fr) minmax(300px, 4fr); align-items: stretch; }')
  expect(style).toContain('.bottom-grid > .panel { min-height: 330px; }')
  expect(style).toContain('.chart-panel { display: flex; flex-direction: column; overflow: hidden; }')
  expect(style).toContain('@media (max-width: 900px) { .top-grid, .bottom-grid { grid-template-columns: 1fr; }')
})
```

- [ ] **Step 2: Verify the test fails**

Run `npx vitest run tests/project-analytics-ui.spec.ts`.

Expected: FAIL because the current lower grid has neither explicit height geometry nor a protected narrow-screen collapse.

- [ ] **Step 3: Add minimal stable CSS**

Add these rules to `src/style.css`, keeping existing visual tokens and avoiding nested cards:

```css
.bottom-grid { grid-template-columns: minmax(0, 7fr) minmax(300px, 4fr); align-items: stretch; }
.bottom-grid > .panel { min-height: 330px; }
.chart-panel { display: flex; flex-direction: column; overflow: hidden; }
.chart-panel .dashboard-trend,
.chart-panel .panel-empty-state { flex: 1; }
.risk-panel { display: flex; flex-direction: column; }
.risk-panel .risk-legend { margin-top: auto; }

@media (max-width: 900px) {
  .top-grid, .bottom-grid { grid-template-columns: 1fr; }
}
```

Keep the middle track of `.dashboard-trend-row` as `minmax(0, 1fr)` and use `min-height: 0` for `.dashboard-trend`; date labels must not widen the risk panel.

- [ ] **Step 4: Verify green**

Run `npx vitest run tests/project-analytics-ui.spec.ts`.

Expected: PASS; desktop sizing and narrow-screen collapse are protected.

- [ ] **Step 5: Commit**

Stage `src/style.css` and `tests/project-analytics-ui.spec.ts`, then commit with `style: align dashboard trend and risk panels`.

### Task 4: Complete Verification

**Files:**
- Verify only: `src/services/dashboardRealtimeService.ts`, `src/App.vue`, `src/style.css`, and related tests.

**Interfaces:**
- Consumes: published progress events, project-room subscription, canonical workspace reload, and the computed chart.
- Produces: verified immediate manager-dashboard synchronization with a responsive layout.

- [ ] **Step 1: Run focused tests**

Run `npx vitest run tests/dashboard-realtime-service.spec.ts tests/project-progress-events.spec.ts tests/workspace-service.spec.ts tests/project-analytics.spec.ts tests/project-analytics-ui.spec.ts`.

Expected: PASS; events publish after task updates, dashboard joins rooms, timestamps map, and trend/layout checks pass.

- [ ] **Step 2: Build the production client**

Run `npm run build`.

Expected: exit code 0 from `vue-tsc --noEmit --incremental false && vite build`.

- [ ] **Step 3: Inspect the scoped diff**

Run `git diff HEAD -- src/services/dashboardRealtimeService.ts src/App.vue src/style.css tests/dashboard-realtime-service.spec.ts tests/project-analytics-ui.spec.ts`.

Expected: only dashboard subscription, authoritative refresh, trend rendering, layout geometry, and test changes are present.
