# PRD 阻塞项闭环实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐 PRD 中尚未达到全量验收的异步分析、四种 AI 模式、检索增强、实验评测、CSV 导出和甘特视图，并保持无外部服务时的透明降级。

**Architecture:** 在现有 NestJS `AppService` 外增加分析运行器、检索适配器、队列适配器和实验服务；MySQL 持久化作业与实验数据。前端继续使用 Vue 组件和现有 workspace/meeting service，通过 API 获取异步状态、实验数据和导出地址；任务看板增加原生 SVG 甘特视图。

**Tech Stack:** Vue 3、NestJS 11、MySQL 8、TypeScript、Vitest、BullMQ、ioredis、DeepSeek HTTP API、可选 Qdrant HTTP API。

## Global Constraints

- Redis/BullMQ 未配置时必须使用 `inline` 执行器，并在结果中暴露 `execution: inline`。
- 所有 AI 和实验输入只能使用会议当前版本的脱敏文本，原始正文不得发送给外部服务或导出。
- 所有新写接口必须通过 DTO、现有角色权限和审计日志。
- 不实现伪造的 BGE-M3/BGE Reranker 推理；检索器必须返回实际使用的 `mysql` 或 `qdrant` 类型。
- 每个任务先写失败测试并确认失败，再实现最小代码，最后运行该任务的定向测试和全量回归。
- 现有 32 个测试文件、88 项测试以及两个 MySQL 冒烟脚本必须保持通过。

---

### Task 1: 添加异步分析数据模型和可插拔队列

**Files:**
- Modify: `src/server/migrate.ts`
- Create: `src/server/analysis-queue.ts`
- Create: `src/server/analysis-worker.ts`
- Modify: `src/server/app.module.ts`
- Modify: `src/server/app.service.ts`
- Modify: `src/server/app.controller.ts`
- Modify: `src/server/dtos.ts`
- Modify: `package.json`
- Create: `tests/analysis-queue.spec.ts`
- Create: `tests/analysis-job-status.spec.ts`

**Interfaces:**
- `AnalysisJobQueue.enqueue(input: AnalysisJobInput): Promise<AnalysisJobHandle>`
- `AnalysisJobQueue.get(jobId: string): Promise<AnalysisJobStatus | null>`
- `InlineAnalysisJobQueue` and `BullMqAnalysisJobQueue` share the interface.
- `POST /api/meetings/:id/analyze` accepts `{ mode: 'manual'|'llm'|'rag'|'agent' }` and returns `{ analysisId, jobId, execution }`.
- `GET /api/analyses/:id/job` returns `{ id, analysisId, execution, status, attempts, errorMessage, startedAt, finishedAt }`.

- [ ] **Step 1: Write failing queue tests**

  Add tests asserting inline enqueue returns `execution === 'inline'`, transitions `queued -> running -> succeeded`, and failed handlers record an error. Add a test asserting invalid analysis mode is rejected by the DTO.

- [ ] **Step 2: Run queue tests and verify the expected failure**

  Run `npx vitest run tests/analysis-queue.spec.ts tests/analysis-job-status.spec.ts`; expected failure is missing queue classes/endpoints.

- [ ] **Step 3: Add migration and dependencies**

  Add `analysis_jobs` with `id`, `analysis_id`, `execution`, `status`, `attempts`, `error_message`, timestamps and indexes. Add `bullmq` and `ioredis` dependencies. Keep the existing `ai_analyses` table and extend its status to include `queued` and `running` through a guarded migration.

- [ ] **Step 4: Implement inline and BullMQ adapters**

  Implement `InlineAnalysisJobQueue` with an injectable handler. Implement `BullMqAnalysisJobQueue` using `Queue`, `Worker`, `attempts: 3`, exponential backoff and a 120-second job timeout. Select BullMQ only when `REDIS_URL` is present; otherwise select inline and expose the execution mode.

- [ ] **Step 5: Integrate analysis creation and status lookup**

  Change `AppService.analyzeMeeting` to create a queued analysis and job using the current desensitized version. Add `analysisJobStatus` with project authorization. Do not return a failed promise as a successful analysis; persist the failure and return the job handle.

- [ ] **Step 6: Run targeted and existing tests**

  Run `npx vitest run tests/analysis-queue.spec.ts tests/analysis-job-status.spec.ts tests/meeting-workflow.spec.ts tests/meeting-analysis.spec.ts` and then `npm test`.

