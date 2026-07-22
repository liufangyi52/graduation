# MeetingFlow AI

面向项目团队的会议纪要智能体与项目进度跟踪系统。系统将会议纪要生成带来源证据的分析草稿、候选任务、分派建议与风险提示，并在项目经理复核后形成正式任务。

> 当前为演示型 MVP：AI 服务默认运行在 `mock` 模式，不依赖外部模型密钥；分析结果必须人工复核，不能视为最终结论。

## 核心能力

- 导入会议纪要并生成摘要、决策和候选任务草稿。
- 展示来源证据、分析追踪和演示评测数据。
- 由项目经理复核候选任务，再创建或更新正式任务。
- 跟踪项目任务状态、进度和阻塞信息。

## 技术栈

| 层次 | 技术 |
| --- | --- |
| 前端 | Vue 3、Vite、TypeScript |
| API | NestJS 11、TypeScript |
| AI 服务 | FastAPI、Pydantic、Uvicorn |
| 容器与基础设施 | Docker Compose、MySQL、Redis、Qdrant、MinIO |

当前 API 使用内存种子数据，以保证首次演示无需基础设施。Compose 中的 MySQL、Redis、Qdrant 和 MinIO 用于后续持久化、缓存、检索和文件存储演进。

## 本地启动

```bash
npm install
npm run dev:api
npm run dev:web
```

在另一终端启动 AI 服务：

```bash
python -m pip install -r apps/ai/requirements.txt
uvicorn app.main:app --app-dir apps/ai --reload --port 8000
```

访问地址：

- Web：`http://localhost:5174`
- API：`http://localhost:3000/api`
- AI 健康检查：`http://localhost:8000/health`

## Docker Compose

```bash
docker compose up --build
```

容器化 Web 服务地址为 `http://localhost:8080`。

## 开发环境预置账号

| 账号 | 密码 | 角色 |
| --- | --- | --- |
| `manager@meetingflow.local` | `meetingflow2026` | 项目经理 |
| `member@meetingflow.local` | `meetingflow2026` | 项目成员 |
| `admin@meetingflow.local` | `meetingflow2026` | 系统管理员 |

## 验证

```bash
npm run build
```

## 文档

- [系统架构](docs/architecture.md)
- [开发指南](docs/development.md)
- [REST API 概览](docs/api.md)
- [部署与容器运行](docs/deployment.md)
