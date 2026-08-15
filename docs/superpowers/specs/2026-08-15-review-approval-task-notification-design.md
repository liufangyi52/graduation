# Review Approval Task Notification Design

## Goal

When a project manager approves an AI analysis, notify the final assignee of every task created by that approval.

## Assignment Rule

- If a reviewed task has an `owner_email` that belongs to an active member of the project, that member is the assignee.
- If the email is absent, invalid, inactive, or does not belong to the project, the project owner is the assignee.
- The notification recipient is always this final assignee, never the reviewer unless the reviewer is also the assignee.

## Transactional Behavior

- `AppService.reviewAnalysis` already creates approved tasks and risks in one database transaction.
- Immediately after inserting each task, it inserts one unread notification for the same assignee in that transaction.
- The notification links to `/my-tasks` and identifies the assigned task.
- A failure to create either the task or its notification rolls back the analysis review, all generated tasks, risks, and notifications.
- Existing manager-initiated task reminders remain unchanged.

## Audit and UI

- The existing `analysis.approved` audit event remains the audit record for the approval.
- No new endpoint or frontend action is needed. The assignee sees the notification through the existing notification center and task workspace.

## Testing

- A review approval with a matching project member writes a notification for that member.
- A review approval without a matching member writes a notification for the project owner.
- Existing review rejection behavior remains notification-free.
