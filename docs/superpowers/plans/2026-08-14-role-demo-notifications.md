# Role Demo Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an administrator generate one idempotent, role-appropriate notification for each active role account.

**Architecture:** `AppService` owns notification generation and validates the administrator role. The Nest controller exposes an authenticated POST route, the auth service invokes it, and the existing Settings view presents the action only to administrators.

**Tech Stack:** NestJS, TypeScript, Vue 3, Vitest, MySQL.

## Global Constraints

- Each notification is tied to an active recipient account and is visible only through the existing user-filtered notification API.
- Repeated requests do not duplicate a notification with the same recipient, title, and link.
- The action is available only to the administrator role.

---

### Task 1: Persist role demo notifications

**Files:**
- Modify: `src/server/app.service.ts:431-489`
- Modify: `src/server/app.controller.ts:56-58`
- Test: `tests/admin-settings.spec.ts`

**Interfaces:**
- Consumes: `SessionUser`, `notifications`, and `users` tables.
- Produces: `AppService.createRoleDemoNotifications(user): Promise<{ created: number; missingRoles: string[] }>` and `POST /api/notifications/demo`.

- [ ] **Step 1: Write failing service tests**

```ts
await expect(service.createRoleDemoNotifications(manager)).rejects.toThrow('Administrator access required')
await expect(service.createRoleDemoNotifications(admin)).resolves.toEqual({ created: 4, missingRoles: [] })
expect(pool.execute).toHaveBeenCalledWith(
  expect.stringContaining('INSERT INTO notifications'),
  expect.arrayContaining(['manager-1', 'AI 分析待审核', '请进入 AI 审核队列处理待审核分析。', '/reviews']),
)
```

- [ ] **Step 2: Run the service tests and confirm failure**

Run: `npm test -- tests/admin-settings.spec.ts`

Expected: FAIL because `createRoleDemoNotifications` does not exist.

- [ ] **Step 3: Implement the service and route**

```ts
async createRoleDemoNotifications(user: SessionUser) {
  this.assertAdmin(user)
  // Query one active account for each role, then insert only missing rows.
}
```

```ts
@Post('notifications/demo')
async createDemoNotifications(@Headers('authorization') authorization?: string) {
  return this.app.createRoleDemoNotifications(await this.user(authorization))
}
```

- [ ] **Step 4: Run the service tests and confirm pass**

Run: `npm test -- tests/admin-settings.spec.ts`

Expected: PASS.

### Task 2: Add the administrator settings action

**Files:**
- Modify: `src/services/authService.ts:86-91`
- Modify: `src/App.vue:520-526,641`
- Test: `tests/admin-settings.spec.ts`

**Interfaces:**
- Consumes: `createRoleDemoNotifications(token)` client request.
- Produces: a Settings-only administrator action that reports created and skipped role counts.

- [ ] **Step 1: Write failing client and UI tests**

```ts
expect(appSource).toContain('生成角色演示通知')
expect(appSource).toContain('createRoleDemoNotifications')
expect(authSource).toContain("'/notifications/demo'")
```

- [ ] **Step 2: Run the UI tests and confirm failure**

Run: `npm test -- tests/admin-settings.spec.ts`

Expected: FAIL because the client method and action do not exist.

- [ ] **Step 3: Implement the client method and settings control**

```ts
createRoleDemoNotifications(token: string) {
  return request<{ created: number; missingRoles: string[] }>('/notifications/demo', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
  })
}
```

- [ ] **Step 4: Run the UI tests and confirm pass**

Run: `npm test -- tests/admin-settings.spec.ts`

Expected: PASS.

- [ ] **Step 5: Verify the application**

Run: `npm run build && npm test`

Expected: production build and full test suite pass.
