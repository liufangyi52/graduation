<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  AlertTriangle, Archive, ArrowRight, BarChart3, Bell, CalendarDays, Check, CheckCircle2,
  ChevronDown, ClipboardList, FolderKanban, Gauge, LayoutDashboard, Menu,
  Moon, MoreHorizontal, PanelLeft, Plus, Search, Settings, ShieldAlert, Sparkles,
  Sun, Target, TestTube2, Users, X, Zap,
} from 'lucide-vue-next'
import { createWorkspaceService, type CalendarEvent, type Project, type ProjectMember, type RiskLevel, type Task, type TaskState } from './services/workspaceService'
import { canManageProjectBusiness, canUpdateVisibleTasks, createAuthService, roleLabels, type ManagedUser, type SystemSettings, type UserAccount, type UserRole } from './services/authService'
import { createMeetingService } from './services/meetingService'
import type { MeetingVersion, MeetingVersionSummary } from './services/meetingService'
import { beijingGreeting, formatBeijingDate } from './utils/date'
import { calendarMonthDays, eventsForCalendarDate, formatCalendarDate, formatCalendarMonth, localIsoDate, shiftCalendarMonth, taskEventsForCalendarDate, visibleCalendarEvents } from './utils/calendar'
import { averageTaskProgress } from './utils/progress'

const props = defineProps<{ user: UserAccount; token: string }>()
const emit = defineEmits<{ logout: [] }>()

const route = useRoute()
const router = useRouter()
const service = createWorkspaceService(props.token)
const data = service.state
void service.load().catch(() => flash('真实数据加载失败，请检查后端服务'))
void service.loadCalendarEvents().catch(() => {})
const auth = createAuthService()
const meetings = createMeetingService(props.token)

const dark = ref(false)
const sidebarOpen = ref(true)
const search = ref('')
const taskStateFilter = ref<'all' | TaskState>('all')
const projectStateFilter = ref<'all' | Project['state']>('all')
const riskLevelFilter = ref<'all' | RiskLevel>('all')
const unreadOnly = ref(false)
const showCreateProject = ref(false)
const newProjectName = ref('')
const toast = ref('')
const selectedTask = ref<Task | null>(null)
const selectedCalendarDay = ref<string | null>(null)
const feedbackTask = ref<Task | null>(null)
const feedbackText = ref('')
const feedbackProgress = ref(0)
const managedUsers = ref<ManagedUser[]>([])
const auditLogs = ref<any[]>([])
const meetingProjectId = ref('')
const meetingTitle = ref('')
const meetingContent = ref('')
const meetingNotice = ref('')
const meetingFile = ref<File | null>(null)
const meetingVersions = ref<MeetingVersionSummary[]>([])
const selectedMeetingVersion = ref<MeetingVersion | null>(null)
const lastMeetingId = ref('')
const showProjectMembers = ref(false)
const selectedMemberProject = ref<Project | null>(null)
const projectMembers = ref<ProjectMember[]>([])
const memberCandidates = ref<Array<{ id: string; name: string; email: string; role: string }>>([])
const memberCandidateId = ref('')
const memberProjectRole = ref<'manager' | 'member'>('member')
const roleDraft = ref<UserRole>('member')
const showCreateUser = ref(false)
const newUserName = ref('')
const newUserEmail = ref('')
const newUserPassword = ref('')
const resetPasswordUser = ref<ManagedUser | null>(null)
const resetPasswordValue = ref('')
const systemSettings = ref<SystemSettings>({ model: 'DeepSeek V3', mode: 'RAG', desensitize: true })
const settingsSaving = ref(false)
if (props.user.role === 'admin') {
  void auth.listUsers(props.token).then((items) => { managedUsers.value = items }).catch(() => {})
  void auth.getSystemSettings(props.token).then((settings) => { systemSettings.value = settings }).catch(() => {})
}
if (props.user.role === 'admin' || props.user.role === 'auditor') void auth.listAuditLogs(props.token).then((items) => { auditLogs.value = items }).catch(() => {})
void meetings.load().catch(() => {})
const now = ref(new Date())
const todayLabel = computed(() => formatBeijingDate(now.value))
const greeting = computed(() => beijingGreeting(now.value))
const selectedCalendarMonth = ref(`${localIsoDate(new Date()).slice(0, 7)}-01`)
let dateTimer: number | undefined
let taskRefreshTimer: number | undefined

onMounted(() => {
  dateTimer = window.setInterval(() => { now.value = new Date() }, 60_000)
  taskRefreshTimer = window.setInterval(() => { void service.load().catch(() => {}) }, 10_000)
})

onUnmounted(() => {
  if (dateTimer !== undefined) window.clearInterval(dateTimer)
  if (taskRefreshTimer !== undefined) window.clearInterval(taskRefreshTimer)
})

const navigation = computed(() => [
  { label: '工作台', path: '/dashboard', icon: LayoutDashboard },
  { label: '项目列表', path: '/projects', icon: FolderKanban },
  { label: '任务管理', path: '/tasks', icon: ClipboardList },
  { label: '我的任务', path: '/my-tasks', icon: CheckCircle2 },
  { label: '风险中心', path: '/risks', icon: ShieldAlert },
  { label: '通知中心', path: '/notifications', icon: Bell },
  { label: '实验中心', path: '/experiments', icon: TestTube2 },
  { label: '团队日历', path: '/calendar', icon: CalendarDays },
  { label: '效能分析', path: '/efficiency', icon: BarChart3 },
  { label: '系统设置', path: '/settings', icon: Settings },
].filter((item) => auth.visibleRoutes(props.user.role).includes(item.path)))

const workflowNavigation = computed(() => [
  { label: '会议纪要', path: '/meetings', icon: Archive },
  { label: 'AI 审核', path: '/reviews', icon: CheckCircle2 },
  { label: '账号管理', path: '/users', icon: Users },
  { label: '审计日志', path: '/audit-logs', icon: ClipboardList },
].filter((item) => auth.visibleRoutes(props.user.role).includes(item.path)))

const pageMeta: Record<string, { title: string; eyebrow: string; description: string }> = {
  dashboard: { title: '项目管理工作台', eyebrow: 'PROJECT CONTROL CENTER', description: '跟踪全局进度，及时处理 AI 审核与延期风险' },
  projects: { title: '项目列表', eyebrow: 'PROJECTS', description: '管理项目成员、状态和交付目标' },
  tasks: { title: '任务管理', eyebrow: 'TASK MANAGEMENT', description: '集中处理任务分配、状态和反馈' },
  'my-tasks': { title: '我的任务', eyebrow: 'MY WORKSPACE', description: '更新个人任务进度，提交工作反馈与问题' },
  risks: { title: '风险中心', eyebrow: 'RISK CENTER', description: '识别需要关注的任务与项目风险' },
  notifications: { title: '通知中心', eyebrow: 'NOTIFICATIONS', description: '掌握审核、到期和系统动态' },
  experiments: { title: '实验中心', eyebrow: 'AI EXPERIMENTS', description: '比较不同 AI 运行模式的效果' },
  calendar: { title: '团队日历', eyebrow: 'TEAM CALENDAR', description: '按时间查看会议和任务计划' },
  efficiency: { title: '效能分析', eyebrow: 'EFFICIENCY', description: '用数据回顾团队交付节奏' },
  settings: { title: '系统设置', eyebrow: 'SYSTEM SETTINGS', description: '管理模型、脱敏和运行模式' },
}

