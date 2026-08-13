# Project Member Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make project membership management usable to project owners while strictly enforcing account eligibility and immediate membership-based access revocation.

**Architecture:** `AppService` remains authoritative for project ownership, eligible account roles, and task access. The project detail page consumes the existing member API methods through `workspaceService`, exposing management controls only when the detail permission is true. Removing a membership retains task rows but task queries and mutations must additionally verify active membership.

**Tech Stack:** TypeScript, NestJS, MySQL (`mysql2/promise`), Vue 3, Vitest.

## Global Constraints

- Only a system `manager` whose ID equals `projects.owner_id` may administer project members.
- Only active system `manager` and `member` accounts may be project members.
- Project role `manager` is a label only and must not grant project authority.
- The owner must remain a project-role `manager` and cannot be removed.
- Removal retains task history but immediately blocks the former member from task access and mutations in that project.
- Do not add database schema, dependencies, delegation, or hierarchy changes.
- Preserve unrelated working-tree changes; do not stage, revert, or commit them.

---

## File Structure

- `src/server/app.service.ts`: Membership eligibility checks and membership-aware member task access.
- `tests/project-members.spec.ts`: Service-boundary tests for eligibility, owner protection, and membership lifecycle.
- `tests/task-management.spec.ts`: Member task visibility and mutation access regression tests.
- `src/components/ProjectDetailPage.vue`: Owner-only member management dialog and actions.
- `src/services/workspaceService.ts`: Existing member API methods consumed by the component without contract changes.
- `src/style.css`: Modal and compact member-management layout styles.
- `tests/project-detail-ui.spec.ts`: Source-level regression coverage for the functional member-management UI.

### Task 1: Reject Ineligible Project Members

**Files:**
- Modify: `tests/project-members.spec.ts`
- Modify: `src/server/app.service.ts:221-227`

**Interfaces:**
- Consumes: `AppService.addProjectMember(user, projectId, userId, projectRole)`.
- Produces: `400 Bad Request` for an inactive account or an account with system role `admin` or `auditor`.

- [ ] **Step 1: Write the failing test**

Add a test that mocks project ownership and an active administrator account, then expects no membership insert:

```ts
it('rejects active administrator and auditor accounts as project members', async () => {
  const service = new AppService({} as any)
  const execute = vi.spyOn(pool, 'execute')
  const query = vi.spyOn(pool, 'query')
  query.mockResolvedValueOnce([[{ owner_id: 'manager-1' }]] as any)
  query.mockResolvedValueOnce([[{ id: 'admin-1', is_active: 1, role: 'admin' }]] as any)

  await expect(service.addProjectMember(manager, 'project-1', 'admin-1', 'member'))
    .rejects.toThrow('Project member must be an active manager or member account')
  expect(execute).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run tests/project-members.spec.ts`

Expected: FAIL because the current user lookup does not read or validate `role`.

- [ ] **Step 3: Implement the minimal eligibility validation**

Replace the account query and validation in `addProjectMember` with:

```ts
const [users] = await pool.query<any[]>('SELECT id,is_active,role FROM users WHERE id=?', [userId])
if (!users[0] || !users[0].is_active || !['manager', 'member'].includes(users[0].role)) {
  throw new BadRequestException('Project member must be an active manager or member account')
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npx vitest run tests/project-members.spec.ts`

Expected: PASS with the new ineligible-account assertion and existing member tests.

### Task 2: Revoke Former Members' Task Access

**Files:**
- Modify: `tests/task-management.spec.ts`
- Modify: `src/server/app.service.ts:250-293,296-340,521-540`

**Interfaces:**
- Consumes: `AppService.tasks`, `updateTask`, `feedback`, and `visibleTaskForNote` for a system-role `member`.
- Produces: membership-aware access checks so a removed member receives `403 Forbidden` even if they remain `tasks.assignee_id`.

- [ ] **Step 1: Write failing tests for visibility and update revocation**

Add tests using a member assigned to a task but absent from `project_members`:

```ts
it('does not return tasks assigned to a former project member', async () => {
  vi.spyOn(pool, 'query').mockResolvedValueOnce([[]] as any)
  await expect(new AppService({} as any).tasks(member)).resolves.toEqual([])
})

it('rejects a former member updating a task that remains assigned to them', async () => {
  vi.spyOn(pool, 'query').mockResolvedValueOnce([[{ id: 'task-1', assignee_id: member.id, project_id: 'project-1', status: 'todo' }]] as any)
  vi.spyOn(pool, 'query').mockResolvedValueOnce([[]] as any)
  const execute = vi.spyOn(pool, 'execute')

  await expect(new AppService({} as any).updateTask(member, 'task-1', { progress: 10 }))
    .rejects.toThrow('You cannot access tasks in this project')
  expect(execute).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run tests/task-management.spec.ts`

Expected: FAIL because member task queries currently filter only by `assignee_id` and mutations only compare assignee IDs.

- [ ] **Step 3: Implement membership-aware task access**

1. In `tasks`, for the member branch join `project_members pm` on both project and user identity, and filter `pm.user_id=?` alongside `t.assignee_id=?`; pass the member ID for both placeholders.
2. Add a private helper:

```ts
private async assertMemberProjectAccess(user: SessionUser, projectId: string) {
  if (user.role !== 'member') return
  const [rows] = await pool.query<any[]>(
    'SELECT project_id FROM project_members WHERE project_id=? AND user_id=?',
    [projectId, user.id],
  )
  if (!rows[0]) throw new ForbiddenException('You cannot access tasks in this project')
}
```

3. In `updateTask`, call the helper after loading the task and before the transition or update.
4. In `feedback`, call the helper after loading the task and before writing feedback.
5. In `visibleTaskForNote`, require a matching membership row for the member branch instead of relying solely on `assignee_id`.

