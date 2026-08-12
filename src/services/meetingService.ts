import { reactive } from 'vue'

export interface MeetingRecord { id: string; projectId: string; title: string; content: string; createdAt: string }
export interface AnalysisRecord { id: string; meetingId: string; title: string; status: string; result: any; createdAt: string }

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000/api'

export function createMeetingService(token: string) {
  const state = reactive({ meetings: [] as MeetingRecord[], analyses: [] as AnalysisRecord[] })
  const request = async <T>(path: string, init: RequestInit = {}) => {
    const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init.headers } })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.message ?? 'Request failed')
    return payload as T
  }
  return {
    state,
    async load() {
      const analyses = await request<any[]>('/analyses')
      state.analyses.splice(0, state.analyses.length, ...analyses.map((item) => ({ id: item.id, meetingId: item.meeting_id, title: item.title, status: item.status, result: item.result, createdAt: item.created_at })))
    },
    async create(projectId: string, title: string, content: string) {
      const item = await request<any>('/meetings', { method: 'POST', body: JSON.stringify({ projectId, title, content }) })
      return { id: item.id, projectId, title, content, createdAt: new Date().toISOString() }
    },
    async analyze(id: string) { return request<any>(`/meetings/${id}/analyze`, { method: 'POST' }) },
    async review(id: string, approved: boolean) { return request<any>(`/analyses/${id}/review`, { method: 'POST', body: JSON.stringify({ approved }) }) },
  }
}