Object.assign(pageMeta, {
  meetings: { title: '会议纪要', eyebrow: 'MEETING MINUTES', description: '提交会议纪要并使用 DeepSeek 抽取任务和风险' },
  reviews: { title: 'AI 审核', eyebrow: 'AI REVIEW', description: '审核 AI 提取结果，批准后生成正式任务' },
  users: { title: '账号管理', eyebrow: 'ACCOUNT ADMINISTRATION', description: '管理角色、启停账号和重置密码' },
  'audit-logs': { title: '审计日志', eyebrow: 'AUDIT LOGS', description: '查看关键操作和数据变更记录' },
})

const currentPage = computed(() => String(route.name || 'dashboard'))
const meta = computed(() => pageMeta[currentPage.value] || pageMeta.dashboard)
const pendingReviews = computed(() => meetings.state.analyses.filter((analysis) => analysis.status === 'pending').map((analysis) => ({
  id: analysis.id,
  meeting: analysis.title,
  project: analysis.meetingId,
  mode: analysis.result?.model ?? 'DeepSeek',
  confidence: Number(analysis.result?.confidence ?? 0),
  time: analysis.createdAt,
  status: analysis.status,
})))
const dueTasks = computed(() => data.tasks.filter((task) => task.state !== 'completed').slice(0, 3))
const filteredProjects = computed(() => data.projects.filter((project) => {
  const matchesSearch = !search.value || `${project.name}${project.code}${project.owner}`.toLowerCase().includes(search.value.toLowerCase())
  const matchesState = projectStateFilter.value === 'all' || project.state === projectStateFilter.value
  return matchesSearch && matchesState
}))
const filteredTasks = computed(() => data.tasks.filter((task) => {
  const matchesSearch = !search.value || `${task.title}${task.project}${task.owner}`.toLowerCase().includes(search.value.toLowerCase())
  const matchesState = taskStateFilter.value === 'all' || task.state === taskStateFilter.value
  return matchesSearch && matchesState
}))
const filteredRisks = computed(() => data.risks.filter((risk) => riskLevelFilter.value === 'all' || risk.level === riskLevelFilter.value))
const filteredNotifications = computed(() => data.notifications.filter((item) => !unreadOnly.value || !item.read))
const completedCount = computed(() => data.tasks.filter((task) => task.state === 'completed').length)
const activeMemberCount = computed(() => new Set(data.tasks.map((task) => task.owner).filter(Boolean)).size)
const projectCompletionRate = computed(() => averageTaskProgress(data.tasks))
const deliveryCycleLabel = computed(() => data.tasks.length ? '基于当前任务数据' : '暂无数据')
const riskDonutStyle = computed(() => {
  const total = data.risks.length
  if (!total) return { background: 'var(--surface)' }
  const high = data.risks.filter((risk) => risk.level === 'high').length / total * 100
  const medium = data.risks.filter((risk) => risk.level === 'medium').length / total * 100
  return { background: `conic-gradient(var(--emergency) 0 ${high}%, var(--warning) ${high}% ${high + medium}%, var(--success) ${high + medium}% 100%)` }
})
const highRiskCount = computed(() => data.risks.filter((risk) => risk.level === 'high' && risk.status !== '已处理').length)
const isMember = computed(() => props.user.role === 'member')
const canManageBusiness = computed(() => canManageProjectBusiness(props.user.role))
const canUpdateTasks = computed(() => canUpdateVisibleTasks(props.user.role))
const myTasks = computed(() => data.tasks.filter((task) => task.owner === props.user.name))
const calendarDays = computed(() => calendarMonthDays(selectedCalendarMonth.value))
const selectedCalendarLabel = computed(() => formatCalendarMonth(selectedCalendarMonth.value))
const selectedCalendarTasks = computed(() => selectedCalendarDay.value ? taskEventsForCalendarDate(data.calendarEvents, selectedCalendarDay.value) : [])

watch(() => route.path, (path) => {
  if (!auth.visibleRoutes(props.user.role).includes(path)) router.replace('/dashboard')
}, { immediate: true })

function navigate(path: string) {
  search.value = ''
  router.push(path)
}
function flash(message: string) {
  toast.value = message
  window.setTimeout(() => { toast.value = '' }, 2600)
}
async function createProject() {
  if (!newProjectName.value.trim()) return flash('请输入项目名称')
  try {
    await service.createProject(newProjectName.value.trim())
    newProjectName.value = ''
    showCreateProject.value = false
    flash('项目已创建')
  } catch (reason) { flash(reason instanceof Error ? reason.message : '创建失败') }
}
async function updateTask(task: Task, state: TaskState) {
  try {
    await service.updateTaskState(task.id, state)
    await service.load()
    await service.loadCalendarEvents()
    flash('任务状态已更新')
  } catch (reason) {
    flash(reason instanceof Error ? reason.message : '更新失败')
  }
}
function statusLabel(status: TaskState) {
  return { todo: '待处理', 'in-progress': '进行中', completed: '已完成' }[status]
}
function calendarTagClass(event: CalendarEvent) {
  if (event.type === 'meeting') return 'blue'
  if (event.state === 'completed') return 'green'
  if (event.priority === '紧急') return 'red'
  if (event.priority === '高') return 'amber'
  return 'gray'
}
function openCalendarEvent(event: CalendarEvent) {
  if (event.type === 'meeting') return navigate('/meetings')
  const task = data.tasks.find((item) => item.id === event.id)
  if (task) selectedTask.value = task
}
function calendarEventsForDay(date: string) {
  return eventsForCalendarDate(data.calendarEvents, date)
}
function visibleEventsForDay(date: string) {
  return visibleCalendarEvents(calendarEventsForDay(date))
}
function openCalendarDay(date: string) {
  selectedCalendarDay.value = date
}
async function submitMeeting() {
  if (!meetingProjectId.value || !meetingTitle.value.trim() || (!meetingContent.value.trim() && !meetingFile.value)) return flash('请先选择项目并填写或上传会议纪要')
  try {
    const meeting = meetingFile.value
      ? await meetings.importFile(meetingProjectId.value, meetingTitle.value.trim(), meetingFile.value)
      : await meetings.create(meetingProjectId.value, meetingTitle.value.trim(), meetingContent.value.trim())
    await meetings.analyze(meeting.id)
    await meetings.load()
    await service.loadCalendarEvents()
    meetingTitle.value = ''
    meetingContent.value = ''
    meetingFile.value = null
    lastMeetingId.value = meeting.id
    meetingVersions.value = await meetings.listVersions(meeting.id)
    meetingNotice.value = 'DeepSeek 分析已完成，请到 AI 审核页面确认结果'
  } catch (reason) { meetingNotice.value = reason instanceof Error ? reason.message : '会议分析失败' }
}
async function reviewMeetingAnalysis(id: string, approved: boolean) {
  try { await meetings.review(id, approved); await meetings.load(); await service.load(); flash(approved ? '分析已通过并生成任务' : '分析已驳回') } catch (reason) { flash(reason instanceof Error ? reason.message : '审核失败') }
}
function riskLabel(level: RiskLevel) {
  return { high: '高风险', medium: '中风险', low: '低风险' }[level]
}
async function confirmArchive(project: Project) {
  if (window.confirm(`确认归档“${project.name}”吗？`)) {
    try { await service.archiveProject(project.id); flash('项目已归档') } catch (reason) { flash(reason instanceof Error ? reason.message : '归档失败') }
  }
}
function openFeedback(task: Task) {
  feedbackTask.value = task
  feedbackText.value = ''
  feedbackProgress.value = task.progress
}
async function submitFeedback() {
  if (!feedbackTask.value) return
  try {
    await service.submitFeedback(feedbackTask.value.id, props.user.name, feedbackText.value, feedbackProgress.value)
    await service.load()
    flash('工作反馈已提交')
    feedbackTask.value = null
  } catch (reason) {
    flash(reason instanceof Error ? reason.message : '提交失败')
  }
}

