import { reactive } from 'vue'
import { calendarDateFromApiValue } from '../utils/calendar'
import type { ExportKind, ExportPayload } from '../utils/projectExport'

export type TaskState = 'todo' | 'in-progress' | 'completed' | 'closed'
export type RiskLevel = 'high' | 'medium' | 'low'

export interface Task { id: string; title: string; description?: string; project: string; projectId?: string; owner: string; assigneeId?: string; due: string; priority: '紧急' | '高' | '中' | '低'; rawPriority?: 'low' | 'medium' | 'high' | 'urgent'; state: TaskState; progress: number; source?: 'ai-review'; createdAt: string; completedAt?: string | null }
export interface CalendarEvent { id: string; type: 'task' | 'meeting'; title: string; project: string; date: string; owner?: string; priority?: Task['priority']; state?: TaskState }
export interface Project { id: string; name: string; code: string; description?: string; owner: string; state: '进行中' | '暂停' | '已归档'; progress: number; deadline: string; members: number }
export interface Review { id: string; meeting: string; project: string; mode: string; confidence: number; time: string; status: 'pending' | 'approved' | 'rejected' }
export interface Risk { id: string; title: string; task: string; taskId?: string; description?: string; level: RiskLevel; owner: string; status: '待处理' | '跟进中' | '已处理' }
export interface MemberFeedback { id: string; taskId: string; author: string; content: string; progress: number; createdAt: string }
export interface Notification { id: string; title: string; body?: string; time: string; read: boolean; path: string }
export interface ProjectMember { id: string; name: string; email: string; role: string; is_active: boolean; project_role: 'manager' | 'member' }
export interface ProjectTag { id: string; project_id: string; name: string; linked: boolean }
export interface DesensitizationRule { id: string; project_id: string; name: string; pattern: string; replacement: string; enabled: boolean }
export interface TaskNote { id: string; task_id: string; author_id: string; author_name: string; content: string; created_at: string }
export interface ProjectDetailTask {
  id: string
  title: string
  description?: string
  projectId: string
  assigneeId: string
  assigneeName: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'todo' | 'in_progress' | 'completed' | 'closed'
  progress: number
  createdAt: string
  completedAt?: string | null
  dueDate?: string | null
}
export interface ProjectDetail {
  scope: 'personal' | 'project'
  project: { id: string; name: string; code: string; description?: string; status: string; startDate?: string; endDate?: string; ownerId: string; ownerName: string; progress: number }
  tasks: ProjectDetailTask[]
  meetings: Array<{ id: string; title: string; createdAt: string; versionCount: number; latestAnalysisStatus?: string | null }>
  risks: Array<{ id: string; title: string; description?: string; level: RiskLevel; status: string; createdAt: string; resolvedAt?: string | null }>
  members: ProjectMember[]
  health: { activeTasks: number; blockedTasks: number; overdueTasks: number; openRisks: number }
  memberProgress: Array<{ memberId: string; memberName: string; taskCount: number; completedTaskCount: number; averageProgress: number; latestFeedbackAt?: string | null }>
  activity: Array<{ id: string; projectId: string; taskId: string; taskTitle: string; actorId: string; actorName: string; eventType: 'task_updated' | 'feedback_created'; beforeProgress: number; afterProgress: number; beforeStatus: string; afterStatus: string; feedbackContent?: string; createdAt: string }>
  counts: { tasks: number; completedTasks: number; pendingReviews: number; openRisks: number; members: number }
  permissions: { canEdit: boolean; canCreateTask: boolean; canManageMembers: boolean; canManageRisks: boolean }
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000/api'
const statusMap = { active: '进行中', paused: '暂停', archived: '已归档' } as const
const priorityMap = { urgent: '紧急', high: '高', medium: '中', low: '低' } as const
const taskStateMap = { todo: 'todo', in_progress: 'in-progress', completed: 'completed', closed: 'closed' } as const

export function createWorkspaceService(token: string) {
  const state = reactive({ projects: [] as Project[], tasks: [] as Task[], overdueTasks: [] as Task[], calendarEvents: [] as CalendarEvent[], reviews: [] as Review[], risks: [] as Risk[], notifications: [] as Notification[], feedbacks: [] as MemberFeedback[], settings: { model: 'DeepSeek V3', mode: 'RAG 检索增强', desensitize: true } })
  const request = async <T>(path: string, init: RequestInit = {}) => {
    const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init.headers } })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.message ?? '请求失败')
    return payload as T
  }
  const mapProject = (item: any): Project => ({ id: item.id, name: item.name, code: item.code, description: item.description ?? undefined, owner: item.owner_name, state: statusMap[item.status as keyof typeof statusMap] ?? '进行中', progress: Number(item.progress ?? 0), deadline: item.end_date ?? '未设置', members: Number(item.members ?? 0) })
  const mapTask = (item: any): Task => ({ id: item.id, title: item.title, description: item.description ?? undefined, project: item.project_name, projectId: item.project_id, owner: item.assignee_name, assigneeId: item.assignee_id, due: item.due_date ?? '未设置', priority: priorityMap[item.priority as keyof typeof priorityMap] ?? '中', rawPriority: item.priority, state: taskStateMap[item.status as keyof typeof taskStateMap] ?? 'todo', progress: Number(item.progress ?? 0), createdAt: item.created_at ?? item.createdAt ?? '', completedAt: item.completed_at ?? item.completedAt ?? null })
  const mapNotification = (item: any): Notification => ({ id: item.id, title: item.title, body: item.body ?? '', time: item.created_at, read: Boolean(item.is_read), path: item.link || '/notifications' })
  const mapCalendarEvent = (item: any): CalendarEvent => ({
    id: item.id,
    type: item.type === 'meeting' ? 'meeting' : 'task',
    title: item.title,
    project: item.project_name,
    date: calendarDateFromApiValue(item.date),
    ...(item.type === 'task' ? {
      owner: item.assignee_name,
      priority: priorityMap[item.priority as keyof typeof priorityMap] ?? '中',
      state: taskStateMap[item.status as keyof typeof taskStateMap] ?? 'todo',
    } : {}),
  })
  return {
    state,
    async loadNotifications() {
      const notifications = await request<any[]>('/notifications')
      state.notifications.splice(0, state.notifications.length, ...notifications.map(mapNotification))
    },
    async load() {
      const [projects, tasks, overdueTasks, notifications, risks] = await Promise.all([request<any[]>('/projects'), request<any[]>('/tasks'), request<any[]>('/dashboard/overdue-tasks'), request<any[]>('/notifications'), request<any[]>('/risks')])
      state.projects.splice(0, state.projects.length, ...projects.map(mapProject))
      state.tasks.splice(0, state.tasks.length, ...tasks.map(mapTask))
      state.overdueTasks.splice(0, state.overdueTasks.length, ...overdueTasks.map(mapTask))
      state.risks.splice(0, state.risks.length, ...risks.map((item) => ({ id: item.id, title: item.title, taskId: item.task_id ?? undefined, task: item.task_title ?? '', description: item.description ?? undefined, level: item.level, owner: item.project_owner_name ?? '', status: (item.status === 'resolved' ? '已处理' : '待处理') as Risk['status'] })))
      state.notifications.splice(0, state.notifications.length, ...notifications.map(mapNotification))
    },
    async loadCalendarEvents() {
      const items = await request<any[]>('/calendar-events')
      state.calendarEvents.splice(0, state.calendarEvents.length, ...items.map(mapCalendarEvent))
    },
    async createProject(name: string) {
      const item = await request<any>('/projects', { method: 'POST', body: JSON.stringify({ name, code: `PRJ-${Date.now()}` }) })
      const project: Project = { id: item.id, name: item.name, code: item.code, owner: '当前用户', state: '进行中', progress: 0, deadline: item.endDate ?? '未设置', members: 1 }
      state.projects.unshift(project)
      return project
    },
    async updateProject(id: string, input: { name?: string; code?: string; description?: string; endDate?: string | null; status?: 'active' | 'paused' | 'archived' }) { return request(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(input) }) },
    async getProjectDetail(projectId: string) {
      const detail = await request<any>(`/projects/${projectId}/detail`)
      return {
        ...detail,
        health: detail.health ?? { activeTasks: 0, blockedTasks: 0, overdueTasks: 0, openRisks: 0 },
        memberProgress: (detail.memberProgress ?? []).map((member: any) => ({ memberId: member.member_id ?? member.memberId, memberName: member.member_name ?? member.memberName ?? '', taskCount: Number(member.task_count ?? member.taskCount ?? 0), completedTaskCount: Number(member.completed_task_count ?? member.completedTaskCount ?? 0), averageProgress: Number(member.average_progress ?? member.averageProgress ?? 0), latestFeedbackAt: member.latest_feedback_at ?? member.latestFeedbackAt ?? null })),
        activity: (detail.activity ?? []).map((event: any) => ({ id: event.id, projectId: event.project_id ?? event.projectId ?? projectId, taskId: event.task_id ?? event.taskId, taskTitle: event.task_title ?? event.taskTitle ?? '', actorId: event.actor_id ?? event.actorId, actorName: event.actor_name ?? event.actorName ?? '', eventType: event.event_type ?? event.eventType, beforeProgress: Number(event.before_progress ?? event.beforeProgress ?? 0), afterProgress: Number(event.after_progress ?? event.afterProgress ?? 0), beforeStatus: event.before_status ?? event.beforeStatus ?? 'todo', afterStatus: event.after_status ?? event.afterStatus ?? 'todo', feedbackContent: event.feedback_content ?? event.feedbackContent ?? undefined, createdAt: event.created_at ?? event.createdAt ?? '' })),
        tasks: (detail.tasks ?? []).map((task: any): ProjectDetailTask => ({
          id: task.id,
          title: task.title,
          description: task.description ?? undefined,
          projectId: task.project_id ?? task.projectId,
          assigneeId: task.assignee_id ?? task.assigneeId,
          assigneeName: task.assignee_name ?? task.assigneeName ?? '',
          priority: task.priority,
          status: task.status,
          progress: Number(task.progress ?? 0),
          createdAt: task.created_at ?? task.createdAt ?? '',
          completedAt: task.completed_at ?? task.completedAt ?? null,
          dueDate: task.due_date ?? task.dueDate ?? null,
        })),
      } as ProjectDetail
    },
    async getProjectExportData(projectId: string, kind: ExportKind) { return request<ExportPayload>(`/projects/${projectId}/export-data?kind=${kind}`) },
    async deleteProject(id: string) { return request(`/projects/${id}`, { method: 'DELETE' }) },
    async deletedProjects() { return request<any[]>('/projects/deleted') },
    async restoreProject(id: string) { return request(`/projects/${id}/restore`, { method: 'POST' }) },
    async listProjectTags(projectId: string) { return request<ProjectTag[]>(`/projects/${projectId}/tags`) },
    async createProjectTag(projectId: string, name: string) { return request<ProjectTag>(`/projects/${projectId}/tags`, { method: 'POST', body: JSON.stringify({ name }) }) },
    async updateProjectTag(projectId: string, tagId: string, name: string) { return request<ProjectTag>(`/projects/${projectId}/tags/${tagId}`, { method: 'PATCH', body: JSON.stringify({ name }) }) },
    async deleteProjectTag(projectId: string, tagId: string) { return request(`/projects/${projectId}/tags/${tagId}`, { method: 'DELETE' }) },
    async linkProjectTag(projectId: string, tagId: string) { return request(`/projects/${projectId}/tags/${tagId}/link`, { method: 'POST' }) },
    async unlinkProjectTag(projectId: string, tagId: string) { return request(`/projects/${projectId}/tags/${tagId}/link`, { method: 'DELETE' }) },
    async listDesensitizationRules(projectId: string) { return request<DesensitizationRule[]>(`/projects/${projectId}/desensitization-rules`) },
    async createDesensitizationRule(projectId: string, input: Omit<DesensitizationRule, 'id' | 'project_id'>) { return request<DesensitizationRule>(`/projects/${projectId}/desensitization-rules`, { method: 'POST', body: JSON.stringify(input) }) },
    async updateDesensitizationRule(projectId: string, ruleId: string, input: Partial<Omit<DesensitizationRule, 'id' | 'project_id'>>) { return request<DesensitizationRule>(`/projects/${projectId}/desensitization-rules/${ruleId}`, { method: 'PATCH', body: JSON.stringify(input) }) },
    async deleteDesensitizationRule(projectId: string, ruleId: string) { return request(`/projects/${projectId}/desensitization-rules/${ruleId}`, { method: 'DELETE' }) },
    async listProjectMembers(projectId: string) { return request<ProjectMember[]>(`/projects/${projectId}/members`) },
    async projectMemberCandidates(projectId: string) { return request<Array<Pick<ProjectMember, 'id' | 'name' | 'email' | 'role'>>>(`/projects/${projectId}/member-candidates`) },
    async addProjectMember(projectId: string, userId: string, projectRole: 'manager' | 'member') { return request(`/projects/${projectId}/members`, { method: 'POST', body: JSON.stringify({ userId, projectRole }) }) },
    async updateProjectMemberRole(projectId: string, userId: string, projectRole: 'manager' | 'member') { return request(`/projects/${projectId}/members/${userId}`, { method: 'PATCH', body: JSON.stringify({ projectRole }) }) },
    async removeProjectMember(projectId: string, userId: string) { return request(`/projects/${projectId}/members/${userId}`, { method: 'DELETE' }) },
    async archiveProject(id: string) {
      await request(`/projects/${id}/archive`, { method: 'PATCH' })
      const project = state.projects.find((item) => item.id === id)
      if (project) project.state = '已归档'
    },
    async remindTask(id: string) {
      return request<{ id: string; taskId: string; recipientId: string }>(`/tasks/${id}/reminder`, { method: 'POST' })
    },
    async updateTaskState(id: string, next: TaskState) {
      const progress = next === 'completed' ? 100 : next === 'todo' ? 0 : undefined
      await request(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status: next.replace('-', '_'), progress }) })
      const task = state.tasks.find((item) => item.id === id)
      if (task) { task.state = next; if (progress !== undefined) task.progress = progress }
    },
    async createTask(input: { projectId: string; title: string; description?: string; assigneeId: string; priority: 'low' | 'medium' | 'high' | 'urgent'; status?: 'todo' | 'in_progress' | 'completed'; progress?: number; dueDate?: string | null }) { return request('/tasks', { method: 'POST', body: JSON.stringify(input) }) },
    async updateManagedTask(id: string, input: { title?: string; description?: string; assigneeId?: string; priority?: 'low' | 'medium' | 'high' | 'urgent'; status?: 'todo' | 'in_progress' | 'completed'; progress?: number; dueDate?: string | null }) { return request(`/tasks/${id}/manage`, { method: 'PATCH', body: JSON.stringify(input) }) },
    async closeTask(id: string) { return request(`/tasks/${id}/close`, { method: 'POST' }) },
    async reopenTask(id: string, status: 'todo' | 'in_progress' = 'todo') { return request(`/tasks/${id}/reopen`, { method: 'POST', body: JSON.stringify({ status }) }) },
    async listTaskNotes(id: string) { return request<TaskNote[]>(`/tasks/${id}/notes`) },
    async addTaskNote(id: string, content: string) { return request<TaskNote>(`/tasks/${id}/notes`, { method: 'POST', body: JSON.stringify({ content }) }) },
    async submitFeedback(taskId: string, author: string, content: string, progress: number) {
      const item = await request<any>(`/tasks/${taskId}/feedbacks`, { method: 'POST', body: JSON.stringify({ content, progress }) })
      const feedback: MemberFeedback = { id: item.id, taskId, author, content, progress, createdAt: new Date().toISOString() }
      state.feedbacks.unshift(feedback)
      const task = state.tasks.find((entry) => entry.id === taskId)
      if (task) { task.progress = progress; if (progress === 100) task.state = 'completed' }
      return feedback
    },
    async approveReview(id: string) { return request(`/analyses/${id}/review`, { method: 'POST', body: JSON.stringify({ approved: true }) }) },
    async rejectReview(id: string) { return request(`/analyses/${id}/review`, { method: 'POST', body: JSON.stringify({ approved: false }) }) },
    async resolveRisk(id: string) {
      await request(`/risks/${id}/resolve`, { method: 'PATCH' })
      const risk = state.risks.find((item) => item.id === id)
      if (risk) risk.status = '已处理'
    },
    async markRead(id: string) {
      const item = state.notifications.find((notification) => notification.id === id)
      if (!item || item.read) return
      await request(`/notifications/${id}/read`, { method: 'PATCH' })
      item.read = true
    },
    async sendNotification(input: { title: string; body: string; audienceType: 'user' | 'role'; userId?: string; role?: 'manager' | 'member' | 'admin' | 'auditor' }) {
      return request<{ created: number }>('/notifications', { method: 'POST', body: JSON.stringify(input) })
    },
  }
}
