# Task Reminder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let project managers remind the assignee of an unfinished task without changing task status or progress.

**Architecture:** A dedicated `POST /api/tasks/:id/reminder` endpoint calls an AppService method that authorizes the manager and persists a notification. The task board calls a new workspace-service method instead of the status-update method, retaining the existing hide rules for completed and closed tasks.

**Tech Stack:** Vue 3, TypeScript, NestJS, MySQL, Vitest.

## Global Constraints

- Do not modify a task's `status`, `progress`, or `completed_at` when sending a reminder.
- Only the owning project manager can send a reminder.
- Do not alter unrelated in-progress workspace changes.

---

### Task 1: Server Reminder Endpoint

**Files:**
- Modify: `src/server/app.controller.ts`
- Modify: `src/server/app.service.ts`
- Test: `tests/task-management.spec.ts`

**Interfaces:**
- Consumes: authenticated `SessionUser` and `taskId` route parameter.
- Produces: `AppService.remindTask(user, taskId): Promise<{ id: string; taskId: string; recipientId: string }>`.

- [ ] **Step 1: Write the failing service test**

```ts
it('lets a project manager remind the assignee without updating task state', async () => {
  // Mock the task lookup, ownership lookup, notification insert, audit insert, and cache invalidation.
  const result = await service.remindTask(manager, 'task-1')
  expect(result).toMatchObject({ taskId: 'task-1', recipientId: 'member-1' })
  expect(pool.execute).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO notifications'),
    expect.arrayContaining(['member-1', '任务推进提醒：Prepare release'])
  )
  expect(pool.execute).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE tasks'), expect.any(Array))
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/task-management.spec.ts`

Expected: FAIL because `remindTask` does not exist.

- [ ] **Step 3: Add the minimal server implementation**

```ts
async remindTask(user: SessionUser, taskId: string) {
  const [rows] = await pool.query<any[]>('SELECT id,title,assignee_id,project_id FROM tasks WHERE id=?', [taskId])
  const task = rows[0]
  if (!task) throw new BadRequestException('Task does not exist')
  await this.assertProjectManager(user, task.project_id)
  const id = randomUUID()
  await pool.execute('INSERT INTO notifications (id,user_id,title,body,link) VALUES (?,?,?,?,?)', [id, task.assignee_id, `任务推进提醒：${task.title}`, '项目经理提醒你尽快完成当前任务。', '/my-tasks'])
  await this.audit(user.id, 'task.reminder_sent', 'task', taskId, { projectId: task.project_id, assigneeId: task.assignee_id })
  await this.invalidateBusinessReads()
  return { id, taskId, recipientId: task.assignee_id }
}
```

Add a controller handler that delegates `POST /tasks/:id/reminder` to this method with the authenticated user.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/task-management.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit the server change**

```bash
git add src/server/app.controller.ts src/server/app.service.ts tests/task-management.spec.ts
git commit -m "feat: add task reminder endpoint"
```

### Task 2: Task-Board Reminder Action

**Files:**
- Modify: `src/services/workspaceService.ts`
- Modify: `src/components/TaskBoardPage.vue`
- Test: `tests/task-board-ui.spec.ts`

**Interfaces:**
- Consumes: `WorkspaceService.remindTask(id: string): Promise<{ id: string; taskId: string; recipientId: string }>`.
- Produces: a manager-only action that sends a reminder without changing the local task state.

- [ ] **Step 1: Write the failing UI source test**

```ts
it('sends a reminder rather than updating an unfinished task from the board', () => {
  expect(source).toContain('await service.remindTask(task.id)')
  expect(source).not.toContain('await service.updateTaskState(task.id, next)')
  expect(source).toContain("props.user.role === 'manager'")
  expect(source).toContain("task.state !== 'completed' && task.state !== 'closed'")
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/task-board-ui.spec.ts`

Expected: FAIL because the board currently calls `updateTaskState`.

- [ ] **Step 3: Add the minimal client implementation**

```ts
async remindTask(id: string) {
  return request(`/tasks/${id}/reminder`, { method: 'POST' })
}

async function sendReminder(task: Task) {
  await service.remindTask(task.id)
}
```

Render the `推进` button only when `props.user.role === 'manager'` and the task is not completed or closed. Retain the request-in-flight disabled state; do not reload or mutate `tasks` after success.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/task-board-ui.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit the client change**

```bash
git add src/services/workspaceService.ts src/components/TaskBoardPage.vue tests/task-board-ui.spec.ts
git commit -m "fix: make task board advance send reminders"
```

### Task 3: End-to-End Verification

**Files:**
- Verify: `tests/task-management.spec.ts`
- Verify: `tests/task-board-ui.spec.ts`
- Verify: `src/server/app.service.ts`
- Verify: `src/components/TaskBoardPage.vue`

- [ ] **Step 1: Run focused regressions**

Run: `npm test -- tests/task-management.spec.ts tests/task-board-ui.spec.ts`

Expected: PASS with no failures.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: exit code 0.

- [ ] **Step 3: Verify the requirements against the implementation**

Confirm that the reminder method has no `UPDATE tasks` statement, the notification targets `task.assignee_id`, the task board uses `remindTask`, and the button condition excludes completed and closed tasks.
