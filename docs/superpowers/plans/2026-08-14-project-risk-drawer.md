# 项目风险任务抽屉 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 允许用户在项目分析页点击中风险或高风险环形图区块，在当前页查看对应的开放风险任务。

**Architecture:** 在 `ProjectDetailPage.vue` 内维护瞬态的选中风险等级，并根据已加载的 `detail.risks` 计算任务列表。用 SVG 路径承载可点击的中、高风险色块，固定定位的抽屉以同一状态控制显示；不变更路由、服务层或数据模型。

**Tech Stack:** Vue 3 Composition API、TypeScript、现有 CSS、Vitest。

## Global Constraints

- 只允许 `medium`、`high` 风险等级打开抽屉；只列出 `status === 'open'` 的风险。
- 保留现有统计卡片、趋势图、甘特图、风险图例与项目分析数据计算。
- 不新增接口、持久化、路由或模拟数据。
- 抽屉宽度约 340px，使用轻蒙层；点击蒙层空白处和关闭按钮都必须关闭。

---

### Task 1: 风险图交互与抽屉

**Files:**
- Modify: `tests/project-analytics-ui.spec.ts`
- Modify: `src/components/ProjectDetailPage.vue:1-125`
- Modify: `src/style.css:121-126`

**Interfaces:**
- Consumes: `ProjectDetail.risks` 中的 `title`、`level` 与 `status`，以及 `riskLevelLabel(level)`。
- Produces: `selectedRiskLevel: Ref<'medium' | 'high' | null>`、`selectedRiskTasks` 计算值、可点击风险 SVG 区块、`risk-task-drawer` 抽屉和关闭处理。

- [x] **Step 1: 写入失败的风险抽屉 UI 契约测试**

```ts
it('renders an accessible risk task drawer driven by medium and high risk selections', () => {
  const source = readFileSync('src/components/ProjectDetailPage.vue', 'utf8')
  const style = readFileSync('src/style.css', 'utf8')

  expect(source).toContain("const selectedRiskLevel = ref<'medium' | 'high' | null>(null)")
  expect(source).toContain("risk.status === 'open' && risk.level === selectedRiskLevel.value")
  expect(source).toContain('risk-donut-segment')
  expect(source).toContain('risk-task-drawer')
  expect(source).toContain('@click.self="selectedRiskLevel = null"')
  expect(source).toContain('暂无开放风险任务')
  expect(style).toContain('.risk-task-drawer {')
})
```

- [x] **Step 2: 运行测试，确认因抽屉功能缺失而失败**

Run: `npm test -- tests/project-analytics-ui.spec.ts`

Expected: 该新测试失败，提示未找到 `selectedRiskLevel` 或 `risk-task-drawer`。

- [x] **Step 3: 实现状态、可点击 SVG 风险图和抽屉结构**

```ts
const selectedRiskLevel = ref<'medium' | 'high' | null>(null)
const selectedRiskTasks = computed(() => selectedRiskLevel.value
  ? detail.value?.risks.filter((risk) => risk.status === 'open' && risk.level === selectedRiskLevel.value) ?? []
  : [],
)
```

将现有 `riskDonutStyle` 驱动的 `div` 改为 SVG 环形图。中、高风险路径以 `button` 语义、焦点态及 `@click` 打开对应等级；图例中的同等级行使用相同处理。添加仅在 `selectedRiskLevel` 存在时渲染的蒙层与 `aside.risk-task-drawer`，标题使用 `riskLevelLabel(selectedRiskLevel).label`，列表渲染 `selectedRiskTasks` 的 `title`，空列表显示“暂无开放风险任务”。关闭按钮和蒙层 `@click.self` 均赋值 `null`。

- [x] **Step 4: 为环形图和抽屉补充响应式样式**

```css
.risk-task-backdrop { position: fixed; inset: 0; background: rgb(15 23 42 / 12%); z-index: 20; }
.risk-task-drawer { position: fixed; top: 92px; right: 24px; width: min(340px, calc(100vw - 32px)); }
.risk-donut-segment { cursor: pointer; }
.risk-donut-segment:focus-visible { outline: none; stroke: #1677ff; }
```

保留现有图例、统计布局和 24px 卡片内边距。抽屉内部不作为浮动卡片的父容器嵌套，任务项使用轻量分隔列表；在窄屏时维持左右 16px 安全边距。

- [x] **Step 5: 运行目标测试，确认通过**

Run: `npm test -- tests/project-analytics-ui.spec.ts`

Expected: 测试文件中的全部断言通过。

- [x] **Step 6: 运行完整验证**

Run: `npm test`

Expected: 所有 Vitest 文件通过，无失败。

Run: `npm run build`

Expected: Vite 生产构建以退出码 0 完成。

- [ ] **Step 7: 审查变更并提交**

```bash
git diff --check -- src/components/ProjectDetailPage.vue src/style.css tests/project-analytics-ui.spec.ts
git add src/components/ProjectDetailPage.vue src/style.css tests/project-analytics-ui.spec.ts docs/superpowers/plans/2026-08-14-project-risk-drawer.md
git commit -m "feat: add project risk task drawer"
```
