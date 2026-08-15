# Member Project Data Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict member project data to personal tasks, risks, activity, and metrics by introducing an explicit risk-to-task relationship.

**Architecture:** Store an optional formal-task foreign key on `risks`. Review drafts use an optional candidate-task array index and approval converts it into the corresponding generated task ID. `projectDetail` and `risks` derive member visibility from that persisted relationship, while managers retain full project scope.

**Tech Stack:** TypeScript, Vue 3, NestJS, MySQL, Vitest.

## Global Constraints

- `risks.task_id` is nullable and uses `ON DELETE SET NULL`.
- Unlinked risks are project-level and visible only to project managers.
- Members retain project metadata, meetings, and member-directory access.
- Member task, risk, activity, health, and count data must be scoped to the signed-in member.
- Existing stored analyses and risks remain valid when `task_index` or `task_id` is absent.
- Follow TDD: observe each new test fail before its production implementation.

---

### Task 1: Add the risk-to-task contract and migration

**Files:**
- Modify: `src/server/migrate.ts:206-218`
- Modify: `src/server/deepseek.service.ts:12-35`
- Modify: `src/server/dtos.ts:91-101`
- Modify: `src/services/meetingService.ts:27-29`
- Modify: `src/server/app.service.ts:963-977`
- Test: `tests/review-draft.spec.ts`

**Interfaces:**
- Consumes: `MeetingAnalysis.tasks`, `MeetingAnalysis.risks`, and persisted `ai_analysis_drafts.draft_json`.
- Produces: `CandidateRisk.task_index?: number`, `ReviewDraftRisk.task_index?: number`, and nullable `risks.task_id` with an index and foreign key.

- [ ] **Step 1: Write failing draft validation tests**

Add a valid draft whose risk has `task_index: 0`, and an invalid draft whose only candidate task is at index `0` but whose risk has `task_index: 1`.

```ts
await expect(service.saveReviewDraft(manager, 'analysis-1', {
  summary: 'Scoped risk', decisions: [],
  tasks: [{ title: 'Ship release', priority: 'high' }],
  risks: [{ title: 'Release delay', level: 'high', task_index: 1 }],
} as any)).rejects.toThrow('Risk task reference is invalid')
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npx vitest run tests/review-draft.spec.ts`

Expected: the invalid reference is accepted because `task_index` is not part of the current candidate-risk contract.

- [ ] **Step 3: Add the contract and migration**

Extend candidate-risk types and DTO validation, preserve integer `task_index` in `normalizeAnalysis`, and add the risk column after the existing risks table creation.

```ts
export type CandidateRisk = {
  title: string
  description?: string
  level: 'low' | 'medium' | 'high'
  task_index?: number
}

await addColumnIfMissing('risks', 'task_id', 'task_id CHAR(36) NULL')
await pool.query('CREATE INDEX idx_risks_task ON risks (task_id)')
  .catch((error: { code?: string }) => { if (error.code !== 'ER_DUP_KEYNAME') throw error })
await pool.query('ALTER TABLE risks ADD CONSTRAINT fk_risks_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL')
  .catch((error: { code?: string }) => { if (error.code !== 'ER_FK_DUP_NAME') throw error })
```

