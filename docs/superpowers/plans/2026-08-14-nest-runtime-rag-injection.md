# Nest Runtime RAG Injection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `AppService` receive its configured AI, cache, analysis-runner, and RAG services when NestJS runs through `tsx`.

**Architecture:** Preserve the current provider registrations in `AppModule`. Replace implicit `AppService` constructor injection with explicit Nest tokens, matching the established `AnalysisRunner` pattern. Add a narrowly scoped regression test that detects the previously missing runtime dependency.

**Tech Stack:** TypeScript, NestJS 11, Vitest 2, tsx.

## Global Constraints

- Do not change REST routes, database schema, authorization, model prompts, vector payloads, or frontend behavior.
- Retain constructor defaults so existing direct unit-test construction remains valid.
- Run the focused test before and after the production change, then run the full test suite and type check.

---

### Task 1: Cover Explicit RAG Injection

**Files:**
- Modify: `tests/rag-project-sync.spec.ts`
- Modify: `src/server/app.service.ts:1-31`

**Interfaces:**
- Consumes: `AppService`, `RagIndexService`, Nest `@Inject`.
- Produces: an `AppService` constructor whose `RagIndexService` dependency can be resolved by Nest at runtime.

- [ ] **Step 1: Write the failing test**

Add a test that inspects the constructor parameter injection metadata for parameter 3 and expects its token to equal `RagIndexService`:

```ts
import 'reflect-metadata'
import { SELF_DECLARED_DEPS_METADATA } from '@nestjs/common/constants'

it('declares the RAG service as an explicit Nest dependency', () => {
  const dependencies = Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, AppService) ?? []
  expect(dependencies).toContainEqual({ index: 3, param: RagIndexService })
})
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npx vitest run tests/rag-project-sync.spec.ts`

Expected: FAIL because `AppService` has no self-declared RAG dependency metadata.

- [ ] **Step 3: Implement the minimal explicit injection**

Import `Inject` from `@nestjs/common` and add `@Inject(...)` to each `AppService` constructor dependency:

```ts
constructor(
  @Inject(DeepSeekService) private readonly deepseek: DeepSeekService,
  @Inject(RedisCacheService) private readonly cache: RedisCacheService = new RedisCacheService(),
  @Inject(AnalysisRunner) private readonly analysisRunner: AnalysisRunner = new AnalysisRunner(deepseek),
  @Inject(RagIndexService) private readonly ragIndex?: RagIndexService,
) {}
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npx vitest run tests/rag-project-sync.spec.ts`

Expected: PASS, including the new explicit-token assertion.

- [ ] **Step 5: Run regression verification**

Run: `npm test` and `npx vue-tsc --noEmit --incremental false`.

Expected: all tests and type checking pass.

### Task 2: Re-run the Real Acceptance Flow

**Files:**
- No production file changes.

**Interfaces:**
- Consumes: local MySQL, DeepSeek, SiliconFlow, Qdrant, current Nest API.
- Produces: a cleaned, evidence-backed acceptance result for `manual`, `llm`, `rag`, and `agent` modes.

- [ ] **Step 1: Verify live dependency health**

Run API `/health` and Qdrant `/healthz`; verify `.env` contains non-placeholder DeepSeek, SiliconFlow, embedding-model, and Qdrant settings without printing secrets.

- [ ] **Step 2: Create isolated demonstration data**

Create a UUID-prefixed manager, project, and two meeting versions. Use only the `acceptance-demo-*` prefix and record the generated project ID for cleanup.

- [ ] **Step 3: Execute the four analysis modes**

Run `manual`, `llm`, `rag`, and `agent` against the current meeting. Synchronize the historical meeting into Qdrant before RAG analysis, then record mode, status, task count, risk count, decision count, and model-call count.

- [ ] **Step 4: Execute human-review and business closure**

Approve the agent analysis, verify generated tasks and risks, update one generated task to 50 percent, retrieve the experiment summary, and verify project soft-delete then restore.

- [ ] **Step 5: Clean all demonstration state**

Delete Qdrant points filtered by the exact project ID. Delete only the exact MySQL project, meetings, versions, analyses, tasks, risks, notifications, audit rows, memberships, and manager account created in Step 2. Report cleanup success.
