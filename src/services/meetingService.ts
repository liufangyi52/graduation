import { reactive } from 'vue'

export interface MeetingRecord { id: string; projectId: string; title: string; content: string; createdAt: string }
export type AnalysisMode = 'manual' | 'llm' | 'rag' | 'agent'
export type RagIndexStatus = { configured: boolean; ready: boolean; eligibleVersionCount: number }
export interface RetrievalSource {
  meetingId: string
  versionId: string
  chunkIndex: number
  score: number
}

export interface AnalysisExecutionMetadata {
  mode?: AnalysisMode
  model?: string | null
  modelCallCount?: number
  retrievalEnabled?: boolean
  retrievalStatus?: 'completed' | 'failed' | 'not_applicable' | 'not_configured'
  retrievalDurationMs?: number
  retrievalHitCount?: number
  retrievalSources?: RetrievalSource[]
  plan?: string
}
export interface AnalysisRecord { id: string; meetingId: string; title: string; status: string; result: any; createdAt: string; mode: AnalysisMode; executionMetadata: AnalysisExecutionMetadata | null; durationMs: number; modelCallCount: number }
export interface ExperimentSummaryMetric { runCount: number; pendingCount: number; failedCount: number; approvedCount: number; rejectedCount: number; totalDurationMs: number; averageDurationMs: number; totalModelCalls: number }
export type ExperimentSummary = Record<AnalysisMode, ExperimentSummaryMetric>
export interface ReviewDraftTask { title: string; description?: string; owner_email?: string; due_date?: string; priority: 'low' | 'medium' | 'high' | 'urgent' }
export interface ReviewDraftRisk { title: string; description?: string; level: 'low' | 'medium' | 'high'; task_index?: number }
export interface ReviewDraft { summary: string; decisions: string[]; tasks: ReviewDraftTask[]; risks: ReviewDraftRisk[] }
export interface ReviewDetail { meeting: any; analysis: any; draft: ReviewDraft | null; evidence: Array<{ start: number; end: number; snippet: string }> }
export interface MeetingVersionSummary { id: string; meetingId: string; versionNumber: number; sourceType: string; createdAt: string; current?: boolean }
export interface MeetingVersion extends MeetingVersionSummary { originalContent: string; desensitizedContent: string }

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000/api'

function parseExecutionMetadata(value: unknown): AnalysisExecutionMetadata | null {
  if (!value) return null
  let raw: unknown = value
  if (typeof value === 'string') { try { raw = JSON.parse(value) } catch { return null } }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const source = raw as Record<string, unknown>
  const metadata: AnalysisExecutionMetadata = {}
  if (['manual', 'llm', 'rag', 'agent'].includes(String(source.mode))) metadata.mode = source.mode as AnalysisMode
  if (typeof source.model === 'string' || source.model === null) metadata.model = source.model
  if (Number.isFinite(source.modelCallCount)) metadata.modelCallCount = Math.max(0, Number(source.modelCallCount))
  if (typeof source.retrievalEnabled === 'boolean') metadata.retrievalEnabled = source.retrievalEnabled
  if (['completed', 'failed', 'not_applicable', 'not_configured'].includes(String(source.retrievalStatus))) metadata.retrievalStatus = source.retrievalStatus as AnalysisExecutionMetadata['retrievalStatus']
  if (Number.isFinite(source.retrievalDurationMs)) metadata.retrievalDurationMs = Math.max(0, Number(source.retrievalDurationMs))
  if (Number.isInteger(source.retrievalHitCount)) metadata.retrievalHitCount = Math.max(0, Number(source.retrievalHitCount))
  if (typeof source.plan === 'string') metadata.plan = source.plan.slice(0, 2000)
  if (Array.isArray(source.retrievalSources)) {
    metadata.retrievalSources = source.retrievalSources.slice(0, 5).flatMap((item): RetrievalSource[] => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return []
      const candidate = item as Record<string, unknown>
      if (typeof candidate.meetingId !== 'string' || typeof candidate.versionId !== 'string' || !Number.isInteger(candidate.chunkIndex) || !Number.isFinite(candidate.score)) return []
      return [{ meetingId: candidate.meetingId, versionId: candidate.versionId, chunkIndex: Number(candidate.chunkIndex), score: Number(candidate.score) }]
    })
  }
  return Object.keys(metadata).length ? metadata : null
}
function mapAnalysisRecord(item: any): AnalysisRecord {
  return { id: item.id, meetingId: item.meeting_id ?? item.meetingId, title: item.title ?? '', status: item.status, result: item.result, createdAt: item.created_at ?? item.createdAt, mode: item.mode ?? 'llm', executionMetadata: parseExecutionMetadata(item.execution_metadata ?? item.executionMetadata), durationMs: Number(item.duration_ms ?? item.durationMs ?? 0), modelCallCount: Number(item.model_call_count ?? item.modelCallCount ?? 0) }
}

