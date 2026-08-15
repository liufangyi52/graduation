# 移除项目动态标签 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除项目详情中会错误复用成员表的动态标签。

**Architecture:** 修改项目详情组件的本地标签数组和条件渲染，不触碰项目动态 API、实时订阅或事件存储。项目成员表仅在 `members` 标签激活时渲染。

**Tech Stack:** Vue 3、TypeScript、Vitest。

## Global Constraints

- 仅移除项目详情的动态标签入口。
- 保留后端动态数据、实时订阅和持久化逻辑。
- 成员表只能在 `activeTab === 'members'` 时显示。

---

### Task 1: 移除入口并收紧成员渲染分支

**Files:**
- Modify: `src/components/ProjectDetailPage.vue`
- Test: `tests/project-detail-ui.spec.ts`

**Interfaces:**
- Consumes local `tabs` and `activeTab` state.
- Produces a six-item project-detail tab strip with an explicit member branch.

- [ ] **Step 1: Write the failing UI source test**

```ts
expect(source).not.toContain("{ id: 'activity', label: '动态' }")
expect(source).toContain("v-else-if=\"activeTab === 'members'\"")
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- tests/project-detail-ui.spec.ts`
Expected: FAIL because the activity tab exists and members use a fallback branch.

- [ ] **Step 3: Implement the minimal template change**

Remove `{ id: 'activity', label: '动态' }` from `tabs` and change the trailing member article from `v-else` to `v-else-if="activeTab === 'members'"`.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm test -- tests/project-detail-ui.spec.ts`
Expected: PASS.

- [ ] **Step 5: Run the production build**

Run: `npm run build`
Expected: `vue-tsc` and Vite complete with exit status 0.

- [ ] **Step 6: Commit only files owned by this change**

```bash
git add src/components/ProjectDetailPage.vue tests/project-detail-ui.spec.ts
git commit -m "fix: remove project activity tab"
```
