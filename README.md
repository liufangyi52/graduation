# J基于会议纪要智能任务与项目进度系统

这是可持久化的 Vue 3 + NestJS + MySQL 应用。会议纪要经过大模型分析后进入人工审核队列，审核通过才会在事务中生成任务和风险；任务反馈、通知已读、风险处理和审计日志均写入数据库。

## 本地启动

1. 安装 Node.js 20+ 与 MySQL 8+，复制 `.env.example` 为 `.env` 并填写数据库密码、JWT 密钥和 DeepSeek Key。
2. 安装依赖：`npm ci`
3. 启动 API：`npm run server`
4. 另开终端启动前端：`npm run dev`

首次运行会自动执行幂等迁移。生产环境必须使用随机 JWT 密钥和独立数据库账号，不要提交 `.env`。

## 验证

- 单元测试：`npm test`
- 类型检查：`npx vue-tsc --noEmit --incremental false`
- 生产构建：`npm run build`

## 角色边界

成员只能读取所属项目并更新本人任务；项目经理只能操作自己负责的项目；管理员可管理账号；审计员只读审计与业务数据。密码重置会递增 `auth_version`，使旧 Token 立即失效。
