# Experiment Center Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the experiment center a compact, full-width workflow whose project selection, RAG status, metrics, and table remain orderly at desktop and narrow widths.

**Architecture:** Keep the experiment view's data bindings and API calls unchanged. Add semantic, experiment-scoped wrappers in `App.vue`, then provide only scoped CSS in `style.css` so the page does not inherit the dashboard's five-column metric behavior.

**Tech Stack:** Vue 3, TypeScript, CSS, Vitest.

## Global Constraints

- Do not change the experiment API, RAG synchronization behavior, data labels, permissions, or table columns.
- Keep the RAG status message and synchronization control visible in one dedicated row.
- Use responsive CSS that stacks the header and metric grid at narrow widths.
- Preserve the existing horizontal scrolling behavior of the results table.

---

### Task 1: Scope the Experiment Center Structure and Layout

**Files:**
- Modify: `src/App.vue:774`
- Modify: `src/style.css:51-73`
- Modify: `tests/experiment-summary-ui.spec.ts`

**Interfaces:**
- Consumes: Existing `experimentProjectId`, `syncRagIndex`, `ragIndexSyncing`, `ragIndexReady`, `ragIndexStatus`, `experimentRows`, and `experimentNotice` bindings.
- Produces: `experiment-panel`, `experiment-project-field`, `experiment-status-row`, `experiment-metric-grid`, and `experiment-body` class hooks for CSS-only presentation.

- [ ] **Step 1: Write the failing layout regression test**

```ts
it('uses a scoped full-width layout for experiment controls and metrics', () => {
  expect(appSource).toContain('class="panel experiment-panel"')
  expect(appSource).toContain('class="meeting-field experiment-project-field"')
  expect(appSource).toContain('class="experiment-status-row"')
  expect(appSource).toContain('class="metric-grid experiment-metric-grid"')
  expect(styleSource).toContain('.experiment-panel .panel-heading {')
  expect(styleSource).toContain('.experiment-metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }')
  expect(styleSource).toContain('@media (max-width: 720px)')
})
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npx vitest run tests/experiment-summary-ui.spec.ts`

Expected: FAIL because the scoped classes and styles do not exist.

- [ ] **Step 3: Add the scoped view structure and CSS**

```vue
<article class="panel experiment-panel">
  <div class="panel-heading">
    <!-- existing title block -->
    <label class="meeting-field experiment-project-field">
      <!-- existing select -->
    </label>
  </div>
  <div class="experiment-body">
    <div v-if="experimentProjectId" class="experiment-status-row">
      <!-- existing RAG command and state message -->
    </div>
    <div v-if="experimentProjectId" class="metric-grid experiment-metric-grid">
      <!-- existing metric cards -->
    </div>
  </div>
  <!-- existing notice and table -->
</article>
```

```css
.experiment-panel .panel-heading { display: grid; grid-template-columns: minmax(200px, 0.65fr) minmax(320px, 1.35fr); gap: 24px; align-items: end; }
.experiment-project-field { width: 100%; }
.experiment-project-field select { width: 100%; }
.experiment-body { padding: 0 20px; }
.experiment-status-row { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; min-height: 64px; border-bottom: 1px solid var(--line); }
.experiment-metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 18px 0 20px; }
@media (max-width: 720px) { .experiment-panel .panel-heading { grid-template-columns: 1fr; align-items: stretch; } .experiment-metric-grid { grid-template-columns: 1fr; } }
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npx vitest run tests/experiment-summary-ui.spec.ts`

Expected: PASS.

- [ ] **Step 5: Run production verification**

Run: `npm run build`

Expected: production build completes successfully; an existing bundle-size warning may remain.

- [ ] **Step 6: Commit**

```bash
git add src/App.vue src/style.css tests/experiment-summary-ui.spec.ts docs/superpowers/specs/2026-08-15-experiment-center-layout-design.md docs/superpowers/plans/2026-08-15-experiment-center-layout.md
git commit -m "style: improve experiment center layout"
```
