# Project Core Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the approved first PRD acceptance batch: project lifecycle/tags, configurable desensitization, batch review/re-analysis, complete task lifecycle, and service-backed overdue dashboard data.

**Architecture:** Retain the current Vue 3, Nest controller, `AppService`, and MySQL conventions. Use additive migrations and parameterized queries. `AppService` authorizes resource access before every mutation, API clients refresh authoritative server data after success, and the dashboard reads its dedicated overdue endpoint.

**Tech Stack:** Vue 3, TypeScript, NestJS, class-validator, MySQL, Vitest, Vite.

## Global Constraints

- Only an owning `manager` may mutate project business data. Members update only assigned task progress/status and may add notes. Admins and auditors remain unable to mutate business data.
- Project deletion is soft. No business endpoint may issue `DELETE FROM projects`.
- Normal project, task, meeting, calendar, risk, and analysis queries exclude `projects.deleted_at IS NOT NULL` rows.
- Audit entries may contain ids, field names, counts, and tag/rule names only. They never contain minute text, feedback/note text, rejection reasons, custom patterns, match values, or replacements.
- Fixed masking runs identity, phone, email, followed by enabled custom rules ordered by `created_at,id`.
- This batch does not add RAG, vector stores, Redis, queues, reporting, export, or third-party integration.

### Task 1: Add Schema And Request Contracts

**Files:**
- Modify: `src/server/migrate.ts`, `src/server/dtos.ts`, `src/server/authorization.ts`
- Create: `tests/project-lifecycle.spec.ts`

**Interfaces:** Produce `UpdateProjectDto`, `TagDto`, `UpdateTagDto`, `DesensitizationRuleDto`, `UpdateDesensitizationRuleDto`, `ReviewBatchDto`, `CreateTaskDto`, `UpdateManagedTaskDto`, `TaskNoteDto`, `assertManagedTaskInput`, and `assertTaskStatusTransition`.

- [ ] Write a failing validation test:

```ts
it('rejects a manager task without an assignee', () => {
  expect(() => assertManagedTaskInput({ title: 'Prepare release', assigneeId: '', priority: 'high' })).toThrow('Task assignee is required')
})
```

- [ ] Run `npx vitest run tests/project-lifecycle.spec.ts`; expect failure because the validation helper does not exist.

- [ ] In `migrate.ts`, add nullable `projects.deleted_at`, `projects.deleted_by`, and `ai_analyses.reanalysis_of_id`. Create `project_tags` with unique `(project_id,name)`; `project_tag_links` with composite `(project_id,tag_id)` key; `desensitization_rules`; privacy-safe `desensitization_logs`; and append-only `task_notes`. Add indexes for deleted-project ownership, task `(project_id,status,due_date)`, rules `(project_id,enabled,created_at)`, logs `(meeting_version_id,created_at)`, analyses `(status,reanalysis_of_id)`, and notes `(task_id,created_at)`.

- [ ] Add DTO limits: tag/rule name 60, regex 500, replacement 200, batch IDs 1-50 UUIDs, task title 180, description 4000, note 2000. In `authorization.ts`, validate title/assignee/priority/status/progress and reject member transitions to or from `closed`.

- [ ] Run `npx vitest run tests/project-lifecycle.spec.ts && npm run build`; commit `feat: add project core closure schema`.

### Task 2: Project Edit, Soft Delete, Restore, And Tags

**Files:**
- Modify: `src/server/app.service.ts`, `src/server/app.controller.ts`, `tests/project-lifecycle.spec.ts`
- Create: `tests/project-tags.spec.ts`

**Interfaces:** Produce `updateProject`, `softDeleteProject`, `restoreProject`, `deletedProjects`, `listProjectTags`, `createProjectTag`, `updateProjectTag`, `deleteProjectTag`, `linkProjectTag`, and `unlinkProjectTag`.

- [ ] Write failing tests:

```ts
it('soft deletes without physical project deletion', async () => {
  await expect(service.softDeleteProject(manager, 'project-1')).resolves.toEqual({ id: 'project-1', deleted: true })
  expect(execute.mock.calls.some(([sql]) => String(sql).startsWith('DELETE FROM projects'))).toBe(false)
})

it('adds a tag only to an owned project', async () => {
  await service.createProjectTag(manager, 'project-1', { name: 'Release' })
  expect(execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO project_tags'), expect.arrayContaining(['project-1', 'Release']))
})
```

