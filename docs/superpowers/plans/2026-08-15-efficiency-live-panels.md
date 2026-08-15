# Efficiency Live Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate the project-manager efficiency trend and member leaderboard from live task data and calculate the real average delivery cycle.

**Architecture:** Extend the existing pure project analytics module with member-efficiency and delivery-cycle aggregators. `App.vue` maps reactive workspace tasks into those helpers and reuses the existing completion trend; the current manager WebSocket refresh remains the only realtime transport. CSS adds stable, responsive geometry to the existing efficiency panels without introducing nested cards.

**Tech Stack:** Vue 3, TypeScript, Vitest, CSS Grid/Flexbox, Socket.IO-backed reactive workspace data.

## Global Constraints

- Reuse the existing manager project-room subscription and canonical workspace reload.
- Add no backend API, database, or Socket.IO protocol changes.
- Count only valid persisted task data and retain explicit empty states.
- Preserve existing visual tokens and unrelated uncommitted work.
- Use tests first for each behavior change.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/utils/projectAnalytics.ts` | Pure member-efficiency and average-cycle calculations. |
| `tests/project-analytics.spec.ts` | Behavioral coverage for analytics calculations and edge cases. |
| `src/App.vue` | Reactive computed state and populated efficiency-page markup. |
| `src/style.css` | Stable efficiency panel, trend, and member-row geometry. |
| `tests/project-analytics-ui.spec.ts` | Source-level UI and responsive layout regression coverage. |

### Task 1: Member Efficiency Analytics

**Files:**
- Modify: `src/utils/projectAnalytics.ts`
- Modify: `tests/project-analytics.spec.ts`

**Interfaces:**
- Produces: `buildMemberDeliveryEfficiency(tasks): MemberDeliveryEfficiency[]`.
- Each row contains `owner`, `totalTasks`, `completedTasks`, `averageProgress`, and `completionRate`.

- [ ] **Step 1: Write a failing unit test**

Add a test with two owners, a completed task whose stored progress is stale, and a blank owner. Assert grouping, 0-100 progress normalization, deterministic sorting, and blank-owner exclusion.

- [ ] **Step 2: Run the test and verify RED**

Run `npx vitest run tests/project-analytics.spec.ts`.

Expected: FAIL because `buildMemberDeliveryEfficiency` is not exported.

- [ ] **Step 3: Implement the minimal pure aggregator**

Add `MemberDeliveryEfficiency` and a small input interface to `projectAnalytics.ts`. Group by trimmed owner, treat completed tasks as 100 progress, clamp other numeric progress values, compute rounded averages/rates, and sort by completed count, average progress, then owner.

- [ ] **Step 4: Run the test and verify GREEN**

Run `npx vitest run tests/project-analytics.spec.ts`.

Expected: PASS with the new grouping test and all existing analytics tests green.

### Task 2: Average Delivery Cycle

**Files:**
- Modify: `src/utils/projectAnalytics.ts`
- Modify: `tests/project-analytics.spec.ts`

**Interfaces:**
- Produces: `averageDeliveryCycleDays(tasks): number | null`.

- [ ] **Step 1: Write a failing unit test**

Add completed tasks with one-day and two-day valid intervals plus incomplete, invalid, and negative intervals. Assert the result is `1.5`, and assert `null` when no valid interval exists.

- [ ] **Step 2: Run the test and verify RED**

Run `npx vitest run tests/project-analytics.spec.ts`.

Expected: FAIL because `averageDeliveryCycleDays` is not exported.

- [ ] **Step 3: Implement the minimal cycle calculation**

Filter to completed tasks with parseable timestamps and non-negative elapsed time, average milliseconds, convert to days, and round to one decimal. Return `null` for no valid intervals.

- [ ] **Step 4: Run the test and verify GREEN**

Run `npx vitest run tests/project-analytics.spec.ts`.

Expected: PASS with cycle edge cases covered.

### Task 3: Populate the Efficiency Page

**Files:**
- Modify: `src/App.vue`
- Modify: `tests/project-analytics-ui.spec.ts`

**Interfaces:**
- Consumes: `dashboardCompletionTrend`, `dashboardTrendMaximum`, `buildMemberDeliveryEfficiency`, `averageDeliveryCycleDays`, and reactive `data.tasks`.
- Produces: `memberDeliveryEfficiency`, `averageDeliveryCycle`, and live efficiency-page markup.

- [ ] **Step 1: Write a failing UI regression test**

Assert `App.vue` imports both helpers, declares both computed values, reuses `dashboardCompletionTrend`, renders `v-for="member in memberDeliveryEfficiency"`, and no longer contains the three former placeholder messages.

- [ ] **Step 2: Run the UI test and verify RED**

Run `npx vitest run tests/project-analytics-ui.spec.ts`.

Expected: FAIL because the efficiency route remains static.

- [ ] **Step 3: Add computed values and markup**

Map workspace task fields into the analytics helpers. Render the average cycle as `N.N天` or `—`, reuse the date/count trend rows, and render ranked member rows with counts, average-progress track, and completion rate. Keep explicit empty states.

- [ ] **Step 4: Run the UI test and verify GREEN**

Run `npx vitest run tests/project-analytics-ui.spec.ts`.

Expected: PASS with no static placeholders remaining.

### Task 4: Stabilize Efficiency Layout

**Files:**
- Modify: `src/style.css`
- Modify: `tests/project-analytics-ui.spec.ts`

**Interfaces:**
- Consumes: `efficiency-trend`, `efficiency-member-list`, and `efficiency-member-row` markup.
- Produces: equal-height desktop panels, stable row tracks, and existing single-column behavior below 1180px.

- [ ] **Step 1: Write a failing style regression test**

Assert the efficiency panels have a shared minimum height, the trend body can scroll without growing the page, and member rows use `grid-template-columns: 24px 32px minmax(0, 1fr) auto`.

- [ ] **Step 2: Run the UI test and verify RED**

Run `npx vitest run tests/project-analytics-ui.spec.ts`.

Expected: FAIL because efficiency-specific geometry is absent.

- [ ] **Step 3: Add minimal scoped CSS**

Add efficiency-only panel flex sizing, scroll regions, fixed trend tracks, member progress tracks, and responsive text handling. Retain `.analysis-grid` and its current 1180px collapse.

- [ ] **Step 4: Run the UI test and verify GREEN**

Run `npx vitest run tests/project-analytics-ui.spec.ts`.

Expected: PASS with the new layout assertions.

### Task 5: Complete Verification

**Files:**
- Verify only: analytics, App, style, and their focused tests.

**Interfaces:**
- Produces: evidence that the empty panels are populated from reactive task data and production TypeScript/CSS builds successfully.

- [ ] **Step 1: Run focused tests**

Run `npx vitest run tests/project-analytics.spec.ts tests/project-analytics-ui.spec.ts tests/dashboard-realtime-service.spec.ts tests/project-progress-events.spec.ts tests/workspace-service.spec.ts`.

Expected: all focused tests pass.

- [ ] **Step 2: Build production assets**

Run `npm run build`.

Expected: exit code 0 from type checking and Vite build.

- [ ] **Step 3: Inspect the scoped diff**

Run `git diff -- docs/superpowers/specs/2026-08-15-efficiency-live-panels-design.md docs/superpowers/plans/2026-08-15-efficiency-live-panels.md src/utils/projectAnalytics.ts tests/project-analytics.spec.ts src/App.vue src/style.css tests/project-analytics-ui.spec.ts`.

Expected: only the approved efficiency analytics, layout, tests, and documentation are present alongside preserved pre-existing edits.
