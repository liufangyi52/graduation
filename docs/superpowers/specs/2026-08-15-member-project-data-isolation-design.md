# Member Project Data Isolation Design

## Goal

Prevent project members from reading other members' tasks, feedback, progress, and risks while preserving their access to project metadata, meetings, and the member directory.

## Risk-to-Task Relationship

- Add nullable `risks.task_id` with an index and a foreign key to `tasks.id` using `ON DELETE SET NULL`.
- A risk with no `task_id` is a project-level risk and is visible only to project managers.
- An overdue or near-due task risk stores the triggering task ID.
- Candidate risks in an analysis draft gain optional `task_index`. It identifies the zero-based candidate-task index in that same draft and is not a database ID.
- The review page lets a manager select either a candidate task or the project-level option for every candidate risk.
- Removing a candidate task clears risk references to that task and decrements references above it. The server rejects a supplied `task_index` outside the draft task array.
- During approval, `reviewAnalysis` records the generated task ID for every candidate-task index, then resolves each risk's `task_index` to that generated task ID before inserting it.

## Member Data Scope

- The existing project-membership check remains the access gate for project metadata, meetings, and the member directory.
- For a member request, project-detail tasks include only `tasks.assignee_id = user.id`.
- Member risks include only risks whose `task_id` points to a task assigned to that member. Project-level risks are excluded.
- Member progress events and feedback activity include only events for that member's assigned tasks.
- Member summary counts and health values are calculated from the same personal task and risk sets. Pending AI reviews are returned as zero because members may only view approved results.
- The detail response exposes a `scope: 'personal' | 'project'` indicator. The project-detail page labels member metrics as personal task metrics rather than team-wide project health.
- Project managers keep the existing full-project detail, all risks, all member statistics, and all activity.

## Risk Center

- The member risk-center query joins `risks` to `tasks` through `risks.task_id` and filters by `tasks.assignee_id = user.id`.
- Manager and administrator risk-center behavior is unchanged.

## Validation and Compatibility

- `task_index` is optional to keep existing AI output and stored drafts valid. Omitted values produce project-level risks.
- Existing risks remain nullable and therefore manager-only until explicitly linked to a task.
- The migration is additive and does not rewrite existing risk records.

## Testing

- Migration tests confirm the nullable task relationship and foreign-key behavior.
- Review-draft tests accept a valid `task_index`, reject an out-of-range index, and confirm approval persists the mapped task ID.
- Deadline-warning tests confirm generated risks store the source task ID.
- Project-detail and risk tests prove members receive only their own tasks, risks, activity, and summary metrics while managers still receive full project data.
- UI tests verify a manager can select a candidate task for a risk and members see personal-scope labels.
