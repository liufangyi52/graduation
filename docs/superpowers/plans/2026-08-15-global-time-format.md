# Global Time Formatting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display every user-visible read-only date-time as Beijing time to the minute by consistently reusing `formatBeijingMinute()`.

**Architecture:** Preserve raw timestamps in API responses and application state. Apply formatting only at Vue and export presentation boundaries; keep date inputs, calendar labels, Gantt dates, and export filename dates as date-only values.

**Tech Stack:** Vue 3, TypeScript, Vitest, Vite

## Global Constraints

- Display read-only date-times as `YYYY-MM-DD HH:mm` in the `Asia/Shanghai` timezone.
- Reuse `formatBeijingMinute(value: string): string`; do not add backend time formatting.
- Keep `type="date"` inputs, date filters, calendar dates, Gantt dates, and export filename dates unchanged.
- Keep duration values such as analysis `ms` unchanged.
- Missing or invalid display values render as `-` through the existing formatter.
- Preserve unrelated edits in the dirty worktree and make only the listed local replacements.

---

### Task 1: Format App Shell Date-Time Displays

**Files:**
- Create: `tests/global-time-format-ui.spec.ts`
- Modify: `src/App.vue:17,652-743`
- Modify: `src/services/workspaceService.ts:161-166`

**Interfaces:**
- Consumes: `formatBeijingMinute(value: string): string` from `src/utils/date.ts` and existing raw timestamp fields in App state.
- Produces: Formatted application-shell timestamps and ISO feedback `createdAt` values.

- [ ] **Step 1: Write the failing App display test**

Create `tests/global-time-format-ui.spec.ts` with:

```ts
import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const appSource = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
const workspaceSource = readFileSync(new URL('../src/services/workspaceService.ts', import.meta.url), 'utf8')

it('formats every App read-only timestamp with formatBeijingMinute', () => {
  for (const binding of [
    'formatBeijingMinute(review.time)',
    'formatBeijingMinute(task.due)',
    'formatBeijingMinute(log.created_at)',
    'formatBeijingMinute(item.time)',
    'formatBeijingMinute(project.deadline)',
    'formatBeijingMinute(task.createdAt)',
    'formatBeijingMinute(item.createdAt)',
    'formatBeijingMinute(version.createdAt)',
    'formatBeijingMinute(selectedNotification.time)',
    'formatBeijingMinute(selectedTask.due)',
    'formatBeijingMinute(note.created_at)',
    'formatBeijingMinute(project.deleted_at)',
  ]) expect(appSource).toContain(binding)

  for (const rawBinding of [
    '{{ review.time }}', '{{ task.due }}', '{{ log.created_at }}', '{{ item.time }}',
    '{{ project.deadline }}', '{{ item.createdAt }}', '{{ version.createdAt }}',
    '{{ selectedNotification.time }}', '{{ selectedTask.due }}', '{{ note.created_at }}',
    '{{ project.deleted_at }}',
  ]) expect(appSource).not.toContain(rawBinding)

  expect(appSource).not.toContain('formatBeijingDateTime(task.createdAt)')
})

it('stores a real timestamp for newly submitted feedback', () => {
  expect(workspaceSource).toContain('createdAt: new Date().toISOString()')
  expect(workspaceSource).not.toContain("createdAt: '刚刚'")
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx vitest run tests/global-time-format-ui.spec.ts
```

Expected: FAIL on the first raw App binding and on `createdAt: '刚刚'`.

- [ ] **Step 3: Apply the minimal App template changes**

In `src/App.vue`, replace every tested raw binding with the matching call. Replace:

```vue
{{ formatBeijingDateTime(task.createdAt) }}
```

with:

```vue
{{ formatBeijingMinute(task.createdAt) }}
```

Remove `formatBeijingDateTime` from the date utility import because App no longer uses it. Do not change date inputs or calendar bindings.

- [ ] **Step 4: Store an ISO timestamp for new feedback**

