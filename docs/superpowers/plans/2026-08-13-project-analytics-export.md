# Project Analytics and Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add role-scoped project analytics and immediate Excel/PDF exports for meeting minutes, task lists, and project statistics.

**Architecture:** The NestJS service exposes one authorized, structured export-data endpoint and reuses a pure analytics helper to maintain one calculation source for exports and the analysis view. Vue renders native CSS/SVG analytics from that payload and generates `.xlsx`/PDF files in the browser after the server has authorized and audited the request.

**Tech Stack:** Vue 3, TypeScript, NestJS, MySQL, Vitest, SheetJS (`xlsx`), jsPDF.

## Global Constraints

- Project managers export only projects they own; administrators export all projects.
- Members export only their own task list; project-level meeting and statistics exports are forbidden.
- Auditors have no business export endpoint; audit-log export remains out of scope.
- Each successful export is recorded as `export.requested` without meeting or task body content.
- Output is generated locally by the browser and never stored by the server.
- Empty data produces an explanatory UI state and no misleading zero-value chart.

---

### Task 1: Shared Analytics Calculation

**Files:**
- Create: `src/utils/projectAnalytics.ts`
- Test: `tests/project-analytics.spec.ts`

**Interfaces:**
- Produces `buildProjectAnalytics(input: ProjectAnalyticsInput, today: string): ProjectAnalytics`.
- `ProjectAnalytics` contains `metrics`, `completionTrend`, `riskDistribution`, `ganttTasks`, and `undatedTasks`.

- [ ] **Step 1: Write failing tests for the task and risk calculation rules**

```ts
import { describe, expect, it } from 'vitest'
import { buildProjectAnalytics } from '../src/utils/projectAnalytics'

describe('buildProjectAnalytics', () => {
  it('counts completed, overdue and open risk items without treating closed work as overdue', () => {
    const result = buildProjectAnalytics({
      tasks: [
        { id: 'done', status: 'completed', dueDate: '2026-08-01', createdAt: '2026-07-01', completedAt: '2026-08-01' },
        { id: 'late', status: 'in_progress', dueDate: '2026-08-01', createdAt: '2026-07-01' },
        { id: 'closed', status: 'closed', dueDate: '2026-08-01', createdAt: '2026-07-01' },
      ], risks: [{ level: 'high', status: 'open' }], meetingCount: 2,
    }, '2026-08-13')
    expect(result.metrics).toMatchObject({ taskCount: 3, completedTaskCount: 1, overdueTaskCount: 1, openRiskCount: 1, meetingCount: 2 })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails because the helper does not exist**

Run: `npm test -- tests/project-analytics.spec.ts`

Expected: FAIL with module-not-found error for `projectAnalytics`.

- [ ] **Step 3: Implement the pure types and calculation helper**

```ts
export function buildProjectAnalytics(input: ProjectAnalyticsInput, today: string): ProjectAnalytics {
  const overdue = input.tasks.filter((task) => task.dueDate && task.dueDate < today && !['completed', 'closed'].includes(task.status))
  const completed = input.tasks.filter((task) => task.status === 'completed')
  return { metrics: { taskCount: input.tasks.length, completedTaskCount: completed.length, completionRate: input.tasks.length ? Math.round(completed.length / input.tasks.length * 100) : null, overdueTaskCount: overdue.length, openRiskCount: input.risks.filter((risk) => risk.status === 'open').length, meetingCount: input.meetingCount }, completionTrend: groupCompletedTasks(completed), riskDistribution: groupRisks(input.risks), ganttTasks: datedTasks(input.tasks), undatedTasks: input.tasks.filter((task) => !task.dueDate) }
}
```

- [ ] **Step 4: Add failing cases for empty tasks, completed date grouping, risk levels, and undated tasks**

```ts
it('returns a null completion rate and separates tasks with no due date', () => {
  const result = buildProjectAnalytics({ tasks: [{ id: 'open', status: 'todo', createdAt: '2026-08-10' }], risks: [], meetingCount: 0 }, '2026-08-13')
  expect(result.metrics.completionRate).toBe(0)
  expect(result.undatedTasks.map((task) => task.id)).toEqual(['open'])
  expect(result.riskDistribution).toEqual([])
})
```

- [ ] **Step 5: Complete the minimal grouping and date-normalization logic, then run the focused test**

Run: `npm test -- tests/project-analytics.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit the helper and its tests**

```powershell
git add src/utils/projectAnalytics.ts tests/project-analytics.spec.ts
git commit -m "feat: add project analytics calculations"
```

### Task 2: Authorized Export Data API and Audit Trail

**Files:**
- Modify: `src/server/app.controller.ts`
- Modify: `src/server/app.service.ts`
- Test: `tests/project-export.spec.ts`