export function createMeetingService(token: string) {
  const state = reactive({ meetings: [] as MeetingRecord[], analyses: [] as AnalysisRecord[] })
  const request = async <T>(path: string, init: RequestInit = {}) => {
    const multipart = init.body instanceof FormData
    const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers: { ...(multipart ? {} : { 'Content-Type': 'application/json' }), Authorization: `Bearer ${token}`, ...init.headers } })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.message ?? 'Request failed')
    return payload as T
  }
  return {
    state,
    async load() {
      const analyses = await request<any[]>('/analyses')
      state.analyses.splice(0, state.analyses.length, ...analyses.map(mapAnalysisRecord))
    },
    async create(projectId: string, title: string, content: string) {
      const item = await request<any>('/meetings', { method: 'POST', body: JSON.stringify({ projectId, title, content }) })
      return { id: item.id, projectId, title, content, createdAt: new Date().toISOString() }
    },
    async importFile(projectId: string, title: string, file: File) {
      const body = new FormData()
      body.append('projectId', projectId)
      body.append('title', title)
      body.append('file', file)
      return request<any>('/meetings/import', { method: 'POST', body })
    },
    async listVersions(meetingId: string) { return request<MeetingVersionSummary[]>(`/meetings/${meetingId}/versions`) },
    async getVersion(meetingId: string, versionId: string) { return request<MeetingVersion>(`/meetings/${meetingId}/versions/${versionId}`) },
    async restoreVersion(meetingId: string, versionId: string) { return request<MeetingVersion>(`/meetings/${meetingId}/versions/${versionId}/restore`, { method: 'POST' }) },
    async analyze(id: string, mode: AnalysisMode = 'llm') { return request<any>(`/meetings/${id}/analyze`, { method: 'POST', body: JSON.stringify({ mode }) }) },
    async review(id: string, approved: boolean, reason?: string) { return request<any>(`/analyses/${id}/review`, { method: 'POST', body: JSON.stringify({ approved, ...(reason?.trim() ? { reason: reason.trim() } : {}) }) }) },
    async reviewBatch(analysisIds: string[], approved: boolean, reason?: string) { return request<{ succeeded: Array<{ id: string; status: string }>; failed: Array<{ id: string; message: string }> }>('/analyses/review-batch', { method: 'POST', body: JSON.stringify({ analysisIds, approved, ...(reason?.trim() ? { reason: reason.trim() } : {}) }) }) },
    async getReviewDetail(meetingId: string) { const detail = await request<ReviewDetail>(`/meetings/${meetingId}/review`); return detail.analysis ? { ...detail, analysis: mapAnalysisRecord(detail.analysis) } : detail },
    async saveReviewDraft(analysisId: string, draft: ReviewDraft) { return request<ReviewDraft>(`/analyses/${analysisId}/draft`, { method: 'PUT', body: JSON.stringify(draft) }) },
    async reanalyze(id: string, mode: AnalysisMode = 'llm') { return request<any>(`/analyses/${id}/reanalyze`, { method: 'POST', body: JSON.stringify({ mode }) }) },
    async experimentSummary(projectId: string) { return request<ExperimentSummary>(`/projects/${projectId}/experiment-summary`) },
    async ragIndexStatus(projectId: string) { return request<RagIndexStatus>(`/projects/${projectId}/rag-index/status`) },
    async syncRagIndex(projectId: string) { return request<{ indexedChunks: number }>(`/projects/${projectId}/rag-index/sync`, { method: 'POST' }) },
  }
}
