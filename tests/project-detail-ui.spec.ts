import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/components/ProjectDetailPage.vue', import.meta.url), 'utf8')

it('renders project detail tabs and role-aware controls', () => {
  expect(source).toContain('概览')
  expect(source).toContain('任务')
  expect(source).toContain('会议')
  expect(source).toContain('风险')
  expect(source).toContain('成员')
  expect(source).toContain('canManageMembers')
  expect(source).toContain('function openMeeting')
})

it('defines project detail routes', () => {
  const router = readFileSync(new URL('../src/router.ts', import.meta.url), 'utf8')
  expect(router).toContain("path: '/projects/:id'")
  expect(router).toContain("path: '/projects/:id/meetings'")
})

it('defines a scannable and responsive project detail layout', () => {
  const styles = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8')

  expect(source).toContain('class="project-summary-main"')
  expect(source).toContain('class="project-summary-facts"')
  expect(source).toContain('class="project-overview-body"')
  expect(source).toContain('class="metric-grid project-metrics"')
  expect(styles).toContain('.project-detail-header {')
  expect(styles).toContain('.project-summary-main {')
  expect(styles).toContain('.project-detail-page .detail-tabs {')
  expect(styles).toContain('@media (max-width: 900px)')
})

it('gives the active project detail tab a distinct visual state', () => {
  const styles = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8')

  expect(source).toContain(':class="{ selected: activeTab === tab.id }"')
  expect(styles).toContain('.detail-tabs button.selected {')
  expect(styles).toContain('color: var(--secondary)')
  expect(styles).toContain('font-weight: 700')
  expect(styles).toContain('border-bottom: 2px solid var(--secondary)')
})

it('formats the project summary deadline without an ISO suffix', () => {
  expect(source).toContain("import { formatBeijingMinute } from '../utils/date'")
  expect(source).toContain("{{ detail.project.endDate ? formatBeijingMinute(detail.project.endDate) : '未设置' }}")
})

it('renders the project health summary without member progress or activity panels', () => {
  const styles = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8')
  expect(source).toContain('项目健康度')
  expect(source).not.toContain('成员进度')
  expect(source).not.toContain('最新动态')
  expect(source).toContain('gantt-bar')
  expect(styles).toContain('.project-health-grid')
  expect(styles).not.toContain('.realtime-overview')
})

it('labels health and metrics as personal when the detail response is member-scoped', () => {
  expect(source).toContain("detail.scope === 'personal'")
  expect(source).toContain('我的任务健康度')
  expect(source).toContain('我的任务数')
})

it('makes the three Gantt task states visibly distinct', () => {
  const styles = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8')

  expect(source).toContain('gantt-legend-todo')
  expect(source).toContain('gantt-legend-progress')
  expect(source).toContain('gantt-legend-completed')
  expect(source).toContain('deadlineAlert')
  expect(styles).toContain('.gantt-bar.status-todo')
  expect(styles).toContain('.gantt-bar.status-in-progress')
  expect(styles).toContain('.gantt-bar.status-completed')
  expect(styles).toContain('.gantt-progress-label')
})

it('does not render a current-day marker over Gantt task bars', () => {
  const styles = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8')

  expect(source).not.toContain('ganttTodayLeft')
  expect(source).not.toContain('gantt-today')
  expect(styles).not.toContain('.gantt-today')
})

it('keeps realtime project progress active while analytics is open', () => {
  expect(source).toContain("const isAutoRefreshPaused = computed(() => activeTab.value === 'members')")
  expect(source).toContain('if (isAutoRefreshPaused.value) return')
  expect(source).toContain('onProgress: refreshProjectData')
  expect(source).toContain('onDisconnected: refreshProjectData')
})

it('does not expose an activity tab or use members as a fallback panel', () => {
  expect(source).not.toContain("{ id: 'activity', label: '动态' }")
  expect(source).toContain("v-else-if=\"activeTab === 'members'\"")
})