**Interfaces:**
- Adds `GET /api/projects/:id/export-data?kind=meetings|tasks|summary`.
- Produces `exportProjectData(user, projectId, kind): ExportPayload`.
- Consumes `buildProjectAnalytics` data shape or an equivalent server-safe copy in `src/server`.

- [ ] **Step 1: Write failing service tests for role boundaries and auditing**

```ts
it('returns an owned manager project summary and records the export request', async () => {
  // Mock project, tasks, meetings and risks query results.
  const result = await service.exportProjectData(manager, 'project-1', 'summary')
  expect(result.kind).toBe('summary')
  expect(execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_logs'), expect.arrayContaining(['manager-1', 'export.requested', 'project', 'project-1']))
})

it('rejects project-level exports by a member before audit mutation', async () => {
  await expect(service.exportProjectData(member, 'project-1', 'summary')).rejects.toThrow('Members can only export their own tasks')
  expect(execute).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the tests and verify the new API method is absent**

Run: `npm test -- tests/project-export.spec.ts`

Expected: FAIL because `exportProjectData` is not defined.

- [ ] **Step 3: Implement scoped source queries and response types in `AppService`**

```ts
async exportProjectData(user: SessionUser, projectId: string, kind: ExportKind) {
  if (user.role === 'auditor') throw new ForbiddenException('Audit role cannot export project business data')
  const scope = await this.exportScope(user, projectId, kind)
  const payload = await this.loadExportPayload(projectId, scope, kind)
  await this.audit(user.id, 'export.requested', 'project', projectId, { kind, scope: scope.kind })
  return payload
}
```

The scope resolver must use `assertProjectManager` for managers, permit administrators, and apply `assignee_id = user.id` for member task exports. Return no raw meeting content beyond the specified summary fields.

- [ ] **Step 4: Add controller route and validate `kind` explicitly**

```ts
@Get('projects/:id/export-data')
async exportData(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Query('kind') kind: string) {
  if (!['meetings', 'tasks', 'summary'].includes(kind)) throw new BadRequestException('Unsupported export kind')
  return this.app.exportProjectData(await this.user(authorization), id, kind as ExportKind)
}
```

- [ ] **Step 5: Add the administrator success and member own-task filtering tests, then run the focused suite**

Run: `npm test -- tests/project-export.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit the API contract, authorization, audit coverage, and tests**

```powershell
git add src/server/app.controller.ts src/server/app.service.ts tests/project-export.spec.ts
git commit -m "feat: add authorized project export data"
```

### Task 3: Browser File Builders

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/utils/projectExport.ts`
- Test: `tests/project-export-file.spec.ts`

**Interfaces:**
- Consumes `ExportPayload` from Task 2.
- Produces `downloadProjectExport(payload, format: 'xlsx' | 'pdf'): Promise<void>`.

- [ ] **Step 1: Add failing tests for workbook rows and filename generation**

```ts
it('creates a UTF-8 safe task export filename and task sheet rows', () => {
  expect(exportFilename('会议系统', 'tasks', 'xlsx', '2026-08-13')).toBe('会议系统-任务清单-2026-08-13.xlsx')
  expect(taskRows([{ title: '完善导出', assigneeName: '张三', status: 'todo', progress: 0 }])[0]).toMatchObject({ '任务标题': '完善导出', '负责人': '张三' })
})
```

- [ ] **Step 2: Run the test to verify missing browser-builder functions**

Run: `npm test -- tests/project-export-file.spec.ts`

Expected: FAIL with module-not-found error for `projectExport`.

- [ ] **Step 3: Install the browser-only export dependencies**

Run: `npm install xlsx jspdf jspdf-autotable`

Expected: dependencies appear in `package.json` and lockfile.

- [ ] **Step 4: Implement pure row builders before browser download calls**

```ts
export function taskRows(tasks: ExportTask[]) {
  return tasks.map((task) => ({ 项目: task.projectName, 任务标题: task.title, 描述: task.description ?? '', 负责人: task.assigneeName, 优先级: priorityText(task.priority), 状态: statusText(task.status), 进度: `${task.progress}%`, 创建时间: task.createdAt, 截止日期: task.dueDate ?? '未设置' }))
}
```

- [ ] **Step 5: Implement XLSX and A4 landscape PDF generation with object URLs**

Use SheetJS `utils.json_to_sheet` and `writeFileXLSX` for workbooks. Use jsPDF plus `autoTable` for tables. The summary export must include metrics, trend, risk distribution and gantt rows; the meeting export uses summary and decisions, never raw original minutes.

- [ ] **Step 6: Run the focused test and then the type-check build**

Run: `npm test -- tests/project-export-file.spec.ts`

Run: `npm run build`

Expected: both commands exit 0.

- [ ] **Step 7: Commit browser exporters and dependencies**

```powershell
git add package.json package-lock.json src/utils/projectExport.ts tests/project-export-file.spec.ts
git commit -m "feat: generate project Excel and PDF exports"
```

### Task 4: Analytics View and Project-Level Export Controls

**Files:**
- Modify: `src/services/workspaceService.ts`
- Modify: `src/components/ProjectDetailPage.vue`
- Modify: `src/style.css`
- Test: `tests/project-analytics-ui.spec.ts`

**Interfaces:**
- `getProjectExportData(projectId, kind)` returns Task 2's payload.
- `ProjectDetailPage` adds an `analytics` tab and role-gated export menu.

- [ ] **Step 1: Write failing UI contract tests**

```ts
it('declares an analytics tab and project-level export options for managers', () => {
  const source = readFileSync('src/components/ProjectDetailPage.vue', 'utf8')
  expect(source).toContain("{ id: 'analytics', label: '分析' }")
  expect(source).toContain('导出项目数据')
  expect(source).toContain('getProjectExportData')
})

