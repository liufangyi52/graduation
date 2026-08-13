# Core Workflow Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an acceptance-testable meeting-minute-to-task workflow with versioned desensitized minutes, member management, task-derived progress and risk alerts.

**Architecture:** Keep all authorization and workflow invariants in `AppService`. Add small server utilities for desensitization and DOCX parsing, use migration-safe additive schema changes, and expose narrowly scoped controller endpoints. Extend the existing Vue service layer and meeting/project screens rather than introducing a second state store.

**Tech Stack:** Vue 3, TypeScript, NestJS 11, MySQL 8, Vitest, `multer`, `mammoth`.

## Global Constraints

- Preserve all existing user changes; do not reset or overwrite unrelated worktree changes.
- Project managers may mutate only projects they own; members may read joined projects and update only their tasks; administrators and auditors cannot mutate project business data.
- Store original minute content only in `meeting_versions`; do not write minute content, rejection reasons, or feedback content to audit details.
- AI analysis must consume the current desensitized version content, never the original version content.
- Use TDD for each behavioral unit: focused test red, implementation, focused green, then full suite.
- Configure Vitest to exclude `.worktrees/**` so the test count reflects this workspace.

---

## File Structure

- `src/server/desensitization.ts`: deterministic sensitive-content replacement.
- `src/server/document-import.ts`: validates upload size/type and extracts TXT/DOCX text.
- `src/server/migrate.ts`: additive meeting-version and risk metadata migration.
- `src/server/dtos.ts`: member and review input DTOs.
- `src/server/app.service.ts`: version, member, notification, progress, and warning rules.
- `src/server/app.controller.ts`: protected REST/multipart routes.
- `src/services/meetingService.ts`: browser API client and version types.
- `src/services/workspaceService.ts`: project-progress mapping and member API client.
- `src/App.vue`: minute import/version panel and project member controls.
- `vite.config.ts`: excludes nested worktree tests.
- `tests/desensitization.spec.ts`, `tests/meeting-version.spec.ts`, `tests/project-members.spec.ts`, `tests/risk-warning.spec.ts`, `tests/workspace-service.spec.ts`, `tests/meeting-workflow.spec.ts`: regression coverage.
- `scripts/smoke-core-workflow.ts`: disposable real-MySQL acceptance sequence.

### Task 1: Test Isolation And Sensitive Content Utility

**Files:**
- Create: `tests/desensitization.spec.ts`
- Create: `src/server/desensitization.ts`
- Modify: `vite.config.ts`

**Interfaces:**
- Produces `desensitizeMeetingContent(content: string): { content: string; replacements: Record<'phone' | 'email' | 'identity', number> }`.

- [ ] **Step 1: Write failing replacement tests**

```ts
import { expect, it } from 'vitest'
import { desensitizeMeetingContent } from '../src/server/desensitization'

it('replaces email, Chinese mobile, and identity number without changing normal text', () => {
  const result = desensitizeMeetingContent('联系 a@example.com，电话 13800138000，证件 11010519491231002X。')
  expect(result.content).toBe('联系 [EMAIL]，电话 [PHONE]，证件 [IDENTITY]。')
  expect(result.replacements).toEqual({ email: 1, phone: 1, identity: 1 })
})
```

- [ ] **Step 2: Run focused test and confirm it fails because the module is absent**

Run: `npx vitest run tests/desensitization.spec.ts`

- [ ] **Step 3: Implement the minimal utility and Vitest exclusion**

```ts
export function desensitizeMeetingContent(content: string) {
  const replacements = { phone: 0, email: 0, identity: 0 }
  let value = content.replace(/\b\d{17}[\dXx]\b/g, () => { replacements.identity++; return '[IDENTITY]' })
  value = value.replace(/\b1[3-9]\d{9}\b/g, () => { replacements.phone++; return '[PHONE]' })
  value = value.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, () => { replacements.email++; return '[EMAIL]' })
  return { content: value, replacements }
}
```

Set `test.exclude` in `vite.config.ts` to include `**/.worktrees/**`.

- [ ] **Step 4: Run focused and full tests**

Run: `npx vitest run tests/desensitization.spec.ts && npm test`

