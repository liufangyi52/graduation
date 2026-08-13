# 异步分析与 AI 模式实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为会议纪要分析提供可追踪的异步执行，以及 `manual`、`llm`、`rag`、`agent` 四种可审计运行模式。

**Architecture:** 保留 `AppService` 负责会议、权限和审核业务，在其外注入 `AnalysisJobQueue`、`AnalysisRunner` 与 `RetrievalContextProvider`。分析请求先写入 `ai_analyses` 和 `analysis_jobs`，由内联或 BullMQ 队列调用 runner；runner 仅消费当前会议版本的脱敏文本并持久化结果与元数据。前端服务把模式和作业状态暴露给现有会议、复核队列页面。

**Tech Stack:** Vue 3、NestJS 11、TypeScript、MySQL 8、BullMQ、ioredis、Vitest、DeepSeek HTTP API、可选 Qdrant HTTP API。

## Global Constraints

- 未设置 `REDIS_URL` 时，必须使用 `InlineAnalysisJobQueue` 并在响应中返回 `execution: 'inline'`。
- 设置 `REDIS_URL` 时，BullMQ 作业必须为三次尝试、指数退避、120 秒超时，并将最终状态持久化。
- 所有 AI、RAG 与作业输入只能来自会议当前版本的 `desensitized_content`；不得把原始纪要正文发送给外部服务。
- `manual` 不调用 `DeepSeekService`；`llm` 调用一次；`rag` 调用一次且包含检索结果；`agent` 先规划再提取，调用两次。
- MySQL 检索限制为同一项目的批准分析和正式任务，最多五条；只有配置 `QDRANT_URL` 才可选 Qdrant，错误时不得虚构或静默回退。
- 新接口必须有 DTO 校验、既有项目权限校验和审计日志；审核只能处理 `pending` 分析。
- 每个生产行为先有失败测试并观察到预期失败，然后写最小实现，再运行定向与全量回归。
- 不实现实验中心、CSV/PDF/Excel 导出、甘特/效率图表或审计筛选，它们属于后续阶段。

---

### Task 1: 定义分析作业数据结构与内联队列

**Files:**
- Create: `src/server/analysis-queue.ts`
- Create: `tests/analysis-queue.spec.ts`
- Modify: `src/server/migrate.ts`
- Modify: `src/server/dtos.ts`
- Modify: `src/server/app.controller.ts`

**Interfaces:**
- Produces `AnalysisMode = 'manual' | 'llm' | 'rag' | 'agent'`。
- Produces `AnalysisJobInput { id: string; analysisId: string; projectId: string; meetingId: string; title: string; desensitizedContent: string; mode: AnalysisMode }`。
- Produces `AnalysisJobStatus { id: string; analysisId: string; execution: 'inline' | 'bullmq'; status: 'queued' | 'running' | 'succeeded' | 'failed'; attempts: number; errorMessage: string | null; startedAt: string | null; finishedAt: string | null }`。
- Produces `AnalysisJobQueue { enqueue(input: AnalysisJobInput): Promise<Pick<AnalysisJobStatus, 'id' | 'analysisId' | 'execution' | 'status'>>; get(jobId: string): Promise<AnalysisJobStatus | null> }`。
- Produces `InlineAnalysisJobQueue(handler)`，状态写入由 handler 的生命周期回调完成；其 `enqueue` 必须在返回前完成处理。

- [ ] **Step 1: 写入失败的内联队列测试**

在 `tests/analysis-queue.spec.ts` 以一个内存生命周期存储替身创建 `InlineAnalysisJobQueue`。断言成功处理顺序是 `queued -> running -> succeeded`，返回 `execution === 'inline'`，失败处理顺序以 `failed` 和原始错误消息结束；`get` 返回最后一次持久化状态。

```ts
it('persists an inline job from queued to succeeded', async () => {
  const events: string[] = []
  const queue = new InlineAnalysisJobQueue(async () => events.push('handled'), async (status) => events.push(status.status))
  const result = await queue.enqueue({ id: 'job-1', analysisId: 'analysis-1', projectId: 'project-1', meetingId: 'meeting-1', title: 'Minutes', desensitizedContent: 'safe', mode: 'manual' })
  expect(result).toMatchObject({ id: 'job-1', execution: 'inline', status: 'succeeded' })
  expect(events).toEqual(['queued', 'running', 'handled', 'succeeded'])
})
```

- [ ] **Step 2: 运行定向测试并确认失败原因正确**

Run: `npx vitest run tests/analysis-queue.spec.ts`

