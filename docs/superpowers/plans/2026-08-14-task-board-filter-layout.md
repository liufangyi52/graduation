# Task Board Filter Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep task-board filters legible at desktop and narrow viewport widths without changing filter behavior.

**Architecture:** Scope layout rules to `.board-filters` so other pages retain the shared `.filter-bar` behavior. Group the date controls and give the risk checkbox an explicit layout role; responsive CSS changes the grid columns at defined breakpoints.

**Tech Stack:** Vue 3, TypeScript, CSS Grid, Vitest.

## Global Constraints

Keep filter query synchronization unchanged. Preserve the current visual tokens, compact input treatment, and table layout.

---

### Task 1: Make The Filter Controls Responsive

**Files:**
- Modify: `src/components/TaskBoardPage.vue`
- Modify: `src/style.css`
- Test: `tests/task-board-ui.spec.ts`

**Interfaces:**
- Consumes: the existing `filters` ref and `v-model` bindings.
- Produces: a `.board-filters` grid with `.risk-filter` and `.date-filter` layout hooks.

- [ ] **Step 1: Write the failing test**

Add a focused assertion that the task board exposes the date and risk layout hooks, and that the task-board stylesheet defines responsive grid rules.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/task-board-ui.spec.ts`

Expected: FAIL because the date and risk layout hooks do not exist.

- [ ] **Step 3: Write minimal implementation**

Wrap the two date inputs in `.date-filter`, give the checkbox label `.risk-filter`, and add task-board-specific CSS Grid rules. Use two columns below `1180px` and one column below `640px`.

- [ ] **Step 4: Run focused test and build**

Run: `npm test -- tests/task-board-ui.spec.ts` and `npm run build`.

Expected: both commands exit with code 0.
