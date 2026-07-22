# 开发指南

## 1. 环境要求

- Node.js：用于根工作区、前端和 API 服务。
- Python 3：用于 FastAPI AI 服务。
- Docker Desktop：可选，用于容器化启动及本地基础设施。

## 2. 本地启动

在项目根目录安装 Node 依赖：

```bash
npm install
```

分别打开终端启动三个服务：

```bash
npm run dev:api
npm run dev:web
python -m pip install -r apps/ai/requirements.txt
uvicorn app.main:app --app-dir apps/ai --reload --port 8000
```

服务地址：

| 服务 | 地址 |
| --- | --- |
| Web | `http://localhost:5174` |
| API | `http://localhost:3000/api` |
| AI 健康检查 | `http://localhost:8000/health` |

## 3. 开发环境预置账号

| 账号 | 密码 | 角色 |
| --- | --- | --- |
| `manager@meetingflow.local` | `meetingflow2026` | 项目经理 |
| `member@meetingflow.local` | `meetingflow2026` | 项目成员 |
| `admin@meetingflow.local` | `meetingflow2026` | 系统管理员 |

这些仅用于本地演示，不能用于生产环境或真实身份认证设计。

## 4. 验证

当前根工作区已提供的跨端构建校验为：

```bash
npm run build
```

对 AI 服务的修改，至少确认模块可以导入，并在服务启动后访问 `/health`。项目目前没有定义统一的 lint、format 或 test 脚本；新增这些能力后，应同步更新 `package.json`、本文件和 `AGENTS.md`。

## 5. 常见问题

- 前端接口请求失败：确认 API 服务运行在 3000 端口，且 Vite 开发服务已启动。
- 前端请求路径错误：客户端应使用 `/api` 前缀，开发环境由 Vite 代理。
- AI 服务未响应：确认 Python 依赖安装完成，并使用 `--app-dir apps/ai` 启动 Uvicorn。
- 容器启动失败：检查 Docker Desktop 是否运行，再确认 `.env` 中的变量格式与 `.env.example` 一致。
