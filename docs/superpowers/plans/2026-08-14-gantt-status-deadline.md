# 甘特图状态与截止日期表达 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将项目分析页甘特图统一为未完成、进行中、已完成三种方框状态，并在三天内临期和逾期时显示时间风险。

**Architecture:** 在 `src/utils/projectAnalytics.ts` 的纯数据模型中归一化三种展示状态并计算截止日期风险，Vue 页面只消费这些字段。甘特条保留日期比例与今天竖线，使用状态 class 及独立的风险标签表达信息，避免把状态颜色和时间风险混为一谈。

**Tech Stack:** Vue 3、TypeScript、Vitest、CSS。

## Global Constraints

- 甘特任务条只使用 `未完成`、`进行中`、`已完成` 三种状态。
- 临近截止阈值固定为截止日前 0 至 3 天。
- 已完成任务不显示逾期或临期风险。
- 不新增图表依赖，不修改任务生命周期、导出或权限逻辑。
- 无有效日期的任务不参与时间风险计算并保留未排期提示。

---

### Task 1: 扩展甘特任务纯数据模型

**Files:**
- Modify: `src/utils/projectAnalytics.ts`
- Test: `tests/project-analytics.spec.ts`

**Interfaces:**
- Produces `GanttTask.displayStatus: 'todo' | 'in_progress' | 'completed'` and `GanttTask.deadlineAlert: 'overdue' | 'due_soon' | null`, plus `deadlineDaysLeft: number | null`.

- [ ] **Step 1: Write failing tests for status normalization and deadline alerts**

```ts
expect(analytics.ganttTasks.map((task) => ({
  id: task.id,
  displayStatus: task.displayStatus,
  deadlineAlert: task.deadlineAlert,
  deadlineDaysLeft: task.deadlineDaysLeft,
}))).toEqual([
  { id: 'todo', displayStatus: 'todo', deadlineAlert: 'due_soon', deadlineDaysLeft: 2 },
  { id: 'active', displayStatus: 'in_progress', deadlineAlert: 'overdue', deadlineDaysLeft: -1 },
  { id: 'done', displayStatus: 'completed', deadlineAlert: null, deadlineDaysLeft: null },
])
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- tests/project-analytics.spec.ts`
Expected: FAIL because the new display fields are absent.

- [ ] **Step 3: Implement the minimal pure helpers and fields**

Add `normalizeGanttStatus(task)` with precedence `completed/closed or progress >= 100 -> completed`, positive progress or `in_progress -> in_progress`, otherwise `todo`. Compute date difference from normalized `today`: negative means `overdue`, 0..3 means `due_soon`, and completed tasks always return `null`.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npm test -- tests/project-analytics.spec.ts`
Expected: PASS, with existing geometry, metrics, and burndown assertions unchanged.

- [ ] **Step 5: Commit the model change**

```bash
git add src/utils/projectAnalytics.ts tests/project-analytics.spec.ts
git commit -m "feat: derive gantt status and deadline alerts"
```

### Task 2: Render the three states and time risk labels

**Files:**
- Modify: `src/components/ProjectDetailPage.vue`
- Modify: `src/style.css`
- Test: `tests/project-analytics-ui.spec.ts`

**Interfaces:**
- Consumes `GanttTask.displayStatus`, `deadlineAlert`, and `deadlineDaysLeft` from Task 1.
- Produces a three-item legend, state-specific task boxes, and visible `已逾期`/`临近截止` labels.

- [ ] **Step 1: Write failing UI source assertions**

```ts
expect(source).toContain('gantt-legend-todo')
expect(source).toContain('gantt-legend-progress')
expect(source).toContain('gantt-legend-completed')
expect(source).toContain('deadlineAlert')
expect(source).toContain('临近截止')
expect(style).toContain('.gantt-bar.status-todo')
expect(style).toContain('.gantt-bar.status-in-progress')
expect(style).toContain('.gantt-bar.status-completed')
```

- [ ] **Step 2: Run the focused UI test and verify it fails**

Run: `npm test -- tests/project-analytics-ui.spec.ts`
Expected: FAIL because the new legend and risk markup do not exist.

- [ ] **Step 3: Replace the old plan/actual legend and markup**

Render one full-width state bar per task using the existing `task.left` and `task.width`, class it with `status-${task.displayStatus}`, and add a compact `gantt-deadline-alert` element beside the state label. Use `deadlineAlert === 'overdue'` for red `已逾期`, `due_soon` for orange `临近截止 · 剩 ${deadlineDaysLeft} 天`, and omit the alert element otherwise. Keep task dates and today marker.

- [ ] **Step 4: Add restrained, accessible CSS**

Define distinct box treatments for the three states, keep fixed track dimensions, add `.gantt-deadline-alert.overdue` and `.due-soon` colors, and update responsive rules so labels do not overlap at narrow widths.

- [ ] **Step 5: Run the focused UI test and verify it passes**

Run: `npm test -- tests/project-analytics-ui.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit the UI change**

```bash
git add src/components/ProjectDetailPage.vue src/style.css tests/project-analytics-ui.spec.ts
git commit -m "feat: show gantt states and deadline warnings"
```

### Task 3: Regression verification

**Files:**
- Modify: `tests/project-analytics.spec.ts` only if boundary coverage needs a focused assertion.

- [ ] **Step 1: Run focused analytics and UI tests**

Run: `npm test -- tests/project-analytics.spec.ts tests/project-analytics-ui.spec.ts tests/project-detail-ui.spec.ts`
Expected: PASS.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all Vitest tests pass.

- [ ] **Step 3: Run the production build**

Run: `npm run build`
Expected: `vue-tsc` and Vite build exit with status 0.

- [ ] **Step 4: Inspect the final diff**

Run: `git diff --check; git status --short`
Expected: no whitespace errors; only the intended implementation files remain modified in addition to pre-existing user changes.