- [ ] **Step 4: Add feedback and note revocation tests**

Add focused tests that prove absent membership rejects `feedback` and `addTaskNote` before their `INSERT` operations. Assert the same `You cannot access tasks in this project` message and no `pool.execute` calls.

- [ ] **Step 5: Run focused task tests and verify they pass**

Run: `npx vitest run tests/task-management.spec.ts`

Expected: PASS with former-member visibility, update, feedback, and note regression tests.

### Task 3: Provide Functional Owner-Only Member Management

**Files:**
- Modify: `tests/project-detail-ui.spec.ts`
- Modify: `src/components/ProjectDetailPage.vue`
- Modify: `src/style.css`

**Interfaces:**
- Consumes: `detail.permissions.canManageMembers`, `detail.members`, and existing workspace service methods `projectMemberCandidates`, `addProjectMember`, `updateProjectMemberRole`, and `removeProjectMember`.
- Produces: a modal management flow that refreshes `detail` only after successful member mutations.

- [ ] **Step 1: Write failing UI source tests**

Extend `tests/project-detail-ui.spec.ts` with assertions that the component includes a click handler, state, and all service calls:

```ts
it('implements owner-only project member management actions', () => {
  expect(source).toContain('@click="openMemberManagement"')
  expect(source).toContain('const showMemberManagement = ref(false)')
  expect(source).toContain('service.projectMemberCandidates')
  expect(source).toContain('service.addProjectMember')
  expect(source).toContain('service.updateProjectMemberRole')
  expect(source).toContain('service.removeProjectMember')
  expect(source).toContain('member.id !== detail.project.ownerId')
})
```

- [ ] **Step 2: Run the focused UI test and verify it fails**

Run: `npx vitest run tests/project-detail-ui.spec.ts`

Expected: FAIL because the button currently has no click handler or management dialog.

- [ ] **Step 3: Implement component state and mutation handlers**

In `ProjectDetailPage.vue`, add refs for dialog visibility, candidates, selected account ID, selected project role, submitting state, and an error string. Implement:

```ts
async function openMemberManagement() {
  if (!detail.value?.permissions.canManageMembers) return
  memberError.value = ''
  memberCandidates.value = await service.projectMemberCandidates(String(route.params.id))
  selectedMemberId.value = memberCandidates.value[0]?.id ?? ''
  showMemberManagement.value = true
}

async function refreshDetail() { detail.value = await service.getProjectDetail(String(route.params.id)) }
```

Use handlers that set `submitting` before invoking the matching workspace service method, await `refreshDetail()` only after success, and retain dialog state while displaying the caught error. The edit and remove handlers must return early when the target ID is `detail.value.project.ownerId`.

- [ ] **Step 4: Add the dialog template**

Bind the existing header button as follows:

```vue
<button v-if="detail.permissions.canManageMembers" class="small-button" @click="openMemberManagement">管理成员</button>
```

Render a `v-if="showMemberManagement"` modal after the detail page content. It must include:

- account and project-role selects plus an add button;
- a current-members table;
- a project-role select and remove control only when `member.id !== detail.project.ownerId`;
- a disabled owner-row label;
- close and cancel controls;
- `memberError` and `submitting` UI states.

Use ordinary `button` and `select` controls consistent with the existing project detail UI. Do not expose controls to non-owners.

- [ ] **Step 5: Add scoped responsive styles**

Add styles for `.member-management-backdrop`, `.member-management-dialog`, `.member-management-form`, and `.member-management-actions`. The backdrop must be fixed and visually separate the dialog; the dialog must constrain to the viewport, scroll vertically when needed, and collapse its form to one column at the existing narrow-screen breakpoint.

- [ ] **Step 6: Run focused UI tests and production type check**

Run: `npx vitest run tests/project-detail-ui.spec.ts`

Expected: PASS including the new management-action test.

Run: `npx vue-tsc --noEmit --incremental false`

Expected: exit code 0 with no TypeScript errors.

### Task 4: Verify Owner Protection and Full Regression

**Files:**
- Verify: `src/server/app.service.ts`
- Verify: `src/components/ProjectDetailPage.vue`
- Verify: `tests/project-members.spec.ts`
- Verify: `tests/task-management.spec.ts`
- Verify: `tests/project-detail-ui.spec.ts`

**Interfaces:**
- Consumes: the completed membership validation, revocation, and UI work.
- Produces: evidence that all acceptance criteria in the approved specification are satisfied.

- [ ] **Step 1: Extend owner-protection coverage if needed**

Ensure `tests/project-members.spec.ts` contains independent assertions that owner removal and owner role demotion fail, while a non-owner role update succeeds and records `project.member_role_updated` in `audit_logs`.

- [ ] **Step 2: Run all member-focused regression tests**

Run: `npx vitest run tests/project-members.spec.ts tests/task-management.spec.ts tests/project-detail-ui.spec.ts tests/workspace-service.spec.ts`

Expected: PASS with 0 failures.

- [ ] **Step 3: Run the complete test suite**

Run: `npm test`

Expected: exit code 0 with every test file passing.

- [ ] **Step 4: Run the production build**

Run: `npm run build`

Expected: exit code 0 and successful Vue type checking plus Vite output.

- [ ] **Step 5: Inspect the final diff**

Run:

```powershell
git diff --check
git diff -- src/server/app.service.ts src/components/ProjectDetailPage.vue src/style.css tests/project-members.spec.ts tests/task-management.spec.ts tests/project-detail-ui.spec.ts
git status --short
```

Expected: no whitespace errors and only planned changes plus unrelated pre-existing working-tree changes.
