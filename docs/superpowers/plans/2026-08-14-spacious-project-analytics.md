# Spacious Project Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the project analytics tab as a spacious Ant Design-style operations dashboard with padded metrics, trend, risk, and Gantt visualizations.

**Architecture:** Keep `buildProjectAnalytics` as the only data source. Extend `ProjectDetailPage.vue` with presentation-only computed chart geometry and semantic chart markup, then use component-specific CSS in `style.css` for spacing, 24px padding, and responsive layout.

**Tech Stack:** Vue 3, TypeScript, CSS, Vitest, Vite.

## Global Constraints

- Every analytics card has a white surface, 8px radius, light neutral border, and exactly 24px internal padding.
- Text, chart marks, legends, and timeline bars remain within the card padding.
- Analytics cards use 16px grid gaps and 24px gaps between vertical bands.
- Reuse real results from `buildProjectAnalytics`; add no API, route, or synthetic history.
- On narrow screens, cards stack and the Gantt chart remains readable through horizontal scrolling.

---

### Task 1: Establish Analytics Layout Contracts

**Files:**
- Modify: `tests/project-analytics-ui.spec.ts`
- Modify: `src/components/ProjectDetailPage.vue`
- Modify: `src/style.css`

**Interfaces:**
- Consumes: `analytics.completionTrend`, `analytics.riskDistribution`, and `analytics.ganttTasks`.
- Produces: `analytics-metric-grid`, `analytics-visual-grid`, `completion-trend-chart`, `risk-donut`, and `analytics-gantt-card` regions.

- [ ] **Step 1: Write the failing UI contract test**

```ts
it('uses spacious visual regions for project analytics', () => {
  const source = readFileSync('src/components/ProjectDetailPage.vue', 'utf8')
  const style = readFileSync('src/style.css', 'utf8')
  for (const token of ['analytics-metric-grid', 'analytics-visual-grid', 'completion-trend-chart', 'risk-donut', 'analytics-gantt-card']) expect(source).toContain(token)
  expect(style).toContain('.analytics-metric-grid .metric-card { padding: 24px; }')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/project-analytics-ui.spec.ts`
Expected: FAIL because the required layout regions and 24px padding rule do not exist.

- [ ] **Step 3: Implement metric and visual-card layout**

```vue
<div class="metric-grid project-metrics analytics-metric-grid">...</div>
<div class="analytics-visual-grid">...</div>
<article class="panel detail-panel analytics-gantt-card">...</article>
```

```css
.analytics-metric-grid .metric-card { padding: 24px; }
.analytics-visual-grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(340px, .75fr); gap: 16px; margin-top: 24px; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/project-analytics-ui.spec.ts`
Expected: PASS with all project analytics UI tests green.

- [ ] **Step 5: Commit**

```bash
git add tests/project-analytics-ui.spec.ts src/components/ProjectDetailPage.vue src/style.css
git commit -m "feat: space project analytics layout"
```

### Task 2: Render Trend And Risk Visuals

**Files:**
- Modify: `tests/project-analytics-ui.spec.ts`
- Modify: `src/components/ProjectDetailPage.vue`
- Modify: `src/style.css`

**Interfaces:**
- Consumes: `analytics.completionTrend` and `analytics.riskDistribution`.
- Produces: `completionTrendPoints`, a date-axis SVG trend, and a CSS conic-gradient risk donut with a count legend.

- [ ] **Step 1: Write the failing chart test**

```ts
expect(source).toContain('const completionTrendPoints = computed(() =>')
expect(source).toContain('<svg viewBox="0 0 100 100" preserveAspectRatio="none"')
expect(source).toContain('class="risk-donut"')
expect(source).toContain('riskDonutStyle')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/project-analytics-ui.spec.ts`
Expected: FAIL because neither an SVG completion trend nor a donut style exists.

- [ ] **Step 3: Implement chart geometry and padded markup**

```ts
const completionTrendPoints = computed(() => analytics.value?.completionTrend.length
  ? analytics.value.completionTrend.map((point, index, points) => `${(index / Math.max(1, points.length - 1)) * 100},${100 - point.count / Math.max(...points.map((entry) => entry.count), 1) * 85}`).join(' ')
  : '')
```

```vue
<div class="completion-trend-chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline :points="completionTrendPoints" /></svg></div>
<div class="risk-donut" :style="riskDonutStyle"></div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/project-analytics-ui.spec.ts`
Expected: PASS with chart contracts present.

- [ ] **Step 5: Commit**

```bash
git add tests/project-analytics-ui.spec.ts src/components/ProjectDetailPage.vue src/style.css
git commit -m "feat: visualize project analytics trends"
```

### Task 3: Improve Gantt Density And Responsive Behavior

**Files:**
- Modify: `tests/project-analytics-ui.spec.ts`
- Modify: `src/components/ProjectDetailPage.vue`
- Modify: `src/style.css`

**Interfaces:**
- Consumes: `analytics.ganttRange`, `analytics.ganttTasks`, and `ganttTodayLeft`.
- Produces: `analytics-gantt-scroll` and `analytics-gantt-header` around the existing real timeline.

- [ ] **Step 1: Write the failing Gantt layout test**

```ts
expect(source).toContain('class="analytics-gantt-scroll"')
expect(source).toContain('class="analytics-gantt-header"')
expect(style).toContain('.analytics-gantt-scroll { overflow-x: auto; }')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/project-analytics-ui.spec.ts`
Expected: FAIL because the Gantt view has no dedicated padded scroll container or header.

- [ ] **Step 3: Implement the stable Gantt structure and responsive CSS**

```vue
<div class="analytics-gantt-scroll"><div class="analytics-gantt-header">...</div><div class="project-gantt">...</div></div>
```

```css
.analytics-gantt-scroll { overflow-x: auto; }
.analytics-gantt-header, .analytics-gantt-card .gantt-row { min-width: 820px; }
@media (max-width: 900px) { .analytics-visual-grid { grid-template-columns: 1fr; } }
```

- [ ] **Step 4: Run full verification**

Run: `npm test && npm run build`
Expected: all tests pass and Vite creates a production build without TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add tests/project-analytics-ui.spec.ts src/components/ProjectDetailPage.vue src/style.css
git commit -m "feat: refine project analytics gantt"
```
