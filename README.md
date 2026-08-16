# 会议纪要智能任务与项目进度跟踪系统

这是一个面向团队协作的项目管理系统。它把会议纪要中的决定、任务和风险整理成可跟踪的工作事项，帮助项目经理了解项目进度，也让每位成员清楚自己要做什么、何时完成以及当前进展。

## 这个系统能做什么

- 导入会议纪要：支持直接粘贴文字，或上传 TXT、DOCX 文件。
- 智能提取：使用 AI 从会议内容中提取摘要、决策、候选任务和风险。
- 人工审核：AI 结果先进入审核队列，项目经理确认后才会生成正式任务和风险。
- 任务跟踪：分配负责人、设置优先级和截止时间，成员可以更新状态、进度和工作反馈。
- 风险提醒：自动识别逾期或即将到期的任务，并向相关人员发送提醒。
- 项目分析：查看项目完成率、任务交付情况、成员效能和进度趋势。
- 全程留痕：会议版本、审核操作、任务变更、通知和权限操作都会留下可追溯记录。

## 一次完整的使用流程

```text
创建项目 → 添加项目成员 → 导入会议纪要 → AI 分析 → 项目经理审核
    → 生成任务和风险 → 成员更新进度 → 系统提醒延期 → 查看项目分析
```

会议原文会先按系统设置进行脱敏。历史版本可以查看或恢复，但恢复会创建新的版本，不会覆盖原始记录。

## 角色说明

| 角色 | 主要工作 |
| --- | --- |
| 项目经理 | 管理负责的项目、导入会议、审核 AI 结果、分派任务、处理风险 |
| 项目成员 | 查看参与的项目，更新本人任务进度和提交工作反馈 |
| 系统管理员 | 管理账号、角色、系统运行设置和全局通知 |
| 审计人员 | 只读查看业务数据、通知和审计日志 |

系统按角色和项目成员关系隔离数据。密码重置后，原有登录令牌会立即失效。

## AI 分析模式

项目经理可以选择四种模式进行实验和对比：

- `manual`：人工审核基线，不依赖模型自动提取。
- `llm`：单轮大模型分析。
- `rag`：结合项目历史会议版本的检索增强分析。
- `agent`：带有计划步骤的智能体分析。

实验中心会记录每种模式的运行次数、审核结果、耗时和模型调用次数。没有配置 RAG 服务时，`rag` 表示当前无检索 RAG 基线，并记录 `retrievalStatus=not_configured`；不会伪装成成功检索。配置完成后，RAG 模式会结合项目历史会议版本进行检索。

## 本地运行

### 环境要求

- Node.js 20 或更高版本
- MySQL 8 或更高版本
- Docker Desktop（只有使用真实 RAG 时需要）

### 启动步骤

1. 安装依赖：

   ```bash
   npm ci
   ```

2. 创建本地配置文件：

   ```bash
   cp .env.example .env
   ```

   Windows PowerShell 可以使用：

   ```powershell
   Copy-Item .env.example .env
   ```

   至少填写数据库密码和随机生成的 `JWT_SECRET`。需要真实 AI 分析时，再填写 `DEEPSEEK_API_KEY`。

3. 启动后端 API：

   ```bash
   npm run server
   ```

4. 另开一个终端启动前端：

   ```bash
   npm run dev
   ```

   浏览器打开 Vite 输出的本地地址，默认通常是 `http://127.0.0.1:5173`。

首次启动会自动执行幂等数据库迁移。请不要提交 `.env`，也不要把 API Key、密码或真实会议内容写入代码、日志和仓库。

## 可选：启用真实 RAG

启动本地 Qdrant：

```bash
docker compose up -d qdrant
```

然后在 `.env` 中配置：

```dotenv
SILICONFLOW_API_KEY=
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
EMBEDDING_MODEL=Qwen/Qwen3-Embedding-4B
QDRANT_URL=http://127.0.0.1:6333
```

系统只会索引脱敏后的会议版本。向量库中不保存会议原文；检索失败会明确标记为失败，不会降级伪装成已检索。

## 项目验证

```bash
# 运行全部自动化测试
npm test

# 类型检查
npx vue-tsc --noEmit --incremental false

# 生产构建
npm run build

# 核心业务闭环冒烟测试
npx tsx scripts/smoke-core-workflow.ts

# 项目闭环验收测试
npm run smoke:project-core-closure
```

冒烟测试需要连接当前配置的 MySQL，并会清理本次运行产生的临时数据。

## 技术组成

- 前端：Vue 3、TypeScript、Vite
- 后端：NestJS、TypeORM
- 数据库：MySQL；Redis 用于缓存和可用性降级
- AI：DeepSeek API
- 向量检索：Qdrant + SiliconFlow Embedding（可选）
- 实时更新：Socket.IO

## 项目资料

- Git 仓库地址：https://github.com/liufangyi52/graduation
- 设计文档、原型图、测试脚本和验收材料位于 `docs/`、`scripts/` 和 `tests/` 目录
