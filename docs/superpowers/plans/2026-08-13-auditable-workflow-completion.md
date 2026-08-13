# Auditable Workflow Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure audit-log filtering and safe summaries, then complete manager deadline notifications while retaining version and reanalysis traceability.

**Architecture:** Extend the existing `AppService` audit read model with validated filters and a safe summary projection. Reuse the existing append-only meeting version and reanalysis workflows, adding acceptance coverage and confirmation UI. Expand the existing deadline-warning method to notify the project owner as well as the assignee.

**Tech Stack:** Vue 3, TypeScript, NestJS, MySQL (`mysql2`), Vitest, Vite.

## Global Constraints

- Preserve role authorization at the service layer.
- Audit summaries never contain meeting content, task descriptions, feedback text, passwords, tokens, configuration values, or desensitization patterns.
- Auditors never navigate into business pages.
- Do not add dependencies or a schema migration.
- Run `npm test` and `npm run build` before completion.

---

### Task 1: Secure Audit Query Model

**Files:**
- Modify: `src/server/app.service.ts:829-833`
- Modify: `src/server/app.controller.ts:70`
- Create: `tests/audit-logs.spec.ts`

**Interfaces:**
- Produces `auditLogs(user, filter)` where `filter` is `{ from?: string; to?: string; actorId?: string; projectId?: string; entityType?: string; action?: string }`.
- Each returned row includes `summary: { projectId: string | null; projectName: string | null; entityLabel: string | null; changedFields: string[] }`.

- [ ] **Step 1: Write failing security and filter tests**

```ts
it('returns only a safe summary for a filtered audit row', async () => {
  const rows = await service.auditLogs(auditor, { projectId: 'project-1', action: 'task.updated' })
  expect(rows[0].summary.changedFields).toEqual(['progress'])
  expect(JSON.stringify(rows[0].summary)).not.toContain('secret-content')
})

it('rejects invalid date ranges before querying', async () => {
  await expect(service.auditLogs(auditor, { from: '2026-08-14', to: '2026-08-13' })).rejects.toThrow('Invalid audit log filter')
})
```

- [ ] **Step 2: Confirm the tests fail**

Run: `npx vitest run tests/audit-logs.spec.ts`

Expected: FAIL because the service accepts no filter and returns no summary.

- [ ] **Step 3: Implement the smallest safe read model**

```ts
type AuditLogFilter = { from?: string; to?: string; actorId?: string; projectId?: string; entityType?: string; action?: string }
type AuditLogSummary = { projectId: string | null; projectName: string | null; entityLabel: string | null; changedFields: string[] }

async auditLogs(user: SessionUser, filter: AuditLogFilter = {}) {
  if (user.role !== 'admin' && user.role !== 'auditor') throw new ForbiddenException('Audit logs are restricted')
  const { where, values } = this.auditLogWhere(filter)
  const [rows] = await pool.query<any[]>(`SELECT ... ${where} ORDER BY l.created_at DESC LIMIT 500`, values)
  return Promise.all(rows.map(async (row) => ({ ...row, summary: await this.auditLogSummary(row) })))
}
```

Use parameterized clauses for all five filters. Validate `YYYY-MM-DD` dates and inverted ranges. Derive field names only from `details.fields`, `status`, and `progress`; query labels only for known entity types. Bind `@Query()` in the controller.

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run tests/audit-logs.spec.ts tests/role-separation.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add src/server/app.service.ts src/server/app.controller.ts tests/audit-logs.spec.ts && git commit -m "feat: add secure audit log filtering"`

### Task 2: Audit Filter and Summary Interface

**Files:**
- Modify: `src/services/workspaceService.ts`
- Modify: `src/App.vue`
- Modify: `src/style.css`
- Create: `tests/audit-logs-ui.spec.ts`

**Interfaces:**
- Consumes `GET /api/audit-logs` from Task 1.
- Produces `workspace.auditLogs(filter)` and a read-only `/audit-logs` summary modal.

- [ ] **Step 1: Write the failing UI contract test**

```ts
it('offers audit filters and a non-navigating summary action', () => {
  const source = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
  expect(source).toContain('loadAuditLogs')
  expect(source).toContain('查看摘要')
  expect(source).toContain('selectedAuditLog')
})
```

- [ ] **Step 2: Confirm the test fails**

Run: `npx vitest run tests/audit-logs-ui.spec.ts`

Expected: FAIL because the existing audit page has no filter state or detail view.

- [ ] **Step 3: Implement service query and client view**

```ts
const query = new URLSearchParams(Object.entries(filter)
  .filter(([, value]) => value)
  .map(([key, value]) => [key, String(value)]))
return request<AuditLog[]>(`/audit-logs${query.size ? `?${query}` : ''}`)
```

Add five controls, reset, result count, and `selectedAuditLog`. The summary modal displays only timestamp, actor, action, object type/ID, project name, object label, and changed fields. It must assign state only and never call `navigate`. Make filters wrap responsively.

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run tests/audit-logs-ui.spec.ts tests/role-separation.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add src/services/workspaceService.ts src/App.vue src/style.css tests/audit-logs-ui.spec.ts && git commit -m "feat: add audit log filters and summaries"`

### Task 3: Dual-Recipient Deadline Warning