- [ ] **Step 7: Commit**

  `git add package.json package-lock.json src/server/migrate.ts src/server/analysis-queue.ts src/server/analysis-worker.ts src/server/app.module.ts src/server/app.service.ts src/server/app.controller.ts src/server/dtos.ts tests/analysis-queue.spec.ts tests/analysis-job-status.spec.ts && git commit -m "feat: add queued analysis execution"`

### Task 2: Implement four analysis modes and retrieval adapters

**Files:**
- Create: `src/server/retrieval.ts`
- Create: `src/server/analysis-runner.ts`
- Modify: `src/server/deepseek.service.ts`
- Modify: `src/server/analysis-worker.ts`
- Modify: `src/server/migrate.ts`
- Create: `tests/analysis-runner.spec.ts`
- Create: `tests/retrieval.spec.ts`
- Create: `scripts/smoke-real-deepseek.ts`

**Interfaces:**
- `RetrievalContextProvider.search(projectId: string, content: string): Promise<RetrievalHit[]>`
- `AnalysisRunner.run(input: AnalysisRunnerInput): Promise<{ result: MeetingAnalysis; metadata: AnalysisExecutionMetadata }>`
- `AnalysisExecutionMetadata` includes `mode`, `retriever`, `hitCount`, `model`, `durationMs`.

- [ ] **Step 1: Write failing runner/retrieval tests**

  Test `manual` returns an empty normalized result without calling DeepSeek, `llm` delegates once, `rag` includes retrieved context, `agent` performs a planning call plus extraction call, and MySQL retrieval limits results to five. Test Qdrant is only selected when `QDRANT_URL` is set.

- [ ] **Step 2: Run tests and verify failure**

  Run `npx vitest run tests/analysis-runner.spec.ts tests/retrieval.spec.ts`; expected failure is missing interfaces/implementations.

- [ ] **Step 3: Implement retrieval adapters**

  Implement MySQL keyword retrieval over approved analyses and formal tasks scoped to the project. Implement Qdrant HTTP adapter with explicit configuration checks and a typed connection error; never silently return fabricated hits.

- [ ] **Step 4: Implement `AnalysisRunner`**

  Reuse `normalizeAnalysis`. `manual` returns `{ summary: 'Manual review required', decisions: [], tasks: [], risks: [] }`; `llm` calls DeepSeek once; `rag` appends retrieved snippets to a single prompt; `agent` uses a bounded planning prompt followed by a bounded extraction prompt. Persist metadata JSON on `ai_analyses`.

- [ ] **Step 5: Wire worker and reanalysis**

  Make queued worker calls use the runner. Make rejected-analysis reanalysis accept a mode and enqueue through the same path. Ensure only `pending` analyses can be reviewed.

- [ ] **Step 6: Add real API smoke script**

  `scripts/smoke-real-deepseek.ts` checks `DEEPSEEK_API_KEY`; if absent, prints `SKIPPED: DEEPSEEK_API_KEY is not configured` and exits 0. If present, calls the configured endpoint with a sanitized sample and validates normalized output.

- [ ] **Step 7: Verify and commit**

  Run targeted tests, `npx tsx scripts/smoke-real-deepseek.ts`, `npm test`, then commit with `feat: add pluggable analysis modes and retrieval`.

### Task 3: Add experiment center persistence, metrics and CSV export

**Files:**
- Modify: `src/server/migrate.ts`
- Create: `src/server/experiment.service.ts`
- Modify: `src/server/app.module.ts`
- Modify: `src/server/app.controller.ts`
- Modify: `src/server/dtos.ts`
- Create: `src/server/csv.ts`
- Modify: `src/services/workspaceService.ts`
- Modify: `src/App.vue`
- Create: `tests/experiment-metrics.spec.ts`
- Create: `tests/csv-export.spec.ts`

**Interfaces:**
- `POST /api/experiments` with `{ projectId, name, modes, meetingIds }`.
- `POST /api/experiments/:id/run` starts all selected modes over the selected sanitized meetings.
- `GET /api/experiments`, `GET /api/experiments/:id`, and `GET /api/experiments/:id/export.csv`.
- `toCsv(rows: Record<string, unknown>[]): string` always returns UTF-8 BOM and escaped cells.

