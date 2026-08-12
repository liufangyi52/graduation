# Project Manager and Administrator Role Separation Design

## Goal

Separate project business authority from system administration so that only the responsible project manager can make project business changes. Administrators retain account and system-maintenance duties and have no project business write authority.

## Scope

This change applies to project creation and archiving, meeting creation and AI analysis, AI review, task progress or feedback updates, and risk resolution. It also aligns visible navigation and action controls with server-side authorization, and records currently missing business changes in the audit trail.

No emergency delegation or temporary cross-project authority is included. That workflow requires an approval model and independent review capability that the current system does not provide.

## Role Boundaries

### Project manager

The project manager is the business owner of projects where `projects.owner_id` equals the authenticated user ID. Within only those projects, the manager may create and archive projects, submit and analyze meeting minutes, review AI results, update task status or progress, submit task feedback, and resolve risks.

### System administrator

The system administrator manages user accounts, account roles, account state, passwords, model and integration configuration, and system maintenance. The administrator may inspect operational data only where a read-only route is explicitly exposed. The administrator cannot create, alter, approve, resolve, archive, or otherwise change project business records.

An administrator-created project is disallowed. A project must be created by its project manager, who becomes both its `owner_id` and its project membership manager.

## Authorization Design

### Server enforcement

Introduce one project-business authorization check that requires `user.role === 'manager'` and verifies the project owner equals `user.id`. Every project business write endpoint invokes this check before mutating data.

The affected operations are:

| Operation | Required authority |
|---|---|
| Create project | Authenticated project manager |
| Archive project | Responsible project manager |
| Update task status or progress | Responsible project manager, or the task assignee when the user is a member |
| Submit task feedback | Responsible project manager, or the task assignee when the user is a member |
| Create meeting and invoke AI analysis | Responsible project manager |
| Approve or reject AI analysis | Responsible project manager |
| Resolve risk | Responsible project manager |

The `admin` role is not a business-writer exception in authorization helpers or service methods. Requests from administrators to these write endpoints receive a `403 Forbidden` response, including for projects that the administrator can read.

Read visibility remains separate from write authority. The existing administrator read routes may continue to return global business data where operational support requires it. This does not grant an implied write permission.

### Account governance guardrails

Administrators retain account management. Existing protections against self-disable remain. This scope does not introduce a multi-administrator approval workflow, but all account changes and password resets remain auditable.

## UI Design

Administrator navigation removes project-management business routes and action affordances: project creation, project archiving, task progression, meeting submission, AI review actions, and risk resolution. Account administration, system settings, notifications, audit logs, and any explicitly read-only operational view remain visible.

Project manager navigation continues to show project business workflows only for owned projects. Frontend checks serve usability only; backend authorization remains authoritative.

## Audit Design

The service records audit entries for project creation, task updates, and task feedback in addition to the existing records for meetings, AI analysis, reviews, risk resolution, project archiving, and account management.

Each audit entry records the actor, action, entity type, entity ID, and operation details necessary to identify the affected project business record. Sensitive feedback content is not copied into audit details; task ID and resulting progress/status are sufficient.

## Error Handling

Business write requests from administrators or managers who do not own the target project return `403 Forbidden` without changing business data. Missing business objects retain the existing validation error behavior. Invalid task inputs retain the existing `400 Bad Request` validation behavior.

## Test Strategy

Add server-focused authorization tests for each administrator business-write denial and for the responsible-manager success path. Test at the service boundary with mocked database calls only where required by the current database coupling. Add focused UI authorization tests for the route matrix or conditional action visibility where current test infrastructure supports it.

The regression suite must prove that removing an administrator denial or project-owner check causes a failure. Existing member task ownership tests remain unchanged and must continue to pass.

## Acceptance Criteria

1. An administrator receives `403` for all project business write operations listed above.
2. A manager can perform those operations only when they own the target project.
3. Members retain only their existing own-task update and feedback capability.
4. Administrators cannot access business-write routes or see business-write controls in the UI.
5. Project creation, task changes, and task feedback generate audit records.
6. The full automated test suite and production build pass.
