# 审计日志对象与详情中文化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将审计日志的对象类型与 JSON 详情转换为可读中文，同时保留审计 ID 和未知数据。

**Architecture:** 新建前端展示工具模块，专门负责对象类型、详情字段和枚举值的中文映射与 JSON 容错解析。`App.vue` 只调用工具函数展示，后端继续保存和返回原始审计数据。

**Tech Stack:** Vue 3、TypeScript、Vitest

## Global Constraints

- 不修改数据库迁移、服务端审计写入或 API 返回格式。
- 已知值显示中文；未知对象类型、字段和值保留原始内容。
- 对象 ID 始终保留在对象列中。

---

### Task 1: 审计展示工具与映射测试

**Files:**
- Create: `src/utils/auditLogPresentation.ts`
- Create: `tests/audit-log-presentation.spec.ts`

**Interfaces:**
- Produces: `auditLogEntityLabel(entityType: unknown, entityId: unknown): string`
- Produces: `auditLogDetailsLabel(details: unknown): string`

- [ ] **Step 1: 写入失败测试**

```ts
import { expect, it } from 'vitest'
import { auditLogDetailsLabel, auditLogEntityLabel } from '../src/utils/auditLogPresentation'

it('renders audit object types in Chinese while retaining their identifiers', () => {
  expect(auditLogEntityLabel('user', 'u-1')).toBe('账号 / u-1')
  expect(auditLogEntityLabel('task', 't-1')).toBe('任务 / t-1')
  expect(auditLogEntityLabel('future', 'x-1')).toBe('future / x-1')
})

it('renders known audit detail fields and values in Chinese', () => {
  expect(auditLogDetailsLabel('{"role":"manager","status":"in_progress","progress":60}'))
    .toBe('角色：项目经理；状态：进行中；进度：60%')
})

it('keeps unknown and malformed audit details inspectable', () => {
  expect(auditLogDetailsLabel('{"newField":"value"}')).toBe('newField：value')
  expect(auditLogDetailsLabel('not-json')).toBe('not-json')
  expect(auditLogDetailsLabel('{}')).toBe('无变更详情')
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/audit-log-presentation.spec.ts`

Expected: FAIL，因为 `auditLogPresentation` 模块尚不存在。

- [ ] **Step 3: 实现最小展示工具**

```ts
const entityLabels: Record<string, string> = { user: '账号', project: '项目', task: '任务', risk: '风险' }
const fieldLabels: Record<string, string> = { role: '角色', status: '状态', progress: '进度', projectId: '项目 ID', indexedChunks: '索引分块数' }

export function auditLogEntityLabel(entityType: unknown, entityId: unknown): string {
  const type = String(entityType ?? '')
  return `${entityLabels[type] ?? type} / ${entityId ?? '-'}`
}
```

实现 `auditLogDetailsLabel`：安全解析 JSON 对象；映射已知字段和值；为 `progress` 追加 `%`；空对象返回“无变更详情”；解析失败返回原始文本。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/audit-log-presentation.spec.ts`

Expected: PASS，3 个用例均通过。

- [ ] **Step 5: 提交工具与测试**

```bash
git add src/utils/auditLogPresentation.ts tests/audit-log-presentation.spec.ts
git commit -m "feat: localize audit log presentation"
```

### Task 2: 在审计视图复用中文展示工具

**Files:**
- Modify: `src/App.vue:22,777,783,892`
- Modify: `tests/audit-action-labels.spec.ts`

**Interfaces:**
- Consumes: `auditLogEntityLabel(entityType: unknown, entityId: unknown): string`
- Consumes: `auditLogDetailsLabel(details: unknown): string`

- [ ] **Step 1: 写入失败页面回归测试**

```ts
const appSource = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')

it('uses localized labels for audit objects and details', () => {
  expect(appSource.match(/auditLogEntityLabel\(log\.entity_type, log\.entity_id\)/g)).toHaveLength(3)
  expect(appSource).toContain('auditLogDetailsLabel(log.details)')
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/audit-action-labels.spec.ts`

Expected: FAIL，因为页面还直接渲染 `log.entity_type` 和 `log.details`。

- [ ] **Step 3: 替换页面展示调用**

```ts
import { auditLogDetailsLabel, auditLogEntityLabel } from './utils/auditLogPresentation'
```

将仪表盘管理员和审计员的“最近审计记录”对象列替换为：

```vue
{{ auditLogEntityLabel(log.entity_type, log.entity_id) }}
```

将完整审计日志页的对象列替换为同一调用，详情列替换为：

```vue
{{ auditLogDetailsLabel(log.details) }}
```

- [ ] **Step 4: 运行页面与工具测试确认通过**

Run: `npm test -- tests/audit-log-presentation.spec.ts tests/audit-action-labels.spec.ts`

Expected: PASS，映射与三个审计视图调用均受覆盖。

- [ ] **Step 5: 运行生产构建**

Run: `npm run build`

Expected: exit code 0；Vite 的既有大包体积警告可以保留。

- [ ] **Step 6: 提交视图接入**

```bash
git add src/App.vue tests/audit-action-labels.spec.ts
git commit -m "feat: localize audit log details"
```

## 自查

- 设计中的对象类型、详情字段、枚举值、空值、未知值和后端不变要求均对应 Task 1 或 Task 2。
- 本计划不含占位内容，且所有接口名称均已定义。
- 所有页面调用均使用 Task 1 定义的两个函数签名。
