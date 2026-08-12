# Role Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce strict separation between project-manager business authority and system-administrator operational authority.

**Architecture:** The backend remains the authorization authority: authorization helpers deny the `admin` role for project business writes, while `AppService` verifies that a manager owns the affected project before mutation. The frontend consumes a small role predicate and a restrictive route matrix only to hide unavailable routes and controls. Audit writes are added beside the project, task, and feedback mutations.

**Tech Stack:** TypeScript, NestJS, MySQL (`mysql2/promise`), Vue 3, Vue Router, Vitest.

## Global Constraints

- The `admin` role must never receive a project business write exception.
- A manager may make project business changes only when `projects.owner_id` equals the authenticated user ID.
- Members retain only their existing own-task update and feedback permissions.
- Administrator account-management endpoints remain unchanged.
- Do not add emergency delegation, approval workflows, temporary authority, schema changes, or dependencies.
- Do not stage, revert, or commit unrelated working-tree changes.

---

## File Structure

- `src/server/authorization.ts`: Shared role-level predicates for task updates and project ownership.
- `src/server/app.service.ts`: Authoritative business-write checks and audit events for database mutations.
- `src/services/authService.ts`: Browser-side route matrix and `canManageProjectBusiness` predicate.
- `src/App.vue`: Navigation and business-action visibility driven by the browser-side predicate.
- `tests/authorization-boundary.spec.ts`: Pure authorization regression tests.
- `tests/role-separation.spec.ts`: Service-boundary administrator denial and manager ownership tests using mocked database interfaces.
- `tests/auth-service.spec.ts`: Browser-side route and action predicate tests.

### Task 1: Remove Administrator Business Authority From Pure Authorization Rules

**Files:**
- Modify: `src/server/authorization.ts:7-15`
- Modify: `tests/authorization-boundary.spec.ts:4-10`

**Interfaces:**
- Consumes: `AuthorizationRole`, `{ role: AuthorizationRole; id: string }`, and an `assigneeId` or `ownerId`.
- Produces: `canUpdateTask(user, assigneeId): boolean` and `canManageProject(user, ownerId): boolean`, both denying `admin` users.

- [ ] **Step 1: Write the failing test**

Replace the existing ownership test assertions with the following additions. They name the production behavior that must change: removal of the administrator exception from both helpers.

```ts
it('enforces task and project ownership boundaries', () => {
  expect(canUpdateTask({ role: 'member', id: 'm1' }, 'm2')).toBe(false)
  expect(canUpdateTask({ role: 'member', id: 'm1' }, 'm1')).toBe(true)
  expect(canUpdateTask({ role: 'manager', id: 'manager-1' }, 'm2')).toBe(true)
  expect(canUpdateTask({ role: 'admin', id: 'admin-1' }, 'm2')).toBe(false)
  expect(canManageProject({ role: 'manager', id: 'manager-1' }, 'manager-2')).toBe(false)
  expect(canManageProject({ role: 'manager', id: 'manager-1' }, 'manager-1')).toBe(true)
  expect(canManageProject({ role: 'admin', id: 'admin-1' }, 'manager-2')).toBe(false)
})
```

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run: `npx vitest run tests/authorization-boundary.spec.ts`

Expected: FAIL because the two assertions for the `admin` role currently receive `true`.

- [ ] **Step 3: Implement the minimal authorization change**

Replace the two helper implementations in `src/server/authorization.ts` with:

```ts
export function canUpdateTask(user: { role: AuthorizationRole; id: string }, assigneeId: string): boolean {
  if (user.role === 'member') return user.id === assigneeId
  return user.role === 'manager'
}

export function canManageProject(user: { role: AuthorizationRole; id: string }, ownerId: string): boolean {
  return user.role === 'manager' && user.id === ownerId
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npx vitest run tests/authorization-boundary.spec.ts`

Expected: PASS with 2 tests and 0 failures.

- [ ] **Step 5: Commit the isolated change**

```powershell
git add -- src/server/authorization.ts tests/authorization-boundary.spec.ts
git commit -m "fix: remove administrator project write authority"
```

### Task 2: Enforce Service-Level Business Boundaries and Complete Audit Events

