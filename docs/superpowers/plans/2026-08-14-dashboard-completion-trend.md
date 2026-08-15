# 首页任务完成趋势 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在首页工作台显示基于真实任务完成记录的任务完成趋势，并在任务数据刷新后更新。

**Architecture:** 服务端任务列表复用审计日志，返回任务创建时间及首次完成时间。客户端任务状态保留两个时间字段；首页调用现有 `buildProjectAnalytics` 聚合完成日期，并以柱状趋势替换固定空白占位。

**Tech Stack:** Vue 3、TypeScript、NestJS、MySQL、Vitest。

## Global Constraints

- 复用 `audit_logs`，不新增表或迁移。
- 仅统计当前状态为 `completed` 且有可验证完成时间的任务。
- 首页与项目详情的完成时间口径均为首次达到完成状态。
- 趋势只包含当前用户按角色权限可见的任务。
- 保留当前 `service.load()` 的即时刷新和 10 秒轮询，不引入 WebSocket。

---

### Task 1: 将完成时间纳入首页任务数据

**Files:**
- Modify: `src/server/app.service.ts:334-340`
- Modify: `src/services/workspaceService.ts:8,56`
- Test: `tests/workspace-service.spec.ts`
- Test: `tests/task-management.spec.ts`

**Interfaces:**
- Consumes: `audit_logs` 中 `task.created`、`task.updated` 和 `task.feedback_created` 的完成状态记录。
- Produces: `Task.createdAt: string` 与 `Task.completedAt?: string | null`，由 `GET /tasks` 传至首页状态。

- [ ] **Step 1: Write the failing server test**

在 `tests/task-management.spec.ts` 增加测试，调用 `new AppService({} as any).tasks(manager)` 后断言 SQL 包含 `t.created_at`、`completed_at` 别名及 `audit_logs` 的 `completed` 状态筛选。

```ts
expect(query).toHaveBeenCalledWith(expect.stringContaining('t.created_at'), ['manager-1'])
expect(query).toHaveBeenCalledWith(expect.stringContaining(') completed_at'), ['manager-1'])
expect(query).toHaveBeenCalledWith(expect.stringContaining("JSON_UNQUOTE(JSON_EXTRACT(l.details,'$.status'))='completed'"), ['manager-1'])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/task-management.spec.ts`

Expected: FAIL because the `/tasks` SQL does not select `created_at` or `completed_at`.

- [ ] **Step 3: Write the minimal server implementation**

Extend the `tasks()` query to select `t.created_at` and the same `COALESCE` completion-time subquery already used by `projectDetail()`.

```ts
SELECT t.id,t.title,t.description,t.priority,t.status,t.progress,t.created_at,
  COALESCE(
    (SELECT MIN(l.created_at) FROM audit_logs l WHERE l.entity_type='task' AND l.entity_id=t.id AND l.action IN ('task.created','task.updated') AND JSON_UNQUOTE(JSON_EXTRACT(l.details,'$.status'))='completed'),
    (SELECT MIN(l.created_at) FROM audit_logs l WHERE l.action='task.feedback_created' AND JSON_UNQUOTE(JSON_EXTRACT(l.details,'$.taskId'))=t.id AND JSON_EXTRACT(l.details,'$.progress')=100)
  ) completed_at,
  t.due_date,p.id project_id,p.name project_name,u.id assignee_id,u.name assignee_name
```

- [ ] **Step 4: Write the failing client mapping test**

Add a `workspace-service` test that returns one `/tasks` record containing `created_at` and `completed_at`, calls `service.load()`, then checks both camel-case fields in `service.state.tasks[0]`.

```ts
expect(service.state.tasks[0]).toEqual(expect.objectContaining({
  createdAt: '2026-08-14T09:00:00.000Z',
  completedAt: '2026-08-14T10:00:00.000Z',
}))
```

- [ ] **Step 5: Run client test to verify it fails**

Run: `npx vitest run tests/workspace-service.spec.ts`

Expected: FAIL because `Task` and `mapTask()` discard both timestamps.

- [ ] **Step 6: Write the minimal client implementation**

Extend `Task` and `mapTask()`.