- [ ] Run `npx vitest run tests/project-lifecycle.spec.ts tests/project-tags.spec.ts`; expect missing service methods.

- [ ] Implement owner-scoped project field updates for name/code/description/endDate/status; reject empty update and audit changed field names. Implement soft deletion with `UPDATE projects SET deleted_at=CURRENT_TIMESTAMP,deleted_by=?`, restore by clearing those fields, and owner-only deleted-project listing. Extend all normal business reads and project ownership checks with active-project filtering.

- [ ] Implement tag CRUD/linking after active owner verification. Verify a tag's `project_id` equals the route project before update/link/unlink/delete. Audit tag ids/names only.

- [ ] Bind `PATCH|DELETE /projects/:id`, `POST /projects/:id/restore`, `GET /projects/deleted`, `GET|POST /projects/:id/tags`, `PATCH|DELETE /projects/:id/tags/:tagId`, `PUT|DELETE /projects/:id/tags/:tagId/link`.

- [ ] Run `npx vitest run tests/project-lifecycle.spec.ts tests/project-tags.spec.ts tests/project-members.spec.ts tests/role-separation.spec.ts`; commit `feat: complete project lifecycle and tags`.

### Task 3: Custom Desensitization Rules And Logs

**Files:**
- Modify: `src/server/desensitization.ts`, `src/server/app.service.ts`, `src/server/app.controller.ts`
- Create: `tests/custom-desensitization.spec.ts`

**Interfaces:** Produce `applyDesensitization(content,rules)` returning content plus `{ruleKind,ruleId,hitCount}` entries, rule CRUD, and `listMeetingDesensitizationLogs`.

- [ ] Write failing tests:

```ts
it('runs fixed masking before enabled custom rules without returning match text', () => {
  const result = applyDesensitization('13800138000 ABC-19', [{ id: 'r1', pattern: 'ABC-\\d+', replacement: '[CODE]', enabled: true }])
  expect(result.content).toBe('[PHONE] [CODE]')
  expect(result.entries).toEqual(expect.arrayContaining([{ ruleKind: 'fixed', ruleId: 'phone', hitCount: 1 }, { ruleKind: 'custom', ruleId: 'r1', hitCount: 1 }]))
  expect(JSON.stringify(result.entries)).not.toContain('ABC-19')
})
```

- [ ] Run `npx vitest run tests/custom-desensitization.spec.ts`; expect missing helper and rule methods.

- [ ] Refactor fixed rules through a counted `String.replace` helper. Compile custom regex with global matching, skip disabled rules, and run in supplied order. Return no patterns, matched values, source text, or replacement values in log metadata.

- [ ] Replace `desensitizedMeetingContent` with project-aware `desensitizeForProject(projectId,content)`. Read enabled rules in `created_at,id` order. When the global setting disables masking, return source content and no entries. Create/restore meeting versions must insert one operation log per applied rule, containing only version/actor/rule kind/rule id/hit count. Restore reprocesses original content using current rules.

- [ ] Add project-scoped rule CRUD that validates regex compilation before inserts/updates and audits only id/name/enabled. Bind `GET|POST /projects/:id/desensitization-rules`, `PATCH|DELETE /projects/:id/desensitization-rules/:ruleId`, and `GET /meetings/:id/desensitization-logs`.

- [ ] Run `npx vitest run tests/custom-desensitization.spec.ts tests/desensitization.spec.ts tests/meeting-version.spec.ts`; commit `feat: add configurable desensitization rules`.

### Task 4: Batch Review, Notifications, And Re-analysis

**Files:**
- Modify: `src/server/app.service.ts`, `src/server/app.controller.ts`, `src/server/dtos.ts`, `src/services/meetingService.ts`, `tests/meeting-workflow.spec.ts`
- Create: `tests/review-reanalysis.spec.ts`

**Interfaces:** Produce `reviewAnalyses(user,ids,approved,reason?)`, `reanalyzeRejectedAnalysis(user,id)`, and meeting client `reviewBatch`/`reanalyze`.

- [ ] Write failing tests:

