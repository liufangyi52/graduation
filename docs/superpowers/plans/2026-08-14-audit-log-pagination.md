# 审计日志分页表格 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 将 /audit-logs 改造成审计人员可通过客户端分页查看的 15 行默认页大小、固定表头的日志表格。

**Architecture:** 审计日志继续由 createAuthService().listAuditLogs() 一次性读取，新的纯函数负责页码归一化和切片，确保可以用 Vitest 直接验证边界行为。App.vue 保存页码和每页条数状态，并以该纯函数派生当前页；样式仅增加审计表格与原生分页控件的局部类。

**Tech Stack:** Vue 3 Composition API、TypeScript、Vitest、Vite、现有 Lucide Vue 图标和 CSS 变量。

## Global Constraints

- 保持接口、数据库与字段顺序不变：时间、操作者、操作、对象、详情。
- 默认每页 15 条；每页选择器提供 15、30、50 条。
- 不创建任何弹窗，不更改角色权限，不伪造接口数据。
- 分页仅在总条数大于当前页大小时显示；空状态不显示分页控件。
- 详情只显示单行截断 JSON，完整字符串保留在原生 title 属性。

---

### Task 1: 可测试的分页派生工具

**Files:**
- Create: src/utils/auditPagination.ts
- Create: tests/audit-pagination.spec.ts

**Interfaces:**
- Produces: paginateAuditLogs<T>(items: readonly T[], requestedPage: number, pageSize: number): { items: T[]; page: number; pageCount: number; total: number }
- Produces: visibleAuditPages(page: number, pageCount: number): number[]
- Consumes: 任意只读日志数组；不依赖 Vue、DOM 或网络。

- [ ] **Step 1: Write the failing test**

~~~ts
import { describe, expect, it } from 'vitest'
import { paginateAuditLogs, visibleAuditPages } from '../src/utils/auditPagination'

const records = Array.from({ length: 32 }, (_, index) => ({ id: index + 1 }))

describe('audit log pagination', () => {
  it('renders exactly the first 15 records by default', () => {
    expect(paginateAuditLogs(records, 1, 15)).toMatchObject({
      total: 32,
      page: 1,
      pageCount: 3,
      items: records.slice(0, 15),
    })
  })

  it('returns the final partial page and clamps an out-of-range page', () => {
    expect(paginateAuditLogs(records, 99, 15)).toMatchObject({
      page: 3,
      items: records.slice(30, 32),
    })
  })

  it('returns a compact page window around the current page', () => {
    expect(visibleAuditPages(5, 9)).toEqual([3, 4, 5, 6, 7])
    expect(visibleAuditPages(1, 3)).toEqual([1, 2, 3])
  })

  it('uses the selected page size and preserves an empty audit list', () => {
    expect(paginateAuditLogs(records, 1, 30)).toMatchObject({
      page: 1,
      pageCount: 2,
      items: records.slice(0, 30),
    })
    expect(paginateAuditLogs([], 1, 15)).toMatchObject({
      total: 0,
      page: 1,
      pageCount: 1,
      items: [],
    })
  })
})
~~~

- [ ] **Step 2: Run test to verify it fails**

Run: npm test -- tests/audit-pagination.spec.ts

Expected: FAIL because ../src/utils/auditPagination does not exist.

- [ ] **Step 3: Write minimal implementation**

~~~ts
export function paginateAuditLogs<T>(items: readonly T[], requestedPage: number, pageSize: number) {
  const total = items.length
  const safeSize = Math.max(1, Math.trunc(pageSize))
  const pageCount = Math.max(1, Math.ceil(total / safeSize))
  const page = Math.min(Math.max(1, Math.trunc(requestedPage) || 1), pageCount)
  const start = (page - 1) * safeSize
  return { items: items.slice(start, start + safeSize), page, pageCount, total }
}

export function visibleAuditPages(page: number, pageCount: number) {
  const first = Math.max(1, Math.min(page - 2, Math.max(1, pageCount - 4)))
  return Array.from({ length: Math.min(5, pageCount) }, (_, index) => first + index)
}
~~~

- [ ] **Step 4: Run test to verify it passes**

Run: npm test -- tests/audit-pagination.spec.ts

Expected: PASS with 4 tests.

- [ ] **Step 5: Commit**

~~~powershell
git add src/utils/auditPagination.ts tests/audit-pagination.spec.ts
git commit -m "feat: add audit log pagination utilities"
~~~

### Task 2: 审计日志表格和原生分页控件