it('renders explicit empty analytics guidance instead of a zero chart', () => {
  expect(readFileSync('src/components/ProjectDetailPage.vue', 'utf8')).toContain('暂无任务，暂不生成完成趋势图')
})
```

- [ ] **Step 2: Run the UI test to establish the red state**

Run: `npm test -- tests/project-analytics-ui.spec.ts`

Expected: FAIL because the tab and export client method are absent.

- [ ] **Step 3: Add the typed export request to `workspaceService`**

```ts
async getProjectExportData(projectId: string, kind: 'meetings' | 'tasks' | 'summary') {
  return request<ExportPayload>(`/projects/${projectId}/export-data?kind=${kind}`)
}
```

- [ ] **Step 4: Add the analysis tab and reusable local SVG/CSS visualizations**

Render metric cards, the completion trend bar chart, risk distribution bar chart, dated-task gantt rows, and an undated-task list. Reuse label helpers for priorities and statuses. Do not add a chart framework. Display the new project export button only for `manager` and `admin`; map each object/format command to the Task 3 downloader and keep it disabled while a request is pending.

- [ ] **Step 5: Add responsive styles with stable chart tracks and horizontal gantt scrolling**

Use `minmax`, fixed timeline grid columns, and overflow scrolling to keep labels and task bars readable on narrow screens. Maintain existing panel and tab styling.

- [ ] **Step 6: Run focused UI tests and build**

Run: `npm test -- tests/project-analytics-ui.spec.ts`

Run: `npm run build`

Expected: both commands exit 0.

- [ ] **Step 7: Commit the analytics view and manager/admin export controls**

```powershell
git add src/services/workspaceService.ts src/components/ProjectDetailPage.vue src/style.css tests/project-analytics-ui.spec.ts
git commit -m "feat: add project analytics and export controls"
```

### Task 5: My-Task Export Control and End-to-End Verification

**Files:**
- Modify: `src/components/TaskBoardPage.vue`
- Modify: `src/style.css`
- Test: `tests/task-export-ui.spec.ts`
- Test: `tests/project-export.spec.ts`

**Interfaces:**
- Members invoke `getProjectExportData(projectId, 'tasks')`; the server enforces own-task filtering.

- [ ] **Step 1: Write the failing task-board UI test**

```ts
it('offers a task-list export control without exposing project meeting or summary exports', () => {
  const source = readFileSync('src/components/TaskBoardPage.vue', 'utf8')
  expect(source).toContain('导出我的任务')
  expect(source).toContain("'tasks'")
  expect(source).not.toContain("'meetings'")
})
```

- [ ] **Step 2: Run the test and confirm it fails for the absent control**

Run: `npm test -- tests/task-export-ui.spec.ts`

Expected: FAIL.

- [ ] **Step 3: Add a task-only export control for each selected/current project**

When a member has no project filter, offer a project selector before export. Managers and administrators may export the currently filtered project's task list from this page. Do not expose meeting or project-statistics options here. Reuse Task 3 downloader and show server error messages to the user.

- [ ] **Step 4: Run focused tests, the full test suite, build, and smoke workflow**

Run: `npm test -- tests/task-export-ui.spec.ts tests/project-export.spec.ts`

Run: `npm test`

Run: `npm run build`

Run: `npx tsx scripts/smoke-project-core-closure.ts`

Expected: all commands exit 0. The smoke script requires the configured MySQL instance; report this explicitly if it cannot connect.

- [ ] **Step 5: Review the diff against the approved specification and commit**

Confirm: managers/admins receive all three project export kinds; members only receive their own task export; auditors receive no business export; each successful request creates one audit row; analysis empty states do not draw data-free charts.

```powershell
git add src/components/TaskBoardPage.vue src/style.css tests/task-export-ui.spec.ts tests/project-export.spec.ts
git commit -m "feat: add scoped task export control"
```
