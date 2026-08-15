# 管理员手动通知 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict notification creation to system administrators and provide an administrator-only manual notification composer.

**Architecture:** A Nest endpoint validates an administrator, expands one user or one role into individual notification rows, and audits the send. Existing task and review workflows retain their business changes but stop creating notifications. Vue shows the composer only for administrators; recipients continue to list and mark only their own notices read.

**Tech Stack:** Vue 3, TypeScript, NestJS, MySQL, Vitest.

## Global Constraints

- Only `admin` may create notifications.
- Input requires non-empty title, body, and one recipient user or system role.
- Remove automatic notification writes from assignment, deadline, and review workflows.
- No database migration: every recipient keeps a separate `notifications` row.

---

### Task 1: Administrator notification API

**Files:**
- Modify: `src/server/dtos.ts`
- Modify: `src/server/app.controller.ts`
- Modify: `src/server/app.service.ts`
- Test: `tests/admin-notifications.spec.ts`

**Interfaces:**
- Produces `SendNotificationDto` with `title`, `body`, `audienceType`, `userId`, and `role`.
- Produces `AppService.sendNotification(user, input): Promise<{ created: number }>`.
- Produces `POST /api/notifications`.

- [ ] **Step 1: Write failing service tests**

```ts
await expect(service.sendNotification(admin, {
  title: 'Maintenance window', body: 'Restart at 22:00.', audienceType: 'user', userId: 'member-1',
})).resolves.toEqual({ created: 1 })
await expect(service.sendNotification(member, {
  title: 'Blocked', body: 'Blocked', audienceType: 'role', role: 'member',
})).rejects.toThrow('Administrator access required')
```

- [ ] **Step 2: Run the failing test**

Run: `npm test -- tests/admin-notifications.spec.ts`

Expected: FAIL because the API and DTO do not exist.

- [ ] **Step 3: Implement the DTO, controller route, and service method**

```ts
async sendNotification(user: SessionUser, input: SendNotificationInput) {
  this.assertAdmin(user)
  const recipients = input.audienceType === 'user'
    ? await this.activeRecipient(input.userId!)
    : await this.activeRoleRecipients(input.role!)
  if (!recipients.length) throw new BadRequestException('No active notification recipients')
  for (const recipient of recipients) await pool.execute(
    'INSERT INTO notifications (id,user_id,title,body,link) VALUES (?,?,?,?,?)',
    [randomUUID(), recipient.id, input.title.trim(), input.body.trim(), '/notifications'],
  )
  await this.audit(user.id, 'notification.sent', 'notification', null, { audienceType: input.audienceType, created: recipients.length })
  return { created: recipients.length }
}
```

- [ ] **Step 4: Run the API tests**

Run: `npm test -- tests/admin-notifications.spec.ts`

Expected: PASS for one user, one role, unauthorized caller, invalid audience, and inactive recipient.

- [ ] **Step 5: Commit**

Run: `git add src/server/dtos.ts src/server/app.controller.ts src/server/app.service.ts tests/admin-notifications.spec.ts && git commit -m "feat: add admin notification delivery"`

### Task 2: Remove automatic notification writes

**Files:**
- Modify: `src/server/app.service.ts`
- Modify: `tests/admin-notifications.spec.ts`

**Interfaces:**
- Consumes Task 1 as the sole application notification creation path.
- Preserves task, risk, and review persistence without `INSERT INTO notifications`.

- [ ] **Step 1: Write failing workflow expectations**

```ts
await service.createTask(manager, taskInput)
expect(connection.execute).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO notifications'), expect.any(Array))
```

- [ ] **Step 2: Run the failing workflow tests**

Run: `npm test -- tests/admin-notifications.spec.ts tests/task-management.spec.ts tests/risk-warning.spec.ts`

Expected: FAIL because task creation, reassignment, deadline checks, and review approval currently write notifications.

- [ ] **Step 3: Delete all workflow notification inserts**

Remove notification writes from `createTask`, `updateManagedTask`, `ensureTaskDeadlineWarnings`, review result handling, and review-created task assignment. Keep their task, risk, audit, and review writes intact.

- [ ] **Step 4: Run the focused workflow tests**

Run: `npm test -- tests/admin-notifications.spec.ts tests/task-management.spec.ts tests/risk-warning.spec.ts`

Expected: PASS with no workflow-created notifications.

- [ ] **Step 5: Commit**

Run: `git add src/server/app.service.ts tests/admin-notifications.spec.ts && git commit -m "refactor: restrict automatic task notifications"`

### Task 3: Administrator notification composer

**Files:**
- Modify: `src/services/workspaceService.ts`
- Modify: `src/App.vue`
- Modify: `src/style.css`
- Modify: `tests/notification-ui.spec.ts`
- Modify: `tests/workspace-service.spec.ts`

**Interfaces:**
- Produces `WorkspaceService.sendNotification(input)` posting to `/notifications`.
- Uses the existing administrator user list for a named-user selector.
- Input consists of title, body, `audienceType: 'user' | 'role'`, and user or role selection.

- [ ] **Step 1: Write failing UI and service tests**

```ts
expect(appSource).toContain("user.role === 'admin'")
expect(appSource).toContain('发送通知')
expect(appSource).toContain('{{ item.body }}')
await service.sendNotification({ title: 'Notice', body: 'Body', audienceType: 'role', role: 'member' })
```

- [ ] **Step 2: Run the failing UI/service tests**

Run: `npm test -- tests/notification-ui.spec.ts tests/workspace-service.spec.ts`

Expected: FAIL because the sender method, composer, and body display are absent.

- [ ] **Step 3: Implement the service method and composer**

```ts
async sendNotification(input: { title: string; body: string; audienceType: 'user' | 'role'; userId?: string; role?: UserRole }) {
  return request('/notifications', { method: 'POST', body: JSON.stringify(input) })
}
```

Render the form only when `user.role === 'admin'`; on success clear the form, reload notifications, and show the returned count. On failure retain all inputs and show the API error. Render `item.body` below every title.

- [ ] **Step 4: Run the UI/service tests**

Run: `npm test -- tests/notification-ui.spec.ts tests/workspace-service.spec.ts`

Expected: PASS for administrator-only visibility, post payload, and body visibility.

- [ ] **Step 5: Commit**

Run: `git add src/services/workspaceService.ts src/App.vue src/style.css tests/notification-ui.spec.ts tests/workspace-service.spec.ts && git commit -m "feat: add admin notification composer"`

### Task 4: Integrated verification

**Files:**
- Test: `tests/admin-notifications.spec.ts`
- Test: `tests/notification-ui.spec.ts`
- Test: `tests/workspace-service.spec.ts`

- [ ] **Step 1: Run notification regressions**

Run: `npm test -- tests/admin-notifications.spec.ts tests/notification-ui.spec.ts tests/workspace-service.spec.ts tests/task-management.spec.ts tests/risk-warning.spec.ts`

Expected: PASS with admin-only sending and no automatic notification writes.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: PASS with Vue type checking and Vite output.

- [ ] **Step 3: Inspect scope**

Run: `git diff --check && git status --short`

Expected: no whitespace errors and no modifications outside the notification scope.
