import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const appSource = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
const styleSource = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8')
const workspaceSource = readFileSync(new URL('../src/services/workspaceService.ts', import.meta.url), 'utf8')

it('derives the navigation notification badge from unread state', () => {
  expect(appSource).toContain('const unreadNotificationCount = computed(() => data.notifications.filter((item) => !item.read).length)')
  expect(appSource).toContain("item.path === '/notifications' && unreadNotificationCount > 0")
  expect(appSource).toContain('{{ unreadNotificationCount }}</span>')
})

it('shows up to three unread notifications on the member dashboard with a framed entry point', () => {
  expect(appSource).toContain('const recentNotifications = computed(() => data.notifications.filter((item) => !item.read).slice(0, 3))')
  expect(appSource).toContain('v-for="item in recentNotifications"')
  expect(appSource).toContain('class="due-item normal" @click="openNotification(item)"')
  expect(appSource).toContain('class="wide-ghost" @click="navigate(\'/notifications\')"')
})

it('keeps the member dashboard priority table readable and aligned', () => {
  expect(appSource).toContain('{{ formatBeijingMinute(task.due) }}')
  expect(appSource).not.toContain('<small class="mono">{{ task.id }}</small></td><td>{{ task.project }}</td><td class="mono">{{ task.due }}</td>')
  expect(styleSource).toContain('.member-dashboard .top-grid { min-height: 480px; }')
  expect(styleSource).toContain('.member-dashboard .top-grid > .panel { display: flex; flex-direction: column; }')
  expect(styleSource).toContain('.member-dashboard .review-panel .table-wrap { flex: 1; }')
  expect(styleSource).toContain('.member-dashboard .due-panel .wide-ghost { margin-top: auto; }')
})

it('opens notification details in the current page and preserves the full notification body', () => {
  expect(workspaceSource).toContain('body: item.body ?? \'\'')
  expect(appSource).toContain('const selectedNotification = ref<(typeof data.notifications)[number] | null>(null)')
  expect(appSource).toContain('async function openNotification(item: (typeof data.notifications)[number])')
  expect(appSource).toContain('@click="openNotification(item)"')
  expect(appSource).toContain('v-if="selectedNotification" class="modal-backdrop"')
  expect(appSource).toContain('{{ selectedNotification.body || \'暂无详细内容\' }}')
  expect(appSource).toContain('{{ selectedNotification.read ? \'已读\' : \'未读\' }}')
  expect(appSource).not.toContain('navigate(path)')
})

it('provides the notification composer only to administrators and shows notification bodies in the list', () => {
  expect(appSource).toContain("v-if=\"props.user.role === 'admin'\"")
  expect(appSource).toContain('发送通知')
  expect(appSource).toContain('{{ item.body }}')
  expect(appSource).toContain('sendNotification')
})
