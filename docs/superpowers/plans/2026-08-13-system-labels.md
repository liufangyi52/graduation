# System Label Localization Implementation Plan

**Goal:** Replace raw English project classifications with consistent Chinese semantic tags across all current frontend pages.

**Architecture:** Introduce a pure `src/utils/labels.ts` dictionary that normalizes raw API enums and existing Chinese state values to `{ label, tone }`. Vue templates import the dictionary and render it through existing `tag` styles, preserving API payloads, filters, role checks, and data-model values.

**Tech Stack:** Vue 3, TypeScript, Vitest, CSS.

## Constraints

- Do not change server code, database values, API payload enums, query filters, or authorization conditions.
- Use Chinese labels for visible classification values and existing semantic tag tones.
- Add only a `purple` tag tone for administrator and auditor roles.
- Preserve current form option values and existing routes.
- Unknown values show their original text using a neutral gray tag.

## Task 1: Add And Test The Shared Label Dictionary

Files: create `src/utils/labels.ts`; create `tests/labels.spec.ts`.

- [ ] Write a failing test that imports `projectStatusLabel`, `taskStatusLabel`, `priorityLabel`, `riskLevelLabel`, `riskStatusLabel`, `analysisStatusLabel`, `systemRoleLabel`, and `projectRoleLabel`.
- [ ] Assert project `active`, `paused`, `archived` map to 进行中/blue, 已暂停/amber, 已归档/gray.
- [ ] Assert task states map to 待开始/gray, 进行中/blue, 已完成/green, 已关闭/gray; accept both underscore and hyphen forms for in-progress.
- [ ] Assert priorities map to 低/gray, 中/blue, 高/amber, 紧急/red; risks map to 低风险/green, 中风险/amber, 高风险/red.
- [ ] Assert risk states map English and existing Chinese variants to 待处理/amber, 跟进中/blue, 已处理/green.
- [ ] Assert AI states map to 待审核/amber, 已通过/green, 已驳回/red; system roles map manager/member/admin/auditor to 项目经理/blue, 项目成员/gray, 系统管理员/purple, 审计人员/purple.
- [ ] Assert an unknown value such as `future_state` returns `{ label: 'future_state', tone: 'gray' }`.
- [ ] Run `npm test -- tests/labels.spec.ts` and observe failure because the module does not exist.
- [ ] Implement the exported functions with a common lookup helper and a `TagTone` union of `blue | green | amber | red | gray | purple`.
- [ ] Run `npm test -- tests/labels.spec.ts` and confirm all mapping cases pass.

## Task 2: Convert Main Application Views To Shared Tags

Files: modify `src/App.vue`; modify `src/style.css`; test `tests/project-core-ui.spec.ts` or create `tests/system-label-ui.spec.ts`.

- [ ] Write a failing source-level UI test that expects `App.vue` to import the shared labels module and use `taskStatusLabel`, `priorityLabel`, `riskLevelLabel`, `riskStatusLabel`, `analysisStatusLabel`, and `systemRoleLabel`.
- [ ] Replace local `statusLabel` and `riskLabel` implementations with imports from `src/utils/labels.ts`.
- [ ] In the member task cards, use returned task-status and priority label text plus returned tones instead of inline ternaries.
- [ ] In risk-center rows, use returned risk-level and risk-status labels plus returned tones.
- [ ] In AI review queue rows, replace raw `analysis.status` text with an `analysisStatusLabel` tag.
- [ ] In account administration, show a `systemRoleLabel` tag next to or in place of the display-only role text; retain the existing role selection value and update handler.
- [ ] In project-member management summaries, use `projectRoleLabel` for visible role text.
- [ ] Add `.tag.purple` to the existing tag rules with readable light and dark theme colors.
- [ ] Run the new UI source test and the related existing App tests; confirm green.

## Task 3: Convert Detail, Task Board, And Review Pages

Files: modify `src/components/ProjectDetailPage.vue`; modify `src/components/TaskBoardPage.vue`; modify `src/components/MeetingReviewPage.vue`; extend existing UI source tests.

- [ ] Write failing source-level assertions that each component imports the shared labels module and renders tags for its visible classification columns or headers.
- [ ] In project detail, replace raw project status, task priority/status, meeting analysis status, risk level/status, system role, and project role with their matching shared labels and tones.
- [ ] In task board, keep filter values as raw enums but render table and kanban task priority/status with shared label tags. Use the shared task-state labels for visible column headers.
- [ ] In meeting review detail, replace the raw analysis status text with an `analysisStatusLabel` tag.
- [ ] Use `projectRoleLabel` and `systemRoleLabel` for project member table roles.
- [ ] Run focused component source tests and confirm green.

## Task 4: Full Verification

Files: verify `src/utils/labels.ts`, changed Vue components, `src/style.css`, and label/UI tests.

- [ ] Run `npm test` and confirm all test files pass.
- [ ] Run `npm run build` and confirm Vue type checking and Vite build pass.
- [ ] Inspect dashboard, project detail, task board, risk center, review queue, review detail, and account pages; confirm classifications display Chinese text with the defined semantic colors.
- [ ] Confirm visible values for unknown enums fall back to gray text tags without errors.
- [ ] Run `git diff --check` and inspect the final diff for whitespace errors and changes outside this plan.
