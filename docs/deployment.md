# 部署与容器运行

## 1. Docker Compose

在项目根目录执行：

```bash
docker compose up --build
```

Compose 会启动 Web、API、AI 服务，以及 MySQL、Redis、Qdrant 和 MinIO。Web 容器暴露在 8080 端口，API 和 AI 服务分别暴露在 3000、8000 端口。

## 2. 环境变量

以 `.env.example` 为准复制配置：

```bash
cp .env.example .env
```

| 变量 | 用途 |
| --- | --- |
| `MYSQL_DATABASE`、`MYSQL_USER`、`MYSQL_PASSWORD`、`MYSQL_ROOT_PASSWORD` | MySQL 开发环境配置。 |
| `REDIS_URL` | Redis 连接地址。 |
| `AI_SERVICE_URL` | API 访问 AI 服务的地址。 |
| `VITE_API_BASE_URL` | 前端 API 根路径。 |
| `LLM_MODE` | AI 服务运行模式；默认 `mock`。 |

`.env.example` 中的账号和密码仅为本地开发默认值。生产部署必须通过受控密钥管理方案替换，并且不得提交真实 `.env`、模型密钥或会议敏感数据。

## 3. 数据持久化现状

Compose 已为 MySQL 配置 `mysql-data` 卷。当前 API 主流程仍使用内存种子数据，因此容器中启动数据库并不会自动使任务或会议数据持久化。接入数据库仓储层后，应补充迁移、备份、恢复和健康检查步骤。

## 4. 发布前检查

1. 执行 `npm run build`。
2. 确认 Web、API、AI 服务的健康状态和端口连通性。
3. 确认生产环境没有沿用开发默认密码或 mock 模式。
4. 验证会议分析仍经过人工复核，且日志和监控不记录敏感会议正文。
