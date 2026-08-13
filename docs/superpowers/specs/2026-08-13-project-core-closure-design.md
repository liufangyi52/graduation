# Project Core Closure Design

## Goal

Complete the first PRD acceptance batch for the locally deployed system: complete project management, configurable desensitization with privacy-safe operation records, batch review and re-analysis, complete task management, and server-driven overdue-task dashboard data.

This batch builds on the existing meeting-version, fixed-rule desensitization, approval, notification, and risk-warning work. It must preserve existing role separation: managers own project business mutations, members update only their assigned tasks, administrators manage system configuration only, and auditors are read-only.

## Scope And Non-Goals

Included:

- Project editing, reversible soft deletion and restoration.
- Project-scoped tag catalogs and many-to-many project-tag links.
- Project-scoped custom desensitization rules and per-operation rule-hit logs.
- Single and batch analysis review, review-result notifications, and rejection-to-re-analysis flow.
- Manual task creation, editing, assignment, closure/reopening, and independent task notes.
- A server endpoint providing the dashboard's real-time overdue task data.
- DTO validation, API client methods, focused UI controls, audit entries, and automated tests.

Excluded from this batch:

- RAG, vector stores, agent orchestration, Redis/BullMQ, experimental sample libraries, formal Gantt/burndown reports, external integrations, export, and database-wide audit immutability controls. These remain separate acceptance batches.

## Project Lifecycle And Tags

`projects` gains nullable `deleted_at` and `deleted_by` fields. Deletion marks these fields and records `project.deleted`; it never cascades to business records. Standard project, meeting, task, risk, calendar, and dashboard queries exclude deleted projects. A responsible manager can list their deleted projects and restore one, clearing these fields and recording `project.restored`. Restoration does not change archived status.

Project managers may update a project name, code, description, end date, and status. The owner is immutable through this endpoint. Validation keeps project codes unique and restricts status to the existing project states.

Tags are project-scoped. `project_tags` stores the tag name and owning project, with a unique `(project_id, name)` constraint. `project_tag_links` links a project to zero or more tags. A manager can create, rename, or delete tags in a project tag catalog, and bind or unbind tags to that project. Removing a tag removes only its links. All tag mutations verify project ownership and are audited using ids and names only.

## Configurable Desensitization

`desensitization_rules` stores a project id, rule name, regular-expression pattern, replacement text, enabled flag, creator, and timestamps. Only the responsible manager can create, edit, enable/disable, or remove its project's rules. The API validates nonempty names and replacement values, bounds lengths, and verifies that a submitted pattern compiles before saving.

When a meeting version is created or restored with desensitization enabled, fixed rules run first in the established identity, phone, then email order. Enabled custom rules then run in ascending creation order. For every rule that runs, an append-only `desensitization_logs` row records the meeting version id, rule kind/id, hit count, actor, and timestamp. It never stores source text, matched values, replacement output, or the regular expression itself. Existing historical versions are not rewritten when rules change.

## Review And Re-analysis

The existing single-analysis approval/rejection endpoint remains. A batch endpoint accepts a bounded list of pending analysis ids and one approved/rejected decision. Each analysis is processed independently in a transaction; the response reports success and failure entries so one invalid item does not roll back valid review decisions.

Approval continues to create approved tasks, risks, audit data, and assignee notifications. Both successful approval and rejection create an in-app notification for the requester. Rejection stores the optional reason only on `ai_analyses`; audits retain ids, decision, and count but never the reason.

A manager who owns the analysis project may re-analyze a rejected analysis. The action obtains the current meeting version's desensitized content, invokes the existing analysis adapter, creates a new pending analysis record, links it to the rejected source analysis with `reanalysis_of_id`, and records `analysis.reanalyzed`. It does not overwrite the rejected record, its reason, or its review timestamps. The replacement result re-enters the normal review queue.

## Task Lifecycle And Notes

Managers can manually create a task in a project and edit its title, description, assignee, priority, due date, status, and progress. Any selected assignee must be an active member of the project. Manager assignment and reassignment send an in-app notification to the current assignee. Creating a manual task creates a `task.created` audit entry; edits create `task.updated` without storing description or note content in audit details.

Managers can close a task, which sets status to `closed` and preserves progress. They can reopen it by setting an active status. Members cannot close another user's task and cannot change task identity, assignee, priority, title, description, or due date. Existing member progress/status updates and feedback remain available for their own assigned tasks.

`task_notes` is an independent append-only record with task id, author id, content, and timestamp. Managers can add notes to any project task; members can add notes only to their assigned task. Both roles can list notes when entitled to view the task. Notes are separate from feedback and audit records contain only note ids and task ids.

## Dashboard Overdue Data

`GET /dashboard/overdue-tasks` returns visible tasks whose project is not deleted, whose status is neither completed nor closed, and whose due date is before the server's current calendar date. Managers see tasks in owned projects; members see assigned tasks; administrators and auditors receive no business tasks. The response includes id, title, project name, assignee name, due date, priority, status, and progress. The dashboard removes all static overdue-task fixtures and renders only this response after workspace refresh.

## API Surface

- `PATCH /projects/:id`, `DELETE /projects/:id`, `POST /projects/:id/restore`, `GET /projects/deleted`.
- `GET|POST /projects/:id/tags`, `PATCH|DELETE /projects/:id/tags/:tagId`, `PUT|DELETE /projects/:id/tags/:tagId/link`.
- `GET|POST /projects/:id/desensitization-rules`, `PATCH|DELETE /projects/:id/desensitization-rules/:ruleId`, `GET /meetings/:id/desensitization-logs`.
- `POST /analyses/review-batch`, `POST /analyses/:id/reanalyze`.
- `POST /tasks`, `PATCH /tasks/:id`, `POST /tasks/:id/close`, `POST /tasks/:id/reopen`, `GET|POST /tasks/:id/notes`.
- `GET /dashboard/overdue-tasks`.

All mutating endpoints require JWT authentication, DTO validation, project-ownership checks, and structured audit events. API clients preserve the existing JSON request convention and refresh affected workspace state after a successful mutation.

## Migration And Query Safety

Migrations are additive and idempotent. New foreign keys use `ON DELETE CASCADE` only for child data whose parent is being permanently removed by an administrator-maintenance operation; normal project deletion is soft and never calls delete SQL. Common queries receive indexes covering deleted-project filtering, project task due-date/status lookup, tag catalog uniqueness, rule lookup, review status, and note retrieval.

## Error Handling

The server returns validation errors for malformed ids, invalid lifecycle transitions, invalid custom regular expressions, unsupported tag/rule ownership, duplicate tag names, inactive/non-member assignees, empty notes, and batch sizes exceeding the configured maximum. A re-analysis is rejected unless its source analysis is rejected and its meeting has a current accessible version. No mutation silently changes records outside the owned project.

## Verification And Acceptance

Tests are introduced before each implementation unit and cover:

- soft deletion exclusion, restoration, owner-only project mutation, and tag uniqueness/link behavior;
- ordered fixed/custom desensitization, invalid pattern rejection, and logs that contain no sensitive source or match value;
- partial-success batch review, notification recipients, rejected-only re-analysis, and immutable rejection history;
- manager task creation/assignment/edit/close/reopen, member boundaries, and independent task notes;
- server-side overdue-task predicates and dashboard rendering without static task rows.

Final verification runs focused Vitest suites, the full `npm test`, and `npm run build`. A MySQL-backed smoke run creates a disposable project, applies tags/rules, verifies a masked meeting, rejects and re-analyzes an analysis, creates and closes a task, confirms the overdue dashboard endpoint, restores a soft-deleted project, and cleans up only data created by the script.
