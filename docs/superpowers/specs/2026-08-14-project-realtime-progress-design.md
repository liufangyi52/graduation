# Project Realtime Progress Design

## Goal

Enable every project member to see task progress changes, feedback, and risks promptly while retaining an auditable history.

## Scope

- Add a project activity event whenever a task is updated or feedback is submitted.
- Broadcast project events to authenticated project members in a project-specific realtime room.
- Add a reconnecting client subscription with a 10-second HTTP refresh fallback.
- Extend the project detail overview with project health, member progress, and recent activity.
- Upgrade the Gantt chart to distinguish planned duration from actual completion progress.

## Data and Authorization

- A progress event contains its id, project id, task id, actor id/name, event type, before/after progress and status, optional feedback text, and creation time.
- The server derives the project from the task. It never accepts a project id from the client for task events.
- HTTP endpoints and realtime room joins require the existing bearer token and verify project membership. Managers retain management permissions; members can only create events through updates to their own tasks.

## Realtime Flow

1. A task state/progress update or feedback submission is committed with its progress event.
2. The server broadcasts a `project.progress.updated` payload to `project:<projectId>`.
3. Connected project-detail clients merge the event, update the changed task and summary values, then refresh the project detail once to reconcile server state.
4. A disconnected client retries with bounded backoff; until connected it refreshes project detail every 10 seconds.

## Project Detail UI

- **Project health bar:** completion rate, active tasks, blocked/overdue tasks, open risks, and a "last synchronized" timestamp.
- **Member progress:** one compact row per assigned member with task count, completed count, average progress, latest feedback time, and a clickable task summary.
- **Activity feed:** newest-first events with actor, task, change summary, feedback excerpt, and Beijing time. It is limited visually but remains available in a full activity tab.
- **Gantt:** pale bar for planned duration, colored overlay for completed percentage, avatar/owner label, percentage, today line, and overdue styling.

## Failure Handling

- A failed realtime connection never blocks the existing HTTP task and feedback flows.
- Reconnection reloads the complete project detail to eliminate missed events.
- Event writes use the same database transaction as the task update or feedback write; an update is not reported to other members before it commits.

## Verification

- Unit tests for membership authorization, event creation, event payloads, and fallback refresh behavior.
- UI tests for the health bar, member progress, activity feed, and actual-progress Gantt overlay.
- Build and focused end-to-end service tests with two project members observing the same task update.