Expected: FAIL，原因是 `InlineAnalysisJobQueue` 与类型尚不存在，而不是测试环境或断言错误。

- [ ] **Step 3: 编写最小队列实现**

在 `analysis-queue.ts` 导出类型、接口与内联实现。内联实现先以 `queued` 写入、随后以 `running` 写入，调用注入的 handler；成功写 `succeeded`，捕获异常后写 `failed` 与 `error instanceof Error ? error.message : 'Analysis job failed'`，然后重新抛出。`get` 从生命周期存储读取，确保测试可验证持久化状态。

- [ ] **Step 4: 加入迁移与请求 DTO**

在 `migrate.ts` 创建 `analysis_jobs`：主键 `id`、唯一 `analysis_id`、`execution ENUM('inline','bullmq')`、`status ENUM('queued','running','succeeded','failed')`、`attempts`、`error_message`、`started_at`、`finished_at`、时间戳和 `(status, created_at)` 索引；为旧 `ai_analyses` 表通过受保护迁移增加 `execution_metadata JSON NULL`，并通过受保护 SQL 调整状态枚举以允许 `queued`、`running`。在 `dtos.ts` 增加 `AnalysisRequestDto`，使用 `@IsIn(['manual', 'llm', 'rag', 'agent']) mode`。

- [ ] **Step 5: 验证绿色并提交基础数据契约**

Run: `npx vitest run tests/analysis-queue.spec.ts`

Expected: PASS。

Run: `npx vue-tsc --noEmit --incremental false`

Expected: PASS。

```powershell
git add src/server/analysis-queue.ts src/server/migrate.ts src/server/dtos.ts tests/analysis-queue.spec.ts
git commit -m "feat: add analysis job contract"
```

### Task 2: 实现四种模式的运行器与检索适配器

**Files:**
- Create: `src/server/retrieval.ts`
- Create: `src/server/analysis-runner.ts`
- Create: `tests/retrieval.spec.ts`
- Create: `tests/analysis-runner.spec.ts`
- Modify: `src/server/deepseek.service.ts`
- Modify: `src/server/app.module.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`

**Interfaces:**
- Produces `RetrievalHit { source: 'task' | 'analysis'; id: string; text: string }`。
- Produces `RetrievalContextProvider { readonly type: 'mysql' | 'qdrant'; search(projectId: string, content: string): Promise<RetrievalHit[]> }`。
- Produces `AnalysisRunner.run(input: AnalysisJobInput): Promise<{ result: MeetingAnalysis; metadata: { mode: AnalysisMode; retriever: 'none' | 'mysql' | 'qdrant'; hitCount: number; model: string | null; durationMs: number } }>`。
- Extends `DeepSeekService` with `analyzeWithContext(title, content, context?: string): Promise<MeetingAnalysis>` and `plan(title, content, context: string): Promise<string>`; both use the same external HTTP provider and never receive original content.

- [ ] **Step 1: 写入失败的检索适配器测试**

在 `tests/retrieval.spec.ts` 模拟 `pool.query` 返回一个已批准分析和一个任务。断言 `MySqlRetrievalContextProvider.search('project-1', 'release')` 使用 `project_id`、只检索 `approved` 分析、返回不超过五条标准命中。测试 `createRetrievalContextProvider()` 在没有 `QDRANT_URL` 时返回 `type === 'mysql'`，有 URL 时返回 `type === 'qdrant'`；Qdrant 的非成功 HTTP 必须 reject `Qdrant retrieval failed`。

- [ ] **Step 2: 运行检索测试并确认缺失实现失败**

Run: `npx vitest run tests/retrieval.spec.ts`

Expected: FAIL，原因是 `retrieval.ts` 尚不存在。

- [ ] **Step 3: 编写最小检索实现**

实现 MySQL 适配器，取 `content.trim().split(/\s+/).filter(Boolean).slice(0, 5)` 作为参数化 `%token%` 条件，查询本项目 `tasks` 与 `ai_analyses JOIN meetings` 的已批准 JSON 结果；将标题、描述、摘要转成 `RetrievalHit`，稳定排序并截断五条。实现 Qdrant HTTP 适配器，从 `QDRANT_URL` 请求配置集合；只转换远端返回的有效 payload，非 2xx、无效 JSON 或网络错误抛出 `ServiceUnavailableException`。工厂仅依环境决定适配器，不包含静默降级。

- [ ] **Step 4: 写入失败的模式分派测试**

