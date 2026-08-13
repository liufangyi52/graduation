# Team Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each authorized user's dated task deadlines and persisted meeting creation dates in an interactive team calendar.

**Architecture:** Add one `GET /api/calendar-events` endpoint in Nest. It composes task and meeting records into a shared event shape and applies existing project visibility rules. The Vue workspace service fetches and maps this endpoint; `App.vue` groups events by a navigable selected date and routes clicks to the task detail or meeting page.

**Tech Stack:** Vue 3 Composition API, Vue Router, NestJS 11, MySQL 8, Vitest.

## Global Constraints

- Reuse the authenticated `/api` request pattern.
- A task appears only when `due_date` is not null.
- A meeting appears on the local date derived from its persisted `created_at` value.
- Managers see projects they own; members see projects they belong to; admins and auditors see all records.
- Do not add a database table or migration for derived calendar events.

---

### Task 1: Add the authorized calendar-event API

**Files:**
- Modify: `src/server/app.controller.ts`
- Modify: `src/server/app.service.ts`
- Test: `tests/calendar-events.spec.ts`

**Interfaces:** Produces `AppService.calendarEvents(user)` and `GET /api/calendar-events`. Each event has `id`, `type: 'task' | 'meeting'`, `title`, `project_id`, `project_name`, `date`, plus optional task owner, priority, and status.

- [ ] Write a failing service test that verifies a manager query returns only project-owned task and meeting events.
- [ ] Run `npm test -- tests/calendar-events.spec.ts`; expect a missing `calendarEvents` failure.
- [ ] Add controller endpoint and service method. Use a `UNION ALL` query: dated tasks join projects/users; meetings join projects and emit `DATE(m.created_at)`. Apply equivalent owner/member filtering in both query arms.
- [ ] Run the focused test; expect pass.
- [ ] Commit: `feat: expose authorized calendar events`.

### Task 2: Load and normalize calendar events

**Files:**
- Modify: `src/services/workspaceService.ts`
- Test: `tests/workspace-service.spec.ts`

**Interfaces:** Produces `CalendarEvent`, `state.calendarEvents: CalendarEvent[]`, and `loadCalendarEvents(): Promise<void>`. Event shape: `{ id, type, title, project, date, owner?, priority?, state? }`.

- [ ] Write a failing test which mocks `/calendar-events` with one task and one meeting and asserts both mapped entries.
- [ ] Run `npm test -- tests/workspace-service.spec.ts`; expect a missing loader/state failure.
- [ ] Add empty reactive state, mapping function, and `loadCalendarEvents`; reuse existing priority and task-status maps.
- [ ] Run focused test; expect pass.
- [ ] Commit: `feat: load calendar events in workspace`.

### Task 3: Render the interactive team calendar

**Files:**
- Create: `src/utils/calendar.ts`
- Modify: `src/App.vue`
- Modify: `src/style.css`
- Test: `tests/calendar-view.spec.ts`

**Interfaces:** `eventsForDate(events, date)` returns only events for a local ISO date. `App.vue` uses it with `data.calendarEvents`.

- [ ] Write a failing test asserting `eventsForDate` returns only events matching `2026-08-12`.
- [ ] Run `npm test -- tests/calendar-view.spec.ts`; expect missing-module/function failure.
- [ ] Add the pure helper. In `App.vue`, initialize selected date to local today, load events on mount, and refresh them after task updates or meeting submission. Replace disabled controls with previous-date, next-date, and today controls. Render task cards with project/owner/priority/status and meeting cards with project/title. Task cards open task details; meeting cards route to `/meetings`. Preserve an empty state only for a selected day without events.
- [ ] Add responsive, non-overlapping calendar styles matching current panels and tags.
- [ ] Run focused tests and `npm run build`; expect pass/exit 0.
- [ ] Commit: `feat: render interactive team calendar`.

### Task 4: Regression verification

**Files:** No source changes expected.

- [ ] Run `npm test`; expect all tests passing.
- [ ] Run `npm run build`; expect exit 0.
- [ ] In the running application, verify a dated task appears on its due date and a submitted meeting on its creation date. Verify previous, next, and today controls; verify task and meeting click behavior.