**Files:**
- Modify: src/App.vue:1-190, 667
- Modify: src/style.css:73-77, 110-113
- Modify: tests/audit-pagination.spec.ts

**Interfaces:**
- Consumes: paginateAuditLogs and visibleAuditPages from src/utils/auditPagination.ts.
- Consumes: existing auditLogs ref populated by auth.listAuditLogs(props.token).
- Produces: a currentAuditLogs computed collection and native pagination controls on /audit-logs.

- [ ] **Step 1: Bind pagination state and template in src/App.vue**

Add imports and page-local state beside auditLogs:

~~~ts
import { paginateAuditLogs, visibleAuditPages } from './utils/auditPagination'

const auditPage = ref(1)
const auditPageSize = ref(15)
const auditPageJump = ref(1)
const auditPagination = computed(() => paginateAuditLogs(auditLogs.value, auditPage.value, auditPageSize.value))
const auditPageNumbers = computed(() => visibleAuditPages(auditPagination.value.page, auditPagination.value.pageCount))
const currentAuditLogs = computed(() => auditPagination.value.items)
~~~

Add a watcher that synchronizes auditPage and auditPageJump to the helper's clamped page whenever log length, selected size, or requested page changes. Add setAuditPage(page: number) and setAuditPageSize(size: number); the latter sets page 1 before refreshing the derived state.

Replace the audit table's v-for="log in auditLogs" with v-for="log in currentAuditLogs", give the detail cell class="audit-log-details" and :title="String(log.details ?? '')", and append this non-modal control area after the table:

~~~vue
<nav v-if="auditPagination.total > auditPageSize" class="audit-pagination" aria-label="审计日志分页">
  <span class="audit-total">共 {{ auditPagination.total }} 条</span>
  <button class="icon-button" title="上一页" :disabled="auditPagination.page === 1" @click="setAuditPage(auditPagination.page - 1)"><ChevronLeft :size="16" /></button>
  <button v-for="page in auditPageNumbers" :key="page" class="audit-page-button" :class="{ selected: page === auditPagination.page }" :aria-current="page === auditPagination.page ? 'page' : undefined" @click="setAuditPage(page)">{{ page }}</button>
  <button class="icon-button" title="下一页" :disabled="auditPagination.page === auditPagination.pageCount" @click="setAuditPage(auditPagination.page + 1)"><ChevronRight :size="16" /></button>
  <form class="audit-page-jump" @submit.prevent="setAuditPage(auditPageJump)"><span>前往</span><input v-model.number="auditPageJump" type="number" min="1" :max="auditPagination.pageCount" aria-label="跳转页码" /><span>页</span><button type="submit">跳转</button></form>
  <label class="audit-page-size"><span>每页</span><select :value="auditPageSize" aria-label="每页条数" @change="setAuditPageSize(Number(($event.target as HTMLSelectElement).value))"><option :value="15">15 条/页</option><option :value="30">30 条/页</option><option :value="50">50 条/页</option></select></label>
</nav>
~~~

Keep the five supplied field headers unchanged and leave the existing empty state in place.

- [ ] **Step 2: Add targeted styling in src/style.css**

Create .audit-log-table-wrap with bounded block height and overflow: auto; set .audit-log-table-wrap thead th { position: sticky; top: 0; z-index: 1; }. Set fixed or minimum column widths so JSON details do not crowd the other fields. Style .audit-log-details with max-width, overflow: hidden, text-overflow: ellipsis, and white-space: nowrap. Use .audit-pagination as a wrapping flex row with 1px borders, 4px or smaller radius, existing --secondary for active page, and no elevated card. At max-width: 640px, stack only the jump and page-size groups while retaining horizontal table scroll.

- [ ] **Step 3: Run targeted test and production build**

Run: npm test -- tests/audit-pagination.spec.ts

Expected: PASS with 4 tests.

Run: npm run build

Expected: exit code 0 from vue-tsc --noEmit --incremental false && vite build.

- [ ] **Step 4: Inspect the page in development**

Run: npm run dev -- --host 127.0.0.1 --port 5173

Log in as an auditor and open /audit-logs. Verify: the top-right role label reads “审计人员”; the sidebar highlights “审计日志”; the table renders exactly 15 rows on page 1 when the endpoint returns more than 15 records; the table header remains visible while scrolling; previous/next, numeric pages, jump, and page size operate without a modal; table fields remain exactly 时间、操作者、操作、对象、详情.

- [ ] **Step 5: Commit**

~~~powershell
git add src/App.vue src/style.css tests/audit-pagination.spec.ts
git commit -m "feat: paginate audit logs"
~~~