在 `tests/analysis-runner.spec.ts` 注入假的 DeepSeek 与检索器：验证 `manual` 结果为 `{ summary: 'Manual review required', decisions: [], tasks: [], risks: [] }` 且模型从未被调用；`llm` 调一次 `analyzeWithContext` 且 `retriever === 'none'`；`rag` 带格式化命中上下文调用一次且元数据为 `mysql`、命中数正确；`agent` 先 `plan` 后 `analyzeWithContext`，共两次调用。每个测试使用脱敏输入字符串，断言元数据含非负耗时。

- [ ] **Step 5: 运行模式测试并确认失败原因正确**

Run: `npx vitest run tests/analysis-runner.spec.ts`

Expected: FAIL，原因是 `AnalysisRunner` 尚不存在。

- [ ] **Step 6: 编写最小运行器与 DeepSeek 上下文支持**

将现有 HTTP 发送逻辑抽到 `DeepSeekService` 私有方法，供 `analyze`、`analyzeWithContext`、`plan` 调用。`analyzeWithContext` 只在 context 非空时把“历史上下文”附加到用户消息；`plan` 使用只返回简短文本规划的系统提示。实现 `AnalysisRunner`，仅对 `rag` 和 `agent` 执行检索，使用 `performance.now()` 计算 `durationMs`，并严格按四种模式调用。把 `AnalysisRunner` 与检索工厂注册到 `AppModule`。

- [ ] **Step 7: 安装队列运行时依赖并公开配置**

Run: `npm install bullmq ioredis`

在 `.env.example` 增加：

```dotenv
REDIS_URL=
QDRANT_URL=
QDRANT_COLLECTION=meetingflow
```

保留 `DEEPSEEK_*` 变量，不能提交实际密钥。

- [ ] **Step 8: 验证模式与检索实现并提交**

Run: `npx vitest run tests/retrieval.spec.ts tests/analysis-runner.spec.ts tests/meeting-analysis.spec.ts`

Expected: PASS。

```powershell
git add src/server/retrieval.ts src/server/analysis-runner.ts src/server/deepseek.service.ts src/server/app.module.ts package.json package-lock.json .env.example tests/retrieval.spec.ts tests/analysis-runner.spec.ts
git commit -m "feat: add analysis modes and retrieval"
```

### Task 3: 接入持久化作业、内联/BullMQ 执行与状态查询

**Files:**
- Create: `src/server/analysis-worker.ts`
- Create: `tests/analysis-job-status.spec.ts`
- Modify: `src/server/analysis-queue.ts`
- Modify: `src/server/app.module.ts`
- Modify: `src/server/app.service.ts`
- Modify: `src/server/app.controller.ts`
- Modify: `src/server/dtos.ts`

**Interfaces:**
- Produces `BullMqAnalysisJobQueue`，构造参数是 Redis URL、队列名、持久化状态仓库和 `AnalysisWorker`；其执行方式固定 `bullmq`。
- Produces `AnalysisWorker.run(input: AnalysisJobInput): Promise<void>`，调用 `AnalysisRunner` 并原子地更新 `ai_analyses`、`analysis_jobs`。
- Extends `AppService.analyzeMeeting(user, meetingId, mode)` and `reanalyzeRejectedAnalysis(user, analysisId, mode)` to return `{ analysisId, jobId, execution }`。
- Produces `AppService.analysisJobStatus(user, analysisId): Promise<AnalysisJobStatus>`。

- [ ] **Step 1: 写入失败的作业状态与授权测试**

在 `tests/analysis-job-status.spec.ts` 模拟 `pool` 和注入的队列。断言 `analyzeMeeting(manager, 'meeting-1', 'manual')` 先写 `ai_analyses(status='queued')` 和 `analysis_jobs(status='queued')`，并调用队列的 `enqueue`，返回 `analysisId/jobId/execution`；断言 `analysisJobStatus` 为同项目成员可读、无关成员被拒绝；断言 `reviewAnalysis` 面对 `queued` 或 `running` 均抛出“尚未可审核”。再断言无效模式由 `AnalysisRequestDto` 的 class-validator 规则拒绝。

- [ ] **Step 2: 运行状态测试并确认失败原因正确**

Run: `npx vitest run tests/analysis-job-status.spec.ts`

Expected: FAIL，原因是服务还未创建作业或缺少状态查询方法。

- [ ] **Step 3: 实现数据库状态仓库与工作器**