```ts
export interface Task {
  id: string; title: string; description?: string; project: string; projectId?: string
  owner: string; assigneeId?: string; due: string; priority: '紧急' | '高' | '中' | '低'
  rawPriority?: 'low' | 'medium' | 'high' | 'urgent'; state: TaskState; progress: number
  source?: 'ai-review'; createdAt: string; completedAt?: string | null
}
const mapTask = (item: any): Task => ({
  id: item.id, title: item.title, description: item.description ?? undefined,
  project: item.project_name, projectId: item.project_id, owner: item.assignee_name,
  assigneeId: item.assignee_id, due: item.due_date ?? '未设置',
  priority: priorityMap[item.priority as keyof typeof priorityMap] ?? '中', rawPriority: item.priority,
  state: taskStateMap[item.status as keyof typeof taskStateMap] ?? 'todo', progress: Number(item.progress ?? 0),
  createdAt: item.created_at ?? item.createdAt ?? '',
  completedAt: item.completed_at ?? item.completedAt ?? null,
})
```

- [ ] **Step 7: Run focused tests to verify they pass**

Run: `npx vitest run tests/task-management.spec.ts tests/workspace-service.spec.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/server/app.service.ts src/services/workspaceService.ts tests/task-management.spec.ts tests/workspace-service.spec.ts
git commit -m "feat: expose task completion timestamps"
```

### Task 2: 在首页渲染真实完成趋势

**Files:**
- Modify: `src/App.vue:20,201-205,612`
- Test: `tests/project-analytics-ui.spec.ts`

**Interfaces:**
- Consumes: `data.tasks` 的 `state`、`createdAt`、`completedAt` 与 `buildProjectAnalytics()`。
- Produces: `dashboardCompletionTrend`，类型为 `{ date: string; count: number }[]`，供首页趋势区域渲染。

- [ ] **Step 1: Write the failing UI-source test**

在 `tests/project-analytics-ui.spec.ts` 增加断言：首页导入并调用 `buildProjectAnalytics`，趋势模板以 `v-for` 渲染 `dashboardCompletionTrend`，且不再包含原来的“未伪造历史趋势数据”固定说明。

```ts
expect(source).toContain("import { buildProjectAnalytics } from './utils/projectAnalytics'")
expect(source).toContain('const dashboardCompletionTrend = computed(() =>')
expect(source).toContain('v-for="point in dashboardCompletionTrend"')
expect(source).not.toContain('未伪造历史趋势数据')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/project-analytics-ui.spec.ts`

Expected: FAIL because `App.vue` contains only a static empty state.

- [ ] **Step 3: Write the minimal dashboard implementation**

Import the analytics helper, compute trends from visible tasks, and render bars only when data exists.

```ts
const dashboardCompletionTrend = computed(() => buildProjectAnalytics({
  tasks: data.tasks.map((task) => ({
    id: task.id, title: task.title, status: task.state === 'in-progress' ? 'in_progress' : task.state,
    createdAt: task.createdAt, completedAt: task.completedAt, dueDate: task.due,
  })),
  risks: [],
}, new Date().toISOString()).completionTrend)
```

```vue
<div v-if="dashboardCompletionTrend.length" class="bar-list dashboard-trend">
  <div v-for="point in dashboardCompletionTrend" :key="point.date" class="bar-row">
    <span>{{ point.date }}</span><i :style="{ width: `${Math.min(100, point.count * 20)}%` }"></i><b>{{ point.count }}</b>
  </div>
</div>
<div v-else class="empty-cell">暂无可追溯的任务完成记录</div>
```

- [ ] **Step 4: Run the UI test to verify it passes**

Run: `npx vitest run tests/project-analytics-ui.spec.ts`

Expected: PASS.

- [ ] **Step 5: Run the relevant analytic tests**

Run: `npx vitest run tests/project-analytics.spec.ts tests/project-analytics-ui.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/App.vue tests/project-analytics-ui.spec.ts
git commit -m "feat: render dashboard completion trend"
```

### Task 3: 全量验证

**Files:**
- Verify only: `src/server/app.service.ts`, `src/services/workspaceService.ts`, `src/App.vue`

**Interfaces:**
- Consumes: Task 1 的完成时间字段与 Task 2 的趋势组件。
- Produces: 通过测试与构建验证的首页趋势功能。

- [ ] **Step 1: Run feature-focused tests**

Run: `npx vitest run tests/task-management.spec.ts tests/workspace-service.spec.ts tests/project-analytics.spec.ts tests/project-analytics-ui.spec.ts`

Expected: PASS with zero failures.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: exit code 0; Vue type check and Vite build complete successfully.

- [ ] **Step 3: Inspect the scoped diff**

Run: `git diff HEAD -- src/server/app.service.ts src/services/workspaceService.ts src/App.vue tests/task-management.spec.ts tests/workspace-service.spec.ts tests/project-analytics-ui.spec.ts`

Expected: only completion-time propagation and dashboard trend rendering changes.
