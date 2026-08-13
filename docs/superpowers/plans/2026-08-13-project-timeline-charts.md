# Project Timeline Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a genuine proportional Gantt chart, an SVG burndown chart, and a complete task completion-date data path to project analytics.

**Architecture:** The NestJS detail query supplies persisted task timestamps to the workspace service. A pure analytics helper normalizes dates and derives visual-model data. The Vue page renders those models using CSS for the Gantt chart and an inline SVG for the burndown chart.

**Tech Stack:** Vue 3, TypeScript, NestJS, MySQL, Vitest, CSS, SVG.

## Global Constraints

- Do not add a charting dependency.
- Do not fabricate completion dates for historical tasks.
- Retain the existing export and authorization behavior.
- Use date-only values for chart calculations.

---

### Task 1: Completion Date Detail Contract

**Files:**
- Modify: `src/server/app.service.ts`
- Modify: `src/services/workspaceService.ts`
- Test: `tests/project-detail.spec.ts`

**Interfaces:**
- Produces: `ProjectDetailTask.createdAt: string` and `ProjectDetailTask.completedAt: string | null`.

- [ ] **Step 1: Write the failing service contract test**

```ts
expect(result.tasks[0]).toMatchObject({
  createdAt: '2026-08-01',
  completedAt: '2026-08-10',
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/project-detail.spec.ts`
Expected: FAIL because task detail has no completion timestamp.

- [ ] **Step 3: Add the selected completion audit timestamp and map the response**

```ts
createdAt: task.created_at,
completedAt: task.completed_at ?? null,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/project-detail.spec.ts`
Expected: PASS.

### Task 2: Analytics View Models

**Files:**
- Modify: `src/utils/projectAnalytics.ts`
- Modify: `tests/project-analytics.spec.ts`

**Interfaces:**
- Produces: `ganttRange`, `ganttTasks[].left`, `ganttTasks[].width`, and `burndown` chart data from `buildProjectAnalytics(input, today)`.

- [ ] **Step 1: Write failing literal-data tests**

```ts
expect(analytics.ganttTasks[0]).toMatchObject({ left: 0, width: 50 })
expect(analytics.burndown.actual).toEqual([
  { date: '2026-08-01', remaining: 2 },
  { date: '2026-08-02', remaining: 1 },
])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/project-analytics.spec.ts`
Expected: FAIL because chart geometry and burndown series do not exist.

- [ ] **Step 3: Implement date normalization and pure chart derivation**

```ts
const left = Math.round(((startDay - rangeStart) / rangeDays) * 100)
const width = Math.max(1, Math.round(((endDay - startDay + 1) / rangeDays) * 100))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/project-analytics.spec.ts`
Expected: PASS.

### Task 3: Render Project Charts

**Files:**
- Modify: `src/components/ProjectDetailPage.vue`
- Modify: `src/style.css`
- Modify: `tests/project-analytics-ui.spec.ts`

**Interfaces:**
- Consumes: `ProjectAnalytics.ganttRange`, `ganttTasks`, and `burndown`.
- Produces: accessible Gantt and burndown page regions.

- [ ] **Step 1: Write failing UI behavior tests**

```ts
expect(source).toContain('project-gantt')
expect(source).toContain('burndown-chart')
expect(source).toContain('completedAt: task.completedAt')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/project-analytics-ui.spec.ts`
Expected: FAIL because semantic chart structures and data connection are missing.

- [ ] **Step 3: Render the date axis, task bars, SVG chart, legends, and empty states**

```vue
<div class="project-gantt" role="img" :aria-label="ganttAriaLabel">
  <i class="gantt-bar" :style="{ left: `${task.left}%`, width: `${task.width}%` }" />
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/project-analytics-ui.spec.ts`
Expected: PASS.

### Task 4: Integration Verification

**Files:**
- Modify: `tests/project-analytics.spec.ts`

- [ ] **Step 1: Add invalid-date and missing-completion regression coverage**

```ts
expect(analytics.ganttTasks).toHaveLength(1)
expect(analytics.burndown.actual).toHaveLength(0)
```

- [ ] **Step 2: Run focused tests**

Run: `npm test -- tests/project-detail.spec.ts tests/project-analytics.spec.ts tests/project-analytics-ui.spec.ts`
Expected: PASS.

- [ ] **Step 3: Run full verification**

Run: `npm test; npm run build`
Expected: all tests pass and production build exits with status 0.
