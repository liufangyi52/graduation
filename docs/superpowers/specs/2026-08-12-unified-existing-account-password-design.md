# Existing Account Test Password Design

## Goal

Set a single development-only login password, `12345678`, for every account that already exists in the MySQL `users` table. This includes the known accounts `xixi@163.com` and `xtgly@163.com`, plus any other existing users.

## Approach

Add an idempotent maintenance script that:

1. Connects through the application's existing database configuration.
2. Loads every row from `users` without selecting or exposing `password_hash`.
3. Hashes `12345678` with the existing `bcryptjs` dependency and cost factor of 12.
4. Updates every user's `password_hash` and increments `auth_version`, invalidating any previously issued sessions.
5. Prints only the number of updated accounts, never passwords or password hashes.

The script will be explicitly invoked through an npm command. Application startup and normal database migration will not reset passwords.

## Data And Security

The `users.password_hash` column remains the sole password storage field. No plaintext password column, export, or API response will be added. The shared password is restricted to the local development/demo workflow and should be replaced before deployment.

## Verification

Add a focused test for the reset routine using mocked database and bcrypt dependencies. Verify that every existing user is updated, `auth_version` changes, and output contains only the updated count. Run the focused test suite and TypeScript/build verification appropriate to the changed script.
