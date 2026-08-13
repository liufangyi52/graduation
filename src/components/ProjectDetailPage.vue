<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createWorkspaceService, type ProjectDetail } from '../services/workspaceService'
import type { UserAccount } from '../services/authService'
import { analysisStatusLabel, priorityLabel, projectRoleLabel, projectStatusLabel, riskLevelLabel, riskStatusLabel, systemRoleLabel, taskStatusLabel } from '../utils/labels'
import { buildProjectAnalytics } from '../utils/projectAnalytics'
import { downloadProjectExport, type ExportKind } from '../utils/projectExport'

const props = defineProps<{ token: string; user: UserAccount }>()
const route = useRoute()
const router = useRouter()
const service = createWorkspaceService(props.token)
const detail = ref<ProjectDetail | null>(null)
const loading = ref(true)
const error = ref('')
const activeTab = ref(String(route.name) === 'project-meetings' ? 'meetings' : 'overview')
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
const analytics = computed(() => detail.value ? buildProjectAnalytics({
  tasks: detail.value.tasks.map((task) => ({ id: task.id, title: task.title, status: task.status, createdAt: task.createdAt, completedAt: task.completedAt, dueDate: task.dueDate })),
  risks: detail.value.risks.map((risk) => ({ id: risk.id, level: risk.level, status: risk.status })),
}, new Date().toISOString()) : null)
const ganttTodayLeft = computed(() => {
  const range = analytics.value?.ganttRange
  if (!range) return null
  const today = new Date().toISOString().slice(0, 10)
  if (today < range.start || today > range.end) return null
  return Math.round(((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${range.start}T00:00:00Z`)) / 86_400_000 / Math.max(1, range.days - 1)) * 100)
})
function chartPoints(points: Array<{ remaining: number }>) {
  if (!points.length) return ''
  const max = Math.max(1, ...points.map((point) => point.remaining))
  return points.map((point, index) => `${(index / Math.max(1, points.length - 1)) * 100},${100 - (point.remaining / max) * 100}`).join(' ')
}
async function load() {
  loading.value = true
  error.value = ''
  try { detail.value = await service.getProjectDetail(String(route.params.id)) } catch (reason) { error.value = reason instanceof Error ? reason.message : '项目详情加载失败' } finally { loading.value = false }
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
onMounted(load)
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
            <div><span>截止日期</span><strong>{{ detail.project.endDate || '未设置' }}</strong></div>
            <div><span>待审核</span><strong>{{ detail.counts.pendingReviews }}</strong></div>
          </div>
        </div>
      </article>
      <nav class="detail-tabs" aria-label="项目详情标签"><button v-for="tab in tabs" :key="tab.id" :class="{ selected: activeTab === tab.id }" @click="selectTab(tab.id)">{{ tab.label }}</button></nav>
      <article v-if="activeTab === 'overview'" class="panel detail-panel"><div class="panel-heading"><h3>项目概览</h3><button v-if="canManage" class="small-button" @click="router.push(`/projects/${route.params.id}?edit=1`)">编辑项目</button></div><div class="project-overview-body"><p class="task-description">{{ detail.project.description || '暂无项目描述' }}</p><div class="metric-grid project-metrics"><div class="metric-card"><span>任务总数</span><strong>{{ detail.counts.tasks }}</strong></div><div class="metric-card"><span>已完成</span><strong>{{ detail.counts.completedTasks }}</strong></div><div class="metric-card"><span>开放风险</span><strong>{{ detail.counts.openRisks }}</strong></div></div></div></article>
      <template v-else-if="activeTab === 'analytics'">
        <article class="panel detail-panel"><div class="panel-heading"><h3>项目分析</h3><div v-if="canManage" class="export-actions"><span class="sr-only">{{ exportLabel }}</span><button v-for="kind in (['meetings', 'tasks', 'summary'] as ExportKind[])" :key="kind" class="small-button" :disabled="Boolean(exportBusy)" @click="exportProject(kind, 'xlsx')">导出{{ kind === 'meetings' ? '会议' : kind === 'tasks' ? '任务' : '统计' }} Excel</button><button class="small-button" :disabled="Boolean(exportBusy)" @click="exportProject('summary', 'pdf')">导出项目统计 PDF</button></div></div><div class="metric-grid project-metrics"><div class="metric-card"><span>任务总数</span><strong>{{ analytics?.metrics.totalTasks }}</strong></div><div class="metric-card"><span>完成率</span><strong>{{ analytics?.metrics.completionRate }}%</strong></div><div class="metric-card"><span>逾期任务</span><strong>{{ analytics?.metrics.overdueTasks }}</strong></div><div class="metric-card"><span>开放风险</span><strong>{{ analytics?.metrics.openRisks }}</strong></div></div></article>
        <div class="analytics-grid"><article class="panel detail-panel"><h3>任务完成趋势</h3><div v-if="!analytics?.completionTrend.length" class="empty-cell">暂无可追溯的任务完成记录</div><div v-else class="bar-list"><div v-for="item in analytics.completionTrend" :key="item.date" class="bar-row"><span>{{ item.date }}</span><i :style="{ width: `${Math.min(100, item.count * 20)}%` }"></i><b>{{ item.count }}</b></div></div></article><article class="panel detail-panel"><h3>风险分布</h3><div v-if="!analytics?.riskDistribution.length" class="empty-cell">暂无开放风险</div><div v-else class="bar-list"><div v-for="item in analytics.riskDistribution" :key="item.level" class="bar-row"><span>{{ riskLevelLabel(item.level).label }}</span><i :style="{ width: `${Math.min(100, item.count * 20)}%` }"></i><b>{{ item.count }}</b></div></div></article></div>
        <article class="panel detail-panel"><h3>任务计划甘特图</h3><div v-if="!analytics?.ganttRange" class="empty-cell">暂无可绘制的任务日期</div><div v-else class="project-gantt" role="img" :aria-label="`任务计划：${analytics.ganttRange.start} 至 ${analytics.ganttRange.end}`"><div class="gantt-axis"><span>{{ analytics.ganttRange.start }}</span><span>{{ analytics.ganttRange.end }}</span></div><div v-for="task in analytics.ganttTasks" :key="task.id" class="gantt-row"><span>{{ task.title }}</span><div class="gantt-track"><i v-if="ganttTodayLeft !== null" class="gantt-today" :style="{ left: `${ganttTodayLeft}%` }"></i><i class="gantt-bar" :class="task.status" :style="{ left: `${task.left}%`, width: `${task.width}%` }"></i></div><small>{{ task.start }} 至 {{ task.end }}</small></div></div><p v-if="analytics?.undatedTasks.length" class="muted">另有 {{ analytics.undatedTasks.length }} 个任务未设置有效截止日期。</p></article>
        <article class="panel detail-panel"><h3>任务燃尽图</h3><div v-if="!analytics?.burndown.actual.length" class="empty-cell">暂无可追溯的任务完成记录，无法生成实际燃尽线</div><div v-else class="burndown-chart" role="img" :aria-label="`任务燃尽图，共 ${analytics.metrics.totalTasks} 项任务`"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline class="burndown-planned" :points="chartPoints(analytics.burndown.planned)" /><polyline class="burndown-actual" :points="chartPoints(analytics.burndown.actual)" /></svg><div class="burndown-legend"><span><i class="planned"></i>计划剩余</span><span><i class="actual"></i>实际剩余</span></div><div class="burndown-axis"><span>{{ analytics.burndown.planned[0]?.date }}</span><span>{{ analytics.burndown.planned.at(-1)?.date }}</span></div></div></article>
      </template>
      <article v-else-if="activeTab === 'tasks'" class="panel table-panel detail-panel"><div class="panel-heading"><h3>项目任务</h3><button class="small-button" @click="router.push(`/tasks?project=${route.params.id}`)">打开任务看板</button></div><div class="table-wrap"><table><thead><tr><th>任务</th><th>负责人</th><th>优先级</th><th>状态</th><th>截止</th></tr></thead><tbody><tr v-for="task in detail.tasks" :key="task.id" @click="openTask(task.id)"><td><strong>{{ task.title }}</strong><small>{{ task.description }}</small></td><td>{{ task.assigneeName }}</td><td><span class="tag" :class="priorityLabel(task.priority).tone">{{ priorityLabel(task.priority).label }}</span></td><td><span class="tag" :class="taskStatusLabel(task.status).tone">{{ taskStatusLabel(task.status).label }}</span></td><td>{{ task.dueDate || '未设置' }}</td></tr><tr v-if="!detail.tasks.length"><td colspan="5" class="empty-cell">暂无项目任务</td></tr></tbody></table></div></article>
      <article v-else-if="activeTab === 'meetings'" class="panel table-panel detail-panel"><div class="panel-heading"><h3>项目会议</h3></div><div class="table-wrap"><table><thead><tr><th>会议标题</th><th>创建时间</th><th>版本数</th><th>审核状态</th><th></th></tr></thead><tbody><tr v-for="meeting in detail.meetings" :key="meeting.id"><td><strong>{{ meeting.title }}</strong></td><td>{{ meeting.createdAt }}</td><td>{{ meeting.versionCount }}</td><td><span class="tag" :class="analysisStatusLabel(meeting.latestAnalysisStatus || '未分析').tone">{{ analysisStatusLabel(meeting.latestAnalysisStatus || '未分析').label }}</span></td><td><button class="small-button" @click="openMeeting(meeting.id)">查看审核</button></td></tr><tr v-if="!detail.meetings.length"><td colspan="5" class="empty-cell">暂无会议记录</td></tr></tbody></table></div></article>
      <article v-else-if="activeTab === 'risks'" class="panel table-panel detail-panel"><div class="panel-heading"><h3>项目风险</h3></div><div class="table-wrap"><table><thead><tr><th>风险</th><th>等级</th><th>状态</th><th>创建时间</th></tr></thead><tbody><tr v-for="risk in detail.risks" :key="risk.id"><td><strong>{{ risk.title }}</strong><small>{{ risk.description }}</small></td><td><span class="tag" :class="riskLevelLabel(risk.level).tone">{{ riskLevelLabel(risk.level).label }}</span></td><td><span class="tag" :class="riskStatusLabel(risk.status).tone">{{ riskStatusLabel(risk.status).label }}</span></td><td>{{ risk.createdAt }}</td></tr><tr v-if="!detail.risks.length"><td colspan="4" class="empty-cell">暂无风险</td></tr></tbody></table></div></article>
      <article v-else class="panel table-panel detail-panel"><div class="panel-heading"><h3>项目成员</h3><button v-if="detail.permissions.canManageMembers" class="small-button">管理成员</button></div><div class="table-wrap"><table><thead><tr><th>成员</th><th>邮箱</th><th>系统角色</th><th>项目角色</th></tr></thead><tbody><tr v-for="member in detail.members" :key="member.id"><td><strong>{{ member.name }}</strong></td><td>{{ member.email }}</td><td><span class="tag" :class="systemRoleLabel(member.role).tone">{{ systemRoleLabel(member.role).label }}</span></td><td><span class="tag" :class="projectRoleLabel(member.project_role).tone">{{ projectRoleLabel(member.project_role).label }}</span></td></tr><tr v-if="!detail.members.length"><td colspan="4" class="empty-cell">暂无成员</td></tr></tbody></table></div></article>
    </template>
  </section>
</template>
