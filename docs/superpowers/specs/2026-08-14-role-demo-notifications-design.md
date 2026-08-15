# Role Demo Notifications Design

## Goal

Allow an administrator to generate a demonstration notification for each
application role without creating duplicates.

## Behavior

The administrator-only action creates one unread notification for one active
account in each role. The notifications link to the role's operational page:

- Manager: AI review queue (`/reviews`).
- Member: personal task list (`/my-tasks`).
- Administrator: user management (`/users`).
- Auditor: audit log (`/audit-logs`).

The action is idempotent by recipient, title, and link. It reports how many
notifications were inserted and how many roles have no active account.

## UI And API

Add an authenticated `POST /api/notifications/demo` endpoint restricted to
administrators. Add a System Settings button that invokes the endpoint and
shows its result in the existing page notice mechanism.

## Verification

Test administrator authorization, role-to-notification routing, duplicate
prevention, client request behavior, and the administrator-only UI control.