**Files:**
- Modify: `src/server/app.service.ts:325-341`
- Modify: `tests/risk-warning.spec.ts`

**Interfaces:**
- Consumes task `{ id, title, assignee_id, project_id, due_date, status }` and project `owner_id`.
- Produces one unread notification per `(task, deadline type, recipient)` for the assignee and project owner.

- [ ] **Step 1: Add the failing manager-recipient test**

```ts
it('notifies the assignee and project owner once for an overdue task', async () => {
  await service.updateTask(manager, 'task-1', { progress: 50 })
  const calls = execute.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO notifications'))
  expect(calls).toHaveLength(2)
  expect(calls.map(([, values]) => values[1])).toEqual(expect.arrayContaining(['member-1', 'manager-1']))
})
```

- [ ] **Step 2: Confirm the test fails**

Run: `npx vitest run tests/risk-warning.spec.ts`

Expected: FAIL because only the assignee receives the notification.

- [ ] **Step 3: Expand recipient selection without changing deduplication**

```ts
const [owners] = await pool.query<any[]>('SELECT owner_id FROM projects WHERE id=?', [task.project_id])
const recipients = [...new Set([task.assignee_id, owners[0]?.owner_id].filter(Boolean))]
for (const recipientId of recipients) {
  const link = recipientId === task.assignee_id ? '/my-tasks' : '/risks'
  // Retain the existing unread `(user_id,title,link)` existence check before insertion.
}
```

Retain the completed/closed early return and existing open-risk deduplication.

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run tests/risk-warning.spec.ts tests/task-management.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add src/server/app.service.ts tests/risk-warning.spec.ts && git commit -m "feat: notify managers of task deadline risks"`

### Task 4: Version and Reanalysis Acceptance Coverage

**Files:**
- Modify: `src/App.vue`
- Modify: `tests/meeting-version.spec.ts`
- Modify: `tests/review-reanalysis.spec.ts`
- Modify: `tests/role-separation.spec.ts`

**Interfaces:**
- Consumes existing `restoreMeetingVersion(user, meetingId, versionId)` and reanalysis flow.
- Produces manager-only confirmed actions and evidence that historical records remain unchanged.

- [ ] **Step 1: Add missing acceptance tests**

```ts
it('audits an append-only version restoration', async () => {
  await service.restoreMeetingVersion(manager, 'meeting-1', 'version-1')
  expect(execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_logs'), expect.arrayContaining(['manager-1', 'meeting.version_restored']))
})

it('rejects a member before beginning version restoration', async () => {
  await expect(service.restoreMeetingVersion(member, 'meeting-1', 'version-1')).rejects.toThrow('Only managers can perform this action')
})
```

Add reanalysis assertions that source history is preserved, the resulting analysis is pending, and member/admin/auditor calls fail without writes.

- [ ] **Step 2: Run focused tests**

Run: `npx vitest run tests/meeting-version.spec.ts tests/review-reanalysis.spec.ts tests/role-separation.spec.ts`

Expected: PASS, or expose the smallest real server gap to fix.

- [ ] **Step 3: Add manager confirmation UI**

```ts
if (!window.confirm('恢复此版本会创建新的当前版本，是否继续？')) return
await restoreMeetingVersion(versionId)
```

Use the equivalent confirmation wording before reanalysis. Leave controls unavailable to member, admin, and auditor roles.

- [ ] **Step 4: Re-run focused tests**

Run: `npx vitest run tests/meeting-version.spec.ts tests/review-reanalysis.spec.ts tests/role-separation.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add src/App.vue tests/meeting-version.spec.ts tests/review-reanalysis.spec.ts tests/role-separation.spec.ts && git commit -m "test: verify meeting history traceability"`

### Task 5: Align PRD and Verify Delivery

**Files:**
- Modify: `prd.md`
- Modify: `docs/superpowers/specs/2026-08-13-deliverable-prd-baseline-design.md`

- [ ] **Step 1: Update requirements and role matrix**

Document manager-owned version recovery/reanalysis, assignee-plus-manager deadline reminders, audit filters, safe read-only summaries, and no auditor business navigation. Remove contradictory administrator business mutations and auditor business-detail requirements.

- [ ] **Step 2: Update the baseline design note**

Remove filtering and evidence-summary exclusions while retaining exclusions for business-detail access, exports, and generic push channels.

- [ ] **Step 3: Run focused feature tests**

Run: `npx vitest run tests/audit-logs.spec.ts tests/audit-logs-ui.spec.ts tests/risk-warning.spec.ts tests/meeting-version.spec.ts tests/review-reanalysis.spec.ts`

Expected: PASS.

- [ ] **Step 4: Run full verification**

Run: `npm test`

Expected: all tests PASS.

Run: `npm run build`

Expected: TypeScript validation and production build PASS.

- [ ] **Step 5: Commit**

Run: `git add prd.md docs/superpowers/specs/2026-08-13-deliverable-prd-baseline-design.md && git commit -m "docs: align prd with auditable workflow"`

## Plan Self-Review

- Task 1 implements five server-side filters, authorization, and no-leak summaries.
- Task 2 provides non-navigating audit interaction.
- Task 3 completes dual-recipient deadline notices and deduplication.
- Task 4 proves append-only version recovery and reanalysis traceability.
- Task 5 aligns PRD and requires full test/build verification.
