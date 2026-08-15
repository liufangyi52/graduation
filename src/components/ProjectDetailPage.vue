<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { X } from 'lucide-vue-next'
import { createWorkspaceService, type ProjectDetail } from '../services/workspaceService'
import type { UserAccount } from '../services/authService'
import { analysisStatusLabel, priorityLabel, projectRoleLabel, projectStatusLabel, riskLevelLabel, riskStatusLabel, systemRoleLabel, taskStatusLabel } from '../utils/labels'
import { buildProjectAnalytics } from '../utils/projectAnalytics'
import { downloadProjectExport, type ExportKind } from '../utils/projectExport'
import { formatBeijingMinute } from '../utils/date'
import { createProjectRealtimeService } from '../services/projectRealtimeService'

const props = defineProps<{ token: string; user: UserAccount }>()
const route = useRoute()
const router = useRouter()
const service = createWorkspaceService(props.token)
const detail = ref<ProjectDetail | null>(null)
const loading = ref(true)
const error = ref('')
const activeTab = ref(String(route.name) === 'project-meetings' ? 'meetings' : 'overview')
const isAutoRefreshPaused = computed(() => activeTab.value === 'members')
const tabs = [
  { id: 'overview', label: '概览' },
  { id: 'analytics', label: '分析' },
  { id: 'tasks', label: '任务' },
  { id: 'meetings', label: '会议' },
  { id: 'risks', label: '风险' },
  { id: 'members', label: '成员' },
]
const canManage = computed(() => Boolean(detail.value?.permissions.canEdit))
const exportBusy = ref('')
const exportLabel = '导出项目数据'
const selectedRiskLevel = ref<'medium' | 'high' | null>(null)
const lastSyncedAt = ref('')
let realtime: ReturnType<typeof createProjectRealtimeService> | undefined
const analytics = computed(() => detail.value ? buildProjectAnalytics({
  tasks: detail.value.tasks.map((task) => ({ id: task.id, title: task.title, status: task.status, progress: task.progress, createdAt: task.createdAt, completedAt: task.completedAt, dueDate: task.dueDate })),
  risks: detail.value.risks.map((risk) => ({ id: risk.id, level: risk.level, status: risk.status })),
}, new Date().toISOString()) : null)
function ganttStatusLabel(status: 'todo' | 'in_progress' | 'completed') {
  return { todo: '未完成', in_progress: '进行中', completed: '已完成' }[status]
}
function ganttDeadlineLabel(task: { deadlineAlert: 'overdue' | 'due_soon' | null; deadlineDaysLeft: number | null }) {
  if (task.deadlineAlert === 'overdue') return '已逾期'
  return `临近截止 · 剩 ${task.deadlineDaysLeft} 天`
}
const selectedRiskTasks = computed(() => selectedRiskLevel.value
  ? detail.value?.risks.filter((risk) => risk.status === 'open' && risk.level === selectedRiskLevel.value) ?? []
  : [],
)
const riskLevels = ['high', 'medium', 'low'] as const
const riskDonutSegments = computed(() => {
  const points = analytics.value?.riskDistribution ?? []
  const total = points.reduce((sum, point) => sum + point.count, 0)
  if (!total) return []
  const colors = { high: '#ff4d4f', medium: '#faad14', low: '#52c41a' }
  let offset = 0
  return riskLevels.flatMap((level) => {
    const count = points.find((point) => point.level === level)?.count ?? 0
    if (!count) return []
    const length = count / total * 100
    const segment = { level, color: colors[level], dasharray: `${length} ${100 - length}`, dashoffset: -offset, count }
    offset += length
    return [segment]
  })
})
function isSelectableRiskLevel(level: string): level is 'medium' | 'high' { return level === 'medium' || level === 'high' }
function openRiskTasks(level: typeof riskLevels[number]) {
  if (isSelectableRiskLevel(level)) selectedRiskLevel.value = level
}
function riskDisplayTitle(risk: ProjectDetail['risks'][number]) {
  const match = /^(任务逾期|任务临近截止)：(.+)$/.exec(risk.title)
  const task = match ? detail.value?.tasks.find((task) => task.id === match[2]) : undefined
  return task ? `${match![1]}：${task.title}` : risk.title
}
async function load() {
  loading.value = true
  error.value = ''
  try { detail.value = await service.getProjectDetail(String(route.params.id)); lastSyncedAt.value = new Date().toISOString() } catch (reason) { error.value = reason instanceof Error ? reason.message : '项目详情加载失败' } finally { loading.value = false }
}
function refreshProjectData() {
  if (isAutoRefreshPaused.value) return
  void load()
}
function selectTab(tab: string) {
  activeTab.value = tab
  const path = tab === 'meetings' ? `/projects/${route.params.id}/meetings` : `/projects/${route.params.id}`
  router.replace(path)
}
function openTask(taskId: string) { router.push(`/tasks?project=${route.params.id}&task=${taskId}`) }
function openMeeting(meetingId: string) { router.push(`/meetings/${meetingId}/review`) }
async function exportProject(kind: ExportKind, format: 'xlsx' | 'pdf') {
  if (!canManage.value || !detail.value) return
  exportBusy.value = `${kind}-${format}`
  try { const payload = await service.getProjectExportData(detail.value.project.id, kind); await downloadProjectExport(payload, kind, format) } catch (reason) { error.value = reason instanceof Error ? reason.message : '导出失败' } finally { exportBusy.value = '' }
}
onMounted(async () => { await load(); realtime = createProjectRealtimeService({ token: props.token, projectId: String(route.params.id), onProgress: refreshProjectData, onDisconnected: refreshProjectData }); realtime.connect() })
onBeforeUnmount(() => realtime?.disconnect())
</script>

