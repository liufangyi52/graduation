# Acceptance Blockers Remediation Design

## Goal

Remove the authorization, workflow-integrity, data-consistency, configuration, and dependency blockers found during final acceptance review without restructuring the application outside the affected boundaries.

## Scope

This change covers:

- immediate project access revocation after member removal;
- system-role eligibility for project membership and task assignment;
- concurrency-safe analysis review;
- active final-assignee resolution and task-assignment notification delivery;
- accurate risk-to-task API and UI data;
- operational analysis model and default-mode settings;
- consistent task status, progress, and completion metadata;
- automatic deadline risks and dual-recipient notifications;
- replacement or upgrade of dependencies reported as high severity.

It does not redesign the role model, add organization hierarchy, replace MySQL, or split `AppService` into new domain services.

## Authorization Boundaries

### Current membership is authoritative

Historical task assignment does not grant continuing project access. A system `member` must have both:

1. `tasks.assignee_id = currentUser.id`; and
2. a current `project_members(project_id, user_id)` row for the task's project.

This rule applies to task lists, overdue-task lists, direct task updates, feedback, notes, project risks, project detail, calendar data, and project progress WebSocket subscriptions. Removing a non-owner member retains task history but immediately revokes all reads, writes, and live updates for that project.

The WebSocket gateway revalidates membership before joining a project room. Progress events contain no authorization decision of their own and are emitted only to rooms whose connected clients passed the current membership check. `ProjectProgressEventsService.revokeMember(projectId, userId)` fetches the sockets in `project:<projectId>` and makes every socket whose authenticated user ID matches `userId` leave that room. `removeProjectMember` calls it after the membership deletion commits. Every reconnect and room join also revalidates against MySQL.

### Eligible project accounts

Only active accounts whose system role is `manager` or `member` may be inserted into `project_members` or selected as a task assignee. The server enforces this rule even when the request bypasses the frontend. Active `admin` and `auditor` accounts are rejected with `400 Bad Request`.

Project-role values remain `manager` and `member`; they do not elevate a non-owner project member to project-owner authority.

## Concurrency-Safe Review Approval

`reviewAnalysis` opens a transaction, selects the target analysis and meeting/project metadata using `FOR UPDATE`, and checks `status = 'pending'` inside that transaction. The transaction then reads the saved draft, updates the analysis, creates tasks, inserts task notifications, and creates linked risks.

Only the transaction that locked a pending analysis may perform these writes. A concurrent second request waits, observes the committed non-pending status, and returns the existing `Analysis has already been reviewed` error without creating data.

The final assignee for each approved task is resolved as follows:

1. use the normalized `owner_email` only when it matches an active `manager` or `member` account with current project membership;
2. otherwise use the active project owner;
3. if no active eligible project owner exists, reject the review and roll back the entire transaction.

Each created task and its unread notification use the same final assignee ID. Risks resolve their draft `task_index` against the ordered list of generated task IDs in the same transaction.

## Risk-To-Task Read Model

The risk list API returns separate fields:

- `task_id`: nullable formal task ID;
- `task_title`: nullable formal task title;
- `description`: the risk description.

The frontend maps these to `Risk.taskId`, `Risk.task`, and `Risk.description`. The risk center displays the task title or `项目级风险` when no task is linked. The task board's open-risk filter compares `risk.taskId === task.id`; it never searches the risk title or description for an internal task ID.

Member risk queries continue to join through `risks.task_id`, require the linked task to be assigned to the member, and also require current project membership. Project-level risks remain hidden from members.

## Operational Analysis Settings

The database `system_settings` row is the runtime source for the normalized analysis model and default mode. Environment variables remain bootstrap fallbacks when the settings row is absent; API keys and service URLs remain environment-only secrets.

Before each analysis or reanalysis, the server resolves:

- `model`: normalized stored model, falling back to `DEEPSEEK_MODEL`;
- `mode`: explicit valid request mode when present, otherwise the stored default mode.

The resolved model is passed explicitly through `AnalysisRunner` to `DeepSeekService`; request code must not mutate `process.env`. Persisted analysis rows and execution metadata record the same resolved model.

An authenticated manager-safe endpoint exposes only the normalized model name and default mode. It never exposes API keys, base URLs, or desensitization configuration. The meeting form loads this endpoint and uses its mode as the initial selection while retaining per-request override controls.

