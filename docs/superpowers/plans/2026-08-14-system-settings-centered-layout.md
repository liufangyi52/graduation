# System Settings Centered Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Center the system settings panel inside the application content area while preserving its readable maximum width and narrow-screen behavior.

**Architecture:** The settings page already has one `.settings-layout` wrapper containing one settings panel. A focused source-level UI regression test will describe the desired centering rule, and the existing CSS rule will then be minimally updated to satisfy it. No Vue component, API, data, or route changes are required.

**Tech Stack:** Vue 3, CSS, Vitest

## Global Constraints

- Change only the system settings layout; do not alter settings controls, data, actions, or other pages.
- On desktop, center within the application content region, not the browser viewport including the sidebar.
- Preserve the existing `654px` maximum readable width.
- At constrained widths, use the available parent width without horizontal overflow.

---

### Task 1: Center the Settings Layout

**Files:**
- Modify: `tests/admin-settings.spec.ts`
- Modify: `src/style.css`

**Interfaces:**
- Consumes: the existing `.settings-layout` wrapper rendered by the `settings` branch in `src/App.vue`.
- Produces: a centered settings wrapper whose only child remains constrained to a `654px` maximum width.

- [ ] **Step 1: Write the failing test**

Add this test to `tests/admin-settings.spec.ts` after the existing UI source assertions:

```ts
it('centers the system settings panel in the page content area', () => {
  const styleSource = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8')

  expect(styleSource).toMatch(/\.settings-layout\s*\{[^}]*width:\s*min\(654px,\s*100%\)[^}]*margin:\s*0\s+auto[^}]*\}/s)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/admin-settings.spec.ts`

Expected: FAIL because `.settings-layout` does not yet have `width: min(654px, 100%)` and `margin: 0 auto` in the same CSS rule.

- [ ] **Step 3: Write minimal implementation**

Replace the final `.settings-layout` rule in `src/style.css` with:

```css
.settings-layout { width: min(654px, 100%); margin: 0 auto; }
```

This replaces the old `display: block; max-width: 654px;` rule while retaining its visual width cap and adding automatic horizontal margins.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/admin-settings.spec.ts`

Expected: PASS with the settings access, notification action, and centering assertions all green.

- [ ] **Step 5: Run production verification**

Run: `npm run build`

Expected: Vue type checking and Vite production bundling complete successfully.

- [ ] **Step 6: Commit**

```bash
git add tests/admin-settings.spec.ts src/style.css
git commit -m "fix: center system settings panel"
```