在 `analysis-worker.ts` 实现 `DatabaseAnalysisJobStore`：`queued` 创建行、`running` 增加 attempts 和 started_at、`succeeded` 写 finished_at、`failed` 写 error_message/finished_at。实现 `AnalysisWorker.run`：先标记运行与 `ai_analyses='running'`，调用 runner，成功时将规范化结果 JSON、元数据 JSON 写入 `ai_analyses` 并标记分析 `pending`/作业 `succeeded`；失败时将两张表标记失败，记录不含正文的审计事件，并抛出让 BullMQ 重试。

- [ ] **Step 4: 扩展队列并按环境选择实现**

为 `InlineAnalysisJobQueue` 使用 `AnalysisWorker.run` 和数据库仓库。实现 `BullMqAnalysisJobQueue`：使用 `Queue`/`Worker`、`attempts: 3`、`backoff: { type: 'exponential', delay: 1000 }` 与 `timeout: 120000`；worker `completed`/`failed` 监听仅补充状态，最终真相仍由 `AnalysisWorker` 写入。`AppModule` 中通过 `REDIS_URL` 工厂选择内联或 BullMQ，并在应用关闭时关闭 queue/worker/connection。

- [ ] **Step 5: 将服务、DTO 和控制器转到作业路径**

替换 `AppService` 中直接 `deepseek.analyze` 的两段逻辑。查询会议时只取 `v.desensitized_content`，严禁选择或传递 `m.content` 至 runner。创建分析记录时保存模式与模型，创建对应作业并通过注入队列入队。`POST /meetings/:id/analyze` 与 `POST /analyses/:id/reanalyze` 接收 `AnalysisRequestDto`；新增 `GET /analyses/:id/job`。服务写入 `meeting.analysis_requested` 与 `analysis.reanalysis_requested` 审计事件，详情带 `execution`、`mode` 和状态。

- [ ] **Step 6: 验证状态、权限与原有审核回归**

Run: `npx vitest run tests/analysis-job-status.spec.ts tests/analysis-queue.spec.ts tests/meeting-workflow.spec.ts tests/review-draft.spec.ts tests/review-reanalysis.spec.ts tests/role-separation.spec.ts`

Expected: PASS。

```powershell
git add src/server/analysis-queue.ts src/server/analysis-worker.ts src/server/app.module.ts src/server/app.service.ts src/server/app.controller.ts src/server/dtos.ts tests/analysis-job-status.spec.ts
git commit -m "feat: queue meeting analysis jobs"
```

### Task 4: 在前端展示模式、执行状态和重新分析状态

**Files:**
- Modify: `src/services/meetingService.ts`
- Modify: `src/App.vue`
- Modify: `src/components/MeetingReviewPage.vue`
- Modify: `src/style.css`
- Modify: `tests/meeting-workflow.spec.ts`
- Create: `tests/analysis-status-ui.spec.ts`

**Interfaces:**
- Extends `AnalysisRecord` with optional `mode`, `execution`, `jobId`, `jobStatus`, `errorMessage` and `metadata`。
- Extends `createMeetingService.analyze(id, mode)`、`reanalyze(id, mode)` 与 `analysisJob(id)`。
- Produces a four-option mode selector bound to request mode; produces visible status text for `queued`、`running`、`pending`、`failed`。

- [ ] **Step 1: 写入失败的客户端请求测试**

在 `tests/meeting-workflow.spec.ts` 添加请求断言：`service.analyze('m1', 'rag')` 发起 `POST /meetings/m1/analyze` 且 JSON body 为 `{ mode: 'rag' }`；`service.analysisJob('a1')` 发起 `GET /analyses/a1/job`。在 `tests/analysis-status-ui.spec.ts` 读取组件源代码，断言存在四种模式选项、`analysisJob` 调用及失败消息渲染。

- [ ] **Step 2: 运行前端测试并确认失败原因正确**

Run: `npx vitest run tests/meeting-workflow.spec.ts tests/analysis-status-ui.spec.ts`

Expected: FAIL，原因是服务签名和 UI 状态展示尚未实现。

- [ ] **Step 3: 更新会议服务与视图**

让 `meetingService` 传送模式并解析作业响应，保留兼容的默认 `llm`。在会议提交表单增加四选一 `<select>`，发起分析后显示 `execution` 与作业状态；复核队列显示模式、队列状态及失败原因，并对 `queued/running` 禁用审核按钮。对失败项提供以选定模式重新分析的按钮。每 3 秒轮询仅正在运行的作业，组件卸载时清除计时器；成功、失败或离开页面时停止轮询。

- [ ] **Step 4: 添加最小样式与可访问状态**

