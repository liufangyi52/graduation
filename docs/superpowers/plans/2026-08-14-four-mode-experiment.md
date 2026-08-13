# Four-Mode Experiment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four server-enforced AI analysis modes and durable experiment records, summaries, and UI without representing the RAG baseline as real retrieval.

**Architecture:** `AnalysisRunner` owns mode behavior. `AppService` authorizes, supplies desensitized content, persists results and aggregates summary metrics. The Vue app reuses its meeting, review, and experiment-center routes.

**Tech Stack:** Vue 3, TypeScript, NestJS, MySQL/mysql2, Vitest, class-validator, DeepSeek Chat Completions API.

## Global Constraints

- Modes are exactly `manual`, `llm`, `rag`, and `agent`; omitted API mode defaults to `llm`.
- `manual` returns `{ summary: 'Manual review required', decisions: [], tasks: [], risks: [] }` with zero model calls.
- `llm` has one model call; `rag` has one model call and persists `retrievalEnabled=false`, `retrievalStatus=not_configured`; `agent` has two calls, plan then structured extraction.
- Only desensitized meeting text can reach the runner/provider. Never store original content, API keys, or prompts in metadata or audit data.
- No vector database, embedding, queue, worker, plugin, or automatic quality-score dependency belongs in this change.
- Existing null mode values read as `llm`; only `pending` records remain reviewable; manager authorization applies to business operations and summaries.

---

### Task 1: Implement The Mode Runner

**Files:**
- Create: `src/server/analysis-runner.ts`
- Create: `tests/analysis-runner.spec.ts`
- Modify: `src/server/deepseek.service.ts`
- Modify: `src/server/app.module.ts`

**Interfaces:**
- `type AnalysisMode = 'manual' | 'llm' | 'rag' | 'agent'`
- `type AnalysisExecutionMetadata = { mode: AnalysisMode; model: string | null; modelCallCount: number; retrievalEnabled: boolean; retrievalStatus: 'not_applicable' | 'not_configured'; plan?: string }`
- `AnalysisRunner.run({ mode, title, desensitizedContent }): Promise<{ result: MeetingAnalysis; metadata: AnalysisExecutionMetadata }>`
- `DeepSeekService.analyzeWithPlan(title, content, plan?)` and `DeepSeekService.plan(title, content)`

- [ ] **Step 1: Write failing runner tests**

Create `tests/analysis-runner.spec.ts` with fake provider methods. Assert `manual` does not call either method and returns the required manual draft. Assert `llm` calls `analyzeWithPlan(title, '[PHONE]', undefined)` once. Assert `rag` makes the same single call and returns `{ retrievalEnabled: false, retrievalStatus: 'not_configured', modelCallCount: 1 }`. Assert `agent` calls `plan(title, '[PHONE]')`, then `analyzeWithPlan(title, '[PHONE]', plan)`, and returns model-call count `2` plus the plan.

- [ ] **Step 2: Verify the test fails**

Run: `npx vitest run tests/analysis-runner.spec.ts`

Expected: FAIL because `AnalysisRunner` does not exist.

- [ ] **Step 3: Implement minimal production code**

Create the runner with exact branch behavior. Refactor `DeepSeekService.analyze()` to delegate to `analyzeWithPlan(title, content)`. Extract the existing HTTP request logic into one private method. For `plan`, request a short text plan and throw `ServiceUnavailableException` for missing or empty provider content. Only append a plan to the extraction input if a non-empty plan was supplied. Register the runner in `AppModule`.

- [ ] **Step 4: Verify runner behavior**

Run: `npx vitest run tests/analysis-runner.spec.ts tests/meeting-analysis.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add src/server/analysis-runner.ts src/server/deepseek.service.ts src/server/app.module.ts tests/analysis-runner.spec.ts; git commit -m "feat: add four-mode analysis runner"`

### Task 2: Persist Mode Executions And Add APIs