## Task State Invariants

All task creation and update paths use one normalization rule:

- status `completed` implies progress `100`;
- progress `100` implies status `completed`;
- status `todo` or `in_progress` requires progress from `0` through `99`;
- reopening a completed or 100-percent task as `todo` resets progress to `0`;
- reopening it as `in_progress` sets progress to `99` when no lower progress is supplied;
- closing a task preserves its current progress;
- first completion sets `completed_at`; reopening preserves that historical first-completion timestamp.

Conflicting supplied pairs are normalized deterministically rather than stored as contradictory values. Progress events, audit metadata, API responses, project averages, and status counts all use the normalized result.

## Deadline Risks And Notifications

An unfinished task with a due date produces one of two warning types:

- `due_soon`: due today through three calendar days from today;
- `overdue`: due before today.

Risk deduplication uses the linked `task_id` and warning type, not the task title. Two different tasks with the same title therefore produce independent risks.

Every warning notifies:

- the active task assignee; and
- the active project owner, unless that is the same account.

The database adds nullable `notifications.dedupe_key` with a unique index. Deadline keys include the task ID, warning type, and recipient ID. An unread duplicate is ignored atomically. Marking a notification read also clears its dedupe key, allowing a later condition check to create a new unread reminder while preserving history.

Task completion or closure creates no new deadline warning. Notification bodies contain task and deadline information only and link members to `/my-tasks`; manager links use the project task view.

This automatic system behavior is an explicit exception to administrator-authored manual notifications. README and current acceptance documentation must describe both paths without contradiction.

## Dependency Remediation

The browser-only Excel export replaces `xlsx` with `write-excel-file`. The new exporter preserves the existing filenames, sheet labels, row values, and download behavior while avoiding workbook parsing functionality that is not used by the application.

The lockfile resolves `nanoid` to version `3.3.18` or later. Dependency changes are accepted only when production build and export tests pass and `npm audit --omit=dev --audit-level=high --registry=https://registry.npmjs.org` reports no high-severity findings.

## Error Handling

- Former project members receive `403 Forbidden` for direct reads and mutations.
- Ineligible project accounts or assignees receive `400 Bad Request`.
- Concurrent repeat review receives the existing already-reviewed error.
- Review approval rolls back when no active final assignee exists.
- Missing runtime settings fall back to environment defaults; invalid stored values normalize to supported defaults.
- Dependency export failures surface through the existing project export error state.

## Testing

Every production behavior is introduced through a failing regression test before implementation.

Focused coverage includes:

- removal revokes task list, update, feedback, notes, risk, and WebSocket access;
- admin/auditor membership and assignment requests are rejected;
- two concurrent approvals create one task/notification/risk set;
- inactive owner-email matches fall back to the active project owner;
- risk responses expose task ID/title and UI filtering compares IDs;
- persisted model/default mode reach the provider and manager form;
- all create/update/reopen paths preserve task invariants;
- same-title tasks receive independent risks and deduplicated dual-recipient reminders;
- reading a notification permits a later unread reminder;
- Excel export behavior remains compatible after the dependency replacement;
- the additive notification migration is idempotent.

Final verification requires:

1. focused tests for every remediation task;
2. `npm test` with zero failures;
3. `npm run build` with exit code zero;
4. `git diff --check` with no whitespace errors introduced by this change;
5. official-registry production dependency audit with no high-severity findings;
6. read-only MySQL checks for the risk foreign key and notification dedupe column/index;
7. clean worktree and synchronized remote branch after commit and push.

## Acceptance Criteria

1. Removing a member immediately revokes all current-project task, risk, note, feedback, and live-event access.
2. Only active `manager` and `member` accounts can join projects or receive task assignment.
3. Concurrent analysis review cannot create duplicate business records.
4. Review-created notifications always reach the active final task assignee.
5. Risk center and task filtering use the persisted task relationship, not description text.
6. Stored model and default mode affect actual analysis execution without exposing secrets.
7. Task status, progress, and completion metadata cannot contradict each other.
8. Due-soon and overdue warnings are task-specific, notify both required recipients, and do not duplicate unread notifications.
9. Production dependency audit contains no high-severity findings.
10. Full tests and production build pass.
