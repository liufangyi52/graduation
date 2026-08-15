# Acceptance Blockers Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every authorization, workflow-integrity, data-consistency, runtime-configuration, and dependency blocker identified by final acceptance review.

**Architecture:** Keep the existing NestJS/Vue service boundaries. Centralize current-membership and task-state rules in small helpers, make review approval and deadline-notification deduplication transactional, and expose explicit risk/settings read models to the frontend. Use additive MySQL migrations and preserve all historical project, task, notification, and completion records.

**Tech Stack:** TypeScript, Vue 3, NestJS 11, MySQL 8, Socket.IO, Vitest, Vite, `write-excel-file`.

## Global Constraints

- Historical task assignment never substitutes for current project membership.
- Only active system `manager` and `member` accounts may join projects or receive tasks.
- Review approval must be idempotent under concurrent requests.
- Runtime model and default mode come from `system_settings`; secrets remain environment-only.
- Except for the terminal `closed` state, `completed` and progress `100` always imply one another.
- Deadline reminders notify the active assignee and active project owner, with one unread notification per task, warning type, and recipient.
- Existing `risks.task_id` remains nullable and uses `ON DELETE SET NULL`.
- No real `.env` values, API keys, meeting content, feedback text, or passwords may enter tests, logs, audit details, or commits.
- Every production change follows RED, GREEN, REFACTOR in that order.

---

### Task 1: Enforce Current Membership And Eligible Project Roles

**Files:**
- Modify: `tests/project-members.spec.ts`
- Modify: `tests/role-separation.spec.ts`
- Modify: `tests/project-progress-events.spec.ts`
- Modify: `src/server/app.service.ts:327-488,681-780,1135-1143`
- Modify: `src/server/project-progress-events.service.ts`
- Modify: `src/server/project-progress.gateway.ts`

**Interfaces:**
- Consumes: `SessionUser`, task `{ project_id, assignee_id }`, and `project_members(project_id,user_id)`.
- Produces: `AppService.assertCurrentTaskAccess(...)`, `ProjectProgressEventsService.revokeMember(projectId,userId)`, and `ProjectProgressGateway.revokeMember(projectId,userId)`.

- [ ] **Step 1: Write failing authorization tests**

Add tests that prove an active `admin` and `auditor` are rejected by both `addProjectMember` and task assignment, a removed member receives `ForbiddenException` from task update/feedback/note paths even while still assigned, member task/risk list SQL requires `project_members`, and member removal invokes realtime revocation.

```ts
it.each(['admin', 'auditor'] as const)('rejects an active %s as a project member', async (role) => {
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
    .mockResolvedValueOnce([[{ id: `${role}-1`, role, is_active: 1 }]] as any)
  await expect(new AppService({} as any).addProjectMember(manager, 'project-1', `${role}-1`, 'member'))
    .rejects.toThrow('Project member must be an active manager or member')
})

it('revokes a removed assignee from direct task mutation', async () => {
  vi.spyOn(pool, 'query').mockResolvedValueOnce([[{
    id: 'task-1', project_id: 'project-1', assignee_id: 'member-1', status: 'todo', progress: 0,
  }]] as any)
  const connection = lockedConnection([{ id: 'task-1', project_id: 'project-1', assignee_id: 'member-1', status: 'todo', progress: 0 }], [])
  vi.spyOn(pool, 'getConnection').mockResolvedValue(connection as any)
  await expect(new AppService({} as any).updateTask(member, 'task-1', { progress: 20 }))
    .rejects.toThrow('You cannot access this task')
})
```

Add a gateway/service test with fake sockets whose `data.user.id` values differ; assert only the removed user's socket calls `leave('project:project-1')`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npx vitest run tests/project-members.spec.ts tests/role-separation.spec.ts tests/project-progress-events.spec.ts`

Expected: FAIL because membership insertion checks only `is_active`, task mutations trust `assignee_id`, list queries omit current membership, and no realtime revocation method exists.

- [ ] **Step 3: Implement current-membership authorization**

Add a private helper in `AppService` and call it from member update, feedback, and note paths using the current transaction connection where available:

```ts
private async assertCurrentTaskAccess(user: SessionUser, task: { project_id: string; assignee_id: string }, query = pool.query.bind(pool)) {
  if (user.role === 'manager') return this.assertProjectManager(user, task.project_id)
  if (user.role !== 'member' || task.assignee_id !== user.id) throw new ForbiddenException('You cannot access this task')
  const [memberships] = await query('SELECT 1 FROM project_members WHERE project_id=? AND user_id=?', [task.project_id, user.id])
  if (!memberships[0]) throw new ForbiddenException('You cannot access this task')
}
```

Require `JOIN project_members pm ON pm.project_id=t.project_id AND pm.user_id=t.assignee_id` plus `pm.user_id=?` in member task/overdue/note/risk read paths. Change member-add and assignment lookups to include:

```sql
u.is_active=TRUE AND u.role IN ('manager','member')
```

Implement realtime revocation:

```ts
async revokeMember(projectId: string, userId: string) {
  const sockets = await this.server.in(`project:${projectId}`).fetchSockets()
  await Promise.all(sockets.filter((socket) => socket.data.user?.id === userId).map((socket) => socket.leave(`project:${projectId}`)))
}
```

Call `await this.progressEvents?.revokeMember(projectId, userId)` after a successful membership deletion.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npx vitest run tests/project-members.spec.ts tests/role-separation.spec.ts tests/project-progress-events.spec.ts tests/authorization-boundary.spec.ts`

Expected: PASS with former-member and ineligible-role coverage.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/server/app.service.ts src/server/project-progress-events.service.ts src/server/project-progress.gateway.ts tests/project-members.spec.ts tests/role-separation.spec.ts tests/project-progress-events.spec.ts
git commit -m "fix: revoke removed project member access"
```

### Task 2: Make Review Approval Idempotent And Assignee-Safe

**Files:**
- Modify: `tests/review-draft.spec.ts`
- Modify: `tests/meeting-workflow.spec.ts`
- Modify: `src/server/app.service.ts:1009-1044`

**Interfaces:**
- Consumes: pending analysis ID, owning manager, saved review draft, and active project membership.
- Produces: one committed approval result and no duplicate task/notification/risk writes.

- [ ] **Step 1: Write failing locked-review tests**

Add one test where the transaction's locked analysis row is already `approved`; assert the service rejects before any `UPDATE ai_analyses` or task insert. Add one test where the draft email resolves to an inactive member and the active project owner becomes both task assignee and notification recipient. Add one test where the project owner is inactive and approval rolls back.

```ts
it('rechecks pending status after locking the analysis row', async () => {
  const connection = reviewConnection({ id: 'analysis-1', status: 'approved', project_id: 'project-1', owner_id: 'manager-1' })
  vi.spyOn(pool, 'getConnection').mockResolvedValue(connection as any)
  await expect(new AppService({} as any).reviewAnalysis(manager, 'analysis-1', true))
    .rejects.toThrow('Analysis has already been reviewed')
  expect(connection.execute).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO tasks'), expect.anything())
})
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npx vitest run tests/review-draft.spec.ts tests/meeting-workflow.spec.ts`

Expected: FAIL because analysis status is read before the transaction, the update is unconditional, and assignee lookup omits active/system-role checks.

- [ ] **Step 3: Lock and resolve inside one transaction**

Move the authoritative analysis lookup into the transaction:

```sql
SELECT a.*,m.project_id,m.title meeting_title,p.owner_id,u.is_active owner_is_active,u.role owner_role
FROM ai_analyses a
JOIN meetings m ON m.id=a.meeting_id
JOIN projects p ON p.id=m.project_id
JOIN users u ON u.id=p.owner_id
WHERE a.id=? AND p.deleted_at IS NULL
FOR UPDATE
```

Validate manager ownership and `status='pending'` from this row. Resolve task emails with current membership, `u.is_active=TRUE`, and `u.role IN ('manager','member')`. Require the fallback owner to be active with system role `manager`; otherwise throw `BadRequestException('Project owner is not an active task assignee')`. Keep task, notification, and risk inserts on the same connection and commit once.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npx vitest run tests/review-draft.spec.ts tests/meeting-workflow.spec.ts tests/role-separation.spec.ts`

Expected: PASS; repeated locked reviews produce no business inserts and inactive emails fall back correctly.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/server/app.service.ts tests/review-draft.spec.ts tests/meeting-workflow.spec.ts
git commit -m "fix: serialize analysis approval"
```