**Files:**
- Modify: `src/server/migrate.ts`
- Modify: `src/server/dtos.ts`
- Modify: `src/server/app.controller.ts`
- Modify: `src/server/app.service.ts`
- Create: `tests/analysis-experiment-service.spec.ts`

**Interfaces:**
- `class AnalysisRequestDto { mode?: AnalysisMode }`, validated with `@IsOptional()` and `@IsIn(['manual', 'llm', 'rag', 'agent'])`.
- `AppService.analyzeMeeting(user, meetingId, mode?: AnalysisMode)` and `reanalyzeRejectedAnalysis(user, analysisId, mode?: AnalysisMode)` use `AnalysisRunner`.
- `AppService.experimentSummary(user, projectId): Promise<Array<{ mode: AnalysisMode; runCount: number; pendingCount: number; failedCount: number; approvedCount: number; rejectedCount: number; totalDurationMs: number; averageDurationMs: number; totalModelCalls: number }>>`.
- `POST /meetings/:id/analyze`, `POST /analyses/:id/reanalyze` accept `AnalysisRequestDto`; `GET /projects/:id/experiment-summary` returns the manager-owned aggregate.

- [ ] **Step 1: Write failing persistence and privacy tests**

Create `tests/analysis-experiment-service.spec.ts`. Mock a meeting row containing `content: '13800138000'` and `desensitized_content: '[PHONE]'`; inject a runner and assert its input has only `[PHONE]`, while all `pool.execute` arguments and audit arguments exclude both content strings. Assert RAG output stores metadata with `retrievalStatus: 'not_configured'`, duration, and call count. Assert `manual` succeeds without provider use. Assert invalid DTO mode is rejected. Assert a manager can read a grouped aggregate for their project and a non-owner manager is rejected.

- [ ] **Step 2: Verify the test fails**

Run: `npx vitest run tests/analysis-experiment-service.spec.ts`

Expected: FAIL because request DTO, runner persistence, and summary method are absent.

- [ ] **Step 3: Add migration and controller contract**

Add idempotent `addColumnIfMissing` calls for `mode VARCHAR(20) NOT NULL DEFAULT 'llm'`, `execution_metadata JSON NULL`, `started_at DATETIME NULL`, `finished_at DATETIME NULL`, `duration_ms INT UNSIGNED NULL`, and `model_call_count TINYINT UNSIGNED NOT NULL DEFAULT 0`. Add the DTO, pass `body.mode ?? 'llm'` through both controller actions, and add the aggregate endpoint.

- [ ] **Step 4: Implement persistence and aggregation**

Inject `AnalysisRunner`. Both analysis paths must query only meeting title, project id, and current version `desensitized_content`; authorize before insert. Insert an analysis record with mode and `started_at`. On runner success, write normalized result, safe metadata, finish time, duration, model call count, and `pending` status. On failure, write `failed`, safe message, timing, and mode. Audit only `{ mode, modelCallCount, durationMs, retrievalStatus }`.

Implement one `ai_analyses JOIN meetings JOIN projects` aggregate, constrained to the specified project after manager ownership verification. Use `COALESCE` for numeric totals and map snake-case names to the documented camel-case response. In list/detail reads, map null/absent modes to `llm` and expose only safe metadata.

- [ ] **Step 5: Verify server behavior and regression paths**

