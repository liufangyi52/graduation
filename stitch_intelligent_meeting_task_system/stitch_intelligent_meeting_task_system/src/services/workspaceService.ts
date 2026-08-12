import { reactive } from 'vue'

export type TaskState = 'todo' | 'in-progress' | 'completed'
export type RiskLevel = 'high' | 'medium' | 'low'

export interface Task { id: string; title: string; project: string; owner: string; due: string; priority: '紧急' | '高' | '中' | '低'; state: TaskState; progress: number; source?: 'ai-review' }
export interface Project { id: string; name: string; code: string; owner: string; state: '进行中' | '暂停' | '已归档'; progress: number; deadline: string; members: number }
export interface Review { id: string; meeting: string; project: string; mode: string; confidence: number; time: string; status: 'pending' | 'approved' | 'rejected' }
export interface Risk { id: string; title: string; task: string; level: RiskLevel; owner: string; status: '待处理' | '跟进中' | '已处理' }
export interface MemberFeedback { id: string; taskId: string; author: string; content: string; progress: number; createdAt: string }

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000/api'
const statusMap = { active: '进行中', paused: '暂停', archived: '已归档' } as const
const priorityMap = { urgent: '紧急', high: '高', medium: '中', low: '低' } as const
const taskStateMap = { todo: 'todo', in_progress: 'in-progress', completed: 'completed' } as const

export function createWorkspaceService(token: string) {
  const state = reactive({ projects: [] as Project[], tasks: [] as Task[], reviews: [] as Review[], risks: [] as Risk[], notifications: [] as { id: string; title: string; time: string; read: boolean; path: string }[], feedbacks: [] as MemberFeedback[], settings: { model: 'DeepSeek V3', mode: 'RAG 检索增强', desensitize: true } })
  const request = async <T>(path: string, init: RequestInit = {}) => {
    const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init.headers } })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.message ?? '请求失败')
    return payload as T
  }
  const mapProject = (item: any): Project => ({ id: item.id, name: item.name, code: item.code, owner: item.owner_name, state: statusMap[item.status as keyof typeof statusMap] ?? '进行中', progress: 0, deadline: item.end_date ?? '未设置', members: Number(item.members ?? 0) })
  const mapTask = (item: any): Task => ({ id: item.id, title: item.title, project: item.project_name, owner: item.assignee_name, due: item.due_date ?? '未设置', priority: priorityMap[item.priority as keyof typeof priorityMap] ?? '中', state: taskStateMap[item.status as keyof typeof taskStateMap] ?? 'todo', progress: Number(item.progress ?? 0) })
  return {
    state,
    async load() {
      const [projects, tasks, notifications, risks] = await Promise.all([request<any[]>('/projects'), request<any[]>('/tasks'), request<any[]>('/notifications'), request<any[]>('/risks')])
      state.projects.splice(0, state.projects.length, ...projects.map(mapProject))
      state.tasks.splice(0, state.tasks.length, ...tasks.map(mapTask))
      state.risks.splice(0, state.risks.length, ...risks.map((item) => ({ id: item.id, title: item.title, task: item.description ?? '', level: item.level, owner: item.owner ?? '', status: (item.status === 'resolved' ? '已处理' : '待处理') as Risk['status'] })))
      state.notifications.splice(0, state.notifications.length, ...notifications.map((item) => ({ id: item.id, title: item.title, time: item.created_at, read: Boolean(item.is_read), path: item.link || '/notifications' })))
    },
    async createProject(name: string) {
      const item = await request<any>('/projects', { method: 'POST', body: JSON.stringify({ name, code: `PRJ-${Date.now()}` }) })
      const project: Project = { id: item.id, name: item.name, code: item.code, owner: '当前用户', state: '进行中', progress: 0, deadline: item.endDate ?? '未设置', members: 1 }
      state.projects.unshift(project)
      return project
    },
    async archiveProject(id: string) {
      await request(`/projects/${id}/archive`, { method: 'PATCH' })
      const project = state.projects.find((item) => item.id === id)
      if (project) project.state = '已归档'
    },
    async updateTaskState(id: string, next: TaskState) {
      const progress = next === 'completed' ? 100 : next === 'todo' ? 0 : undefined
      await request(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status: next.replace('-', '_'), progress }) })
      const task = state.tasks.find((item) => item.id === id)
      if (task) { task.state = next; if (progress !== undefined) task.progress = progress }
    },
    async submitFeedback(taskId: string, author: string, content: string, progress: number) {
      const item = await request<any>(`/tasks/${taskId}/feedbacks`, { method: 'POST', body: JSON.stringify({ content, progress }) })
      const feedback: MemberFeedback = { id: item.id, taskId, author, content, progress, createdAt: '刚刚' }
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
  }
}
