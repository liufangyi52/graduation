# Project Detail Layout Implementation Plan

Goal: Make the project detail page easier to scan on desktop while retaining its data, routes, actions, and narrow-screen usability.

Architecture: Keep service and route code unchanged. Recompose the existing Vue template into summary, navigation, and overview bands. Scope all responsive CSS to the project-detail page classes so unrelated pages retain their current layout.

Tech Stack: Vue 3, TypeScript, CSS Grid, Vitest, Vite.

## Constraints

- Preserve API contracts, permissions, route paths, tab identifiers, and click-handler behavior.
- Preserve tab labels and role-aware controls.
- Use existing application CSS tokens and add no dependencies.
- Desktop summary uses two columns and becomes a single-column flow below 900px.
- Tab buttons remain keyboard-operable and horizontally reachable on small screens.
- Long text must wrap without overlap.

## Task 1: Add A Layout Regression Test

Files: modify `tests/project-detail-ui.spec.ts`.

- [ ] Import the stylesheet with `readFileSync(new URL('../src/style.css', import.meta.url), 'utf8')`.
- [ ] Add a test called `defines a scannable and responsive project detail layout`.
- [ ] Assert the Vue source contains `project-summary-main`, `project-summary-facts`, `project-overview-body`, and `metric-grid project-metrics`.
- [ ] Assert the stylesheet contains `.project-detail-header {`, `.project-summary-main {`, `.project-detail-page .detail-tabs {`, and `@media (max-width: 900px)`.
- [ ] Run `npm test -- tests/project-detail-ui.spec.ts` and observe failure due to absent layout classes and selectors.

## Task 2: Recompose The Detail Template

Files: modify `src/components/ProjectDetailPage.vue` around the header and overview; test `tests/project-detail-ui.spec.ts`.

- [ ] Replace the current project header inner content with a `project-summary-main` grid.
- [ ] Put the eyebrow, project title, owner, member count, status tag, and existing conditional edit action in a `project-identity` region.
- [ ] Put completion percentage, deadline, and pending review count in three `project-summary-facts` cells.
- [ ] Keep `detail.project`, `detail.counts`, `canManage`, `selectTab`, `openTask`, and `openMeeting` bindings and handlers unchanged.
- [ ] Wrap the overview description and its metric grid in `project-overview-body`.
- [ ] Change only that metric grid to `metric-grid project-metrics`; retain the three existing counts and their labels.
- [ ] Run `npm test -- tests/project-detail-ui.spec.ts` and confirm all focused assertions pass.

## Task 3: Add Scoped Layout Styles

Files: modify `src/style.css` near existing detail and responsive rules; test `tests/project-detail-ui.spec.ts`.

- [ ] Make `.project-detail-page` a grid with 16px gaps and `.project-detail-header` a 22px-by-24px padded panel.
- [ ] Use `.project-summary-main` with `grid-template-columns: minmax(0, 1fr) minmax(360px, .9fr)`, 28px gap, and centered alignment.
- [ ] Make long project names wrap in `.project-identity h2` using `overflow-wrap: anywhere`.
- [ ] Render `.project-summary-facts` as three columns with a left separator, muted labels, and wrapping values.
- [ ] Remove incidental tab spacing with `.project-detail-page .detail-tabs { margin: 0; }`.
- [ ] Give `.project-overview-body` controlled inner padding and make `.project-metrics` three equal columns with 104px metric cards.
- [ ] At 900px, make the header one column, change the summary separator from left to top, and enable horizontal tab overflow.
- [ ] At 640px, use single-column facts and metrics, maintain panel padding, and avoid text or control overlap.
- [ ] Run `npm test -- tests/project-detail-ui.spec.ts` and confirm it passes.

## Task 4: Verify The Completed Page

Files: verify `src/components/ProjectDetailPage.vue`, `src/style.css`, and `tests/project-detail-ui.spec.ts`.

- [ ] Run `npm test`; expect exit code 0 and no failing tests.
- [ ] Run `npm run build`; expect TypeScript checking and Vite build to exit 0.
- [ ] Inspect the project-detail route at 1306px: confirm title at left, facts at right, separate tabs, and compact metrics.
- [ ] Inspect at 640px: confirm all facts visible, scrollable tabs, and no text or control overlap.
- [ ] Run `git diff --check` and inspect the scoped final diff for whitespace errors and unintended files.
