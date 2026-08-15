import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

it('declares analytics and project export controls', () => {
  const source = readFileSync('src/components/ProjectDetailPage.vue', 'utf8')
  expect(source).toContain("{ id: 'analytics', label: '分析' }")
  expect(source).toContain('导出项目数据')
  expect(source).toContain('getProjectExportData')
  expect(source).toContain('随任务反馈实时更新')
})

it('renders the gantt region without the removed task burndown chart', () => {
  const source = readFileSync('src/components/ProjectDetailPage.vue', 'utf8')
  expect(source).toContain('project-gantt')
  expect(source).not.toContain('analytics-burndown-card')
  expect(source).not.toContain('burndown-chart')
  expect(source).toContain('completedAt: task.completedAt')
  expect(source).toContain('gantt-bar')
})

it('renders gantt bars by the planned date range', () => {
  const source = readFileSync('src/components/ProjectDetailPage.vue', 'utf8')

  expect(source).toContain('progress: task.progress')
  expect(source).toContain('class="gantt-bar"')
  expect(source).toContain('left: `${task.left}%`, width: `${task.width}%`')
  expect(source).not.toContain('gantt-today')
})

it('renders three gantt states and deadline risk labels', () => {
  const source = readFileSync('src/components/ProjectDetailPage.vue', 'utf8')
  const style = readFileSync('src/style.css', 'utf8')

  expect(source).toContain('gantt-legend-todo')
  expect(source).toContain('gantt-legend-progress')
  expect(source).toContain('gantt-legend-completed')
  expect(source).toContain('deadlineAlert')
  expect(source).toContain('临近截止')
  expect(source).toContain('已逾期')
  expect(style).toContain('.gantt-bar.status-todo')
  expect(style).toContain('.gantt-bar.status-in-progress')
  expect(style).toContain('.gantt-bar.status-completed')
})

it('renders the project-wide live completion rate instead of daily completion counts', () => {
  const source = readFileSync('src/components/ProjectDetailPage.vue', 'utf8')

  expect(source).toContain('实时完成率')
  expect(source).toContain('detail.project.progress')
  expect(source).toContain('随任务反馈实时更新')
  expect(source).not.toContain('completionTrendPoints')
  expect(source).not.toContain('analytics?.completionTrend')
})

it('uses spacious chart regions and padded metric cards for project analytics', () => {
  const source = readFileSync('src/components/ProjectDetailPage.vue', 'utf8')
  const style = readFileSync('src/style.css', 'utf8')

  for (const token of ['analytics-metric-grid', 'analytics-visual-grid', 'analytics-live-progress', 'risk-donut', 'analytics-gantt-card', 'analytics-gantt-scroll']) {
    expect(source).toContain(token)
  }
  expect(style).toContain('.analytics-metric-grid .metric-card { padding: 24px; }')
  expect(style).toContain('.analytics-gantt-scroll { overflow-x: auto; }')
})

it('opens a risk task drawer only for selected open medium or high risks', () => {
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

it('keeps the risk task popover close to the donut without a native focus frame', () => {
  const source = readFileSync('src/components/ProjectDetailPage.vue', 'utf8')
  const style = readFileSync('src/style.css', 'utf8')

  expect(source).toContain('<div v-if="selectedRiskLevel" class="risk-task-backdrop"')
  expect(style).toContain('.risk-task-backdrop { position: absolute; inset: 0; z-index: 3; background: transparent; }')
  expect(style).toContain('.risk-donut-segment:focus, .risk-donut-segment:focus-visible { outline: none; }')
})

it('renders legacy deadline warnings with their matching task title', () => {
  const source = readFileSync('src/components/ProjectDetailPage.vue', 'utf8')

  expect(source).toContain('function riskDisplayTitle')
  expect(source).toContain('detail.value?.tasks.find((task) => task.id === match[2])')
  expect(source).toContain('{{ riskDisplayTitle(risk) }}')
})

it('subscribes the manager dashboard and derives its completion trend from refreshed task data', () => {
  const source = readFileSync('src/App.vue', 'utf8')

  expect(source).toContain("import { createDashboardRealtimeService } from './services/dashboardRealtimeService'")
  expect(source).toContain("import { buildProjectAnalytics } from './utils/projectAnalytics'")
  expect(source).toContain('const dashboardCompletionTrend = computed(() =>')
  expect(source).toContain('completedAt: task.completedAt')
  expect(source).toContain('onProgress: refreshDashboardData')
  expect(source).toContain('dashboardRealtime?.syncProjects(data.projects.map((project) => project.id))')
  expect(source).toContain('v-for="point in dashboardCompletionTrend"')
})

it('uses stable responsive geometry for the dashboard trend and risk panels', () => {
  const style = readFileSync('src/style.css', 'utf8')

  expect(style).toContain('.bottom-grid { grid-template-columns: minmax(0, 7fr) minmax(300px, 4fr); align-items: stretch; }')
  expect(style).toContain('.bottom-grid > .panel { min-height: 330px; }')
  expect(style).toContain('.chart-panel { display: flex; flex-direction: column; overflow: hidden; }')
  expect(style).toContain('@media (max-width: 900px) { .top-grid, .bottom-grid { grid-template-columns: 1fr; }')
})

it('populates the efficiency page from reactive task analytics', () => {
  const source = readFileSync('src/App.vue', 'utf8')

  expect(source).toContain('averageDeliveryCycleDays')
  expect(source).toContain('buildMemberDeliveryEfficiency')
  expect(source).toContain('const memberDeliveryEfficiency = computed(() =>')
  expect(source).toContain('const averageDeliveryCycle = computed(() =>')
  expect(source).toContain('class="efficiency-trend"')
  expect(source).toContain('v-for="member in memberDeliveryEfficiency"')
  expect(source).toContain('averageDeliveryCycle.toFixed(1)')
  expect(source).not.toContain('暂无时间序列数据')
  expect(source).not.toContain('暂无足够的历史数据')
})

it('keeps efficiency panels and leaderboard rows geometrically stable', () => {
  const style = readFileSync('src/style.css', 'utf8')

  expect(style).toContain('.efficiency-panel { min-height: 360px; display: flex; flex-direction: column; overflow: hidden; }')
  expect(style).toContain('.efficiency-page .efficiency-panel { height: min(550px, 60vh); }')
  expect(style).toContain('.efficiency-trend, .efficiency-member-list { flex: 1; min-height: 0; overflow-y: auto; }')
  expect(style).toContain('.efficiency-member-row { display: grid; grid-template-columns: 24px 32px minmax(0, 1fr) auto;')
  expect(style).toContain('.efficiency-member-main { min-width: 0; }')
})
