# Administrator Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide administrator-only external AI service configuration, constrained data maintenance, and sanitized full JSON data export.

**Architecture:** Add a singleton `external_service_settings` table and cryptographic helper functions for API-key storage. Keep all administrator operations in `AppService`, with DTO-validated controller endpoints and audit records. Extend the existing administrator settings page through `authService` so the browser never receives service secrets.

**Tech Stack:** Vue 3, TypeScript, NestJS, MySQL 8, Node.js crypto, class-validator, Vitest.

## Global Constraints

- All new APIs must authorize with `AppService.assertAdmin` before accessing business data.
- API keys must use AES-256-GCM with `SERVICE_CONFIG_ENCRYPTION_KEY`; no plaintext fallback is permitted.
- JSON exports must exclude password hashes, authentication versions, API keys, ciphertext, IVs, and authentication tags.
- Cleanup actions are limited to `deleted_projects`, `read_notifications`, and `audit_logs`, require retention days from 1 through 3650, and write audit records.
- Preserve current unrelated working-tree changes.

---

### Task 1: Persist and Safely Expose External Service Settings

**Files:**
- Modify: `src/server/migrate.ts`, `src/server/dtos.ts`, `src/server/app.controller.ts`, `src/server/app.service.ts`, `src/server/deepseek.service.ts`
- Create: `src/server/service-config-crypto.ts`, `tests/admin-external-service.spec.ts`

**Interfaces:**
- Produces `AppService.getExternalServiceSettings(user)` returning `{ baseUrl: string; model: string; apiKeyConfigured: boolean; apiKeyMasked: string | null }`.
- Produces `AppService.updateExternalServiceSettings(user, input)` accepting `{ baseUrl: string; model: string; apiKey?: string }`.
- Produces `AppService.resolveExternalServiceSettings()` for `DeepSeekService.analyze` to retrieve the configured or environment fallback secret server-side.

- [ ] **Step 1: Write failing service tests** in `tests/admin-external-service.spec.ts` asserting a manager is rejected, an administrator's key is saved as ciphertext and returned only as a mask, and a missing `SERVICE_CONFIG_ENCRYPTION_KEY` rejects an API-key update.

```ts
await expect(service.updateExternalServiceSettings(manager, input)).rejects.toThrow('Administrator access required')
await service.updateExternalServiceSettings(admin, { ...input, apiKey: 'sk-secret-1234' })
expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('external_service_settings'), expect.arrayContaining([expect.not.stringContaining('sk-secret-1234')]))
await expect(service.getExternalServiceSettings(admin)).resolves.toMatchObject({ apiKeyConfigured: true, apiKeyMasked: '****1234' })
```

- [ ] **Step 2: Run the focused test and verify RED.**

Run: `npm test -- --run tests/admin-external-service.spec.ts`

Expected: failure because `updateExternalServiceSettings` and `getExternalServiceSettings` do not exist.

- [ ] **Step 3: Add schema, crypto helper, DTOs, and service methods.** Create `external_service_settings` with `base_url`, `model`, `api_key_ciphertext`, `api_key_iv`, and `api_key_tag`; insert singleton id 1 in migration. Implement AES-256-GCM encryption/decryption from a 32-byte hex key and throw `BadRequestException` when a key save lacks the environment key. Add protected `GET`/`PATCH /api/admin/external-service` controller methods. Have `DeepSeekService` call `resolveExternalServiceSettings` through its injected `AppService` and retain current environment values only when database configuration is absent.

```ts
const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv)
const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()])
return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') }
```

- [ ] **Step 4: Run the focused test and verify GREEN.**

Run: `npm test -- --run tests/admin-external-service.spec.ts`

Expected: all external-service authorization, masking, encryption, and audit assertions pass.

- [ ] **Step 5: Commit the isolated feature.**

```powershell
git add src/server/migrate.ts src/server/dtos.ts src/server/app.controller.ts src/server/app.service.ts src/server/deepseek.service.ts src/server/service-config-crypto.ts tests/admin-external-service.spec.ts
git commit -m "feat: add secure external service configuration"
```