- [ ] **Step 1: Write failing metric/CSV tests**

  Test precision, correction rate, success rate and null accuracy when no reviewed baseline exists. Test CSV quoting for commas, quotes, newlines and BOM.

- [ ] **Step 2: Run tests and verify failure**

  Run `npx vitest run tests/experiment-metrics.spec.ts tests/csv-export.spec.ts`; expected failure is missing services.

- [ ] **Step 3: Add experiment tables and service**

  Add `experiment_runs`, `experiment_samples`, and `experiment_results`. Enforce project visibility in every query. Run each sample through `AnalysisRunner`, save status, output, metadata and metrics, and compute accuracy only against approved review data.

- [ ] **Step 4: Add exports**

  Add task/project/risk CSV methods and experiment CSV endpoint. Include only desensitized fields for meeting-derived data. Set `Content-Type: text/csv; charset=utf-8` and `Content-Disposition: attachment`.

- [ ] **Step 5: Replace experiment placeholder UI**

  Add mode selection, experiment creation, run action, result cards and CSV download to the existing `/experiments` branch in `src/App.vue`. Show executor/retriever labels and a clear “accuracy unavailable” state when baseline data is missing.

- [ ] **Step 6: Verify and commit**

  Run targeted tests, `npm test`, and commit with `feat: add experiment metrics and exports`.

### Task 4: Add SVG Gantt view and final acceptance coverage

**Files:**
- Modify: `src/components/TaskBoardPage.vue`
- Modify: `src/style.css`
- Create: `src/utils/gantt.ts`
- Create: `tests/gantt.spec.ts`
- Modify: `tests/task-board-ui.spec.ts`
- Create: `scripts/smoke-prd-blockers.ts`
- Modify: `README.md`

**Interfaces:**
- `buildGanttLayout(tasks, today): { startDate, endDate, days, rows, unscheduledCount }`.
- `rows` include task id, x, width, y, status and owner; tasks without valid dates are excluded from bars and counted as unscheduled.

- [ ] **Step 1: Write failing Gantt tests**

  Test date range includes all valid task dates and today, completed tasks have full-width bars, reversed/missing dates are unscheduled, and the output is stable for an empty list.

- [ ] **Step 2: Run tests and verify failure**

  Run `npx vitest run tests/gantt.spec.ts`; expected failure is missing utility.

- [ ] **Step 3: Implement layout utility and SVG view**

  Add table/kanban/gantt switch, date header, today line, task bars, status legend and unscheduled count. Reuse existing filters and authorization; do not create a second task data source.

- [ ] **Step 4: Add blocker smoke script**

  `scripts/smoke-prd-blockers.ts` runs migration, creates temporary manager/member/project/meeting, verifies inline analysis mode, job status, retrieval metadata, experiment run, CSV header and Gantt-compatible task dates, then cleans all UUID-scoped rows. If Redis is configured, it additionally asserts BullMQ executor selection.

- [ ] **Step 5: Update runbook**

  Document `REDIS_URL`, `QDRANT_URL`, DeepSeek settings, `npm run server`, `npm run dev`, real DeepSeek smoke, blocker smoke and external-service skip semantics in `README.md`.

- [ ] **Step 6: Final verification**

  Run `npm test`, `npm run build`, `npx tsx scripts/smoke-core-workflow.ts`, `npm run smoke:project-core-closure`, `npx tsx scripts/smoke-prd-blockers.ts`, and `npx tsx scripts/smoke-real-deepseek.ts`. Report external-service checks separately from local checks.

- [ ] **Step 7: Commit**

  `git add src/components/TaskBoardPage.vue src/style.css src/utils/gantt.ts tests/gantt.spec.ts tests/task-board-ui.spec.ts scripts/smoke-prd-blockers.ts README.md && git commit -m "feat: close PRD acceptance blockers"`

## Plan self-review

- Spec coverage: async execution (Task 1), four modes/retrieval/DeepSeek (Task 2), experiments/metrics/exports (Task 3), Gantt/final acceptance/runbook (Task 4).
- Placeholder scan: no `TODO`, `TBD`, or “implement later” instructions; every task names concrete files, interfaces and commands.
- Type consistency: `AnalysisRunner` metadata is consumed by queue worker and experiment service; `toCsv` is shared by all export endpoints; `buildGanttLayout` is consumed only by `TaskBoardPage` and its unit test.
