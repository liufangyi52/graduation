# Task Reminder Design

## Goal

Allow a project manager to remind the assignee of an unfinished task without changing the task's status or progress.

## Behavior

- The task list shows `推进` only to project managers for tasks whose status is neither `completed` nor `closed`.
- Clicking `推进` calls a dedicated task reminder endpoint. It does not call the task status update endpoint.
- The server verifies that the requester manages the task's project, then creates an unread notification for the task assignee with a link to `/my-tasks`.
- The task's persisted `status`, `progress`, and `completed_at` remain unchanged.
- The user interface reports a successful reminder and prevents duplicate clicks while the request is in flight.

## Architecture

The NestJS controller exposes `POST /api/tasks/:id/reminder`. `AppService.remindTask` owns authorization, task lookup, notification persistence, audit logging, and cache invalidation. The workspace service exposes `remindTask`, and `TaskBoardPage` invokes it from the existing action button.

## Error Handling

The endpoint returns an authorization or missing-task error without creating a notification. The task-list page keeps its current data and shows the server error message. This path is independent of project-progress WebSocket publishing, so a reminder cannot fail because of that integration.

## Testing

An AppService test verifies the notification insert and invariant task state. A UI-oriented source test verifies the button calls `remindTask` and is absent for completed or closed tasks. Existing task-management tests continue to cover status transitions separately.