In `src/services/workspaceService.ts`, change only the local feedback construction:

```ts
const feedback: MemberFeedback = {
  id: item.id,
  taskId,
  author,
  content,
  progress,
  createdAt: new Date().toISOString(),
}
```

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```powershell
npx vitest run tests/global-time-format-ui.spec.ts tests/date.spec.ts tests/notification-ui.spec.ts tests/workspace-service.spec.ts
```

Expected: all four test files PASS.

- [ ] **Step 6: Commit Task 1**

```powershell
git add -- src/App.vue src/services/workspaceService.ts tests/global-time-format-ui.spec.ts
git commit -m "fix: format application timestamps"
```

---

### Task 2: Format Task Board and Project Detail Date-Times

**Files:**
- Modify: `tests/global-time-format-ui.spec.ts`
- Modify: `src/components/TaskBoardPage.vue:1-10,122`
- Modify: `src/components/ProjectDetailPage.vue:134-136`

**Interfaces:**
- Consumes: `formatBeijingMinute(value: string): string` and existing task/project detail timestamp fields.
- Produces: Formatted task board deadlines and project detail task, meeting, and risk times.

- [ ] **Step 1: Extend the source-level test for independent pages**

Add these sources and assertions to `tests/global-time-format-ui.spec.ts`:

```ts
const taskBoardSource = readFileSync(new URL('../src/components/TaskBoardPage.vue', import.meta.url), 'utf8')
const projectDetailSource = readFileSync(new URL('../src/components/ProjectDetailPage.vue', import.meta.url), 'utf8')

it('formats task board and project detail timestamps', () => {
  expect(taskBoardSource).toContain("import { formatBeijingMinute } from '../utils/date'")
  expect(taskBoardSource).toContain('{{ formatBeijingMinute(task.due) }}')
  expect(taskBoardSource).not.toContain('{{ task.due }}')

  for (const binding of [
    'formatBeijingMinute(task.dueDate)',
    'formatBeijingMinute(meeting.createdAt)',
    'formatBeijingMinute(risk.createdAt)',
  ]) expect(projectDetailSource).toContain(binding)

  expect(projectDetailSource).not.toContain("{{ task.dueDate || '未设置' }}")
  expect(projectDetailSource).not.toContain('{{ meeting.createdAt }}')
  expect(projectDetailSource).not.toContain('{{ risk.createdAt }}')
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx vitest run tests/global-time-format-ui.spec.ts
```

Expected: FAIL because the task board and three project detail cells still render raw values.

- [ ] **Step 3: Format the task board deadline**

Add this import to `src/components/TaskBoardPage.vue`:

```ts
import { formatBeijingMinute } from '../utils/date'
```

Replace the deadline cell with:

```vue
<td>{{ formatBeijingMinute(task.due) }}</td>
```

- [ ] **Step 4: Format project detail task, meeting, and risk cells**

Use the existing `ProjectDetailPage.vue` import and replace the cells with:

```vue
<td>{{ task.dueDate ? formatBeijingMinute(task.dueDate) : '-' }}</td>
<td>{{ formatBeijingMinute(meeting.createdAt) }}</td>
<td>{{ formatBeijingMinute(risk.createdAt) }}</td>
```

- [ ] **Step 5: Run related page tests and verify GREEN**

Run:

```powershell
npx vitest run tests/global-time-format-ui.spec.ts tests/task-board-ui.spec.ts tests/project-detail-ui.spec.ts tests/project-analytics-ui.spec.ts
```

Expected: all four test files PASS, and date filters/Gantt assertions remain unchanged.

- [ ] **Step 6: Commit Task 2**

```powershell
git add -- src/components/TaskBoardPage.vue src/components/ProjectDetailPage.vue tests/global-time-format-ui.spec.ts
git commit -m "fix: format project task timestamps"
```

---

### Task 3: Format Exported Date-Times