### Task 3: Return And Display The Real Risk Task Link

**Files:**
- Modify: `tests/risk-warning.spec.ts`
- Modify: `tests/workspace-service.spec.ts`
- Modify: `tests/task-board-ui.spec.ts`
- Modify: `src/server/app.service.ts:1135-1143`
- Modify: `src/services/workspaceService.ts:1-90`
- Modify: `src/components/TaskBoardPage.vue:37-46`
- Modify: `src/App.vue:806`

**Interfaces:**
- Consumes: API fields `task_id`, `task_title`, and risk `description`.
- Produces: frontend `Risk { taskId?: string; task: string; description?: string }`.

- [ ] **Step 1: Write failing API and UI mapping tests**

```ts
it('maps risk task identity separately from its description', async () => {
  fetchMock.mockResolvedValueOnce(json([{ id: 'risk-1', description: 'Delay reason', task_id: 'task-1', task_title: 'Ship release' }]))
  await service.load()
  expect(service.state.risks[0]).toMatchObject({ taskId: 'task-1', task: 'Ship release', description: 'Delay reason' })
})
```

Assert risk SQL selects `t.title task_title`, the task board contains `risk.taskId === task.id`, and the risk center contains `risk.task || '项目级风险'`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx vitest run tests/risk-warning.spec.ts tests/workspace-service.spec.ts tests/task-board-ui.spec.ts`

Expected: FAIL because `description` is mapped into `task` and the task filter searches text for the task ID.

- [ ] **Step 3: Implement the explicit read model**

Use `LEFT JOIN tasks t ON t.id=r.task_id` for manager/admin risk queries and the existing required join for members. Select `r.*`, `t.title task_title`, and `u.name project_owner_name`. Add current membership to the member branch. Map fields independently:

```ts
({ id: item.id, title: item.title, description: item.description ?? undefined,
   taskId: item.task_id ?? undefined, task: item.task_title ?? '', ... })
```

Change the task-board predicate to `risk.status !== '已处理' && risk.taskId === task.id`. Render `risk.task || '项目级风险'` in the risk table.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npx vitest run tests/risk-warning.spec.ts tests/workspace-service.spec.ts tests/task-board-ui.spec.ts`

Expected: PASS with real task titles and ID-based filtering.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/server/app.service.ts src/services/workspaceService.ts src/components/TaskBoardPage.vue src/App.vue tests/risk-warning.spec.ts tests/workspace-service.spec.ts tests/task-board-ui.spec.ts
git commit -m "fix: expose linked risk tasks"
```

### Task 4: Apply Stored Analysis Model And Default Mode At Runtime

**Files:**
- Modify: `tests/admin-settings.spec.ts`
- Modify: `tests/analysis-runner.spec.ts`
- Modify: `tests/meeting-workflow.spec.ts`
- Modify: `tests/ai-settings.spec.ts`
- Modify: `src/server/deepseek.service.ts`
- Modify: `src/server/analysis-runner.ts`
- Modify: `src/server/app.service.ts:554-568,916-938,1057-1084`
- Modify: `src/server/app.controller.ts`
- Modify: `src/services/meetingService.ts`
- Modify: `src/App.vue:91-143,368-374`

**Interfaces:**
- Consumes: `system_settings(model,mode)`, optional request mode, environment model fallback, and existing `normalizeSystemModel`/`normalizeSystemAnalysisMode` helpers from `src/server/ai-settings.ts`.
- Produces: `AnalysisRuntimeSettings { model: string; mode: AnalysisMode }`, `AppService.getAnalysisSettings(user)`, and `GET /api/analysis-settings`.

- [ ] **Step 1: Write failing runtime-settings tests**

Add tests showing an omitted request mode uses stored `rag`, a requested `manual` overrides it, stored model reaches the DeepSeek extraction and Agent planning request bodies plus execution metadata, and a manager can fetch only `{ model, mode }` from `/analysis-settings`.

```ts
expect(provider.analyzeWithPlan).toHaveBeenCalledWith('Minutes', 'masked', undefined, 'deepseek-v4-pro')
expect(result.metadata.model).toBe('deepseek-v4-pro')
```

Add a UI source test proving managers call `meetings.analysisSettings()` and initialize `meetingAnalysisMode` from the response.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx vitest run tests/admin-settings.spec.ts tests/analysis-runner.spec.ts tests/meeting-workflow.spec.ts tests/ai-settings.spec.ts`