在 `style.css` 为作业状态添加稳定的状态标签色彩和失败信息行，复用已有 `.tag` 与 `.muted` 规则。状态文本使用“排队中 / 分析中 / 等待审核 / 分析失败”，不只依赖颜色表达。

- [ ] **Step 5: 验证前端测试与构建并提交**

Run: `npx vitest run tests/meeting-workflow.spec.ts tests/analysis-status-ui.spec.ts tests/review-detail-ui.spec.ts`

Expected: PASS。

Run: `npm run build`

Expected: PASS。

```powershell
git add src/services/meetingService.ts src/App.vue src/components/MeetingReviewPage.vue src/style.css tests/meeting-workflow.spec.ts tests/analysis-status-ui.spec.ts
git commit -m "feat: show analysis job status"
```

### Task 5: 增加冒烟验收、运行手册并完成第一阶段验证

**Files:**
- Create: `scripts/smoke-async-analysis.ts`
- Modify: `README.md`
- Modify: `.env.example`
- Create: `tests/analysis-privacy.spec.ts`

**Interfaces:**
- Produces `scripts/smoke-async-analysis.ts`，在 MySQL 可用时创建 UUID 范围的经理、项目与已脱敏会议，验证 `manual` 内联作业、状态查询、审核前置条件和清理；缺 Redis 时显式验证 `inline`，有 Redis 时验证 `bullmq`。
- Produces privacy assertion that the runner receives current `desensitized_content` and never meeting `content`。

- [ ] **Step 1: 写入失败的隐私边界测试**

在 `tests/analysis-privacy.spec.ts` 模拟会议查询返回 `content: '13800138000'` 和 `desensitized_content: '[PHONE]'`，注入 runner 替身并调用 `analyzeMeeting`。断言 runner 输入包含 `[PHONE]` 且不包含原始手机号；审计参数不得包含两者。该测试在新路径未接入前应失败。

- [ ] **Step 2: 运行隐私测试并确认失败原因正确**

Run: `npx vitest run tests/analysis-privacy.spec.ts`

Expected: FAIL，原因是测试揭示旧分析路径仍传递或选择原始正文；若已在 Task 3 修复，则将测试先临时针对注入边界写成缺失方法断言，确认失败后再补实现。

- [ ] **Step 3: 补齐最小实现与冒烟脚本**

确保服务查询和 `AnalysisJobInput` 只有 `desensitizedContent`。创建冒烟脚本，使用 `randomUUID()` 前缀追踪全部记录，在 `finally` 中按这些 UUID 清理；不删除既有用户数据。手册记录 `REDIS_URL`、`QDRANT_URL`、`QDRANT_COLLECTION`、DeepSeek 真实调用前提与内联降级语义，并添加脚本命令 `npx tsx scripts/smoke-async-analysis.ts`。

- [ ] **Step 4: 运行完整第一阶段验证**

Run: `npx vitest run tests/analysis-privacy.spec.ts`

Expected: PASS。

Run: `npm test`

Expected: 所有测试通过，零失败。

Run: `npm run build`

Expected: TypeScript 检查和 Vite 生产构建通过。

Run: `npx tsx scripts/smoke-core-workflow.ts`

Expected: 既有会议至任务闭环通过。

Run: `npx tsx scripts/smoke-async-analysis.ts`

Expected: MySQL 可用时通过；输出清楚标明 `inline` 或 `bullmq`。缺失 MySQL 时报告环境阻塞，不得声明通过。

- [ ] **Step 5: 审查变更并提交**

Run: `git diff --check; git status --short`

Expected: 无空白错误；仅有本阶段相关文件与用户已有的 `.superpowers/` 未跟踪目录。

```powershell
git add README.md .env.example scripts/smoke-async-analysis.ts tests/analysis-privacy.spec.ts
git commit -m "test: verify async analysis privacy"
```

## Plan Self-Review

- 规格覆盖：Task 1 覆盖作业数据与 DTO；Task 2 覆盖四种模式和 MySQL/Qdrant 检索；Task 3 覆盖内联/BullMQ、持久化、API 和审核约束；Task 4 覆盖模式与状态 UI；Task 5 覆盖隐私、手册和冒烟验收。
- 范围控制：计划未实现实验、导出、甘特、效率图或审计检索，这些将作为后续两份独立规格和计划处理。
- 类型一致性：`AnalysisMode` 与 `AnalysisJobInput` 从 Task 1 定义，Task 2 runner、Task 3 worker/API 与 Task 4 客户端均使用相同名称；作业状态字段与第一阶段规格的响应一致。
- 占位符检查：计划没有 `TODO`、`TBD` 或无实现细节的步骤。
