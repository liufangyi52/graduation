<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  AlertTriangle, Archive, ArrowRight, BarChart3, Bell, CalendarDays, Check, CheckCircle2,
  ChevronDown, ClipboardList, FolderKanban, Gauge, LayoutDashboard, Menu,
  Moon, PanelLeft, Pencil, Plus, RotateCcw, Search, Settings, ShieldAlert, Sparkles, StickyNote, Tags, Trash2,
  Sun, Target, TestTube2, Users, X, Zap,
} from 'lucide-vue-next'
import { createWorkspaceService, type CalendarEvent, type DesensitizationRule, type Project, type ProjectMember, type ProjectTag, type RiskLevel, type Task, type TaskNote, type TaskState } from './services/workspaceService'
import { canManageProjectBusiness, canUpdateVisibleTasks, createAuthService, roleLabels, type ManagedUser, type SystemSettings, type UserAccount, type UserRole } from './services/authService'
import { createMeetingService } from './services/meetingService'
import type { AnalysisMode, ExperimentSummaryMetric, MeetingVersion, MeetingVersionSummary } from './services/meetingService'
import ProjectDetailPage from './components/ProjectDetailPage.vue'
import MeetingReviewPage from './components/MeetingReviewPage.vue'
import TaskBoardPage from './components/TaskBoardPage.vue'
import { beijingGreeting, formatBeijingDate, formatBeijingDateTime, formatBeijingMinute } from './utils/date'
import { calendarMonthDays, eventsForCalendarDate, formatCalendarDate, formatCalendarMonth, localIsoDate, shiftCalendarMonth, taskEventsForCalendarDate, visibleCalendarEvents } from './utils/calendar'
import { averageTaskProgress } from './utils/progress'
import { selectDeadlineWatchTasks } from './utils/tasks'
import { analysisStatusLabel, priorityLabel, projectRoleLabel, projectStatusLabel, riskLevelLabel, riskStatusLabel, systemRoleLabel, taskStatusLabel } from './utils/labels'
import { createRagExperimentController } from './services/ragExperimentController'

const props = defineProps<{ user: UserAccount; token: string }>()
const emit = defineEmits<{ logout: [] }>()

const route = useRoute()
const router = useRouter()
const service = createWorkspaceService(props.token)
const data = service.state
const auth = createAuthService()
const meetings = createMeetingService(props.token)
const ragExperiments = createRagExperimentController(meetings)
const isAuditor = computed(() => props.user.role === 'auditor')
if (props.user.role === 'auditor') {
  void service.loadNotifications().catch(() => flash('通知加载失败'))
} else {
  void service.load().catch(() => flash('真实数据加载失败，请检查后端服务'))
  void service.loadCalendarEvents().catch(() => {})
  void meetings.load().catch(() => {})
}

