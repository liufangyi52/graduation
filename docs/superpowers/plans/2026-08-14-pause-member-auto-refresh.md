# 暂停成员页自动刷新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 成员板块打开时不再被项目实时同步触发整页刷新。

**Architecture:** 在项目详情组件把“暂停实时刷新”的计算从单一分析标签扩展为分析和成员两个标签。实时服务和 API 保持原样，回调在暂停时直接返回。

**Tech Stack:** Vue 3、TypeScript、Vitest。

## Global Constraints

- 成员页和分析页均暂停实时整页刷新。
- 其他详情标签维持当前的实时同步。
- 不修改 Socket.IO 服务、API 或项目动态存储。

---

### Task 1: 扩展自动刷新暂停条件

**Files:**
- Modify: `src/components/ProjectDetailPage.vue`
- Test: `tests/project-detail-ui.spec.ts`

**Interfaces:**
- Consumes `activeTab` and existing `refreshProjectData()` realtime callbacks.
- Produces `isAutoRefreshPaused` for both analysis and members tabs.

- [ ] **Step 1: Write the failing UI source test**

```ts
expect(source).toContain("const isAutoRefreshPaused = computed(() => ['analytics', 'members'].includes(activeTab.value))")
expect(source).toContain('if (isAutoRefreshPaused.value) return')
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- tests/project-detail-ui.spec.ts`
Expected: FAIL because only analytics pauses refreshes.

- [ ] **Step 3: Implement the minimal refresh guard**

Replace `isViewingAnalytics` with `isAutoRefreshPaused`, computed from `analytics` and `members`, and use it as the first condition in `refreshProjectData()`.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npm test -- tests/project-detail-ui.spec.ts`
Expected: PASS.

- [ ] **Step 5: Run the production build**

Run: `npm run build`
Expected: `vue-tsc` and Vite exit with status 0.

- [ ] **Step 6: Commit only files owned by this change**

```bash
git add src/components/ProjectDetailPage.vue tests/project-detail-ui.spec.ts
git commit -m "fix: pause member detail refresh"
```
