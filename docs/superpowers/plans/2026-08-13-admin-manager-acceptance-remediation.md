# Administrator and Project Manager Acceptance Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the administrator and project-manager module acceptance gaps without granting administrators project-business write authority.

**Architecture:** Persist singleton system settings in MySQL behind administrator-only API endpoints. Reuse the existing user-management APIs from an administrator-only UI for account creation, activation, role changes, and password reset. Keep project business affordances gated by `canManageProjectBusiness` and retain server-side ownership checks as the authority.

**Tech Stack:** Vue 3, TypeScript, NestJS, MySQL, class-validator, Vitest.

## Global Constraints

- Administrators may manage accounts and system settings but must not gain project-business write authority.
- Only a manager who owns a project may mutate that project's business records.
- Settings changes and account changes must be auditable.
- Existing unrelated working-tree changes must remain untouched.

---

### Task 1: Persist Administrator System Settings

**Files:**
- Modify: `src/server/migrate.ts`, `src/server/dtos.ts`, `src/server/app.controller.ts`, `src/server/app.service.ts`
- Modify: `src/services/workspaceService.ts`, `src/App.vue`
- Create: `tests/admin-settings.spec.ts`

- [ ] Write tests proving non-administrators cannot read or update settings and administrator updates are persisted and audited.
- [ ] Run the new test and observe the missing settings API failure.
- [ ] Add singleton settings storage, validated administrator-only read/write endpoints, client load/save methods, and save error handling in the settings view.
- [ ] Re-run the focused settings tests.

### Task 2: Complete Administrator Account Governance UI

**Files:**
- Modify: `src/App.vue`
- Modify: `tests/auth-service.spec.ts`

- [ ] Write request-level tests for account creation, activation updates, and password reset.
- [ ] Run the focused test and confirm the new UI integration is not yet covered.
- [ ] Add administrator-only account creation and password-reset modals plus activation toggles, using the existing administrator-protected API methods.
- [ ] Re-run the focused tests and type check.

### Task 3: Remove Read-Only Role Business Affordances

**Files:**
- Modify: `src/App.vue`
- Modify: `tests/auth-service.spec.ts`

- [ ] Add a regression assertion that the business-control predicate excludes administrators, members, and auditors.
- [ ] Replace project-card create and archive checks with `canManageBusiness`.
- [ ] Run focused authorization tests.

### Task 4: Final Acceptance Verification

**Files:**
- Verify: all files above

- [ ] Run `npm test` and `npm run build`.
- [ ] Review the diff for administrator write boundaries, persistence wiring, audit events, and accidental unrelated changes.