async function markNotification(id: string, path: string) {
  try { await service.markRead(id); navigate(path) } catch (reason) { flash(reason instanceof Error ? reason.message : '通知状态更新失败') }
}

async function resolveRisk(id: string) {
  try { await service.resolveRisk(id); flash('风险已标记为已处理') } catch (reason) { flash(reason instanceof Error ? reason.message : '风险处理失败') }
}
async function createManagedUser() {
  if (!newUserName.value.trim() || !newUserEmail.value.trim() || newUserPassword.value.length < 8) return flash('Please complete the account form with an 8-character password')
  try {
    const created = await auth.createUser(props.token, { name: newUserName.value.trim(), email: newUserEmail.value.trim(), password: newUserPassword.value, role: roleDraft.value })
    managedUsers.value.push(created)
    showCreateUser.value = false
    newUserName.value = ''
    newUserEmail.value = ''
    newUserPassword.value = ''
    flash('Account created')
  } catch (reason) { flash(reason instanceof Error ? reason.message : 'Account creation failed') }
}

async function openProjectMembers(project: Project) {
  selectedMemberProject.value = project
  showProjectMembers.value = true
  try {
    const [members, candidates] = await Promise.all([service.listProjectMembers(project.id), service.projectMemberCandidates(project.id)])
    projectMembers.value = members
    memberCandidates.value = candidates
  } catch (reason) { flash(reason instanceof Error ? reason.message : '成员加载失败') }
}

async function addSelectedProjectMember() {
  if (!selectedMemberProject.value || !memberCandidateId.value) return
  try {
    await service.addProjectMember(selectedMemberProject.value.id, memberCandidateId.value, memberProjectRole.value)
    projectMembers.value = await service.listProjectMembers(selectedMemberProject.value.id)
    await service.load()
    memberCandidateId.value = ''
  } catch (reason) { flash(reason instanceof Error ? reason.message : '添加成员失败') }
}

async function removeSelectedProjectMember(userId: string) {
  if (!selectedMemberProject.value) return
  try {
    await service.removeProjectMember(selectedMemberProject.value.id, userId)
    projectMembers.value = await service.listProjectMembers(selectedMemberProject.value.id)
    await service.load()
  } catch (reason) { flash(reason instanceof Error ? reason.message : '移除成员失败') }
}

function selectMeetingFile(event: Event) {
  meetingFile.value = (event.target as HTMLInputElement).files?.[0] ?? null
}

async function showMeetingVersions() {
  if (!lastMeetingId.value) return flash('请先提交一份会议纪要')
  try { meetingVersions.value = await meetings.listVersions(lastMeetingId.value) } catch (reason) { flash(reason instanceof Error ? reason.message : '版本记录加载失败') }
}

async function inspectMeetingVersion(versionId: string) {
  if (!lastMeetingId.value) return
  try { selectedMeetingVersion.value = await meetings.getVersion(lastMeetingId.value, versionId) } catch (reason) { flash(reason instanceof Error ? reason.message : '版本内容加载失败') }
}

async function restoreMeetingVersion(versionId: string) {
  if (!lastMeetingId.value || !window.confirm('恢复此版本会创建新的当前版本，是否继续？')) return
  try {
    await meetings.restoreVersion(lastMeetingId.value, versionId)
    meetingVersions.value = await meetings.listVersions(lastMeetingId.value)
    flash('已创建恢复版本')
  } catch (reason) { flash(reason instanceof Error ? reason.message : '版本恢复失败') }
}

async function setManagedUserActive(managed: ManagedUser, isActive: boolean) {
  try {
    await auth.updateUser(props.token, managed.id, { isActive })
    managed.is_active = isActive
    flash(isActive ? 'Account enabled' : 'Account disabled')
  } catch (reason) { flash(reason instanceof Error ? reason.message : 'Account update failed') }
}

async function resetManagedPassword() {
  if (!resetPasswordUser.value || resetPasswordValue.value.length < 8) return flash('Password must contain at least 8 characters')
  try {
    await auth.resetPassword(props.token, resetPasswordUser.value.id, resetPasswordValue.value)
    resetPasswordUser.value = null
    resetPasswordValue.value = ''
    flash('Password reset')
  } catch (reason) { flash(reason instanceof Error ? reason.message : 'Password reset failed') }
}

async function saveSystemSettings() {
  settingsSaving.value = true
  try {
    systemSettings.value = await auth.updateSystemSettings(props.token, systemSettings.value)
    flash('Settings saved')
  } catch (reason) { flash(reason instanceof Error ? reason.message : 'Settings save failed') } finally { settingsSaving.value = false }
}
</script>