Expected: FAIL because runtime execution reads `process.env.DEEPSEEK_MODEL`, manager UI never loads settings, and service method defaults force `llm` before the server can apply its default.

- [ ] **Step 3: Pass resolved settings explicitly**

Add:

```ts
export type AnalysisRuntimeSettings = { model: string; mode: AnalysisMode }

private async analysisRuntimeSettings(requestedMode?: AnalysisMode): Promise<AnalysisRuntimeSettings> {
  const [rows] = await pool.query<any[]>('SELECT model,mode FROM system_settings WHERE id=1')
  const model = normalizeSystemModel(rows[0]?.model ?? process.env.DEEPSEEK_MODEL)
  return { model, mode: requestedMode ?? normalizeSystemAnalysisMode(rows[0]?.mode) }
}
```

Extend `AnalysisRunnerInput` with `model: string`; pass it to `plan`, `analyzeWithPlan`, and `analyzeWithContext` as the final argument and use it in metadata (`null` only for manual execution metadata because no model is called). Extend `DeepSeekService.requestCompletion(..., model)` so every provider request body uses the passed model without mutating environment state. Persist the same resolved model and mode in `ai_analyses`.

Expose `GET /api/analysis-settings` through `getAnalysisSettings(user)`, require `user.role === 'manager'`, and return only normalized model/mode; add a regression test proving members cannot call it. Remove client defaults from `analyze` and `reanalyze` so omitted mode serializes as `{}`. Load manager defaults when `App.vue` initializes.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npx vitest run tests/admin-settings.spec.ts tests/analysis-runner.spec.ts tests/meeting-workflow.spec.ts tests/ai-settings.spec.ts tests/analysis-mode-ui.spec.ts`

Expected: PASS with stored defaults reaching both provider and UI.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/server/deepseek.service.ts src/server/analysis-runner.ts src/server/app.service.ts src/server/app.controller.ts src/services/meetingService.ts src/App.vue tests/admin-settings.spec.ts tests/analysis-runner.spec.ts tests/meeting-workflow.spec.ts tests/ai-settings.spec.ts
git commit -m "fix: apply runtime analysis settings"
```

### Task 5: Centralize Task Status And Progress Invariants

**Files:**
- Modify: `tests/authorization.spec.ts`
- Modify: `tests/task-management.spec.ts`
- Modify: `tests/project-lifecycle.spec.ts`
- Modify: `src/server/authorization.ts`
- Modify: `src/server/app.service.ts:421-488,693-758`

**Interfaces:**
- Consumes: current `{ status, progress }` and optional requested status/progress.
- Produces: `normalizeTaskState(current, requested): { status: TaskStatus; progress: number }`.

- [ ] **Step 1: Write failing normalization tests**

```ts
expect(normalizeTaskState({ status: 'todo', progress: 20 }, { status: 'completed' }))
  .toEqual({ status: 'completed', progress: 100 })
expect(normalizeTaskState({ status: 'completed', progress: 100 }, { status: 'in_progress' }))
  .toEqual({ status: 'in_progress', progress: 99 })
expect(normalizeTaskState({ status: 'completed', progress: 100 }, { status: 'todo' }))
  .toEqual({ status: 'todo', progress: 0 })
expect(normalizeTaskState({ status: 'todo', progress: 0 }, { progress: 100 }))
  .toEqual({ status: 'completed', progress: 100 })
expect(normalizeTaskState({ status: 'in_progress', progress: 70 }, { status: 'closed' }))
  .toEqual({ status: 'closed', progress: 70 })
```

