# Meeting File Input Spacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vertically center the meeting-file selector inside a full-width 44px input.

**Architecture:** Target the existing meeting-file input by type within `.meeting-field`, retaining its inherited full width while applying explicit dimensions and selector-button sizing. The browser-native file selection behavior is unchanged.

**Tech Stack:** Vue 3 template, CSS, Vitest.

## Global Constraints

- Keep the upload control full width.
- Use exactly 44px input height, 5px vertical padding, and a 28px file-selector button.
- Do not change accepted file types or `selectMeetingFile` behavior.

---

### Task 1: Space the Native File Selector

**Files:**
- Modify: `tests/meeting-layout.spec.ts`
- Modify: `src/App.vue`
- Modify: `src/style.css`

**Interfaces:**
- Consumes: the meeting upload input and its `selectMeetingFile` change handler.
- Produces: a type-scoped rule and centered native file-selection button.

- [ ] **Step 1: Write the failing test**

Assert the `.meeting-field > input[type='file']` rule contains `height: 44px` and `padding: 5px 10px`, and assert its selector-button rule contains `height: 28px` and `margin: 0 8px 0 0`.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/meeting-layout.spec.ts`.

Expected: FAIL because the upload input has no type-scoped vertical spacing rule.

- [ ] **Step 3: Implement the minimum markup and CSS**

Add a `.meeting-field > input[type='file']` rule with 44px height and 5px vertical padding. Add its native selector-button rule with 28px height and `margin: 0 8px 0 0`.

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run tests/meeting-layout.spec.ts`.

Expected: PASS with the full-width vertically centered selector contract.

### Task 2: Verify the Client Build

**Files:**
- Verify only: `src/App.vue`, `src/style.css`, `tests/meeting-layout.spec.ts`.

- [ ] **Step 1: Build**

Run: `npm run build`.

Expected: Vue type checking and Vite bundling succeed.
