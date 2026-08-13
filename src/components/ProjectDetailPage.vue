<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createWorkspaceService, type ProjectDetail } from '../services/workspaceService'
import type { UserAccount } from '../services/authService'

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
  { id: 'tasks', label: '任务' },
  { id: 'meetings', label: '会议' },
  { id: 'risks', label: '风险' },
  { id: 'members', label: '成员' },
]
const canManage = computed(() => Boolean(detail.value?.permissions.canEdit))
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
onMounted(load)
</script>

<template>
  <section class="page-section project-detail-page">
    <div v-if="loading" class="panel empty-cell">正在加载项目详情…</div>
    <div v-else-if="error" class="panel empty-cell"><p>{{ error }}</p><button class="small-button" @click="load">重试</button></div>
    <template v-else-if="detail">
      <article class="panel project-detail-header">
        <div><p class="eyebrow">PROJECT DETAIL · {{ detail.project.code }}</p><h2>{{ detail.project.name }}</h2><p class="muted">负责人 {{ detail.project.ownerName }} · {{ detail.counts.members }} 名成员</p></div>
        <div class="detail-grid"><div><span>状态</span><strong>{{ detail.project.status }}</strong></div><div><span>完成率</span><strong>{{ detail.project.progress }}%</strong></div><div><span>截止日期</span><strong>{{ detail.project.endDate || '未设置' }}</strong></div><div><span>待审核</span><strong>{{ detail.counts.pendingReviews }}</strong></div></div>
      </article>
      <nav class="detail-tabs" aria-label="项目详情标签"><button v-for="tab in tabs" :key="tab.id" :class="{ selected: activeTab === tab.id }" @click="selectTab(tab.id)">{{ tab.label }}</button></nav>
      <article v-if="activeTab === 'overview'" class="panel detail-panel"><div class="panel-heading"><h3>项目概览</h3><button v-if="canManage" class="small-button" @click="router.push(`/projects/${route.params.id}?edit=1`)">编辑项目</button></div><p class="task-description">{{ detail.project.description || '暂无项目描述' }}</p><div class="metric-grid compact"><div class="metric-card"><span>任务总数</span><strong>{{ detail.counts.tasks }}</strong></div><div class="metric-card"><span>已完成</span><strong>{{ detail.counts.completedTasks }}</strong></div><div class="metric-card"><span>开放风险</span><strong>{{ detail.counts.openRisks }}</strong></div></div></article>
      <article v-else-if="activeTab === 'tasks'" class="panel table-panel detail-panel"><div class="panel-heading"><h3>项目任务</h3><button class="small-button" @click="router.push(`/tasks?project=${route.params.id}`)">打开任务看板</button></div><div class="table-wrap"><table><thead><tr><th>任务</th><th>负责人</th><th>优先级</th><th>状态</th><th>截止</th></tr></thead><tbody><tr v-for="task in detail.tasks" :key="task.id" @click="openTask(task.id)"><td><strong>{{ task.title }}</strong><small>{{ task.description }}</small></td><td>{{ task.assigneeName }}</td><td><span class="tag blue">{{ task.priority }}</span></td><td>{{ task.status }}</td><td>{{ task.dueDate || '未设置' }}</td></tr><tr v-if="!detail.tasks.length"><td colspan="5" class="empty-cell">暂无项目任务</td></tr></tbody></table></div></article>
      <article v-else-if="activeTab === 'meetings'" class="panel table-panel detail-panel"><div class="panel-heading"><h3>项目会议</h3></div><div class="table-wrap"><table><thead><tr><th>会议标题</th><th>创建时间</th><th>版本数</th><th>审核状态</th><th></th></tr></thead><tbody><tr v-for="meeting in detail.meetings" :key="meeting.id"><td><strong>{{ meeting.title }}</strong></td><td>{{ meeting.createdAt }}</td><td>{{ meeting.versionCount }}</td><td>{{ meeting.latestAnalysisStatus || '未分析' }}</td><td><button class="small-button" @click="openMeeting(meeting.id)">查看审核</button></td></tr><tr v-if="!detail.meetings.length"><td colspan="5" class="empty-cell">暂无会议记录</td></tr></tbody></table></div></article>
      <article v-else-if="activeTab === 'risks'" class="panel table-panel detail-panel"><div class="panel-heading"><h3>项目风险</h3></div><div class="table-wrap"><table><thead><tr><th>风险</th><th>等级</th><th>状态</th><th>创建时间</th></tr></thead><tbody><tr v-for="risk in detail.risks" :key="risk.id"><td><strong>{{ risk.title }}</strong><small>{{ risk.description }}</small></td><td><span class="tag red">{{ risk.level }}</span></td><td>{{ risk.status }}</td><td>{{ risk.createdAt }}</td></tr><tr v-if="!detail.risks.length"><td colspan="4" class="empty-cell">暂无风险</td></tr></tbody></table></div></article>
      <article v-else class="panel table-panel detail-panel"><div class="panel-heading"><h3>项目成员</h3><button v-if="detail.permissions.canManageMembers" class="small-button">管理成员</button></div><div class="table-wrap"><table><thead><tr><th>成员</th><th>邮箱</th><th>系统角色</th><th>项目角色</th></tr></thead><tbody><tr v-for="member in detail.members" :key="member.id"><td><strong>{{ member.name }}</strong></td><td>{{ member.email }}</td><td>{{ member.role }}</td><td>{{ member.project_role }}</td></tr><tr v-if="!detail.members.length"><td colspan="4" class="empty-cell">暂无成员</td></tr></tbody></table></div></article>
    </template>
  </section>
</template>
