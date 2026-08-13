# 异步分析与 AI 模式设计

## 目标

完成会议纪要分析的可追踪异步执行，并支持人工、单轮大模型、检索增强和受限智能体编排四种运行模式。该阶段是实验中心、导出和图表的基础，不包含它们的实现。

## 范围与验收边界

1. 每次分析创建持久化 `ai_analyses` 业务记录和 `analysis_jobs` 调度记录，提供排队、运行、成功、失败、尝试次数、执行方式和错误信息。
2. 未配置 `REDIS_URL` 时使用 `inline` 执行器；配置时使用 BullMQ，最多三次尝试、指数退避和 120 秒超时。响应与审计均明确执行方式，不将内联降级显示为队列执行。
3. `manual` 不调用模型，生成可审核的空候选结果；`llm` 调用一次 DeepSeek；`rag` 使用检索上下文后调用一次 DeepSeek；`agent` 在同一检索上下文上先规划、后抽取，共两次受限调用。
4. 检索默认限定同一项目的已审核分析和正式任务，返回最多五条命中。配置 `QDRANT_URL` 时采用 Qdrant HTTP 适配器，否则采用 MySQL 适配器；Qdrant 连接错误必须显式失败，不能伪造命中或静默回退。
5. 仅将会议当前版本的脱敏正文传入 AI 或检索路径。原始正文不传给外部服务；运行元数据和失败原因可审计。

本阶段不实现 BGE-M3、BGE Reranker、嵌入写入、实验中心、CSV/PDF/Excel 导出、甘特图、效率图表和审计筛选；这些属于后续两阶段。

## 架构

### 调度

新增 `AnalysisJobQueue` 作为调度边界，提供 `enqueue(input)` 和 `get(jobId)`。`InlineAnalysisJobQueue` 与 `BullMqAnalysisJobQueue` 共享该接口，并将状态写入 `analysis_jobs`。分析请求先持久化 `ai_analyses(status=queued)`，后入队；工作处理成功时将分析置为 `pending`，失败时置为 `failed`。审核仅接受 `pending` 分析。

### 分析与检索

新增 `AnalysisRunner`，输入 `projectId`、会议标题、已脱敏正文和模式，输出标准 `MeetingAnalysis` 和执行元数据：`mode`、`retriever`、`hitCount`、`model`、`durationMs`。四种模式均复用既有 `normalizeAnalysis`，从而不改变人工审核、正式任务和风险生成的数据契约。

`MySqlRetrievalContextProvider` 查询当前项目的已审批分析与正式任务并限制五条。`QdrantRetrievalContextProvider` 只在显式配置时装配，返回同一 `RetrievalHit` 契约。`agent` 的规划文本仅作为第二次提取调用的上下文，不持久化为独立业务数据。

## API 与数据

- `POST /api/meetings/:id/analyze` 接收 DTO `{ mode: 'manual' | 'llm' | 'rag' | 'agent' }`，返回 `{ analysisId, jobId, execution }`。
- `GET /api/analyses/:id/job` 返回 `{ id, analysisId, execution, status, attempts, errorMessage, startedAt, finishedAt }`。
- `POST /api/analyses/:id/reanalyze` 接收相同 `mode` DTO，并走相同队列路径。
- `analysis_jobs` 保存 `id`、`analysis_id`、`execution`、`status`、`attempts`、`error_message`、`started_at`、`finished_at` 与时间戳；`ai_analyses` 扩充 `queued/running` 状态并保存执行元数据 JSON。

所有新写操作经过 DTO 校验、既有项目经理权限校验和审计日志。工作状态查询通过分析所属会议的项目可见性校验。

## 失败与降级

缺失 DeepSeek Key、网络失败、非成功 HTTP、无效 JSON 或结果结构无效时，作业和分析记录均标记失败，并保留可显示的错误原因。缺 Redis 不构成失败，系统以内联执行完成并返回 `execution: inline`。`manual` 不受 DeepSeek 配置影响。

## 验证

1. 队列测试验证内联状态转换、处理失败、非法模式拒绝和作业状态读取。
2. 分析运行器测试验证四种模式的调用次数、检索上下文、元数据与 MySQL/Qdrant 选择。
3. 工作流回归测试验证审核只能接受成功后待审核的结果，重新分析使用相同调度路径。
4. 最终运行定向测试、全量 `npm test`、`npm run build` 与现有核心冒烟脚本；Redis 和真实 DeepSeek 的集成冒烟单独报告。