<template>
  <section class="page-section project-detail-page">
    <div v-if="loading" class="panel empty-cell">正在加载项目详情…</div>
    <div v-else-if="error" class="panel empty-cell"><p>{{ error }}</p><button class="small-button" @click="load">重试</button></div>
    <template v-else-if="detail">
      <article class="panel project-detail-header">
        <div class="project-summary-main">
          <div class="project-identity">
            <div class="project-identity-top"><p class="eyebrow">PROJECT DETAIL · {{ detail.project.code }}</p><span class="tag" :class="projectStatusLabel(detail.project.status).tone">{{ projectStatusLabel(detail.project.status).label }}</span></div>
            <h2>{{ detail.project.name }}</h2>
            <p class="muted">负责人 {{ detail.project.ownerName }} · {{ detail.counts.members }} 名成员</p>
          </div>
          <div class="project-summary-facts">
            <div><span>完成率</span><strong>{{ detail.project.progress }}%</strong></div>
            <div><span>截止日期</span><strong>{{ detail.project.endDate ? formatBeijingMinute(detail.project.endDate) : '未设置' }}</strong></div>
            <div><span>待审核</span><strong>{{ detail.counts.pendingReviews }}</strong></div>
          </div>
        </div>
      </article>
      <nav class="detail-tabs" aria-label="项目详情标签"><button v-for="tab in tabs" :key="tab.id" :class="{ selected: activeTab === tab.id }" @click="selectTab(tab.id)">{{ tab.label }}</button></nav>
      <p v-if="detail.scope === 'personal'" class="meeting-notice muted">我的任务健康度 · 我的任务数</p>
      <article v-if="activeTab === 'overview'" class="panel detail-panel"><div class="panel-heading"><div><p class="eyebrow">LIVE PROJECT STATUS</p><h3>项目健康度</h3></div><small class="muted">同步于 {{ lastSyncedAt ? formatBeijingMinute(lastSyncedAt) : '-' }}</small></div><div class="project-health-grid"><div><span>完成率</span><b>{{ detail.project.progress }}%</b></div><div><span>进行中</span><b>{{ detail.health.activeTasks }}</b></div><div><span>待开始</span><b>{{ detail.health.blockedTasks }}</b></div><div><span>逾期</span><b>{{ detail.health.overdueTasks }}</b></div><div><span>风险</span><b>{{ detail.health.openRisks }}</b></div></div></article>
      <article v-if="activeTab === 'overview'" class="panel detail-panel"><div class="panel-heading"><h3>项目概览</h3><button v-if="canManage" class="small-button" @click="router.push(`/projects/${route.params.id}?edit=1`)">编辑项目</button></div><div class="project-overview-body"><p class="task-description">{{ detail.project.description || '暂无项目描述' }}</p><div class="metric-grid project-metrics"><div class="metric-card"><span>任务总数</span><strong>{{ detail.counts.tasks }}</strong></div><div class="metric-card"><span>已完成</span><strong>{{ detail.counts.completedTasks }}</strong></div><div class="metric-card"><span>开放风险</span><strong>{{ detail.counts.openRisks }}</strong></div></div></div></article>
      <template v-else-if="activeTab === 'analytics'">
        <article class="panel detail-panel analytics-summary-card">
          <div class="panel-heading"><div><p class="eyebrow">PROJECT ANALYTICS</p><h3>项目分析</h3></div><div v-if="canManage" class="export-actions"><span class="sr-only">{{ exportLabel }}</span><button v-for="kind in (['meetings', 'tasks', 'summary'] as ExportKind[])" :key="kind" class="small-button" :disabled="Boolean(exportBusy)" @click="exportProject(kind, 'xlsx')">导出{{ kind === 'meetings' ? '会议' : kind === 'tasks' ? '任务' : '统计' }} Excel</button><button class="small-button" :disabled="Boolean(exportBusy)" @click="exportProject('summary', 'pdf')">导出项目统计 PDF</button></div></div>
          <div class="metric-grid project-metrics analytics-metric-grid"><div class="metric-card"><span>任务总数</span><strong>{{ analytics?.metrics.totalTasks }}</strong></div><div class="metric-card"><span>实时完成率</span><strong>{{ detail.project.progress }}%</strong></div><div class="metric-card"><span>逾期任务</span><strong>{{ analytics?.metrics.overdueTasks }}</strong></div><div class="metric-card"><span>开放风险</span><strong>{{ analytics?.metrics.openRisks }}</strong></div></div>
        </article>
        <div class="analytics-visual-grid">
          <article class="panel detail-panel analytics-chart-card"><div class="panel-heading"><div><p class="eyebrow">LIVE DELIVERY</p><h3>实时完成率</h3></div><span class="muted">随任务反馈实时更新</span></div><div class="analytics-live-progress"><strong>{{ detail.project.progress }}%</strong><span>全体成员任务平均进度</span><div class="progress-track"><span :style="{ width: `${detail.project.progress}%` }"></span></div><small>{{ detail.counts.completedTasks }}/{{ detail.counts.tasks }} 项任务已完成</small></div></article>
          <article class="panel detail-panel analytics-chart-card"><div class="panel-heading"><div><p class="eyebrow">RISK DISTRIBUTION</p><h3>风险分布</h3></div><span class="muted">开放风险</span></div><div v-if="!analytics?.riskDistribution.length" class="empty-cell">暂无开放风险</div><div v-else class="risk-chart-body"><div class="risk-donut"><svg viewBox="0 0 42 42" aria-label="风险分布图"><circle v-for="item in riskDonutSegments" :key="item.level" class="risk-donut-ring" :class="{ 'risk-donut-segment': isSelectableRiskLevel(item.level) }" cx="21" cy="21" r="15.915" fill="none" :stroke="item.color" stroke-width="7" pathLength="100" :stroke-dasharray="item.dasharray" :stroke-dashoffset="item.dashoffset" :tabindex="isSelectableRiskLevel(item.level) ? 0 : -1" :role="isSelectableRiskLevel(item.level) ? 'button' : undefined" :aria-label="`${riskLevelLabel(item.level).label} ${item.count} 项${isSelectableRiskLevel(item.level) ? '，查看任务' : ''}`" @click="openRiskTasks(item.level)" @keydown.enter.prevent="openRiskTasks(item.level)" @keydown.space.prevent="openRiskTasks(item.level)" /></svg><div class="risk-donut-center"><strong>{{ analytics.metrics.openRisks }}</strong><span>开放风险</span></div></div><div class="risk-legend"><template v-for="item in analytics.riskDistribution" :key="item.level"><button v-if="isSelectableRiskLevel(item.level)" class="risk-legend-button" type="button" @click="openRiskTasks(item.level)"><span><i :class="`risk-dot ${item.level}`"></i>{{ riskLevelLabel(item.level).label }}</span><b>{{ item.count }}</b></button><div v-else class="risk-legend-row"><span><i :class="`risk-dot ${item.level}`"></i>{{ riskLevelLabel(item.level).label }}</span><b>{{ item.count }}</b></div></template></div><div v-if="selectedRiskLevel" class="risk-task-backdrop" @click.self="selectedRiskLevel = null"><aside class="risk-task-drawer" role="dialog" aria-modal="true" aria-labelledby="risk-task-drawer-title"><div class="risk-task-drawer-head"><div><p class="eyebrow">RISK TASKS</p><h3 id="risk-task-drawer-title">{{ riskLevelLabel(selectedRiskLevel).label }}任务</h3></div><button class="icon-button" type="button" title="关闭风险任务列表" aria-label="关闭风险任务列表" @click="selectedRiskLevel = null"><X :size="18" /></button></div><ul v-if="selectedRiskTasks.length" class="risk-task-list"><li v-for="risk in selectedRiskTasks" :key="risk.id">{{ riskDisplayTitle(risk) }}</li></ul><p v-else class="empty-cell">暂无开放风险任务</p></aside></div></div></article>
        </div>
        <article class="panel detail-panel analytics-gantt-card"><div class="panel-heading"><div><p class="eyebrow">TASK PLAN</p><h3>任务计划甘特图</h3><div class="gantt-legend" aria-label="甘特图图例"><span><i class="gantt-legend-todo"></i>未完成</span><span><i class="gantt-legend-progress"></i>进行中</span><span><i class="gantt-legend-completed"></i>已完成</span></div></div><span v-if="analytics?.ganttRange" class="muted">{{ analytics.ganttRange.start }} 至 {{ analytics.ganttRange.end }}</span></div><div v-if="!analytics?.ganttRange" class="empty-cell">暂无可绘制的任务日期</div><div v-else class="analytics-gantt-scroll" role="img" :aria-label="`任务计划：${analytics.ganttRange.start} 至 ${analytics.ganttRange.end}`"><div class="analytics-gantt-header"><span>任务</span><div class="gantt-axis"><span>{{ analytics.ganttRange.start }}</span><span>{{ analytics.ganttRange.end }}</span></div><span>状态 / 截止</span></div><div class="project-gantt"><div v-for="task in analytics.ganttTasks" :key="task.id" class="gantt-row"><span>{{ task.title }}</span><div class="gantt-track"><i class="gantt-bar" :class="`status-${task.displayStatus}`" :style="{ left: `${task.left}%`, width: `${task.width}%` }"></i></div><div class="gantt-progress-label"><b class="gantt-state-label" :class="`status-${task.displayStatus}`">{{ ganttStatusLabel(task.displayStatus) }}</b><b v-if="task.deadlineAlert" class="gantt-deadline-alert" :class="task.deadlineAlert">{{ ganttDeadlineLabel(task) }}</b><small>{{ task.start }} 至 {{ task.end }}</small></div></div></div></div><p v-if="analytics?.undatedTasks.length" class="muted">另有 {{ analytics.undatedTasks.length }} 个任务未设置有效截止日期。</p></article>
      </template>
      <article v-else-if="activeTab === 'tasks'" class="panel table-panel detail-panel"><div class="panel-heading"><h3>项目任务</h3><button class="small-button" @click="router.push(`/tasks?project=${route.params.id}`)">打开任务看板</button></div><div class="table-wrap"><table><thead><tr><th>任务</th><th>负责人</th><th>优先级</th><th>状态</th><th>截止</th></tr></thead><tbody><tr v-for="task in detail.tasks" :key="task.id" @click="openTask(task.id)"><td><strong>{{ task.title }}</strong><small>{{ task.description }}</small></td><td>{{ task.assigneeName }}</td><td><span class="tag" :class="priorityLabel(task.priority).tone">{{ priorityLabel(task.priority).label }}</span></td><td><span class="tag" :class="taskStatusLabel(task.status).tone">{{ taskStatusLabel(task.status).label }}</span></td><td>{{ task.dueDate ? formatBeijingMinute(task.dueDate) : '-' }}</td></tr><tr v-if="!detail.tasks.length"><td colspan="5" class="empty-cell">暂无项目任务</td></tr></tbody></table></div></article>
      <article v-else-if="activeTab === 'meetings'" class="panel table-panel detail-panel"><div class="panel-heading"><h3>项目会议</h3></div><div class="table-wrap"><table><thead><tr><th>会议标题</th><th>创建时间</th><th>版本数</th><th>审核状态</th><th></th></tr></thead><tbody><tr v-for="meeting in detail.meetings" :key="meeting.id"><td><strong>{{ meeting.title }}</strong></td><td>{{ formatBeijingMinute(meeting.createdAt) }}</td><td>{{ meeting.versionCount }}</td><td><span class="tag" :class="analysisStatusLabel(meeting.latestAnalysisStatus || '未分析').tone">{{ analysisStatusLabel(meeting.latestAnalysisStatus || '未分析').label }}</span></td><td><button class="small-button" @click="openMeeting(meeting.id)">查看审核</button></td></tr><tr v-if="!detail.meetings.length"><td colspan="5" class="empty-cell">暂无会议记录</td></tr></tbody></table></div></article>
      <article v-else-if="activeTab === 'risks'" class="panel table-panel detail-panel"><div class="panel-heading"><h3>项目风险</h3></div><div class="table-wrap"><table><thead><tr><th>风险</th><th>等级</th><th>状态</th><th>创建时间</th></tr></thead><tbody><tr v-for="risk in detail.risks" :key="risk.id"><td><strong>{{ risk.title }}</strong><small>{{ risk.description }}</small></td><td><span class="tag" :class="riskLevelLabel(risk.level).tone">{{ riskLevelLabel(risk.level).label }}</span></td><td><span class="tag" :class="riskStatusLabel(risk.status).tone">{{ riskStatusLabel(risk.status).label }}</span></td><td>{{ formatBeijingMinute(risk.createdAt) }}</td></tr><tr v-if="!detail.risks.length"><td colspan="4" class="empty-cell">暂无风险</td></tr></tbody></table></div></article>
      <article v-else-if="activeTab === 'members'" class="panel table-panel detail-panel"><div class="panel-heading"><h3>项目成员</h3><button v-if="detail.permissions.canManageMembers" class="small-button">管理成员</button></div><div class="table-wrap"><table><thead><tr><th>成员</th><th>邮箱</th><th>系统角色</th><th>项目角色</th></tr></thead><tbody><tr v-for="member in detail.members" :key="member.id"><td><strong>{{ member.name }}</strong></td><td>{{ member.email }}</td><td><span class="tag" :class="systemRoleLabel(member.role).tone">{{ systemRoleLabel(member.role).label }}</span></td><td><span class="tag" :class="projectRoleLabel(member.project_role).tone">{{ projectRoleLabel(member.project_role).label }}</span></td></tr><tr v-if="!detail.members.length"><td colspan="4" class="empty-cell">暂无成员</td></tr></tbody></table></div></article>
    </template>
  </section>
</template>
