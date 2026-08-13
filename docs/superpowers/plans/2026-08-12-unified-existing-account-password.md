# Unified Existing Account Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit maintenance command that resets every existing account to `12345678` without storing plaintext passwords.

**Architecture:** A dependency-injected reset routine retrieves all current user IDs, creates one bcrypt hash, and updates every user while incrementing `auth_version`. A thin CLI script binds it to MySQL and logs only the count.

**Tech Stack:** TypeScript, bcryptjs, mysql2/promise, tsx, Vitest.

## Global Constraints

- Scope includes all existing MySQL `users` rows, including `xixi@163.com` and `xtgly@163.com`.
- Password is exactly `12345678` and persists only as a bcrypt hash.
- The explicit command, rather than application startup or migrations, changes passwords.
- Increment `auth_version` for every updated account.

---

### Task 1: Implement And Test The Reset Routine

**Files:**
- Create: `src/server/reset-existing-user-passwords.ts`
- Create: `tests/reset-existing-user-passwords.spec.ts`

**Interface:** Export `resetExistingUserPasswords(dependencies, password): Promise<number>`. `dependencies` supplies `listUserIds`, `hashPassword`, and `updateUserPassword`.

- [ ] Write a test with IDs `u1` and `u2`, asserting one `hashPassword('12345678')` call, an update call for each ID with the returned hash, and return value `2`.
- [ ] Run `npm test -- tests/reset-existing-user-passwords.spec.ts`; it must fail because the function does not yet exist.
- [ ] Implement the function. It reads IDs, returns `0` immediately for an empty list, hashes the password once, updates all IDs, and returns the ID count.
- [ ] Add an empty-list test that asserts neither hashing nor updating occurs.
- [ ] Run `npm test -- tests/reset-existing-user-passwords.spec.ts`; it must pass.
- [ ] Commit `src/server/reset-existing-user-passwords.ts` and `tests/reset-existing-user-passwords.spec.ts` with message `feat: add existing user password reset routine`.

### Task 2: Add The Explicit Database Command

**Files:**
- Create: `scripts/reset-existing-user-passwords.ts`
- Modify: `package.json`

**Interface:** Add `npm run reset:existing-user-passwords`; it prints `Updated N existing user accounts.` and no credential material.

- [ ] Write the CLI adapter using `pool.query('SELECT id FROM users')`, `bcrypt.hash(password, 12)`, and `pool.execute('UPDATE users SET password_hash=?,auth_version=auth_version+1 WHERE id=?', [passwordHash, id])`.
- [ ] Use `12345678` as the fixed local/demo password and call `pool.end()` in `finally`.
- [ ] Add package script `"reset:existing-user-passwords": "tsx scripts/reset-existing-user-passwords.ts"`.
- [ ] Run `npm test -- tests/reset-existing-user-passwords.spec.ts` and `npm run build`; both must pass.
- [ ] Run `npm run reset:existing-user-passwords`; verify output reveals only the updated count and no password/hash.
- [ ] Commit the script, `package.json`, routine, and test with message `feat: add existing user password reset command`.