```ts
it('keeps successful batch reviews when one id fails', async () => {
  vi.spyOn(service, 'reviewAnalysis').mockResolvedValueOnce({ id: 'a1', status: 'approved' }).mockRejectedValueOnce(new Error('Analysis has already been reviewed'))
  await expect(service.reviewAnalyses(manager, ['a1', 'a2'], true)).resolves.toEqual({ succeeded: [{ id: 'a1', status: 'approved' }], failed: [{ id: 'a2', message: 'Analysis has already been reviewed' }] })
})
```

- [ ] Run `npx vitest run tests/review-reanalysis.spec.ts tests/meeting-workflow.spec.ts`; expect missing operations.

- [ ] Update `reviewAnalysis` transaction to notify `requested_by` once, linking `/reviews`, with approval/rejection title and no reason in body. Preserve task-assignee notifications and id-only audit data.

- [ ] Batch review loops through the single transactional review and returns `succeeded`/`failed`, so one invalid analysis cannot roll back valid reviews. Re-analysis requires rejected source and non-deleted owned project, creates a new pending record with `reanalysis_of_id`, uses current desensitized version content, updates only the new record, and audits `analysis.reanalyzed` without changing rejected history.

- [ ] Bind `POST /analyses/review-batch` and `POST /analyses/:id/reanalyze`; add client JSON payloads. Run `npx vitest run tests/review-reanalysis.spec.ts tests/meeting-workflow.spec.ts tests/role-separation.spec.ts`; commit `feat: add batch review and reanalysis`.

### Task 5: Manual Tasks, Lifecycle, And Notes

**Files:**
- Modify: `src/server/app.service.ts`, `src/server/app.controller.ts`, `src/server/dtos.ts`, `src/services/workspaceService.ts`
- Create: `tests/task-management.spec.ts`

**Interfaces:** Produce `createTask`, `updateManagedTask`, `closeTask`, `reopenTask`, `listTaskNotes`, `addTaskNote`, plus matching workspace client methods.

- [ ] Write failing tests:

```ts
it('assigns a manually created task to an active project member', async () => {
  await expect(service.createTask(manager, { projectId: 'project-1', title: 'Prepare release', assigneeId: 'member-1', priority: 'high', status: 'todo', progress: 0 })).resolves.toMatchObject({ title: 'Prepare release', status: 'todo' })
  expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO notifications'), expect.arrayContaining(['member-1', '已分配任务：Prepare release']))
})

it('keeps a task note body out of audits', async () => {
  await service.addTaskNote(manager, 'task-1', 'Private detail')
  expect(JSON.stringify(audit.mock.calls.at(-1)?.[1])).not.toContain('Private detail')
})
```

- [ ] Run `npx vitest run tests/task-management.spec.ts`; expect missing methods.

- [ ] Implement create/edit under manager ownership. Validate an assignee is an active project member. Generic edit accepts title/description/assignee/priority/due/status/progress but rejects `closed`; it notifies only a changed assignee and audits no description. Close preserves progress; reopen accepts `todo` or `in_progress`. Existing member task update rejects close/reopen transitions.

- [ ] Implement `visibleTaskForNote`: manager owner or member assignee only, joined to active project. Notes are append-only, list joins author name, and audits include only task/note ids.

- [ ] Bind `POST /tasks`, `PATCH /tasks/:id/manage`, `POST /tasks/:id/close`, `POST /tasks/:id/reopen`, `GET|POST /tasks/:id/notes`. Extend client task state to `closed`, map edit-needed raw values, and add all matching methods.

- [ ] Run `npx vitest run tests/task-management.spec.ts tests/authorization.spec.ts tests/authorization-boundary.spec.ts tests/risk-warning.spec.ts`; commit `feat: complete task management workflow`.

### Task 6: Dedicated Overdue Dashboard Endpoint

**Files:**
- Modify: `src/server/app.service.ts`, `src/server/app.controller.ts`, `src/services/workspaceService.ts`, `src/App.vue`
- Create: `tests/overdue-dashboard.spec.ts`

**Interfaces:** Produce `overdueTasks(user)` and `state.overdueTasks` loaded from `GET /dashboard/overdue-tasks`.

- [ ] Write failing tests:

