# Core Workflow Acceptance Design

## Goal

Complete the locally demonstrable core workflow required for acceptance: meeting-minute intake, desensitization and version history, AI review, project-member assignment, task progress, risk warning, notifications, and audit traceability.

## Scope

This change implements the first acceptance batch only. It does not implement RAG/vector retrieval, Redis/BullMQ queues, multi-mode experiments, Gantt/burndown charts, or Excel/PDF export. Those are separate PRD acceptance batches.

## Meeting Intake And Version History

Project managers can create meeting minutes by pasting text or uploading one `.txt` or `.docx` file. The browser extracts text from `.txt`; `.docx` text extraction is performed by the API. Unsupported, empty, or oversized files are rejected before creating a meeting version.

Each submitted or restored content state creates an immutable `meeting_versions` row. A version contains the meeting id, monotonic version number, source type, original content, desensitized content, creator, and timestamp. The meeting record points to its current version. The API exposes the version list and individual version content for the responsible manager. Restoring a version copies its content into a new version; historical rows are never edited or deleted.

The UI provides source selection, a file picker, version list, version comparison, and restore command. A comparison presents the two selected versions as original/desensitized content rather than claiming a semantic diff. The current version is visibly identified.

## Desensitization

Before analysis, the service reads `system_settings.desensitize`. When enabled, it replaces Chinese mobile phone numbers, email addresses, and 18-digit Chinese identity numbers with stable category markers. The original content remains in the version record for authorized project-manager recovery, while all AI requests consume only desensitized content. Audit records store ids, version numbers, and counts, never minute content or feedback text.

## Project Members

The responsible project manager can list project members, add an active user as `member`, alter a project role between `member` and `manager`, and remove members other than the owning manager. Adding a member is idempotent; assigning tasks generated from AI is limited to project members. The API includes `GET`, `POST`, `PATCH`, and `DELETE` operations under `/projects/:id/members`.

Member visibility remains restricted to their memberships and their assigned tasks. Administrators and auditors retain their existing read or account-management permissions but cannot alter project business data.

## AI Review And Notifications

Analysis requests always use the current meeting version's desensitized content. Approval writes tasks and risks in one transaction. For each created task assigned to a project member, the service creates an in-app notification linking to that member's task view. Rejection records an optional manager reason in the analysis record and audits the action without retaining the reason in audit details.

## Progress And Risk Warnings

Project list responses include `progress`, calculated from the average progress of all project tasks; projects with no tasks report zero. Task feedback and task updates recompute project progress at read time, so no denormalized progress update is required.

When task progress changes, the service creates one open risk per task for overdue tasks and one for tasks due within three calendar days. Duplicate open risks use a deterministic task-based title. It sends a single active notification to the assignee for each risk condition. Resolved risks can recur only after a later qualifying task update.

## API And Data Model

Migration adds `meeting_versions` and safe incremental columns needed for meeting current-version reference and analysis rejection reason. Existing meeting content migrates lazily: the first version-aware read or analysis creates version one if none exists.

New API surface:

- `POST /meetings/import`: multipart meeting creation from `.txt` or `.docx`.
- `GET /meetings/:id/versions`: version metadata.
- `GET /meetings/:id/versions/:versionId`: version content.
- `POST /meetings/:id/versions/:versionId/restore`: create a new current version.
- `GET /projects/:id/members`, `POST /projects/:id/members`, `PATCH /projects/:id/members/:userId`, `DELETE /projects/:id/members/:userId`.
- `POST /analyses/:id/review`: accepts `approved` and optional `reason`.

All endpoints require JWT authentication and server-side role plus project-ownership enforcement. Input is validated with DTOs and Nest's existing validation pipe.

## Verification

Tests are written before each implementation unit and first run red. They cover desensitization patterns, immutable version restore, manager-only membership mutation, approved-analysis notification creation, rejection audit privacy, project progress calculation, and overdue/near-due risk de-duplication. Existing authorization and workflow tests remain green.

Acceptance verification runs `npm test`, `npm run build`, API health check against MySQL, and a scripted end-to-end smoke sequence using a disposable project and users. The Vitest configuration excludes `.worktrees/**` so test counts represent the active repository only.