### Task 2: Migration-Safe Meeting Version Persistence

**Files:**
- Create: `tests/meeting-version.spec.ts`
- Modify: `src/server/migrate.ts`
- Modify: `src/server/app.service.ts`

**Interfaces:**
- Produces `createMeetingVersion(user, meetingId, content, source): Promise<MeetingVersion>`.
- Produces `listMeetingVersions(user, meetingId): Promise<MeetingVersionSummary[]>`.
- Produces `getMeetingVersion(user, meetingId, versionId): Promise<MeetingVersion>`.
- Produces `restoreMeetingVersion(user, meetingId, versionId): Promise<MeetingVersion>`.

- [ ] **Step 1: Write failing immutable restore test**

```ts
it('restores a historical meeting version by inserting a new current version', async () => {
  const service = new AppService({} as any)
  // Mock owner lookup, existing version 1, and a connection that records INSERT statements.
  await service.restoreMeetingVersion(manager, 'meeting-1', 'version-1')
  expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO meeting_versions'), expect.arrayContaining(['meeting-1', 2]))
  expect(connection.execute).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE meeting_versions SET'))
})
```

- [ ] **Step 2: Run focused test and confirm the missing service method failure**

Run: `npx vitest run tests/meeting-version.spec.ts`

- [ ] **Step 3: Add additive migration and service methods**

Create `meeting_versions` with `id`, `meeting_id`, `version_number`, `source_type`, `original_content`, `desensitized_content`, `created_by`, `created_at`, unique `(meeting_id, version_number)`. Add nullable `meetings.current_version_id` and `ai_analyses.rejection_reason`. Create a version in `createMeeting`; lazily bootstrap version one for existing meetings. Restore must read source content, insert the next number, and update only `meetings.current_version_id` in a transaction.

- [ ] **Step 4: Run focused and full tests**

Run: `npx vitest run tests/meeting-version.spec.ts && npm test`

### Task 3: Meeting Import, Version APIs, And AI Source Safety

**Files:**
- Modify: `package.json`
- Modify: `src/server/app.controller.ts`
- Modify: `src/server/dtos.ts`
- Modify: `src/server/app.service.ts`
- Create: `src/server/document-import.ts`
- Modify: `src/services/meetingService.ts`
- Modify: `tests/meeting-workflow.spec.ts`

**Interfaces:**
- `POST /api/meetings/import` accepts `projectId`, `title`, and `file` (`.txt` or `.docx`, maximum 2 MiB).
- `GET /api/meetings/:id/versions`, `GET /api/meetings/:id/versions/:versionId`, `POST /api/meetings/:id/versions/:versionId/restore`.
- `review(id, approved, reason?)` client call.

- [ ] **Step 1: Write failing API-client tests**

```ts
it('uploads a meeting file as multipart data without forcing a JSON content type', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'm1' }), { status: 200 }))
  await createMeetingService('token').importFile('p1', 'Minutes', new File(['hello'], 'minutes.txt', { type: 'text/plain' }))
  expect(fetchMock.mock.calls[0][0]).toContain('/meetings/import')
  expect((fetchMock.mock.calls[0][1] as RequestInit).body).toBeInstanceOf(FormData)
  expect((fetchMock.mock.calls[0][1] as RequestInit).headers).not.toHaveProperty('Content-Type')
})
```

- [ ] **Step 2: Run the focused test and confirm it fails because `importFile` is absent**

Run: `npx vitest run tests/meeting-workflow.spec.ts`

- [ ] **Step 3: Install parsing dependencies and implement routes**

Run: `npm install multer mammoth && npm install -D @types/multer`

Use Nest `FileInterceptor('file')`, reject non-TXT/DOCX and uploads above 2 MiB, use `mammoth.extractRawText({ buffer })` for DOCX, and require nonempty extracted text. The analysis query must join the current meeting version and pass `desensitized_content` to `DeepSeekService.analyze`. Add a test that asserts the service's analyze dependency receives masked rather than original content.

- [ ] **Step 4: Run focused and full tests**

Run: `npx vitest run tests/meeting-workflow.spec.ts tests/meeting-version.spec.ts && npm test`

### Task 4: Project Membership Operations

