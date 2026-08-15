# 账号角色标签内联编辑 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让账号管理表格默认只显示角色标签，点击标签后才显示下拉框并保存角色修改。

**Architecture:** 在 `App.vue` 中增加单一编辑目标状态和角色更新处理函数，成功后更新本地账号并退出编辑，失败时保留编辑状态并复用现有提示。角色列模板在静态标签和下拉框之间切换；`style.css` 为标签按钮提供无边框、悬停和键盘焦点样式，保持表格列宽稳定。

**Tech Stack:** Vue 3 Composition API、TypeScript、Vitest、Vite、现有 CSS 变量。

## Global Constraints

- 非编辑状态不渲染角色下拉框，只显示 `systemRoleLabel(managed.role)` 标签。
- 编辑状态只允许一个账号，角色选项固定为 `manager`、`member`、`admin`、`auditor`。
- 保存复用 `auth.updateUser`；失败时不修改本地角色并保留编辑状态。
- 不修改后端权限模型、角色值、接口或账号表格其他列。
- 保留浅色后台视觉、主色和现有小圆角，不引入新依赖。

---

### Task 1: 角色内联编辑行为契约

**Files:**
- Create: `tests/account-role-inline-edit-ui.spec.ts`
- Read: `src/App.vue`, `src/style.css`

**Interfaces:**
- Produces: 可验证的模板与样式契约，约束默认标签、编辑切换和角色选项。
- Consumes: 当前账号管理表格中的 `managedUsers`、`systemRoleLabel` 和 `auth.updateUser`。

- [ ] **Step 1: 写入失败测试**

```ts
import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

it('uses a clickable role tag and conditional select for account role editing', () => {
  const app = source('../src/App.vue')
  const styles = source('../src/style.css')

  expect(app).toContain('editingManagedUserId')
  expect(app).toContain('role-tag-button')
  expect(app).toContain('updateManagedUserRole')
  expect(app).toContain('v-if="editingManagedUserId !== managed.id"')
  expect(app).toContain('value="manager"')
  expect(app).toContain('value="member"')
  expect(app).toContain('value="admin"')
  expect(app).toContain('value="auditor"')
  expect(styles).toContain('.role-tag-button')
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/account-role-inline-edit-ui.spec.ts`

Expected: FAIL，因为当前账号表格没有 `editingManagedUserId`、角色标签按钮或专用样式。

- [ ] **Step 3: 提交测试文件**

```powershell
git add tests/account-role-inline-edit-ui.spec.ts
git commit -m "test: define inline account role editing contract"
```

### Task 2: 实现角色标签点击编辑

**Files:**
- Modify: `src/App.vue:84-145, 844`
- Modify: `src/style.css:75` beside the existing `.tag` styles
- Test: `tests/account-role-inline-edit-ui.spec.ts`

**Interfaces:**
- Produces: `editingManagedUserId: Ref<string | null>`、`updateManagedUserRole(managed: ManagedUser, role: UserRole): Promise<void>`。
- Consumes: 现有 `auth.updateUser`、`flash`、`systemRoleLabel`。

- [ ] **Step 1: 增加单一编辑目标和保存函数**

```ts
const editingManagedUserId = ref<string | null>(null)

function startManagedUserRoleEdit(userId: string) {
  editingManagedUserId.value = userId
}

async function updateManagedUserRole(managed: ManagedUser, role: UserRole) {
  try {
    await auth.updateUser(props.token, managed.id, { role })
    managed.role = role
    editingManagedUserId.value = null
  } catch (reason) {
    flash(reason instanceof Error ? reason.message : '角色更新失败')
  }
}
```

- [ ] **Step 2: 替换角色列模板**

```vue
<td>
  <button
    v-if="editingManagedUserId !== managed.id"
    type="button"
    class="role-tag-button"
    :aria-label="`编辑角色：${systemRoleLabel(managed.role).label}`"
    @click="startManagedUserRoleEdit(managed.id)"
  >
    <span class="tag" :class="systemRoleLabel(managed.role).tone">{{ systemRoleLabel(managed.role).label }}</span>
  </button>
  <select
    v-else
    :value="managed.role"
    aria-label="选择系统角色"
    @change="updateManagedUserRole(managed, ($event.target as HTMLSelectElement).value as UserRole)"
  >
    <option value="manager">项目经理</option>
    <option value="member">项目成员</option>
    <option value="admin">系统管理员</option>
    <option value="auditor">审计员</option>
  </select>
</td>
```

- [ ] **Step 3: 增加稳定的标签按钮样式**

```css
.role-tag-button {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.role-tag-button:hover .tag {
  border-color: var(--primary);
}

.role-tag-button:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
  border-radius: 6px;
}

.table-panel td select[aria-label="选择系统角色"] {
  width: 128px;
  min-height: 32px;
}
```

- [ ] **Step 4: 运行定向测试确认通过**

Run: `npm test -- tests/account-role-inline-edit-ui.spec.ts`

Expected: PASS，模板契约和样式契约均通过。

- [ ] **Step 5: 提交实现**

由于 `src/App.vue` 当前包含其他未提交修改，提交前只检查并保留这些现有改动；不要使用整文件回退或覆盖操作。

### Task 3: 完整验证与界面检查

**Files:**
- Verify: `src/App.vue`, `src/style.css`, `tests/account-role-inline-edit-ui.spec.ts`

- [ ] **Step 1: 运行相关测试**

Run: `npm test -- tests/account-role-inline-edit-ui.spec.ts tests/admin-account-management.spec.ts tests/system-label-ui.spec.ts`

Expected: PASS，角色 UI 契约、管理员账号服务和系统标签测试全部通过。

- [ ] **Step 2: 运行生产构建**

Run: `npm run build`

Expected: PASS，Vue 类型检查和 Vite 构建均以 0 退出。

- [ ] **Step 3: 检查 `/users` 页面**

在现有开发服务器打开 `http://127.0.0.1:5173/users`，确认角色列默认只有标签；点击任意标签后仅该行显示下拉框；选择角色后标签立即更新并恢复静态状态；更新失败时仍保留下拉框并显示错误提示；键盘 Tab 可聚焦标签并显示焦点环。
