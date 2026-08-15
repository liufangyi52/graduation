# 会议纪要智能任务与项目进度系统

这是可持久化的 Vue 3 + NestJS + MySQL 应用。会议纪要经过 DeepSeek 分析后进入人工审核队列，审核通过才会在事务中生成任务和风险；任务反馈、通知已读、风险处理和审计日志均写入数据库。

## 本地启动

1. 安装 Node.js 20+、MySQL 8+ 与 Docker Desktop，复制 `.env.example` 为 `.env` 并填写数据库密码、JWT 密钥和 DeepSeek Key。
2. 安装依赖：`npm ci`
3. 需要真实 RAG 时启动本地 Qdrant：`docker compose up -d qdrant`。健康检查应在 `http://127.0.0.1:6333/healthz` 返回成功；索引数据保存在 Docker 命名卷中。
4. 启动 API：`npm run server`
5. 另开终端启动前端：`npm run dev`

首次运行会自动执行幂等迁移。生产环境必须使用随机 JWT 密钥和独立数据库账号，不要提交 `.env`。

## 验证

- 单元测试：`npm test`
- 类型检查：`npx vue-tsc --noEmit --incremental false`
- 生产构建：`npm run build`
- 核心闭环冒烟验收：`npx tsx scripts/smoke-core-workflow.ts`（使用当前 `.env` 的 MySQL，创建并清理随机临时数据）
- 项目闭环验收：`npm run smoke:project-core-closure`（需要可连接的 MySQL；验证软删除恢复、自定义脱敏日志隐私、任务备注、逾期查询和驳回重分析，并仅清理本次运行生成的 UUID 数据）

## 角色边界

成员只能读取所属项目并更新本人任务；项目经理只能操作自己负责的项目；管理员可管理账号；审计员只读审计与业务数据。密码重置会递增 `auth_version`，使旧 Token 立即失效。

## 核心闭环

项目经理可粘贴会议纪要或上传 `.txt`/`.docx`（最大 2 MiB）。系统按脱敏设置创建不可变会议版本，AI 分析只使用当前版本的脱敏文本；历史版本可查看和恢复为新版本。经理可以配置项目成员，审核通过的分析会生成任务、风险和任务通知。项目完成率由任务进度实时计算，任务逾期或三天内到期时自动产生去重风险和站内提醒。

## 四模式实验汇总

项目经理可在“实验中心”按项目查看四种已持久化的分析运行：`manual` 表示人工审核基线，`llm` 表示单次模型提取，`rag` 表示当前无检索 RAG 基线，`agent` 表示带计划的智能体运行。每个模式均显示运行数、待审核数、失败数、通过数、驳回数、平均耗时和模型调用总次数；从未运行的模式也显示为零，便于横向比较。

## 真实 RAG 与 Qdrant

真实 RAG 使用 Qdrant 作为专用向量数据库，Embedding 通过 SiliconFlow OpenAI 兼容接口 `https://api.siliconflow.cn/v1/embeddings` 调用 `Qwen/Qwen3-Embedding-4B`（2560 维）。在 `.env` 中配置 `SILICONFLOW_API_KEY`、`SILICONFLOW_BASE_URL`、`EMBEDDING_MODEL` 与 `QDRANT_URL`；这些密钥不得提交、输出到日志或写入实验记录。

只会将会议版本的脱敏文本切分并索引。Qdrant payload 仅包含项目、会议、版本、分块、内容哈希和脱敏片段，绝不包含会议原文。项目经理可在实验中心选择项目后查看安全的 RAG 状态：未配置、依赖不可用、已就绪但没有可索引的脱敏会议版本，或已就绪且存在可同步版本；只有已就绪时才能执行“同步 RAG 索引”。RAG 分析检索同项目的历史版本并默认排除待分析的当前版本，审核页只展示会议、版本、分块编号和相似度，不展示检索正文。

缺少 SiliconFlow 或 Qdrant 配置时，`rag` 仍按无检索基线运行并记录 `retrievalStatus=not_configured`，这不是失败。配置存在但 Embedding 或 Qdrant 调用失败时，RAG 分析会标记为失败，且不会降级伪装成已检索；成功检索会记录 `retrievalStatus=completed`、检索耗时、命中数和安全来源标识。
## Automatic And Manual Notifications

Deadline warnings are generated automatically for unfinished tasks due within three calendar days or already overdue. They create a task-linked risk and deduplicated unread notifications for the active assignee and project owner. Administrator-authored notifications remain a separate manual workflow.