**Files:**
- Create: `tests/project-members.spec.ts`
- Modify: `src/server/dtos.ts`
- Modify: `src/server/app.controller.ts`
- Modify: `src/server/app.service.ts`
- Modify: `src/services/workspaceService.ts`

**Interfaces:**
- `listProjectMembers(user, projectId)`, `addProjectMember(user, projectId, userId, projectRole)`, `updateProjectMemberRole(user, projectId, userId, projectRole)`, `removeProjectMember(user, projectId, userId)`.
- Client methods map to `/projects/:id/members`.

- [ ] **Step 1: Write manager-only and owner-protection tests**

```ts
it('refuses removal of the project owner but permits removal of an ordinary member', async () => {
  await expect(service.removeProjectMember(manager, 'project-1', 'manager-1')).rejects.toThrow('Project owner cannot be removed')
  await expect(service.removeProjectMember(manager, 'project-1', 'member-1')).resolves.toEqual({ projectId: 'project-1', userId: 'member-1', removed: true })
})
```

- [ ] **Step 2: Run focused test and confirm it fails because membership methods are absent**

Run: `npx vitest run tests/project-members.spec.ts`

- [ ] **Step 3: Implement ownership checks, DTOs, endpoints, and client methods**

Use `INSERT ... ON DUPLICATE KEY UPDATE project_role=VALUES(project_role)` only after proving the target user is active. Permit `member` and `manager` role values. Prevent removal of `projects.owner_id`; audit member add/role-update/remove using ids and roles only.

- [ ] **Step 4: Run focused and full tests**

Run: `npx vitest run tests/project-members.spec.ts && npm test`

### Task 5: Approval Notifications And Privacy-Safe Rejection

**Files:**
- Modify: `tests/meeting-workflow.spec.ts`
- Modify: `tests/role-separation.spec.ts`
- Modify: `src/server/dtos.ts`
- Modify: `src/server/app.controller.ts`
- Modify: `src/server/app.service.ts`
- Modify: `src/services/meetingService.ts`

**Interfaces:**
- `reviewAnalysis(user, analysisId, approved, reason?): Promise<{ id: string; status: string }>`.

- [ ] **Step 1: Write failing notification and audit-privacy tests**

```ts
it('creates an assignee notification on approval and never puts a rejection reason in audit JSON', async () => {
  await service.reviewAnalysis(manager, 'analysis-1', true)
  expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO notifications'), expect.arrayContaining(['/my-tasks']))
  await service.reviewAnalysis(manager, 'analysis-2', false, 'Needs clarification')
  expect(JSON.stringify(auditExecute.mock.calls.at(-1)?.[1])).not.toContain('Needs clarification')
})
```

- [ ] **Step 2: Run focused test and confirm it fails on notification/reason behavior**

Run: `npx vitest run tests/meeting-workflow.spec.ts tests/role-separation.spec.ts`

- [ ] **Step 3: Implement transaction-bound notifications and rejection reason storage**

Insert notification rows in the same approval transaction for every task, with title `已分配任务：<title>` and link `/my-tasks`. On rejection, update `rejection_reason` only in `ai_analyses`; audit action and ids without the reason. Validate an optional reason has at most 500 trimmed characters.

- [ ] **Step 4: Run focused and full tests**

Run: `npx vitest run tests/meeting-workflow.spec.ts tests/role-separation.spec.ts && npm test`

### Task 6: Project Progress And Deadline Risk Warnings

**Files:**
- Create: `tests/risk-warning.spec.ts`
- Modify: `tests/workspace-service.spec.ts`
- Modify: `src/server/app.service.ts`
- Modify: `src/services/workspaceService.ts`
- Modify: `src/App.vue`

**Interfaces:**
- Project SQL returns `progress` as `COALESCE(ROUND(AVG(tasks.progress)), 0)`.
- `ensureTaskDeadlineWarnings(connection, task)` inserts de-duplicated risk/notification rows.

- [ ] **Step 1: Write failing progress mapping and duplicate-warning tests**

