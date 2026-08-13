# 管理员运维能力设计

## 目标

补齐系统管理员的配置与运维闭环：管理外部 AI 服务配置、维护可安全清理的系统数据，并导出完整业务数据。所有能力仅限管理员，且每次变更、清理与导出都应写入审计日志。

## 范围

本次实现以下管理员能力：

- 外部服务配置：AI 服务地址、模型名称和 API Key。
- 系统数据维护：数据量概览，以及已归档项目、已读通知、超过保留期审计日志的受控清理。
- 全量 JSON 导出：项目、任务、会议、AI 分析、风险、用户和审计日志。

实验中心、审计日志高级检索、前后快照和数据回滚不在本次范围内。

## 权限与安全

所有新 API 在服务层调用现有 `assertAdmin`。非管理员请求返回 403，且不得执行查询写入或返回敏感数据。

外部服务的 API Key 只在服务端保存。数据库保存经 AES-256-GCM 加密的密文、随机 IV 和认证标签；加密密钥读取 `SERVICE_CONFIG_ENCRYPTION_KEY` 环境变量。读取配置时绝不返回明文，仅返回 `configured` 与掩码值，例如 `****abcd`。若未配置该环境变量，涉及 API Key 的写入明确失败，避免明文回退。

数据维护仅支持固定范围的删除操作。归档项目按既有软删除记录永久清理关联数据；已读通知按指定保留天数清理；审计日志按指定保留天数清理。前端在提交前要求确认，服务端仍会验证操作类型及保留天数。清理本身与导出均写入审计日志。

## 数据模型

新增 `external_service_settings` 单例表，主键固定为 1，字段如下：

- `base_url`：AI 服务地址。
- `model`：默认模型名称。
- `api_key_ciphertext`、`api_key_iv`、`api_key_tag`：API Key 的 AES-GCM 加密材料，可为空。
- `updated_at`：更新时间。

迁移确保单例记录存在。现有 `system_settings` 继续保存运行模式和脱敏开关。

## 接口

新增管理员 API：

- `GET /api/admin/external-service`：返回 `{ baseUrl, model, apiKeyConfigured, apiKeyMasked }`。
- `PATCH /api/admin/external-service`：接收 `{ baseUrl, model, apiKey? }`；当 `apiKey` 省略时保留当前密钥。
- `GET /api/admin/data-maintenance`：返回各业务表的记录数量。
- `POST /api/admin/data-maintenance/cleanup`：接收 `{ target, retentionDays }`，其中 target 为 `deleted_projects`、`read_notifications` 或 `audit_logs`。
- `GET /api/admin/export`：返回版本化 JSON 导出包，包含用户、项目、任务、会议、分析、风险和审计日志。

导出响应不包含 `password_hash`、`auth_version`、外部服务 API Key 或其加密材料。控制器使用 JSON 响应，前端将 Blob 下载为文件。

## 服务集成

`DeepSeekService` 优先读取已保存的外部服务配置；未配置时沿用现有环境变量配置。运行时仅在服务端解密 API Key，绝不记录到审计日志、错误消息或 HTTP 响应中。

每项 API 保持与现有 `AppService` 模式一致：控制器解析当前用户、服务层进行权限校验、数据库操作完成后调用 `audit`。

## 前端

管理员的 `/settings` 页面改为实际可切换的四个分区：运行设置、外部服务、数据维护和数据导出。

外部服务区显示地址、模型和掩码密钥输入状态。密钥输入为空代表不修改。数据维护区展示各项记录数，并为每种清理动作提供保留天数和确认对话框。数据导出区通过一次按钮操作下载 JSON 包。所有失败通过现有 toast 显示。

## 测试

测试覆盖以下行为：

- 非管理员不能读取或更新服务配置、维护数据或导出数据。
- API Key 加密保存，读取结果仅为掩码；未配置加密密钥时拒绝保存密钥。
- 管理员更新服务配置、执行每种清理及导出都会产生审计记录。
- 清理只接受列出的目标和有效保留天数。
- 导出包含指定业务实体，但不包含密码哈希、认证版本或服务配置秘密。
- 前端服务向相应 API 发送正确的管理员请求。
