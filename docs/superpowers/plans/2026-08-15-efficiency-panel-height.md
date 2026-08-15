# Efficiency Panel Height Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the efficiency trend and member leaderboard panels to a 550px desktop cap so they absorb the unused area below them.

**Architecture:** Keep the existing panel minimum, internal scroll containers, and responsive grid. Change only the scoped desktop height cap and protect it with the current source-level style regression test.

**Tech Stack:** CSS, Vitest.

## Global Constraints

- Set the efficiency panel cap to exactly `550px`.
- Preserve `min-height: 360px`, internal vertical scrolling, and the existing 1180px one-column layout.
- Do not change task analytics, realtime subscriptions, or unrelated page styles.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `tests/project-analytics-ui.spec.ts` | Locks the approved panel-height cap. |
| `src/style.css` | Applies the scoped 550px panel-height cap. |

### Task 1: Increase the Efficiency Panel Cap

**Files:**
- Modify: `tests/project-analytics-ui.spec.ts`
- Modify: `src/style.css`

**Interfaces:**
- Consumes: `.efficiency-page .efficiency-panel` and the existing `.efficiency-panel` minimum height.
- Produces: `height: min(550px, 60vh)` for the desktop efficiency panels.

- [ ] **Step 1: Write the failing style regression test**

Add this expectation to `keeps efficiency panels and leaderboard rows geometrically stable`:

```ts
expect(style).toContain('.efficiency-page .efficiency-panel { height: min(550px, 60vh); }')
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run tests/project-analytics-ui.spec.ts`

Expected: FAIL because the stylesheet still contains the 460px / 52vh cap.

- [ ] **Step 3: Apply the minimal CSS change**

Replace the scoped rule with:

```css
.efficiency-page .efficiency-panel { height: min(550px, 60vh); }
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npx vitest run tests/project-analytics-ui.spec.ts`

Expected: PASS with the 550px cap, 360px minimum, scroll container, and grid-row assertions.

### Task 2: Verify the Production Build

**Files:**
- Verify only: `src/style.css` and `tests/project-analytics-ui.spec.ts`.

**Interfaces:**
- Produces: type-checked and bundled client assets containing the revised layout.

- [ ] **Step 1: Run the production build**

Run: `npm run build`

Expected: exit code 0 from Vue type checking and Vite bundling.

- [ ] **Step 2: Inspect the scoped diff**

Run: `git diff -- src/style.css tests/project-analytics-ui.spec.ts`.

Expected: the only new task-specific lines set the 550px cap and its regression assertion.