```ts
it('maps the server-calculated project progress instead of a fixed zero', () => {
  expect(mapProject({ id: 'p1', name: 'Alpha', code: 'A', owner_name: 'M', status: 'active', progress: 65 })).toMatchObject({ progress: 65 })
})

it('creates no second open overdue risk when the same task is updated again', async () => {
  await service.updateTask(manager, 'task-1', { progress: 50 })
  expect(connection.execute).toHaveBeenCalledTimes(expectedInsertCount)
})
```

- [ ] **Step 2: Run focused test and confirm it fails on fixed progress and missing warning helper**

Run: `npx vitest run tests/risk-warning.spec.ts tests/workspace-service.spec.ts`

- [ ] **Step 3: Implement calculated progress and warning helper**

Update all project-list queries with a `LEFT JOIN tasks` aggregate. On task update and feedback, load task due date/assignee in the transaction; create condition title `任务逾期：<task id>` or `任务临近截止：<task id>` only if no matching open risk exists. Insert one unread notification for the matching condition only if no unread notification with that exact title and link exists. Skip completed tasks and tasks without due dates.

- [ ] **Step 4: Add operational UI refresh and run full verification**

After task update/feedback/review, reload workspace data so project cards display the server progress and new risks/notifications. Run: `npx vitest run tests/risk-warning.spec.ts tests/workspace-service.spec.ts && npm test && npm run build`

### Task 7: Meeting And Membership Acceptance UI

**Files:**
- Modify: `src/App.vue`
- Modify: `src/style.css`
- Modify: `src/services/meetingService.ts`
- Modify: `src/services/workspaceService.ts`
- Modify: `tests/meeting-layout.spec.ts`

**Interfaces:**
- `meetingService.listVersions(meetingId)`, `getVersion(meetingId, versionId)`, `restoreVersion(meetingId, versionId)`.
- `workspaceService.listProjectMembers(projectId)`, `addProjectMember(projectId, userId, role)`, `removeProjectMember(projectId, userId)`.

- [ ] **Step 1: Write failing UI-contract tests**

```ts
it('provides text/file minute intake and a version history action', () => {
  expect(appSource).toContain('type="file"')
  expect(appSource).toContain('accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"')
  expect(appSource).toContain('版本记录')
})
```

- [ ] **Step 2: Run focused test and confirm it fails on the missing controls**

Run: `npx vitest run tests/meeting-layout.spec.ts`

- [ ] **Step 3: Implement concise manager-facing controls**

Add a source-mode segmented control, file input with selected-file label, submit path that selects text or `importFile`, a history drawer showing version number/source/time/current state, two-version content comparison, and a restore action with confirmation. On project cards, add a manager member dialog with active-user selection, role select, list, and remove command. Keep controls absent for non-managers.

- [ ] **Step 4: Run UI contract, full tests, and production build**

Run: `npx vitest run tests/meeting-layout.spec.ts && npm test && npm run build`

### Task 8: Real-Database Acceptance Smoke Test And Documentation

**Files:**
- Create: `scripts/smoke-core-workflow.ts`
- Modify: `README.md`

**Interfaces:**
- Script reads the existing `.env`, creates uniquely named disposable accounts/project, exercises meeting creation/versioning/member assignment/task feedback, asserts database state, and removes only rows by its generated UUIDs in a transaction.

- [ ] **Step 1: Write the smoke script assertions before wiring its implementation**

```ts
assert.equal(versions.length, 2)
assert.equal(project.progress, 50)
assert.equal(openWarnings.length, 1)
assert.equal(auditDetails.includes(rawMeetingContent), false)
```

- [ ] **Step 2: Run it and confirm it fails until the expected APIs/schema exist**

Run: `npx tsx scripts/smoke-core-workflow.ts`

- [ ] **Step 3: Implement disposable setup, verification, and targeted cleanup**

Use a `smoke-<uuid>` prefix for all created emails, project code, minute title, and ids. In `finally`, delete only rows whose project id or user id belongs to the script-created ids, respecting foreign-key order. Document prerequisites and run commands in README.

- [ ] **Step 4: Complete acceptance verification**

Run: `npm test && npm run build`; start `npm run server`, then request `GET http://127.0.0.1:3000/api/health`; run `npx tsx scripts/smoke-core-workflow.ts`; record each exit code before reporting completion.
