# DeepSeek V4 可用设置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让系统设置只配置官方 DeepSeek V4 Pro，并使模型与默认分析模式真实控制会议分析。

**Architecture:** 服务端配置工具将新旧系统设置归一化为 `deepseek-v4-pro` 和四个内部分析模式。`AppService` 在每次分析时读取该配置，向 `AnalysisRunner` 传递模型和默认模式；前端只展示真实可用的 DeepSeek V4 Pro，并将全局默认同步到新建会议表单。

**Tech Stack:** NestJS、Vue 3、TypeScript、Vitest、DeepSeek OpenAI-compatible API

## Global Constraints

- 只使用官方 DeepSeek 地址 `https://api.deepseek.com` 与环境变量 `DEEPSEEK_API_KEY`。
- 默认模型标识必须是 `deepseek-v4-pro`；不得输出、持久化或测试真实 API Key。
- 四个规范运行模式必须是 `manual`、`llm`、`rag`、`agent`。
- 保持已有会议数据与数据库表结构不变，并归一化旧模型名称和历史模式值。

---

### Task 1: 系统 AI 配置归一化

**Files:**
- Create: `src/server/ai-settings.ts`
- Create: `tests/ai-settings.spec.ts`

**Interfaces:**
- Produces: `type SystemAnalysisMode = 'manual' | 'llm' | 'rag' | 'agent'`
- Produces: `normalizeSystemModel(model: unknown): 'deepseek-v4-pro'`
- Produces: `normalizeSystemAnalysisMode(mode: unknown): SystemAnalysisMode`
- Produces: `systemAnalysisModeLabel(mode: SystemAnalysisMode): string`

- [ ] **Step 1: 写入失败测试**

```ts
import { expect, it } from 'vitest'
import { normalizeSystemAnalysisMode, normalizeSystemModel, systemAnalysisModeLabel } from '../src/server/ai-settings'

it('normalizes legacy model names to the supported DeepSeek V4 Pro identifier', () => {
  expect(normalizeSystemModel('DeepSeek V3')).toBe('deepseek-v4-pro')
  expect(normalizeSystemModel('deepseek-v4-pro')).toBe('deepseek-v4-pro')
})

it('normalizes legacy and localized mode values to executable modes', () => {
  expect(normalizeSystemAnalysisMode('RAG')).toBe('rag')
  expect(normalizeSystemAnalysisMode('智能体编排')).toBe('agent')
  expect(normalizeSystemAnalysisMode('unknown')).toBe('llm')
  expect(systemAnalysisModeLabel('manual')).toBe('人工审核')
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/ai-settings.spec.ts`

Expected: FAIL，因为 `ai-settings` 模块尚不存在。

- [ ] **Step 3: 实现配置归一化工具**

```ts
export type SystemAnalysisMode = 'manual' | 'llm' | 'rag' | 'agent'

export function normalizeSystemModel(_model: unknown): 'deepseek-v4-pro' {
  return 'deepseek-v4-pro'
}
```

实现模式映射，使 `无 AI`、`人工审核` 映射为 `manual`，`单轮大模型`、`LLM` 映射为 `llm`，`RAG`、`RAG 检索增强` 映射为 `rag`，`智能体`、`智能体编排` 映射为 `agent`；未知值使用 `llm`。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/ai-settings.spec.ts`

Expected: PASS，2 个用例通过。

- [ ] **Step 5: 提交工具与测试**

```bash
git add src/server/ai-settings.ts tests/ai-settings.spec.ts
git commit -m "feat: normalize DeepSeek V4 settings"
```

### Task 2: 后端将系统配置传递给真实分析

**Files:**
- Modify: `src/server/deepseek.service.ts:45-99`
- Modify: `src/server/analysis-runner.ts:5-130`
- Modify: `src/server/app.service.ts:540-550,901-922,1019-1044`
- Modify: `src/server/app.controller.ts:70,81`
- Modify: `tests/admin-settings.spec.ts`
- Modify: `tests/analysis-runner.spec.ts`

**Interfaces:**
- Consumes: `normalizeSystemModel(model: unknown): 'deepseek-v4-pro'`
- Consumes: `normalizeSystemAnalysisMode(mode: unknown): SystemAnalysisMode`
- Produces: `DeepSeekService.analyzeWithPlan(title: string, content: string, plan?: string, model?: string): Promise<MeetingAnalysis>`
- Produces: `AnalysisRunner.run(input: AnalysisRunnerInput & { model: string }): Promise<AnalysisRunnerResult>`

- [ ] **Step 1: 写入失败测试**

```ts
it('uses the configured model in analysis metadata', async () => {
  const runner = new AnalysisRunner({ analyzeWithPlan: vi.fn().mockResolvedValue(result) } as any)
  const execution = await runner.run({ mode: 'llm', model: 'deepseek-v4-pro', title: '会议', desensitizedContent: '内容' })
  expect(execution.metadata.model).toBe('deepseek-v4-pro')
})

