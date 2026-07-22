# REST API 概览

API 服务默认监听 `http://localhost:3000`，所有业务端点带有 `/api` 前缀。请求体由 NestJS `ValidationPipe` 进行白名单校验和转换。

## 1. 认证与角色

`POST /api/auth/login` 接受邮箱和密码，返回演示身份令牌。后续受保护请求使用：

```http
Authorization: Bearer <token>
```

项目经理可创建会议、发起分析并复核候选任务；任务更新会根据当前用户身份执行权限检查。

## 2. 端点

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | `/api/auth/login` | 演示登录。 |
| GET | `/api/me` | 获取当前用户。 |
| GET | `/api/dashboard` | 获取仪表盘数据。 |
| GET | `/api/projects` | 获取项目列表。 |
| GET | `/api/projects/:id/tasks` | 获取项目任务。 |
| PATCH | `/api/tasks/:id` | 更新任务状态、进度或阻塞信息。 |
| GET | `/api/meetings` | 获取会议列表。 |
| POST | `/api/meetings` | 创建会议，需项目经理权限。 |
| POST | `/api/meetings/:id/analyze` | 发起会议分析，需项目经理权限。 |
| GET | `/api/meetings/:id/analysis` | 获取分析草稿。 |
| POST | `/api/meetings/:id/review` | 复核选中的候选任务。 |
| GET | `/api/analytics/evaluation` | 获取演示评测指标。 |
| GET | `/api/traces` | 获取演示追踪记录。 |

## 3. 会议创建示例

```json
{
  "title": "第 12 次项目推进会",
  "content": "请填写至少八个字符的会议纪要正文。",
  "date": "2026-07-21",
  "attendees": ["张三", "李四"]
}
```

## 4. 兼容性约束

- 当前接口返回的是演示数据和 mock 分析结果，调用方不得将其视为生产数据契约。
- 新增字段、改名字段或改变权限逻辑属于公共 API 变更，应先确认并同步更新本文件。
- 分析输出应保留 `review_required` 和来源证据语义，避免绕过人工复核。
