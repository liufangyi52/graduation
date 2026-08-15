# Remove Burndown Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use inline execution for this single scoped UI removal. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the task burndown chart from project analytics while preserving all remaining analytics panels.

**Architecture:** The analytics tab composition owns the chart card. Remove only that template node and the now-unused point formatter; retain `buildProjectAnalytics` output because it may be consumed by other views and has its own tested contract.

**Tech Stack:** Vue 3, TypeScript, Vitest, Vite.

## Global Constraints

- Do not change task trend, risk distribution, or Gantt behavior.
- Do not alter shared analytics calculation output.

---

### Task 1: Remove the Analytics Burndown UI

**Files:**
- Modify: `tests/project-analytics-ui.spec.ts`
- Modify: `src/components/ProjectDetailPage.vue`

**Interfaces:**
- Consumes: analytics tab template in `ProjectDetailPage.vue`.
- Produces: analytics UI without `analytics-burndown-card` or `burndown-chart` markup.

- [ ] **Step 1: Write the failing test**

```ts
it('omits the removed task burndown chart from project analytics', () => {
  const source = readFileSync('src/components/ProjectDetailPage.vue', 'utf8')
  expect(source).not.toContain('analytics-burndown-card')
  expect(source).not.toContain('burndown-chart')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/project-analytics-ui.spec.ts`
Expected: FAIL because the current analytics template still includes the burndown card.

- [ ] **Step 3: Write minimal implementation**

```ts
// Remove the `chartPoints` helper and the analytics `<article>` with
// `analytics-burndown-card`. Leave buildProjectAnalytics unchanged.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/project-analytics-ui.spec.ts`
Expected: PASS.

- [ ] **Step 5: Run full verification**

Run: `npm test` and `npm run build`
Expected: both commands exit with code 0.