it('returns normalized settings to authenticated users and only permits administrators to update them', async () => {
  await expect(service.getSystemSettings(manager)).resolves.toEqual({ model: 'deepseek-v4-pro', mode: 'rag', desensitize: true })
  await expect(service.updateSystemSettings(manager, { model: 'deepseek-v4-pro', mode: 'rag', desensitize: true })).rejects.toThrow('Administrator access required')
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/admin-settings.spec.ts tests/analysis-runner.spec.ts`

Expected: FAIL，因为运行器不接受模型参数，设置读取仅限管理员且未归一化。

- [ ] **Step 3: 接入实际模型与默认模式**

```ts
const settings = await this.systemAnalysisSettings()
const selectedMode = mode === undefined ? settings.mode : normalizeSystemAnalysisMode(mode)
await this.analysisRunner.run({ mode: selectedMode, model: settings.model, title, projectId, meetingId, versionId, desensitizedContent })
```

让 `DeepSeekService` 的调用链接收模型参数并将其写入 Chat Completions 请求体；让 `AnalysisRunner` 将输入模型写入执行元数据。`AppService` 新增私有 `systemAnalysisSettings()`，从现有设置行读取并归一化。`getSystemSettings` 对已认证用户可读、仅 `updateSystemSettings` 保持管理员权限。控制器的分析请求允许省略 `mode`，交由服务端默认设置处理。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/admin-settings.spec.ts tests/analysis-runner.spec.ts`

Expected: PASS，设置权限、归一化和模型元数据覆盖通过。

- [ ] **Step 5: 提交后端接入**

```bash
git add src/server/ai-settings.ts src/server/deepseek.service.ts src/server/analysis-runner.ts src/server/app.service.ts src/server/app.controller.ts tests/admin-settings.spec.ts tests/analysis-runner.spec.ts
git commit -m "feat: apply DeepSeek V4 system settings"
```

### Task 3: 前端只展示可用配置并同步会议默认模式

**Files:**
- Modify: `.env.example:9-11`
- Modify: `src/App.vue:139-145,371-385,883-890`
- Modify: `src/services/authService.ts:20-25`
- Modify: `tests/auth-service.spec.ts`
- Create: `tests/deepseek-v4-settings-ui.spec.ts`

**Interfaces:**
- Consumes: API settings `{ model: 'deepseek-v4-pro'; mode: SystemAnalysisMode; desensitize: boolean }`
- Consumes: `AnalysisMode` from `src/services/meetingService.ts`

- [ ] **Step 1: 写入失败 UI 测试**

```ts
const app = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')

it('only exposes DeepSeek V4 Pro and synchronizes the default meeting mode', () => {
  expect(app).toContain('DeepSeek V4 Pro')
  expect(app).not.toContain('Qwen 2.5')
  expect(app).not.toContain('GPT-4o')
  expect(app).toContain("meetingAnalysisMode.value = settings.mode as AnalysisMode")
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/deepseek-v4-settings-ui.spec.ts tests/auth-service.spec.ts`

Expected: FAIL，因为页面仍展示 V3、Qwen、GPT-4o，且不会同步默认会议模式。

- [ ] **Step 3: 修改前端配置与默认同步**

```ts
const systemSettings = ref<SystemSettings>({ model: 'deepseek-v4-pro', mode: 'rag', desensitize: true })
void auth.getSystemSettings(props.token).then((settings) => {
  systemSettings.value = settings
  meetingAnalysisMode.value = settings.mode as AnalysisMode
}).catch(() => {})
```

将模型下拉框替换为唯一选项“DeepSeek V4 Pro”，值为 `deepseek-v4-pro`；模式下拉框使用四个内部规范值和中文标签。更新 `.env.example` 中的默认模型为 `deepseek-v4-pro`，不改动本地 `.env` 的 API Key。

- [ ] **Step 4: 运行前端测试确认通过**

Run: `npm test -- tests/deepseek-v4-settings-ui.spec.ts tests/auth-service.spec.ts`

Expected: PASS，页面只展示 V4 Pro，设置响应和会议默认模式完成同步。

- [ ] **Step 5: 运行联合验证**

Run: `npm test -- tests/ai-settings.spec.ts tests/admin-settings.spec.ts tests/analysis-runner.spec.ts tests/deepseek-v4-settings-ui.spec.ts tests/auth-service.spec.ts`

Run: `npm run build`

Expected: 所有定向测试通过，构建 exit code 0。

- [ ] **Step 6: 提交前端接入**

```bash
git add .env.example src/App.vue src/services/authService.ts tests/auth-service.spec.ts tests/deepseek-v4-settings-ui.spec.ts
git commit -m "feat: expose DeepSeek V4 Pro settings"
```

## 自查

- 模型、官方地址与密钥约束由 Task 2 和 Task 3 实现，且不读取或输出真实密钥。
- 规范模式与旧值兼容由 Task 1 实现，服务端默认和前端同步由 Task 2、Task 3 实现。
- 所有函数和类型名称均在其产出任务中定义，且计划不含占位内容。