### Task 2: Add Administrator Data Maintenance

**Files:**
- Modify: `src/server/dtos.ts`, `src/server/app.controller.ts`, `src/server/app.service.ts`
- Create: `tests/admin-data-maintenance.spec.ts`

**Interfaces:**
- Produces `AppService.getDataMaintenanceSummary(user)` returning named row counts.
- Produces `AppService.cleanupSystemData(user, { target, retentionDays })` returning `{ target, deleted }`.

- [ ] **Step 1: Write failing tests** for summary authorization, invalid cleanup targets/retention days, and each accepted cleanup target issuing a constrained database operation followed by an audit record.

```ts
await expect(service.getDataMaintenanceSummary(manager)).rejects.toThrow('Administrator access required')
await expect(service.cleanupSystemData(admin, { target: 'users' as any, retentionDays: 30 })).rejects.toThrow('Invalid cleanup target')
await expect(service.cleanupSystemData(admin, { target: 'audit_logs', retentionDays: 0 })).rejects.toThrow('Retention days must be between 1 and 3650')
await expect(service.cleanupSystemData(admin, { target: 'read_notifications', retentionDays: 30 })).resolves.toMatchObject({ target: 'read_notifications' })
```

- [ ] **Step 2: Run the focused test and verify RED.**

Run: `npm test -- --run tests/admin-data-maintenance.spec.ts`

Expected: failure because summary and cleanup methods do not exist.

- [ ] **Step 3: Implement constrained summary and cleanup methods plus controller routes.** Count approved operational tables with fixed SQL. Clean `read_notifications` and `audit_logs` only when their timestamp is older than `retentionDays`; permanently delete soft-deleted projects older than the retention date and let established foreign-key cascades clean dependent rows. Read affected-row count from the MySQL result, then audit `system_data.cleaned` without logging source records. Add protected `GET /api/admin/data-maintenance` and `POST /api/admin/data-maintenance/cleanup`.

```ts
const cutoff = new Date(Date.now() - input.retentionDays * 86_400_000)
const [result] = await pool.execute('DELETE FROM notifications WHERE is_read=TRUE AND created_at < ?', [cutoff])
await this.audit(user.id, 'system_data.cleaned', 'system_data', input.target, { target: input.target, retentionDays: input.retentionDays, deleted: result.affectedRows })
```

- [ ] **Step 4: Run the focused test and verify GREEN.**

Run: `npm test -- --run tests/admin-data-maintenance.spec.ts`

Expected: authorization, validation, cleanup selection, and audit assertions pass.

- [ ] **Step 5: Commit the isolated feature.**

```powershell
git add src/server/dtos.ts src/server/app.controller.ts src/server/app.service.ts tests/admin-data-maintenance.spec.ts
git commit -m "feat: add administrator data maintenance"
```

### Task 3: Add Sanitized Full Data Export

**Files:**
- Modify: `src/server/app.controller.ts`, `src/server/app.service.ts`
- Create: `tests/admin-data-export.spec.ts`

**Interfaces:**
- Produces `AppService.exportSystemData(user)` returning `{ exportedAt, schemaVersion, users, projects, tasks, meetings, analyses, risks, auditLogs }`.

- [ ] **Step 1: Write a failing export test** that rejects a non-administrator, returns all required collections, removes sensitive user fields, and records an export audit event.

```ts
await expect(service.exportSystemData(manager)).rejects.toThrow('Administrator access required')
await expect(service.exportSystemData(admin)).resolves.toMatchObject({ schemaVersion: 1, users: [expect.not.objectContaining({ password_hash: expect.anything(), auth_version: expect.anything() })], projects: expect.any(Array), tasks: expect.any(Array), meetings: expect.any(Array), analyses: expect.any(Array), risks: expect.any(Array), auditLogs: expect.any(Array) })
expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_logs'), expect.arrayContaining(['admin-1', 'system_data.exported', 'system_export']))
```