```ts
it('uses server overdue criteria rather than client all-task filtering', () => {
  const source = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
  expect(source).toContain('data.overdueTasks')
  expect(source).not.toContain("const dueTasks = computed(() => data.tasks.filter")
})
```

- [ ] Run `npx vitest run tests/overdue-dashboard.spec.ts`; expect failure.

- [ ] Implement `overdueTasks` using `p.deleted_at IS NULL`, `t.status NOT IN ('completed','closed')`, `t.due_date < CURDATE()`, and manager-owner/member-assignee filtering. Return title/project/assignee/due/priority/status/progress. Admin/auditor get `[]`.

- [ ] Bind `GET /dashboard/overdue-tasks`. Load it with workspace data, map it as tasks, replace dashboard `dueTasks` with `data.overdueTasks.slice(0,3)`, and provide an empty panel state.

- [ ] Run `npx vitest run tests/overdue-dashboard.spec.ts tests/workspace-service.spec.ts && npm run build`; commit `feat: use server overdue task dashboard data`.

### Task 7: Manager-Facing UI Controls

**Files:**
- Modify: `src/services/workspaceService.ts`, `src/services/meetingService.ts`, `src/App.vue`, `src/style.css`
- Create: `tests/project-core-ui.spec.ts`

**Interfaces:** Produce `openProjectEditor`, `saveProject`, `manageProjectTags`, `manageDesensitizationRules`, `submitReviewBatch`, `reanalyze`, `openTaskEditor`, `saveTask`, `closeOrReopenTask`, and `submitTaskNote`.

- [ ] Write and run a failing static contract test that checks these handler names and `v-if="canManageBusiness"` are present.

- [ ] On manager project cards add icon controls with titles for edit, tags, rules, archive, and soft delete. Build bounded edit/tag/rule dialogs and a deleted-project restore dialog. After each successful mutation reload workspace data. Do not render business controls for member/admin/auditor.

- [ ] Add pending-analysis checkboxes, selected-count batch approve/reject, 500-character rejection-reason modal, and re-analyze action only for rejected rows. Refresh meetings/workspace data after operations.

- [ ] Replace the task-create placeholder with manager form fields for project/title/description/active member/priority/due/status/progress. Extend task details with description, notes, manager edit/close/reopen, and self-only member status/feedback/note controls.

- [ ] Use existing panel/modal patterns, lucide icons with `title`, 8px-or-less radii, constrained flex/grid editor rows, scrollable modal bodies, and overflow-safe text. Do not add decorative UI or nested cards.

- [ ] Run `npx vitest run tests/project-core-ui.spec.ts tests/meeting-layout.spec.ts && npm test && npm run build`; commit `feat: add project core closure controls`.

### Task 8: Database Smoke And Documentation

**Files:**
- Create: `scripts/smoke-project-core-closure.ts`
- Modify: `README.md`, `package.json`

**Interfaces:** Produce `npm run smoke:project-core-closure`; cleanup uses only explicit generated UUID ids in foreign-key order.

- [ ] First write assertions for hidden soft-deleted project, overdue API containing created task, re-analysis source id, logs excluding a test phone number, and one saved note. Run `npx tsx scripts/smoke-project-core-closure.ts`; it should fail before all batch features exist.

- [ ] Implement the smoke script: load `.env`, run migration, create generated manager/member/project/rule/minute/task/analysis data, verify masking/log privacy/review/reanalysis/note/overdue/delete/restore, and clean only exact generated ids in `finally`. Never clean by a broad name or email prefix.

- [ ] Add `"smoke:project-core-closure": "tsx scripts/smoke-project-core-closure.ts"` and README prerequisites. Run `npm test && npm run build && npm run smoke:project-core-closure`, then start `npm run server` and request `GET http://127.0.0.1:3000/api/health`. Report environment blockers instead of a false pass.

- [ ] Commit `test: add project core closure smoke coverage`.

## Plan Self-Review

Tasks 1-8 cover all approved requirements: safe schema, project edit/soft deletion/tags, custom rules and operation logs, batch review/requester notices/re-analysis, task lifecycle/notes/manual assignment, server overdue data, constrained UI workflows, and a database-backed acceptance check. All controller/client method names are introduced by their producing task, and no task relies on physical project deletion or sensitive audit contents.
