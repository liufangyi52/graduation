# Spacious Project Analytics Design

## Goal

Present the project analytics tab as a relaxed, high-fidelity B-side project
management view with legible operational metrics, charts, and plan data.

## Layout

The analytics tab uses three vertical bands with 24px gaps between them:

1. A four-column metric grid for total tasks, completion rate, overdue tasks,
   and open risks.
2. A two-column analytics grid: the task completion trend uses the wider left
   column, and the risk distribution uses the right column.
3. A full-width task-plan Gantt chart below the analytics grid.

At narrow widths the metrics collapse to two columns and analytics cards stack;
the Gantt chart keeps its timeline readable with horizontal scrolling.

## Card And Chart Treatment

- Every analytics card is white with an 8px corner radius, a light neutral
  border, and exactly 24px internal padding.
- Headings, legends, chart canvases, and table/timeline edges must remain
  inside that padding. No chart, text, or bar may touch a card edge.
- Card headings have a 24px bottom margin before their chart or timeline.
- Cards use a 16px grid gap within a band and a 24px gap between bands.
- The completion trend uses a blue line chart with restrained grid lines and
  a date axis. It consumes the existing completion timestamps.
- Risk distribution uses a compact donut chart with a colored, count-bearing
  legend for high, medium, and low risks.
- The Gantt chart keeps the existing real task dates and status colors, but
  adds a padded header, timeline labels, and stable columns for task name,
  timeline, and date range.

## Scope And Data

All data remains derived by `buildProjectAnalytics`; this is a presentation
change only. No new API, route, persistence, or synthetic historical data is
introduced.

## Verification

Add a focused UI regression test for the analytics layout hooks and 24px card
padding. Run the targeted test, full test suite, and production build.
