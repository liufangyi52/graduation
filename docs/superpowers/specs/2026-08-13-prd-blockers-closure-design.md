# PRD 阻塞项闭环设计

## 目标

在不破坏现有会议纪要、人工审核、任务和风险闭环的前提下，补齐 PRD 验收中尚缺的异步处理、四种 AI 运行模式、检索增强、实验评测、数据导出和甘特视图。系统必须同时支持本地答辩环境和已配置外部服务的真实集成环境。

## 范围与验收边界

本变更覆盖以下可验收能力：

1. Redis 与 BullMQ 可用时，会议分析经由持久化队列执行，记录排队、运行、成功、失败和重试状态；服务未配置时，应用以 `inline` 执行器同步完成任务，并在 API 返回和审计记录中明确标示，不把降级执行伪装为队列执行。
2. 每次分析明确选择 `manual`、`llm`、`rag` 或 `agent` 模式，并持久化模式、执行器、耗时、状态、错误和关联实验运行。`llm` 使用现有 DeepSeek API；缺少 API Key 或远端失败时记录 `failed` 状态和错误信息。
3. `rag` 通过检索提供与当前会议内容相关的历史已审核任务/决策上下文；默认实现为 MySQL 全文式关键词检索。Qdrant 适配器仅在配置 URL 后启用，连接异常时明确失败，不静默改用虚构结果。
4. `agent` 先检索上下文，再调用 DeepSeek，并对返回结果做固定结构校验；不会声明具备未实现的多代理自治能力。
5. 实验中心可创建运行、对四种模式执行同一已脱敏会议样本、保存输出和指标；指标包含耗时、成功率、候选任务数、人工审核修正率和基于人工审核结果计算的准确率。样本与运行记录可导出 CSV。
6. 任务、风险、项目和实验结果可按当前授权范围导出 CSV；任务页面提供原生 SVG 甘特视图，按开始日/截止日、状态、负责人和当前日期展示条目。没有日期的数据会标明为未排期，不绘制误导性条目。

本次不实现真正的 BGE-M3、BGE Reranker 模型进程、向量嵌入生成或 Qdrant 自动建库；这些由稳定的检索适配器边界预留，且 UI/API 会准确说明当前使用 MySQL 或 Qdrant 检索器。也不引入 Redis 作为所有列表的读缓存，因为这不影响本次业务验收闭环。

## 架构

### 异步执行

新增 `AnalysisJobQueue` 接口：`enqueue(input)`、`get(jobId)` 与 `close()`。`InlineAnalysisJobQueue` 直接运行处理器，用于未设置 `REDIS_URL` 的本地环境。`BullMqAnalysisJobQueue` 使用 Redis/BullMQ，并配置三次尝试、指数退避和超时；进程内 worker 将状态写回 `analysis_jobs`。应用启动时按环境配置注入其中一个实现。

`ai_analyses` 保留最终业务结果；新增 `analysis_jobs` 保存调度状态。创建会议分析时先创建 `ai_analyses(status=queued)`，然后入队；worker 成功时更新为 `pending`，失败时更新为 `failed`。审核只允许 `pending` 结果，避免失败任务被误审。

### AI 模式与检索

新增 `AnalysisRunner`：输入为会议标题、已经脱敏的正文、模式和项目 ID，输出为标准 `MeetingAnalysis` 与执行元数据。`manual` 返回可审核的空候选结果；`llm` 调用 `DeepSeekService`；`rag` 在 LLM 提示词中附加 `RetrievalContextProvider.search(projectId, content)` 的上下文；`agent` 使用相同检索上下文，经过计划提示和提取提示两次受控调用。所有模式共用 `normalizeAnalysis`，以保证候选任务数据契约稳定。

`MySqlRetrievalContextProvider` 仅查询用户已经有权访问的当前项目已审核分析和正式任务，按关键词匹配并限制为五条。`QdrantRetrievalContextProvider` 以 `QDRANT_URL` 显式启用，使用同样的返回契约；未配置时不会显示为已启用。检索器类型和命中数写入分析元数据与实验运行。

### 实验与评测

新增 `experiment_runs`、`experiment_samples` 和 `experiment_results`。实验运行有创建者、项目、日期范围、所选模式和状态；每个样本关联一个会议版本。执行时逐样本调用 `AnalysisRunner`，持久化原始规范化输出、耗时、成功与失败信息。审核后，对比候选任务与最终人工审核结果计算精确率、修正率；无人工审核样本时准确率为 `null` 并在界面说明。

### 导出与甘特图

服务层生成 UTF-8 BOM CSV，控制器以 `text/csv` 和附件文件名输出。所有导出复用现有项目可见性与角色权限判断，成员只能导出本人可访问的数据。甘特图由 `TaskBoardPage` 接收正式任务，使用日期范围计算 SVG 横坐标，绘制任务条与今天线，显示筛选后任务和未排期数量。

## API

新增或扩展端点：

- `POST /api/meetings/:id/analyze` 接收 `{ mode }`，返回 `{ analysisId, jobId, execution }`。
- `GET /api/analyses/:id/job` 返回排队/运行/失败/成功状态、尝试次数和错误。
- `GET /api/experiments`、`POST /api/experiments`、`POST /api/experiments/:id/run`、`GET /api/experiments/:id`。
- `GET /api/exports/tasks.csv`、`GET /api/exports/projects.csv`、`GET /api/exports/risks.csv`、`GET /api/experiments/:id/export.csv`。

所有新写操作均做 DTO 校验、角色校验和审计记录。管理员配置队列与检索器，项目经理运行项目实验，成员只读自己可见的导出结果，审计员只读实验和审计数据。

## 数据流与错误处理

会议版本先脱敏，再进入所有 AI/检索/实验路径；原始正文不传给外部 LLM 或写入实验导出。队列重试耗尽后，`analysis_jobs` 与 `ai_analyses` 同时标记失败，UI 显示重试入口。真实 DeepSeek 调用成功需满足 HTTP 成功、可解析 JSON 和 `normalizeAnalysis` 验证；任一环节失败均保留错误原因。导出时无数据返回标题行，避免生成伪数据。

## 验证

1. 单元测试覆盖队列选择、重试状态转换、模式分派、检索上下文、指标计算、CSV 转义和甘特日期布局。
2. 集成测试使用内存执行器和 MySQL，验证会议到异步分析到人工审核到实验指标的全链路。
3. Redis 已配置时单独冒烟验证 BullMQ 状态和失败重试；缺少 Redis 时冒烟验证 `inline` 降级标记。
4. 有效 DeepSeek Key 时运行显式真实调用冒烟脚本；未配置时脚本以清晰的“跳过，缺少配置”结束，不宣称通过真实 API 验收。
5. 最终运行全量 `npm test`、`npm run build`、既有核心冒烟和新增 PRD 阻塞项冒烟。

## 取舍

采用可插拔的本地优先方案，而非强制外部依赖部署或前端模拟。这样答辩机可完整展示真实业务闭环，而生产/验收环境配置 Redis、DeepSeek 和 Qdrant 后，可得到可核验的真实集成行为。所有降级状态均向用户和审计日志透明。
