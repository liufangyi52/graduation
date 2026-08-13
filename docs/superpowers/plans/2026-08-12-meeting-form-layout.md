# Meeting Form Layout Implementation Plan

**Goal:** Make the meeting-minutes submission form use the available content width without altering modal form controls.

**Architecture:** Scope a `meeting-form` class to the meetings page in `src/App.vue`. Add full-width field controls and spacing in `src/style.css`; keep `.modal-field` reserved for dialogs.

**Tech Stack:** Vue 3, CSS, Vitest.

### Task 1: Scope and verify the full-width meeting form

**Files:**
- Modify: `src/App.vue`
- Modify: `src/style.css`
- Create: `tests/meeting-layout.spec.ts`

- [ ] Add a static regression test for the meeting form's scoped class and its full-width controls.
- [ ] Run the test and verify it fails before the scoped implementation exists.
- [ ] Add the scoped template classes and layout rules for title, minutes, and project fields.
- [ ] Run the focused test, full suite, and production build.