- [ ] **Step 2: Run the focused test and verify RED.**

Run: `npm test -- --run tests/admin-data-export.spec.ts`

Expected: failure because `exportSystemData` does not exist.

- [ ] **Step 3: Implement export assembly and route.** Issue fixed `SELECT` queries for the documented collections, select explicit safe columns from `users`, and return a versioned object with an ISO export timestamp. Add protected `GET /api/admin/export`, setting attachment headers only after the service has produced the sanitized payload. Audit export counts, never the payload.

```ts
const [users] = await pool.query('SELECT id,role,name,email,is_active,created_at FROM users ORDER BY created_at ASC')
await this.audit(user.id, 'system_data.exported', 'system_export', 'full', { users: users.length, projects: projects.length })
return { schemaVersion: 1, exportedAt: new Date().toISOString(), users, projects, tasks, meetings, analyses, risks, auditLogs }
```

- [ ] **Step 4: Run the focused test and verify GREEN.**

Run: `npm test -- --run tests/admin-data-export.spec.ts`

Expected: all export authorization, sanitization, and audit assertions pass.

- [ ] **Step 5: Commit the isolated feature.**

```powershell
git add src/server/app.controller.ts src/server/app.service.ts tests/admin-data-export.spec.ts
git commit -m "feat: add administrator data export"
```

### Task 4: Connect the Administrator Settings UI

**Files:**
- Modify: `src/services/authService.ts`, `src/App.vue`, `src/style.css`, `tests/auth-service.spec.ts`

**Interfaces:**
- Produces client methods `getExternalServiceSettings`, `updateExternalServiceSettings`, `getDataMaintenanceSummary`, `cleanupSystemData`, and `exportSystemData`.
- Uses the server interfaces from Tasks 1 through 3.

- [ ] **Step 1: Write failing client tests** in `tests/auth-service.spec.ts` proving each method sends the administrator authorization header and expected HTTP method/path.

```ts
await service.getExternalServiceSettings('token-1')
await service.cleanupSystemData('token-1', { target: 'audit_logs', retentionDays: 90 })
await service.exportSystemData('token-1')
expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/admin/external-service'), expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token-1' }) }))
expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/admin/data-maintenance/cleanup'), expect.objectContaining({ method: 'POST' }))
```

- [ ] **Step 2: Run the focused test and verify RED.**

Run: `npm test -- --run tests/auth-service.spec.ts`

Expected: failure because the new client methods do not exist.

- [ ] **Step 3: Implement client methods and settings page sections.** Add typed response interfaces to `authService`, then change the settings navigation to reactive tabs. Load external-service metadata and data-maintenance counts for administrators. Keep the service-key form input blank after loading; on save, omit `apiKey` if blank. Render cleanup target actions with a retention-days number input and `window.confirm` before calling the API. Render an export action that creates a JSON Blob, triggers a download named `system-export-YYYY-MM-DD.json`, then revokes the object URL. Surface all failures using the established `flash` helper.

```ts
const exportData = await auth.exportSystemData(props.token)
const url = URL.createObjectURL(new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' }))
const anchor = Object.assign(document.createElement('a'), { href: url, download: `system-export-${localIsoDate(new Date())}.json` })
anchor.click()
URL.revokeObjectURL(url)
```

- [ ] **Step 4: Run focused tests and verify GREEN.**

Run: `npm test -- --run tests/auth-service.spec.ts tests/admin-external-service.spec.ts tests/admin-data-maintenance.spec.ts tests/admin-data-export.spec.ts`

Expected: all administrator service and client tests pass.

- [ ] **Step 5: Run full verification.**

Run: `npm test; npm run build`

Expected: all tests and Vue production build pass.

- [ ] **Step 6: Review and commit the UI integration.** Confirm no UI path renders service API-key plaintext and no non-admin route can reach an operation. Then run:

```powershell
git add src/services/authService.ts src/App.vue src/style.css tests/auth-service.spec.ts
git commit -m "feat: add administrator operations settings"
```