Create `assertRiskTaskReferences(draft: ReviewDraft)` in `AppService`. It throws `BadRequestException('Risk task reference is invalid')` when a defined index is not an integer between `0` and `draft.tasks.length - 1`; call it after normalization in `saveReviewDraft`.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npx vitest run tests/review-draft.spec.ts`

Expected: a valid task index is persisted and an out-of-range task index is rejected.

- [ ] **Step 5: Commit**

```bash
git add src/server/migrate.ts src/server/deepseek.service.ts src/server/dtos.ts src/services/meetingService.ts src/server/app.service.ts tests/review-draft.spec.ts
git commit -m "feat: relate risks to reviewed tasks"
```

### Task 2: Persist task links during approval and deadline warnings

**Files:**
- Modify: `src/server/app.service.ts:480-493,980-1004`
- Test: `tests/review-draft.spec.ts`
- Test: `tests/risk-warning.spec.ts`

**Interfaces:**
- Consumes: validated `CandidateRisk.task_index`, ordered generated task IDs, and deadline-warning task rows containing `id`.
- Produces: `risks.task_id` set to the generated task ID when linked; automatic deadline risks set to their triggering task ID.

- [ ] **Step 1: Write failing persistence tests**

Add an approval test with two candidate tasks and one risk with `task_index: 1`; assert the risk insert receives the second generated task ID. Add a deadline-warning assertion that its insert includes the input task ID.

```ts
expect(connection.execute).toHaveBeenCalledWith(
  expect.stringContaining('INSERT INTO risks'),
  expect.arrayContaining([secondTaskId]),
)
expect(execute).toHaveBeenCalledWith(
  expect.stringContaining('task_id'),
  expect.arrayContaining(['task-1']),
)
```

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `npx vitest run tests/review-draft.spec.ts tests/risk-warning.spec.ts`

Expected: current inserts do not include `task_id`.

- [ ] **Step 3: Map candidate indices to generated formal tasks**

Validate the result in `reviewAnalysis`, preserve task IDs in candidate order, and use the indexed ID for each linked risk. Omitted `task_index` persists SQL `NULL`.

```ts
const createdTaskIds: string[] = []
for (const task of result.tasks) {
  const [assignees] = task.owner_email
    ? await connection.query<any[]>('SELECT u.id FROM users u JOIN project_members pm ON pm.user_id=u.id WHERE pm.project_id=? AND u.email=?', [rows[0].project_id, task.owner_email])
    : [[]]
  const assigneeId = assignees[0]?.id ?? fallbackAssignee
  const taskId = randomUUID()
  createdTaskIds.push(taskId)
  await connection.execute(
    'INSERT INTO tasks (id,title,description,project_id,assignee_id,priority,status,progress,due_date) VALUES (?,?,?,?,?,?,?,?,?)',
    [taskId, task.title, task.description ?? null, rows[0].project_id, assigneeId, task.priority, 'todo', 0, task.due_date ?? null],
  )
}
for (const risk of result.risks) {
  const taskId = risk.task_index === undefined ? null : createdTaskIds[risk.task_index]
  await connection.execute(
    'INSERT INTO risks (id,project_id,analysis_id,task_id,title,description,level) VALUES (?,?,?,?,?,?,?)',
    [randomUUID(), rows[0].project_id, analysisId, taskId, risk.title, risk.description ?? null, risk.level],
  )
}
```

Change `ensureTaskDeadlineWarnings` to insert `task_id` with the existing risk values.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `npx vitest run tests/review-draft.spec.ts tests/risk-warning.spec.ts`

Expected: reviewed and deadline-generated risks persist source task IDs; unlinked risks persist `NULL`.

- [ ] **Step 5: Commit**

```bash
git add src/server/app.service.ts tests/review-draft.spec.ts tests/risk-warning.spec.ts
git commit -m "feat: persist risk task links"
```

### Task 3: Enforce member-scoped project detail and risk queries

**Files:**
- Modify: `src/server/app.service.ts:138-200,1100-1109`
- Modify: `src/services/workspaceService.ts:33-43,99-120`
- Test: `tests/project-detail.spec.ts`
- Test: `tests/risk-warning.spec.ts`

**Interfaces:**
- Consumes: `risks.task_id`, `tasks.assignee_id`, and the existing project-membership gate.
- Produces: `ProjectDetail.scope: 'personal' | 'project'` and member-scoped detail collections and metrics.

- [ ] **Step 1: Write failing member isolation tests**

Model a joined member with one assigned task and one other-member task. Include one risk per task plus an unlinked risk. Assert only personal tasks, linked risks, activity, and counts remain. Verify the member risk-center query joins through `task_id`.

```ts
expect(detail.scope).toBe('personal')
expect(detail.tasks.map((task) => task.id)).toEqual(['member-task'])
expect(detail.risks.map((risk) => risk.id)).toEqual(['member-risk'])
expect(detail.activity.every((event) => event.taskId === 'member-task')).toBe(true)
expect(memberRiskSql).toContain('JOIN tasks t ON t.id=r.task_id')
expect(memberRiskSql).toContain('t.assignee_id=?')
```

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `npx vitest run tests/project-detail.spec.ts tests/risk-warning.spec.ts`

Expected: current detail queries scope only by project ID and expose every project task and risk.

- [ ] **Step 3: Add scoped SQL and response fields**

Branch task, risk, event, and member-progress SQL on `user.role === 'member'`. Member task/event predicates include `assignee_id=?`; member risks join their linked task and require its assignee to equal the user. Calculate member health and counts from the filtered arrays, set `pendingReviews` to `0`, and return `scope: 'personal'`. Managers return `scope: 'project'` with existing full queries.

```ts
const taskScope = user.role === 'member' ? ' AND t.assignee_id=?' : ''
const riskScope = user.role === 'member'
  ? 'JOIN tasks rt ON rt.id=r.task_id WHERE r.project_id=? AND rt.assignee_id=?'
  : 'WHERE r.project_id=?'