Add service tests for create, member update, feedback, managed update, and reopen persistence using normalized pairs.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx vitest run tests/authorization.spec.ts tests/task-management.spec.ts tests/project-lifecycle.spec.ts`

Expected: FAIL because no shared normalizer exists and current paths update status/progress independently.

- [ ] **Step 3: Implement and use one normalizer**

```ts
export function normalizeTaskState(current: { status: TaskStatus; progress: number }, requested: { status?: TaskStatus; progress?: number }) {
  let status = requested.status ?? current.status
  let progress = requested.progress ?? current.progress
  if (status === 'closed') return { status, progress }
  if (status === 'completed' || progress === 100) return { status: 'completed' as const, progress: 100 }
  if (status === 'todo' && current.progress === 100 && requested.progress === undefined) progress = 0
  if (status === 'in_progress' && current.progress === 100 && requested.progress === undefined) progress = 99
  return { status, progress: Math.min(progress, 99) }
}
```

Call it before every task insert/update and use its result for SQL, event payloads, audit details, deadline checks, and API responses. Keep `closed` progress unchanged; `reopenTask` normalizes from the closed task's stored progress. Preserve the first non-null `completed_at` timestamp.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npx vitest run tests/authorization.spec.ts tests/task-management.spec.ts tests/project-lifecycle.spec.ts tests/project-progress-events.spec.ts`

Expected: PASS with no contradictory state/progress pair.

- [ ] **Step 5: Commit Task 5**

```bash
git add src/server/authorization.ts src/server/app.service.ts tests/authorization.spec.ts tests/task-management.spec.ts tests/project-lifecycle.spec.ts
git commit -m "fix: enforce task state invariants"
```

### Task 6: Add Task-Specific Deadline Risks And Atomic Dual Notifications

**Files:**
- Modify: `tests/risk-warning.spec.ts`
- Modify: `tests/notification-ui.spec.ts`
- Modify: `tests/project-lifecycle.spec.ts`
- Modify: `src/server/migrate.ts:79-90,220-225`
- Modify: `src/server/app.service.ts:493-506,1191-1194`
- Modify: `README.md`

**Interfaces:**
- Consumes: unfinished task with due date, active assignee, and active project owner.
- Produces: warning type `due_soon | overdue`, linked risk, and unique unread notification `dedupe_key`.

- [ ] **Step 1: Write failing warning and migration tests**

Add tests for two same-title tasks producing separate risk inserts, assignee/manager recipients, same-account recipient collapse, duplicate-key no-op, completed-task suppression, and mark-read clearing the key.

```ts
expect(execute).toHaveBeenCalledWith(
  expect.stringContaining('INSERT INTO notifications'),
  expect.arrayContaining(['member-1', expect.stringContaining('task-1:overdue:member-1')]),
)
expect(execute).toHaveBeenCalledWith(
  expect.stringContaining('INSERT INTO notifications'),
  expect.arrayContaining(['manager-1', expect.stringContaining('task-1:overdue:manager-1')]),
)
```

Assert migration source adds `dedupe_key VARCHAR(255) NULL` and unique index `uq_notifications_dedupe_key`, accepts only `ER_DUP_KEYNAME` when that index already exists, and rethrows any other migration error; assert read SQL sets `dedupe_key=NULL`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx vitest run tests/risk-warning.spec.ts tests/notification-ui.spec.ts tests/project-lifecycle.spec.ts`

Expected: FAIL because warning risk dedupes by title, creates no notifications, and the schema has no dedupe key.

- [ ] **Step 3: Add migration and transactional warning writes**

Add the column with `addColumnIfMissing`, then create the unique index while accepting only `ER_DUP_KEYNAME`. In `ensureTaskDeadlineWarnings`, load the active owner and assignee, derive a warning type from calendar dates, and use a connection transaction.

Risk existence query:

```sql
SELECT id FROM risks WHERE task_id=? AND title LIKE ? AND status='open' LIMIT 1
```

Notification insert:

```sql
INSERT INTO notifications (id,user_id,title,body,link,dedupe_key)
VALUES (?,?,?,?,?,?)
ON DUPLICATE KEY UPDATE id=id
```

Use keys `deadline:<taskId>:<warningType>:<recipientId>`. Update mark-read SQL to `SET is_read=TRUE,dedupe_key=NULL`. Update README to distinguish automatic deadline/review notifications from administrator-authored manual notifications.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npx vitest run tests/risk-warning.spec.ts tests/notification-ui.spec.ts tests/project-lifecycle.spec.ts tests/task-management.spec.ts`

Expected: PASS with task-specific risks and deduplicated dual notifications.

- [ ] **Step 5: Commit Task 6**

```bash
git add src/server/migrate.ts src/server/app.service.ts README.md tests/risk-warning.spec.ts tests/notification-ui.spec.ts tests/project-lifecycle.spec.ts
git commit -m "fix: complete deadline warning delivery"
```

