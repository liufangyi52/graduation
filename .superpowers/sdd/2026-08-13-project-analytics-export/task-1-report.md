# Task 1 Report: Shared Project Analytics Calculation

## Outcome

Implemented `buildProjectAnalytics(input, today)` as a typed, side-effect-free helper for later analytics UI and export consumers.

## Files Changed

- `src/utils/projectAnalytics.ts`
  - Defines the analytics input/output interfaces.
  - Calculates total, completed, overdue, and open-risk counts plus rounded completion rate.
  - Groups completed tasks by `completedAt`, excluding completed records without that date.
  - Produces non-zero open-risk distributions in low/medium/high order.
  - Separates due-dated Gantt records from undated task records and uses `createdAt` as the Gantt start.
- `tests/project-analytics.spec.ts`
  - Covers task and risk calculations, completed date grouping, all risk levels, overdue exclusions, Gantt/undated partitioning, and zero-task behavior.

## TDD Evidence

### Red

Command:

```powershell
npm test -- tests/project-analytics.spec.ts
```

Outcome: failed as expected before implementation. Vitest could not load `../src/utils/projectAnalytics` because the helper module did not exist.

### Green

Command:

```powershell
npm test -- tests/project-analytics.spec.ts
```

Outcome: passed, 1 test file and 2 tests.

### Full Verification

Command:

```powershell
npm test
```

Outcome: passed, 36 test files and 104 tests.

## Self-Review

- Overdue comparison uses calendar-date prefixes and excludes `completed` and `closed` statuses.
- Completion rate handles the zero-task case without division by zero and rounds otherwise.
- Completion trends contain only tasks explicitly marked completed with a completion date.
- Risk distribution contains only open risks and omits zero-count levels.
- The module depends on neither framework code nor database code, so both server export and Vue UI can consume it.

## Commit

`6a79cf9 feat: add project analytics helper`

## Review Fix

Follow-up review identified that `today` could include an ISO timestamp while task due dates were normalized to calendar dates, causing tasks due today to be counted as overdue. The helper now normalizes `today` before comparison. Added a regression test for `dueDate: '2026-08-13'` and `today: '2026-08-13T00:00:00Z'`.

Verification after the fix:

- `npm test -- tests/project-analytics.spec.ts`: 3 tests passed.
- `npm test`: 36 test files and 105 tests passed.