<template>
  <div class="app-shell" :class="{ dark }">
    <aside class="sidebar" :class="{ collapsed: !sidebarOpen }">
      <div class="brand">
        <div class="brand-mark"><Sparkles :size="18" /></div>
        <div v-if="sidebarOpen">
          <strong>智策项目管理</strong>
          <span>AI-DRIVEN INTELLIGENCE</span>
        </div>
      </div>

      <nav class="side-nav" aria-label="主导航">
        <button v-for="item in navigation" :key="item.path" class="nav-item" :class="{ active: route.path === item.path }" :title="item.label" @click="navigate(item.path)">
          <component :is="item.icon" :size="18" :stroke-width="route.path === item.path ? 2.4 : 1.8" />
          <span v-if="sidebarOpen">{{ item.label }}</span>
          <span v-if="item.path === '/notifications' && data.notifications.some((item) => !item.read)" class="nav-badge">3</span>
        </button>
        <button v-for="item in workflowNavigation" :key="item.path" class="nav-item" :class="{ active: route.path === item.path }" :title="item.label" @click="navigate(item.path)">
          <component :is="item.icon" :size="18" :stroke-width="route.path === item.path ? 2.4 : 1.8" />
          <span v-if="sidebarOpen">{{ item.label }}</span>
        </button>
      </nav>

      <button v-if="sidebarOpen && canManageBusiness" class="new-project-button" @click="showCreateProject = true"><Plus :size="16" /> 新建项目</button>
      <div class="sidebar-bottom">
        <button class="nav-item" :title="dark ? '切换浅色主题' : '切换深色主题'" @click="dark = !dark"><component :is="dark ? Sun : Moon" :size="18" /><span v-if="sidebarOpen">{{ dark ? '浅色主题' : '深色主题' }}</span></button>
        <button class="nav-item" title="收起导航" @click="sidebarOpen = !sidebarOpen"><PanelLeft :size="18" /><span v-if="sidebarOpen">收起导航</span></button>
      </div>
    </aside>

    <main class="main-canvas" :class="{ expanded: !sidebarOpen }">
      <header class="topbar">
        <div class="topbar-title">
          <button class="icon-button mobile-menu" @click="sidebarOpen = !sidebarOpen"><Menu :size="18" /></button>
          <div>
            <p class="eyebrow">{{ meta.eyebrow }}</p>
            <h1>{{ meta.title }}</h1>
          </div>
        </div>
        <div class="topbar-actions">
          <label class="global-search"><Search :size="16" /><input v-model="search" placeholder="搜索项目、任务或会议..." /></label>
          <button class="icon-button" title="快捷入口" @click="flash('快捷入口已打开')"><Zap :size="17" /></button>
          <button class="icon-button notification-button" title="通知中心" @click="navigate('/notifications')"><Bell :size="17" /><i v-if="data.notifications.some((item) => !item.read)"></i></button>
          <button class="user-chip" title="退出登录" @click="emit('logout')"><span class="avatar">{{ user.name.slice(0, 1) }}</span><span class="user-name">{{ user.name }} · {{ roleLabels[user.role] }}</span><ChevronDown :size="14" /></button>
        </div>
      </header>

      <div class="content">
        <div class="page-intro" v-if="currentPage !== 'dashboard'">
          <p>{{ meta.description }}</p>
          <div class="page-actions">
            <button v-if="currentPage === 'projects' && canManageBusiness" class="primary-button" @click="showCreateProject = true"><Plus :size="15" /> 新建项目</button>
            <button v-if="currentPage === 'tasks' && canManageBusiness" class="primary-button" @click="flash('任务创建表单已打开')"><Plus :size="15" /> 新建任务</button>
            <button class="icon-button" title="刷新数据" @click="service.load().then(() => meetings.load()).then(() => flash('数据已刷新')).catch(() => flash('刷新失败'))"><ArrowRight :size="16" /></button>
          </div>
        </div>

        <section v-if="currentPage === 'dashboard' && canManageBusiness" class="page-section">
          <div class="welcome-row"><div><p class="eyebrow">{{ todayLabel }}</p><h2>{{ greeting }}，{{ user.name }}</h2><p class="muted">今天有 {{ pendingReviews.length }} 条 AI 结果待审核，{{ highRiskCount }} 个高风险项目需要关注。</p></div><button class="primary-button" @click="navigate('/projects')"><FolderKanban :size="16" /> 查看项目</button></div>
          <div class="metric-grid">
            <article class="metric-card"><div class="metric-label">项目完成率 <Target :size="16" /></div><div class="metric-number">{{ projectCompletionRate ?? '—' }}<span v-if="projectCompletionRate !== null">%</span></div><div class="progress-track"><span :style="{ width: `${projectCompletionRate ?? 0}%` }"></span></div><small>{{ projectCompletionRate === null ? '暂无可统计任务' : '按成员最新任务进度计算 · 每 10 秒同步' }}</small></article>
            <article class="metric-card clickable" @click="navigate('/dashboard')"><div class="metric-label">待审核纪要 <ClipboardList :size="16" /></div><div class="metric-number">{{ pendingReviews.length }}</div><small>需要人工介入校验</small></article>
            <article class="metric-card"><div class="metric-label">进行中任务 <Gauge :size="16" /></div><div class="metric-number">{{ data.tasks.filter((task) => task.state === 'in-progress').length }}</div><small class="success-text">运行状态良好</small></article>
            <article class="metric-card danger"><div class="metric-label">逾期任务 <AlertTriangle :size="16" /></div><div class="metric-number">3</div><small>需要立即响应</small></article>
            <article class="metric-card warning"><div class="metric-label">高风险项 <ShieldAlert :size="16" /></div><div class="metric-number">{{ highRiskCount }}</div><small>关注偏差预警</small></article>
          </div>

          <div class="dashboard-grid top-grid">
            <article class="panel review-panel"><div class="panel-heading"><div><p class="eyebrow">AI REVIEW QUEUE</p><h3>待审核 AI 分析任务</h3></div><button class="text-button" @click="navigate('/reviews')">查看全部 <ArrowRight :size="14" /></button></div><div class="table-wrap"><table><thead><tr><th>会议标题</th><th>分析模式</th><th>置信度</th><th>时间</th><th></th></tr></thead><tbody><tr v-for="review in pendingReviews" :key="review.id"><td><strong>{{ review.meeting }}</strong><small>{{ review.project }}</small></td><td><span class="tag blue">{{ review.mode }}</span></td><td><div class="confidence"><span><i :style="{ width: `${review.confidence}%` }"></i></span><b>{{ review.confidence }}%</b></div></td><td class="mono">{{ review.time }}</td><td><button class="small-button" @click="reviewMeetingAnalysis(review.id, true)">审核</button></td></tr><tr v-if="!pendingReviews.length"><td colspan="5" class="empty-cell">暂无待审核记录</td></tr></tbody></table></div></article>
            <article class="panel due-panel"><div class="panel-heading"><div><p class="eyebrow">DEADLINE WATCH</p><h3>即将到期任务</h3></div><CalendarDays :size="18" class="panel-icon" /></div><div class="due-list"><div v-for="task in dueTasks" :key="task.id" class="due-item" :class="task.priority === '紧急' ? 'critical' : task.priority === '高' ? 'high' : 'normal'"><div><strong>{{ task.title }}</strong><div class="due-meta"><span class="avatar small">{{ task.owner.slice(0, 1) }}</span>{{ task.owner }}<span class="mono">{{ task.due }}</span></div></div><span class="tag" :class="task.priority === '紧急' ? 'red' : task.priority === '高' ? 'amber' : 'blue'">{{ task.priority }}</span></div></div><button class="wide-ghost" @click="navigate('/tasks')">查看完整任务表 <ArrowRight :size="15" /></button></article>
          </div>
          <div class="dashboard-grid bottom-grid"><article class="panel chart-panel"><div class="panel-heading"><div><p class="eyebrow">DELIVERY TREND</p><h3>任务完成趋势</h3></div><span class="chart-range">实时数据</span></div><div class="empty-cell">任务更新时间序列累计后将在此展示趋势。</div><p class="chart-note">当前列表仅提供任务当前状态，未伪造历史趋势数据。</p></article><article class="panel risk-panel"><div class="panel-heading"><div><p class="eyebrow">RISK DISTRIBUTION</p><h3>风险分布统计</h3></div><AlertTriangle :size="18" class="panel-icon" /></div><div class="donut-wrap"><div class="donut" :style="riskDonutStyle"><div><strong>{{ data.risks.length }}</strong><span>总风险项</span></div></div></div><div class="risk-legend"><div><span><i class="dot red-dot"></i>高风险</span><b>{{ data.risks.filter((risk) => risk.level === 'high').length }}</b></div><div><span><i class="dot amber-dot"></i>中风险</span><b>{{ data.risks.filter((risk) => risk.level === 'medium').length }}</b></div><div><span><i class="dot green-dot"></i>低风险</span><b>{{ data.risks.filter((risk) => risk.level === 'low').length }}</b></div></div></article></div>
        </section>

        <section v-else-if="currentPage === 'dashboard' && user.role === 'admin'" class="page-section">
          <div class="welcome-row"><div><p class="eyebrow">SYSTEM ADMINISTRATION</p><h2>{{ greeting }}，{{ user.name }}</h2><p class="muted">管理账号、系统配置与审计记录。</p></div><button class="primary-button" @click="navigate('/users')"><Users :size="16" />账号管理</button></div>
        </section>

        <section v-else-if="currentPage === 'dashboard' && isMember" class="page-section member-dashboard">
          <div class="welcome-row"><div><p class="eyebrow">MEMBER WORKSPACE · {{ roleLabels[user.role] }}</p><h2>{{ greeting }}，{{ user.name }}</h2><p class="muted">这里仅展示与你有关的任务、工作反馈与通知。</p></div><button class="primary-button" @click="navigate('/my-tasks')"><ClipboardList :size="16" /> 查看我的任务</button></div>
          <div class="metric-grid member-metrics"><article class="metric-card"><div class="metric-label">我的待办 <ClipboardList :size="16" /></div><div class="metric-number">{{ myTasks.filter((task) => task.state === 'todo').length }}</div><small>等待开始处理</small></article><article class="metric-card"><div class="metric-label">进行中 <Gauge :size="16" /></div><div class="metric-number">{{ myTasks.filter((task) => task.state === 'in-progress').length }}</div><small class="success-text">请及时同步进度</small></article><article class="metric-card"><div class="metric-label">已完成 <CheckCircle2 :size="16" /></div><div class="metric-number">{{ myTasks.filter((task) => task.state === 'completed').length }}</div><small>本周个人交付</small></article></div>
          <div class="dashboard-grid top-grid"><article class="panel review-panel"><div class="panel-heading"><div><p class="eyebrow">MY PRIORITIES</p><h3>我的优先任务</h3></div><button class="text-button" @click="navigate('/my-tasks')">全部任务 <ArrowRight :size="14" /></button></div><div class="table-wrap"><table><thead><tr><th>任务</th><th>项目</th><th>截止日期</th><th>进度</th><th>操作</th></tr></thead><tbody><tr v-for="task in myTasks" :key="task.id"><td><strong>{{ task.title }}</strong><small class="mono">{{ task.id }}</small></td><td>{{ task.project }}</td><td class="mono">{{ task.due }}</td><td><div class="table-progress"><span class="progress-track"><i :style="{ width: `${task.progress}%` }"></i></span>{{ task.progress }}%</div></td><td><button class="small-button" @click="openFeedback(task)">更新反馈</button></td></tr><tr v-if="!myTasks.length"><td colspan="5" class="empty-cell">暂无分配给你的任务</td></tr></tbody></table></div></article><article class="panel due-panel"><div class="panel-heading"><div><p class="eyebrow">PERSONAL NOTIFICATIONS</p><h3>待关注通知</h3></div><Bell :size="18" class="panel-icon" /></div><div class="due-list"><div v-for="item in data.notifications.filter((item) => !item.read).slice(0, 3)" :key="item.id" class="due-item normal"><div><strong>{{ item.title }}</strong><div class="due-meta">{{ item.time }}</div></div></div></div><button class="wide-ghost" @click="navigate('/notifications')">进入通知中心 <ArrowRight :size="15" /></button></article></div>
        </section>

        <section v-else-if="currentPage === 'projects'" class="page-section"><div class="filter-bar"><label class="inline-search"><Search :size="16" /><input v-model="search" placeholder="搜索项目名称、编码或负责人" /></label><select v-model="projectStateFilter"><option value="all">全部状态</option><option>进行中</option><option>暂停</option><option>已归档</option></select><span class="result-count">{{ filteredProjects.length }} 个项目</span></div><div class="project-grid"><article v-for="project in filteredProjects" :key="project.id" class="project-card"><div class="project-card-top"><span class="tag" :class="project.state === '进行中' ? 'green' : project.state === '暂停' ? 'amber' : 'gray'">{{ project.state }}</span><button v-if="canManageBusiness" class="icon-button" title="归档项目" @click="confirmArchive(project)"><Archive :size="17" /></button></div><h3>{{ project.name }}</h3><p class="mono">{{ project.code }}</p><div class="project-progress"><div><span>项目完成率</span><b>{{ project.progress }}%</b></div><div class="progress-track"><span :style="{ width: `${project.progress}%` }"></span></div></div><div class="project-meta"><span><Users :size="14" />{{ project.members }} 人</span><span>负责人 {{ project.owner }}</span><span class="mono">截止 {{ project.deadline }}</span></div><div class="project-card-actions"><button v-if="canManageBusiness" class="secondary-button" @click="openProjectMembers(project)"><Users :size="14" /> 项目成员</button><button class="project-open" @click="navigate(user.role === 'member' ? '/my-tasks' : '/tasks')">进入项目 <ArrowRight :size="14" /></button></div></article><button v-if="canManageBusiness" class="project-card add-card" @click="showCreateProject = true"><Plus :size="22" /><strong>创建新项目</strong><span>从一个清晰的目标开始</span></button></div></section>

        <section v-else-if="currentPage === 'tasks'" class="page-section"><div class="filter-bar"><label class="inline-search"><Search :size="16" /><input v-model="search" placeholder="搜索任务、项目或负责人" /></label><select v-model="taskStateFilter"><option value="all">全部状态</option><option value="todo">待处理</option><option value="in-progress">进行中</option><option value="completed">已完成</option></select><button class="view-toggle" @click="flash('看板视图即将上线')">看板视图</button><span class="result-count">{{ filteredTasks.length }} 个任务</span></div><article class="panel table-panel"><div class="table-wrap"><table><thead><tr><th>任务</th><th>项目</th><th>负责人</th><th>优先级</th><th>截止日期</th><th>进度</th><th>状态</th><th></th></tr></thead><tbody><tr v-for="task in filteredTasks" :key="task.id" @click="selectedTask = task"><td><strong>{{ task.title }}</strong><small class="mono">{{ task.id }}<span v-if="task.source" class="source-dot"> · AI</span></small></td><td>{{ task.project }}</td><td><span class="person"><span class="avatar small">{{ task.owner.slice(0, 1) }}</span>{{ task.owner }}</span></td><td><span class="tag" :class="task.priority === '紧急' ? 'red' : task.priority === '高' ? 'amber' : 'blue'">{{ task.priority }}</span></td><td class="mono">{{ task.due }}</td><td><div class="table-progress"><span class="progress-track"><i :style="{ width: `${task.progress}%` }"></i></span>{{ task.progress }}%</div></td><td><span class="tag" :class="task.state === 'completed' ? 'green' : task.state === 'in-progress' ? 'blue' : 'gray'">{{ statusLabel(task.state) }}</span></td><td><button v-if="canUpdateTasks" class="icon-button" title="推进状态" @click.stop="updateTask(task, task.state === 'todo' ? 'in-progress' : task.state === 'in-progress' ? 'completed' : 'todo')"><CheckCircle2 :size="17" /></button></td></tr></tbody></table></div></article></section>

        <section v-else-if="currentPage === 'my-tasks'" class="page-section member-workspace">
          <div class="member-summary panel"><div><p class="eyebrow">PERSONAL DELIVERY VIEW</p><h2>{{ user.name }}，今天优先完成这 {{ myTasks.filter((task) => task.state !== 'completed').length }} 项工作</h2><p class="muted">你只能更新本人任务的进度、状态与工作反馈，项目经理会实时收到同步通知。</p></div><div class="member-summary-stat"><strong>{{ myTasks.filter((task) => task.state === 'completed').length }}/{{ myTasks.length }}</strong><span>已完成任务</span></div></div>
          <div class="member-task-grid"><article v-for="task in myTasks" :key="task.id" class="member-task-card"><div class="member-card-head"><span class="tag" :class="task.state === 'completed' ? 'green' : task.state === 'in-progress' ? 'blue' : 'gray'">{{ statusLabel(task.state) }}</span><span class="mono">{{ task.id }}</span></div><h3>{{ task.title }}</h3><p>{{ task.project }}</p><div class="member-task-meta"><span><CalendarDays :size="14" />{{ task.due }}</span><span class="tag" :class="task.priority === '紧急' ? 'red' : task.priority === '高' ? 'amber' : 'blue'">{{ task.priority }}</span></div><div class="member-progress"><div><span>当前进度</span><b>{{ task.progress }}%</b></div><div class="progress-track"><span :style="{ width: `${task.progress}%` }"></span></div></div><div class="member-card-actions"><button class="secondary-button" @click="openFeedback(task)"><ClipboardList :size="15" /> 提交反馈</button><button v-if="task.state !== 'completed'" class="primary-button" @click="updateTask(task, task.state === 'todo' ? 'in-progress' : 'completed')">{{ task.state === 'todo' ? '开始任务' : '完成任务' }}</button></div></article><div v-if="!myTasks.length" class="empty-member panel"><CheckCircle2 :size="26" /><strong>当前没有分配给你的任务</strong><span>任务分派后会自动出现在这里。</span></div></div>
          <article class="panel member-feedback-panel"><div class="panel-heading"><div><p class="eyebrow">RECENT FEEDBACK</p><h3>我的近期工作反馈</h3></div></div><div v-if="data.feedbacks.filter((item) => item.author === user.name).length" class="feedback-list"><div v-for="item in data.feedbacks.filter((item) => item.author === user.name)" :key="item.id" class="feedback-item"><span class="avatar">{{ user.name.slice(0, 1) }}</span><div><strong>{{ item.content }}</strong><p>{{ item.createdAt }} · 已更新至 {{ item.progress }}%</p></div></div></div><div v-else class="feedback-empty">暂未提交工作反馈。提交后，项目经理可在项目动态中查看。</div></article>
        </section>

        <section v-else-if="currentPage === 'risks'" class="page-section"><div class="filter-bar"><select v-model="riskLevelFilter"><option value="all">全部风险等级</option><option value="high">高风险</option><option value="medium">中风险</option><option value="low">低风险</option></select><span class="risk-summary"><b>{{ highRiskCount }}</b> 个高风险项待处理</span></div><article class="panel table-panel"><div class="table-wrap"><table><thead><tr><th>风险事项</th><th>关联任务</th><th>等级</th><th>负责人</th><th>处理状态</th><th>操作</th></tr></thead><tbody><tr v-for="risk in filteredRisks" :key="risk.id"><td><strong>{{ risk.title }}</strong><small class="mono">{{ risk.id }}</small></td><td>{{ risk.task }}</td><td><span class="tag" :class="risk.level === 'high' ? 'red' : risk.level === 'medium' ? 'amber' : 'green'">{{ riskLabel(risk.level) }}</span></td><td><span class="person"><span class="avatar small">{{ risk.owner.slice(0, 1) }}</span>{{ risk.owner }}</span></td><td><span class="tag" :class="risk.status === '已处理' ? 'green' : 'amber'">{{ risk.status }}</span></td><td><button v-if="canManageBusiness && risk.status !== '已处理'" class="small-button" @click="resolveRisk(risk.id)">标记处理</button><span v-else class="muted">{{ risk.status === '已处理' ? '已完成' : '只读' }}</span></td></tr></tbody></table></div></article></section>

        <section v-else-if="currentPage === 'notifications'" class="page-section"><div class="filter-bar"><button class="segmented" :class="{ selected: !unreadOnly }" @click="unreadOnly = false">全部通知</button><button class="segmented" :class="{ selected: unreadOnly }" @click="unreadOnly = true">未读通知</button><span class="result-count">{{ filteredNotifications.length }} 条</span></div><div class="notification-list"><article v-for="item in filteredNotifications" :key="item.id" class="notification-item" :class="{ unread: !item.read }" @click="markNotification(item.id, item.path)"><span class="notification-icon"><Bell :size="17" /></span><div><strong>{{ item.title }}</strong><p>{{ item.time }}</p></div><span v-if="!item.read" class="unread-dot"></span><ArrowRight :size="16" class="notification-arrow" /></article></div></section>

        <section v-else-if="currentPage === 'experiments'" class="page-section"><div class="experiment-hero panel"><div><p class="eyebrow">CONTROLLED EVALUATION</p><h2>AI 运行模式对比</h2><p class="muted">实验指标将在接入评测数据源后显示。</p></div><button class="primary-button" disabled title="评测数据源尚未配置"><Zap :size="15" /> 暂不可运行</button></div><article class="panel empty-cell">当前没有可展示的实验运行记录。配置评测数据集和运行队列后，结果会在此持久化展示。</article></section>

        <section v-else-if="currentPage === 'calendar'" class="page-section"><div class="calendar-toolbar"><button class="icon-button" title="上个月" @click="selectedCalendarMonth = shiftCalendarMonth(selectedCalendarMonth, -1)"><ArrowRight :size="16" class="rotate-180" /></button><div class="calendar-date"><strong>团队日历</strong><span>{{ selectedCalendarLabel }}</span></div><button class="icon-button" title="下个月" @click="selectedCalendarMonth = shiftCalendarMonth(selectedCalendarMonth, 1)"><ArrowRight :size="16" /></button><button class="secondary-button" @click="selectedCalendarMonth = `${localIsoDate(new Date()).slice(0, 7)}-01`">今天</button></div><article class="panel calendar-panel"><div class="calendar-panel-head"><div><p class="eyebrow">MONTHLY SCHEDULE</p><h3>{{ selectedCalendarLabel }}</h3></div><span class="tag gray">任务截止日与会议创建日</span></div><div class="calendar-grid"><div v-for="weekday in ['一', '二', '三', '四', '五', '六', '日']" :key="weekday" class="calendar-weekday">周{{ weekday }}</div><button v-for="day in calendarDays" :key="day.date" class="calendar-day" :class="{ muted: !day.inMonth, today: day.date === localIsoDate(new Date()), 'has-tasks': taskEventsForCalendarDate(data.calendarEvents, day.date).length > 0 }" @click="openCalendarDay(day.date)"><span class="calendar-day-number">{{ Number(day.date.slice(-2)) }}<i v-if="taskEventsForCalendarDate(data.calendarEvents, day.date).length" class="calendar-task-dot"></i></span><span class="calendar-day-events"><span v-for="event in visibleEventsForDay(day.date)" :key="`${event.type}-${event.id}`" class="calendar-event" :class="event.type === 'meeting' ? 'meeting-event' : calendarTagClass(event)" :title="`${event.title} · ${event.project}`">{{ event.title }}</span><span v-if="calendarEventsForDay(day.date).length > 3" class="calendar-more">还有 {{ calendarEventsForDay(day.date).length - 3 }} 条</span></span></button></div></article></section>

        <section v-else-if="currentPage === 'efficiency'" class="page-section"><div class="metric-grid compact"><article class="metric-card"><div class="metric-label">已完成任务 <Check :size="16" /></div><div class="metric-number">{{ completedCount }}</div><small>{{ deliveryCycleLabel }}</small></article><article class="metric-card"><div class="metric-label">平均交付周期 <Gauge :size="16" /></div><div class="metric-number">—</div><small>任务记录暂无完整周期数据</small></article><article class="metric-card"><div class="metric-label">活跃成员 <Users :size="16" /></div><div class="metric-number">{{ activeMemberCount }}<span>人</span></div><small>按当前任务负责人统计</small></article></div><div class="analysis-grid"><article class="panel chart-panel"><div class="panel-heading"><div><p class="eyebrow">TEAM DELIVERY</p><h3>团队完成趋势</h3></div><span class="chart-range">暂无时间序列数据</span></div><div class="empty-cell">完成任务后将基于真实更新时间生成趋势。</div></article><article class="panel member-panel"><div class="panel-heading"><div><p class="eyebrow">TEAM LEADERBOARD</p><h3>成员交付效率</h3></div></div><div class="empty-cell">暂无足够的历史数据。</div></article></div></section>

        <section v-else-if="currentPage === 'settings'" class="page-section"><div class="settings-layout"><div class="settings-nav panel"><button class="selected">模型与运行模式</button><button>数据脱敏规则</button><button>账号与角色</button><button>通知设置</button></div><article class="panel settings-content"><div class="panel-heading"><div><p class="eyebrow">MODEL PROVIDER</p><h3>模型与运行模式</h3></div><span class="tag green">已持久化</span></div><label class="setting-field"><span>默认模型</span><select v-model="systemSettings.model"><option>DeepSeek V3</option><option>Qwen 2.5</option><option>GPT-4o</option></select></label><label class="setting-field"><span>AI 运行模式</span><select v-model="systemSettings.mode"><option>无 AI</option><option>单轮大模型</option><option>RAG 检索增强</option><option>智能体编排</option></select></label><div class="setting-toggle"><div><strong>会议内容自动脱敏</strong><small>对手机号、邮箱和身份证号进行替换处理</small></div><button class="toggle" :class="{ on: systemSettings.desensitize }" @click="systemSettings.desensitize = !systemSettings.desensitize"><i></i></button></div><button class="primary-button" :disabled="settingsSaving" @click="saveSystemSettings">{{ settingsSaving ? '保存中…' : '保存设置' }}</button></article></div></section>
        <section v-else-if="currentPage === 'meetings'" class="page-section"><article class="panel"><div class="panel-heading"><div><p class="eyebrow">MEETING MINUTES</p><h3>提交会议纪要并发起 DeepSeek 分析</h3></div><button class="secondary-button" type="button" @click="showMeetingVersions">版本记录</button></div><form class="meeting-form" @submit.prevent="submitMeeting"><label class="meeting-field"><span>所属项目</span><select v-model="meetingProjectId"><option value="">请选择项目</option><option v-for="project in data.projects" :key="project.id" :value="project.id">{{ project.name }}</option></select></label><label class="meeting-field"><span>会议标题</span><input v-model="meetingTitle" placeholder="例如：版本发布评审会" /></label><label class="meeting-field"><span>会议纪要</span><textarea v-model="meetingContent" rows="12" placeholder="粘贴会议纪要内容，DeepSeek 将抽取任务、决策和风险"></textarea></label><label class="meeting-field"><span>或上传 TXT / Word</span><input type="file" accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" @change="selectMeetingFile" /><small v-if="meetingFile" class="muted">已选择：{{ meetingFile.name }}</small></label><p v-if="meetingNotice" class="meeting-notice muted">{{ meetingNotice }}</p><button class="primary-button" type="submit"><Zap :size="15" /> 提交并分析</button></form><div v-if="meetingVersions.length" class="meeting-version-list"><div v-for="version in meetingVersions" :key="version.id" class="meeting-version-row"><div><strong>版本 {{ version.versionNumber }}</strong><small>{{ version.sourceType }} · {{ version.createdAt }}</small></div><div><button class="small-button" @click="inspectMeetingVersion(version.id)">查看</button><button class="small-button" @click="restoreMeetingVersion(version.id)">恢复</button></div></div></div></article></section>
        <section v-else-if="currentPage === 'reviews'" class="page-section"><article class="panel table-panel"><div class="panel-heading"><div><p class="eyebrow">AI REVIEW QUEUE</p><h3>待审核 AI 分析</h3></div></div><div class="table-wrap"><table><thead><tr><th>会议</th><th>摘要</th><th>任务数</th><th>风险数</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="analysis in meetings.state.analyses" :key="analysis.id"><td><strong>{{ analysis.title }}</strong></td><td>{{ analysis.result?.summary }}</td><td>{{ analysis.result?.tasks?.length ?? 0 }}</td><td>{{ analysis.result?.risks?.length ?? 0 }}</td><td>{{ analysis.status }}</td><td v-if="analysis.status === 'pending'"><button class="small-button" @click="reviewMeetingAnalysis(analysis.id, true)">通过</button><button class="small-button" @click="reviewMeetingAnalysis(analysis.id, false)">驳回</button></td><td v-else class="muted">已处理</td></tr><tr v-if="!meetings.state.analyses.length"><td colspan="6" class="empty-cell">暂无 AI 分析</td></tr></tbody></table></div></article></section>
        <section v-else-if="currentPage === 'users'" class="page-section"><article class="panel table-panel"><div class="panel-heading"><div><p class="eyebrow">ACCOUNT ADMINISTRATION</p><h3>账号与角色</h3></div><button class="primary-button" @click="showCreateUser = true"><Plus :size="15" /> 新增账号</button></div><div class="table-wrap"><table><thead><tr><th>姓名</th><th>邮箱</th><th>角色</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="managed in managedUsers" :key="managed.id"><td>{{ managed.name }}</td><td>{{ managed.email }}</td><td><select :value="managed.role" @change="auth.updateUser(props.token, managed.id, { role: ($event.target as HTMLSelectElement).value as UserRole }).then(() => managed.role = ($event.target as HTMLSelectElement).value as UserRole)"><option value="manager">项目经理</option><option value="member">项目成员</option><option value="admin">系统管理员</option><option value="auditor">审计员</option></select></td><td><button class="small-button" @click="setManagedUserActive(managed, !managed.is_active)">{{ managed.is_active ? '停用' : '启用' }}</button></td><td><button class="small-button" @click="resetPasswordUser = managed; resetPasswordValue = ''">重置密码</button></td></tr></tbody></table></div></article></section>
        <section v-else-if="currentPage === 'audit-logs'" class="page-section"><article class="panel table-panel"><div class="panel-heading"><div><p class="eyebrow">AUDIT LOGS</p><h3>关键操作记录</h3></div></div><div class="table-wrap"><table><thead><tr><th>时间</th><th>操作者</th><th>操作</th><th>对象</th><th>详情</th></tr></thead><tbody><tr v-for="log in auditLogs" :key="log.id"><td class="mono">{{ log.created_at }}</td><td>{{ log.actor_name ?? '系统' }}</td><td>{{ log.action }}</td><td>{{ log.entity_type }} / {{ log.entity_id ?? '-' }}</td><td>{{ log.details }}</td></tr><tr v-if="!auditLogs.length"><td colspan="5" class="empty-cell">暂无审计记录</td></tr></tbody></table></div></article></section>
      </div>
    </main>

    <div v-if="showCreateProject" class="modal-backdrop" @click.self="showCreateProject = false"><div class="modal"><div class="modal-head"><div><p class="eyebrow">NEW PROJECT</p><h3>创建新项目</h3></div><button class="icon-button" @click="showCreateProject = false"><X :size="18" /></button></div><label class="modal-field"><span>项目名称 <b>*</b></span><input v-model="newProjectName" autofocus placeholder="例如：会议智能化 2.0" @keyup.enter="createProject" /></label><div class="modal-actions"><button class="secondary-button" @click="showCreateProject = false">取消</button><button class="primary-button" @click="createProject">创建项目</button></div></div></div>
    <div v-if="showCreateUser" class="modal-backdrop" @click.self="showCreateUser = false"><div class="modal"><div class="modal-head"><div><p class="eyebrow">ACCOUNT ADMINISTRATION</p><h3>新增账号</h3></div><button class="icon-button" @click="showCreateUser = false"><X :size="18" /></button></div><label class="modal-field"><span>姓名 <b>*</b></span><input v-model="newUserName" autofocus /></label><label class="modal-field"><span>邮箱 <b>*</b></span><input v-model="newUserEmail" type="email" /></label><label class="modal-field"><span>初始密码 <b>*</b></span><input v-model="newUserPassword" type="password" minlength="8" /></label><label class="modal-field"><span>角色 <b>*</b></span><select v-model="roleDraft"><option value="manager">项目经理</option><option value="member">项目成员</option><option value="admin">系统管理员</option><option value="auditor">审计员</option></select></label><div class="modal-actions"><button class="secondary-button" @click="showCreateUser = false">取消</button><button class="primary-button" @click="createManagedUser">创建账号</button></div></div></div>
    <div v-if="resetPasswordUser" class="modal-backdrop" @click.self="resetPasswordUser = null"><div class="modal"><div class="modal-head"><div><p class="eyebrow">RESET PASSWORD</p><h3>{{ resetPasswordUser.name }}</h3></div><button class="icon-button" @click="resetPasswordUser = null"><X :size="18" /></button></div><label class="modal-field"><span>新密码 <b>*</b></span><input v-model="resetPasswordValue" type="password" minlength="8" @keyup.enter="resetManagedPassword" /></label><div class="modal-actions"><button class="secondary-button" @click="resetPasswordUser = null">取消</button><button class="primary-button" @click="resetManagedPassword">确认重置</button></div></div></div>
    <div v-if="feedbackTask" class="modal-backdrop" @click.self="feedbackTask = null"><div class="modal feedback-modal"><div class="modal-head"><div><p class="eyebrow">WORK FEEDBACK · {{ feedbackTask.id }}</p><h3>提交工作反馈</h3></div><button class="icon-button" @click="feedbackTask = null"><X :size="18" /></button></div><p class="feedback-task-title">{{ feedbackTask.title }}</p><label class="modal-field"><span>当前进度：<b>{{ feedbackProgress }}%</b></span><input v-model.number="feedbackProgress" type="range" min="0" max="100" step="5" /></label><label class="modal-field"><span>反馈内容 <b>*</b></span><textarea v-model="feedbackText" placeholder="说明当前完成情况、遇到的问题或下一步计划"></textarea></label><div class="modal-actions"><button class="secondary-button" @click="feedbackTask = null">取消</button><button class="primary-button" @click="submitFeedback">提交反馈</button></div></div></div>
    <div v-if="selectedTask" class="modal-backdrop" @click.self="selectedTask = null"><div class="modal task-modal"><div class="modal-head"><div><p class="eyebrow">TASK DETAIL · {{ selectedTask.id }}</p><h3>{{ selectedTask.title }}</h3></div><button class="icon-button" @click="selectedTask = null"><X :size="18" /></button></div><div class="detail-grid"><div><span>项目</span><strong>{{ selectedTask.project }}</strong></div><div><span>负责人</span><strong>{{ selectedTask.owner }}</strong></div><div><span>截止日期</span><strong>{{ selectedTask.due }}</strong></div><div><span>当前状态</span><strong>{{ statusLabel(selectedTask.state) }}</strong></div></div><div class="detail-progress"><div><span>完成进度</span><b>{{ selectedTask.progress }}%</b></div><div class="progress-track"><span :style="{ width: `${selectedTask.progress}%` }"></span></div></div><div class="modal-actions"><button class="secondary-button" @click="selectedTask = null">关闭</button><button v-if="canUpdateTasks && selectedTask.state !== 'completed'" class="primary-button" @click="updateTask(selectedTask, selectedTask.state === 'todo' ? 'in-progress' : 'completed'); selectedTask = null">推进任务</button></div></div></div>
    <div v-if="selectedMeetingVersion" class="modal-backdrop" @click.self="selectedMeetingVersion = null"><div class="modal task-modal"><div class="modal-head"><div><p class="eyebrow">MEETING VERSION</p><h3>版本 {{ selectedMeetingVersion.versionNumber }}</h3></div><button class="icon-button" @click="selectedMeetingVersion = null"><X :size="18" /></button></div><div class="version-content"><strong>脱敏后分析内容</strong><pre>{{ selectedMeetingVersion.desensitizedContent }}</pre><strong>原始内容</strong><pre>{{ selectedMeetingVersion.originalContent }}</pre></div><div class="modal-actions"><button class="secondary-button" @click="selectedMeetingVersion = null">关闭</button><button class="primary-button" @click="restoreMeetingVersion(selectedMeetingVersion.id); selectedMeetingVersion = null">恢复此版本</button></div></div></div>
    <div v-if="showProjectMembers && selectedMemberProject" class="modal-backdrop" @click.self="showProjectMembers = false"><div class="modal task-modal"><div class="modal-head"><div><p class="eyebrow">PROJECT MEMBERS</p><h3>{{ selectedMemberProject.name }}</h3></div><button class="icon-button" @click="showProjectMembers = false"><X :size="18" /></button></div><div class="member-add-row"><select v-model="memberCandidateId"><option value="">选择账号</option><option v-for="candidate in memberCandidates" :key="candidate.id" :value="candidate.id">{{ candidate.name }} · {{ candidate.email }}</option></select><select v-model="memberProjectRole"><option value="member">项目成员</option><option value="manager">项目经理</option></select><button class="primary-button" @click="addSelectedProjectMember">添加</button></div><div class="member-manage-list"><div v-for="member in projectMembers" :key="member.id" class="member-manage-row"><div><strong>{{ member.name }}</strong><small>{{ member.email }} · {{ member.project_role === 'manager' ? '项目经理' : '项目成员' }}</small></div><button class="small-button" @click="removeSelectedProjectMember(member.id)">移除</button></div></div></div></div>
    <div v-if="selectedCalendarDay" class="modal-backdrop" @click.self="selectedCalendarDay = null"><div class="modal calendar-detail-modal"><div class="modal-head"><div><p class="eyebrow">DAILY TASKS</p><h3>{{ formatCalendarDate(selectedCalendarDay) }}</h3></div><button class="icon-button" title="关闭" @click="selectedCalendarDay = null"><X :size="18" /></button></div><div v-if="selectedCalendarTasks.length" class="calendar-detail-list"><article v-for="task in selectedCalendarTasks" :key="task.id" class="calendar-detail-item"><div><strong>{{ task.title }}</strong><p>{{ task.project }} · {{ task.owner }}</p></div><span class="tag" :class="calendarTagClass(task)">{{ task.priority ?? '中' }}</span></article></div><div v-else class="calendar-detail-empty">当日没有任务截止日。</div><div class="modal-actions"><button class="secondary-button" @click="selectedCalendarDay = null">关闭</button></div></div></div>
    <transition name="toast"><div v-if="toast" class="toast"><CheckCircle2 :size="17" />{{ toast }}</div></transition>
  </div>
</template>
