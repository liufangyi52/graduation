# Member Dashboard Priority Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the member dashboard priority table show clean task titles, Beijing deadlines to the minute, and a taller aligned panel row.

**Architecture:** Keep the task data unchanged. Add a focused Asia/Shanghai deadline formatter in the existing date utility, then consume it only from the member dashboard priority table. A member-dashboard CSS selector provides the shared minimum row height while preserving existing responsive grid behavior.

**Tech Stack:** Vue 3, TypeScript, Vitest, Vite, CSS.

## Global Constraints

- Do not expose task UUIDs in the member dashboard priority table.
- Render deadlines as `YYYY-MM-DD HH:mm` in the Asia/Shanghai timezone.
- Preserve all task API data, role permissions, and responsive single-column behavior below 1180px.

---

### Task 1: Define the Member Dashboard Display Contract

**Files:**
- Modify: `tests/notification-ui.spec.ts`

**Interfaces:**
- Consumes: `src/App.vue` member dashboard template and `src/style.css` dashboard selectors.
- Produces: Regression assertions that fail until UUID markup is removed, the minute formatter is used, and the member dashboard row has a minimum height.

- [x] **Step 1: Write the failing test**

```ts
it('keeps the member dashboard priority table readable and aligned', () => {
  expect(appSource).toContain('{{ formatBeijingMinute(task.due) }}')
  expect(appSource).not.toContain('<small class="mono">{{ task.id }}</small></td><td>{{ task.project }}</td><td class="mono">{{ task.due }}</td>')
  expect(styleSource).toContain('.member-dashboard .top-grid { min-height: 320px; }')
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/notification-ui.spec.ts`

Expected: FAIL because `formatBeijingMinute`, the revised task markup, and the member dashboard minimum height do not exist yet.

- [x] **Step 3: Keep the test focused**

```ts
const styleSource = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8')
```

Place this import beside the existing `appSource` import so the test only examines the member dashboard contract.

- [x] **Step 4: Run test to verify the expected red state remains**

Run: `npm test -- --run tests/notification-ui.spec.ts`

Expected: FAIL with the first missing priority-table assertion.

### Task 2: Implement Clean Priority-Table Content and Layout

**Files:**
- Modify: `src/utils/date.ts`
- Modify: `src/App.vue`
- Modify: `src/style.css`
- Test: `tests/notification-ui.spec.ts`

**Interfaces:**
- Consumes: `formatBeijingMinute(value: string): string`, `Task.due`, the member dashboard `top-grid` selector.
- Produces: Member dashboard rows with title, project, Beijing deadline to the minute, progress, and action; a `320px` minimum panel-row height.

- [x] **Step 1: Write minimal date formatting implementation**

```ts
export function formatBeijingMinute(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间未知'
  const parts = beijingParts(date)
  return `${parts.year}-${parts.month.padStart(2, '0')}-${parts.day.padStart(2, '0')} ${parts.hour}:${parts.minute}`
}
```

- [x] **Step 2: Update the member dashboard table only**

```vue
<td><strong>{{ task.title }}</strong></td>
<td>{{ task.project }}</td>
<td class="mono">{{ formatBeijingMinute(task.due) }}</td>
```

Do not alter the task-detail view or the member task card date display.

- [x] **Step 3: Add the scoped layout rule**

```css
.member-dashboard .top-grid { min-height: 320px; }
```

Place it next to the existing `.top-grid` rule so desktop alignment remains local to this dashboard.

- [x] **Step 4: Run focused test to verify it passes**

Run: `npm test -- --run tests/notification-ui.spec.ts`

Expected: PASS with all notification and priority-table display assertions green.

- [x] **Step 5: Run production build**

Run: `npm run build`

Expected: TypeScript check and Vite production build exit with code 0; the pre-existing bundle-size advisory may remain.
