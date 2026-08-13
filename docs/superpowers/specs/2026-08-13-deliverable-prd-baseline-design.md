# Current Deliverable PRD Baseline Design

## Goal

Align `prd.md` with the behavior implemented and verified in the current deliverable so it can be used as the single acceptance baseline.

## Scope

The revision retains the four account roles: project manager, project member, system administrator, and auditor. It changes requirements only where they conflict with the running implementation. It does not change application code, database schema, API behavior, or historical design documents.

## Role Baseline

- Project managers own and manage their projects, meetings, AI reviews, task assignment, risks, project members, and project lifecycle.
- Project members view only projects they participate in and operate only tasks assigned to themselves. Their executable actions are updating task progress and status, submitting feedback, adding task notes, and reading their own notifications.
- System administrators manage accounts and system settings. They may read global business data needed for operational support, but do not create, edit, review, assign, resolve, archive, or otherwise mutate project business data.
- Auditors have a read-only audit view and access to their own notifications. They do not enter project, meeting, task, risk, calendar, or AI-analysis business views.

## PRD Changes

1. Update role definitions and the collaboration flow to state that project managers initiate and manage business processes, administrators provide account/configuration support, and auditors trace activity through audit logs.
2. Update functional requirements to remove member meeting import, administrator business-data maintenance, and auditor business-record reading as acceptance requirements.
3. Define the audit deliverable as a global, read-only chronological operation log. It does not include multi-dimensional filtering, before/after snapshots, rollback execution/history views, or direct business-object navigation.
4. Update the route/page table and the role permission matrix to match the service authorization boundaries.
5. Add a delivery acceptance section covering role isolation, auditable mutations, account/configuration administration, and successful automated test/build verification.

## Acceptance Evidence

The revised document will cite observable application behavior: task updates and feedback are restricted to assignees; managers retain project-level mutations; account and settings mutations require administrator access; auditors are restricted to audit logs; audited mutations create operation-log entries. The project test suite and production build are the verification commands.

## Explicit Non-Requirements

The current deliverable does not include administrator project/meeting/task/risk mutations, member meeting import, auditor access to business records, audit-log filtering, pre/post snapshots, rollback execution records, or expanded audit evidence navigation.
