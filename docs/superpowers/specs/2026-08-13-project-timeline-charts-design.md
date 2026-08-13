# Project Timeline Charts Design

## Goal

Complete the project analytics page with an actual date-proportional Gantt chart, a remaining-work burndown chart, and a reliable completion-date data path.

## Data Contract

`ProjectDetailTask` gains `createdAt` and nullable `completedAt`. The server detail response exposes task `created_at` and derives `completed_at` from the first audit-log transition to `completed`; tasks without that event retain `null`.

`buildProjectAnalytics` accepts these values and returns a timeline range plus CSS-ready Gantt positions. It also returns burndown points containing calendar date, planned remaining count, and actual remaining count. Completed tasks with no completion timestamp do not invent a historical burndown point.

## Visual Behavior

The Gantt chart uses the earliest task creation date and latest due date as its date range. Each dated task renders in the correct horizontal offset and duration percentage. The chart labels its range, uses a visible today marker when applicable, and distinguishes task state by bar color. Undated tasks remain in a separate list.

The burndown chart is an accessible SVG line chart. Its baseline declines linearly from the project start to the final planned due date. Its actual series starts at total task count and drops on each recorded completion date. Both series include labels and a no-data state.

## Error Handling And Scope

Invalid or absent dates are excluded from dated chart series without affecting summary metrics. The implementation adds no charting dependency and does not alter export behavior, authorization, or task lifecycle rules.

## Testing

Unit tests cover completion timestamps, Gantt percentages, burndown cumulative remaining values, no-date handling, and invalid date filtering. UI tests assert that the analytics page renders semantic Gantt and burndown structures rather than source-text-only labels. The full Vitest suite and production build are required before completion.
