# 审计操作中文名称 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将所有审计日志表格中的事件码显示为中文操作名称，同时保留未知事件的原始值。

**Architecture:** 在 `src/utils` 新增无副作用的事件码映射函数，集中维护服务端已产生的审计操作名称。`App.vue` 的管理员首页、审计员首页与审计日志全量表格共同调用该函数，后端和数据库继续使用原始事件码。

**Tech Stack:** Vue 3 Composition API、TypeScript、Vitest、Vite。

## Global Constraints

- 不修改 `audit_logs.action`、数据库迁移或 `/audit-logs` 接口。
- 不改变审计权限、列表排序、分页、对象或详情字段。
- 未定义的事件码必须按原样返回并显示。
- 保持现有中文界面文案和 `App.vue` 中的表格结构。

---

### Task 1: 审计操作显示工具

**Files:**
- Create: `src/utils/auditActionLabels.ts`
- Create: `tests/audit-action-labels.spec.ts`

**Interfaces:**
- Produces: `auditActionLabel(action: unknown): string`
- Consumes: 任意审计事件码，不依赖 Vue、DOM 或网络。

- [ ] **Step 1: 写入失败测试**

```ts
import { expect, it } from 'vitest'
import { auditActionLabel } from '../src/utils/auditActionLabels'

it('maps known audit events to Chinese operation labels', () => {
  expect(auditActionLabel('project.rag_index_synced')).toBe('项目知识库索引已同步')
  expect(auditActionLabel('risk.resolved')).toBe('风险已解决')
  expect(auditActionLabel('task.updated')).toBe('任务已更新')
})

it('preserves an unknown audit event code for traceability', () => {
  expect(auditActionLabel('future.action')).toBe('future.action')
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- tests/audit-action-labels.spec.ts`

Expected: FAIL，因为 `src/utils/auditActionLabels.ts` 尚不存在。

- [ ] **Step 3: 编写最小实现**

```ts
const labels: Record<string, string> = {
  'project.rag_index_synced': '项目知识库索引已同步',
  'risk.resolved': '风险已解决',
  'task.updated': '任务已更新',
}

export function auditActionLabel(action: unknown) {
  const value = String(action ?? '')
  return labels[value] ?? value
}
```

实现使用以下完整映射：

```ts
const labels: Record<string, string> = {
  'analysis.approved': '分析结果已通过',
  'analysis.assignment_enriched': '分析任务分配已补充',
  'analysis.draft_saved': '分析草稿已保存',
  'analysis.reanalysis_failed': '分析重新执行失败',
  'analysis.reanalyzed': '分析已重新执行',
  'analysis.rejected': '分析结果已驳回',
  'desensitization_rule.created': '脱敏规则已创建',
  'desensitization_rule.deleted': '脱敏规则已删除',
  'desensitization_rule.updated': '脱敏规则已更新',
  'export.requested': '数据导出已请求',
  'meeting.analysis_failed': '会议分析失败',
  'meeting.analyzed': '会议已分析',
  'meeting.created': '会议已创建',
  'meeting.version_restored': '会议版本已恢复',
  'notification.sent': '通知已发送',
  'notifications.demo_generated': '演示通知已生成',
  'project.archived': '项目已归档',
  'project.created': '项目已创建',
  'project.deleted': '项目已删除',
  'project.member_added': '项目成员已添加',
  'project.member_removed': '项目成员已移除',
  'project.member_role_updated': '项目成员角色已更新',
  'project.rag_index_synced': '项目知识库索引已同步',
  'project.restored': '项目已恢复',
  'project.tag_created': '项目标签已创建',
  'project.tag_deleted': '项目标签已删除',
  'project.tag_linked': '项目标签已关联',
  'project.tag_unlinked': '项目标签已取消关联',
  'project.tag_updated': '项目标签已更新',
  'project.updated': '项目已更新',
  'risk.resolved': '风险已解决',
  'system_settings.updated': '系统设置已更新',
  'task.closed': '任务已关闭',
  'task.created': '任务已创建',
  'task.feedback_created': '任务反馈已创建',
  'task.note_created': '任务备注已创建',
  'task.reminder_sent': '任务提醒已发送',
  'task.reopened': '任务已重新打开',
  'task.updated': '任务已更新',
  'user.created': '账号已创建',
  'user.password_reset': '账号密码已重置',
  'user.updated': '账号已更新',
}
```

- [ ] **Step 4: 运行定向测试并确认通过**

Run: `npm test -- tests/audit-action-labels.spec.ts`

Expected: PASS，两个测试均通过。

- [ ] **Step 5: 提交该任务**

```powershell
git add src/utils/auditActionLabels.ts tests/audit-action-labels.spec.ts
git commit -m "feat: label audit actions in Chinese"
```

### Task 2: 接入全部审计日志表格

**Files:**
- Modify: `src/App.vue:1-30, 729, 735, 844`
- Test: `tests/audit-action-labels.spec.ts`

**Interfaces:**
- Consumes: `auditActionLabel(action: unknown): string`。
- Produces: 管理员首页、审计员首页和审计日志页面的中文操作名称。

- [ ] **Step 1: 写入失败的显示接入测试**

```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

it('renders Chinese audit labels in every audit operation table', () => {
  const appPath = fileURLToPath(new URL('../src/App.vue', import.meta.url))
  const appSource = readFileSync(appPath, 'utf8')

  expect(appSource.match(/auditActionLabel\(log\.action\)/g)).toHaveLength(3)
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- tests/audit-action-labels.spec.ts`

Expected: FAIL，三个审计表格尚未调用 `auditActionLabel(log.action)`。

- [ ] **Step 3: 补全映射并替换三个显示表达式**

```ts
import { auditActionLabel } from './utils/auditActionLabels'
```

将以下三个单元格由：

```vue
<td>{{ log.action }}</td>
```

替换为：

```vue
<td>{{ auditActionLabel(log.action) }}</td>
```

保留工具中的完整事件码映射，未知事件继续由函数原样返回。

- [ ] **Step 4: 运行定向测试并确认通过**

Run: `npm test -- tests/audit-action-labels.spec.ts`

Expected: PASS，已知事件得到中文名称，未知事件保留原始码。

- [ ] **Step 5: 提交该任务**

```powershell
git add src/App.vue src/utils/auditActionLabels.ts tests/audit-action-labels.spec.ts
git commit -m "feat: display audit operations in Chinese"
```

### Task 3: 完整验证与页面检查

**Files:**
- Verify only: `src/App.vue`, `src/utils/auditActionLabels.ts`, `tests/audit-action-labels.spec.ts`

**Interfaces:**
- Consumes: 两个已完成任务的客户端映射和表格渲染。
- Produces: 可复现的测试、构建和浏览器验证结果。

- [ ] **Step 1: 运行完整测试套件**

Run: `npm test`

Expected: PASS，所有 Vitest 测试通过。

- [ ] **Step 2: 运行生产构建**

Run: `npm run build`

Expected: PASS，`vue-tsc --noEmit --incremental false` 和 Vite 构建均以 0 退出。

- [ ] **Step 3: 检查本地界面**

Run: `npm run dev -- --host 127.0.0.1 --port 5173`

Expected: 管理员首页、审计员首页与 `/audit-logs` 的“操作”列均显示中文名称；`project.rag_index_synced` 显示“项目知识库索引已同步”，`risk.resolved` 显示“风险已解决”；表格不发生文字重叠。