```

Update the `ProjectDetail` interface and mapper in `workspaceService.ts` with `scope: 'personal' | 'project'`.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `npx vitest run tests/project-detail.spec.ts tests/risk-warning.spec.ts`

Expected: members receive no other-member task, risk, feedback event, or aggregate; manager responses remain complete.

- [ ] **Step 5: Commit**

```bash
git add src/server/app.service.ts src/services/workspaceService.ts tests/project-detail.spec.ts tests/risk-warning.spec.ts
git commit -m "fix: scope member project data"
```

### Task 4: Expose risk linkage and personal scope in the UI

**Files:**
- Modify: `src/components/MeetingReviewPage.vue`
- Modify: `src/components/ProjectDetailPage.vue`
- Test: `tests/review-detail-ui.spec.ts`
- Test: `tests/project-detail-ui.spec.ts`

**Interfaces:**
- Consumes: `ReviewDraftRisk.task_index` and `ProjectDetail.scope`.
- Produces: manager risk-to-candidate-task selection and personal metric labels for member details.

- [ ] **Step 1: Write failing UI source tests**

Assert the review form binds a numeric risk task index, includes a project-level option, and the detail page includes a personal-scope label.

```ts
expect(reviewSource).toContain('v-model.number="risk.task_index"')
expect(reviewSource).toContain('项目级风险')
expect(detailSource).toContain("detail.scope === 'personal'")
expect(detailSource).toContain('我的任务健康度')
```

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `npx vitest run tests/review-detail-ui.spec.ts tests/project-detail-ui.spec.ts`

Expected: risk task selection and personal-scope labels do not exist.

- [ ] **Step 3: Add the UI control and labels**

Add a risk selector with project-level and candidate-task options. Update `removeTask` so removed references become `undefined` and references above the removed index decrease by one. Change health and metric headings based on `detail.scope`.

```vue
<select v-model.number="risk.task_index" :disabled="!canManage">
  <option :value="undefined">项目级风险</option>
  <option v-for="(task, taskIndex) in draft.tasks" :key="taskIndex" :value="taskIndex">
    关联任务：{{ task.title || `候选任务 ${taskIndex + 1}` }}
  </option>
</select>
```

- [ ] **Step 4: Run focused UI tests and build**

Run: `npx vitest run tests/review-detail-ui.spec.ts tests/project-detail-ui.spec.ts`

Run: `npm run build`

Expected: source tests pass and Vue type checking plus production build complete successfully.

- [ ] **Step 5: Run full regression verification**

Run: `npm test`

Expected: no failures attributable to this change. Record existing model-expectation and progress-event failures separately if they remain.

- [ ] **Step 6: Commit**

```bash
git add src/components/MeetingReviewPage.vue src/components/ProjectDetailPage.vue tests/review-detail-ui.spec.ts tests/project-detail-ui.spec.ts
git commit -m "feat: show task-linked risks to members"
```

## Self-Review

- Spec coverage: Task 1 defines and validates the relationship; Task 2 writes it; Task 3 enforces read boundaries; Task 4 provides the required controls and labels.
- Placeholder scan: every planned test, insert, query boundary, type, and user-facing state is specified.
- Type consistency: `task_index` exists only in analysis drafts, `task_id` exists only after formal task creation, and `scope` is returned by the server and consumed by the project-detail UI.
