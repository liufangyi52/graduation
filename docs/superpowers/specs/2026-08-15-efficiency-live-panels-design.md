# Efficiency Live Panels Design

## Goal

Replace the two empty project-manager efficiency panels with real task-derived views, calculate the average delivery cycle from persisted timestamps, and keep all three values synchronized immediately after a member completes a task.

## Context and Root Cause

The efficiency page already receives the same reactive workspace task collection as the manager dashboard, but its "team completion trend" and "member delivery efficiency" panels are hard-coded empty placeholders. The average delivery-cycle card is also hard-coded to an em dash. This is a presentation-layer gap rather than a missing API: task records already expose owner, state, progress, createdAt, and completedAt.

The manager shell already subscribes to authorized project Socket.IO rooms. A `project.progress.updated` event reloads canonical workspace data, so any computed view derived from `data.tasks` can update without another socket protocol or backend endpoint.

## Selected Approach

Keep the change frontend-only and derive every view from the refreshed workspace task collection.

1. Reuse `dashboardCompletionTrend` and its maximum count for the efficiency trend panel. Only completed tasks with a valid persisted `completedAt` contribute a point.
2. Add a pure analytics helper that groups tasks by non-empty owner. Each row exposes total tasks, completed tasks, average progress, and completion rate. Sort by completed-task count, then average progress, then owner name for deterministic output.
3. Add a pure analytics helper that calculates the mean elapsed time between `createdAt` and `completedAt` for completed tasks with a valid non-negative interval. Display one decimal day and use an em dash when no complete interval exists.
4. Render compact, scan-friendly member rows with rank, avatar initial, delivery counts, and a fixed progress track. Avoid nested cards and preserve the existing panel, border, color, typography, and spacing tokens.

## Data Rules

- A completed task is a task whose state/status is `completed`; `closed` is not currently emitted by workspace tasks and is not included in efficiency counts.
- Completion trend ignores completed tasks without a valid `completedAt` date.
- Member rows ignore blank owner names because they cannot be attributed.
- Average progress is the rounded arithmetic mean after clamping each task progress to 0-100. Completed tasks are treated as 100 even if their stored progress is stale.
- Completion rate is `completedTasks / totalTasks`, rounded to an integer percentage.
- Average delivery cycle uses exact timestamps, rejects invalid and negative intervals, and rounds the final number to one decimal day.
- Empty states remain visible when there are no qualifying trend points or attributable members.

## Realtime Flow

```text
Member completes task
  -> server persists state and completedAt
  -> project.progress.updated is emitted
  -> manager shell reloads WorkspaceService data
  -> data.tasks changes reactively
  -> trend, member efficiency, and cycle metrics recompute
```

No event payload is used as the source of truth, and no new polling loop is added.

## Layout and Responsive Behavior

- Desktop uses the existing wider-trend/narrower-leaderboard `analysis-grid` tracks with equal-height panels.
- Trend rows use stable date, flexible bar, and count columns.
- Member rows use a fixed rank/avatar area, a flexible identity/progress area, and a right-aligned result area.
- At the existing 1180px breakpoint, the panels stack to one column.
- Text is allowed to wrap or truncate within flexible tracks and may not resize the grid.
- Visual treatment follows the current light operational dashboard. Linear's dense information hierarchy is used only as layout guidance; its dark theme and branding are not adopted.

## Testing

- Unit-test member grouping, sorting, progress normalization, and empty-owner handling.
- Unit-test average cycle calculation, rounding, and invalid timestamp handling.
- Add a UI source regression proving the efficiency route renders the real computed trend, member rows, and cycle metric instead of the former placeholders.
- Add style regression coverage for stable efficiency panel and row geometry.
- Run focused analytics/UI tests and a production build.

## Scope Boundaries

- Do not add backend routes, database fields, or Socket.IO events.
- Do not change dashboard realtime lifecycle or authorization.
- Do not invent historical dates or member records.
- Do not redesign unrelated manager pages.