### Task 7: Replace Vulnerable Excel Dependency And Verify Acceptance

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/utils/projectExport.ts`
- Modify: `tests/project-export-file.spec.ts`
- Modify: `docs/superpowers/specs/2026-08-14-admin-manual-notifications-design.md`

**Interfaces:**
- Consumes: existing export row objects and localized filename/sheet label.
- Produces: downloaded `.xlsx` Blob through `write-excel-file` with unchanged visible data.

- [ ] **Step 1: Write the failing exporter contract test**

Mock `write-excel-file` and assert the exporter passes an explicit schema derived from row keys, includes all row values, and uses the existing filename. Keep PDF tests unchanged.

```ts
expect(writeXlsxFile).toHaveBeenCalledWith(
  expect.any(Array),
  expect.objectContaining({ fileName: 'Alpha-任务清单-2026-08-16.xlsx' }),
)
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run tests/project-export-file.spec.ts`

Expected: FAIL because the exporter imports and calls `xlsx` instead of `write-excel-file`.

- [ ] **Step 3: Replace dependencies and implementation**

Run:

```powershell
npm uninstall xlsx
npm install write-excel-file@4.1.1
npm update nanoid --registry=https://registry.npmjs.org
```

Implement browser export:

```ts
const columns = data.length ? Object.keys(data[0]) : ['说明']
const schema = columns.map((column) => ({ column, type: String, value: (row: Record<string, unknown>) => text(row[column]) }))
await writeXlsxFile(data.length ? data : [{ 说明: '暂无数据' }], { schema, fileName: filename, sheet: labels[kind] })
```

Update the manual-notification design with a dated supersession note stating that review-assignment and deadline reminders are system-generated exceptions confirmed on 2026-08-16.

- [ ] **Step 4: Run full verification**

Run:

```powershell
npx vitest run tests/project-export-file.spec.ts
npm test
npm run build
npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org
git diff --check
```

Expected: export test passes; all test files and tests pass; build exits zero; audit reports zero high-severity vulnerabilities; diff check reports no newly introduced whitespace errors.

Run read-only MySQL verification:

```sql
SELECT COLUMN_NAME,IS_NULLABLE FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='notifications' AND COLUMN_NAME='dedupe_key';
SELECT INDEX_NAME,NON_UNIQUE FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='notifications' AND INDEX_NAME='uq_notifications_dedupe_key';
SELECT CONSTRAINT_NAME,DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='risks' AND CONSTRAINT_NAME='fk_risks_task';
```

Expected: nullable `dedupe_key` column and unique (`NON_UNIQUE=0`) index exist after the API migration runs; `fk_risks_task` reports `DELETE_RULE='SET NULL'`.

- [ ] **Step 5: Commit, push, and confirm the existing PR**

```bash
git add package.json package-lock.json src/utils/projectExport.ts tests/project-export-file.spec.ts docs/superpowers/specs/2026-08-14-admin-manual-notifications-design.md
git commit -m "fix: remove vulnerable spreadsheet dependency"
git diff --check c440bea..HEAD
git push
gh pr view 1 --repo liufangyi52/graduation --json url,state,isDraft,headRefName,commits
```

Expected: branch `codex/implemented-project-updates` is synchronized with origin and Draft PR #1 contains the final verification commit.

## Plan Self-Review

- Spec coverage: Tasks 1-7 cover all ten acceptance criteria from `2026-08-16-acceptance-blockers-remediation-design.md`.
- Authorization consistency: current membership is checked in list, direct mutation, note, feedback, risk, calendar, overdue, and realtime paths.
- Transaction consistency: the locked analysis row, created tasks, assignment notifications, and linked risks share one connection transaction.
- Type consistency: `task_id`/`task_title` are API fields; `taskId`/`task` are frontend fields; `dedupe_key` is persistence-only.
- Runtime settings consistency: the selected mode and model flow from `system_settings` through `AnalysisRunnerInput` into persisted metadata and provider request bodies.
- Dependency consistency: `xlsx` is removed, `write-excel-file@4.1.1` is direct, and `nanoid>=3.3.18` is resolved in the lockfile.
- No task requires unrelated architecture changes or real secret values.
