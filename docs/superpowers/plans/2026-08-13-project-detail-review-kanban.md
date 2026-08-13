# Project Detail, Review Detail, And Task Kanban Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the three approved P0 workflows: project detail pages, auditable AI review details with rejection reasons, and a filterable table/kanban task view.

**Architecture:** Keep `App.vue` as the authenticated shell and move the three workflows into focused Vue page components. Add narrowly scoped service/controller methods for project aggregation and review drafts; preserve the existing authorization and transaction rules. Use URL route params/query as the source of page context and refresh authoritative server data after mutations.

**Tech Stack:** Vue 3, TypeScript, Vue Router, NestJS, MySQL, Vitest, Vite.

## Global Constraints

- Managers may mutate only projects they own; members may update only assigned tasks; admins and auditors remain business-read-only.
- Original AI analysis JSON remains immutable; review edits are stored as draft data and only approved drafts create formal tasks.
- Audit details contain ids, changed field names, and counts only; never store minutes, candidate descriptions, notes, or rejection reasons.
- Rejection reasons are 1–500 characters and are required for single and batch rejection.
- All destructive or high-impact UI actions require confirmation and refresh server state on success.
- This plan excludes RAG, agent orchestration, experiments, exports, pagination, sorting, and Gantt charts.

---

## File Map

- Create `src/components/ProjectDetailPage.vue`: project aggregate tabs and scoped actions.
- Create `src/components/MeetingReviewPage.vue`: review detail, evidence, draft editing, approval/rejection.
- Create `src/components/TaskBoardPage.vue`: task filters, URL query sync, table/kanban views.
- Modify `src/App.vue`: retain shell/navigation, mount the new page components, pass auth/service context, and route project/meeting links.
- Modify `src/router.ts`: add `/projects/:id`, `/projects/:id/meetings`, `/meetings/:id/review`.
- Modify `src/services/workspaceService.ts`: project detail and task query/filter support.
- Modify `src/services/meetingService.ts`: review detail, draft save, single/batch review reason payloads.
- Modify `src/server/dtos.ts`: project detail/review draft DTO validation.
- Modify `src/server/app.controller.ts`: detail and draft endpoints.
- Modify `src/server/app.service.ts`: aggregate reads, draft persistence, draft-aware approval.
- Modify `src/server/migrate.ts`: additive review draft schema.
- Create/modify tests for service, authorization, routes, UI contracts, and smoke coverage.

## Task 1: Add failing service and authorization tests

**Files:**
- Modify `tests/project-lifecycle.spec.ts`
- Modify `tests/meeting-workflow.spec.ts`
- Create `tests/project-detail.spec.ts`
- Create `tests/review-draft.spec.ts`

- [ ] Add a failing project-detail isolation test asserting a manager receives only the owned active project aggregate and a member receives only a joined project aggregate.
- [ ] Add a failing draft test asserting a draft can be saved without changing `result_json`, and a non-manager save is rejected.
- [ ] Add a failing approval test asserting approved analysis uses draft task title/assignee/priority instead of original AI values.
- [ ] Add a failing rejection test asserting missing/blank/over-500-character reason is rejected for both single and batch paths.
- [ ] Run `npx vitest run tests/project-detail.spec.ts tests/review-draft.spec.ts tests/meeting-workflow.spec.ts`; verify failures are missing interfaces/behavior.

## Task 2: Add review draft schema and DTOs

**Files:**
- Modify `src/server/migrate.ts`
- Modify `src/server/dtos.ts`

- [ ] Add an additive `ai_analysis_drafts` table keyed by `analysis_id`, with JSON `draft_json`, `updated_by`, timestamps, and a foreign key to `ai_analyses`.
- [ ] Add `ReviewDraftTaskDto`, `ReviewDraftDto`, and `ProjectDetailQueryDto` with explicit limits: title 180, description 4000, task count 1–50, reason 1–500.
- [ ] Run `npm run build` and the focused tests; expect schema methods still failing until Task 3.

## Task 3: Implement project detail aggregation

**Files:**
- Modify `src/server/app.service.ts`
- Modify `src/server/app.controller.ts`
- Modify `src/services/workspaceService.ts`

- [ ] Implement `projectDetail(user, projectId)` with active-project filtering, role-aware access, project metadata, tasks, meetings, risks, members, counts, and permission flags.
- [ ] Add `GET /projects/:id/detail` controller binding.
- [ ] Add `getProjectDetail(projectId)` client method and typed aggregate interfaces.
- [ ] Run `npx vitest run tests/project-detail.spec.ts tests/project-members.spec.ts tests/role-separation.spec.ts`; verify green.

