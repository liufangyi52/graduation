# 新增账号反馈 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在新增账号弹窗中提供字段校验、提交中状态和持久的成功或失败反馈。

**Architecture:** `App.vue` 增加创建账号的字段错误、提交错误和提交中状态，并通过纯校验函数在请求前阻止无效数据。弹窗绑定这些状态并在接口失败时原地显示错误；现有账号创建接口和成功后的本地列表更新保持不变。

**Tech Stack:** Vue 3 Composition API、TypeScript、Vitest、Vite、现有 CSS 变量。

## Global Constraints

- 邮箱必须匹配 `/^\S+@\S+\.\S+$/`，密码至少 8 位，姓名不能为空。
- 创建中禁止关闭、取消和重复提交；失败后恢复可操作状态。
- 不修改 `POST /users` 接口、服务端校验、角色或审计记录。
- 成功后关闭弹窗、清空表单、将接口返回账号加入 `managedUsers`。

---

### Task 1: 创建账号反馈契约

**Files:**
- Create: `tests/account-creation-feedback-ui.spec.ts`
- Read: `src/App.vue`, `src/style.css`

**Interfaces:**
- Produces: 表单校验、提交状态和弹窗错误显示的前端契约。

- [ ] **Step 1: 写入失败测试**

```ts
import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')

it('keeps account creation feedback inside the modal', () => {
  for (const name of ['createUserErrors', 'createUserSubmitError', 'creatingUser', 'validateNewUser', 'aria-busy']) expect(app).toContain(name)
  expect(app).toContain('请输入有效的邮箱地址')
  expect(app).toContain('创建中...')
  expect(app).toContain(':disabled="creatingUser"')
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/account-creation-feedback-ui.spec.ts`

Expected: FAIL，因为当前弹窗没有字段错误、提交中状态或弹窗内错误文本。

### Task 2: 实现校验和提交反馈

**Files:**
- Modify: `src/App.vue:120-145, 441-455, 854`
- Modify: `src/style.css` beside `.modal-field`
- Test: `tests/account-creation-feedback-ui.spec.ts`

**Interfaces:**
- Produces: `validateNewUser(): boolean`、`createUserErrors`、`createUserSubmitError`、`creatingUser`。
- Consumes: `auth.createUser`、`managedUsers`、现有 `flash`。

- [ ] **Step 1: 添加表单状态和纯校验函数**

```ts
const createUserErrors = ref({ name: '', email: '', password: '' })
const createUserSubmitError = ref('')
const creatingUser = ref(false)

function validateNewUser() {
  createUserErrors.value = {
    name: newUserName.value.trim() ? '' : '请输入姓名',
    email: /^\S+@\S+\.\S+$/.test(newUserEmail.value.trim()) ? '' : '请输入有效的邮箱地址',
    password: newUserPassword.value.length >= 8 ? '' : '密码至少需要 8 位',
  }
  return !Object.values(createUserErrors.value).some(Boolean)
}
```

- [ ] **Step 2: 更新创建处理函数**

```ts
async function createManagedUser() {
  if (!validateNewUser()) return
  creatingUser.value = true
  createUserSubmitError.value = ''
  try {
    const created = await auth.createUser(props.token, { name: newUserName.value.trim(), email: newUserEmail.value.trim(), password: newUserPassword.value, role: roleDraft.value })
    managedUsers.value.push(created)
    closeCreateUser()
    flash('账号已创建')
  } catch (reason) {
    createUserSubmitError.value = reason instanceof Error ? reason.message : '账号创建失败，请稍后重试'
  } finally {
    creatingUser.value = false
  }
}
```

实现 `closeCreateUser()`，关闭弹窗并重置输入、字段错误和提交错误；打开弹窗的按钮改为调用 `openCreateUser()`，该函数同样先重置状态再打开。

- [ ] **Step 3: 绑定模态框字段和操作按钮**

```vue
<input v-model="newUserEmail" type="email" :aria-describedby="createUserErrors.email ? 'new-user-email-error' : undefined" :disabled="creatingUser" />
<small v-if="createUserErrors.email" id="new-user-email-error" class="form-error">{{ createUserErrors.email }}</small>
<p v-if="createUserSubmitError" class="form-error" role="alert">{{ createUserSubmitError }}</p>
<button class="secondary-button" :disabled="creatingUser" @click="closeCreateUser">取消</button>
<button class="primary-button" :aria-busy="creatingUser" :disabled="creatingUser" @click="createManagedUser">{{ creatingUser ? '创建中...' : '创建账号' }}</button>
```

姓名输入框使用 `:aria-describedby="createUserErrors.name ? 'new-user-name-error' : undefined"`，其后紧跟 `<small v-if="createUserErrors.name" id="new-user-name-error" class="form-error">{{ createUserErrors.name }}</small>`。密码输入框使用 `:aria-describedby="createUserErrors.password ? 'new-user-password-error' : undefined"`，其后紧跟 `<small v-if="createUserErrors.password" id="new-user-password-error" class="form-error">{{ createUserErrors.password }}</small>`。关闭按钮和遮罩关闭条件在 `creatingUser` 为真时禁用。

- [ ] **Step 4: 增加错误样式**

```css
.form-error { display: block; margin-top: 6px; color: var(--danger); font-size: 11px; line-height: 1.4; }
.modal-field input[aria-describedby] { border-color: var(--danger); }
```

- [ ] **Step 5: 运行定向测试确认通过**

Run: `npm test -- tests/account-creation-feedback-ui.spec.ts`

Expected: PASS。

### Task 3: 验证

**Files:**
- Verify: `src/App.vue`, `src/style.css`, `tests/account-creation-feedback-ui.spec.ts`

- [ ] **Step 1: 运行相关测试**

Run: `npm test -- tests/account-creation-feedback-ui.spec.ts tests/admin-account-management.spec.ts`

Expected: PASS。

- [ ] **Step 2: 运行生产构建**

Run: `npm run build`

Expected: PASS。

- [ ] **Step 3: 检查本地页面**

在 `http://127.0.0.1:5173/users` 输入 `163.com` 并点击创建，确认邮箱下方显示错误且不发送请求；输入有效邮箱并提交，确认按钮显示“创建中...”，成功后列表新增账号，失败时弹窗内显示错误并保持打开。