const dark = ref(false)
const sidebarOpen = ref(true)
const search = ref('')
const projectStateFilter = ref<'all' | Project['state']>('all')
const riskLevelFilter = ref<'all' | RiskLevel>('all')
const unreadOnly = ref(false)
const showCreateProject = ref(false)
const newProjectName = ref('')
const toast = ref('')
const selectedTask = ref<Task | null>(null)
const selectedNotification = ref<(typeof data.notifications)[number] | null>(null)
const selectedCalendarDay = ref<string | null>(null)
const feedbackTask = ref<Task | null>(null)
const feedbackText = ref('')
const feedbackProgress = ref(0)
const managedUsers = ref<ManagedUser[]>([])
const auditLogs = ref<any[]>([])
const meetingProjectId = ref('')
const meetingTitle = ref('')
const meetingContent = ref('')
const meetingAnalysisMode = ref<AnalysisMode>('llm')
const experimentProjectId = ref('')
const experimentSummary = computed(() => ragExperiments.state.summary)
const ragIndexStatus = computed(() => ragExperiments.state.status)
const ragIndexStatusLoading = computed(() => ragExperiments.state.statusLoading)
const experimentLoading = computed(() => ragExperiments.state.summaryLoading)
const ragIndexSyncing = computed(() => ragExperiments.state.syncing)
const experimentNotice = computed(() => ragExperiments.state.notice)
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
const projectEditor = ref<Project | null>(null)
const projectDraft = ref({ name: '', code: '', description: '', endDate: '', status: 'active' as 'active' | 'paused' | 'archived' })
const deletedProjects = ref<Array<{ id: string; name: string; code: string; deleted_at: string }>>([])
const showDeletedProjects = ref(false)
const tagProject = ref<Project | null>(null)
const projectTags = ref<ProjectTag[]>([])
const tagName = ref('')
const ruleProject = ref<Project | null>(null)
const desensitizationRules = ref<DesensitizationRule[]>([])
const ruleDraft = ref({ name: '', pattern: '', replacement: '', enabled: true })
const editingRuleId = ref<string | null>(null)
const taskEditor = ref<Task | null>(null)
const showTaskEditor = ref(false)
const taskDraft = ref({ projectId: '', title: '', description: '', assigneeId: '', priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent', dueDate: '', status: 'todo' as 'todo' | 'in_progress' | 'completed', progress: 0 })
const taskAssignees = ref<ProjectMember[]>([])
const taskNotes = ref<TaskNote[]>([])
const taskNoteText = ref('')
const selectedReviewIds = ref<string[]>([])
const reviewReanalysisMode = ref<AnalysisMode>('llm')
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
const now = ref(new Date())
const todayLabel = computed(() => formatBeijingDate(now.value))
const greeting = computed(() => beijingGreeting(now.value))
const selectedCalendarMonth = ref(`${localIsoDate(new Date()).slice(0, 7)}-01`)
let dateTimer: number | undefined
let taskRefreshTimer: number | undefined

onMounted(() => {
  dateTimer = window.setInterval(() => { now.value = new Date() }, 60_000)
  if (!isAuditor.value) taskRefreshTimer = window.setInterval(() => { void service.load().catch(() => {}) }, 10_000)
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
  search: { title: '搜索结果', eyebrow: 'SEARCH', description: '查看当前权限范围内匹配的项目、任务和会议记录' },
}

Object.assign(pageMeta, {
  'project-detail': { title: '项目详情', eyebrow: 'PROJECT DETAIL', description: '查看项目协作、会议、风险与成员信息' },
  'project-meetings': { title: '项目会议', eyebrow: 'PROJECT MEETINGS', description: '查看该项目的会议与审核状态' },
  'meeting-review': { title: '审核详情', eyebrow: 'AI REVIEW DETAIL', description: '查看脱敏纪要证据并审核 AI 提取结果' },
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
  mode: analysis.mode,
  confidence: Number(analysis.result?.confidence ?? 0),
  time: analysis.createdAt,
  status: analysis.status,
})))
const dueTasks = computed(() => selectDeadlineWatchTasks(data.overdueTasks))
const filteredProjects = computed(() => data.projects.filter((project) => {
  const matchesSearch = !search.value || `${project.name}${project.code}${project.owner}`.toLowerCase().includes(search.value.toLowerCase())
  const matchesState = projectStateFilter.value === 'all' || project.state === projectStateFilter.value
  return matchesSearch && matchesState
}))
const filteredRisks = computed(() => data.risks.filter((risk) => riskLevelFilter.value === 'all' || risk.level === riskLevelFilter.value))
const filteredNotifications = computed(() => data.notifications.filter((item) => !unreadOnly.value || !item.read))
const unreadNotificationCount = computed(() => data.notifications.filter((item) => !item.read).length)
const recentNotifications = computed(() => data.notifications.filter((item) => !item.read).slice(0, 3))
const globalSearchTerm = computed(() => String(route.query.q ?? '').trim().toLocaleLowerCase())
const globalSearchResults = computed(() => {
  const term = globalSearchTerm.value
  if (!term) return [] as Array<{ kind: '项目' | '任务' | '会议'; title: string; detail: string; path: string }>
  const matches = (value: string) => value.toLocaleLowerCase().includes(term)
  const projects = data.projects.filter((project) => matches(`${project.name} ${project.code} ${project.owner}`)).map((project) => ({ kind: '项目' as const, title: project.name, detail: `${project.code} · 负责人 ${project.owner}`, path: `/projects/${project.id}` }))
  const tasks = data.tasks.filter((task) => matches(`${task.title} ${task.project} ${task.owner} ${task.description ?? ''}`)).map((task) => ({ kind: '任务' as const, title: task.title, detail: `${task.project} · 负责人 ${task.owner}`, path: props.user.role === 'member' ? '/my-tasks' : '/tasks' }))
  const meetingResults = auth.visibleRoutes(props.user.role).includes('/reviews')
    ? meetings.state.analyses.filter((analysis) => matches(analysis.title)).map((analysis) => ({ kind: '会议' as const, title: analysis.title, detail: '会议纪要审核记录', path: `/meetings/${analysis.meetingId}/review` }))
    : []
  return [...projects, ...tasks, ...meetingResults]
})
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
const experimentModes: Array<{ mode: AnalysisMode; label: string }> = [
  { mode: 'manual', label: '人工审核' },
  { mode: 'llm', label: 'LLM' },
  { mode: 'rag', label: 'RAG' },
  { mode: 'agent', label: '智能体' },
]
const emptyExperimentMetric = (): ExperimentSummaryMetric => ({ runCount: 0, pendingCount: 0, failedCount: 0, approvedCount: 0, rejectedCount: 0, totalDurationMs: 0, averageDurationMs: 0, totalModelCalls: 0 })
const experimentRows = computed(() => experimentModes.map(({ mode, label }) => ({ mode, label, ...(experimentSummary.value?.[mode] ?? emptyExperimentMetric()) })))
const experimentRunCount = computed(() => experimentRows.value.reduce((total, item) => total + item.runCount, 0))
const ragIndexReady = computed(() => ragExperiments.isReady())

async function loadExperimentSummary() {
  if (!canManageBusiness.value) return
  await ragExperiments.loadSelectedProject(experimentProjectId.value)
}

async function syncRagIndex() {
  if (!canManageBusiness.value || !experimentProjectId.value || !ragIndexReady.value) return
  await ragExperiments.sync()
}

watch(() => route.path, (path) => {
  const isScopedWorkflow = (path.startsWith('/projects/') && auth.visibleRoutes(props.user.role).includes('/projects'))
    || (path.startsWith('/meetings/') && auth.visibleRoutes(props.user.role).includes('/reviews'))
  if (!isScopedWorkflow && !auth.visibleRoutes(props.user.role).includes(path)) router.replace('/dashboard')
}, { immediate: true })

watch(selectedTask, (task) => { if (task) void loadTaskNotes(task) })
watch(() => route.query.q, (query) => {
  if (route.name === 'search') search.value = String(query ?? '')
})

function navigate(path: string) {
  search.value = ''
  router.push(path)
}
function submitGlobalSearch() {
  const query = search.value.trim()
  if (!query) return flash('请输入搜索内容')
  router.push({ path: '/search', query: { q: query } })
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
function calendarTagClass(event: CalendarEvent) {
  if (event.type === 'meeting') return 'blue'
  if (event.state === 'completed') return 'green'
  if (event.priority === '紧急') return 'red'
  if (event.priority === '高') return 'amber'
  return 'gray'
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
    await meetings.analyze(meeting.id, meetingAnalysisMode.value)
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

async function openNotification(item: (typeof data.notifications)[number]) {
  selectedNotification.value = item
  if (item.read) return
  try {
    await service.markRead(item.id)
    item.read = true
  } catch (reason) { flash(reason instanceof Error ? reason.message : '通知状态更新失败') }
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
function openProjectEditor(project: Project) {
  projectEditor.value = project
  projectDraft.value = { name: project.name, code: project.code, description: project.description ?? '', endDate: project.deadline === '未设置' ? '' : project.deadline, status: project.state === '暂停' ? 'paused' : project.state === '已归档' ? 'archived' : 'active' }
}
async function saveProject() {
  if (!projectEditor.value) return
  try { await service.updateProject(projectEditor.value.id, projectDraft.value); await service.load(); projectEditor.value = null; flash('项目已更新') } catch (reason) { flash(reason instanceof Error ? reason.message : '项目更新失败') }
}
async function manageProjectTags(project: Project) {
  tagProject.value = project
  try { projectTags.value = await service.listProjectTags(project.id) } catch (reason) { flash(reason instanceof Error ? reason.message : '标签加载失败') }
}
async function addProjectTag() {
  if (!tagProject.value || !tagName.value.trim()) return
  try { await service.createProjectTag(tagProject.value.id, tagName.value.trim()); projectTags.value = await service.listProjectTags(tagProject.value.id); tagName.value = '' } catch (reason) { flash(reason instanceof Error ? reason.message : '标签保存失败') }
}
async function toggleProjectTag(tag: ProjectTag) {
  if (!tagProject.value) return
  try { if (tag.linked) await service.unlinkProjectTag(tagProject.value.id, tag.id); else await service.linkProjectTag(tagProject.value.id, tag.id); projectTags.value = await service.listProjectTags(tagProject.value.id) } catch (reason) { flash(reason instanceof Error ? reason.message : '标签更新失败') }
}
async function manageDesensitizationRules(project: Project) {
  ruleProject.value = project
  editingRuleId.value = null
  ruleDraft.value = { name: '', pattern: '', replacement: '', enabled: true }
  try { desensitizationRules.value = await service.listDesensitizationRules(project.id) } catch (reason) { flash(reason instanceof Error ? reason.message : '规则加载失败') }
}
async function addDesensitizationRule() {
  if (!ruleProject.value || !ruleDraft.value.name.trim() || !ruleDraft.value.pattern.trim()) return
  try {
    if (editingRuleId.value) await service.updateDesensitizationRule(ruleProject.value.id, editingRuleId.value, ruleDraft.value)
    else await service.createDesensitizationRule(ruleProject.value.id, ruleDraft.value)
    desensitizationRules.value = await service.listDesensitizationRules(ruleProject.value.id)
    editingRuleId.value = null
    ruleDraft.value = { name: '', pattern: '', replacement: '', enabled: true }
  } catch (reason) { flash(reason instanceof Error ? reason.message : '规则保存失败') }
}
function editDesensitizationRule(rule: DesensitizationRule) {
  editingRuleId.value = rule.id
  ruleDraft.value = { name: rule.name, pattern: rule.pattern, replacement: rule.replacement, enabled: Boolean(rule.enabled) }
}
async function toggleDesensitizationRule(rule: DesensitizationRule) {
  if (!ruleProject.value) return
  try {
    await service.updateDesensitizationRule(ruleProject.value.id, rule.id, { enabled: !rule.enabled })
    desensitizationRules.value = await service.listDesensitizationRules(ruleProject.value.id)
  } catch (reason) { flash(reason instanceof Error ? reason.message : '规则更新失败') }
}
async function loadDeletedProjects() {
  try { deletedProjects.value = await service.deletedProjects(); showDeletedProjects.value = true } catch (reason) { flash(reason instanceof Error ? reason.message : '已删除项目加载失败') }
}
async function restoreDeletedProject(projectId: string) {
  try {
    await service.restoreProject(projectId)
    deletedProjects.value = deletedProjects.value.filter((project) => project.id !== projectId)
    await service.load()
    flash('项目已恢复')
  } catch (reason) { flash(reason instanceof Error ? reason.message : '项目恢复失败') }
}
async function submitReviewBatch(approved: boolean) {
  if (!selectedReviewIds.value.length) return flash('请选择待审核分析')
  try { const result = await meetings.reviewBatch(selectedReviewIds.value, approved); selectedReviewIds.value = []; await meetings.load(); await service.load(); flash(result.failed.length ? `${result.succeeded.length} 条已处理，${result.failed.length} 条失败` : '批量审核已完成') } catch (reason) { flash(reason instanceof Error ? reason.message : '批量审核失败') }
}
async function reanalyze(id: string, mode: AnalysisMode = reviewReanalysisMode.value) {
  try { await meetings.reanalyze(id, mode); await meetings.load(); flash('已重新发起分析') } catch (reason) { flash(reason instanceof Error ? reason.message : '重新分析失败') }
}
async function openTaskEditor(task?: Task) {
  taskEditor.value = task ?? null
  showTaskEditor.value = true
  taskDraft.value = { projectId: task?.projectId ?? data.projects[0]?.id ?? '', title: task?.title ?? '', description: task?.description ?? '', assigneeId: task?.assigneeId ?? '', priority: task?.rawPriority ?? 'medium', dueDate: task?.due === '未设置' || !task?.due ? '' : task.due, status: task?.state === 'in-progress' ? 'in_progress' : task?.state === 'completed' ? 'completed' : 'todo', progress: task?.progress ?? 0 }
  await loadTaskAssignees()
}
async function loadTaskAssignees() {
  if (!taskDraft.value.projectId) return
  try { taskAssignees.value = await service.listProjectMembers(taskDraft.value.projectId) } catch { taskAssignees.value = [] }
}
async function saveTask() {
  try {
    const input = { ...taskDraft.value, dueDate: taskDraft.value.dueDate || null }
    if (taskEditor.value) await service.updateManagedTask(taskEditor.value.id, input)
    else await service.createTask(input)
    await service.load(); await service.loadCalendarEvents(); showTaskEditor.value = false; taskEditor.value = null; flash('任务已保存')
  } catch (reason) { flash(reason instanceof Error ? reason.message : '任务保存失败') }
}
async function closeOrReopenTask(task: Task) {
  try { if (task.state === 'closed') await service.reopenTask(task.id); else await service.closeTask(task.id); await service.load(); selectedTask.value = null; flash(task.state === 'closed' ? '任务已重开' : '任务已关闭') } catch (reason) { flash(reason instanceof Error ? reason.message : '任务状态更新失败') }
}
async function loadTaskNotes(task: Task) {
  try { taskNotes.value = await service.listTaskNotes(task.id); taskNoteText.value = '' } catch (reason) { flash(reason instanceof Error ? reason.message : '备注加载失败') }
}
async function submitTaskNote() {
  if (!selectedTask.value || !taskNoteText.value.trim()) return
  try { await service.addTaskNote(selectedTask.value.id, taskNoteText.value.trim()); await loadTaskNotes(selectedTask.value); flash('备注已保存') } catch (reason) { flash(reason instanceof Error ? reason.message : '备注保存失败') }
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

async function createDemoNotifications() {
  try {
    const result = await auth.createRoleDemoNotifications(props.token)
    await service.load()
    flash(result.created ? `已生成 ${result.created} 条角色演示通知` : '各角色的演示通知已存在')
  } catch (reason) { flash(reason instanceof Error ? reason.message : '演示通知生成失败') }
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
          <span v-if="item.path === '/notifications' && unreadNotificationCount > 0" class="nav-badge">{{ unreadNotificationCount }}</span>
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
          <label class="global-search"><Search :size="16" /><input v-model="search" placeholder="搜索项目、任务或会议..." @keyup.enter="submitGlobalSearch" /></label>
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
            <button v-if="currentPage === 'tasks' && canManageBusiness" class="primary-button" @click="openTaskEditor()"><Plus :size="15" /> 新建任务</button>
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
            <article class="panel due-panel"><div class="panel-heading"><div><p class="eyebrow">DEADLINE WATCH</p><h3>即将到期任务</h3></div><CalendarDays :size="18" class="panel-icon" /></div><div class="due-list"><div v-for="task in dueTasks" :key="task.id" class="due-item" :class="priorityLabel(task.rawPriority || task.priority).tone === 'red' ? 'critical' : priorityLabel(task.rawPriority || task.priority).tone === 'amber' ? 'high' : 'normal'"><div><strong>{{ task.title }}</strong><div class="due-meta"><span class="avatar small">{{ task.owner.slice(0, 1) }}</span>{{ task.owner }}<span class="mono">{{ task.due }}</span></div></div><span class="tag" :class="priorityLabel(task.rawPriority || task.priority).tone">{{ priorityLabel(task.rawPriority || task.priority).label }}</span></div><p v-if="!dueTasks.length" class="due-empty">暂无即将到期任务</p></div><button class="wide-ghost" @click="navigate('/tasks')">查看完整任务表 <ArrowRight :size="15" /></button></article>
          </div>
          <div class="dashboard-grid bottom-grid"><article class="panel chart-panel"><div class="panel-heading"><div><p class="eyebrow">DELIVERY TREND</p><h3>任务完成趋势</h3></div><span class="chart-range">实时数据</span></div><div class="empty-cell">任务更新时间序列累计后将在此展示趋势。</div><p class="chart-note">当前列表仅提供任务当前状态，未伪造历史趋势数据。</p></article><article class="panel risk-panel"><div class="panel-heading"><div><p class="eyebrow">RISK DISTRIBUTION</p><h3>风险分布统计</h3></div><AlertTriangle :size="18" class="panel-icon" /></div><div class="donut-wrap"><div class="donut" :style="riskDonutStyle"><div><strong>{{ data.risks.length }}</strong><span>总风险项</span></div></div></div><div class="risk-legend"><div><span><i class="dot red-dot"></i>高风险</span><b>{{ data.risks.filter((risk) => risk.level === 'high').length }}</b></div><div><span><i class="dot amber-dot"></i>中风险</span><b>{{ data.risks.filter((risk) => risk.level === 'medium').length }}</b></div><div><span><i class="dot green-dot"></i>低风险</span><b>{{ data.risks.filter((risk) => risk.level === 'low').length }}</b></div></div></article></div>
        </section>

        <section v-else-if="currentPage === 'dashboard' && user.role === 'admin'" class="page-section">
          <div class="welcome-row"><div><p class="eyebrow">SYSTEM ADMINISTRATION</p><h2>{{ greeting }}，{{ user.name }}</h2><p class="muted">管理账号、系统配置与审计记录。</p></div><button class="primary-button" @click="navigate('/users')"><Users :size="16" />账号管理</button></div>
          <div class="metric-grid admin-dashboard">
            <article class="metric-card"><div class="metric-label">账号总数 <Users :size="16" /></div><div class="metric-number">{{ managedUsers.length }}</div><small>系统中已登记的全部账号</small></article>
            <article class="metric-card"><div class="metric-label">启用账号 <CheckCircle2 :size="16" /></div><div class="metric-number">{{ managedUsers.filter((account) => account.is_active).length }}</div><small>当前可登录和使用系统</small></article>
            <article class="metric-card"><div class="metric-label">未读通知 <Bell :size="16" /></div><div class="metric-number">{{ unreadNotificationCount }}</div><small>需要管理员关注的事项</small></article>
            <article class="metric-card"><div class="metric-label">审计记录 <ClipboardList :size="16" /></div><div class="metric-number">{{ auditLogs.length }}</div><small>最近关键操作记录</small></article>
          </div>
          <article class="panel table-panel"><div class="panel-heading"><div><p class="eyebrow">RECENT AUDIT EVENTS</p><h3>最近审计记录</h3></div><button class="text-button" @click="navigate('/audit-logs')">查看全部 <ArrowRight :size="14" /></button></div><div class="table-wrap"><table><thead><tr><th>时间</th><th>操作者</th><th>操作</th><th>对象</th></tr></thead><tbody><tr v-for="log in auditLogs.slice(0, 5)" :key="log.id"><td class="mono">{{ log.created_at }}</td><td>{{ log.actor_name ?? '系统' }}</td><td>{{ log.action }}</td><td>{{ log.entity_type }} / {{ log.entity_id ?? '-' }}</td></tr><tr v-if="!auditLogs.length"><td colspan="4" class="empty-cell">暂无审计记录</td></tr></tbody></table></div></article>
        </section>

        <section v-else-if="currentPage === 'dashboard' && user.role === 'auditor'" class="page-section">
          <div class="welcome-row"><div><p class="eyebrow">AUDIT WORKSPACE</p><h2>{{ greeting }}，{{ user.name }}</h2><p class="muted">查看关键操作与数据变更记录，支持问题追溯。</p></div><button class="primary-button" @click="navigate('/audit-logs')"><ClipboardList :size="16" />审计日志</button></div>
          <div class="metric-grid"><article class="metric-card"><div class="metric-label">审计记录 <ClipboardList :size="16" /></div><div class="metric-number">{{ auditLogs.length }}</div><small>最近 500 条关键操作</small></article><article class="metric-card"><div class="metric-label">数据变更 <Target :size="16" /></div><div class="metric-number">{{ auditLogs.filter((log) => String(log.action).includes('updated') || String(log.action).includes('created')).length }}</div><small>可在日志中追溯详情</small></article><article class="metric-card"><div class="metric-label">未读通知 <Bell :size="16" /></div><div class="metric-number">{{ data.notifications.filter((item) => !item.read).length }}</div><small>仅显示个人通知</small></article></div>
          <article class="panel table-panel"><div class="panel-heading"><div><p class="eyebrow">RECENT AUDIT EVENTS</p><h3>最近关键操作</h3></div><button class="text-button" @click="navigate('/audit-logs')">查看全部 <ArrowRight :size="14" /></button></div><div class="table-wrap"><table><thead><tr><th>时间</th><th>操作者</th><th>操作</th><th>对象</th></tr></thead><tbody><tr v-for="log in auditLogs.slice(0, 5)" :key="log.id"><td class="mono">{{ log.created_at }}</td><td>{{ log.actor_name ?? '系统' }}</td><td>{{ log.action }}</td><td>{{ log.entity_type }} / {{ log.entity_id ?? '-' }}</td></tr><tr v-if="!auditLogs.length"><td colspan="4" class="empty-cell">暂无审计记录</td></tr></tbody></table></div></article>
        </section>

        <section v-else-if="currentPage === 'dashboard' && isMember" class="page-section member-dashboard">
          <div class="welcome-row"><div><p class="eyebrow">MEMBER WORKSPACE · {{ roleLabels[user.role] }}</p><h2>{{ greeting }}，{{ user.name }}</h2><p class="muted">这里仅展示与你有关的任务、工作反馈与通知。</p></div><button class="primary-button" @click="navigate('/my-tasks')"><ClipboardList :size="16" /> 查看我的任务</button></div>
          <div class="metric-grid member-metrics"><article class="metric-card"><div class="metric-label">我的待办 <ClipboardList :size="16" /></div><div class="metric-number">{{ myTasks.filter((task) => task.state === 'todo').length }}</div><small>等待开始处理</small></article><article class="metric-card"><div class="metric-label">进行中 <Gauge :size="16" /></div><div class="metric-number">{{ myTasks.filter((task) => task.state === 'in-progress').length }}</div><small class="success-text">请及时同步进度</small></article><article class="metric-card"><div class="metric-label">已完成 <CheckCircle2 :size="16" /></div><div class="metric-number">{{ myTasks.filter((task) => task.state === 'completed').length }}</div><small>本周个人交付</small></article></div>
          <div class="dashboard-grid top-grid"><article class="panel review-panel"><div class="panel-heading"><div><p class="eyebrow">MY PRIORITIES</p><h3>我的优先任务</h3></div><button class="text-button" @click="navigate('/my-tasks')">全部任务 <ArrowRight :size="14" /></button></div><div class="table-wrap"><table><thead><tr><th>任务</th><th>项目</th><th>截止日期</th><th>进度</th><th>操作</th></tr></thead><tbody><tr v-for="task in myTasks" :key="task.id"><td><strong>{{ task.title }}</strong></td><td>{{ task.project }}</td><td class="mono">{{ formatBeijingMinute(task.due) }}</td><td><div class="table-progress"><span class="progress-track"><i :style="{ width: `${task.progress}%` }"></i></span>{{ task.progress }}%</div></td><td><button class="small-button" @click="openFeedback(task)">更新反馈</button></td></tr><tr v-if="!myTasks.length"><td colspan="5" class="empty-cell">暂无分配给你的任务</td></tr></tbody></table></div></article><article class="panel due-panel"><div class="panel-heading"><div><p class="eyebrow">PERSONAL NOTIFICATIONS</p><h3>待关注通知</h3></div><Bell :size="18" class="panel-icon" /></div><div class="due-list"><div v-for="item in recentNotifications" :key="item.id" class="due-item normal" @click="openNotification(item)"><div><strong>{{ item.title }}</strong><div class="due-meta">{{ item.time }}</div></div></div><p v-if="!recentNotifications.length" class="due-empty">暂无待关注通知</p></div><button class="wide-ghost" @click="navigate('/notifications')">进入通知中心 <ArrowRight :size="15" /></button></article></div>
        </section>

        <section v-else-if="currentPage === 'search'" class="page-section"><article class="panel table-panel"><div class="panel-heading"><div><p class="eyebrow">SEARCH RESULTS</p><h3>“{{ globalSearchTerm }}”的搜索结果</h3></div><span class="result-count">{{ globalSearchResults.length }} 条</span></div><div class="table-wrap"><table><thead><tr><th>类型</th><th>内容</th><th></th></tr></thead><tbody><tr v-for="result in globalSearchResults" :key="`${result.kind}-${result.path}`"><td><span class="tag blue">{{ result.kind }}</span></td><td><strong>{{ result.title }}</strong><small>{{ result.detail }}</small></td><td><button class="small-button" @click="router.push(result.path)">查看</button></td></tr><tr v-if="!globalSearchResults.length"><td colspan="3" class="empty-cell">没有找到匹配的项目、任务或会议记录</td></tr></tbody></table></div></article></section>
        <ProjectDetailPage v-else-if="currentPage === 'project-detail' || currentPage === 'project-meetings'" :token="token" :user="user" />
        <MeetingReviewPage v-else-if="currentPage === 'meeting-review'" :token="token" :user="user" />
        <TaskBoardPage v-else-if="currentPage === 'tasks'" :token="token" :user="user" />
        <section v-else-if="currentPage === 'projects'" class="page-section"><div class="filter-bar"><label class="inline-search"><Search :size="16" /><input v-model="search" placeholder="搜索项目名称、编码或负责人" /></label><select v-model="projectStateFilter"><option value="all">全部状态</option><option>进行中</option><option>暂停</option><option>已归档</option></select><button v-if="canManageBusiness" class="small-button" @click="loadDeletedProjects">已删除项目</button><span class="result-count">{{ filteredProjects.length }} 个项目</span></div><div class="project-grid"><article v-for="project in filteredProjects" :key="project.id" class="project-card"><div class="project-card-top"><span class="tag" :class="projectStatusLabel(project.state).tone">{{ projectStatusLabel(project.state).label }}</span><div v-if="canManageBusiness"><button class="icon-button" title="编辑项目" @click="openProjectEditor(project)"><Pencil :size="16" /></button><button class="icon-button" title="管理标签" @click="manageProjectTags(project)"><Tags :size="16" /></button><button class="icon-button" title="脱敏规则" @click="manageDesensitizationRules(project)"><ShieldAlert :size="16" /></button><button class="icon-button" title="归档项目" @click="confirmArchive(project)"><Archive :size="16" /></button><button class="icon-button" title="删除项目" @click="service.deleteProject(project.id).then(() => service.load()).then(() => flash('项目已删除')).catch((reason) => flash(reason.message))"><Trash2 :size="16" /></button></div></div><h3>{{ project.name }}</h3><p class="mono">{{ project.code }}</p><div class="project-progress"><div><span>项目完成率</span><b>{{ project.progress }}%</b></div><div class="progress-track"><span :style="{ width: `${project.progress}%` }"></span></div></div><div class="project-meta"><span><Users :size="14" />{{ project.members }} 人</span><span>负责人 {{ project.owner }}</span><span class="mono">截止 {{ project.deadline }}</span></div><div class="project-card-actions"><button v-if="canManageBusiness" class="secondary-button" @click="openProjectMembers(project)"><Users :size="14" /> 项目成员</button><button class="project-open" @click="navigate(`/projects/${project.id}`)">进入项目 <ArrowRight :size="14" /></button></div></article><button v-if="canManageBusiness" class="project-card add-card" @click="showCreateProject = true"><Plus :size="22" /><strong>创建新项目</strong><span>从一个清晰的目标开始</span></button></div></section>


        <section v-else-if="currentPage === 'my-tasks'" class="page-section member-workspace">
          <div class="member-summary panel"><div><p class="eyebrow">PERSONAL DELIVERY VIEW</p><h2>{{ user.name }}，今天优先完成这 {{ myTasks.filter((task) => task.state !== 'completed').length }} 项工作</h2><p class="muted">你只能更新本人任务的进度、状态与工作反馈，项目经理会实时收到同步通知。</p></div><div class="member-summary-stat"><strong>{{ myTasks.filter((task) => task.state === 'completed').length }}/{{ myTasks.length }}</strong><span>已完成任务</span></div></div>
          <div class="member-task-grid"><article v-for="task in myTasks" :key="task.id" class="member-task-card"><div class="member-card-head"><span class="tag" :class="taskStatusLabel(task.state).tone">{{ taskStatusLabel(task.state).label }}</span></div><h3>{{ task.title }}</h3><p>{{ task.project }}</p><div class="member-task-meta"><span><CalendarDays :size="14" />发布于 {{ formatBeijingDateTime(task.createdAt) }}</span><span class="tag" :class="priorityLabel(task.rawPriority || task.priority).tone">{{ priorityLabel(task.rawPriority || task.priority).label }}</span></div><div class="member-progress"><div><span>当前进度</span><b>{{ task.progress }}%</b></div><div class="progress-track"><span :style="{ width: `${task.progress}%` }"></span></div></div><div class="member-card-actions"><button class="secondary-button" @click="openFeedback(task)"><ClipboardList :size="15" /> 提交反馈</button><button v-if="task.state !== 'completed'" class="primary-button" @click="updateTask(task, task.state === 'todo' ? 'in-progress' : 'completed')">{{ task.state === 'todo' ? '开始任务' : '完成任务' }}</button></div></article><div v-if="!myTasks.length" class="empty-member panel"><CheckCircle2 :size="26" /><strong>当前没有分配给你的任务</strong><span>任务分派后会自动出现在这里。</span></div></div>
          <article class="panel member-feedback-panel"><div class="panel-heading"><div><p class="eyebrow">RECENT FEEDBACK</p><h3>我的近期工作反馈</h3></div></div><div v-if="data.feedbacks.filter((item) => item.author === user.name).length" class="feedback-list"><div v-for="item in data.feedbacks.filter((item) => item.author === user.name)" :key="item.id" class="feedback-item"><span class="avatar">{{ user.name.slice(0, 1) }}</span><div><strong>{{ item.content }}</strong><p>{{ item.createdAt }} · 已更新至 {{ item.progress }}%</p></div></div></div><div v-else class="feedback-empty">暂未提交工作反馈。提交后，项目经理可在项目动态中查看。</div></article>
        </section>

        <section v-else-if="currentPage === 'risks'" class="page-section"><div class="filter-bar"><select v-model="riskLevelFilter"><option value="all">全部风险等级</option><option value="high">高风险</option><option value="medium">中风险</option><option value="low">低风险</option></select><span class="risk-summary"><b>{{ highRiskCount }}</b> 个高风险项待处理</span></div><article class="panel table-panel"><div class="table-wrap"><table><thead><tr><th>风险事项</th><th>关联任务</th><th>等级</th><th>项目负责人</th><th>处理状态</th><th>操作</th></tr></thead><tbody><tr v-for="risk in filteredRisks" :key="risk.id"><td><strong>{{ risk.title }}</strong><small class="mono">{{ risk.id }}</small></td><td>{{ risk.task }}</td><td><span class="tag" :class="riskLevelLabel(risk.level).tone">{{ riskLevelLabel(risk.level).label }}</span></td><td><span class="person"><span class="avatar small">{{ risk.owner.slice(0, 1) }}</span>{{ risk.owner || '未设置' }}</span></td><td><span class="tag" :class="riskStatusLabel(risk.status).tone">{{ riskStatusLabel(risk.status).label }}</span></td><td><button v-if="canManageBusiness && risk.status !== '已处理'" class="small-button" @click="resolveRisk(risk.id)">标记处理</button><span v-else class="muted">{{ risk.status === '已处理' ? '已完成' : '只读' }}</span></td></tr></tbody></table></div></article></section>

        <section v-else-if="currentPage === 'notifications'" class="page-section"><div class="filter-bar"><button class="segmented" :class="{ selected: !unreadOnly }" @click="unreadOnly = false">全部通知</button><button class="segmented" :class="{ selected: unreadOnly }" @click="unreadOnly = true">未读通知</button><span class="result-count">{{ filteredNotifications.length }} 条</span></div><div class="notification-list"><article v-for="item in filteredNotifications" :key="item.id" class="notification-item" :class="{ unread: !item.read }" @click="openNotification(item)"><span class="notification-icon"><Bell :size="17" /></span><div><strong>{{ item.title }}</strong><p>{{ item.time }}</p></div><span v-if="!item.read" class="unread-dot"></span><ArrowRight :size="16" class="notification-arrow" /></article></div></section>

        <section v-else-if="currentPage === 'experiments' && canManageBusiness" class="page-section"><article class="panel"><div class="panel-heading"><div><p class="eyebrow">CONTROLLED EVALUATION</p><h3>四种分析模式实验汇总</h3></div><label class="meeting-field"><span>项目</span><select v-model="experimentProjectId" @change="loadExperimentSummary"><option value="">选择项目</option><option v-for="project in data.projects" :key="project.id" :value="project.id">{{ project.name }}</option></select></label></div><div v-if="experimentProjectId" class="page-actions"><button class="secondary-button" :disabled="ragIndexSyncing || !ragIndexReady" @click="syncRagIndex">{{ ragIndexSyncing ? '同步中…' : '同步 RAG 索引' }}</button><small v-if="ragIndexStatusLoading" class="muted">正在确认 RAG 索引状态。</small><small v-else-if="!ragIndexStatus" class="muted">无法确认 RAG 索引状态，无法同步索引。</small><small v-else-if="!ragIndexStatus.ready" class="muted">RAG 依赖不可用：请检查 Qdrant 服务。</small><small v-else-if="ragIndexStatus.eligibleVersionCount === 0" class="muted">RAG 已就绪，但该项目没有可索引的脱敏会议版本。</small><small v-else class="muted">RAG 已就绪：{{ ragIndexStatus.eligibleVersionCount }} 个脱敏会议版本可同步。</small></div><div v-if="experimentProjectId" class="metric-grid"><article class="metric-card"><div class="metric-label">运行次数 <TestTube2 :size="16" /></div><div class="metric-number">{{ experimentRunCount }}</div><small>所选项目的全部模式</small></article><article class="metric-card"><div class="metric-label">模式数量 <BarChart3 :size="16" /></div><div class="metric-number">{{ experimentRows.length }}</div><small>零运行模式也会保留</small></article></div><p v-if="experimentNotice" class="meeting-notice muted">{{ experimentNotice }}</p><div v-if="experimentProjectId" class="table-wrap"><table><thead><tr><th>模式</th><th>运行</th><th>待审核</th><th>失败</th><th>通过</th><th>驳回</th><th>平均耗时</th><th>模型调用次数</th></tr></thead><tbody><tr v-for="summary in experimentRows" :key="summary.mode"><td><strong>{{ summary.label }}</strong><small v-if="summary.mode === 'rag'">检索未配置时为无检索基线</small></td><td>{{ summary.runCount }}</td><td>{{ summary.pendingCount }}</td><td>{{ summary.failedCount }}</td><td>{{ summary.approvedCount }}</td><td>{{ summary.rejectedCount }}</td><td>{{ summary.averageDurationMs }} ms</td><td>{{ summary.totalModelCalls }}</td></tr></tbody></table></div><div v-else class="empty-cell">请选择项目以查看实验汇总。</div><div v-if="experimentLoading" class="empty-cell">正在加载实验汇总。</div></article></section>

        <section v-else-if="currentPage === 'calendar'" class="page-section"><div class="calendar-toolbar"><button class="icon-button" title="上个月" @click="selectedCalendarMonth = shiftCalendarMonth(selectedCalendarMonth, -1)"><ArrowRight :size="16" class="rotate-180" /></button><div class="calendar-date"><strong>团队日历</strong><span>{{ selectedCalendarLabel }}</span></div><button class="icon-button" title="下个月" @click="selectedCalendarMonth = shiftCalendarMonth(selectedCalendarMonth, 1)"><ArrowRight :size="16" /></button><button class="secondary-button" @click="selectedCalendarMonth = `${localIsoDate(new Date()).slice(0, 7)}-01`">今天</button></div><article class="panel calendar-panel"><div class="calendar-panel-head"><div><p class="eyebrow">MONTHLY SCHEDULE</p><h3>{{ selectedCalendarLabel }}</h3></div><span class="tag gray">任务截止日与会议创建日</span></div><div class="calendar-grid"><div v-for="weekday in ['一', '二', '三', '四', '五', '六', '日']" :key="weekday" class="calendar-weekday">周{{ weekday }}</div><button v-for="day in calendarDays" :key="day.date" class="calendar-day" :class="{ muted: !day.inMonth, today: day.date === localIsoDate(new Date()), 'has-tasks': taskEventsForCalendarDate(data.calendarEvents, day.date).length > 0 }" @click="openCalendarDay(day.date)"><span class="calendar-day-number">{{ Number(day.date.slice(-2)) }}<i v-if="taskEventsForCalendarDate(data.calendarEvents, day.date).length" class="calendar-task-dot"></i></span><span class="calendar-day-events"><span v-for="event in visibleEventsForDay(day.date)" :key="`${event.type}-${event.id}`" class="calendar-event" :class="event.type === 'meeting' ? 'meeting-event' : calendarTagClass(event)" :title="`${event.title} · ${event.project}`">{{ event.title }}</span><span v-if="calendarEventsForDay(day.date).length > 3" class="calendar-more">还有 {{ calendarEventsForDay(day.date).length - 3 }} 条</span></span></button></div></article></section>

        <section v-else-if="currentPage === 'efficiency'" class="page-section"><div class="metric-grid compact"><article class="metric-card"><div class="metric-label">已完成任务 <Check :size="16" /></div><div class="metric-number">{{ completedCount }}</div><small>{{ deliveryCycleLabel }}</small></article><article class="metric-card"><div class="metric-label">平均交付周期 <Gauge :size="16" /></div><div class="metric-number">—</div><small>任务记录暂无完整周期数据</small></article><article class="metric-card"><div class="metric-label">活跃成员 <Users :size="16" /></div><div class="metric-number">{{ activeMemberCount }}<span>人</span></div><small>按当前任务负责人统计</small></article></div><div class="analysis-grid"><article class="panel chart-panel"><div class="panel-heading"><div><p class="eyebrow">TEAM DELIVERY</p><h3>团队完成趋势</h3></div><span class="chart-range">暂无时间序列数据</span></div><div class="empty-cell">完成任务后将基于真实更新时间生成趋势。</div></article><article class="panel member-panel"><div class="panel-heading"><div><p class="eyebrow">TEAM LEADERBOARD</p><h3>成员交付效率</h3></div></div><div class="empty-cell">暂无足够的历史数据。</div></article></div></section>

        <section v-else-if="currentPage === 'settings'" class="page-section">
          <article class="panel settings-content">
            <div class="panel-heading"><div><p class="eyebrow">MODEL PROVIDER</p><h3>模型与运行模式</h3></div><span class="tag green">已持久化</span></div>
            <label class="setting-field"><span>默认模型</span><select v-model="systemSettings.model"><option>DeepSeek V3</option><option>Qwen 2.5</option><option>GPT-4o</option></select></label>
            <label class="setting-field"><span>AI 运行模式</span><select v-model="systemSettings.mode"><option>无 AI</option><option>单轮大模型</option><option>RAG 检索增强</option><option>智能体编排</option></select></label>
            <div class="setting-toggle"><div><strong>会议内容自动脱敏</strong><small>对手机号、邮箱和身份证号进行替换处理</small></div><button class="toggle" :class="{ on: systemSettings.desensitize }" @click="systemSettings.desensitize = !systemSettings.desensitize"><i></i></button></div>
            <div class="setting-toggle demo-notification-setting"><div><strong>角色演示通知</strong><small>为每个启用角色创建一条待办通知；已有同类通知不会重复生成。</small></div><button class="secondary-button" @click="createDemoNotifications">生成角色演示通知</button></div>
            <button class="primary-button" :disabled="settingsSaving" @click="saveSystemSettings">{{ settingsSaving ? '保存中…' : '保存设置' }}</button>
          </article>
        </section>
        <section v-else-if="currentPage === 'meetings'" class="page-section"><article class="panel"><div class="panel-heading"><div><p class="eyebrow">MEETING MINUTES</p><h3>提交会议纪要并发起 DeepSeek 分析</h3></div><button class="secondary-button" type="button" @click="showMeetingVersions">版本记录</button></div><form class="meeting-form" @submit.prevent="submitMeeting"><label class="meeting-field"><span>所属项目</span><select v-model="meetingProjectId"><option value="">请选择项目</option><option v-for="project in data.projects" :key="project.id" :value="project.id">{{ project.name }}</option></select></label><label class="meeting-field"><span>会议标题</span><input v-model="meetingTitle" placeholder="例如：版本发布评审会" /></label><label class="meeting-field"><span>分析模式</span><select v-model="meetingAnalysisMode" aria-label="分析模式"><option value="manual">人工审核</option><option value="llm">LLM</option><option value="rag">RAG</option><option value="agent">智能体</option></select></label><label class="meeting-field"><span>会议纪要</span><textarea v-model="meetingContent" rows="12" placeholder="粘贴会议纪要内容，DeepSeek 将抽取任务、决策和风险"></textarea></label><label class="meeting-field"><span>或上传 TXT / Word</span><input type="file" accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" @change="selectMeetingFile" /><small v-if="meetingFile" class="muted">已选择：{{ meetingFile.name }}</small></label><p v-if="meetingNotice" class="meeting-notice muted">{{ meetingNotice }}</p><button class="primary-button" type="submit"><Zap :size="15" /> 提交并分析</button></form><div v-if="meetingVersions.length" class="meeting-version-list"><div v-for="version in meetingVersions" :key="version.id" class="meeting-version-row"><div><strong>版本 {{ version.versionNumber }}</strong><small>{{ version.sourceType }} · {{ version.createdAt }}</small></div><div><button class="small-button" @click="inspectMeetingVersion(version.id)">查看</button><button class="small-button" @click="restoreMeetingVersion(version.id)">恢复</button></div></div></div></article></section>
        <section v-else-if="currentPage === 'reviews'" class="page-section"><article class="panel table-panel"><div class="panel-heading"><div><p class="eyebrow">AI REVIEW QUEUE</p><h3>待审核 AI 分析</h3></div><div v-if="canManageBusiness"><button class="small-button" @click="submitReviewBatch(true)">批量通过</button><button class="small-button" @click="submitReviewBatch(false)">批量驳回</button></div></div><div class="table-wrap"><table><thead><tr><th></th><th>会议</th><th>模式</th><th>摘要</th><th>任务数</th><th>风险数</th><th>调用 / 耗时</th><th>检索</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="analysis in meetings.state.analyses" :key="analysis.id"><td><input v-if="analysis.status === 'pending' && canManageBusiness" v-model="selectedReviewIds" type="checkbox" :value="analysis.id" /></td><td><strong>{{ analysis.title }}</strong></td><td>{{ analysis.mode }}</td><td>{{ analysis.result?.summary }}</td><td>{{ analysis.result?.tasks?.length ?? 0 }}</td><td>{{ analysis.result?.risks?.length ?? 0 }}</td><td>{{ analysis.modelCallCount }} 次 / {{ analysis.durationMs }} ms</td><td>{{ analysis.executionMetadata?.retrievalStatus ?? '-' }}</td><td><span class="tag" :class="analysisStatusLabel(analysis.status).tone">{{ analysisStatusLabel(analysis.status).label }}</span></td><td v-if="analysis.status === 'pending'"><button class="small-button" @click="reviewMeetingAnalysis(analysis.id, true)">通过</button><button class="small-button" @click="reviewMeetingAnalysis(analysis.id, false)">驳回</button></td><td v-else><template v-if="['failed', 'rejected'].includes(analysis.status) && canManageBusiness"><select v-model="reviewReanalysisMode" :aria-label="`重新分析模式：${analysis.title}`"><option value="manual">人工审核</option><option value="llm">LLM</option><option value="rag">RAG</option><option value="agent">智能体</option></select><button class="icon-button" title="重新分析" @click="reanalyze(analysis.id)"><RotateCcw :size="16" /></button></template><span v-else class="muted">已处理</span></td></tr><tr v-if="!meetings.state.analyses.length"><td colspan="10" class="empty-cell">暂无 AI 分析</td></tr></tbody></table></div></article></section>
        <section v-else-if="currentPage === 'users'" class="page-section"><article class="panel table-panel"><div class="panel-heading"><div><p class="eyebrow">ACCOUNT ADMINISTRATION</p><h3>账号与角色</h3></div><button class="primary-button" @click="showCreateUser = true"><Plus :size="15" /> 新增账号</button></div><div class="table-wrap"><table><thead><tr><th>姓名</th><th>邮箱</th><th>角色</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="managed in managedUsers" :key="managed.id"><td>{{ managed.name }}</td><td>{{ managed.email }}</td><td><span class="tag" :class="systemRoleLabel(managed.role).tone">{{ systemRoleLabel(managed.role).label }}</span><select :value="managed.role" @change="auth.updateUser(props.token, managed.id, { role: ($event.target as HTMLSelectElement).value as UserRole }).then(() => managed.role = ($event.target as HTMLSelectElement).value as UserRole)"><option value="manager">项目经理</option><option value="member">项目成员</option><option value="admin">系统管理员</option><option value="auditor">审计员</option></select></td><td><button class="small-button" @click="setManagedUserActive(managed, !managed.is_active)">{{ managed.is_active ? '停用' : '启用' }}</button></td><td><button class="small-button" @click="resetPasswordUser = managed; resetPasswordValue = ''">重置密码</button></td></tr></tbody></table></div></article></section>
        <section v-else-if="currentPage === 'audit-logs'" class="page-section"><article class="panel table-panel"><div class="panel-heading"><div><p class="eyebrow">AUDIT LOGS</p><h3>关键操作记录</h3></div></div><div class="table-wrap"><table><thead><tr><th>时间</th><th>操作者</th><th>操作</th><th>对象</th><th>详情</th></tr></thead><tbody><tr v-for="log in auditLogs" :key="log.id"><td class="mono">{{ log.created_at }}</td><td>{{ log.actor_name ?? '系统' }}</td><td>{{ log.action }}</td><td>{{ log.entity_type }} / {{ log.entity_id ?? '-' }}</td><td>{{ log.details }}</td></tr><tr v-if="!auditLogs.length"><td colspan="5" class="empty-cell">暂无审计记录</td></tr></tbody></table></div></article></section>
      </div>
    </main>
    <div v-if="projectEditor" class="modal-backdrop" @click.self="projectEditor = null"><div class="modal"><div class="modal-head"><h3>编辑项目</h3><button class="icon-button" @click="projectEditor = null"><X :size="18" /></button></div><label class="modal-field"><span>项目名称</span><input v-model="projectDraft.name" /></label><label class="modal-field"><span>项目编码</span><input v-model="projectDraft.code" /></label><label class="modal-field"><span>项目描述</span><textarea v-model="projectDraft.description" rows="4"></textarea></label><label class="modal-field"><span>截止日期</span><input v-model="projectDraft.endDate" type="date" /></label><label class="modal-field"><span>状态</span><select v-model="projectDraft.status"><option value="active">进行中</option><option value="paused">暂停</option><option value="archived">已归档</option></select></label><div class="modal-actions"><button class="secondary-button" @click="projectEditor = null">取消</button><button class="primary-button" @click="saveProject">保存</button></div></div></div>
    <div v-if="tagProject" class="modal-backdrop" @click.self="tagProject = null"><div class="modal"><div class="modal-head"><h3>项目标签</h3><button class="icon-button" @click="tagProject = null"><X :size="18" /></button></div><div class="inline-form"><input v-model="tagName" placeholder="新标签名称" /><button class="primary-button" @click="addProjectTag"><Plus :size="15" /> 添加</button></div><label v-for="tag in projectTags" :key="tag.id" class="tag-row"><input type="checkbox" :checked="tag.linked" @change="toggleProjectTag(tag)" /><span>{{ tag.name }}</span><button class="icon-button" title="删除标签" @click="service.deleteProjectTag(tagProject!.id, tag.id).then(() => manageProjectTags(tagProject!))"><Trash2 :size="15" /></button></label></div></div>
    <div v-if="ruleProject" class="modal-backdrop" @click.self="ruleProject = null"><div class="modal task-modal"><div class="modal-head"><h3>自定义脱敏规则</h3><button class="icon-button" @click="ruleProject = null"><X :size="18" /></button></div><div class="rule-list"><div v-for="rule in desensitizationRules" :key="rule.id" class="rule-row"><div><strong>{{ rule.name }}</strong><small>{{ rule.pattern }}</small></div><label class="rule-toggle"><input type="checkbox" :checked="rule.enabled" @change="toggleDesensitizationRule(rule)" /> 启用</label><button class="icon-button" title="编辑规则" @click="editDesensitizationRule(rule)"><Pencil :size="15" /></button><button class="icon-button" title="删除规则" @click="service.deleteDesensitizationRule(ruleProject!.id, rule.id).then(() => manageDesensitizationRules(ruleProject!))"><Trash2 :size="15" /></button></div><div v-if="!desensitizationRules.length" class="empty-cell">暂无自定义规则</div></div><label class="modal-field"><span>规则名称</span><input v-model="ruleDraft.name" /></label><label class="modal-field"><span>正则表达式</span><input v-model="ruleDraft.pattern" /></label><label class="modal-field"><span>替换文本</span><input v-model="ruleDraft.replacement" /></label><label class="rule-toggle"><input v-model="ruleDraft.enabled" type="checkbox" /> 启用规则</label><div class="modal-actions"><button class="secondary-button" @click="ruleProject = null">关闭</button><button class="primary-button" @click="addDesensitizationRule">{{ editingRuleId ? '更新规则' : '保存规则' }}</button></div></div></div>
    <div v-if="showTaskEditor" class="modal-backdrop" @click.self="showTaskEditor = false"><div class="modal"><div class="modal-head"><h3>{{ taskEditor ? '编辑任务' : '新建任务' }}</h3><button class="icon-button" @click="showTaskEditor = false"><X :size="18" /></button></div><label class="modal-field"><span>项目</span><select v-model="taskDraft.projectId" @change="loadTaskAssignees"><option v-for="project in data.projects" :key="project.id" :value="project.id">{{ project.name }}</option></select></label><label class="modal-field"><span>任务标题</span><input v-model="taskDraft.title" /></label><label class="modal-field"><span>描述</span><textarea v-model="taskDraft.description"></textarea></label><label class="modal-field"><span>负责人</span><select v-model="taskDraft.assigneeId"><option v-for="member in taskAssignees" :key="member.id" :value="member.id">{{ member.name }}</option></select></label><label class="modal-field"><span>优先级</span><select v-model="taskDraft.priority"><option value="urgent">紧急</option><option value="high">高</option><option value="medium">中</option><option value="low">低</option></select></label><label class="modal-field"><span>截止日期</span><input v-model="taskDraft.dueDate" type="date" /></label><label class="modal-field"><span>进度 {{ taskDraft.progress }}%</span><input v-model.number="taskDraft.progress" type="range" min="0" max="100" step="5" /></label><div class="modal-actions"><button class="secondary-button" @click="showTaskEditor = false">取消</button><button class="primary-button" @click="saveTask">保存任务</button></div></div></div>

    <div v-if="showCreateProject" class="modal-backdrop" @click.self="showCreateProject = false"><div class="modal"><div class="modal-head"><div><p class="eyebrow">NEW PROJECT</p><h3>创建新项目</h3></div><button class="icon-button" @click="showCreateProject = false"><X :size="18" /></button></div><label class="modal-field"><span>项目名称 <b>*</b></span><input v-model="newProjectName" autofocus placeholder="例如：会议智能化 2.0" @keyup.enter="createProject" /></label><div class="modal-actions"><button class="secondary-button" @click="showCreateProject = false">取消</button><button class="primary-button" @click="createProject">创建项目</button></div></div></div>
    <div v-if="showCreateUser" class="modal-backdrop" @click.self="showCreateUser = false"><div class="modal"><div class="modal-head"><div><p class="eyebrow">ACCOUNT ADMINISTRATION</p><h3>新增账号</h3></div><button class="icon-button" @click="showCreateUser = false"><X :size="18" /></button></div><label class="modal-field"><span>姓名 <b>*</b></span><input v-model="newUserName" autofocus /></label><label class="modal-field"><span>邮箱 <b>*</b></span><input v-model="newUserEmail" type="email" /></label><label class="modal-field"><span>初始密码 <b>*</b></span><input v-model="newUserPassword" type="password" minlength="8" /></label><label class="modal-field"><span>角色 <b>*</b></span><select v-model="roleDraft"><option value="manager">项目经理</option><option value="member">项目成员</option><option value="admin">系统管理员</option><option value="auditor">审计员</option></select></label><div class="modal-actions"><button class="secondary-button" @click="showCreateUser = false">取消</button><button class="primary-button" @click="createManagedUser">创建账号</button></div></div></div>
    <div v-if="resetPasswordUser" class="modal-backdrop" @click.self="resetPasswordUser = null"><div class="modal"><div class="modal-head"><div><p class="eyebrow">RESET PASSWORD</p><h3>{{ resetPasswordUser.name }}</h3></div><button class="icon-button" @click="resetPasswordUser = null"><X :size="18" /></button></div><label class="modal-field"><span>新密码 <b>*</b></span><input v-model="resetPasswordValue" type="password" minlength="8" @keyup.enter="resetManagedPassword" /></label><div class="modal-actions"><button class="secondary-button" @click="resetPasswordUser = null">取消</button><button class="primary-button" @click="resetManagedPassword">确认重置</button></div></div></div>
    <div v-if="feedbackTask" class="modal-backdrop" @click.self="feedbackTask = null"><div class="modal feedback-modal"><div class="modal-head"><div><p class="eyebrow">WORK FEEDBACK · {{ feedbackTask.id }}</p><h3>提交工作反馈</h3></div><button class="icon-button" @click="feedbackTask = null"><X :size="18" /></button></div><p class="feedback-task-title">{{ feedbackTask.title }}</p><label class="modal-field"><span>当前进度：<b>{{ feedbackProgress }}%</b></span><input v-model.number="feedbackProgress" type="range" min="0" max="100" step="5" /></label><label class="modal-field"><span>反馈内容 <b>*</b></span><textarea v-model="feedbackText" placeholder="说明当前完成情况、遇到的问题或下一步计划"></textarea></label><div class="modal-actions"><button class="secondary-button" @click="feedbackTask = null">取消</button><button class="primary-button" @click="submitFeedback">提交反馈</button></div></div></div>
    <div v-if="selectedNotification" class="modal-backdrop" @click.self="selectedNotification = null"><div class="modal notification-detail-modal"><div class="modal-head"><div><p class="eyebrow">NOTIFICATION DETAIL</p><h3>{{ selectedNotification.title }}</h3></div><button class="icon-button" title="关闭" @click="selectedNotification = null"><X :size="18" /></button></div><div class="detail-grid"><div><span>发送时间</span><strong>{{ selectedNotification.time }}</strong></div><div><span>阅读状态</span><strong>{{ selectedNotification.read ? '已读' : '未读' }}</strong></div></div><section class="notification-detail-body"><span>通知内容</span><p>{{ selectedNotification.body || '暂无详细内容' }}</p></section><div class="modal-actions"><button class="secondary-button" @click="selectedNotification = null">关闭</button></div></div></div>    <div v-if="selectedTask" class="modal-backdrop" @click.self="selectedTask = null"><div class="modal task-modal"><div class="modal-head"><div><p class="eyebrow">TASK DETAIL · {{ selectedTask.id }}</p><h3>{{ selectedTask.title }}</h3></div><button class="icon-button" @click="selectedTask = null"><X :size="18" /></button></div><div class="detail-grid"><div><span>项目</span><strong>{{ selectedTask.project }}</strong></div><div><span>负责人</span><strong>{{ selectedTask.owner }}</strong></div><div><span>截止日期</span><strong>{{ selectedTask.due }}</strong></div><div><span>当前状态</span><span class="tag" :class="taskStatusLabel(selectedTask.state).tone">{{ taskStatusLabel(selectedTask.state).label }}</span></div></div><p v-if="selectedTask.description" class="task-description">{{ selectedTask.description }}</p><div class="detail-progress"><div><span>完成进度</span><b>{{ selectedTask.progress }}%</b></div><div class="progress-track"><span :style="{ width: `${selectedTask.progress}%` }"></span></div></div><section class="task-notes"><div class="section-label">任务备注</div><div v-if="taskNotes.length" class="note-list"><div v-for="note in taskNotes" :key="note.id" class="note-row"><strong>{{ note.author_name }}</strong><span>{{ note.content }}</span><small>{{ note.created_at }}</small></div></div><div v-else class="empty-cell">暂无任务备注</div><div class="inline-form"><input v-model="taskNoteText" maxlength="2000" placeholder="添加任务备注" @keyup.enter="submitTaskNote" /><button class="small-button" @click="submitTaskNote"><StickyNote :size="15" /> 添加</button></div></section><div class="modal-actions"><button class="secondary-button" @click="selectedTask = null">关闭</button><button v-if="canManageBusiness" class="icon-button" title="编辑任务" @click="openTaskEditor(selectedTask); selectedTask = null"><Pencil :size="16" /></button><button v-if="canManageBusiness" class="small-button" @click="closeOrReopenTask(selectedTask)">{{ selectedTask.state === 'closed' ? '重新打开' : '关闭任务' }}</button><button v-if="canUpdateTasks && !canManageBusiness && selectedTask.state !== 'completed' && selectedTask.state !== 'closed'" class="primary-button" @click="updateTask(selectedTask, selectedTask.state === 'todo' ? 'in-progress' : 'completed'); selectedTask = null">推进任务</button></div></div></div>
    <div v-if="showDeletedProjects" class="modal-backdrop" @click.self="showDeletedProjects = false"><div class="modal task-modal"><div class="modal-head"><h3>已删除项目</h3><button class="icon-button" @click="showDeletedProjects = false"><X :size="18" /></button></div><div class="deleted-project-list"><div v-for="project in deletedProjects" :key="project.id" class="deleted-project-row"><div><strong>{{ project.name }}</strong><small>{{ project.code }} · {{ project.deleted_at }}</small></div><button class="small-button" @click="restoreDeletedProject(project.id)"><RotateCcw :size="15" /> 恢复项目</button></div><div v-if="!deletedProjects.length" class="empty-cell">暂无已删除项目</div></div></div></div>
    <div v-if="selectedMeetingVersion" class="modal-backdrop" @click.self="selectedMeetingVersion = null"><div class="modal task-modal"><div class="modal-head"><div><p class="eyebrow">MEETING VERSION</p><h3>版本 {{ selectedMeetingVersion.versionNumber }}</h3></div><button class="icon-button" @click="selectedMeetingVersion = null"><X :size="18" /></button></div><div class="version-content"><strong>脱敏后分析内容</strong><pre>{{ selectedMeetingVersion.desensitizedContent }}</pre><strong>原始内容</strong><pre>{{ selectedMeetingVersion.originalContent }}</pre></div><div class="modal-actions"><button class="secondary-button" @click="selectedMeetingVersion = null">关闭</button><button class="primary-button" @click="restoreMeetingVersion(selectedMeetingVersion.id); selectedMeetingVersion = null">恢复此版本</button></div></div></div>
    <div v-if="showProjectMembers && selectedMemberProject" class="modal-backdrop" @click.self="showProjectMembers = false"><div class="modal task-modal"><div class="modal-head"><div><p class="eyebrow">PROJECT MEMBERS</p><h3>{{ selectedMemberProject.name }}</h3></div><button class="icon-button" @click="showProjectMembers = false"><X :size="18" /></button></div><div class="member-add-row"><select v-model="memberCandidateId"><option value="">选择账号</option><option v-for="candidate in memberCandidates" :key="candidate.id" :value="candidate.id">{{ candidate.name }} · {{ candidate.email }}</option></select><select v-model="memberProjectRole"><option value="member">项目成员</option><option value="manager">项目经理</option></select><button class="primary-button" @click="addSelectedProjectMember">添加</button></div><div class="member-manage-list"><div v-for="member in projectMembers" :key="member.id" class="member-manage-row"><div><strong>{{ member.name }}</strong><small>{{ member.email }}</small></div><span class="tag" :class="projectRoleLabel(member.project_role).tone">{{ projectRoleLabel(member.project_role).label }}</span><button class="small-button" @click="removeSelectedProjectMember(member.id)">移除</button></div></div></div></div>
    <div v-if="selectedCalendarDay" class="modal-backdrop" @click.self="selectedCalendarDay = null"><div class="modal calendar-detail-modal"><div class="modal-head"><div><p class="eyebrow">DAILY TASKS</p><h3>{{ formatCalendarDate(selectedCalendarDay) }}</h3></div><button class="icon-button" title="关闭" @click="selectedCalendarDay = null"><X :size="18" /></button></div><div v-if="selectedCalendarTasks.length" class="calendar-detail-list"><article v-for="task in selectedCalendarTasks" :key="task.id" class="calendar-detail-item"><div><strong>{{ task.title }}</strong><p>{{ task.project }} · {{ task.owner }}</p></div><span class="tag" :class="priorityLabel(task.priority).tone">{{ priorityLabel(task.priority).label }}</span></article></div><div v-else class="calendar-detail-empty">当日没有任务截止日。</div><div class="modal-actions"><button class="secondary-button" @click="selectedCalendarDay = null">关闭</button></div></div></div>
    <transition name="toast"><div v-if="toast" class="toast"><CheckCircle2 :size="17" />{{ toast }}</div></transition>
  </div>
</template>
