# Project Member Remediation Design

## Goal

Complete the project-member module so that project owners can manage eligible members from the project detail page, membership changes take effect immediately, and project-role labels do not expand project authority.

## Scope

This change resolves the accepted project-member blockers only: eligible account validation, owner-only member administration, immediate access revocation after removal, and usable member-management controls in the project detail page.

It does not change the existing project ownership model, introduce delegation, or add organization hierarchy.

## Authorization Model

Only a system `manager` whose ID equals `projects.owner_id` may list member candidates, add members, change project roles, or remove members. The project owner must remain a project member with project role `manager`; the owner cannot be removed or changed to project role `member`.

System role controls account eligibility. Only active accounts whose system role is `manager` or `member` can be added. `admin` and `auditor` accounts are never project members and cannot be task assignees through this workflow.

The project role values remain `manager` and `member`, but they are labels within a project only. A project-role `manager` who is not the project owner gains no edit, member-management, task-management, risk-management, or project-management authority.

## Membership Lifecycle

Adding an eligible account creates membership, or updates the existing member's project role. Each successful addition or role update writes the existing membership audit event.

Removing a non-owner member deletes the membership row and writes the removal audit event. Historical task records remain intact. After removal, the former member must not be able to list, read, update, provide feedback on, or add notes to tasks in that project. A manager retains normal access to their owned project.

Task assignment remains restricted to active project members. Therefore removed members cannot be newly assigned or selected when an existing task is reassigned.

## User Interface

The project detail Members tab continues to display member name, email, system role, and project role. For the project owner only, its management control opens a modal dialog.

The dialog lists current members and provides these operations:

- Select an eligible account and project role, then add the account.
- Change the project role of a non-owner member.
- Remove a non-owner member after confirmation.

The owner row does not expose role-change or removal controls. Non-owners see the member table without the management control. After every successful mutation, the dialog and detail table reload from the server. Errors remain visible in the dialog without changing the displayed membership state.

## API and Data

Existing endpoints and DTOs remain the contract:

- `GET /projects/:id/members`
- `GET /projects/:id/member-candidates`
- `POST /projects/:id/members`
- `PATCH /projects/:id/members/:userId`
- `DELETE /projects/:id/members/:userId`

No schema changes are necessary. The existing `project_members` primary key maintains one membership per project and user. Backend checks are authoritative; the frontend only hides controls for usability.

## Error Handling

Attempting to add an inactive, administrator, or auditor account returns `400 Bad Request`. Attempts by a non-owner or non-manager return `403 Forbidden`. Attempting to remove or demote the owner returns `400 Bad Request`. A former member accessing a task from a removed project receives `403 Forbidden`.

## Test Strategy

Add server service tests proving ineligible account rejection, owner-only management, and immediate task access revocation after removal. Preserve coverage for owner protection and membership audit events.

Add frontend tests that require a functional management control and verify the member dialog invokes the existing workspace service methods. Run focused tests, the full test suite, and the production build.

## Acceptance Criteria

1. Only the project owner can administer members.
2. Only active system `manager` and `member` accounts can join a project.
3. Project-role `manager` grants no authority beyond project-role `member`.
4. Removing a member immediately revokes all task access and mutations for that project while retaining task history.
5. The project owner can add, change, and remove eligible non-owner members through the project detail interface.
6. The owner cannot be removed or demoted.
7. Membership changes remain audited, all automated tests pass, and the production build succeeds.