**Files:**
- Modify: `src/utils/projectExport.ts:1-15`
- Modify: `tests/project-export-file.spec.ts`

**Interfaces:**
- Consumes: `formatBeijingMinute(value: string): string`, `ExportTask`, and `ExportMeeting`.
- Produces: Task and meeting export rows with formatted creation and deadline values.

- [ ] **Step 1: Write failing behavioral export tests**

First update the import in `tests/project-export-file.spec.ts`:

```ts
import { exportFilename, meetingRows, taskRows } from '../src/utils/projectExport'
```

Then add:

```ts
it('formats exported task timestamps as Beijing time to the minute', () => {
  const row = taskRows([{
    title: 'Ship',
    createdAt: '2026-08-15T08:00:00.000Z',
    dueDate: '2026-08-30T16:00:00.000Z',
  }])[0]

  expect(row).toMatchObject({ 创建时间: '2026-08-15 16:00', 截止日期: '2026-08-31 00:00' })
})

it('formats exported meeting timestamps as Beijing time to the minute', () => {
  const row = meetingRows([{ title: 'Kickoff', createdAt: '2026-08-15T08:00:00.000Z' }])[0]
  expect(row).toMatchObject({ 创建时间: '2026-08-15 16:00' })
})
```

- [ ] **Step 2: Run the export test and verify RED**

Run:

```powershell
npx vitest run tests/project-export-file.spec.ts
```

Expected: FAIL because export rows currently contain the raw input strings.

- [ ] **Step 3: Format task and meeting export rows**

Import the formatter in `src/utils/projectExport.ts`:

```ts
import { formatBeijingMinute } from './date'
```

Update the date-time columns while leaving `exportFilename()` unchanged:

```ts
创建时间: task.createdAt ? formatBeijingMinute(task.createdAt) : '-',
截止日期: task.dueDate ? formatBeijingMinute(task.dueDate) : '-',
```

and:

```ts
创建时间: meeting.createdAt ? formatBeijingMinute(meeting.createdAt) : '-',
```

- [ ] **Step 4: Run export and date tests and verify GREEN**

Run:

```powershell
npx vitest run tests/project-export-file.spec.ts tests/project-export.spec.ts tests/date.spec.ts
```

Expected: all three test files PASS.

- [ ] **Step 5: Commit Task 3**

```powershell
git add -- src/utils/projectExport.ts tests/project-export-file.spec.ts
git commit -m "fix: format exported timestamps"
```

---

### Task 4: Full Regression Verification

**Files:**
- Verify only; no production file changes expected.

**Interfaces:**
- Consumes: all changes from Tasks 1-3.
- Produces: evidence that time formatting is complete without breaking date-only workflows.

- [ ] **Step 1: Scan Vue templates for known raw timestamp bindings**

Run:

```powershell
rg -n -g '*.vue' "\{\{\s*(review\.time|task\.due|log\.created_at|item\.time|project\.deadline|item\.createdAt|version\.createdAt|selectedNotification\.time|selectedTask\.due|note\.created_at|project\.deleted_at|task\.dueDate|meeting\.createdAt|risk\.createdAt)\s*\}\}" src
```

Expected: no matches.

- [ ] **Step 2: Run the complete test suite**

Run:

```powershell
npm test
```

Expected: all Vitest tests PASS.

- [ ] **Step 3: Build the production bundle**

Run:

```powershell
npm run build
```

Expected: Vite build succeeds without TypeScript or Vue template errors.

- [ ] **Step 4: Review the final scoped diff**

Run:

```powershell
git diff --check
git diff -- src/App.vue src/components/TaskBoardPage.vue src/components/ProjectDetailPage.vue src/services/workspaceService.ts src/utils/projectExport.ts tests/global-time-format-ui.spec.ts tests/project-export-file.spec.ts
```

Expected: no whitespace errors; the diff contains only timestamp formatting, feedback timestamp creation, and related tests.
