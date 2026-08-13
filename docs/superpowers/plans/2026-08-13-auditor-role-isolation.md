# 审计人员职责隔离 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将审计人员隔离为仅能查看审计概览、个人通知和审计日志的只读角色。

**Architecture:** 前端以角色路由白名单决定导航与路由守卫，审计人员使用独立仪表盘而非业务管理页面。服务端对业务读取接口显式拒绝审计人员，保留审计日志查询权限，从而形成界面与 API 的双层边界。

**Tech Stack:** Vue 3、Vue Router、NestJS、TypeScript、Vitest、MySQL。

## Global Constraints

- 审计人员仅可访问 `/dashboard`、`/notifications`、`/audit-logs`。
- 审计人员只能读取审计日志和自己的通知，不得读取项目业务资源。
- 项目经理和管理员既有职责不改变。
- 所有行为改动先写失败测试，再写最小实现。

---

### Task 1: 收紧审计人员前端访问范围

**Files:**
- Modify: `src/services/authService.ts`
- Modify: `src/App.vue`
- Test: `tests/auth-service.spec.ts`

**Interfaces:**
- Consumes: `createAuthService().visibleRoutes(role: UserRole): string[]`
- Produces: 审计人员仅可见审计工作台、通知和审计日志；不在白名单的路径重定向至仪表盘。

- [ ] **Step 1: 写失败测试**

```ts
it('limits auditors to audit workspace, notifications, and audit logs', () => {
  expect(createAuthService().visibleRoutes('auditor'))
    .toEqual(['/dashboard', '/notifications', '/audit-logs'])
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/auth-service.spec.ts`
Expected: FAIL，因为审计人员当前仍拥有 `/projects`、`/tasks` 和 `/risks`。

- [ ] **Step 3: 写最小实现**

```ts
auditor: ['/dashboard', '/notifications', '/audit-logs'],
```

在 `App.vue` 的路由同步逻辑中使用 `auth.visibleRoutes(props.user.role)` 检查当前路径；不在白名单时执行 `router.replace('/dashboard')`。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/auth-service.spec.ts`
Expected: PASS。

### Task 2: 构建审计专属只读仪表盘

**Files:**
- Modify: `src/App.vue`
- Test: `tests/auth-service.spec.ts`

**Interfaces:**
- Consumes: `auditLogs: Ref<any[]>`、`data.notifications`。
- Produces: `user.role === 'auditor'` 的独立仪表盘，仅显示审计统计、最新日志和通知入口。

- [ ] **Step 1: 写失败测试**

```ts
it('renders a dedicated auditor dashboard without project management actions', () => {
  const source = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
  expect(source).toContain("currentPage === 'dashboard' && user.role === 'auditor'")
  expect(source).not.toContain("user.role === 'auditor' && navigate('/projects')")
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/auth-service.spec.ts`
Expected: FAIL，因为尚无审计专属仪表盘分支。

- [ ] **Step 3: 写最小实现**

在管理员和成员仪表盘分支之间新增审计人员分支。展示日志总数、最近操作、最近数据变更和跳转 `/audit-logs`、`/notifications` 的只读入口；不渲染项目、任务、风险或会议操作控件。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/auth-service.spec.ts`
Expected: PASS。

### Task 3: 拒绝审计人员读取业务资源

**Files:**
- Modify: `src/server/app.service.ts`
- Modify: `tests/role-separation.spec.ts`

**Interfaces:**
- Consumes: `SessionUser` 与服务层查询方法。
- Produces: 审计人员调用项目、任务、风险或会议读取方法时抛出 `ForbiddenException`；`auditLogs` 仍返回日志。

- [ ] **Step 1: 写失败测试**

```ts
const auditor = { id: 'auditor-1', role: 'auditor' as const, name: 'Auditor', email: 'auditor@example.com' }

it('rejects an auditor from reading project business data but permits audit logs', async () => {
  const service = new AppService({} as any)
  await expect(service.projects(auditor)).rejects.toThrow('Audit role cannot access project business data')
  await expect(service.auditLogs(auditor)).resolves.toEqual([])
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/role-separation.spec.ts`
Expected: FAIL，因为审计人员当前可以查询项目业务数据。

- [ ] **Step 3: 写最小实现**

添加私有授权方法：

```ts
private assertNotAuditorBusinessRead(user: SessionUser) {
  if (user.role === 'auditor') throw new ForbiddenException('Audit role cannot access project business data')
}
```

在项目、任务、风险、会议、AI 分析、日历与项目成员读取方法的首行调用该方法；不得在 `auditLogs` 或 `notifications` 调用。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/role-separation.spec.ts`
Expected: PASS。

### Task 4: 完整验证

**Files:**
- Test: `tests/auth-service.spec.ts`
- Test: `tests/role-separation.spec.ts`

- [ ] **Step 1: 运行角色隔离测试**

Run: `npm test -- tests/auth-service.spec.ts tests/role-separation.spec.ts`
Expected: PASS。

- [ ] **Step 2: 构建前端与类型检查**

Run: `npm run build`
Expected: exit code 0。

- [ ] **Step 3: 运行完整测试套件**

Run: `npm test`
Expected: exit code 0，零失败。