**Files:**
- Modify: `src/server/app.service.ts:66-140,192-300`
- Create: `tests/role-separation.spec.ts`

**Interfaces:**
- Consumes: `AppService`, `pool`, a `SessionUser` shape `{ id, role, name, email }`, `canUpdateTask`, and `ForbiddenException`.
- Produces: `AppService` business writes that reject administrators; `assertProjectManager(user, projectId): Promise<void>` that accepts only a manager owning `projectId`; audit actions `project.created`, `task.updated`, and `task.feedback_created`.

- [ ] **Step 1: Write the failing service-boundary tests**

Create `tests/role-separation.spec.ts`. Mock only database interactions needed to reach the authorization checks. The service constructor does not use DeepSeek for rejected requests.

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppService } from '../src/server/app.service'
import { pool } from '../src/server/database'

const admin = { id: 'admin-1', role: 'admin' as const, name: 'Admin', email: 'admin@example.com' }
const manager = { id: 'manager-1', role: 'manager' as const, name: 'Manager', email: 'manager@example.com' }

describe('project business role separation', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('rejects project creation by an administrator before inserting data', async () => {
    const execute = vi.spyOn(pool, 'execute')
    const service = new AppService({} as any)

    await expect(service.createProject(admin, { name: 'Alpha', code: 'ALPHA' })).rejects.toThrow('Only managers can perform this action')
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects an administrator from updating a project task before mutation', async () => {
    vi.spyOn(pool, 'query').mockResolvedValueOnce([[{ assignee_id: 'member-1', project_id: 'project-1' }]] as any)
    const execute = vi.spyOn(pool, 'execute')
    const service = new AppService({} as any)

    await expect(service.updateTask(admin, 'task-1', { progress: 50 })).rejects.toThrow('You cannot update this task')
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects an administrator from resolving a project risk before mutation', async () => {
    vi.spyOn(pool, 'query').mockResolvedValueOnce([[{ project_id: 'project-1' }]] as any)
    const execute = vi.spyOn(pool, 'execute')
    const service = new AppService({} as any)

    await expect(service.resolveRisk(admin, 'risk-1')).rejects.toThrow('Only managers can perform this action')
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects a manager who does not own the affected project', async () => {
    vi.spyOn(pool, 'query')
      .mockResolvedValueOnce([[{ assignee_id: 'member-1', project_id: 'project-1' }]] as any)
      .mockResolvedValueOnce([[{ owner_id: 'manager-2' }]] as any)
    const execute = vi.spyOn(pool, 'execute')
    const service = new AppService({} as any)

    await expect(service.updateTask(manager, 'task-1', { progress: 50 })).rejects.toThrow('You do not manage this project')
    expect(execute).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the service test and verify the expected failure**

Run: `npx vitest run tests/role-separation.spec.ts`

Expected: FAIL because administrators can currently create projects and resolve risks. The task update denial may already pass after Task 1; that is expected because the test protects the service boundary against future reintroduction.

- [ ] **Step 3: Implement authoritative service checks and audit entries**

Make these targeted changes in `src/server/app.service.ts`:

```ts
async createProject(user: SessionUser, input: { name: string; code: string; description?: string; endDate?: string }) {
  if (user.role !== 'manager') throw new ForbiddenException('Only managers can perform this action')
  if (!input.name?.trim() || !input.code?.trim()) throw new BadRequestException('项目名称和编码不能为空')
  const id = randomUUID()
  await pool.execute('INSERT INTO projects (id,name,code,description,owner_id,end_date) VALUES (?,?,?,?,?,?)', [id, input.name.trim(), input.code.trim(), input.description ?? null, user.id, input.endDate ?? null])
  await pool.execute('INSERT INTO project_members (project_id,user_id,project_role) VALUES (?,?,?)', [id, user.id, 'manager'])
  await this.audit(user.id, 'project.created', 'project', id, { code: input.code.trim() })
  return { id, ...input, ownerId: user.id, status: 'active' }
}

private async assertProjectManager(user: SessionUser, projectId: string) {
  if (user.role !== 'manager') throw new ForbiddenException('Only managers can perform this action')
  const [rows] = await pool.query<any[]>('SELECT owner_id FROM projects WHERE id=?', [projectId])
  if (!rows[0] || rows[0].owner_id !== user.id) throw new ForbiddenException('You do not manage this project')
}
```

Call `await this.assertProjectManager(user, rows[0].project_id)` unconditionally in `resolveRisk` after the risk lookup, replacing the manager-only condition. Existing calls in meeting creation, analysis, review, and project archiving then deny administrators automatically. Keep the member own-task path in `updateTask` and `feedback`; their `canUpdateTask` checks from Task 1 reject administrators.

After the task `UPDATE` in `updateTask`, append:

```ts
await this.audit(user.id, 'task.updated', 'task', id, { projectId: rows[0].project_id, status: status ?? null, progress: progress ?? null })
```

After the feedback transaction commits and before returning, append:

```ts
await this.audit(user.id, 'task.feedback_created', 'task_feedback', id, { taskId, progress: input.progress })
```

Do not include `input.content` in the audit details.

- [ ] **Step 4: Add a responsible-manager success and audit regression test**

Append this test to `tests/role-separation.spec.ts` after the denial tests. It proves that the owner restriction does not block the intended business actor and that the mutation is followed by an audit insert.

```ts
it('allows the owning manager to update a task and records an audit entry', async () => {
  vi.spyOn(pool, 'query')
    .mockResolvedValueOnce([[{ assignee_id: 'member-1', project_id: 'project-1' }]] as any)
    .mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
  const execute = vi.spyOn(pool, 'execute').mockResolvedValue({} as any)
  const service = new AppService({} as any)

  await expect(service.updateTask(manager, 'task-1', { progress: 50 })).resolves.toEqual({ id: 'task-1', status: undefined, progress: 50 })
  expect(execute).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO audit_logs'),
    expect.arrayContaining(['manager-1', 'task.updated', 'task', 'task-1']),
  )
})
```

- [ ] **Step 5: Run the service and existing authorization tests**

Run: `npx vitest run tests/authorization.spec.ts tests/authorization-boundary.spec.ts tests/role-separation.spec.ts`

Expected: PASS with 0 failures. The test output must include the four administrator/ownership denial cases and the owning-manager audit case.

- [ ] **Step 6: Commit the isolated change**

```powershell
git add -- src/server/app.service.ts tests/role-separation.spec.ts
git commit -m "fix: enforce project business role separation"
```

### Task 3: Restrict Administrator Navigation and Business Controls

**Files:**
- Modify: `src/services/authService.ts:39-44`
- Modify: `src/App.vue:51,76-89,278,306,312-326,335,345-357,365`
- Modify: `tests/auth-service.spec.ts:1-15`

**Interfaces:**
- Consumes: `UserRole`.
- Produces: `canManageProjectBusiness(role: UserRole): boolean`; `createAuthService().visibleRoutes(role)` where administrators receive only `/dashboard`, `/notifications`, `/settings`, `/users`, and `/audit-logs`.

- [ ] **Step 1: Write the failing frontend authorization tests**

Append the following tests to `tests/auth-service.spec.ts`:

```ts
import { canManageProjectBusiness, createAuthService } from '../src/services/authService'

it('does not expose project business routes to administrators', () => {
  const routes = createAuthService().visibleRoutes('admin')

  expect(routes).toEqual(['/dashboard', '/notifications', '/settings', '/users', '/audit-logs'])
  expect(routes).not.toContain('/projects')
  expect(routes).not.toContain('/tasks')
  expect(routes).not.toContain('/risks')
  expect(routes).not.toContain('/meetings')
  expect(routes).not.toContain('/reviews')
})

it('exposes project business controls only to project managers', () => {
  expect(canManageProjectBusiness('manager')).toBe(true)
  expect(canManageProjectBusiness('admin')).toBe(false)
  expect(canManageProjectBusiness('member')).toBe(false)
  expect(canManageProjectBusiness('auditor')).toBe(false)
})
```

- [ ] **Step 2: Run the frontend authorization test and verify the expected failure**

Run: `npx vitest run tests/auth-service.spec.ts`

Expected: FAIL because `canManageProjectBusiness` is not exported and the administrator route matrix currently exposes business routes.

- [ ] **Step 3: Implement the restrictive route matrix and UI predicate**

Add this named export above `createAuthService` in `src/services/authService.ts` and restrict the `admin` route row:

```ts
export function canManageProjectBusiness(role: UserRole): boolean {
  return role === 'manager'
}

const routeMatrix: Record<UserRole, string[]> = {
  manager: ['/dashboard', '/projects', '/tasks', '/risks', '/notifications', '/experiments', '/calendar', '/efficiency', '/meetings', '/reviews'],
  member: ['/dashboard', '/projects', '/tasks', '/my-tasks', '/notifications'],
  admin: ['/dashboard', '/notifications', '/settings', '/users', '/audit-logs'],
  auditor: ['/dashboard', '/projects', '/tasks', '/risks', '/notifications', '/audit-logs'],
}
```

In `src/App.vue`, import `canManageProjectBusiness` and add:

```ts
const canManageBusiness = computed(() => canManageProjectBusiness(props.user.role))
```

Use `canManageBusiness` for project creation and archiving controls, replacing each administrator-inclusive or non-member condition:

```vue
<button v-if="sidebarOpen && canManageBusiness" class="new-project-button" @click="showCreateProject = true">
<button v-if="currentPage === 'projects' && canManageBusiness" class="primary-button" @click="showCreateProject = true">
<button v-if="canManageBusiness" class="icon-button" title="更多操作" @click="confirmArchive(project)">
<button v-if="canManageBusiness" class="project-card add-card" @click="showCreateProject = true">
```

Change the current non-member dashboard condition to `canManageBusiness` so an administrator cannot see the AI approval queue or its approval button. Add an administrator-specific dashboard panel containing only account and system navigation:

```vue
<section v-else-if="currentPage === 'dashboard' && user.role === 'admin'" class="page-section">
  <div class="welcome-row">
    <div><p class="eyebrow">SYSTEM ADMINISTRATION</p><h2>{{ greeting }}，{{ user.name }}</h2><p class="muted">管理账号、系统配置与审计记录。</p></div>
    <button class="primary-button" @click="navigate('/users')"><Users :size="16" />账号管理</button>
  </div>
</section>
```

The task update and feedback controls remain available in the manager/member task views. The administrator cannot reach those views because of the route matrix, and the backend rejects a crafted request.

- [ ] **Step 4: Run focused frontend tests and type checking**

Run: `npx vitest run tests/auth-service.spec.ts`

Expected: PASS with 3 tests and 0 failures.

Run: `npx vue-tsc --noEmit --incremental false`

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 5: Commit the isolated change**

```powershell
git add -- src/services/authService.ts src/App.vue tests/auth-service.spec.ts
git commit -m "fix: hide project business controls from administrators"
```

### Task 4: Complete Regression Verification

**Files:**
- Verify: `src/server/authorization.ts`
- Verify: `src/server/app.service.ts`
- Verify: `src/services/authService.ts`
- Verify: `src/App.vue`
- Verify: `tests/authorization-boundary.spec.ts`
- Verify: `tests/role-separation.spec.ts`
- Verify: `tests/auth-service.spec.ts`

**Interfaces:**
- Consumes: all completed role-separation changes.
- Produces: fresh verification evidence that the acceptance criteria are met.

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`

Expected: exit code 0, all test files pass, and no test failures.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: exit code 0 and a successful Vite production build.

- [ ] **Step 3: Manually verify both role surfaces in the running application**

Run the backend and frontend with the project’s existing start commands. Sign in once as an administrator and once as a project manager.

For administrator verification, confirm navigation contains only dashboard, notifications, settings, users, and audit logs; no project creation control, meeting form, AI review queue, task progression, risk resolution, or project archive action is reachable. Send a direct `POST /api/projects` request using the administrator token and confirm `403`.

For project-manager verification, confirm project creation remains available; open an owned project, submit a meeting, review an AI analysis, update a task, resolve a risk, and archive a project. Confirm the audit log includes `project.created`, `task.updated`, and `task.feedback_created` after the corresponding actions.

- [ ] **Step 4: Inspect the final diff and commit status**

```powershell
git diff --check
git status --short
git log --oneline -3
```

Expected: no whitespace errors; role-separation commits are present; only unrelated pre-existing changes, if any, remain outside the planned files.
