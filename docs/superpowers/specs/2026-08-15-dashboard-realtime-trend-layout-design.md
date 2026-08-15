# Dashboard Realtime Completion Trend and Layout Design

## Goal

Make the project-manager dashboard update its task completion trend immediately when a project member changes task progress or submits feedback. Replace the static trend placeholder with a chart based on persisted task completion timestamps, and make the lower dashboard row use stable, responsive geometry.

## Context and Root Cause

The server already commits project progress events and publishes `project.progress.updated` to authorized `project:<projectId>` Socket.IO rooms. The project detail page subscribes to those events. The manager dashboard does not subscribe, so it only observes changes through its ten-second HTTP polling fallback. In addition, the dashboard trend panel is still static despite task records exposing `createdAt` and `completedAt`.

The lower dashboard row has an under-specified chart region. Its static empty state leaves disproportionate blank space and the trend and risk panels do not establish a shared visual rhythm across viewport widths.

## Selected Approach

Reuse the existing project-room protocol rather than introduce a new dashboard-specific server room.

After the dashboard has loaded visible projects, the client opens one dashboard-owned Socket.IO connection and joins every project room visible to the signed-in manager. When it receives `project.progress.updated`, it reloads the canonical workspace data through `WorkspaceService.load()`. The computed trend then redraws from the refreshed task records. The existing ten-second polling remains only as a disconnected-socket fallback.

This preserves the established authorization boundary: managers may join only projects they own, members may join only projects to which they belong, and the dashboard client never receives events for a project it cannot already read. Reloading rather than locally patching the event payload ensures tasks, completion timestamps, project progress, risks, and deadlines remain consistent with the server.

## Components and Data Flow

1. Extract or extend the existing browser Socket.IO lifecycle wrapper so both project detail and dashboard can connect, join one or more authorized project rooms, reconnect, and run an HTTP fallback only while disconnected.
2. In `App.vue`, maintain one dashboard subscription for non-auditor manager views. Reconcile joined project IDs after each successful workspace load, clean it up on unmount, and call `service.load()` when a progress event arrives.
3. Compute `dashboardCompletionTrend` from visible workspace tasks using `buildProjectAnalytics`. Include only completed tasks with a persisted `completedAt`, matching the existing analytics rule.
4. Render a compact date/count bar list when points exist. Otherwise render the explicit empty state without fabricating history.
5. Define stable bottom-row grid tracks, panel minimum heights, and responsive collapse behavior. The trend panel receives the wider track, the risk panel the narrower track, and both align from the same grid row without nested cards.

## Error Handling and Lifecycle

- Socket connection or authorization failures must leave the dashboard usable and start the existing ten-second HTTP refresh fallback.
- A successful reconnect must reload canonical workspace data and reconcile joined projects.
- A duplicate or stale event is harmless because reload is idempotent.
- Subscription teardown clears listeners, intervals, and the socket during unmount.
- If there are no projects to join, the dashboard renders normally without creating project-room subscriptions.

## Testing

- Add focused lifecycle coverage for joining multiple project rooms, reconnect fallback, and cleanup.
- Add dashboard-source or component coverage proving an event triggers workspace reload and trend computation uses `buildProjectAnalytics` with `completedAt`.
- Add coverage for trend rendering with completed task data and for the explicit no-history state.
- Verify the dashboard grid and responsive breakpoint declarations in the UI/style test suite.
- Run the focused Vitest set and production build after implementation.

## Scope Boundaries

- Do not add a dashboard-specific socket protocol or database table.
- Do not patch task state optimistically from an event payload.
- Do not alter the existing project-detail subscription behavior or project authorization rules.
- Do not invent completion history for tasks without a persisted completion timestamp.