Run: `npx vitest run tests/analysis-experiment-service.spec.ts tests/meeting-workflow.spec.ts tests/review-reanalysis.spec.ts tests/role-separation.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

Run: `git add src/server/migrate.ts src/server/dtos.ts src/server/app.controller.ts src/server/app.service.ts tests/analysis-experiment-service.spec.ts; git commit -m "feat: persist analysis experiment records"`

### Task 3: Select And Display Recorded Modes

**Files:**
- Modify: `src/services/meetingService.ts`
- Modify: `src/App.vue`
- Modify: `src/components/MeetingReviewPage.vue`
- Create: `tests/analysis-mode-ui.spec.ts`

**Interfaces:**
- Extend `AnalysisRecord` with `mode`, `executionMetadata`, `durationMs`, and `modelCallCount`.
- `createMeetingService.analyze(meetingId, mode?: AnalysisMode)` and `reanalyze(analysisId, mode?: AnalysisMode)` post `{ mode }`.

- [ ] **Step 1: Write failing UI contract tests**

Create `tests/analysis-mode-ui.spec.ts`. Mock `fetch`, call `analyze('meeting-1', 'agent')`, and assert it POSTs `JSON.stringify({ mode: 'agent' })`. Read `App.vue` and assert all four mode identifiers are present. Read `MeetingReviewPage.vue` and assert it contains `检索未配置` and a reanalysis mode selector.

- [ ] **Step 2: Verify the test fails**

Run: `npx vitest run tests/analysis-mode-ui.spec.ts`

Expected: FAIL because analysis requests omit their body and the UI has no mode controls.

- [ ] **Step 3: Implement client behavior**

Export shared client types. Map mode, `execution_metadata`, `duration_ms`, and `model_call_count` from server records, defaulting mode to `llm`. Add an accessible four-option select to meeting submission, defaulted to `llm`, and pass it to analysis. In the review list/detail, display recorded mode, model calls, duration, and retrieval status. Mark only records with `retrievalStatus === 'not_configured'` as `检索未配置`. Reanalysis of rejected records chooses and sends a mode. Approval rules remain status-based and unchanged.

- [ ] **Step 4: Verify client behavior**

Run: `npx vitest run tests/analysis-mode-ui.spec.ts tests/meeting-workflow.spec.ts tests/review-detail-ui.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add src/services/meetingService.ts src/App.vue src/components/MeetingReviewPage.vue tests/analysis-mode-ui.spec.ts; git commit -m "feat: select and display analysis modes"`

### Task 4: Implement Manager Experiment Summary And Final Verification

**Files:**
- Modify: `src/services/meetingService.ts`
- Modify: `src/App.vue`
- Modify: `README.md`
- Create: `tests/experiment-summary-ui.spec.ts`

**Interfaces:**
- `createMeetingService.experimentSummary(projectId)` calls `GET /projects/:id/experiment-summary`.
- The manager-only `/experiments` view shows all four modes with run, pending, failed, approved, rejected, average-duration, and total-call values.

- [ ] **Step 1: Write failing experiment-summary tests**

Create `tests/experiment-summary-ui.spec.ts`. Assert `experimentSummary('project-1')` uses `/projects/project-1/experiment-summary`. Assert `App.vue` contains `currentPage === 'experiments' && canManageBusiness`, `平均耗时`, `模型调用次数`, and a RAG baseline label that includes `检索未配置`.

- [ ] **Step 2: Verify the test fails**

Run: `npx vitest run tests/experiment-summary-ui.spec.ts`

Expected: FAIL because the client endpoint and experiment page are absent.

- [ ] **Step 3: Render the summary and document semantics**

Add the client method. In `/experiments`, let a manager choose a project from `data.projects`, load its summary, and merge returned rows into a fixed four-mode list so zero-run modes remain visible. Use the existing table and metric patterns, no new navigation or dashboard framework. Members, administrators, and auditors must not render the data. Document the four modes, stored metrics, and no-retrieval RAG semantics in `README.md`.

- [ ] **Step 4: Run full verification**

Run: `npx vitest run tests/analysis-runner.spec.ts tests/analysis-experiment-service.spec.ts tests/analysis-mode-ui.spec.ts tests/experiment-summary-ui.spec.ts tests/meeting-analysis.spec.ts tests/meeting-workflow.spec.ts tests/review-reanalysis.spec.ts tests/role-separation.spec.ts`

Expected: PASS.

Run: `npm test`

Expected: all test files pass with zero failures.

Run: `npm run build`

Expected: Vue TypeScript check and Vite production build exit with code 0.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 5: Commit**

Run: `git add src/services/meetingService.ts src/App.vue README.md tests/experiment-summary-ui.spec.ts; git commit -m "feat: add experiment mode summary"`