## Task 4: Implement review detail and draft persistence

**Files:**
- Modify `src/server/app.service.ts`
- Modify `src/server/app.controller.ts`
- Modify `src/services/meetingService.ts`

- [ ] Implement `reviewDetail(user, meetingId)` returning only the authorized meeting’s current desensitized version, analysis, draft, and safe evidence offsets/snippets.
- [ ] Implement `saveReviewDraft(user, analysisId, draft)` with manager ownership, candidate field validation, and id/count-only audit details.
- [ ] Add `GET /meetings/:id/review` and `PUT /analyses/:id/draft` endpoints.
- [ ] Make `reviewAnalysis` load the draft if present, require a rejection reason when `approved === false`, and generate tasks from draft candidates inside the existing transaction.
- [ ] Update client methods `getReviewDetail`, `saveReviewDraft`, `review`, and `reviewBatch` to carry reason/draft data.
- [ ] Run `npx vitest run tests/review-draft.spec.ts tests/meeting-workflow.spec.ts tests/authorization-boundary.spec.ts`; verify green.

## Task 5: Add page routes and project detail component

**Files:**
- Modify `src/router.ts`
- Create `src/components/ProjectDetailPage.vue`
- Modify `src/App.vue`
- Create `tests/project-detail-ui.spec.ts`

- [ ] Add named routes `/projects/:id`, `/projects/:id/meetings`, and `/meetings/:id/review`.
- [ ] Build `ProjectDetailPage.vue` with five tabs: overview, tasks, meetings, risks, members; render permission-aware manager controls and safe empty/error states.
- [ ] Link project cards and meeting rows to the detail/review routes while preserving role guards.
- [ ] Add static UI tests for tab labels, route navigation, member-only visibility, and manager-only mutation controls.
- [ ] Run `npx vitest run tests/project-detail-ui.spec.ts tests/project-core-ui.spec.ts tests/meeting-layout.spec.ts`.

## Task 6: Add review detail component and rejection workflow

**Files:**
- Create `src/components/MeetingReviewPage.vue`
- Modify `src/App.vue`
- Create `tests/review-detail-ui.spec.ts`

- [ ] Build the two-column review page with desensitized text, evidence snippets, summary, decisions, editable candidate-task rows, and draft save state.
- [ ] Add single approve/reject controls; rejection opens a bounded reason dialog and blocks submit unless the reason is 1–500 characters.
- [ ] Add batch selection, selected count, confirmation dialog, and shared reason validation for batch rejection.
- [ ] Show reanalysis only for rejected analyses and keep members/admins/auditors read-only.
- [ ] Add UI contract tests for evidence, draft fields, reason validation, selected count, and confirmation.
- [ ] Run `npx vitest run tests/review-detail-ui.spec.ts tests/review-draft.spec.ts tests/meeting-workflow.spec.ts`.

## Task 7: Add task board and URL-synchronized filters

**Files:**
- Create `src/components/TaskBoardPage.vue`
- Modify `src/App.vue`
- Create `tests/task-board-ui.spec.ts`

- [ ] Implement filters for project, assignee, status, priority, unresolved-risk flag, due-from, and due-to; initialize and update them from `route.query`.
- [ ] Render one filtered collection in table and four kanban columns (`todo`, `in-progress`, `completed`, `closed`).
- [ ] Keep status changes on existing permission-controlled API methods; do not implement drag-and-drop state mutation.
- [ ] Link project-detail task entries to `/tasks?project=<id>` and preserve filter context.
- [ ] Add tests for filtering, query synchronization, four columns, and manager/member control visibility.
- [ ] Run `npx vitest run tests/task-board-ui.spec.ts tests/project-progress.spec.ts tests/workspace-service.spec.ts`.

## Task 8: Extend smoke coverage and documentation

**Files:**
- Modify `scripts/smoke-project-core-closure.ts`
- Modify `README.md`

- [ ] Extend the smoke script to create an analysis draft, verify original `result_json` remains unchanged, reject with a reason, reanalyze, save an edited draft, approve it, and verify the generated task uses edited fields.
- [ ] Add README routes and role notes for project detail, review detail, and task board/filters.
- [ ] Run `npm test`, `npm run build`, `npm run smoke:project-core-closure`, and `Invoke-WebRequest http://127.0.0.1:3000/api/health` against the running server.

## Task 9: Final verification

- [ ] Run `git diff --check` and inspect all changed files for accidental secrets or sensitive audit payloads.
- [ ] Run the full verification commands again and report exact test/build/smoke results.
- [ ] Commit implementation with `feat: complete project detail review and task board workflows`.

